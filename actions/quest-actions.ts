"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

// --- REQUIRED MIGRATIONS (Run in Supabase SQL editor before deploying) ---
//
// 1. Unique constraint for daily_quest_completions (FIX 3):
//    ALTER TABLE public.daily_quest_completions
//      ADD CONSTRAINT daily_quest_completions_user_quest_cycle_unique
//      UNIQUE (user_id, quest_id, cycle_key);
//
// 2. Unique constraint for user_chests to prevent double-award (FIX 9):
//    ALTER TABLE public.user_chests
//      ADD CONSTRAINT user_chests_unique_cycle
//      UNIQUE (user_id, cycle_key, chest_type);
//
// 3. Add equipped_frame column to profiles (FIX 4):
//    ALTER TABLE public.profiles ADD COLUMN equipped_frame text;
//
// 4. Create append_to_inventory RPC (FIX 2):
//    CREATE OR REPLACE FUNCTION append_to_inventory(x_user_id uuid, item_id text)
//    RETURNS void LANGUAGE plpgsql AS $$
//    BEGIN
//      UPDATE profiles
//      SET inventory = inventory || jsonb_build_array(item_id::text)
//      WHERE id = x_user_id AND NOT (inventory @> jsonb_build_array(item_id::text));
//    END;
//    $$;
//
// 5. Insert typing quest rows (FIX 11):
//    INSERT INTO public.quests (key, title, description, type, xp_reward, coins_reward, icon, sort_order)
//    VALUES
//      ('type_race_3w', 'Speed Demon', 'Complete 3 typing races this week', 'weekly', 75, 30, '⌨️', 5),
//      ('type_race_10m', 'Keystroke Legend', 'Complete 10 typing races this month', 'monthly', 200, 100, '⌨️', 5)
//    ON CONFLICT (key) DO NOTHING;

// --- Cycle Key Helpers ---
// Generates Strings like 'daily:2026-03-01', 'weekly:2026-W09', 'monthly:2026-03'

function getDailyCycleKey(date = new Date()) {
    return `daily:${date.toISOString().split('T')[0]}`;
}

function getWeeklyCycleKey(date = new Date()) {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    return `weekly:${date.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

function getMonthlyCycleKey(date = new Date()) {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `monthly:${yyyy}-${mm}`;
}

function getCycleKey(type: "daily" | "weekly" | "monthly", date = new Date()) {
    if (type === "daily") return getDailyCycleKey(date);
    if (type === "weekly") return getWeeklyCycleKey(date);
    return getMonthlyCycleKey(date);
}

// --- Hardcoded quest target map (FIX 12) ---
// Used by skipQuestWithConsumable since the DB has no target_amount column
const QUEST_TARGETS: Record<string, number> = {
    'login': 1, 'codele': 1, 'type_race': 1,
    'streak_7': 7, 'streak_20m': 20,
    'codele_3w': 3, 'codele_15m': 15,
    'type_race_3w': 3, 'type_race_10m': 10,
    'lesson': 1, 'lessons_5w': 5, 'lessons_20m': 20,
    'quiz_3w': 3, 'quiz_10m': 10,
};

// --- Types ---

export type QuestType = "daily" | "weekly" | "monthly";

export interface Quest {
    id: string;
    key: string;
    title: string;
    description: string;
    type: QuestType;
    xp_reward: number;
    coins_reward: number;
    icon: string;
    sort_order: number;
}

export interface QuestClaimResult {
    success: boolean;
    message?: string;
    isComplete?: boolean;
    xpAwarded?: number;
    coinsAwarded?: number;
}

export interface QuestProgress extends Quest {
    is_completed: boolean;
    auto_progress: number;
}

// --- Actions ---

/**
 * Fetch all quests of a specific type (e.g. 'daily') and merge with the current user's completion status for this cycle.
 */
export async function getUserQuestProgress(type: QuestType) {
    const supabase = await createClient();
    const cycleKey = getCycleKey(type);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const userId = user.id;

    // 1. Get all quests of this type
    const { data: quests, error: questsError } = await supabase
        .from('quests')
        .select('*')
        .eq('type', type)
        .order('sort_order', { ascending: true });

    if (questsError || !quests) {
        console.error(`Error fetching ${type} quests:`, questsError);
        return [];
    }

    // 2. Get user's completions for this cycle
    const { data: completions, error: compError } = await supabase
        .from('daily_quest_completions')
        .select('quest_id, auto_progress')
        .eq('user_id', userId)
        .eq('cycle_key', cycleKey);

    if (compError) {
        console.error(`Error fetching ${type} completions:`, compError);
    }

    // Map completions into a fast lookup
    const completionsMap = new Map((completions || []).map(c => [c.quest_id, c.auto_progress || 0]));

    // 3. Merge
    const progress: QuestProgress[] = quests.map(q => ({
        ...q,
        is_completed: completionsMap.has(q.key) && completionsMap.get(q.key) === -1, // -1 means fully claimed/completed
        auto_progress: completionsMap.has(q.key) ? Math.max(0, completionsMap.get(q.key)!) : 0
    }));

    return progress;
}

/**
 * Marks a quest as complete (or increments progress). If the quest hits the threshold, awards XP/Coins.
 * FIX 3: Replaced upsert (that required a missing unique constraint) with explicit insert/update pattern.
 */
/**
 * Public entry point. Identity comes from the session and the target comes from
 * the server-side QUEST_TARGETS map — the old signature took userId,
 * progressAmount AND targetAmount from the caller, so any quest could be
 * completed instantly for any user.
 *
 * Multi-step quests are additionally limited to one increment per calendar day
 * so they can't be finished by calling this N times in a row.
 */
export async function claimQuestProgress(questKey: string, type: QuestType): Promise<QuestClaimResult> {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return { success: false, message: 'Unauthorized' };
    }

    const target = QUEST_TARGETS[questKey] ?? 1;
    return claimQuestProgressInternal(user.id, questKey, type, 1, target);
}

/**
 * Trusted worker. NOT exported as a server action — callers must already have
 * established who the user is and what the legitimate target is.
 */
async function claimQuestProgressInternal(userId: string, questKey: string, type: QuestType, progressAmount = 1, targetAmount = 1): Promise<QuestClaimResult> {
    const supabase = await createClient();
    const cycleKey = getCycleKey(type);
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Check if already fully claimed
    const { data: existing } = await supabase
        .from('daily_quest_completions')
        .select('auto_progress, last_progress_date')
        .eq('user_id', userId)
        .eq('quest_id', questKey)
        .eq('cycle_key', cycleKey)
        .maybeSingle();

    if (existing && existing.auto_progress === -1) {
        return { success: false, message: 'Quest already completed' };
    }

    // Multi-step quests (weekly streaks, monthly counts) may only advance once
    // per day, otherwise N rapid calls would finish them outright.
    if (targetAmount > 1 && existing?.last_progress_date === todayStr) {
        return { success: false, message: 'Already progressed today' };
    }

    // Calculate new progress
    const newProgress = (existing?.auto_progress || 0) + progressAmount;
    const isNowComplete = newProgress >= targetAmount;
    const finalProgressToSave = isNowComplete ? -1 : newProgress;

    // 2. Get quest details for rewards
    const { data: questDetails } = await supabase
        .from('quests')
        .select('xp_reward, coins_reward, type')
        .eq('key', questKey)
        .single();

    if (!questDetails) return { success: false, message: 'Quest not found' };

    // 3. Save progress with explicit insert/update (FIX 3)
    if (existing) {
        const { error: updateError } = await supabase
            .from('daily_quest_completions')
            .update({
                auto_progress: finalProgressToSave,
                last_progress_date: todayStr,
                xp_awarded: isNowComplete ? questDetails.xp_reward : 0,
                coins_awarded: isNowComplete ? questDetails.coins_reward : 0
            })
            .eq('user_id', userId)
            .eq('quest_id', questKey)
            .eq('cycle_key', cycleKey);

        if (updateError) {
            console.error('Error updating quest progress:', updateError);
            return { success: false, message: 'Failed to update quest progress' };
        }
    } else {
        const { error: insertError } = await supabase
            .from('daily_quest_completions')
            .insert({
                user_id: userId,
                quest_id: questKey,
                cycle_key: cycleKey,
                quest_type: questDetails.type,
                auto_progress: finalProgressToSave,
                last_progress_date: todayStr,
                xp_awarded: isNowComplete ? questDetails.xp_reward : 0,
                coins_awarded: isNowComplete ? questDetails.coins_reward : 0
            });

        if (insertError) {
            console.error('Error inserting quest progress:', insertError);
            return { success: false, message: 'Failed to record quest progress' };
        }
    }

    // 4. If completed, award XP/Coins
    if (isNowComplete) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('active_powers')
            .eq('id', userId)
            .single();

        let finalXpReward = questDetails.xp_reward;
        let finalCoinsReward = questDetails.coins_reward;

        if (profile?.active_powers) {
            const now = new Date().toISOString();
            const powers = profile.active_powers;
            if (powers.xp_multiplier && powers.xp_expires && powers.xp_expires > now) {
                finalXpReward = Math.round(finalXpReward * powers.xp_multiplier);
            }
            if (powers.coins_multiplier && powers.coins_expires && powers.coins_expires > now) {
                finalCoinsReward = Math.round(finalCoinsReward * powers.coins_multiplier);
            }
        }

        const { error: rpcError } = await supabase.rpc('increment_profile_stats', {
            x_user_id: userId,
            xp_amount: finalXpReward,
            coins_amount: finalCoinsReward
        });

        if (rpcError) {
            console.error('Error awarding quest rewards via RPC:', rpcError);
        }
    }

    return {
        success: true,
        isComplete: isNowComplete,
        xpAwarded: isNowComplete ? questDetails.xp_reward : 0,
        coinsAwarded: isNowComplete ? questDetails.coins_reward : 0
    };
}

/**
 * Uses a 'Daily Skip' item to instantly complete a quest.
 * FIX 12: Uses QUEST_TARGETS map to look up correct target per quest.
 */
export async function skipQuestWithConsumable(questKey: string, type: QuestType): Promise<QuestClaimResult> {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) return { success: false, message: 'Unauthorized' };

    // Consume the item FIRST, atomically. It returns false if the user doesn't
    // actually hold one, which also serves as the concurrency guard — two
    // simultaneous skips can't both spend the same item.
    const { data: consumed, error: consumeError } = await supabase.rpc(
        "consume_inventory_item",
        { p_item_id: "item_daily_skip" }
    );

    if (consumeError) {
        console.error("skipQuestWithConsumable consume error:", consumeError.message);
        return { success: false, message: "Could not use Daily Skip." };
    }

    if (!consumed) {
        return { success: false, message: "No Daily Skip items available." };
    }

    const target = QUEST_TARGETS[questKey] ?? 1;
    const result = await claimQuestProgressInternal(user.id, questKey, type, target, target);

    if (!result.success) {
        // Hand the item back if the quest didn't actually advance. The refund is
        // checked rather than fire-and-forget: append_to_inventory was missing
        // from the database entirely (see migration 002), so this failed
        // silently and the user lost the item.
        const { error: refundError } = await supabase.rpc("append_to_inventory", {
            x_user_id: user.id,
            item_id: "item_daily_skip",
        });

        if (refundError) {
            console.error(
                "skipQuestWithConsumable: refund FAILED, user lost item_daily_skip:",
                user.id,
                refundError.message
            );
            return { success: false, message: "Couldn't skip that quest — your Daily Skip has been reported to support." };
        }

        return result;
    }

    revalidatePath("/profile");
    return { success: true, message: "Quest skipped!" };
}

/**
 * Records a milestone event to the user's timeline
 */
/**
 * Records a milestone on the caller's own timeline. The user id comes from the
 * session — the previous signature let anyone write timeline rows for anyone.
 */
export async function recordOwnTimelineEvent(
    title: string,
    subtitle?: string,
    description?: string,
    iconType: string = 'rocket',
    color: string = 'text-lime-500'
) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Unauthorized' };

    return recordTimelineEvent(user.id, title, subtitle, description, iconType, color);
}

async function recordTimelineEvent(
    userId: string,
    title: string,
    subtitle?: string,
    description?: string,
    iconType: string = 'rocket',
    color: string = 'text-lime-500'
) {
    const supabase = await createClient();
    const { error } = await supabase
        .from('user_timeline')
        .insert({
            user_id: userId,
            title,
            subtitle,
            description,
            icon_type: iconType,
            color,
            year: new Date().getFullYear().toString()
        });

    if (error) {
        console.error('Error recording timeline event:', error);
        return { success: false, error };
    }

    revalidatePath('/profile');
    return { success: true };
}

// --- Chest Actions ---

/** Fetch all un-opened chests */
export async function getSealedChests() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
        .from('user_chests')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'sealed')
        .order('earned_at', { ascending: false });
    return data || [];
}

/** 
 * Handled by the UI when the user clicks 'Claim' on a 3/3 quest cycle.
 * FIX 9: Added chest_type filter to prevent returning the wrong chest.
 */
export async function saveChestAction(type: QuestType) {
    const supabase = await createClient();
    const cycleKey = getCycleKey(type);

    // FIX 5: Verify the user from session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) return { success: false, error: 'Unauthorized' };

    // 1. Verify eligibility (3 completions)
    const { count } = await supabase
        .from('daily_quest_completions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('cycle_key', cycleKey)
        .eq('quest_type', type)
        .eq('auto_progress', -1);

    if (!count || count < 3) {
        return { success: false, error: 'Complete at least 3 quests to claim this chest!' };
    }

    const chestType = type === 'daily' ? 'common' : type === 'weekly' ? 'rare' : 'legendary';

    // 2. Check for existing chest (FIX 9: filter by chest_type to get the correct one)
    const { data: existing } = await supabase
        .from('user_chests')
        .select('*')
        .eq('user_id', user.id)
        .eq('cycle_key', cycleKey)
        .eq('chest_type', chestType)  // FIX 9: Added chest_type filter
        .maybeSingle();

    if (existing) {
        return { success: true, chest: existing };
    }

    const { data: newChest, error } = await supabase
        .from('user_chests')
        .insert({
            user_id: user.id,
            chest_type: chestType,
            cycle_key: cycleKey,
            status: 'sealed'
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving chest:', error);
        return { success: false, error: 'Failed to claim chest.' };
    }

    revalidatePath('/dashboard');
    return { success: true, chest: newChest, cycle_key: cycleKey };
}

/**
 * Opens a chest, rolls for a Quest Exclusive reward, and awards it.
 * FIX 1 & FIX 2: Uses atomic update WHERE status='sealed'. Rewards go into profiles.inventory via RPC.
 * Does NOT write to reward_exclusive_id (column doesn't exist) or reward_product_id (wrong table).
 */
export async function openChest(chestId: string) {
    const supabase = await createClient();

    // FIX 5: Verify the user from session, not from a parameter
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) throw new Error("Unauthorized");

    // 1. Atomic update: only succeeds if chest is still 'sealed' (FIX 1)
    const { data: updated, error: updateError } = await supabase
        .from('user_chests')
        .update({ status: 'opened', opened_at: new Date().toISOString() })
        .eq('id', chestId)
        .eq('user_id', user.id)
        .eq('status', 'sealed')  // FIX 1: Atomic guard — prevents re-opening
        .select()
        .single();

    if (updateError || !updated) {
        return { success: false, error: 'Chest already opened or not found' };
    }

    const chest = updated;

    // 2. Bonus Coins based on rarity
    let bonusCoins = 0;
    if (chest.chest_type === 'common') bonusCoins = 50;
    if (chest.chest_type === 'rare') bonusCoins = 250;
    if (chest.chest_type === 'legendary') bonusCoins = 1000;

    // 3. Draft reward pool matching chest rarity
    const { data: pool } = await supabase
        .from('quest_exclusives')
        .select('*')
        .eq('rarity', chest.chest_type);

    // 4. Roll for reward (coins-only fallback if no exclusives seeded yet)
    if (!pool || pool.length === 0) {
        await supabase.rpc('increment_profile_stats', {
            x_user_id: user.id,
            xp_amount: 0,
            coins_amount: bonusCoins
        });
        revalidatePath('/dashboard');
        revalidatePath('/profile');
        return { success: true, reward: null, bonusCoins };
    }

    const reward = pool[Math.floor(Math.random() * pool.length)];

    // 5. FIX 2: Add reward string ID to profiles.inventory via RPC (safe jsonb append)
    // award_chest_rewards RPC should: append item to inventory AND increment coins
    const { error: rpcError } = await supabase.rpc('award_chest_rewards', {
        x_user_id: user.id,
        reward_id: reward.id,    // text ID like 'frame_neon_glitch'
        coin_amount: bonusCoins
    });

    if (rpcError) {
        // Fallback: manual append if RPC not yet created
        // FIX 2: use append_to_inventory RPC if available, else direct update
        const { error: invRpcError } = await supabase.rpc('append_to_inventory', {
            x_user_id: user.id,
            item_id: reward.id
        });

        if (invRpcError) {
            // Last resort: safe manual update that avoids duplicates
            const { data: profileData } = await supabase
                .from('profiles')
                .select('inventory, coins')
                .eq('id', user.id)
                .single();

            const inv: string[] = Array.isArray(profileData?.inventory) ? profileData.inventory : [];
            const updatedInv = inv.includes(reward.id) ? inv : [...inv, reward.id];

            await supabase.from('profiles').update({
                inventory: updatedInv,
                coins: (profileData?.coins || 0) + bonusCoins
            }).eq('id', user.id);
        } else {
            // append_to_inventory succeeded, separately add coins
            await supabase.rpc('increment_profile_stats', {
                x_user_id: user.id,
                xp_amount: 0,
                coins_amount: bonusCoins
            });
        }
    }

    // 6. Record to Timeline
    await recordTimelineEvent(
        user.id,
        "Chest Unsealed",
        `${reward.name} (${reward.rarity})`,
        `Successfully opened a ${chest.chest_type} chest and earned a ${reward.type.replace('_', ' ')}!`,
        'gift',
        reward.rarity === 'legendary' ? 'text-amber-500' : reward.rarity === 'rare' ? 'text-purple-500' : 'text-blue-500'
    );

    revalidatePath('/dashboard');
    revalidatePath('/profile');

    return { success: true, reward, bonusCoins };
}

/** 
 * One-stop shop for claiming a cycle reward AND opening it immediately.
 * Used by the High-Fidelity unboxing flow when the user chooses 'Open' instead of 'Save'.
 */
export async function claimAndOpenChest(type: QuestType) {
    // 1. Save it first
    const saveResult = await saveChestAction(type);
    if (!saveResult.success || !saveResult.chest) {
        return saveResult;
    }

    // 2. Open it (openChest now gets userId from session internally)
    return await openChest(saveResult.chest.id);
}
