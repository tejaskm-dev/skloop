import { createClient } from "@/utils/supabase/client";
import { ShopItem } from "./shop-items";
import { getAvatarUrl } from "./utils";

export const fetchUserTasks = async ([key, userId]: [string, string]) => {
    const { getUserTasks } = await import("@/actions/task-actions");
    return await getUserTasks();
};

export const fetchCourseTrack = async ([key, courseId, userId]: [string, string, string]) => {
    const supabase = createClient();

    // ── Try 1: Look in the `courses` table by slug ──
    const { data: course } = await supabase
        .from("courses")
        .select("id, title, total_lessons")
        .eq("slug", courseId)
        .maybeSingle();

    if (course) {
        // Parallelize lesson, progress, and role fetching
        const [lessonsResult, progressResult, profileResult] = await Promise.all([
            supabase
                .from("lessons")
                .select("id, title, order_index, content, video_url")
                .eq("course_id", course.id)
                .order("order_index", { ascending: true }),
            userId
                ? supabase.from("user_lesson_progress").select("lesson_id").eq("user_id", userId)
                : Promise.resolve({ data: [] }),
            userId
                ? supabase.from("profiles").select("is_mentor").eq("id", userId).single()
                : Promise.resolve({ data: null })
        ]);

        const lessons = lessonsResult.data;
        const progressData = progressResult.data;

        let completedLessonIds = new Set<string>();
        if (progressData) completedLessonIds = new Set(progressData.map((p: any) => p.lesson_id));

        const isMentor = profileResult?.data?.is_mentor === true;

        const lessonList = lessons ?? [];
        const completedCount = lessonList.filter((l) => completedLessonIds.has(l.id)).length;
        const progress = lessonList.length > 0
            ? Math.round((completedCount / lessonList.length) * 100)
            : 0;

        let isPreviousLessonCompleted = true;
        const LESSONS_PER_MODULE = 4;
        const builtModules: any = [];
        for (let i = 0; i < lessonList.length; i += LESSONS_PER_MODULE) {
            const chunk = lessonList.slice(i, i + LESSONS_PER_MODULE);
            const moduleNum = Math.floor(i / LESSONS_PER_MODULE) + 1;
            const moduleLessons = chunk.map((l) => {
                const completed = completedLessonIds.has(l.id);
                const locked = !isPreviousLessonCompleted;
                isPreviousLessonCompleted = completed;
                return {
                    id: l.id,
                    title: l.title,
                    order_index: l.order_index,
                    isCompleted: completed,
                    type: l.video_url ? "video" : "article",
                    duration: (l as any).content_data?.duration || (l as any).content_data?.readTime || "10 min",
                    isLocked: isMentor ? false : locked,
                };
            });
            const allDone = moduleLessons.every((l) => l.isCompleted);
            const anyDone = moduleLessons.some((l) => l.isCompleted);
            builtModules.push({
                id: moduleNum,
                title: `Module ${moduleNum}`,
                description: chunk[0]?.content || `Continue your learning journey in this module.`,
                lessons: moduleLessons,
                status: allDone ? "completed" : anyDone ? "in-progress" : "in-progress",
            });
        }

        const firstActive = builtModules.find((m: any) => m.status === "in-progress");
        const activeModuleId = firstActive?.id ?? builtModules[0]?.id ?? 0;
        const firstUncompleted = lessonList.find((l) => !completedLessonIds.has(l.id)) || lessonList[0];

        return {
            trackData: {
                title: course.title,
                progress,
                totalModules: builtModules.length,
                completedModules: builtModules.filter((m: any) => m.status === "completed").length,
                currentLesson: {
                    id: firstUncompleted?.id ?? "",
                    title: firstUncompleted?.title ?? "Start Learning",
                },
            },
            modules: builtModules,
            activeModuleId
        };
    }

    // ── Try 2: Fall back to the `tracks` table ──
    const { data: track } = await supabase
        .from("tracks")
        .select("id, title")
        .eq("slug", courseId)
        .maybeSingle();

    if (!track) return null;

    // Parallelize module, topic, progress, and role fetching
    const [modulesResult, topicsResult, progressResult, profileResult] = await Promise.all([
        supabase
            .from("modules")
            .select("id, title, description, order_index")
            .eq("track_id", track.id)
            .order("order_index"),
        supabase
            .from("topics")
            .select("id, module_id, title, order_index, type, content_data, modules!inner(track_id)")
            .eq("modules.track_id", track.id)
            .order("order_index", { ascending: true }),
        userId
            ? supabase.from("user_topic_progress").select("topic_id").eq("user_id", userId).eq("status", "completed")
            : Promise.resolve({ data: [] }),
        userId
            ? supabase.from("profiles").select("is_mentor").eq("id", userId).single()
            : Promise.resolve({ data: null })
    ]);

    const dbModules = modulesResult.data;
    const topics = topicsResult.data;
    const progressData = progressResult.data;

    let completedTopicIds = new Set<string>();
    if (progressData) completedTopicIds = new Set(progressData.map((p: any) => p.topic_id));

    const isMentor = profileResult?.data?.is_mentor === true;

    if (!dbModules || dbModules.length === 0) return null;

    const totalTopics = topics?.length ?? 0;
    const completedCount = topics?.filter((t) => completedTopicIds.has(t.id)).length ?? 0;
    const progress = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;

    let isPreviousLessonCompleted = true;

    const builtModules = dbModules.map((mod, idx) => {
        const modTopics = (topics ?? []).filter((t) => t.module_id === mod.id);
        const moduleLessons = modTopics.map((t) => {
            const completed = completedTopicIds.has(t.id);
            const locked = !isPreviousLessonCompleted;
            isPreviousLessonCompleted = completed;
            return {
                id: t.id,
                title: t.title,
                order_index: t.order_index,
                isCompleted: completed,
                type: t.type as any,
                duration: (t.content_data as any)?.duration || (t.content_data as any)?.readTime || "10 min",
                isLocked: isMentor ? false : locked,
            };
        });
        const allDone = moduleLessons.every((l) => l.isCompleted);
        const anyDone = moduleLessons.some((l) => l.isCompleted);
        return {
            id: idx + 1,
            title: mod.title,
            description: mod.description || `Module ${idx + 1}`,
            lessons: moduleLessons,
            status: allDone ? "completed" : anyDone ? "in-progress" : "in-progress",
        };
    });

    const firstActive = builtModules.find((m: any) => m.status === "in-progress");
    const activeModuleId = firstActive?.id ?? builtModules[0]?.id ?? 0;
    const firstUncompletedTopic = topics?.find((t) => !completedTopicIds.has(t.id)) || topics?.[0];

    return {
        trackData: {
            title: track.title,
            progress,
            totalModules: builtModules.length,
            completedModules: builtModules.filter((m: any) => m.status === "completed").length,
            currentLesson: {
                id: firstUncompletedTopic?.id ?? "",
                title: firstUncompletedTopic?.title ?? "Start Learning",
            },
        },
        modules: builtModules,
        activeModuleId
    };
};

export const fetchLesson = async ([key, lessonId]: [string, string]) => {
    const { LESSON_CONTENT_MAP } = await import("./mock-lesson-data");

    // 1. Check local mock map first
    const localData = LESSON_CONTENT_MAP[lessonId];
    if (localData) {
        return localData;
    }

    const supabase = createClient();

    // 2. Fetch from Supabase 'topics' table
    const { data: topic } = await supabase
        .from("topics")
        .select("*, module:modules(track:tracks(slug))")
        .eq("id", lessonId)
        .maybeSingle();

    if (topic) {
        const content = topic.content_data || {};
        return {
            id: topic.id,
            title: topic.title,
            moduleTitle: "Track Lesson", // Fallback
            type: content.challengeType === 'flowchart' ? 'flowchart' : topic.type,
            videoUrl: content.youtubeId ? `https://www.youtube.com/embed/${content.youtubeId}` : undefined,
            summary: content.summary,
            content: content.markdown || content.content || "",
            description: content.instructions || content.description,
            requirements: content.requirements || [],
            hints: content.hints || [],
            initialCode: content.initialCode || {
                html: content.initialHtml || "",
                css: content.initialCss || "",
                js: content.initialJs || ""
            },
            mode: content.mode || "web",
            questions: content.questions || [],
            validationRules: content.validationRules || [],
            trackSlug: topic.module?.track?.slug || "web-development",
            flowchartTask: content.task,
            requiredNodes: content.requiredNodes || [],
            validation: content.validation || undefined,
            miniQuiz: content.miniQuiz || []
        };
    }

    // 3. Fallback to `lessons` table
    const { data: lessonData } = await supabase
        .from("lessons")
        .select("*")
        .eq("id", lessonId)
        .maybeSingle();

    if (lessonData) {
        return {
            id: lessonData.id,
            title: lessonData.title,
            moduleTitle: "Course Lesson",
            type: "article",
            videoUrl: lessonData.video_url,
            content: lessonData.content || "",
        };
    }

    // 4. Fallback to error UI
    return {
        id: lessonId,
        title: "Lesson Not Found",
        moduleTitle: "Unknown Module",
        type: "article",
        content: `<p>We couldn't find lesson data for ID <strong>${lessonId}</strong>.</p>`
    };
};

/**
 * Fetches user projects for the portfolio module
 */
export async function fetchUserProjects(userId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("user_projects")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * Fetches user timeline events
 */
export async function fetchUserTimeline(userId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("user_timeline")
        .select("*")
        .eq("user_id", userId)
        .order("event_date", { ascending: false })
        // Grows by a row per chest opened, project added, milestone hit —
        // unbounded over an account's lifetime. The profile renders a recent
        // slice, so there is no reason to pull the whole history.
        .limit(100);

    if (error) throw error;
    return data || [];
}

export interface PeerProfile {
    id: string;
    name: string;
    username: string;
    avatarUrl?: string;
    track: string;
    level: number;
    xp: number;
    streak: number;
    status: "friend" | "pending_incoming" | "pending_outgoing" | "none";
    isOnline?: boolean;
}

export interface StudyCircle {
    id: string;
    name: string;
    avatarUrl?: string;
    topic: string;
    description: string;
    memberCount: number;
    maxMembers: number;
    tags: string[];
    isJoined: boolean;
}

export const fetchStudyCircles = async ([key, userId]: [string, string]): Promise<StudyCircle[]> => {
    const supabase = createClient();

    // Fetch public group conversations
    const { data: convos } = await supabase
        .from('conversations')
        .select('id, title, description, tags, avatar_url, privacy')
        .eq('type', 'group')
        .eq('privacy', 'public')
        .order('created_at', { ascending: false });

    if (!convos) return [];

    const convoIds = convos.map(c => c.id);
    if (convoIds.length === 0) return [];

    const { data: participants } = await supabase
        .from('conversation_participants')
        .select('conversation_id, user_id')
        .in('conversation_id', convoIds);

    const countMap = new Map<string, { count: number; isJoined: boolean }>();
    if (participants) {
        for (const p of participants) {
            const existing = countMap.get(p.conversation_id) || { count: 0, isJoined: false };
            existing.count += 1;
            if (p.user_id === userId) existing.isJoined = true;
            countMap.set(p.conversation_id, existing);
        }
    }

    return convos.map(c => {
        const stats = countMap.get(c.id) || { count: 0, isJoined: false };
        return {
            id: c.id,
            name: c.title || 'Unnamed Circle',
            avatarUrl: getAvatarUrl(c.avatar_url),
            topic: c.tags?.[0] || 'General',
            description: c.description || 'A study circle for eager learners.',
            memberCount: stats.count,
            maxMembers: 50,
            tags: c.tags || [],
            isJoined: stats.isJoined,
        };
    });
};

export const fetchPeers = async ([key, userId]: [string, string]): Promise<PeerProfile[]> => {
    const supabase = createClient();

    // Fetch Connections
    const { data: connections } = await supabase
        .from('connections')
        .select('*')
        .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);

    if (!connections || connections.length === 0) return []; // Added check for empty connections array

    // Get all unique user IDs from connections (excluding self)
    const peerIds = new Set<string>();
    connections.forEach(conn => {
        if (conn.requester_id !== userId) peerIds.add(conn.requester_id);
        if (conn.recipient_id !== userId) peerIds.add(conn.recipient_id);
    });

    if (peerIds.size === 0) return [];

    // Fetch Profiles
    const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', Array.from(peerIds));

    if (!profiles) return [];

    return profiles.map(p => {
        // Find the connection relationship
        const conn = connections.find(c =>
            (c.requester_id === userId && c.recipient_id === p.id) ||
            (c.recipient_id === userId && c.requester_id === p.id)
        );

        let status: PeerProfile["status"] = "none";
        if (conn) {
            if (conn.status === 'accepted') status = "friend";
            else if (conn.status === 'pending') {
                if (conn.requester_id === userId) status = "pending_outgoing";
                else status = "pending_incoming";
            }
        }

        return {
            id: p.id,
            name: p.full_name || p.username || 'Unknown',
            username: p.username || `user_${p.id.substring(0, 5)}`,
            avatarUrl: p.avatar_url || undefined,
            track: p.role || "Learner",
            level: p.level || 1,
            xp: p.xp || 0,
            streak: p.streak || 0,
            status,
            isOnline: false
        };
    });
};

export interface LeaderboardUser {
    id: string;
    rank: number;
    name: string;
    username: string;
    avatarUrl: string;
    xp: number;
    coins: number;
    streak: number;
    trend: "up" | "down" | "same";
}

export const fetchGlobalLeaderboard = async ([key, metric]: [string, "xp" | "coins"]): Promise<LeaderboardUser[]> => {
    const { getGlobalLeaderboard } = await import("@/actions/leaderboard-actions");
    return await getGlobalLeaderboard(metric);
};

export const fetchFriendsLeaderboard = async ([key, userId, metric]: [string, string, "xp" | "coins"]): Promise<LeaderboardUser[]> => {
    const { getFriendsLeaderboard } = await import("@/actions/leaderboard-actions");
    return await getFriendsLeaderboard(metric);
};

export const fetchUserRank = async ([key, userId, metric]: [string, string, "xp" | "coins"]) => {
    const { getUserRank } = await import("@/actions/leaderboard-actions");
    return await getUserRank(metric);
};

export interface ShopData {
    coins: number;
    inventory: string[];
    streakShields: number;
    items: ShopItem[];
}

export const fetchShopData = async ([key, userId]: [string, string]): Promise<ShopData | null> => {
    const supabase = createClient();
    const { SHOP_ITEMS } = await import("./shop-items");

    // 1. Fetch User Profile and Shop Items in parallel
    const [profileResult, itemsResult] = await Promise.all([
        supabase.from("profiles").select("coins, inventory, streak_shields").eq("id", userId).single(),
        supabase.from("shop_items").select("*").order("price", { ascending: true })
    ]);

    const { data: profile } = profileResult;
    const { data: shopItems, error } = itemsResult;

    if (!profile) return null;

    // Fall back to local SHOP_ITEMS constant if the DB table is empty or errored
    const items: ShopItem[] = (shopItems && shopItems.length > 0)
        ? shopItems.map((item: any) => ({
            ...item,
            icon: null, // resolved by icon_name in shop page
        }))
        : SHOP_ITEMS;

    return {
        coins: profile.coins || 0,
        inventory: profile.inventory || [],
        streakShields: profile.streak_shields || 0,
        items,
    };
};

export const fetchUserProfile = async ([key, userId]: [string, string]) => {
    const supabase = createClient();
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('full_name, username, bio, avatar_url')
        .eq('id', userId)
        .single();

    if (error) return null;
    return profile;
};

export const fetchPracticeStats = async ([key, userId]: [string, string]) => {
    const { getPracticeStats } = await import("@/actions/practice-actions");
    return await getPracticeStats();
};

export const fetchCodeleStats = async ([key, userId]: [string, string]) => {
    const { getCodeleStats } = await import("@/actions/codele-actions");
    return await getCodeleStats();
};

export const fetchCodeleLeaderboard = async ([key]: [string]) => {
    const { getCodeleLeaderboard } = await import("@/actions/codele-actions");
    return await getCodeleLeaderboard('global');
};

export const fetchWorkspaceProjects = async ([key, userId]: [string, string]) => {
    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();

    const { data, error } = await supabase
        .from('project_members')
        .select(`
            project_id,
            projects (
                id,
                title,
                description,
                status,
                color,
                created_at
            )
        `)
        .eq('user_id', userId);

    if (error || !data) throw error;

    return data.map((item: any) => ({
        ...item.projects,
        members: 1, // Placeholder until a member count aggregation is performed
        deadline: "7 days" // Local UI placeholder
    }));
};

export const fetchWorkspaceProjectDetails = async ([key, projectId]: [string, string]) => {
    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();

    // Fetch Project Details and Tasks in parallel
    const [projectResult, tasksResult] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('project_tasks').select('*').eq('project_id', projectId).order('created_at', { ascending: true })
    ]);

    if (projectResult.error) throw projectResult.error;
    if (tasksResult.error) throw tasksResult.error;

    return {
        project: projectResult.data,
        tasks: tasksResult.data || []
    };
};

export const fetchMentorStatus = async ([key]: [string]) => {
    const { getMyMentorStatus } = await import("@/actions/mentorship-actions");
    return await getMyMentorStatus();
};

export const fetchMentorDashboardData = async ([key, userId]: [string, string]) => {
    const { getMyMentorStatus, getMySessionsAsMentor, getMyVouchCodes } = await import("@/actions/mentorship-actions");
    const [status, sessions, vouchCodes] = await Promise.all([
        getMyMentorStatus(userId),
        getMySessionsAsMentor(),
        getMyVouchCodes()
    ]);
    return { status, sessions, vouchCodes };
};

export const fetchFindMentorData = async ([key]: [string]) => {
    const { getMentors, getPublicSessions, getPublicPlaylists } = await import("@/actions/mentorship-actions");
    const [mentors, videos, playlists] = await Promise.all([
        getMentors(),
        getPublicSessions(),
        getPublicPlaylists(),
    ]);
    return { mentors, videos, playlists };
};

export const fetchMySessionsAsMentee = async ([key]: [string]) => {
    const { getMySessionsAsMentee } = await import("@/actions/mentorship-actions");
    return await getMySessionsAsMentee();
};

// ── Dashboard Widget Fetchers ──────────────────────────────────────────────

export const fetchDailyQuests = async ([key, userId]: [string, string]) => {
    const { createClient } = await import("@/utils/supabase/client");
    const { getResumeCourseSlug } = await import("@/actions/course-actions");

    const supabase = createClient();

    // Compute all 3 cycle keys upfront
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dailyKey = `daily:${now.toISOString().split('T')[0]}`;
    const monthlyKey = `monthly:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    // ISO week number calculation
    const target = new Date(now.valueOf());
    const dayNr = (now.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    const weeklyKey = `weekly:${yyyy}-W${String(weekNumber).padStart(2, '0')}`;

    // ✅ Fetch all quests, completions, chests, and cycle awards
    const [{ data: allQuests }, { data: allCompletions }, { data: allChests }, { data: allCycleAwards }, resumeSlug] = await Promise.all([
        supabase.from('quests').select('*').in('type', ['daily', 'weekly', 'monthly']).order('sort_order', { ascending: true }),
        supabase.from('daily_quest_completions').select('quest_id, auto_progress, cycle_key').eq('user_id', userId).in('cycle_key', [dailyKey, weeklyKey, monthlyKey]),
        supabase.from('user_chests').select('id').eq('user_id', userId).eq('status', 'sealed'),
        supabase.from('user_chests').select('cycle_key').eq('user_id', userId).in('cycle_key', [dailyKey, weeklyKey, monthlyKey]),
        getResumeCourseSlug()
    ]);

    const quests = allQuests || [];
    const completions = allCompletions || [];
    const chestCount = allChests?.length || 0;

    // Build fast lookup: cycleKey -> Map<questId, autoProgress>
    const completionsByCycle: Record<string, Map<string, number>> = {
        [dailyKey]: new Map(),
        [weeklyKey]: new Map(),
        [monthlyKey]: new Map(),
    };
    for (const c of completions) {
        completionsByCycle[c.cycle_key]?.set(c.quest_id, c.auto_progress);
    }

    const cycleKeyFor = { daily: dailyKey, weekly: weeklyKey, monthly: monthlyKey } as const;

    // Target amounts per quest key (mirrors QUEST_TARGETS in quest-actions.ts)
    const QUEST_TARGETS: Record<string, number> = {
        'login': 1, 'codele': 1, 'type_race': 1, 'quiz_attempt': 1, 'lesson': 1,
        'streak_7': 7, 'streak_20m': 20,
        'codele_3w': 3, 'codele_15m': 15,
        'type_race_3w': 3, 'type_race_10m': 10,
        'lessons_5w': 5, 'lessons_20m': 20,
        'quiz_3w': 3, 'quiz_10m': 10,
    };

    // Group and merge in-memory — zero extra DB calls
    const grouped: Record<'daily' | 'weekly' | 'monthly', any[]> = { daily: [], weekly: [], monthly: [] };
    for (const q of quests) {
        const type = q.type as 'daily' | 'weekly' | 'monthly';
        const map = completionsByCycle[cycleKeyFor[type]];
        const progress = map?.get(q.key) ?? 0;
        grouped[type].push({
            ...q,
            is_completed: progress === -1,
            auto_progress: Math.max(0, progress),
            target_amount: QUEST_TARGETS[q.key] ?? 1,
        });
    }

    const claimedCycleKeys = new Set((allCycleAwards || []).map(c => c.cycle_key));

    return {
        questsData: grouped,
        chestCount,
        lastCourseSlug: resumeSlug,
        claimedCycleKeys: Array.from(claimedCycleKeys)
    };
};

export const fetchHeroCourse = async ([key, userId]: [string, string]) => {
    const { getHeroCourse } = await import("@/actions/course-actions");
    return await getHeroCourse();
};

export const fetchActivityChart = async ([key, userId]: [string, string]) => {
    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const dateStr = startDate.toISOString().split('T')[0];

    const { data: logs, error } = await supabase
        .from('activity_logs')
        .select('activity_date, hours_spent, focus_area')
        .eq('user_id', userId)
        .gte('activity_date', dateStr)
        .order('activity_date', { ascending: true });

    if (!logs || error) return { chartData: [], totalTime: 0, dailyAvg: 0, focusAreas: [] };

    const aggregated: Record<string, number> = {};
    const focuses: Record<string, number> = {};
    let total = 0;

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        aggregated[d.toLocaleDateString('en-US', { weekday: 'short' })] = 0;
    }

    logs.forEach((log: any) => {
        const dayName = new Date(log.activity_date).toLocaleDateString('en-US', { weekday: 'short' });
        const hours = Number(log.hours_spent);
        if (aggregated[dayName] !== undefined) { aggregated[dayName] += hours; total += hours; }
        const area = log.focus_area || 'Other';
        focuses[area] = (focuses[area] || 0) + hours;
    });

    const chartData = Object.entries(aggregated).map(([day, hours]) => ({ day, hours }));
    const focusAreas = Object.entries(focuses)
        .map(([area, h]) => ({ area, percentage: total > 0 ? Math.round((h / total) * 100) : 0 }))
        .sort((a, b) => b.percentage - a.percentage);

    return { chartData, totalTime: total, dailyAvg: total / 7, focusAreas };
};

export const fetchTopLearners = async ([key]: [string]) => {
    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();
    const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, xp, avatar_url')
        .order('xp', { ascending: false })
        .limit(5);

    if (!data || error) return [];
    return data.map((u: any, i: number) => ({
        id: u.id,
        name: u.full_name || u.username || `Pilot_${i + 1}`,
        xp: u.xp || 0,
        rank: i + 1,
        avatar: u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name || u.username || 'P')}&background=random`,
        title: 'Skloop Pilot',
        badges: ['🔥', '✨', '💻']
    }));
};

export const fetchNextWorkshop = async ([key]: [string]) => {
    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();
    const { data, error } = await supabase
        .from('workshops')
        .select('*')
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle();
    return (!error && data) ? data : null;
};

export const fetchSealedChests = async ([key, userId]: [string, string]) => {
    const { getSealedChests } = await import("@/actions/quest-actions");
    return await getSealedChests();
};

export const fetchConversations = async ([key, userId]: [string, string]) => {
    const { getUserConversations } = await import("@/actions/chat-actions");
    return await getUserConversations();
};
