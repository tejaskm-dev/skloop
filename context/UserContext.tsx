"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { User } from "@supabase/supabase-js";
import { processDailyLogin, fetchUserProfile, updateLastSeen } from "@/actions/user-actions";
import { usePresence } from "@/hooks/usePresence";

interface UserProfile {
    id: string;
    full_name: string | null;
    username: string | null;
    bio: string | null;
    location: string | null;
    website: string | null;
    avatar_url: string | null;
    banner_url: string | null;
    xp: number;
    coins: number;
    level: number;
    streak: number;
    role: string | null;
    company: string | null;
    skills: string[];
    streak_shields: number;
    inventory: string[];
    equipped_title: string | null;
    equipped_ring: string | null;
    equipped_frame: string | null;
    is_mentor: boolean;
    hourly_rate: number;
    joined_at: string | null;
    active_powers: {
        xp_multiplier?: number;
        xp_expires?: string;
        coins_multiplier?: number;
        coins_expires?: string;
    };
}

interface UserContextType {
    user: User | null;
    profile: UserProfile | null;
    isLoading: boolean;
    onlineUserIds: Set<string>;
    refreshProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// 500 XP per level — keep in sync with GamifiedHeader nextLevelXp formula
function calculateLevel(xp: number): number {
    return Math.floor(xp / 500) + 1;
}

export function UserProvider({
    children,
    initialUser = null,
    initialProfile = null
}: {
    children: React.ReactNode;
    initialUser?: User | null;
    initialProfile?: UserProfile | null;
}) {
    const [user, setUser] = useState<User | null>(initialUser);
    const [profile, setProfile] = useState<UserProfile | null>(initialProfile);
    const [isLoading, setIsLoading] = useState(!initialUser);
    const processedRef = React.useRef<string | null>(null);
    const supabase = useMemo(() => createClient(), []);
    const onlineUserIds = usePresence(user?.id);

    const fetchProfile = useCallback(async (userId: string) => {
        const data = await fetchUserProfile(userId);
        if (data) {
            const newProfile = data as UserProfile;
            setProfile((prev: UserProfile | null) => {
                if (JSON.stringify(prev) === JSON.stringify(newProfile)) return prev;
                return newProfile;
            });
            return newProfile;
        }
        return null;
    }, []);

    // handleDailyLogin is now handled via the processDailyLogin Server Action to ensure idempotency

    useEffect(() => {
        let mounted = true;

        const initAuth = async () => {
            // The (app) layout already resolved and verified the session on the
            // server and handed it down as initialUser/initialProfile. Re-running
            // getUser() here put another browser -> Supabase Auth round-trip on
            // the critical path of every page load, followed by a profile fetch
            // that duplicated data we were already given.
            //
            // When SSR supplied a user we trust it (the server verified it) and
            // skip straight to the daily-login side effect. onAuthStateChange
            // below still catches sign-out and token refresh, so a session that
            // goes stale is handled without polling for it here.
            const authUser = initialUser ?? (await supabase.auth.getUser()).data.user;

            if (mounted) {
                if (authUser) {
                    setUser(authUser);

                    // Only fetch if SSR didn't already give us the profile.
                    const fetchedProfile = initialProfile ?? await fetchProfile(authUser.id);

                    const todayStr = new Date().toISOString().split("T")[0];
                    const processedKey = `${authUser.id}_${todayStr}`;

                    if (fetchedProfile && processedRef.current !== processedKey) {
                        processedRef.current = processedKey;
                        const result = await processDailyLogin(authUser.id);
                        // Only re-fetch when the login actually changed XP/streak;
                        // on every load after the first of the day it's a no-op.
                        if (result?.success && !result.alreadyProcessed) {
                            await fetchProfile(authUser.id);
                        }
                    }
                } else if (!initialUser) {
                    // Only clear if we didn't have an initial SSR user
                    setUser(null);
                    setProfile(null);
                }
                setIsLoading(false);
            }

            const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
                if (!mounted) return;

                const newUser = session?.user || null;

                // Only skip if it's a neutral non-change event (INITIAL_SESSION with same user)
                if (event === 'INITIAL_SESSION' && newUser) {
                    return; // initAuth already handled the initial load
                }

                // Safety check for corrupted session (sometimes returned as a stringified object if truncated)
                if (typeof session === 'string' || (session && typeof session.user === 'string')) {
                    console.error("UserContext: Corrupted session detected, clearing state.");
                    setUser(null);
                    setProfile(null);
                    setIsLoading(false);
                    return;
                }

                if (newUser) {
                    setUser(newUser);
                    const fetchedProfile = await fetchProfile(newUser.id);
                    const todayStr = new Date().toISOString().split("T")[0];
                    const processedKey = `${newUser.id}_${todayStr}`;

                    if (fetchedProfile && processedRef.current !== processedKey) {
                        processedRef.current = processedKey;
                        await processDailyLogin(newUser.id);
                    }
                } else {
                    setUser(null);
                    setProfile(null);
                }
                setIsLoading(false);
            });

            return subscription;
        };

        let subscription: any;
        initAuth().then(sub => { subscription = sub; });

        return () => {
            mounted = false;
            subscription?.unsubscribe();
        };
    }, [supabase, fetchProfile, initialUser]);

    // Optimized visibility change: prevents full app refresh if data is same
    useEffect(() => {
        if (!user) return;

        let lastCheck = Date.now();
        const MIN_CHECK_INTERVAL = 30000; // 30 seconds

        const handleVisibilityChange = async () => {
            if (document.visibilityState === "visible") {
                const now = Date.now();
                // Only re-fetch if it's been a while to avoid aggressive refreshes
                if (now - lastCheck < MIN_CHECK_INTERVAL) return;

                lastCheck = now;
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (authUser) {
                    fetchProfile(authUser.id);
                } else {
                    setUser(null);
                    setProfile(null);
                }
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [user, fetchProfile, supabase]);

    // Heartbeat: update last_seen every 60s
    useEffect(() => {
        if (!user) return;

        // Update once on mount
        updateLastSeen();

        const interval = setInterval(() => {
            updateLastSeen();
        }, 60000); // 60 seconds

        return () => clearInterval(interval);
    }, [user]);

    // Supabase Realtime Subscription for Profile updates
    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel(`profile_updates_${user.id}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "profiles",
                    filter: `id=eq.${user.id}`
                },
                (payload: any) => {
                    if (payload.new && Object.keys(payload.new).length > 0) {
                        // Use the level directly from DB — do NOT recalculate from XP.
                        // The increment_profile_stats RPC and processDailyLogin already
                        // write the correct level to the DB.
                        const newProfile = payload.new as UserProfile;

                        setProfile((prev: UserProfile | null) => {
                            if (JSON.stringify(prev) === JSON.stringify(newProfile)) return prev;
                            return newProfile;
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, supabase]);

    const refreshProfile = async () => {
        if (user) {
            await fetchProfile(user.id);
        }
    };

    return (
        <UserContext.Provider value={{ user, profile, isLoading, onlineUserIds, refreshProfile }}>
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error("useUser must be used within a UserProvider");
    }
    return context;
}
