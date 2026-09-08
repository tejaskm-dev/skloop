"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";
import { CheckCircle, XCircle, ArrowRight, BrainCircuit, RotateCcw, Zap, Timer, Target, Play, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { soundManager } from "@/lib/sound";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import DSAQuizShare from "./DSAQuizShare";
import { useUser } from "@/context/UserContext";
import { claimDailyQuest } from "@/actions/task-actions";
import DSAQuestModal from "./DSAQuestModal";

const QUESTIONS = [
    {
        q: "What is the time complexity of searching in a balanced BST?",
        options: ["O(n)", "O(log n)", "O(n log n)", "O(1)"],
        a: 1, // Index of correct answer
        explanation: "In a balanced Binary Search Tree, each step halves the search space, resulting in logarithmic time complexity."
    },
    {
        q: "Which data structure uses LIFO (Last In First Out)?",
        options: ["Queue", "Heap", "Stack", "LinkedList"],
        a: 2,
        explanation: "A Stack follows the Last In First Out (LIFO) principle, like a stack of plates."
    },
    {
        q: "Which sorting algorithm has the best average case time complexity?",
        options: ["Bubble Sort", "Insertion Sort", "Merge Sort", "Selection Sort"],
        a: 2,
        explanation: "Merge Sort has an average and worst-case time complexity of O(n log n), which is efficient for large datasets."
    },
    {
        q: "What is the primary disadvantage of a Linked List over an Array?",
        options: ["Dynamic Size", "Random Access", "Insertion Speed", "Memory Usage"],
        a: 1,
        explanation: "Linked Lists do not support random access; accessing an element requires traversing from the head (O(n))."
    },
    {
        q: "In a Hash Table, what handles collisions?",
        options: ["Recursion", "Chaining", "Indexing", "Memoization"],
        a: 1,
        explanation: "Chaining (using linked lists) and Open Addressing are common techniques to handle hash collisions."
    }
];

export default function DSAQuiz() {
    const { user, refreshProfile } = useUser();

    // Game State
    const [gameState, setGameState] = useState<"start" | "playing" | "finished">("start");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [showExplanation, setShowExplanation] = useState(false);

    const [dsaQuestComplete, setDsaQuestComplete] = useState<{ xp: number; coins: number; grade: string; score: number } | null>(null);

    // Time & Juice State
    const [startTime, setStartTime] = useState<number | null>(null);
    const [questionStartTime, setQuestionStartTime] = useState<number | null>(null);
    const [questionTimes, setQuestionTimes] = useState<number[]>([]);
    const [totalTime, setTotalTime] = useState(0);

    // 3D Tilt Logic
    const cardRef = useRef<HTMLDivElement>(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseXSpring = useSpring(x);
    const mouseYSpring = useSpring(y);

    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["7deg", "-7deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-7deg", "7deg"]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const xPct = mouseX / width - 0.5;
        const yPct = mouseY / height - 0.5;
        x.set(xPct);
        y.set(yPct);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    const handleStart = () => {
        soundManager.playClick();
        setGameState("playing");
        setScore(0);
        setCurrentIndex(0);
        setQuestionTimes([]);
        setSelectedOption(null);
        setShowExplanation(false);
        const now = Date.now();
        setStartTime(now);
        setQuestionStartTime(now);
    };

    const handleAnswer = (optionIndex: number) => {
        if (selectedOption !== null) return; // Prevent double answering

        const now = Date.now();
        const timeTaken = (now - (questionStartTime || now)) / 1000;
        setQuestionTimes(prev => [...prev, timeTaken]);

        setSelectedOption(optionIndex);
        setShowExplanation(true);

        const isCorrect = optionIndex === QUESTIONS[currentIndex].a;
        if (isCorrect) {
            setScore(prev => prev + 1);
            soundManager.playClick(0.6); // Slightly louder for correct? Or maybe separate sound
        } else {
            soundManager.playError();
        }
    };

    const nextQuestion = () => {
        soundManager.playClick();
        setSelectedOption(null);
        setShowExplanation(false);
        setQuestionStartTime(Date.now());
        x.set(0); y.set(0); // Reset tilt

        if (currentIndex < QUESTIONS.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            const finalTime = Math.floor((Date.now() - (startTime || Date.now())) / 1000);
            setTotalTime(finalTime);
            setGameState("finished");

            // Compute grade locally (useMemo won't reflect yet in this closure)
            const finalScore = score;
            const percentage = (finalScore / QUESTIONS.length) * 100;
            const avgTime = finalTime / QUESTIONS.length;
            let computedGrade = "D";
            if (percentage === 100 && avgTime < 5) computedGrade = "S+";
            else if (percentage === 100) computedGrade = "S";
            else if (percentage >= 80) computedGrade = "A";
            else if (percentage >= 60) computedGrade = "B";
            else if (percentage >= 40) computedGrade = "C";

            // Log Quest Progress — show modal only on first daily completion
            if (user) {
                import('@/actions/quest-actions').then(({ claimQuestProgress }) => {
                    Promise.all([
                        claimQuestProgress('quiz_attempt', 'daily'),
                        claimQuestProgress('quiz_3w',      'weekly'),
                        claimQuestProgress('quiz_10m',     'monthly'),
                    ])
                        .then(([dailyResult]) => {
                            refreshProfile();
                            if (dailyResult.isComplete && dailyResult.xpAwarded) {
                                setDsaQuestComplete({
                                    xp: dailyResult.xpAwarded,
                                    coins: dailyResult.coinsAwarded ?? 0,
                                    grade: computedGrade,
                                    score: finalScore,
                                });
                            }
                        })
                        .catch(err => console.error("Failed to log DSA quest", err));
                });
            }
        }
    };

    // Calculate Grade & Confetti
    const grade = useMemo(() => {
        if (gameState !== "finished") return "N/A";

        const percentage = (score / QUESTIONS.length) * 100;
        const avgTime = totalTime / QUESTIONS.length;

        // S+: 100% correct + Fast (< 5s avg)
        if (percentage === 100 && avgTime < 5) return "S+";
        if (percentage === 100) return "S";
        if (percentage >= 80) return "A";
        if (percentage >= 60) return "B";
        if (percentage >= 40) return "C";
        return "D";
    }, [gameState, score, totalTime]);

    useEffect(() => {
        if (gameState === "finished") {
            import("canvas-confetti").then((confetti) => {
                const duration = 2000;
                const end = Date.now() + duration;

                const frame = () => {
                    confetti.default({
                        particleCount: 5,
                        angle: 60,
                        spread: 55,
                        origin: { x: 0 },
                        colors: ['#6366f1', '#8b5cf6', '#d946ef']
                    });
                    confetti.default({
                        particleCount: 5,
                        angle: 120,
                        spread: 55,
                        origin: { x: 1 },
                        colors: ['#6366f1', '#8b5cf6', '#d946ef']
                    });

                    if (Date.now() < end) {
                        requestAnimationFrame(frame);
                    }
                };
                frame();
            });
        }
    }, [gameState]);

    const avgTimePerQuestion = useMemo(() => {
        if (questionTimes.length === 0) return 0;
        const sum = questionTimes.reduce((a, b) => a + b, 0);
        return (sum / questionTimes.length).toFixed(1);
    }, [questionTimes]);

    return (
        <>
        <AnimatePresence>
            {dsaQuestComplete && (
                <DSAQuestModal
                    grade={dsaQuestComplete.grade}
                    score={dsaQuestComplete.score}
                    totalQuestions={QUESTIONS.length}
                    xpEarned={dsaQuestComplete.xp}
                    coinsEarned={dsaQuestComplete.coins}
                    onDismiss={() => setDsaQuestComplete(null)}
                />
            )}
        </AnimatePresence>
        <div className="h-full flex flex-col relative w-full items-center justify-center font-sans tracking-tight overflow-hidden">

            {/* Dynamic Background */}
            <div className="absolute inset-0 pointer-events-none opacity-30">
                <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-lime-200 rounded-full mix-blend-multiply filter blur-[80px] animate-blob" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-lime-100 rounded-full mix-blend-multiply filter blur-[80px] animate-blob animation-delay-2000" />
            </div>

            <AnimatePresence mode="wait">
                {/* START SCREEN */}
                {gameState === "start" && (
                    <motion.div
                        key="start"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        className="text-center space-y-8 z-10 w-full max-w-2xl px-4"
                    >
                        <h2 className="text-4xl md:text-6xl font-extrabold text-zinc-900 tracking-tight">
                            Algorithmic <span className="text-transparent bg-clip-text bg-gradient-to-r from-lime-500 to-lime-600">Intuition</span>
                        </h2>
                        <p className="text-zinc-500 text-lg md:text-xl max-w-lg mx-auto leading-relaxed">
                            <span className="font-bold text-zinc-700">5 Questions.</span> Test your data structure usage and complexity analysis skills.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-lg mx-auto mb-8">
                            <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-zinc-100 shadow-sm flex flex-col items-center gap-2">
                                <Zap className="text-amber-500" size={24} />
                                <div className="text-xs font-bold text-zinc-400 uppercase">Speed</div>
                                <div className="font-bold text-zinc-700">Essential</div>
                            </div>
                            <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-zinc-100 shadow-sm flex flex-col items-center gap-2">
                                <Target className="text-lime-500" size={24} />
                                <div className="text-xs font-bold text-zinc-400 uppercase">Accuracy</div>
                                <div className="font-bold text-zinc-700">Critical</div>
                            </div>
                            <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-zinc-100 shadow-sm flex flex-col items-center gap-2">
                                <BrainCircuit className="text-lime-600" size={24} />
                                <div className="text-xs font-bold text-zinc-400 uppercase">Focus</div>
                                <div className="font-bold text-zinc-700">Required</div>
                            </div>
                        </div>

                        <Button
                            onClick={handleStart}
                            className="px-12 py-6 bg-zinc-900 text-white hover:bg-black text-xl rounded-2xl font-bold shadow-xl shadow-lime-200/50 hover:shadow-2xl hover:shadow-lime-300/50 hover:-translate-y-1 transition-all"
                        >
                            Begin Assessment <Play size={20} className="ml-3 text-[#D4F268]" />
                        </Button>
                    </motion.div>
                )}

                {/* GAME SCREEN */}
                {gameState === "playing" && (
                    <motion.div
                        key="playing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="w-full max-w-4xl px-4 flex flex-col h-full py-8 md:py-12 relative z-10"
                    >
                        {/* Top Bar */}
                        <div className="flex justify-between items-center mb-8">
                            <div className="flex items-center gap-3">
                                <div className="bg-white/80 backdrop-blur text-zinc-500 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-sm">
                                    Q{currentIndex + 1} / {QUESTIONS.length}
                                </div>
                                <div className="h-1 w-24 bg-zinc-100/50 rounded-full overflow-hidden backdrop-blur">
                                    <motion.div
                                        className="h-full bg-lime-500"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${((currentIndex) / QUESTIONS.length) * 100}%` }}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-widest bg-white/50 px-3 py-1 rounded-full backdrop-blur">
                                <BrainCircuit size={14} /> DSA Mode
                            </div>
                        </div>

                        {/* 3D TILT CONTAINER */}
                        <div className="flex-1 flex flex-col justify-center perspective-1000" style={{ perspective: "1000px" }}>
                            <motion.div
                                ref={cardRef}
                                style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                                onMouseMove={handleMouseMove}
                                onMouseLeave={handleMouseLeave}
                                className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] p-8 md:p-12 shadow-2xl shadow-zinc-200/50 border border-white/50 relative overflow-hidden group"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-white via-transparent to-lime-50/30 opacity-50 pointer-events-none" />

                                <div className="relative z-10 transform-style-3d">
                                    <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-8 leading-snug">
                                        {QUESTIONS[currentIndex].q}
                                    </h2>

                                    <div className="grid grid-cols-1 gap-3">
                                        {QUESTIONS[currentIndex].options.map((opt, idx) => {
                                            const isSelected = selectedOption === idx;
                                            const isCorrect = idx === QUESTIONS[currentIndex].a;
                                            const showResult = selectedOption !== null;

                                            let bgClass = "bg-white hover:bg-zinc-50 border-zinc-100";
                                            let textClass = "text-zinc-600";
                                            let borderClass = "border-zinc-100 group-hover:border-zinc-200";
                                            let shadowClass = "shadow-sm hover:shadow-md";

                                            if (showResult) {
                                                if (isCorrect) {
                                                    bgClass = "bg-emerald-50 border-emerald-200";
                                                    textClass = "text-emerald-700";
                                                    borderClass = "border-emerald-200";
                                                    shadowClass = "shadow-md shadow-emerald-100";
                                                } else if (isSelected && !isCorrect) {
                                                    bgClass = "bg-rose-50 border-rose-200";
                                                    textClass = "text-rose-700";
                                                    borderClass = "border-rose-200";
                                                    shadowClass = "shadow-md shadow-rose-100";
                                                } else {
                                                    bgClass = "bg-zinc-50 opacity-40";
                                                    borderClass = "border-transparent";
                                                    shadowClass = "shadow-none";
                                                }
                                            } else if (isSelected) {
                                                bgClass = "bg-lime-50 border-lime-200";
                                                textClass = "text-lime-900";
                                                borderClass = "border-lime-200";
                                                shadowClass = "shadow-md shadow-lime-100";
                                            }

                                            return (
                                                <button
                                                    key={idx}
                                                    onClick={() => handleAnswer(idx)}
                                                    disabled={showResult}
                                                    onMouseEnter={() => !showResult && soundManager.playClick(0.05)}
                                                    className={`
                                                        group/btn relative p-5 md:p-6 rounded-2xl text-left transition-all duration-200 border-2
                                                        ${bgClass} ${borderClass} ${shadowClass} flex justify-between items-center
                                                    `}
                                                >
                                                    <span className={`text-lg font-medium ${textClass}`}>{opt}</span>
                                                    {showResult && isCorrect && <CheckCircle className="text-emerald-500" size={24} />}
                                                    {showResult && isSelected && !isCorrect && <XCircle className="text-rose-500" size={24} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </motion.div>
                        </div>

                        {/* Explanation & Next */}
                        <AnimatePresence>
                            {showExplanation && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-6 bg-white/90 backdrop-blur rounded-[2rem] p-6 border border-zinc-100 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl shadow-zinc-200/50 relative z-20"
                                >
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-zinc-400 uppercase mb-1 flex items-center gap-2">
                                            <Star size={12} className="text-amber-400 fill-amber-400" /> Analysis
                                        </div>
                                        <p className="text-zinc-700 font-medium leading-relaxed">{QUESTIONS[currentIndex].explanation}</p>
                                    </div>
                                    <Button onClick={nextQuestion} className="bg-zinc-900 text-white hover:bg-black px-8 py-4 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-transform active:scale-95">
                                        {currentIndex === QUESTIONS.length - 1 ? "Finish" : "Next"} <ArrowRight size={18} className="text-[#D4F268]" />
                                    </Button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}

                {/* RESULT SCREEN */}
                {gameState === "finished" && (
                    <motion.div
                        key="finished"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-4xl px-4 flex flex-col items-center justify-center py-12 relative z-10"
                    >
                        {/* Grade Element */}
                        <div className="mb-8">
                            <motion.div
                                initial={{ scale: 0, rotate: -10 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: "spring", bounce: 0.5 }}
                                className={`text-[120px] font-black leading-none tracking-tighter
                                    ${grade.startsWith('S') ? "text-transparent bg-clip-text bg-gradient-to-br from-lime-400 to-lime-600 drop-shadow-2xl" :
                                        grade === 'A' ? "text-emerald-500" :
                                            grade === 'B' ? "text-lime-600" : "text-zinc-400"}
                                `}
                            >
                                {grade}
                            </motion.div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-8">
                            <div className="bg-white/60 backdrop-blur-md rounded-[2.5rem] p-8 border border-white/50 flex items-center gap-6 relative overflow-hidden shadow-xl shadow-zinc-100/20">
                                <div className="absolute top-0 right-0 p-4 opacity-5">
                                    <Target size={120} />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Final Score</div>
                                    <div className="text-6xl font-black text-lime-600 tracking-tighter mix-blend-multiply">{score} / {QUESTIONS.length}</div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white/80 backdrop-blur rounded-[2rem] p-6 border border-zinc-100 shadow-sm flex justify-between items-center">
                                    <div>
                                        <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Total Time</div>
                                        <div className="text-2xl font-bold text-zinc-700">{totalTime}s</div>
                                    </div>
                                    <div className="p-3 bg-zinc-50 rounded-xl text-zinc-400">
                                        <Timer size={24} />
                                    </div>
                                </div>
                                <div className="bg-white/80 backdrop-blur rounded-[2rem] p-6 border border-zinc-100 shadow-sm flex justify-between items-center">
                                    <div>
                                        <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Avg Time / Q</div>
                                        <div className="text-2xl font-bold text-zinc-700">{avgTimePerQuestion}s</div>
                                    </div>
                                    <div className="p-3 bg-zinc-50 rounded-xl text-zinc-400">
                                        <Zap size={24} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Share Section */}
                        <div className="w-full mb-8">
                            <DSAQuizShare
                                score={score}
                                totalQuestions={QUESTIONS.length}
                                timeElapsed={totalTime}
                                grade={grade}
                            />
                        </div>

                        <div className="flex gap-4 w-full max-w-sm">
                            <Button onClick={handleStart} className="flex-1 py-4 bg-zinc-900 text-white hover:bg-black text-lg rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:-translate-y-1">
                                Retry Quiz <RotateCcw size={18} className="ml-2" />
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
        </>
    );
}
