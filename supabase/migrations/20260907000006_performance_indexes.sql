-- ============================================================================
-- Skloop migration 006: indexes for the hot read paths
-- ============================================================================
-- These target the queries that run on every dashboard and chat load. Without
-- them Postgres sequential-scans, which is survivable at ten users and is not
-- at a thousand — and on the Supabase free tier the wasted I/O and egress are
-- the metered resources.
--
-- Every index is created through a helper that first checks the table and all
-- of its columns actually exist, so this migration adapts to your schema rather
-- than assuming it. Anything it can't create is reported as a NOTICE and
-- skipped instead of aborting the run. Safe to re-run.
--
-- CONCURRENTLY is deliberately not used: it cannot run inside a transaction
-- block, and the Supabase SQL editor wraps statements in one. If a table is
-- already large in production, create that one index separately with
-- CREATE INDEX CONCURRENTLY.
-- ============================================================================

CREATE OR REPLACE FUNCTION pg_temp.try_create_index(
    p_index   text,
    p_table   text,
    p_columns text[],   -- columns that must exist
    p_ddl     text      -- the full CREATE INDEX statement
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    col     text;
    missing text[] := ARRAY[]::text[];
BEGIN
    IF to_regclass('public.' || p_table) IS NULL THEN
        RAISE NOTICE 'skipped %: table public.% does not exist', p_index, p_table;
        RETURN;
    END IF;

    FOREACH col IN ARRAY p_columns LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = p_table AND column_name = col
        ) THEN
            missing := missing || col;
        END IF;
    END LOOP;

    IF array_length(missing, 1) > 0 THEN
        RAISE NOTICE 'skipped %: public.% is missing column(s) %', p_index, p_table, missing;
        RETURN;
    END IF;

    EXECUTE p_ddl;
    RAISE NOTICE 'created %', p_index;
END;
$$;

DO $$
BEGIN
    -- ── Chat ───────────────────────────────────────────────────────────────

    -- Conversation list preview + message history pagination.
    PERFORM pg_temp.try_create_index(
        'idx_messages_convo_created', 'messages',
        ARRAY['conversation_id', 'created_at'],
        'CREATE INDEX IF NOT EXISTS idx_messages_convo_created
             ON public.messages (conversation_id, created_at DESC)');

    -- Unread badge scan: messages in these conversations, not mine, not read.
    PERFORM pg_temp.try_create_index(
        'idx_messages_convo_sender_status', 'messages',
        ARRAY['conversation_id', 'sender_id', 'status', 'is_deleted'],
        'CREATE INDEX IF NOT EXISTS idx_messages_convo_sender_status
             ON public.messages (conversation_id, sender_id, status)
             WHERE is_deleted = false');

    -- Membership checks now run on every conversation-scoped action
    -- (requireConversationMember), so this sits on the hot path for all of chat.
    PERFORM pg_temp.try_create_index(
        'idx_convo_participants_convo_user', 'conversation_participants',
        ARRAY['conversation_id', 'user_id'],
        'CREATE INDEX IF NOT EXISTS idx_convo_participants_convo_user
             ON public.conversation_participants (conversation_id, user_id)');

    PERFORM pg_temp.try_create_index(
        'idx_convo_participants_user', 'conversation_participants',
        ARRAY['user_id'],
        'CREATE INDEX IF NOT EXISTS idx_convo_participants_user
             ON public.conversation_participants (user_id)');

    PERFORM pg_temp.try_create_index(
        'idx_message_status_msg_user', 'message_status',
        ARRAY['message_id', 'user_id'],
        'CREATE INDEX IF NOT EXISTS idx_message_status_msg_user
             ON public.message_status (message_id, user_id)');

    -- ── Notifications ──────────────────────────────────────────────────────

    PERFORM pg_temp.try_create_index(
        'idx_notifications_user_unread', 'notifications',
        ARRAY['user_id', 'created_at', 'is_read'],
        'CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
             ON public.notifications (user_id, created_at DESC)
             WHERE is_read = false');

    -- ── Learning progress ──────────────────────────────────────────────────

    PERFORM pg_temp.try_create_index(
        'idx_user_topic_progress_user_status', 'user_topic_progress',
        ARRAY['user_id', 'status'],
        'CREATE INDEX IF NOT EXISTS idx_user_topic_progress_user_status
             ON public.user_topic_progress (user_id, status)');

    PERFORM pg_temp.try_create_index(
        'idx_user_courses_user_accessed', 'user_courses',
        ARRAY['user_id', 'last_accessed'],
        'CREATE INDEX IF NOT EXISTS idx_user_courses_user_accessed
             ON public.user_courses (user_id, last_accessed DESC)');

    -- getResumeCourseSlug joins topics -> modules to group topics by track.
    PERFORM pg_temp.try_create_index(
        'idx_topics_module', 'topics', ARRAY['module_id'],
        'CREATE INDEX IF NOT EXISTS idx_topics_module ON public.topics (module_id)');

    PERFORM pg_temp.try_create_index(
        'idx_modules_track', 'modules', ARRAY['track_id'],
        'CREATE INDEX IF NOT EXISTS idx_modules_track ON public.modules (track_id)');

    -- ── Tasks ──────────────────────────────────────────────────────────────

    PERFORM pg_temp.try_create_index(
        'idx_user_tasks_user_status', 'user_tasks',
        ARRAY['user_id', 'status'],
        'CREATE INDEX IF NOT EXISTS idx_user_tasks_user_status
             ON public.user_tasks (user_id, status)');

    -- ── Profiles ───────────────────────────────────────────────────────────

    -- Username lookups (profile pages, @mention resolution in chat).
    PERFORM pg_temp.try_create_index(
        'idx_profiles_username', 'profiles', ARRAY['username'],
        'CREATE INDEX IF NOT EXISTS idx_profiles_username
             ON public.profiles (lower(username))');

    -- Leaderboards.
    PERFORM pg_temp.try_create_index(
        'idx_profiles_xp', 'profiles', ARRAY['xp'],
        'CREATE INDEX IF NOT EXISTS idx_profiles_xp ON public.profiles (xp DESC)');

    PERFORM pg_temp.try_create_index(
        'idx_profiles_coins', 'profiles', ARRAY['coins'],
        'CREATE INDEX IF NOT EXISTS idx_profiles_coins ON public.profiles (coins DESC)');

    -- ── Quests / activity (mirrors migration 004) ──────────────────────────

    PERFORM pg_temp.try_create_index(
        'idx_dqc_user_cycle', 'daily_quest_completions',
        ARRAY['user_id', 'cycle_key'],
        'CREATE INDEX IF NOT EXISTS idx_dqc_user_cycle
             ON public.daily_quest_completions (user_id, cycle_key)');

    PERFORM pg_temp.try_create_index(
        'idx_user_chests_user_status', 'user_chests',
        ARRAY['user_id', 'status'],
        'CREATE INDEX IF NOT EXISTS idx_user_chests_user_status
             ON public.user_chests (user_id, status)');

    PERFORM pg_temp.try_create_index(
        'idx_activity_logs_user_date', 'activity_logs',
        ARRAY['user_id', 'activity_date'],
        'CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date
             ON public.activity_logs (user_id, activity_date)');
END $$;

-- ============================================================================
-- NEXT STEP (not applied here, needs a backfill):
--
-- The conversation list still scans recent messages to build previews. The
-- durable fix is to denormalise onto `conversations`:
--
--   ALTER TABLE conversations
--     ADD COLUMN last_message_content text,
--     ADD COLUMN last_message_at      timestamptz,
--     ADD COLUMN last_message_sender  uuid;
--
--   -- trigger on messages AFTER INSERT to keep those in sync,
--   -- then a one-time backfill from existing history.
--
-- That turns the preview query into one indexed read of `conversations` with no
-- message scan. Left out because it needs a backfill sized to your data.
-- ============================================================================
