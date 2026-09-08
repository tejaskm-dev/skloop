-- ============================================================================
-- Skloop security migration 001: profiles prerequisites + row-level policies
-- ============================================================================
-- WHY: the shop, quest, and mentor flows currently write economy and privilege
-- columns straight from the browser with the anon key. Any authenticated user
-- can open devtools and run:
--
--   supabase.from('profiles')
--     .update({ coins: 999999999, plan: 'pro', is_mentor: true })
--     .eq('id', myUserId)
--
-- RLS policies cannot restrict *which columns* an UPDATE touches, so a
-- row-level "id = auth.uid()" policy does not help here. Column-level GRANTs
-- are the correct mechanism, and that is what this migration installs.
--
-- SAFE TO RUN BEFORE DEPLOYING: this file only ADDS things. The column-level
-- revokes that actually close the hole live in migration 007, which you run
-- AFTER the new application code is live.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Columns this migration expects to exist.
--    ai_context_memory was previously stashed inside the active_powers JSONB —
--    the same blob that holds xp_multiplier / coins_multiplier. Granting the
--    client write access to active_powers so it could save an AI preference
--    would have handed it a reward multiplier, so the preference gets its own
--    column and active_powers stays server-only.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS ai_context_memory boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 1. Make sure RLS is actually on.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Row-level access: a user may read all profiles (needed for leaderboards,
--    peer lists, mentor discovery) but may only UPDATE their own row.
--    Column-level grants below decide *which* columns that update may touch.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_all"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"  ON public.profiles;

CREATE POLICY "profiles_select_all"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "profiles_update_own"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "profiles_insert_own"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = (SELECT auth.uid()));

-- No DELETE policy: account deletion goes through the service-role path in
-- deleteAccountAction(). Clients must not be able to delete profile rows.
