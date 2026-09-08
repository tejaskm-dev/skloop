"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

function calculateLevel(xp: number): number {
    return Math.floor(xp / 500) + 1;
}

// ─── Daily Puzzle Word Bank ───────────────────────────────────────────────────
// Real 5-letter programming / CS / dev terms only.
// One word is picked per day deterministically — each user gets the same word.
const DAILY_WORDS = [
    // Core programming concepts
    "REACT", "STACK", "QUEUE", "ASYNC", "CONST", "AWAIT", "FETCH", "BUILD",
    "DEBUG", "LOGIC", "ARRAY", "CLASS", "ERROR", "FLOAT", "FRAME", "INDEX",
    "INPUT", "PARSE", "QUERY", "ROUTE", "STATE", "TABLE", "TOKEN", "UNION",
    "WATCH", "YIELD", "CACHE", "HOOKS", "PROPS", "MODEL", "CLONE", "SCOPE",
    "BYTES", "MUTEX", "PROXY", "STORE", "GRAPH", "REGEX", "STRIP", "SPLIT",
    "SLICE", "CHUNK", "TUPLE", "SUPER", "THROW", "TYPED", "LOCAL", "WRITE",
    "SERVE", "SPAWN", "RETRY", "APPLY", "MACRO", "PRINT", "TRAIT", "SHELL",
    "DELTA", "PIVOT", "SHIFT", "MONAD", "NONCE", "LATCH", "EVENT", "FIBER",
    "INODE", "ALLOC", "PATCH", "ABORT", "BLOCK", "BREAK", "CATCH", "CHAIN",
    "CHECK", "CLEAN", "CODEC", "COUNT", "TASKS", "FLAGS", "PORTS", "BLOBS",
    "FORKS", "INFIX", "JOINS", "LINES", "READS", "ZEROS", "LEXER", "ARITY",
    // Language & tooling terms
    "WHILE", "UNTIL", "LOOPS", "MERGE", "NODES", "LINKS", "TREES", "HEAPS",
    "GREPS", "TESTS", "MOCKS", "STUBS", "TYPES", "PATHS", "EDITS", "DIFFS",
    "REDIS", "TIMER", "SPAWN", "CALLS", "CODES", "GATES", "MIXIN", "TRUNC",
    "SCOPE", "STDIN", "VAULT", "DTYPE", "XPATH", "DATUM", "DIGIT", "FLOAT",
    "FIELD", "STACK", "INNER", "OUTER", "USING", "MATCH", "LIGHT", "DEPTH",
    "WIDTH", "ALIGN", "CHILD", "AFTER", "PRIOR", "OTHER", "LOWER", "UPPER",
    "GRANT", "REVOK", "INDEX", "PIVOT", "RANGE", "GROUP", "ORDER", "LIMIT",
    "ALIAS", "AVAIL", "CHUNK", "DEFER", "EAGER", "FLUSH", "GUARD", "HOIST",
    "IMMUT", "BENCH", "BREAK", "CLOSE", "DRAIN", "EMBED", "FLOOD", "GRUNT",
];

/**
 * Ensures today's daily puzzle exists in the DB.
 * If not, deterministically selects a word from DAILY_WORDS based on the date
 * and inserts it. Returns the puzzle { id, word }.
 */
export async function ensureDailyPuzzle(): Promise<{ id: string; word: string } | null> {
    const supabase = await createClient();
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // 1. Check if today's puzzle already exists
    const { data: existing } = await supabase
        .from('daily_puzzles')
        .select('id, word')
        .eq('puzzle_date', todayStr)
        .maybeSingle();

    if (existing) return existing;

    // 2. Pick a deterministic word using day-of-year as seed
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86_400_000);
    const word = DAILY_WORDS[dayOfYear % DAILY_WORDS.length];

    // 3. Insert — handle race condition where another request may have inserted first
    const { data: inserted, error } = await supabase
        .from('daily_puzzles')
        .insert({ puzzle_date: todayStr, word })
        .select('id, word')
        .maybeSingle();

    if (error) {
        // Likely a unique constraint violation from a concurrent insert — re-fetch
        const { data: fallback } = await supabase
            .from('daily_puzzles')
            .select('id, word')
            .eq('puzzle_date', todayStr)
            .maybeSingle();
        return fallback ?? null;
    }

    return inserted ?? null;
}

/**
 * Fetches all pending tasks for a specific user
 */
export async function getUserTasks() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const userId = user.id;

    const { data, error } = await supabase
        .from('user_tasks')
        .select(`
            id,
            status,
            task_id,
            tasks (
                id,
                xp_reward,
                difficulty
            )
        `)
        .eq('user_id', userId)
        .eq('status', 'pending');

    if (error) {
        console.error("Error fetching user tasks:", error);
        return [];
    }

    return data || [];
}

/**
 * Completes a task and grants its XP reward.
 *
 * Both the acting user and the payout are resolved server-side. The previous
 * signature was completeTask(userTaskId, userId, xpReward) — the caller chose
 * its own identity AND its own reward, which made arbitrary XP a one-liner.
 *
 * complete_user_task() claims the row atomically (WHERE status = 'pending'),
 * so double-submits can't pay out twice, and reads xp_reward from the tasks
 * table.
 */
export async function completeTask(userTaskId: string) {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        throw new Error("Unauthorized");
    }

    const { data, error } = await supabase.rpc("complete_user_task", {
        p_user_task_id: userTaskId,
    });

    if (error) {
        console.error("completeTask RPC error:", error.message);
        throw new Error("Failed to complete task");
    }

    const result = data as { success: boolean; error?: string; newXp?: number; xpAwarded?: number };

    if (!result?.success) {
        throw new Error(result?.error || "Failed to complete task");
    }

    revalidatePath("/dashboard");
    return { success: true, newXp: result.newXp, xpAwarded: result.xpAwarded };
}

/**
 * Returns the status of daily quests for a user.
 * Checks the daily_quest_completions table first, then falls back to activity checks.
 */
export async function getQuestStatus() {
    const supabase = await createClient();
    const todayStr = new Date().toISOString().split('T')[0];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { login: false, codele: false };
    const userId = user.id;

    // Check daily_quest_completions table
    const { data: completions } = await supabase
        .from('daily_quest_completions')
        .select('quest_id')
        .eq('user_id', userId)
        .eq('completed_at', todayStr);

    const completedQuestIds = new Set((completions || []).map((c: any) => c.quest_id));

    // If login not already claimed, also check activity_logs as fallback
    let loginCompleted = completedQuestIds.has('login');
    if (!loginCompleted) {
        const { data: loginLog } = await supabase
            .from('activity_logs')
            .select('id')
            .eq('user_id', userId)
            .eq('activity_date', todayStr)
            .eq('focus_area', 'Daily Login');
        loginCompleted = !!(loginLog && loginLog.length > 0);
    }

    // Check Daily Codele
    let codeleCompleted = completedQuestIds.has('codele');
    if (!codeleCompleted) {
        const { data: dailyPuzzle } = await supabase
            .from('daily_puzzles')
            .select('id')
            .eq('puzzle_date', todayStr)
            .maybeSingle();

        if (dailyPuzzle) {
            const { data: puzzleAttempt } = await supabase
                .from('user_puzzle_attempts')
                .select('status')
                .eq('user_id', userId)
                .eq('puzzle_id', dailyPuzzle.id)
                .maybeSingle();

            // Win or loss both count — only quitting (status stays 'playing') doesn't
            if (puzzleAttempt && puzzleAttempt.status !== 'playing') {
                codeleCompleted = true;
            }
        }
    }

    return {
        login: loginCompleted,
        codele: codeleCompleted
    };
}

/**
 * Claims a daily quest reward for a user.
 * Delegates to the new Quest Expansion system under the hood.
 */
export async function claimDailyQuest(
    questId: string
): Promise<{ success: boolean; message: string; xpAwarded?: number; coinsAwarded?: number }> {
    const supabase = await createClient();
    const todayStr = new Date().toISOString().split('T')[0];

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return { success: false, message: 'Unauthorized' };
    }
    const userId = user.id;

    // 1. Pre-validation for specific quest conditions
    if (questId === 'login') {
        const { data: loginLog } = await supabase
            .from('activity_logs')
            .select('id')
            .eq('user_id', userId)
            .eq('activity_date', todayStr)
            .eq('focus_area', 'Daily Login');
        // Auto-pass: if user is authenticated and we're calling this, they've logged in
    }

    if (questId === 'codele') {
        // Look up today's puzzle directly to avoid relying on state
        const { data: dailyPuzzle } = await supabase
            .from('daily_puzzles')
            .select('id')
            .eq('puzzle_date', todayStr)
            .maybeSingle();

        if (dailyPuzzle) {
            const { data: puzzleAttempt } = await supabase
                .from('user_puzzle_attempts')
                .select('status')
                .eq('user_id', userId)
                .eq('puzzle_id', dailyPuzzle.id)
                .maybeSingle();

            if (!puzzleAttempt || puzzleAttempt.status === 'playing') {
                return { success: false, message: 'Finish the Codele puzzle first to claim this reward.' };
            }
        } else {
            return { success: false, message: 'No Codele puzzle found for today.' };
        }
    }

    // 2. Delegate to the new Quest Engine
    const { claimQuestProgress } = await import('./quest-actions');
    
    let result;
    if (questId === 'login') {
        const [dailyResult] = await Promise.all([
            claimQuestProgress('login',      'daily'),
            claimQuestProgress('streak_7',   'weekly'),
            claimQuestProgress('streak_20m', 'monthly'),
        ]);
        result = dailyResult;
    } else if (questId === 'codele') {
        const [dailyResult] = await Promise.all([
            claimQuestProgress('codele',     'daily'),
            claimQuestProgress('codele_3w',  'weekly'),
            claimQuestProgress('codele_15m', 'monthly'),
        ]);
        result = dailyResult;
    } else if (questId === 'type_race') {
         const [dailyResult] = await Promise.all([
            claimQuestProgress('type_race',      'daily'),
            claimQuestProgress('type_race_3w',   'weekly'),   // FIX 11: correct quest key
            claimQuestProgress('type_race_10m',  'monthly'),  // FIX 11: correct quest key
        ]);
        result = dailyResult;
    } else {
        result = await claimQuestProgress(questId, 'daily');
    }

    if (!result.success) {
        return { success: false, message: result.message || 'Failed to claim quest.' };
    }

    // 3. Re-fetch quest to know how much was awarded for the return UI message
    const { data: questDetails } = await supabase
        .from('quests')
        .select('xp_reward, coins_reward')
        .eq('key', questId)
        .single();

    const xp = questDetails?.xp_reward || 0;
    const coins = questDetails?.coins_reward || 0;

    revalidatePath('/dashboard');
    return {
        success: true,
        message: `+${xp} XP and +${coins} Coins claimed!`,
        xpAwarded: xp,
        coinsAwarded: coins
    };
}
