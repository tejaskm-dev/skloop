-- ============================================================================
-- Skloop migration 006: indexes for the hot read paths
-- ============================================================================
-- Targets the queries that run on every dashboard and chat load. Without these
-- Postgres sequential-scans, which is survivable at ten users and is not at a
-- thousand — and on the Supabase free tier the wasted I/O and egress are the
-- metered resources.
--
-- This is ONE self-contained DO block on purpose. An earlier version defined a
-- pg_temp helper and called it from a separate statement, which breaks if the
-- SQL editor runs statements independently — the helper isn't there yet.
--
-- Each index is attempted only when its table and every column it references
-- exist. Anything else is reported as a NOTICE and skipped, so a schema that
-- differs from the app code cannot abort the run. Safe to re-run.
-- ============================================================================

DO $$
DECLARE
    -- {index name, table, required columns (comma-separated), DDL}
    specs text[][] := ARRAY[
        -- Chat -------------------------------------------------------------
        ARRAY['idx_messages_convo_created', 'messages',
              'conversation_id,created_at',
              'CREATE INDEX IF NOT EXISTS idx_messages_convo_created ON public.messages (conversation_id, created_at DESC)'],

        ARRAY['idx_messages_convo_sender_status', 'messages',
              'conversation_id,sender_id,status,is_deleted',
              'CREATE INDEX IF NOT EXISTS idx_messages_convo_sender_status ON public.messages (conversation_id, sender_id, status) WHERE is_deleted = false'],

        -- Membership checks run on every conversation-scoped action
        -- (requireConversationMember), so this is on the hot path for all chat.
        ARRAY['idx_convo_participants_convo_user', 'conversation_participants',
              'conversation_id,user_id',
              'CREATE INDEX IF NOT EXISTS idx_convo_participants_convo_user ON public.conversation_participants (conversation_id, user_id)'],

        ARRAY['idx_convo_participants_user', 'conversation_participants',
              'user_id',
              'CREATE INDEX IF NOT EXISTS idx_convo_participants_user ON public.conversation_participants (user_id)'],

        ARRAY['idx_message_status_msg_user', 'message_status',
              'message_id,user_id',
              'CREATE INDEX IF NOT EXISTS idx_message_status_msg_user ON public.message_status (message_id, user_id)'],

        -- Notifications ----------------------------------------------------
        ARRAY['idx_notifications_user_unread', 'notifications',
              'user_id,created_at,is_read',
              'CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, created_at DESC) WHERE is_read = false'],

        -- Learning progress ------------------------------------------------
        ARRAY['idx_user_topic_progress_user_status', 'user_topic_progress',
              'user_id,status',
              'CREATE INDEX IF NOT EXISTS idx_user_topic_progress_user_status ON public.user_topic_progress (user_id, status)'],

        ARRAY['idx_user_courses_user_accessed', 'user_courses',
              'user_id,last_accessed',
              'CREATE INDEX IF NOT EXISTS idx_user_courses_user_accessed ON public.user_courses (user_id, last_accessed DESC)'],

        ARRAY['idx_topics_module', 'topics', 'module_id',
              'CREATE INDEX IF NOT EXISTS idx_topics_module ON public.topics (module_id)'],

        ARRAY['idx_modules_track', 'modules', 'track_id',
              'CREATE INDEX IF NOT EXISTS idx_modules_track ON public.modules (track_id)'],

        -- Tasks ------------------------------------------------------------
        ARRAY['idx_user_tasks_user_status', 'user_tasks', 'user_id,status',
              'CREATE INDEX IF NOT EXISTS idx_user_tasks_user_status ON public.user_tasks (user_id, status)'],

        -- Profiles ---------------------------------------------------------
        ARRAY['idx_profiles_username', 'profiles', 'username',
              'CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (lower(username))'],

        ARRAY['idx_profiles_xp', 'profiles', 'xp',
              'CREATE INDEX IF NOT EXISTS idx_profiles_xp ON public.profiles (xp DESC)'],

        ARRAY['idx_profiles_coins', 'profiles', 'coins',
              'CREATE INDEX IF NOT EXISTS idx_profiles_coins ON public.profiles (coins DESC)'],

        -- Quests / activity ------------------------------------------------
        ARRAY['idx_dqc_user_cycle', 'daily_quest_completions', 'user_id,cycle_key',
              'CREATE INDEX IF NOT EXISTS idx_dqc_user_cycle ON public.daily_quest_completions (user_id, cycle_key)'],

        ARRAY['idx_user_chests_user_status', 'user_chests', 'user_id,status',
              'CREATE INDEX IF NOT EXISTS idx_user_chests_user_status ON public.user_chests (user_id, status)'],

        ARRAY['idx_activity_logs_user_date', 'activity_logs', 'user_id,activity_date',
              'CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date ON public.activity_logs (user_id, activity_date)']
    ];

    spec       text[];
    idx_name   text;
    tbl        text;
    cols       text[];
    ddl        text;
    col        text;
    missing    text[];
    created    int := 0;
    skipped    int := 0;
BEGIN
    FOREACH spec SLICE 1 IN ARRAY specs LOOP
        idx_name := spec[1];
        tbl      := spec[2];
        cols     := string_to_array(spec[3], ',');
        ddl      := spec[4];
        missing  := ARRAY[]::text[];

        IF to_regclass('public.' || tbl) IS NULL THEN
            RAISE NOTICE 'SKIP % — table public.% does not exist', idx_name, tbl;
            skipped := skipped + 1;
            CONTINUE;
        END IF;

        FOREACH col IN ARRAY cols LOOP
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name   = tbl
                   AND column_name  = col
            ) THEN
                missing := missing || col;
            END IF;
        END LOOP;

        IF array_length(missing, 1) > 0 THEN
            RAISE NOTICE 'SKIP % — public.% missing column(s): %', idx_name, tbl, array_to_string(missing, ', ');
            skipped := skipped + 1;
            CONTINUE;
        END IF;

        BEGIN
            EXECUTE ddl;
            created := created + 1;
        EXCEPTION WHEN others THEN
            -- Never let one index abort the rest.
            RAISE NOTICE 'SKIP % — %', idx_name, SQLERRM;
            skipped := skipped + 1;
        END;
    END LOOP;

    RAISE NOTICE '--- indexes created: %, skipped: % ---', created, skipped;
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
-- ============================================================================
