import type { createClient } from "@/utils/supabase/server";

/**
 * Two-tier rate limiting for the AI routes.
 *
 * Tier 1 is a bounded in-process LRU. It costs nothing and absorbs the common
 * case (one user hammering one warm instance) without touching the database.
 *
 * Tier 2 is a Postgres fixed-window counter, which is what actually holds
 * across instances and cold starts — the previous implementation was a bare
 * module-scoped Map, so the effective limit was (instances x 20)/min and it
 * leaked an entry per user id for the life of the instance.
 *
 * If the database call fails we fail OPEN. These endpoints are already
 * authenticated, and a transient DB blip shouldn't take the feature down; the
 * in-process tier still applies.
 */

const LOCAL_MAX_KEYS = 5000;

type Bucket = { count: number; resetAt: number };

const localBuckets = new Map<string, Bucket>();

/** Bounded, self-evicting local counter. Returns false when over the limit. */
function checkLocal(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();

    // Opportunistic sweep of expired entries — this is what the old Map lacked.
    if (localBuckets.size > LOCAL_MAX_KEYS) {
        for (const [k, v] of localBuckets) {
            if (v.resetAt < now) localBuckets.delete(k);
        }
        // Still oversized after sweeping? Drop oldest insertions (Map is ordered).
        if (localBuckets.size > LOCAL_MAX_KEYS) {
            const excess = localBuckets.size - LOCAL_MAX_KEYS;
            let dropped = 0;
            for (const k of localBuckets.keys()) {
                localBuckets.delete(k);
                if (++dropped >= excess) break;
            }
        }
    }

    const entry = localBuckets.get(key);
    if (!entry || entry.resetAt < now) {
        localBuckets.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }
    if (entry.count >= limit) return false;
    entry.count++;
    return true;
}

export interface RateLimitOptions {
    /** Requests permitted per window. */
    limit?: number;
    /** Window length in seconds. */
    windowSeconds?: number;
}

/**
 * Returns true if the caller may proceed.
 *
 * @param supabase an authenticated server client
 * @param scope    a short route identifier, e.g. "loopy-chat"
 * @param userId   the authenticated user's id
 */
export async function checkRateLimit(
    supabase: Awaited<ReturnType<typeof createClient>>,
    scope: string,
    userId: string,
    { limit = 20, windowSeconds = 60 }: RateLimitOptions = {}
): Promise<boolean> {
    const key = `${scope}:${userId}`;

    if (!checkLocal(key, limit, windowSeconds * 1000)) {
        return false;
    }

    try {
        const { data, error } = await supabase.rpc("check_rate_limit", {
            p_key: key,
            p_limit: limit,
            p_window_seconds: windowSeconds,
        });

        if (error) {
            console.warn(`[rate-limit] ${scope}: RPC failed, allowing:`, error.message);
            return true;
        }

        return data !== false;
    } catch (err) {
        console.warn(`[rate-limit] ${scope}: unexpected failure, allowing:`, err);
        return true;
    }
}
