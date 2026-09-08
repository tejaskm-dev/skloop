"use server";

import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";


/**
 * Calculates user level based on XP (500 XP per level)
 */
function calculateLevel(xp: number): number {
    return Math.floor(xp / 500) + 1;
}

/**
 * Handles daily login reward processing using a server-side transaction logic.
 * This is hosted as a Vercel Serverless Function automatically.
 */
export async function processDailyLogin(clientUserId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Verification: Ensure the client-passed ID matches the session ID
    if (!user || user.id !== clientUserId) {
        throw new Error("Unauthorized: Identity mismatch");
    }
    
    const userId = user.id;
    const todayStr = new Date().toISOString().split("T")[0];

    // 1. Check for existing activity today (idempotency guard)
    const { data: existingActivity } = await supabase
        .from("activity_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("activity_date", todayStr)
        .eq("focus_area", "Daily Login")
        .limit(1)
        .maybeSingle();

    if (existingActivity) {
        return { success: true, alreadyProcessed: true };
    }

    // 2. Fetch profile
    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("xp, coins, streak, streak_shields")
        .eq("id", userId)
        .single();

    if (!profile || profileError) return { success: false, error: "Profile not found" };

    // 3. Check if user logged in YESTERDAY to decide streak continuation vs reset
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const { data: yesterdayActivity } = await supabase
        .from("activity_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("activity_date", yesterdayStr)
        .eq("focus_area", "Daily Login")
        .maybeSingle();

    // Streak Logic:
    let newStreak = 1;
    let shieldsUsed = 0;

    if (yesterdayActivity) {
        // Logged in yesterday? Simple increment.
        newStreak = (profile.streak || 0) + 1;
    } else if (profile.streak_shields > 0 && (profile.streak || 0) > 0) {
        // Missed yesterday but has a SHIELD? Maintain streak and use shield.
        newStreak = profile.streak;
        shieldsUsed = 1;
    } else {
        // Missed yesterday and no shields? Reset.
        newStreak = 1;
    }

    const newXp = (profile.xp || 0) + 10;
    const newCoins = (profile.coins || 0) + 5;
    const newLevel = calculateLevel(newXp);

    // 4. Insert activity log (serves as the idempotency lock)
    const { error: logError } = await supabase.from("activity_logs").insert({
        user_id: userId,
        activity_date: todayStr,
        hours_spent: 0.1,
        focus_area: "Daily Login"
    });

    if (logError && logError.code !== '23505') {
        console.error("processDailyLogin: Failed to insert activity log:", logError.message, logError.code);
        return { success: false, error: `Failed to log activity: ${logError.message}` };
    }

    // 5. Update profile stats
    const { error: updateError } = await supabase.from("profiles").update({
        xp: newXp,
        coins: newCoins,
        streak: newStreak,
        level: newLevel,
        streak_shields: profile.streak_shields - shieldsUsed
    }).eq("id", userId);

    if (updateError) {
        console.error("processDailyLogin: Failed to update profile:", updateError.message);
        return { success: false, error: "Failed to update profile" };
    }

    revalidatePath("/dashboard");
    revalidatePath("/profile");

    return { success: true, grantedRewards: { xp: 10, coins: 5, streak: newStreak } };
}

/**
 * Fetches a profile. Omit userId for the caller's own profile.
 *
 * Callers must be authenticated, and this returns an explicit public column
 * list rather than select("*") — the previous version handed back every column
 * of any profile to any caller.
 */
export async function fetchUserProfile(userId?: string) {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return null;

    const targetId = userId ?? user.id;
    const isSelf = targetId === user.id;

    if (isSelf) {
        const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", targetId)
            .single();
        return error ? null : data;
    }

    // Someone else's profile: only the fields the public UI renders. The
    // previous select("*") handed back plan, inventory, coins and preferences
    // for any user id supplied by the caller.
    const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, username, bio, avatar_url, banner_url, location, website, role, level, xp, streak, is_mentor, last_seen, created_at")
        .eq("id", targetId)
        .single();

    if (error) return null;
    return data;
}

/**
 * Signs out the current user and clears session cookies
 */
export async function signOutAction() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    
    // Clear custom cookies if any
    const cookieStore = await cookies();
    cookieStore.delete('has_seen_onboarding');
    
    revalidatePath('/', 'layout');
    return { success: true };
}
/**
 * Updates the last_seen timestamp for a user.
 * Used for online/offline status indicators.
 */
export async function updateLastSeen() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // last_seen is no longer client-writable (migration 001); touch_last_seen()
    // stamps the caller's own row.
    await supabase.rpc("touch_last_seen");
}

/**
 * Permanently deletes or resets the currently authenticated user's account and profile data,
 * cleans up session cookies, and revokes active authentication tokens.
 */
export async function deleteAccountAction() {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return { success: false, error: "Unauthorized or session expired" };
    }

    const userId = user.id;

    try {
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

        if (serviceRoleKey && supabaseUrl) {
            // 1a. Service Role Admin deletion (Deletes user from auth.users + cascades profiles)
            const adminSupabase = createAdminClient(supabaseUrl, serviceRoleKey, {
                auth: { autoRefreshToken: false, persistSession: false },
            });

            // Clean up profile row
            await adminSupabase.from("profiles").delete().eq("id", userId);

            // Delete user from Supabase Auth
            const { error: adminErr } = await adminSupabase.auth.admin.deleteUser(userId);
            if (adminErr) {
                console.error("deleteAccountAction admin deleteUser error:", adminErr);
            }
        } else {
            // 1b. User JWT deletion attempt
            const { error: profileDeleteErr } = await supabase
                .from("profiles")
                .delete()
                .eq("id", userId);

            if (profileDeleteErr) {
                console.warn("Hard delete of profile failed (RLS/FK constraint), applying profile reset fallback:", profileDeleteErr.message);
                // Fallback: Clear user profile data
                await supabase
                    .from("profiles")
                    .update({
                        full_name: "Deleted User",
                        username: `deleted_${userId.slice(0, 8)}`,
                        bio: null,
                        avatar_url: null,
                        banner_url: null,
                        location: null,
                        website: null,
                    })
                    .eq("id", userId);
            }
        }

        // 2. Sign out the user session
        await supabase.auth.signOut();

        // 3. Clear custom cookies
        const cookieStore = await cookies();
        cookieStore.delete("has_seen_onboarding");

        revalidatePath("/", "layout");
        return { success: true };
    } catch (err: any) {
        console.error("deleteAccountAction error:", err);
        return { success: false, error: err.message || "Failed to delete account" };
    }
}


