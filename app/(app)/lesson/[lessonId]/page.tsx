"use client";

import { use, useState } from "react";
import LessonLayout from "@/components/lesson/LessonLayout";
import VideoView from "@/components/lesson/VideoView";
import ArticleView from "@/components/lesson/ArticleView";
import QuizView from "@/components/lesson/QuizView";
import ChallengeView from "@/components/lesson/ChallengeView";
import FlowchartBuilder from "@/components/lesson/FlowchartBuilder";
import { useRouter } from "next/navigation";
import { claimDailyQuest } from "@/actions/task-actions";
import useSWR from "swr";
import { fetchLesson } from "@/lib/swr-fetchers";
import { createClient } from "@/utils/supabase/client";
import LessonComplete from "@/components/lesson/LessonComplete";
import { GameOverScreen } from "@/components/lesson/GameOverScreen";

export default function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
    const { lessonId } = use(params);
    const router = useRouter();

    const { data: lesson, isLoading } = useSWR(
        lessonId ? ['lesson', lessonId] : null,
        fetchLesson as any
    );

    const [hearts, setHearts] = useState(3);
    const [currentStep, setCurrentStep] = useState(0);
    const [totalSteps, setTotalSteps] = useState(1);
    const [showComplete, setShowComplete] = useState(false);
    const [xpAwarded, setXpAwarded] = useState(0);

    if (isLoading || !lesson) return (
        <div className="min-h-screen bg-[#FDFCF8] flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-4 border-lime-400 border-t-transparent animate-spin" />
        </div>
    );

    const handleComplete = async () => {
        console.log("Lesson Completed:", lesson.id);

        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                // Determine if it was a Topic or a Lesson from the older structure
                if (lesson.type === "video" || lesson.type === "article" || lesson.type === "quiz" || lesson.type === "challenge" || lesson.type === "flowchart") {

                    const { awardTopicCompletion } = await import("@/actions/course-actions");
                    const result = await awardTopicCompletion(lesson.id);

                    if (!result.success) {
                        alert(result.error || "Cannot complete this topic yet.");
                        return; 
                    }

                    if (result.xpAwarded && result.xpAwarded > 0) {
                        setXpAwarded(result.xpAwarded);
                        console.log(`Awarded ${result.xpAwarded} XP!`);
                    } else {
                        setXpAwarded(20);
                    }
                }

                // Fallback for older specific Lessons (Course Lesson)
                if (lesson.moduleTitle === "Course Lesson") {
                    await supabase
                        .from("user_lesson_progress")
                        .upsert({
                            user_id: user.id,
                            lesson_id: lesson.id,
                            status: "completed",
                            completed_at: new Date().toISOString()
                        }, { onConflict: "user_id, lesson_id" });
                }
            }
        } catch (err) {
            console.error("Failed to mark complete:", err);
            setXpAwarded(20);
        } finally {
            // Also log lesson completion quest background process
            try {
                const supabase = createClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    await claimDailyQuest('lesson').catch(err => console.error("Failed to log lesson quest", err));
                }
            } catch (ignore) { }

            setShowComplete(true);
        }
    };

    if (showComplete) {
        return (
            <LessonComplete 
                xpEarned={xpAwarded} 
                isPerfect={hearts === 3} 
                topicTitle={lesson.title}
                onContinue={() => router.push(`/course/${lesson.trackSlug || 'web-development'}`)}
            />
        );
    }

    if (hearts <= 0) {
        return (
            <GameOverScreen 
                onRetry={() => {
                    setHearts(3);
                    setCurrentStep(0);
                }} 
            />
        );
    }

    return (
        <LessonLayout
            title={lesson.title}
            type={lesson.type}
            moduleTitle={lesson.moduleTitle}
            onComplete={handleComplete}
            trackSlug={lesson.trackSlug}
            hearts={(lesson.type === "quiz" || lesson.type === "challenge" || lesson.type === "video") ? hearts : undefined}
            maxHearts={3}
            currentStep={currentStep}
            totalSteps={totalSteps}
        >
            {lesson.type === "video" && (
                <VideoView
                    videoUrl={lesson.videoUrl}
                    summary={lesson.summary}
                    duration={lesson.duration}
                    miniQuiz={lesson.miniQuiz}
                    onComplete={handleComplete}
                    hearts={hearts}
                    onHeartLost={() => setHearts(prev => Math.max(0, prev - 1))}
                />
            )}

            {lesson.type === "article" && (
                <ArticleView
                    content={lesson.content}
                    readTime={lesson.readTime}
                    onComplete={handleComplete}
                />
            )}

            {lesson.type === "quiz" && (
                <QuizView
                    questions={lesson.questions}
                    onComplete={handleComplete}
                    hearts={hearts}
                    onHeartLost={() => setHearts(prev => Math.max(0, prev - 1))}
                    onProgress={(curr, total) => {
                        setCurrentStep(curr);
                        setTotalSteps(total);
                    }}
                    onRetry={() => {
                        setHearts(3);
                        setCurrentStep(0);
                    }}
                />
            )}

            {lesson.type === "challenge" && (
                <ChallengeView
                    title={lesson.title}
                    description={lesson.description}
                    requirements={lesson.requirements}
                    hints={lesson.hints}
                    initialCode={lesson.initialCode}
                    mode={lesson.mode || 'web'}
                    validationRules={lesson.validationRules}
                    onComplete={handleComplete}
                    hearts={hearts}
                    onHeartLost={() => setHearts(prev => Math.max(0, prev - 1))}
                />
            )}

            {lesson.type === "flowchart" && (
                <div className="h-[calc(100vh-3.5rem)]">
                    <FlowchartBuilder
                        task={lesson.flowchartTask}
                        requiredNodes={lesson.requiredNodes}
                        validation={lesson.validation}
                        onComplete={handleComplete}
                    />
                </div>
            )}
        </LessonLayout>
    );
}
