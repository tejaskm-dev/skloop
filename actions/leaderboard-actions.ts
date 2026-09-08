"use server";

import { createClient } from "@/utils/supabase/server";

interface LeaderboardUser {
    id: string;
    rank: number;
    name: string;
    username: string;
    avatarUrl: string;
    xp: number;
    coins: number;
    streak: number;
    trend: "up" | "down" | "same";
}

/**
 * Fetches the global leaderboard data
 */
export async function getGlobalLeaderboard(metric: "xp" | "coins" = "xp", limit: number = 50) {
    const supabase = await createClient();

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, role, xp, coins, streak')
        .order(metric, { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Error fetching global leaderboard:", error);
        return [];
    }

    return profiles.map((p, index) => ({
        id: p.id,
        rank: index + 1,
        name: p.full_name || p.username || 'User',
        username: p.username || '',
        avatarUrl: p.avatar_url,
        xp: p.xp || 0,
        coins: p.coins || 0,
        streak: p.streak || 0,
        trend: "same" as const
    }));
}

/**
 * Fetches the friends leaderboard data for a specific user
 */
export async function getFriendsLeaderboard(metric: "xp" | "coins" = "xp") {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const userId = user.id;

    // 1. Fetch accepted connections
    const { data: connections, error: connError } = await supabase
        .from('connections')
        .select('requester_id, recipient_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);

    if (connError) {
        console.error("Error fetching connections:", connError);
        return [];
    }

    const friendIds = new Set(connections.map(c => c.requester_id === userId ? c.recipient_id : c.requester_id));
    friendIds.add(userId); // Include self

    // 2. Fetch profiles for self and friends
    const { data: friendsProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, role, xp, coins, streak')
        .in('id', Array.from(friendIds))
        .order(metric, { ascending: false });

    if (profilesError) {
        console.error("Error fetching friends leaderboard profiles:", profilesError);
        return [];
    }

    return friendsProfiles.map((p, index) => ({
        id: p.id,
        rank: index + 1,
        name: p.full_name || p.username || 'User',
        username: p.username || '',
        avatarUrl: p.avatar_url,
        xp: p.xp || 0,
        coins: p.coins || 0,
        streak: p.streak || 0,
        trend: "same" as const
    }));
}

/**
 * Fetches the rank of a specific user outside of the top list
 */
export async function getUserRank(metric: "xp" | "coins" = "xp") {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const userId = user.id;

    const { data: myProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url, xp, coins')
        .eq('id', userId)
        .single();

    if (profileError || !myProfile) return null;

    const { count, error: countError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gt(metric, myProfile[metric] ?? 0);

    if (countError) return null;

    return {
        rank: (count ?? 0) + 1,
        xp: myProfile.xp ?? 0,
        coins: myProfile.coins ?? 0,
        name: myProfile.full_name || myProfile.username || 'You',
        avatarUrl: myProfile.avatar_url,
    };
}
