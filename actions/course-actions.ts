"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Fetches the primary course or track for the user's dashboard hero
 */
export async function getHeroCourse() {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        const userId = user.id;

        // 1. Check for started courses
        const { data, error } = await supabase
            .from('user_courses')
            .select(`
                completed_lessons,
                courses (
                    title,
                    slug,
                    description,
                    total_lessons
                )
            `)
            .eq('user_id', userId)
            .order('last_accessed', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error("Error fetching user_courses:", error.message);
        }

        if (data && !error) {
            const courseData = Array.isArray(data.courses) ? data.courses[0] : data.courses as any;
            if (courseData) {
                // Fetch lessons to find the next one
                const { data: lessons } = await supabase
                    .from('lessons')
                    .select('id, title, order_index')
                    .eq('course_id', courseData.id)
                    .order('order_index', { ascending: true });

                let nextLessonTitle = "Start Learning";
                let nextLessonId = null;

                if (lessons && lessons.length > 0) {
                    const { data: progress } = await supabase
                        .from('user_lesson_progress')
                        .select('lesson_id')
                        .eq('user_id', userId)
                        .eq('status', 'completed');

                    const completedSet = new Set(progress?.map(p => p.lesson_id) || []);
                    const uncompleted = lessons.find(l => !completedSet.has(l.id));

                    if (uncompleted) {
                        nextLessonTitle = uncompleted.title;
                        nextLessonId = uncompleted.id;
                    } else {
                        nextLessonTitle = "Course Completed";
                        nextLessonId = lessons[lessons.length - 1].id;
                    }
                }

                return {
                    title: courseData.title,
                    description: courseData.description,
                    slug: courseData.slug,
                    completedLessons: data.completed_lessons,
                    totalLessons: courseData.total_lessons,
                    type: 'course',
                    nextLessonTitle,
                    nextLessonId
                };
            }
        }

        // 2. Fallback to check tracks system
        const { data: trackData, error: trackError } = await supabase
            .from('tracks')
            .select('id, title, slug, description')
            .order('order_index', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (trackError) {
            console.error("Error fetching tracks (fallback):", trackError.message);
        }

        if (trackData && !trackError) {
            // Fetch modules for this track
            const { data: modules } = await supabase
                .from('modules')
                .select('id')
                .eq('track_id', trackData.id);

            const moduleIds = modules?.map(m => m.id) || [];

            let totalLessons = 0;
            let completedLessons = 0;
            let nextLessonTitle = "Start Learning";
            let nextLessonId = null;

            if (moduleIds.length > 0) {
                const { data: topics } = await supabase
                    .from('topics')
                    .select('id, title, order_index, module_id')
                    .in('module_id', moduleIds)
                    .order('module_id', { ascending: true })
                    .order('order_index', { ascending: true });

                if (topics) {
                    totalLessons = topics.length;

                    // Get user completed topics
                    const { data: progress } = await supabase
                        .from('user_topic_progress')
                        .select('topic_id')
                        .eq('user_id', userId)
                        .eq('status', 'completed');

                    const completedSet = new Set(progress?.map(p => p.topic_id) || []);
                    completedLessons = topics.filter(t => completedSet.has(t.id)).length;

                    // Find next lesson
                    const uncompleted = topics.find(t => !completedSet.has(t.id));
                    if (uncompleted) {
                        nextLessonTitle = uncompleted.title;
                        nextLessonId = uncompleted.id;
                    } else if (topics.length > 0) {
                        nextLessonTitle = "Track Completed";
                        nextLessonId = topics[topics.length - 1].id;
                    }
                }
            }

            return {
                title: trackData.title,
                description: trackData.description,
                slug: trackData.slug,
                completedLessons,
                totalLessons,
                type: 'track',
                nextLessonTitle,
                nextLessonId
            };
        }
    } catch (err: any) {
        console.error("Critical error in getHeroCourse:", err.message);
    }

    return null;
}

/**
 * Fetches all courses started by a user
 */
export async function getUserCourses() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const userId = user.id;

    const { data, error } = await supabase
        .from("user_courses")
        .select(`
            course_id,
            completed_lessons,
            is_pinned,
            courses (
                id,
                title,
                slug,
                total_lessons
            )
        `)
        .eq("user_id", userId)
        .order("last_accessed", { ascending: false });

    if (error) return [];
    return data || [];
}

/**
 * Intelligently finds the most relevant unfinished course or track slug to resume.
 */
export async function getResumeCourseSlug(): Promise<string | null> {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const userId = user.id;


    // 1. Check user_courses for an unfinished course
    const { data: userCourses } = await supabase
        .from('user_courses')
        .select('completed_lessons, courses (slug, total_lessons)')
        .eq('user_id', userId)
        .order('last_accessed', { ascending: false });

    if (userCourses && userCourses.length > 0) {
        for (const uc of userCourses) {
            const course = Array.isArray(uc.courses) ? uc.courses[0] : uc.courses as any;
            if (course && uc.completed_lessons < (course.total_lessons || 1)) {
                return course.slug;
            }
        }
    }

    // 2. Check tracks ordered by sequence
    const { data: tracks } = await supabase
        .from('tracks')
        .select('id, slug, title')
        .order('order_index', { ascending: true });

    if (!tracks || tracks.length === 0) return null;

    // Get user's completed topics
    const { data: completedTopics } = await supabase
        .from('user_topic_progress')
        .select('topic_id')
        .eq('user_id', userId)
        .eq('status', 'completed');

    const completedTopicIds = new Set(completedTopics?.map(t => t.topic_id) || []);

    // Map topics to tracks.
    //
    // This used to pull the ENTIRE modules and topics tables (no filter, no
    // limit) on every dashboard load, then do `modules.find()` inside a loop
    // over topics — O(topics x modules). Joining topics -> modules in one query
    // lets Postgres do the work, and a Map makes the grouping linear.
    const { data: topicRows } = await supabase
        .from('topics')
        .select('id, modules!inner(track_id)');

    const trackTopics: Record<string, string[]> = {};
    for (const t of (topicRows ?? []) as any[]) {
        const mod = Array.isArray(t.modules) ? t.modules[0] : t.modules;
        const trackId = mod?.track_id;
        if (!trackId) continue;
        (trackTopics[trackId] ||= []).push(t.id);
    }

    // Find the first track that is NOT fully completed
    for (const track of tracks) {
        const topicIds = trackTopics[track.id] || [];
        if (topicIds.length === 0) continue; // Skip empty tracks

        const allCompleted = topicIds.length > 0 && topicIds.every(id => completedTopicIds.has(id));
        if (!allCompleted) {
            return track.slug;
        }
    }

    // 3. Fallback to the first track
    return tracks[0]?.slug || null;
}

/**
 * Marks a topic as completed, enforcing sequential progression, and awards XP/Coins.
 */
export async function awardTopicCompletion(topicId: string) {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Unauthorized' };
    const userId = user.id;

    // 1. Fetch current topic
    const { data: topic, error: topicError } = await supabase
        .from('topics')
        .select('module_id, order_index, xp_reward')
        .eq('id', topicId)
        .single();

    if (topicError || !topic) {
        return { success: false, error: 'Topic not found.' };
    }

    // 2. Enforce Sequential Progression
    const { data: moduleTopics } = await supabase
        .from('topics')
        .select('id, order_index')
        .eq('module_id', topic.module_id)
        .order('order_index', { ascending: true });

    if (!moduleTopics) return { success: false, error: 'Module topics not found.' };

    const topicIds = moduleTopics.map(t => t.id);

    const { data: completedProgress } = await supabase
        .from('user_topic_progress')
        .select('topic_id')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .in('topic_id', topicIds);

    const completedSet = new Set(completedProgress?.map(c => c.topic_id) || []);

    // Check if previous topics are completed
    const { data: profileCheck } = await supabase.from('profiles').select('is_mentor').eq('id', userId).single();
    const isMentor = profileCheck?.is_mentor === true;

    if (!isMentor) {
        for (const mt of moduleTopics) {
            if (mt.id === topicId) break; // Reached the current topic
            if (!completedSet.has(mt.id)) {
                return { success: false, error: 'Please complete the prerequisite topics first.' };
            }
        }
    }

    // If already completed, just return
    if (completedSet.has(topicId)) {
        return { success: true, message: 'Already completed.', xpAwarded: 0, coinsAwarded: 0 };
    }

    // 3. Mark as Complete
    await supabase
        .from('user_topic_progress')
        .upsert({
            user_id: userId,
            topic_id: topicId,
            status: 'completed',
            completed_at: new Date().toISOString()
        }, { onConflict: 'user_id, topic_id' });

    completedSet.add(topicId);

    // 4. Calculate Rewards
    let xpToAward = 10;
    let coinsToAward = 5;
    let moduleCompleted = false;

    // Check if the entire module is now complete
    const allModuleCompleted = moduleTopics.every(mt => completedSet.has(mt.id));
    if (allModuleCompleted) {
        xpToAward += 100;
        coinsToAward += 50;
        moduleCompleted = true;
    }

    // 5. Update Profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('xp, coins, active_powers')
        .eq('id', userId)
        .single();

    if (profile) {
        // Apply multipliers from active_powers
        const now = new Date().toISOString();
        const powers = profile.active_powers || {};

        let finalXpReward = xpToAward;
        let finalCoinsReward = coinsToAward;

        // XP Multiplier
        if (powers.xp_multiplier && powers.xp_expires && powers.xp_expires > now) {
            finalXpReward = Math.round(xpToAward * powers.xp_multiplier);
        }

        // Coins Multiplier
        if (powers.coins_multiplier && powers.coins_expires && powers.coins_expires > now) {
            finalCoinsReward = Math.round(coinsToAward * powers.coins_multiplier);
        }

        const newXp = (profile.xp || 0) + finalXpReward;
        const newCoins = (profile.coins || 0) + finalCoinsReward;
        const newLevel = Math.floor(newXp / 500) + 1; // Basic level formula

        await supabase
            .from('profiles')
            .update({ xp: newXp, coins: newCoins, level: newLevel })
            .eq('id', userId);

        // Update returned values for UI feedback
        xpToAward = finalXpReward;
        coinsToAward = finalCoinsReward;
    }

    return {
        success: true,
        xpAwarded: xpToAward,
        coinsAwarded: coinsToAward,
        moduleCompleted
    };
}
