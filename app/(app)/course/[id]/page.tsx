"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import FocusTrackHeader from "@/components/course/FocusTrackHeader";
import FocusModule from "@/components/course/FocusModule";
import StickyContinueButton from "@/components/course/StickyContinueButton";
import useSWR from "swr";
import { fetchCourseTrack } from "@/lib/swr-fetchers";
import { useUser } from "@/context/UserContext";

interface Lesson {
    id: string;
    title: string;
    order_index: number;
    isCompleted: boolean;
    type: "article" | "video" | "quiz" | "challenge";
    duration: string;
    isLocked: boolean;
}

interface Module {
    id: number;
    title: string;
    description: string;
    lessons: Lesson[];
    status: "locked" | "in-progress" | "completed";
}

interface CourseData {
    title: string;
    progress: number;
    totalModules: number;
    completedModules: number;
    currentLesson: { id: string; title: string };
}

export default function CoursePage() {
    const params = useParams();
    const router = useRouter();
    const courseId = params.id as string;

    const { user } = useUser();

    // Fetch Course Track mapping via centralized SWR fetcher
    const { data: swrData, isLoading: isSwrLoading } = useSWR(
        user && courseId ? ['course', courseId, user.id] : null,
        fetchCourseTrack as any
    );

    const [activeModuleId, setActiveModuleId] = useState<number>(0);
    // hasMounted prevents hydration mismatch: SWRProvider restores localStorage cache on
    // the client instantly, so the client may render full content while the server rendered
    // a spinner. By gating on hasMounted, both server and client initial renders are identical.
    const [hasMounted, setHasMounted] = useState(false);
    useEffect(() => setHasMounted(true), []);

    // Sync initial activeModuleId into local state for manual toggling
    useEffect(() => {
        if (swrData?.activeModuleId && !activeModuleId) {
            setActiveModuleId(swrData.activeModuleId);
        }
    }, [swrData, activeModuleId]);

    const trackData = swrData?.trackData || null;
    const modules = swrData?.modules || [];
    const isLoading = !hasMounted || isSwrLoading || (!!courseId && !!user && !swrData);

    const handleModuleClick = (id: number) => {
        setActiveModuleId((prev) => (prev === id ? 0 : id));
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#FDFCF8] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
        );
    }

    if (!trackData) {
        return (
            <div className="min-h-screen bg-[#FDFCF8] flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-2">Course Unavailable</h2>
                    <p className="text-zinc-500">This course content is not currently available.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FDFCF8] text-zinc-900 pb-32 relative overflow-hidden">
            {/* Background Ambient Layers */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 opacity-[0.04] mix-blend-multiply bg-[url('/noise.png')]" />
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 0.4, scale: 1, x: [0, 20, 0], y: [0, -20, 0] }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-lime-200/30 blur-[120px] mix-blend-multiply"
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 0.3, scale: 1, x: [0, -30, 0], y: [0, 30, 0] }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-zinc-200/50 blur-[100px] mix-blend-multiply"
                />
            </div>

            <div className="max-w-3xl mx-auto px-6 relative z-10">
                <FocusTrackHeader
                    title={trackData.title}
                    progress={trackData.progress}
                    totalModules={trackData.totalModules}
                    completedModules={trackData.completedModules}
                />

                <motion.div layout className="space-y-4">
                    <AnimatePresence initial={false}>
                        {modules.map((module: Module) => (
                            <FocusModule
                                key={module.id}
                                moduleNumber={module.id}
                                title={module.title}
                                description={module.description}
                                lessons={module.lessons}
                                status={module.status}
                                isActive={activeModuleId === module.id}
                                onClick={() => handleModuleClick(module.id)}
                            />
                        ))}
                    </AnimatePresence>
                </motion.div>
            </div>

            <StickyContinueButton
                lessonTitle={trackData.currentLesson.title}
                onClick={() => {
                    if (trackData.currentLesson.id) {
                        router.push(`/lesson/${trackData.currentLesson.id}`);
                    }
                }}
            />
        </div>
    );
}
