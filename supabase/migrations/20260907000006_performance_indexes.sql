-- ============================================================================
-- Skloop migration 006: indexes for the hot read paths
-- ============================================================================
-- These target the queries that run on every dashboard and chat load. Without
-- them Postgres sequential-scans, which is survivable at ten users and is not
-- at a thousand — and on the Supabase free tier the wasted I/O and egress are
-- the metered resources.
--
-- All are IF NOT EXISTS so this migration is safe to re-run.
--
-- CONCURRENTLY is deliberately NOT used: it cannot run inside a transaction
-- block, and the Supabase SQL editor wraps statements in one. On a small table
-- the brief lock is fine. If any of these tables is already large in
-- production, run that statement separately with CREATE INDEX CONCURRENTLY.
-- ============================================================================

-- ── Chat ────────────────────────────────────────────────────────────────────

-- Conversation list preview + message history pagination (ORDER BY created_at
-- DESC within a conversation).
CREATE INDEX IF NOT EXISTS idx_messages_convo_created
    ON public.messages (conversation_id, created_at DESC);

-- Unread badge scan: "messages in these conversations, not mine, not read".
CREATE INDEX IF NOT EXISTS idx_messages_convo_sender_status
    ON public.messages (conversation_id, sender_id, status)
    WHERE is_deleted = false;

-- Membership checks now run on every conversation-scoped action
-- (requireConversationMember), so this one is on the hot path for all of chat.
CREATE INDEX IF NOT EXISTS idx_convo_participants_convo_user
    ON public.conversation_participants (conversation_id, user_id);

CREATE INDEX IF NOT EXISTS idx_convo_participants_user
    ON public.conversation_participants (user_id);

-- Per-user read receipts.
CREATE INDEX IF NOT EXISTS idx_message_status_msg_user
    ON public.message_status (message_id, user_id);

-- ── Notifications ───────────────────────────────────────────────────────────

-- The header badge polls unread counts.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON public.notifications (user_id, created_at DESC)
    WHERE is_read = false;

-- ── Learning progress ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_topic_progress_user_status
    ON public.user_topic_progress (user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_courses_user_accessed
    ON public.user_courses (user_id, last_accessed DESC);

-- getResumeCourseSlug joins topics -> modules to group topics by track.
CREATE INDEX IF NOT EXISTS idx_topics_module
    ON public.topics (module_id);

CREATE INDEX IF NOT EXISTS idx_modules_track
    ON public.modules (track_id);

-- ── Tasks ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_tasks_user_status
    ON public.user_tasks (user_id, status);

-- ── Profiles ────────────────────────────────────────────────────────────────

-- Username lookups (profile pages, @mention resolution in chat).
CREATE INDEX IF NOT EXISTS idx_profiles_username
    ON public.profiles (lower(username));

-- Leaderboards.
CREATE INDEX IF NOT EXISTS idx_profiles_xp   ON public.profiles (xp DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_coins ON public.profiles (coins DESC);

-- ============================================================================
-- NEXT STEP (not applied here, needs a backfill):
--
-- The conversation list still has to scan recent messages to build previews.
-- The durable fix is to denormalise onto `conversations`:
--
--   ALTER TABLE conversations
--     ADD COLUMN last_message_content text,
--     ADD COLUMN last_message_at      timestamptz,
--     ADD COLUMN last_message_sender  uuid;
--
--   -- trigger on messages AFTER INSERT to keep those three in sync,
--   -- then a one-time backfill from the existing history.
--
-- That turns the preview query into a single indexed read of `conversations`
-- with no message scan at all. It is left out of this migration because it
-- needs a backfill sized to your production data.
-- ============================================================================
