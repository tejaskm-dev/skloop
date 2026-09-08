import { cache } from "react";
import { createClient } from "./server";

/**
 * Per-request memoised auth helpers.
 *
 * `supabase.auth.getUser()` is not a local token decode — it makes a network
 * round-trip to the Supabase Auth server to validate the JWT. The app calls it
 * in proxy.ts, again in the (app) layout, and again inside most server actions,
 * so a single dashboard render cost several sequential Auth calls. Under load
 * that is both the latency floor and a hard dependency on Auth availability for
 * every page view.
 *
 * React's `cache()` deduplicates per request, so all callers within one render
 * share a single round-trip. Behaviour is otherwise identical.
 *
 * Note this does NOT cache across requests — that would be a security problem.
 */
export const getCachedUser = cache(async () => {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return null;
    return user;
});

/**
 * The caller's profile row, also memoised per request. The (app) layout fetches
 * this on every navigation (it is force-dynamic), and several widgets re-fetch
 * the same row during the same render.
 */
export const getCachedProfile = cache(async () => {
    const user = await getCachedUser();
    if (!user) return null;

    const supabase = await createClient();
    const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

    return data ?? null;
});
