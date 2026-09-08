"use client";

import { ActivityHeatmap } from "../charts/ActivityHeatmap";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useUser } from "@/context/UserContext";
import { getUserCourses } from "@/actions/course-actions";
import { BookOpen, Zap, Award, TrendingUp, Target } from "lucide-react";

interface TopicCategory {
    label: string;
    count: number;
    completed: number;
    color: string;
    icon: any;
}

export function StatsModule() {
    const { user } = useUser();
    const [courses, setCourses] = useState<{ name: string, progress: number, color: string }[]>([
        { name: "No courses started", progress: 0, color: "bg-gray-300" }
    ]);
    const [categories, setCategories] = useState<TopicCategory[]>([]);
    const [totalCompleted, setTotalCompleted] = useState(0);
    const [totalTopics, setTotalTopics] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            if (!user) {
                setIsLoading(false);
                return;
            }

            const supabase = createClient();

            // Fetch courses
            const courseData = await getUserCourses();
            if (courseData && courseData.length > 0) {
                const colors = ["bg-blue-500", "bg-purple-500", "bg-orange-500", "bg-emerald-500"];
                const formattedCourses = courseData.slice(0, 4).map((uc: any, index: number) => {
                    const total = uc.courses.total_lessons || 1;
                    const progress = Math.round((uc.completed_lessons / total) * 100);
                    return {
                        name: uc.courses.title,
                        progress: Math.min(progress, 100),
                        color: colors[index % colors.length]
                    };
                });
                setCourses(formattedCourses);
            }

            // Fetch topic progress grouped by type
            const { data: progressData } = await supabase
                .from('user_topic_progress')
                .select(`
                    topic_id, status,
                    topics (
                        id, type
                    )
                `)
                .eq('user_id', user.id)
                .eq('status', 'completed');

            if (progressData && progressData.length > 0) {
                // Count by topic type
                const typeCounts: Record<string, number> = {};
                progressData.forEach((p: any) => {
                    const type = p.topics?.type || 'other';
                    typeCounts[type] = (typeCounts[type] || 0) + 1;
                });

                // Fetch total topics per type for comparison
                const { data: allTopics } = await supabase
                    .from('topics')
                    .select('type');

                const totalByType: Record<string, number> = {};
                (allTopics || []).forEach((t: any) => {
                    totalByType[t.type] = (totalByType[t.type] || 0) + 1;
                });

                const categoryConfig: Record<string, { label: string; color: string; icon: any }> = {
                    article: { label: "Articles", color: "bg-blue-500", icon: BookOpen },
                    video: { label: "Videos", color: "bg-purple-500", icon: Zap },
                    quiz: { label: "Quizzes", color: "bg-amber-500", icon: Target },
                    challenge: { label: "Challenges", color: "bg-lime-500", icon: Award },
                };

                const cats: TopicCategory[] = Object.entries(categoryConfig).map(([type, cfg]) => ({
                    label: cfg.label,
                    count: totalByType[type] || 0,
                    completed: typeCounts[type] || 0,
                    color: cfg.color,
                    icon: cfg.icon,
                })).filter(c => c.count > 0);

                setCategories(cats);
                setTotalCompleted(progressData.length);
                setTotalTopics((allTopics || []).length);
            }

            setIsLoading(false);
        };
        fetchStats();
    }, [user]);

    const overallProgress = totalTopics > 0 ? Math.round((totalCompleted / totalTopics) * 100) : 0;

    return (
        <div className="space-y-8">
            <h2 className="text-2xl font-bold tracking-tight">Skill Breakdown</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Overall Progress Summary */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-5">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-800">Learning Progress</h3>
                        <span className="text-2xl font-black text-slate-900">{overallProgress}%</span>
                    </div>

                    {/* Overall bar */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-slate-500 font-medium">
                            <span>{totalCompleted} topics completed</span>
                            <span>{totalTopics} total</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: `${overallProgress}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className="h-full rounded-full bg-gradient-to-r from-lime-400 to-emerald-500"
                            />
                        </div>
                    </div>

                    {/* Per-category breakdown */}
                    {isLoading ? (
                        <div className="animate-pulse space-y-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-slate-100 rounded-xl" />
                                    <div className="flex-1 h-8 bg-slate-100 rounded-xl" />
                                </div>
                            ))}
                        </div>
                    ) : categories.length > 0 ? (
                        <div className="space-y-3">
                            {categories.map((cat, i) => {
                                const Icon = cat.icon;
                                const pct = cat.count > 0 ? Math.round((cat.completed / cat.count) * 100) : 0;
                                return (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white ${cat.color} flex-shrink-0`}>
                                            <Icon size={14} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                                                <span>{cat.label}</span>
                                                <span>{cat.completed}/{cat.count}</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    whileInView={{ width: `${pct}%` }}
                                                    transition={{ duration: 0.8, delay: i * 0.1 }}
                                                    className={`h-full rounded-full ${cat.color}`}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-6 text-center text-slate-400 text-sm">
                            <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
                            <p>Complete topics to see your breakdown here.</p>
                        </div>
                    )}
                </div>

                {/* Course Progression */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                    <h3 className="font-bold">Course Progression</h3>
                    {isLoading ? (
                        <div className="animate-pulse space-y-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="space-y-2">
                                    <div className="w-1/2 h-4 bg-gray-200 rounded"></div>
                                    <div className="w-full h-2 bg-gray-100 rounded-full"></div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        courses.map((course, i) => (
                            <div key={i} className="space-y-2">
                                <div className="flex justify-between text-sm font-medium">
                                    <span className="truncate mr-2">{course.name}</span>
                                    <span className="flex-shrink-0">{course.progress}%</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        whileInView={{ width: `${course.progress}%` }}
                                        transition={{ duration: 0.8, delay: i * 0.1 }}
                                        className={`h-full rounded-full ${course.color}`}
                                    />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="pt-4">
                <h2 className="text-2xl font-bold tracking-tight mb-6">Learning Activity</h2>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
                    <ActivityHeatmap />
                </div>
            </div>
        </div>
    );
}
