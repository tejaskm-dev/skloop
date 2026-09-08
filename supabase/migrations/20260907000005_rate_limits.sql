-- ============================================================================
-- Skloop security migration 005: cross-instance rate limiting
-- ============================================================================
-- The AI routes each kept a module-scoped `Map` as their limiter. On serverless
-- that is per-instance, so the real limit is (instances x 20)/min and it resets
-- on every cold start. The Map also never evicted expired entries, so it grew
-- unbounded for the life of a warm instance.
--
-- This is a fixed-window counter in Postgres — no extra service, which matters
-- on the Supabase free tier. AI calls are low-volume and already cost ~1s at
-- the model, so one small upsert per call is not a meaningful addition.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
    key          text        PRIMARY KEY,
    window_start timestamptz NOT NULL DEFAULT now(),
    count        integer     NOT NULL DEFAULT 0
);

-- No policies are created: with RLS on and no policy, PostgREST clients get
-- nothing. Access is exclusively through the SECURITY DEFINER function below.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

/**
 * Consumes one unit against `p_key`. Returns true if the request is allowed.
 *
 * The INSERT ... ON CONFLICT is a single atomic statement, so concurrent
 * requests can't both read a stale count and both pass.
 */
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_key            text,
    p_limit          integer,
    p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    IF p_key IS NULL OR length(p_key) = 0 THEN
        RETURN false;
    END IF;

    INSERT INTO rate_limits AS rl (key, window_start, count)
    VALUES (p_key, now(), 1)
    ON CONFLICT (key) DO UPDATE
        SET count        = CASE
                               WHEN rl.window_start < now() - make_interval(secs => p_window_seconds)
                                   THEN 1
                               ELSE rl.count + 1
                           END,
            window_start = CASE
                               WHEN rl.window_start < now() - make_interval(secs => p_window_seconds)
                                   THEN now()
                               ELSE rl.window_start
                           END
    RETURNING rl.count INTO v_count;

    RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated;

/**
 * Housekeeping so the table can't grow without bound. Call periodically — e.g.
 * a Supabase scheduled job, or opportunistically from the app.
 */
CREATE OR REPLACE FUNCTION public.prune_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    DELETE FROM rate_limits WHERE window_start < now() - interval '1 day';
$$;

REVOKE ALL ON FUNCTION public.prune_rate_limits() FROM public, anon, authenticated;
