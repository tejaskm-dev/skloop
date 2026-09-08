"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, RotateCcw, Trophy, Volume2, VolumeX, Maximize2, Minimize2, Flame, Zap, Settings, Check, X, Clock, FileText, Hash, Type as TypeIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { soundManager } from "@/lib/sound";
import { COMMON_WORDS } from "@/data/words";
import ResultChart from "./ResultChart";

import { Card } from "@/components/ui/Card";
import TypingGameShare from "./TypingGameShare";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { useUser } from "@/context/UserContext";
import { claimDailyQuest } from "@/actions/task-actions";
import TypingQuestModal from "./TypingQuestModal";

// More realistic code snippets
const CODE_SNIPPETS = [
    {
        lang: "javascript",
        code: `function binarySearch(arr, target) {
  let left = 0;
  let right = arr.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}`
    },
    {
        lang: "javascript",
        code: `const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};`
    },
    {
        lang: "react",
        code: `useEffect(() => {
  const handleResize = () => setWidth(window.innerWidth);
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);`
    },
    {
        lang: "css",
        code: `.container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  padding: 2rem;
  background: var(--surface-color);
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}`
    }
];

type GameMode = "snippet" | "time";
type ContentType = "code" | "words";

interface HistoryPoint {
    time: number;
    wpm: number;
    raw: number;
    errors: number;
}

export default function TypingGame() {
    const { user, refreshProfile } = useUser();

    // Settings
    const [gameMode, setGameMode] = useState<GameMode>("snippet");
    const [containerWidth, setContainerWidth] = useState(0);
    const [timeLimit, setTimeLimit] = useState(30);
    const [wordCount, setWordCount] = useState(25);
    const [contentType, setContentType] = useState<ContentType>("code");
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [isZenMode, setIsZenMode] = useState(false);
    const [focusMode, setFocusMode] = useState(true);
    const [showSettings, setShowSettings] = useState(false);

    // Game State
    const [snippet, setSnippet] = useState("");
    const [input, setInput] = useState("");
    const [startTime, setStartTime] = useState<number | null>(null);
    const [timeLeft, setTimeLeft] = useState(timeLimit);
    const [wpm, setWpm] = useState(0);
    const [rawWpm, setRawWpm] = useState(0);
    const [accuracy, setAccuracy] = useState(100);
    const [gameState, setGameState] = useState<"idle" | "playing" | "finished">("idle");

    // Auto-scroll to result
    const resultRef = useAutoScroll<HTMLDivElement>({
        trigger: gameState === "finished" ? gameState : undefined,
        offset: -50
    });
    const [history, setHistory] = useState<HistoryPoint[]>([]);
    const [totalKeystrokes, setTotalKeystrokes] = useState(0);

    const [typingQuestComplete, setTypingQuestComplete] = useState<{ xp: number; coins: number; wpm: number; accuracy: number } | null>(null);

    // Juice States
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [shake, setShake] = useState(0);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);


    // Split snippet into lines for Focus Mode
    const lines = useMemo(() => snippet.split("\n"), [snippet]);

    // Determine Active Line Index (Same as before)
    const activeLineIndex = useMemo(() => {
        let charCount = 0;
        for (let i = 0; i < lines.length; i++) {
            const lineLength = lines[i].length + 1;
            if (input.length < charCount + lineLength) {
                return i;
            }
            charCount += lineLength;
        }
        return lines.length - 1;
    }, [input.length, lines]);

    // Smooth Autoscroll Logic
    useEffect(() => {
        const activeLine = lineRefs.current[activeLineIndex];
        const container = containerRef.current;

        if (activeLine && container) {
            const containerRect = container.getBoundingClientRect();
            const lineRect = activeLine.getBoundingClientRect();

            // Calculate offset to center the line
            const offset = lineRect.top - containerRect.top - (containerRect.height / 2) + (lineRect.height / 2);

            container.scrollBy({
                top: offset,
                behavior: 'smooth'
            });
        }
    }, [activeLineIndex]);

    // Generate Content
    const generateContent = useCallback(() => {
        if (contentType === "code") {
            const random = CODE_SNIPPETS[Math.floor(Math.random() * CODE_SNIPPETS.length)];
            return random.code;
        } else {
            // Generate random words based on settings
            const words = [];
            const count = wordCount;
            for (let i = 0; i < count; i++) {
                words.push(COMMON_WORDS[Math.floor(Math.random() * COMMON_WORDS.length)]);
            }
            return words.join(" ");
        }
    }, [contentType, wordCount]);

    // Initialize content on load/setting change
    useEffect(() => {
        setSnippet(generateContent());
    }, [generateContent]);

    // Timer Logic
    useEffect(() => {
        if (gameState === "playing") {
            // Main Timer for Time Mode
            if (gameMode === "time") {
                timerRef.current = setInterval(() => {
                    setTimeLeft((prev) => {
                        if (prev <= 1) {
                            endGame();
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
            }
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [gameState, gameMode]); // Dependencies need care

    // Better History Tracking: Use a separate effect that depends on [timeLeft] or a 1s interval 
    // that uses Refs to get current stats without re-triggering.
    const statsRef = useRef({ wpm: 0, raw: 0, errors: 0 });

    useEffect(() => {
        if (gameState === "playing") {
            const interval = setInterval(() => {
                setHistory(prev => [
                    ...prev,
                    {
                        time: prev.length + 1,
                        wpm: statsRef.current.wpm,
                        raw: statsRef.current.raw,
                        errors: statsRef.current.errors
                    }
                ]);
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [gameState]);


    // Confetti on Finish
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

    const startGame = () => {
        setSnippet(generateContent());
        setGameState("playing");
        setStartTime(Date.now());
        setTimeLeft(timeLimit);
        setInput("");
        setWpm(0);
        setRawWpm(0); // Reset Raw
        setAccuracy(100);
        setStreak(0);
        setMaxStreak(0);
        setHistory([]); // Reset History
        statsRef.current = { wpm: 0, raw: 0, errors: 0 };
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const endGame = () => {
        setGameState("finished");
        if (timerRef.current) clearInterval(timerRef.current);

        // Capture current stats before async work
        const capturedWpm = statsRef.current.wpm;
        const capturedAccuracy = wpm > 0
            ? Math.max(0, Math.round(((statsRef.current.wpm * 5 - statsRef.current.errors) / (statsRef.current.wpm * 5)) * 100))
            : accuracy;

        if (user) {
            import('@/actions/quest-actions').then(({ claimQuestProgress }) => {
                claimQuestProgress('type_race', 'daily')
                    .then((result) => {
                        refreshProfile();
                        if (result.isComplete && result.xpAwarded) {
                            setTypingQuestComplete({
                                xp: result.xpAwarded,
                                coins: result.coinsAwarded ?? 0,
                                wpm: capturedWpm,
                                accuracy: capturedAccuracy,
                            });
                        }
                    })
                    .catch(err => console.error("Failed to log typing quest", err));
            });
        }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const prevVal = input;

        // Prevent typing beyond snippet length
        if (val.length > snippet.length) return;

        setInput(val);

        // Track total keystrokes (every character typed, including mistakes)
        if (val.length > prevVal.length) {
            setTotalKeystrokes(prev => prev + 1);
        }

        if (!startTime) setStartTime(Date.now());

        // Sound & Juice Logic
        if (val.length > prevVal.length) {
            const charIndex = val.length - 1;
            const charTyped = val.slice(-1);
            const expectedChar = snippet[charIndex];

            if (charTyped !== expectedChar) {
                // Mistake
                if (soundEnabled) soundManager.playError();
                setStreak(0);
                setShake(prev => prev + 1);
            } else {
                // Correct
                if (soundEnabled) soundManager.playClick();
                setStreak(s => {
                    const newStreak = s + 1;
                    if (newStreak > maxStreak) setMaxStreak(newStreak);
                    return newStreak;
                });
            }
        }

        // --- NEW WPM CALCULATION LOGIC ---
        const now = Date.now();
        const timeElapsedMin = (now - startTime!) / 1000 / 60;
        const safeTime = timeElapsedMin > 0 ? timeElapsedMin : 0.0001;

        // 1. Calculate Errors
        let errors = 0;
        for (let i = 0; i < val.length; i++) {
            if (val[i] !== snippet[i]) errors++;
        }

        // 2. Net WPM (Standard): (All Typed Entries / 5) - (Uncorrected Errors / Time) 
        // Actually, most modern tests use: 
        // Gross WPM = (All Typed Entries / 5) / Time
        // Net WPM = Gross WPM - (Errors / Time)
        // Let's use: (Correct Characters / 5) / Time for "Net/Main WPM" as it's cleaner.
        const correctChars = val.length - errors;
        const currentNetWpm = Math.max(0, Math.round((correctChars / 5) / safeTime));

        // 3. Raw WPM: (Total Input Length / 5) / Time
        const currentRawWpm = Math.round((val.length / 5) / safeTime);

        // 4. Accuracy
        const currentAccuracy = val.length > 0 ? Math.max(0, Math.round(((val.length - errors) / val.length) * 100)) : 100;

        // Update State
        setWpm(currentNetWpm);
        setRawWpm(currentRawWpm);
        setAccuracy(currentAccuracy);

        // Update Ref for History Loop
        statsRef.current = { wpm: currentNetWpm, raw: currentRawWpm, errors };

        // End game when reaching the end of content (allow errors)
        if (val.length >= snippet.length) {
            endGame();
        }
    };




    // Calculate Grade
    const grade = useMemo(() => {
        const score = wpm * (accuracy / 100);
        if (score >= 100) return "S+";
        if (score >= 80) return "S";
        if (score >= 60) return "A";
        if (score >= 40) return "B";
        if (score >= 20) return "C";
        return "D";
    }, [wpm, accuracy]);

    // Format time
    const timeSpent = useMemo(() => {
        if (!startTime) return "00:00";
        const durationMs = Date.now() - startTime;
        const seconds = Math.floor(durationMs / 1000);
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startTime, gameState]); // Re-calc on finish

    return (
        <>
        <motion.div
            animate={shake > 0 ? { x: [-5, 5, -5, 5, 0] } : {}}
            transition={{ duration: 0.1 }}
            className={`
                flex flex-col h-full relative transition-all duration-500 ease-in-out font-sans
                ${isZenMode ? "fixed inset-0 z-50 bg-[#fafafa]" : "min-h-[600px] rounded-[2.5rem] bg-[#FDFCF8] border border-zinc-200 shadow-xl shadow-zinc-200/50 overflow-hidden"}
                ${streak > 20 ? "shadow-lime-300/60 ring-2 ring-lime-200/50" : ""}
            `}
        >
            {/* Top Bar */}
            <div className={`flex justify-between items-center p-6 ${isZenMode ? "max-w-7xl mx-auto w-full" : ""}`}>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className={`text-xs font-bold uppercase tracking-widest ${isZenMode ? "text-zinc-400" : "text-zinc-300"}`}>
                            {gameMode === "time" ? "Time Attack" : "Snippet Run"}
                        </div>
                        <div className="w-1 h-1 rounded-full bg-zinc-300" />
                        <div className={`text-xs font-bold uppercase tracking-widest ${isZenMode ? "text-zinc-400" : "text-zinc-300"}`}>
                            {contentType === "code" ? "Code" : "Words"}
                        </div>
                    </div>

                    <AnimatePresence>
                        {streak > 5 && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.5, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                key="streak-badge"
                                className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider
                                    ${streak > 20 ? "bg-amber-100 text-amber-600 animate-pulse" : "bg-lime-100 text-lime-700"}
                                `}
                            >
                                <Flame size={14} className={streak > 20 ? "fill-amber-500 text-amber-600" : ""} />
                                {streak} Combo
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                <button
                    onClick={() => setShowSettings(true)}
                    className="p-3 text-zinc-400 hover:text-zinc-900 bg-white hover:bg-zinc-50 rounded-2xl transition-all"
                >
                    <Settings size={20} strokeWidth={2.5} />
                </button>
            </div>

            {/* Settings Modal (Same) */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[60] flex items-center justify-center bg-zinc-900/20 backdrop-blur-sm p-4"
                        onClick={() => setShowSettings(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-white p-8 rounded-[2rem] shadow-2xl shadow-zinc-300 w-full max-w-sm overflow-y-auto max-h-[90vh]"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-zinc-900">Game Settings</h3>
                                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-zinc-900">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Game Mode</label>
                                    <div className="flex bg-zinc-100 p-1 rounded-lg relative isolate">
                                        <button
                                            onClick={() => setGameMode("snippet")}
                                            className={`flex-1 relative flex items-center justify-center gap-2 py-2 rounded-md text-sm font-bold transition-colors z-0 ${gameMode === "snippet" ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"}`}
                                        >
                                            {gameMode === "snippet" && (
                                                <motion.div
                                                    layoutId="mode-bg"
                                                    className="absolute inset-0 bg-white shadow-sm rounded-md border border-zinc-200/50 -z-10"
                                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                />
                                            )}
                                            <span className="relative z-10 flex items-center gap-2"><FileText size={16} /> Snippet</span>
                                        </button>
                                        <button
                                            onClick={() => setGameMode("time")}
                                            className={`flex-1 relative flex items-center justify-center gap-2 py-2 rounded-md text-sm font-bold transition-colors z-0 ${gameMode === "time" ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"}`}
                                        >
                                            {gameMode === "time" && (
                                                <motion.div
                                                    layoutId="mode-bg"
                                                    className="absolute inset-0 bg-white shadow-sm rounded-md border border-zinc-200/50 -z-10"
                                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                />
                                            )}
                                            <span className="relative z-10 flex items-center gap-2"><Clock size={16} /> Time</span>
                                        </button>
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {gameMode === "time" && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="space-y-3 overflow-hidden"
                                        >
                                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Duration</label>
                                            <div className="flex bg-zinc-100 p-1 rounded-lg relative isolate">
                                                {[15, 30, 60].map(t => (
                                                    <button
                                                        key={t}
                                                        onClick={() => setTimeLimit(t)}
                                                        className={`flex-1 relative py-2 rounded-md text-sm font-bold transition-colors z-0 ${timeLimit === t ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"}`}
                                                    >
                                                        {timeLimit === t && (
                                                            <motion.div
                                                                layoutId="time-bg"
                                                                className="absolute inset-0 bg-white shadow-sm rounded-md border border-zinc-200/50 -z-10"
                                                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                            />
                                                        )}
                                                        <span className="relative z-10">{t}s</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                    {gameMode === "snippet" && contentType === "words" && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="space-y-3 overflow-hidden"
                                        >
                                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Word Limit</label>
                                            <div className="flex bg-zinc-100 p-1 rounded-lg relative isolate">
                                                {[10, 25, 50, 100].map(c => (
                                                    <button
                                                        key={c}
                                                        onClick={() => setWordCount(c)}
                                                        className={`flex-1 relative py-2 rounded-md text-sm font-bold transition-colors z-0 ${wordCount === c ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"}`}
                                                    >
                                                        {wordCount === c && (
                                                            <motion.div
                                                                layoutId="word-bg"
                                                                className="absolute inset-0 bg-white shadow-sm rounded-md border border-zinc-200/50 -z-10"
                                                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                            />
                                                        )}
                                                        <span className="relative z-10">{c}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Content</label>
                                    <div className="flex bg-zinc-100 p-1 rounded-lg relative isolate">
                                        <button
                                            onClick={() => setContentType("code")}
                                            className={`flex-1 relative flex items-center justify-center gap-2 py-2 rounded-md text-sm font-bold transition-colors z-0 ${contentType === "code" ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"}`}
                                        >
                                            {contentType === "code" && (
                                                <motion.div
                                                    layoutId="content-bg"
                                                    className="absolute inset-0 bg-white shadow-sm rounded-md border border-zinc-200/50 -z-10"
                                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                />
                                            )}
                                            <span className="relative z-10 flex items-center gap-2"><Hash size={16} /> Code</span>
                                        </button>
                                        <button
                                            onClick={() => setContentType("words")}
                                            className={`flex-1 relative flex items-center justify-center gap-2 py-2 rounded-md text-sm font-bold transition-colors z-0 ${contentType === "words" ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"}`}
                                        >
                                            {contentType === "words" && (
                                                <motion.div
                                                    layoutId="content-bg"
                                                    className="absolute inset-0 bg-white shadow-sm rounded-md border border-zinc-200/50 -z-10"
                                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                />
                                            )}
                                            <span className="relative z-10 flex items-center gap-2"><TypeIcon size={16} /> Words</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="h-px bg-zinc-100" />

                                <div className="space-y-2">
                                    <button
                                        onClick={() => setSoundEnabled(!soundEnabled)}
                                        className="flex items-center justify-between w-full p-4 rounded-2xl bg-zinc-50 hover:bg-zinc-100 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${soundEnabled ? 'bg-lime-100 text-lime-700' : 'bg-zinc-200 text-zinc-500'}`}>
                                                {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                                            </div>
                                            <div className="font-bold text-zinc-900">Sound Effects</div>
                                        </div>
                                        {soundEnabled && <Check size={18} className="text-lime-600" />}
                                    </button>

                                    <button
                                        onClick={() => setIsZenMode(!isZenMode)}
                                        className="flex items-center justify-between w-full p-4 rounded-2xl bg-zinc-50 hover:bg-zinc-100 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${isZenMode ? 'bg-lime-100 text-lime-700' : 'bg-zinc-200 text-zinc-500'}`}>
                                                {isZenMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                                            </div>
                                            <div className="font-bold text-zinc-900">Zen Mode</div>
                                        </div>
                                        {isZenMode && <Check size={18} className="text-lime-600" />}
                                    </button>
                                    <button
                                        onClick={() => setFocusMode(!focusMode)}
                                        className="flex items-center justify-between w-full p-4 rounded-2xl bg-zinc-50 hover:bg-zinc-100 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${focusMode ? 'bg-lime-100 text-lime-700' : 'bg-zinc-200 text-zinc-500'}`}>
                                                <Zap size={18} />
                                            </div>
                                            <div className="font-bold text-zinc-900">Focus Mode</div>
                                        </div>
                                        {focusMode && <Check size={18} className="text-lime-600" />}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Content Container */}
            < div className={`flex-1 flex flex-col items-center justify-center relative ${isZenMode ? "max-w-5xl mx-auto w-full" : "w-full"}`}>

                {gameState === "idle" && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center space-y-8 z-10"
                    >
                        <h2 className="text-4xl md:text-6xl font-extrabold text-zinc-900 tracking-tight">
                            Ready to <span className="text-transparent bg-clip-text bg-gradient-to-r from-lime-500 to-lime-600">Flow</span>?
                        </h2>
                        <p className="text-zinc-500 text-lg max-w-md mx-auto">
                            {gameMode === "time" ? `Race against the clock. ${timeLimit} seconds.` : contentType === "words" ? `Complete ${wordCount} words with precision.` : "Complete the code snippet with precision."}
                        </p>
                        <Button
                            onClick={startGame}
                            className="px-12 py-6 bg-zinc-900 text-white hover:bg-black text-xl rounded-2xl font-bold shadow-xl shadow-lime-200/50 hover:shadow-2xl hover:shadow-lime-300/50 hover:-translate-y-1 transition-all"
                        >
                            Start Session <Play size={20} className="ml-3 text-[#D4F268]" />
                        </Button>
                    </motion.div>
                )}

                {
                    gameState === "finished" && (
                        <motion.div
                            ref={resultRef}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col items-center justify-center w-full max-w-4xl px-4"
                        >
                            {/* Grade Element */}
                            <div className="mb-4">
                                <motion.div
                                    initial={{ scale: 0, rotate: -20 }}
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

                            {/* Enhanced Result Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-8">

                                {/* Main Stats Card */}
                                <div className="md:col-span-2 bg-zinc-50 rounded-[2rem] p-8 border border-zinc-100 flex flex-col justify-between relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <Trophy size={120} />
                                    </div>

                                    <div className="flex justify-between items-start z-10">
                                        <div>
                                            <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Net WPM</div>
                                            <div className="text-7xl font-black text-lime-600 tracking-tighter mix-blend-multiply">{wpm}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Accuracy</div>
                                            <div className={`text-5xl font-bold ${accuracy >= 95 ? "text-emerald-500" : "text-amber-500"}`}>{accuracy}%</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4 mt-8 pt-8 border-zinc-200 z-10">
                                        <div>
                                            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Raw Speed</div>
                                            <div className="text-2xl font-bold text-zinc-700">{rawWpm} WPM</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{contentType === "words" ? "Words" : "Characters"}</div>
                                            <div className="text-2xl font-bold text-zinc-700">
                                                {contentType === "words" ? input.trim().split(/\s+/).filter(w => w.length > 0).length : input.length}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Time</div>
                                            <div className="text-2xl font-bold text-zinc-700">{timeSpent}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Secondary Stats / History Mini */}
                                <div className="bg-white rounded-[2rem] p-6 border border-zinc-100 shadow-xl shadow-zinc-200/50 flex flex-col justify-center items-center">
                                    <div className="text-center space-y-2 mb-6">
                                        <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Max Streak</div>
                                        <div className="text-4xl font-black text-amber-500 flex items-center justify-center gap-2">
                                            <Flame size={32} className="fill-amber-500" /> {maxStreak}
                                        </div>
                                    </div>
                                    <div className="w-full pt-4 border-t border-zinc-100">
                                        <div className="flex justify-between text-xs text-zinc-400 font-bold uppercase mb-2">
                                            <span>Errors</span>
                                            <span className="text-rose-500">{totalKeystrokes - input.length}</span>
                                        </div>
                                        <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-400" style={{ width: `${accuracy}%` }} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Chart Section */}
                            <div className="w-full bg-white rounded-[2rem] p-8 border border-zinc-100 shadow-sm mb-8">
                                <div className="text-xs text-zinc-400 font-bold uppercase tracking-widest mb-6">Velocity Graph</div>
                                <ResultChart data={history} height={200} />
                            </div>

                            {/* Share Section */}
                            <div className="w-full bg-white rounded-[2rem] p-8 border border-zinc-100 shadow-sm mb-8">
                                <div className="text-xs text-zinc-400 font-bold uppercase tracking-widest mb-6">Share Your Results</div>
                                <TypingGameShare
                                    wpm={wpm}
                                    rawWpm={rawWpm}
                                    accuracy={accuracy}
                                    timeElapsed={timeSpent === "00:00" ? 0 : parseInt(timeSpent.split(':')[0]) * 60 + parseInt(timeSpent.split(':')[1])}
                                    mode={contentType === "code" ? "Code Snippets" : `${wordCount} Words`}
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-4 w-full max-w-sm">
                                <Button onClick={startGame} className="flex-1 py-4 bg-zinc-900 text-white hover:bg-zinc-800 text-lg rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:-translate-y-1">
                                    Replay Session <RotateCcw size={18} className="ml-2" />
                                </Button>
                            </div>
                        </motion.div>
                    )
                }

                {
                    gameState === "playing" && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="w-full max-w-4xl px-6 md:px-0"
                        >
                            {/* Live Stats */}
                            <div className="flex justify-between items-end mb-8 select-none">
                                <div className="flex items-end gap-12">
                                    <div className="relative">
                                        <div className="text-6xl font-black text-zinc-300 pointer-events-none transition-colors duration-300">
                                            {wpm}
                                        </div>
                                        <div className="absolute -bottom-4 left-1 text-[10px] uppercase font-bold tracking-[0.3em] text-zinc-400">WPM</div>
                                    </div>

                                    <div className="relative hidden md:block">
                                        <div className="text-3xl font-bold text-zinc-300 pointer-events-none transition-colors duration-300">
                                            {rawWpm}
                                        </div>
                                        <div className="absolute -bottom-4 left-1 text-[10px] uppercase font-bold tracking-[0.3em] text-zinc-400">RAW</div>
                                    </div>

                                    <div className="relative">
                                        <div className={`text-3xl font-bold pointer-events-none transition-colors duration-300 ${accuracy < 90 ? "text-rose-400" : "text-emerald-400"}`}>
                                            {accuracy}%
                                        </div>
                                    </div>
                                </div>

                                {gameMode === "time" && (
                                    <div className="text-4xl font-black text-zinc-900 font-mono tracking-widest tabular-nums">
                                        {timeLeft}s
                                    </div>
                                )}
                            </div>

                            {/* Editor Area */}
                            <div
                                ref={(el) => {
                                    // @ts-ignore
                                    containerRef.current = el;
                                }}
                                className="relative font-mono text-xl md:text-2xl leading-loose outline-none min-h-[400px] max-h-[60vh] overflow-y-auto custom-scrollbar scroll-smooth"
                                onClick={() => inputRef.current?.focus()}
                            >
                                {/* Line Rendering */}
                                <div className="pointer-events-none select-none">
                                    {lines.map((line, lineIndex) => {
                                        const lineStartIndex = lines.slice(0, lineIndex).reduce((acc, l) => acc + l.length + 1, 0);
                                        const isActive = lineIndex === activeLineIndex;
                                        const shouldFocus = focusMode ? isActive : true;

                                        return (
                                            <div
                                                key={lineIndex}
                                                ref={(el) => {
                                                    // @ts-ignore
                                                    lineRefs.current[lineIndex] = el;
                                                }}
                                                className={`transition-all duration-300 ${shouldFocus ? "opacity-100 scale-100" : "opacity-30 blur-[1px] scale-95 origin-left"}`}
                                            >
                                                {line.split('').map((char, charIndexInLine) => {
                                                    const globalIndex = lineStartIndex + charIndexInLine;
                                                    let colorClass = "text-zinc-300"; // Default untyped
                                                    let bgClass = "bg-transparent";

                                                    if (globalIndex < input.length) {
                                                        const typedChar = input[globalIndex];
                                                        if (typedChar === char) {
                                                            colorClass = "text-zinc-900 font-bold mix-blend-multiply"; // Correct
                                                        } else {
                                                            colorClass = "text-rose-500 font-bold";
                                                            bgClass = "bg-rose-100"; // Error bg
                                                        }
                                                    } else if (globalIndex === input.length) {
                                                        // Caret - handled by motion div below, but span needs to be relative
                                                        bgClass = "relative";
                                                    }

                                                    return (
                                                        <span key={charIndexInLine} className={`${colorClass} ${bgClass} relative rounded-[2px]`}>
                                                            {globalIndex === input.length && (
                                                                <motion.div
                                                                    layoutId="caret"
                                                                    className="absolute -left-[1px] -top-1 bottom-1 w-[2px] bg-[#D4F268] z-20"
                                                                    transition={{ duration: 0.1 }}
                                                                />
                                                            )}
                                                            {char}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>

                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={handleInput}
                                    className="absolute inset-0 opacity-0 w-full h-full cursor-default resize-none"
                                    spellCheck={false}
                                    autoFocus
                                    onBlur={() => inputRef.current?.focus()}
                                />
                            </div>

                            <div className="mt-8 flex justify-center">
                                <div className="h-1 w-32 bg-zinc-100 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-lime-500"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(input.length / snippet.length) * 100}%` }}
                                    />
                                </div>
                            </div>

                            <div className="mt-8 text-center">
                                <button
                                    onClick={() => setGameState('idle')}
                                    className="text-zinc-300 hover:text-zinc-500 text-xs font-bold uppercase tracking-[0.2em] transition-colors"
                                >
                                    ESC to Cancel
                                </button>
                            </div>
                        </motion.div>
                    )
                }

            </div >
        </motion.div >

        <AnimatePresence>
            {typingQuestComplete && (
                <TypingQuestModal
                    wpm={typingQuestComplete.wpm}
                    accuracy={typingQuestComplete.accuracy}
                    xpEarned={typingQuestComplete.xp}
                    coinsEarned={typingQuestComplete.coins}
                    onDismiss={() => setTypingQuestComplete(null)}
                />
            )}
        </AnimatePresence>
        </>
    );
}

