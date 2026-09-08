"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CheckCircle, AlertCircle, ChevronRight, Calculator, Code, Users, Timer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Mock Questions
// NOTE: the answer key deliberately does NOT live here. Grading happens in
// the grant_mentor_via_test() RPC so the quiz can't be beaten by reading
// the client bundle.
const QUESTIONS = [
    {
        id: 1,
        type: "soft",
        question: "A mentee is struggling with imposter syndrome and wants to quit. What is your first step?",
        options: [
            "Tell them to toughen up, it's part of the industry.",
            "Share your own experiences with failure and validate their feelings.",
            "Review their code immediately to find the problem.",
            "Suggest they take a month off."
        ],
    },
    {
        id: 2,
        type: "technical",
        question: "Which of the following best describes the 'Single Responsibility Principle'?",
        options: [
            "A function should have only one reason to change.",
            "Every function should have only one line of code.",
            "A developer should only know one programming language.",
            "One server should handle all requests."
        ],
    },
    {
        id: 3,
        type: "scenario",
        question: "Your mentee asks for the solution to a homework assignment. How do you respond?",
        options: [
            "Give them the code directly to save time.",
            "Refuse to help.",
            "Guide them through the problem-solving process without typing the code.",
            "Do it for them this one time."
        ],
    },
    {
        id: 4,
        type: "soft",
        question: "How do you handle a mentee who is consistently late to sessions?",
        options: [
            "Ghost them.",
            "Set clear boundaries and explain the value of mutual respect for time.",
            "Wait patiently every time.",
            "Report them to the admin immediately."
        ],
    }
];

function MentorTestContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const path = searchParams.get("path"); // 'veteran' or 'vouch'

    const [currentStep, setCurrentStep] = useState(path === "vouch" ? -1 : 0);
    const [answers, setAnswers] = useState<number[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<"pass" | "fail" | null>(null);
    const [vouchCode, setVouchCode] = useState("");
    const [vouchError, setVouchError] = useState("");

    const handleAnswer = (optionIndex: number) => {
        const newAnswers = [...answers, optionIndex];
        setAnswers(newAnswers);

        if (currentStep < QUESTIONS.length) {
            setCurrentStep(prev => prev + 1);
        } else {
            submitTest(newAnswers);
        }
    };

    const submitVouchCode = () => {
        if (vouchCode.toLowerCase() === "skloop2024" || vouchCode.length > 3) {
            setVouchError("");
            setCurrentStep(0); // Go to Intro
        } else {
            setVouchError("Invalid code. Try 'SKLOOP2024'");
        }
    };

    const submitTest = async (finalAnswers: number[]) => {
        setIsSubmitting(true);
        setCurrentStep(prev => prev + 1); // Loading state

        // Grading and the mentor grant both happen server-side. The answer key
        // is no longer in the client bundle, and the browser can no longer
        // write is_mentor.
        try {
            const { submitMentorTest } = await import("@/actions/mentorship-actions");
            const res = await submitMentorTest(finalAnswers);

            setResult(res.success && res.passed ? "pass" : "fail");
        } catch (err) {
            console.error("Failed to submit mentor test:", err);
            setResult("fail");
        }
        setIsSubmitting(false);
    };

    // Render Vouch Entry Screen (Step -1)
    if (currentStep === -1) {
        return (
            <div className="min-h-full bg-zinc-50 flex flex-col p-6 items-center justify-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-md w-full bg-white p-8 rounded-[2.5rem] shadow-xl border border-zinc-100 text-center"
                >
                    <div className="w-16 h-16 rounded-2xl bg-[#D4F268] flex items-center justify-center mx-auto mb-6">
                        <Users size={32} className="text-black" />
                    </div>
                    <h1 className="text-3xl font-black text-zinc-900 mb-2">Have a Code?</h1>
                    <p className="text-zinc-500 font-medium mb-8">
                        Enter your referral code to unlock the Prodigy path.
                    </p>

                    <div className="space-y-4">
                        <input
                            type="text"
                            value={vouchCode}
                            onChange={(e) => setVouchCode(e.target.value.toUpperCase())}
                            placeholder="ENTER CODE"
                            className="w-full h-14 text-center text-xl font-black tracking-widest bg-zinc-50 border border-zinc-200 rounded-2xl outline-none focus:ring-2 focus:ring-zinc-900 uppercase placeholder:text-zinc-300 transition-all"
                            autoFocus
                        />
                        {vouchError && <p className="text-red-500 font-bold text-sm bg-red-50 p-2 rounded-lg">{vouchError}</p>}

                        <Button
                            onClick={submitVouchCode}
                            className="w-full h-14 rounded-2xl bg-zinc-900 text-white hover:bg-[#D4F268] hover:text-black font-bold text-lg transition-all"
                        >
                            Validate Code
                        </Button>
                        <Button
                            onClick={() => router.back()}
                            variant="ghost"
                            className="w-full text-zinc-400 hover:text-zinc-600 font-bold"
                        >
                            Cancel
                        </Button>
                    </div>
                </motion.div>
            </div>
        );
    }

    // Render Intro
    if (currentStep === 0) {
        return (
            <div className="min-h-full bg-zinc-50 flex flex-col p-6">
                <div className="max-w-xl mx-auto w-full pt-10 md:pt-20">
                    <Button onClick={() => router.back()} variant="ghost" className="mb-8 pl-0 text-zinc-500 hover:text-black">
                        <ArrowLeft className="mr-2" size={20} /> Back
                    </Button>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-zinc-200/50 border border-white"
                    >
                        <div className="w-16 h-16 rounded-2xl bg-[#D4F268] flex items-center justify-center mb-6">
                            <Code size={32} className="text-black" />
                        </div>

                        <h1 className="text-3xl md:text-4xl font-black text-zinc-900 mb-4 tracking-tight">
                            Mentor Qualification
                        </h1>
                        <p className="text-zinc-500 font-medium text-lg mb-8 leading-relaxed">
                            You chose the <span className="text-zinc-900 font-bold uppercase mx-1">{path === "vouch" ? "Prodigy" : "Veteran"}</span> path.
                            To ensure high-quality mentorship, we need to verify your soft skills and ethical judgment.
                        </p>

                        <div className="space-y-4 mb-10 bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
                            <div className="flex items-center gap-3">
                                <Users size={20} className="text-zinc-400" />
                                <span className="font-bold text-zinc-700">4 Scenarios</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Timer size={20} className="text-zinc-400" />
                                <span className="font-bold text-zinc-700">Estimated time: 2 mins</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <CheckCircle size={20} className="text-zinc-400" />
                                <span className="font-bold text-zinc-700">Passing score: 75%</span>
                            </div>
                        </div>

                        <Button
                            onClick={() => setCurrentStep(1)}
                            className="w-full h-14 rounded-2xl bg-zinc-900 text-white hover:bg-[#D4F268] hover:text-black font-bold text-lg shadow-lg hover:shadow-[#D4F268]/20 transition-all"
                        >
                            Start Quiz
                        </Button>
                    </motion.div>
                </div>
            </div>
        );
    }

    // Render Result
    if (result) {
        return (
            <div className="min-h-full bg-zinc-900 flex flex-col items-center justify-center p-6 text-center">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="max-w-md w-full bg-zinc-800/50 backdrop-blur-md p-10 rounded-[3rem] border border-white/5"
                >
                    {result === "pass" ? (
                        <>
                            <div className="w-24 h-24 rounded-full bg-[#D4F268] flex items-center justify-center mx-auto mb-8 shadow-[0_0_30px_rgba(212,242,104,0.3)]">
                                <CheckCircle size={48} className="text-black" />
                            </div>
                            <h2 className="text-4xl font-black text-white mb-4">You're In! 🎉</h2>
                            <p className="text-zinc-400 font-medium mb-8">
                                Congratulations! You are now a certified mentor. Access your dashboard to set your availability.
                            </p>
                            <Button
                                onClick={() => router.push("/mentorship/dashboard")}
                                className="w-full h-14 rounded-2xl bg-[#D4F268] text-black font-bold text-lg hover:scale-105 active:scale-95 transition-all"
                            >
                                Go to Dashboard
                            </Button>
                        </>
                    ) : (
                        <>
                            <div className="w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-8">
                                <AlertCircle size={48} className="text-red-500" />
                            </div>
                            <h2 className="text-3xl font-black text-white mb-4">Not quite there.</h2>
                            <p className="text-zinc-400 font-medium mb-8">
                                Unfortunately, you didn't meet the passing score. Review our mentorship guidelines and try again tomorrow.
                            </p>
                            <Button
                                onClick={() => router.push("/mentorship/apply")}
                                className="w-full h-14 rounded-2xl bg-white/10 text-white font-bold text-lg hover:bg-white/20"
                            >
                                Try Again Later
                            </Button>
                        </>
                    )}
                </motion.div>
            </div>
        );
    }

    // Render Quiz Loop
    const question = QUESTIONS[currentStep - 1];

    if (!question) { // Loading state
        return (
            <div className="min-h-full bg-zinc-50 flex items-center justify-center">
                <div className="flex flex-col items-center">
                    <Loader2 className="w-12 h-12 animate-spin text-zinc-900 mb-4" />
                    <p className="text-zinc-500 font-bold animate-pulse">Analyzing results...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-zinc-50 flex flex-col p-6">
            <div className="max-w-2xl mx-auto w-full pt-10 md:pt-20">
                {/* Progress Bar */}
                <div className="mb-8">
                    <div className="flex justify-between text-xs font-bold text-zinc-400 mb-2 uppercase tracking-wider">
                        <span>Question {currentStep} of {QUESTIONS.length}</span>
                        <span>{Math.round((currentStep / QUESTIONS.length) * 100)}% Completed</span>
                    </div>
                    <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: `${((currentStep - 1) / QUESTIONS.length) * 100}%` }}
                            animate={{ width: `${(currentStep / QUESTIONS.length) * 100}%` }}
                            className="h-full bg-zinc-900 rounded-full"
                        />
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentStep}
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -20, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <h2 className="text-2xl md:text-3xl font-black text-zinc-900 mb-8 leading-tight">
                            {question.question}
                        </h2>

                        <div className="space-y-3">
                            {question.options.map((option, index) => (
                                <motion.button
                                    key={index}
                                    whileHover={{ scale: 1.02, backgroundColor: "#fff" }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => handleAnswer(index)}
                                    className="w-full text-left p-6 md:p-8 rounded-3xl bg-white border border-zinc-100 hover:border-zinc-300 shadow-sm hover:shadow-md transition-all group"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-zinc-700 group-hover:text-zinc-900 text-lg">{option}</span>
                                        <div className="w-8 h-8 rounded-full border-2 border-zinc-200 flex items-center justify-center group-hover:border-[#D4F268] group-hover:bg-[#D4F268]">
                                            <ChevronRight size={16} className="text-transparent group-hover:text-black transition-colors" />
                                        </div>
                                    </div>
                                </motion.button>
                            ))}
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}

export default function MentorTestPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-zinc-50" />}>
            <MentorTestContent />
        </Suspense>
    );
}
