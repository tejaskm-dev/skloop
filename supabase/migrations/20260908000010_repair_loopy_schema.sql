-- ============================================================================
-- Skloop migration 010: repair the Loopy schema collision
-- ============================================================================
-- Migration 008 assumed it was creating fresh tables. It wasn't: loopy_messages
-- and loopy_chats already existed from the previous Loopy implementation, so
-- CREATE TABLE IF NOT EXISTS skipped them and only the ADD COLUMN reconcile
-- applied. Everything declared INSIDE those CREATE TABLE statements — CHECK
-- constraints, NOT NULL, foreign keys — was silently never installed.
--
-- The diagnostic surfaced three consequences. This repairs all of them, and is
-- safe to re-run.
-- ============================================================================

DO $$
DECLARE
    v_conname text;
BEGIN
    -- ── 1. role CHECK rejects 'tool' ────────────────────────────────────────
    -- The pre-existing constraint allows ('user','assistant','system'). The
    -- agent needs to record tool turns so a reloaded conversation can be
    -- replayed to the model faithfully, and 'system' is still used by the old
    -- code path — so the new constraint is the union, not a replacement.
    IF to_regclass('public.loopy_messages') IS NOT NULL THEN
        SELECT conname INTO v_conname
          FROM pg_constraint
         WHERE conrelid = 'public.loopy_messages'::regclass
           AND contype = 'c'
           AND pg_get_constraintdef(oid) ILIKE '%role%';

        IF v_conname IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.loopy_messages DROP CONSTRAINT %I', v_conname);
            RAISE NOTICE 'dropped stale role check: %', v_conname;
        END IF;

        ALTER TABLE public.loopy_messages
            ADD CONSTRAINT loopy_messages_role_check
            CHECK (role = ANY (ARRAY['user', 'assistant', 'system', 'tool']));
        RAISE NOTICE 'role check now allows user/assistant/system/tool';

        -- ── 2. legacy chat_id must not block new inserts ────────────────────
        -- chat_id belongs to the previous schema (FK to loopy_chats). The agent
        -- writes conversation_id instead, so a NOT NULL chat_id would fail every
        -- insert. Relaxed rather than dropped: existing rows still reference it.
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'loopy_messages'
               AND column_name = 'chat_id' AND is_nullable = 'NO'
        ) THEN
            ALTER TABLE public.loopy_messages ALTER COLUMN chat_id DROP NOT NULL;
            RAISE NOTICE 'loopy_messages.chat_id is now nullable';
        END IF;

        -- Same reasoning for any other column the old schema required but the
        -- new writer does not populate.
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'loopy_messages'
               AND column_name = 'conversation_id' AND is_nullable = 'NO'
        ) THEN
            NULL; -- conversation_id IS required by the new writer; leave it.
        END IF;
    END IF;
END $$;

-- ── 3. RLS enabled with no policy denies everything, silently ───────────────
-- 008 enables RLS on all four tables BEFORE creating their policies. Its first
-- run aborted between those steps, which leaves tables locked with no way in
-- and no error to notice. This re-asserts every policy idempotently.
DO $$
DECLARE
    t text;
    n int;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'loopy_conversations', 'loopy_messages',
        'loopy_artifacts', 'loopy_artifact_versions'
    ] LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE NOTICE 'SKIP % — table missing', t;
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'
        ) THEN
            RAISE NOTICE 'SKIP % — no user_id column', t;
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner', t);
        EXECUTE format($f$
            CREATE POLICY %I ON public.%I
                FOR ALL TO authenticated
                USING (user_id = (SELECT auth.uid()))
                WITH CHECK (user_id = (SELECT auth.uid()))
        $f$, t || '_owner', t);

        SELECT count(*) INTO n FROM pg_policies
         WHERE schemaname = 'public' AND tablename = t;
        RAISE NOTICE '% — RLS on, % policy/policies', t, n;
    END LOOP;
END $$;

-- ── 4. Verification ─────────────────────────────────────────────────────────
-- Any row with rls_enabled true and policy_count 0 is still locked.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'          -- ordinary tables only; pg_class also holds
  AND c.relname LIKE 'loopy_%' -- indexes and constraints, which have no RLS
ORDER BY c.relname;
