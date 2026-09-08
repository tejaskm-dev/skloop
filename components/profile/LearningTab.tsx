"use client";

import { motion } from "framer-motion";
import { Play, CheckCircle2, Lock, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { getUserCourses } from "@/actions/course-actions";

interface UserCourse {
    courseId: string;
    title: string;
    completedLessons: number;
    totalLessons: number;
    slug: string;
    isActive: boolean;
}

export function LearningTab() {
    const { user } = useUser();
    const [courses, setCourses] = useState<UserCourse[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        const fetchCourses = async () => {
            const data = await getUserCourses();

            if (data) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const mapped: UserCourse[] = data.map((row: any) => ({
                    courseId: row.course_id,
                    title: row.courses?.title ?? "Untitled",
                    slug: row.courses?.slug ?? row.course_id,
                    completedLessons: row.completed_lessons ?? 0,
                    totalLessons: row.courses?.total_lessons ?? 1,
                    isActive: row.is_pinned ?? false,
                }));
                setCourses(mapped);
            }
            setIsLoading(false);
        };

        fetchCourses();
    }, [user]);

    const activeCourse = courses.find((c) => c.isActive) ?? courses[0] ?? null;
    const otherCourses = courses.filter((c) => c !== activeCourse);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
        );
    }

    if (courses.length === 0) {
        return (
            <div className="space-y-8">
                <div className="flex flex-col items-center justify-center text-center bg-white rounded-[2.5rem] p-12 border border-gray-100 shadow-sm">
                    <div className="text-5xl mb-4">📚</div>
                    <h3 className="font-black text-xl mb-2">No Courses Yet</h3>
                    <p className="text-gray-400 font-medium mb-6">Enroll in a course to track your progress here.</p>
                    <Link href="/dashboard" className="inline-flex items-center bg-black text-white rounded-xl font-bold px-6 py-3 hover:bg-zinc-800 transition-colors">
                        Browse Courses
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Active / Featured Course Card */}
                {activeCourse && (() => {
                    const progress = activeCourse.totalLessons > 0
                        ? Math.round((activeCourse.completedLessons / activeCourse.totalLessons) * 100)
                        : 0;
                    return (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="md:col-span-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[2.5rem] p-8 text-white relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
                            <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start md:items-center justify-between">
                                <div>
                                    <div className="inline-block px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
                                        In Progress
                                    </div>
                                    <h2 className="text-3xl font-black mb-2">{activeCourse.title}</h2>
                                    <p className="text-indigo-100 font-medium max-w-lg mb-6">
                                        {activeCourse.completedLessons}/{activeCourse.totalLessons} lessons completed
                                    </p>
                                    <div className="flex items-center gap-4 mb-2">
                                        <div className="flex-1 h-3 w-48 bg-black/20 rounded-full overflow-hidden">
                                            <div className="h-full bg-[#D4F268]" style={{ width: `${progress}%` }} />
                                        </div>
                                        <span className="font-bold text-sm">{progress}% Complete</span>
                                    </div>
                                </div>
                                <Link
                                    href={`/course/${activeCourse.slug}`}
                                    className="h-16 w-16 rounded-full bg-white text-indigo-600 hover:bg-indigo-50 hover:scale-110 transition-all shadow-xl flex items-center justify-center shrink-0"
                                >
                                    <Play size={24} fill="currentColor" className="ml-1" />
                                </Link>
                            </div>
                        </motion.div>
                    );
                })()}
            </div>

            {otherCourses.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <h3 className="font-black text-xl px-2">Your Courses</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {otherCourses.slice(0, 3).map((course) => {
                                const progress = course.totalLessons > 0
                                    ? Math.round((course.completedLessons / course.totalLessons) * 100)
                                    : 0;
                                const completed = progress === 100;
                                return (
                                    <CourseCard
                                        key={course.courseId}
                                        title={course.title}
                                        progress={progress}
                                        completed={completed}
                                        color="bg-indigo-500"
                                        href={`/course/${course.slug}`}
                                    />
                                );
                            })}
                            <Link href="/dashboard" className="border-2 border-dashed border-gray-200 rounded-[2rem] p-6 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors cursor-pointer min-h-[180px]">
                                <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3 text-gray-400">
                                    <span className="text-2xl font-light">+</span>
                                </div>
                                <p className="font-bold text-gray-500">Explore New Courses</p>
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

interface CourseCardProps {
    title: string;
    progress: number;
    color: string;
    completed?: boolean;
    locked?: boolean;
    href?: string;
}

function CourseCard({ title, progress, color, completed, locked, href }: CourseCardProps) {
    const inner = (
        <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm relative group overflow-hidden hover:shadow-md transition-all h-full">
            <div className={`h-24 w-24 rounded-full ${color} absolute -top-12 -right-12 opacity-20 group-hover:scale-150 transition-transform duration-500`} />
            <div className="flex justify-between items-start mb-8 relative z-10">
                <div className={`h-10 w-10 rounded-xl ${color} flex items-center justify-center text-white font-bold`}>
                    {title[0]}
                </div>
                {completed ? (
                    <div className="text-emerald-500"><CheckCircle2 size={20} /></div>
                ) : locked ? (
                    <div className="text-gray-300"><Lock size={20} /></div>
                ) : (
                    <div className="text-xs font-black text-gray-400">{progress}%</div>
                )}
            </div>
            <h4 className="font-black text-lg mb-4 relative z-10">{title}</h4>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full ${completed ? "bg-emerald-500" : "bg-black"}`}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );

    return href ? <Link href={href} className="block">{inner}</Link> : inner;
}
