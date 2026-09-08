-- ============================================================================
-- Skloop security migration 004: quest progress integrity
-- ============================================================================
-- claimQuestProgress() used to take progressAmount and targetAmount straight
-- from the caller, so claimQuestProgress(myId, 'streak_20m', 'monthly', 1, 1)
-- finished a 20-day quest in one request. Targets are now resolved from a
-- server-side map (QUEST_TARGETS in actions/quest-actions.ts).
--
-- That still leaves multi-step quests claimable by calling N times in a row.
-- last_progress_date lets the server enforce at most one increment per calendar
-- day for quests whose target is greater than 1.
--
-- Every statement checks the table (and its columns) exists first, so this
-- adapts to your schema and reports what it skipped rather than aborting.
-- Safe to re-run.
-- ============================================================================

DO $$
BEGIN
    -- ── last_progress_date ─────────────────────────────────────────────────
    IF to_regclass('public.daily_quest_completions') IS NULL THEN
        RAISE NOTICE 'skipped: public.daily_quest_completions does not exist';
    ELSE
        ALTER TABLE public.daily_quest_completions
            ADD COLUMN IF NOT EXISTS last_progress_date date;
        RAISE NOTICE 'daily_quest_completions.last_progress_date ready';

        -- Unique constraint the original code comments asked for but which was
        -- never applied. Without it the insert/update path can double-award
        -- under concurrency.
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'daily_quest_completions'
               AND column_name IN ('user_id', 'quest_id', 'cycle_key')
             GROUP BY table_name HAVING count(*) = 3
        ) AND NOT EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conname = 'daily_quest_completions_user_quest_cycle_unique'
        ) THEN
            BEGIN
                ALTER TABLE public.daily_quest_completions
                    ADD CONSTRAINT daily_quest_completions_user_quest_cycle_unique
                    UNIQUE (user_id, quest_id, cycle_key);
                RAISE NOTICE 'added unique(user_id, quest_id, cycle_key)';
            EXCEPTION WHEN unique_violation THEN
                -- Pre-existing duplicate rows: report rather than fail the run.
                RAISE NOTICE 'could NOT add unique(user_id, quest_id, cycle_key) — duplicate rows exist. De-duplicate, then re-run.';
            END;
        END IF;
    END IF;

    -- ── user_chests ────────────────────────────────────────────────────────
    IF to_regclass('public.user_chests') IS NULL THEN
        RAISE NOTICE 'skipped: public.user_chests does not exist';
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'user_chests'
           AND column_name IN ('user_id', 'cycle_key', 'chest_type')
         GROUP BY table_name HAVING count(*) = 3
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_chests_unique_cycle'
    ) THEN
        BEGIN
            ALTER TABLE public.user_chests
                ADD CONSTRAINT user_chests_unique_cycle
                UNIQUE (user_id, cycle_key, chest_type);
            RAISE NOTICE 'added unique(user_id, cycle_key, chest_type)';
        EXCEPTION WHEN unique_violation THEN
            RAISE NOTICE 'could NOT add unique(user_id, cycle_key, chest_type) — duplicate rows exist. De-duplicate, then re-run.';
        END;
    END IF;
END $$;

-- Supporting indexes live in migration 006, which is schema-adaptive.
