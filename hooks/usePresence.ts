"use client";

import { useEffect, useState, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

/**
 * Tracks which users are currently online via Supabase Presence.
 *
 * SCALING NOTE — this is mounted from UserContext, so it runs on every page for
 * every signed-in user, and `presence:global` is a single channel everyone
 * joins. Supabase Presence broadcasts the full state to every member on each
 * join/leave, so message volume grows with the square of concurrent users, and
 * each user holds one realtime connection. The Supabase free tier allows ~200
 * concurrent connections, which is the first ceiling this app will hit.
 *
 * Two mitigations here, neither of which changes what the UI displays while the
 * user is actually looking at it:
 *
 *   1. The channel is released when the tab is hidden and re-joined when it
 *      becomes visible. Most open tabs are backgrounded, so this removes the
 *      bulk of idle connections and their share of the broadcast fan-out.
 *   2. Re-joining is debounced so tab-flipping doesn't thrash the connection.
 *
 * If concurrency grows past the free-tier ceiling, the structural fix is to
 * stop tracking presence globally — either scope the channel to the peers a
 * user can actually see, or derive "online" from profiles.last_seen (already
 * maintained by touch_last_seen()), which costs no realtime connection at all.
 */
const REJOIN_DEBOUNCE_MS = 1000;

export function usePresence(currentUserId?: string | null) {
    const supabase = useMemo(() => createClient(), []);
    const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
    const rejoinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!currentUserId) return;

        let channel: ReturnType<typeof supabase.channel> | null = null;
        let disposed = false;

        const join = () => {
            if (disposed || channel) return;

            channel = supabase.channel('presence:global', {
                config: { presence: { key: currentUserId } }
            });

            channel
                .on('presence', { event: 'sync' }, () => {
                    if (!channel) return;
                    const state = channel.presenceState();
                    setOnlineUserIds(new Set(Object.keys(state)));
                })
                .on('presence', { event: 'join' }, ({ key }) => {
                    setOnlineUserIds(prev => {
                        if (prev.has(key)) return prev;
                        const next = new Set(prev);
                        next.add(key);
                        return next;
                    });
                })
                .on('presence', { event: 'leave' }, ({ key }) => {
                    setOnlineUserIds(prev => {
                        if (!prev.has(key)) return prev;
                        const next = new Set(prev);
                        next.delete(key);
                        return next;
                    });
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED' && channel) {
                        await channel.track({ online_at: new Date().toISOString() });
                    }
                });
        };

        const leave = () => {
            if (!channel) return;
            supabase.removeChannel(channel);
            channel = null;
        };

        const onVisibilityChange = () => {
            if (rejoinTimer.current) clearTimeout(rejoinTimer.current);

            if (document.visibilityState === 'visible') {
                // Debounced so rapid tab switching doesn't churn the connection.
                rejoinTimer.current = setTimeout(join, REJOIN_DEBOUNCE_MS);
            } else {
                leave();
            }
        };

        if (document.visibilityState === 'visible') join();
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            disposed = true;
            if (rejoinTimer.current) clearTimeout(rejoinTimer.current);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            leave();
        };
    }, [currentUserId, supabase]);

    return onlineUserIds;
}
