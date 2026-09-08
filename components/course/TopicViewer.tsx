"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Play, FileText, CheckCircle, Award } from "lucide-react";
import { useState } from "react";
import VideoViewer from "./viewers/VideoViewer";
import ArticleViewer from "./viewers/ArticleViewer";
import QuizViewer from "./viewers/QuizViewer";
import WebIDEChallenge from "./challenges/WebIDEChallenge";
import FlowchartChallenge from "./challenges/FlowchartChallenge";
import { createClient } from "@/utils/supabase/client";
import { useUser } from "@/context/UserContext";

interface Topic {
    id: string;
    title: string;
    type: "video" | "quiz" | "article" | "challenge";
    content_data: any;
    xp_reward: number;
}

interface TopicViewerProps {
    topic: Topic;
    onClose: () => void;
    onComplete: () => void;
}

export default function TopicViewer({ topic, onClose, onComplete }: TopicViewerProps) {
    const supabase = createClient();
    const { user } = useUser();
    const [isCompleting, setIsCompleting] = useState(false);

    const handleComplete = async () => {
        if (!user || isCompleting) return;
        setIsCompleting(true);

        try {
            const { awardTopicCompletion } = await import("@/actions/course-actions");
            const result = await awardTopicCompletion(topic.id);

            if (result.success) {
                onComplete();
                onClose();
            } else {
                console.error("Failed to complete topic:", result.error);
            }
        } catch (err) {
            console.error("Error in handleComplete:", err);
        } finally {
            setIsCompleting(false);
        }
    };

    const renderContent = () => {
        const data = topic.content_data || {};
        switch (topic.type) {
            case "video":
                return <VideoViewer videoData={data} onComplete={handleComplete} />;
            case "article":
                return <ArticleViewer markdown={data.markdown || ""} onComplete={handleComplete} />;
            case "quiz":
                return <QuizViewer quizData={data} onComplete={handleComplete} />;
            case "challenge":
                if (data.challengeType === "web-ide") {
                    return <WebIDEChallenge challengeData={data} onComplete={handleComplete} />;
                }
                if (data.challengeType === "flowchart") {
                    return <FlowchartChallenge challengeData={data} onComplete={handleComplete} />;
                }
                return (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                        <Award size={64} className="text-lime-500 mb-4" />
                        <h2 className="text-2xl font-black text-zinc-900 mb-2">Challenge Unknown</h2>
                        <p className="text-zinc-500 mb-6">Type: {data.challengeType}</p>
                        <button onClick={handleComplete} className="px-8 py-4 bg-zinc-900 text-white rounded-2xl font-bold">
                            Complete via Override
                        </button>
                    </div>
                );
            default:
                return (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                        <Award size={64} className="text-lime-500 mb-4" />
                        <h2 className="text-2xl font-black text-zinc-900 mb-2">Challenge Under Construction</h2>
                        <p className="text-zinc-500 mb-6">This challenge type ({topic.type}) is coming soon!</p>
                        <button onClick={handleComplete} className="px-8 py-4 bg-zinc-900 text-white rounded-2xl font-bold">
                            Complete via Override
                        </button>
                    </div>
                );
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white flex flex-col"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-lime-100 flex items-center justify-center text-lime-600">
                        {topic.type === "video" ? <Play size={20} /> : topic.type === "article" ? <FileText size={20} /> : <CheckCircle size={20} />}
                    </div>
                    <div>
                        <h1 className="font-black text-zinc-900 leading-tight">{topic.title}</h1>
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{topic.type} Lesson</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 transition-colors"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto bg-zinc-50/50">
                <div className="max-w-4xl mx-auto w-full h-full">
                    {renderContent()}
                </div>
            </div>
        </motion.div>
    );
}
