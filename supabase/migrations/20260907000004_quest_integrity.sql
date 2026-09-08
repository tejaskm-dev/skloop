-- ============================================================================
-- Skloop security migration 004: quest progress integrity
-- ============================================================================
-- claimQuestProgress() used to take progressAmount and targetAmount straight
-- from the caller, so claimQuestProgress(myId, 'streak_20m', 'monthly', 1, 1)
-- finished a 20-day quest in one request. Targets are now resolved from a
-- server-side map (see QUEST_TARGETS in actions/quest-actions.ts).
--
-- That still leaves multi-step quests claimable by calling N times in a row.
-- This column lets the server enforce at most one increment per calendar day
-- for quests whose target is greater than 1.
-- ============================================================================

ALTER TABLE public.daily_quest_completions
    ADD COLUMN IF NOT EXISTS last_progress_date date;

-- Constraints the original code comments asked for but that were never applied.
-- Without these, the insert/update path can double-award under concurrency.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'daily_quest_completions_user_quest_cycle_unique'
    ) THEN
        ALTER TABLE public.daily_quest_completions
            ADD CONSTRAINT daily_quest_completions_user_quest_cycle_unique
            UNIQUE (user_id, quest_id, cycle_key);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_chests_unique_cycle'
    ) THEN
        ALTER TABLE public.user_chests
            ADD CONSTRAINT user_chests_unique_cycle
            UNIQUE (user_id, cycle_key, chest_type);
    END IF;
END $$;

-- Supporting indexes for the hot lookups these tables get on every dashboard
-- load. IF NOT EXISTS keeps this migration re-runnable.
CREATE INDEX IF NOT EXISTS idx_dqc_user_cycle
    ON public.daily_quest_completions (user_id, cycle_key);

CREATE INDEX IF NOT EXISTS idx_user_chests_user_status
    ON public.user_chests (user_id, status);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date
    ON public.activity_logs (user_id, activity_date);
