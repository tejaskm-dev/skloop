-- ============================================================================
-- Skloop security migration 007: revoke client writes to protected columns
-- ============================================================================
-- RUN THIS LAST — after migrations 001-006 AND after the new application code
-- is deployed.
--
-- This is the statement that actually closes the critical hole. Until it runs,
-- any authenticated user can still do:
--
--   supabase.from('profiles')
--     .update({ coins: 999999999, plan: 'pro', is_mentor: true })
--     .eq('id', myUserId)
--
-- HOW THIS WORKS
--
-- Rather than naming columns to grant (which fails if your schema doesn't have
-- one of them), this inverts the problem: it revokes UPDATE/INSERT wholesale,
-- then re-grants every column of public.profiles EXCEPT a protected denylist.
--
-- That ordering is the safe one. A column that exists but that neither list
-- anticipated stays writable — the app keeps working. A column on the denylist
-- that doesn't exist is simply skipped. And any column added to profiles in
-- future is writable by default, so re-run this migration after adding one that
-- should be protected.
--
-- Rollback:
--   GRANT UPDATE, INSERT ON public.profiles TO authenticated;
-- ============================================================================

DO $$
DECLARE
    -- Server-only. Reachable through the SECURITY DEFINER RPCs in 002 and 003.
    protected_cols text[] := ARRAY[
        'coins', 'xp', 'level', 'streak', 'streak_shields',   -- the economy
        'inventory', 'active_powers',                          -- items and boosts
        'equipped_title', 'equipped_ring', 'equipped_frame',   -- cosmetics (ownership-checked)
        'is_mentor', 'role',                                   -- authorization
        'plan', 'plan_expires_at',                             -- billing entitlement
        'last_seen',                                           -- presence (was spoofable)
        'id', 'created_at'                                     -- identity
    ];
    updatable  text;
    insertable text;
BEGIN
    IF to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'public.profiles does not exist — nothing to lock down';
    END IF;

    -- Everything that exists and is not protected.
    SELECT string_agg(quote_ident(column_name), ', ')
      INTO updatable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'profiles'
       AND column_name <> ALL (protected_cols)
       AND is_generated = 'NEVER'
       AND is_updatable = 'YES';

    -- Signup needs to write id; the rest mirrors the updatable set.
    SELECT string_agg(quote_ident(column_name), ', ')
      INTO insertable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'profiles'
       AND (column_name = 'id' OR column_name <> ALL (protected_cols))
       AND is_generated = 'NEVER';

    IF updatable IS NULL THEN
        RAISE EXCEPTION 'No updatable columns resolved — refusing to lock out all writes';
    END IF;

    REVOKE UPDATE, INSERT ON public.profiles FROM authenticated, anon;

    EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', updatable);
    EXECUTE format('GRANT INSERT (%s) ON public.profiles TO authenticated', insertable);

    RAISE NOTICE 'profiles: client may now UPDATE only -> %', updatable;
    RAISE NOTICE 'profiles: protected columns are server-only via RPC';
END $$;

-- anon should never write profiles at all.
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT ON public.profiles TO anon;

-- ── Verification ────────────────────────────────────────────────────────────
-- Confirms the economy and privilege columns are no longer client-writable.
-- Every row this returns is a column the browser can still write.
--
--   SELECT column_name
--     FROM information_schema.column_privileges
--    WHERE table_schema = 'public'
--      AND table_name   = 'profiles'
--      AND grantee      = 'authenticated'
--      AND privilege_type = 'UPDATE'
--    ORDER BY column_name;
--
-- coins, xp, plan and is_mentor must NOT appear in that list.
