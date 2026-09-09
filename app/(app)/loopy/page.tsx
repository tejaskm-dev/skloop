"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LoopyHeader } from "@/components/loopy/LoopyHeader";
import { LoopyMascot } from "@/components/loopy/LoopyMascot";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useLoading } from "@/components/LoadingProvider";
import { useRouter } from "next/navigation";
import { BrainCircuit, BookOpen, ChevronRight, Sparkles, Code2, TerminalSquare, Sword, Shield } from "lucide-react";

type AI_Mode = "helpful" | "story";

export default function LoopyPage() {
    const { isLoading: isGlobalLoading } = useLoading();
    const isDesktop = useMediaQuery("(min-width: 768px)");
    const router = useRouter();

    const [selectedMode, setSelectedMode] = useState<AI_Mode>("helpful");
    const [xp] = useState(120);
    const [rank] = useState("Script Wizard");
    const [isConfirming, setIsConfirming] = useState(false);

    const isWarrior = selectedMode === "story";

    const handleSelect = (mode: AI_Mode) => {
        if (mode === selectedMode && isConfirming) {
            handleConfirm();
        } else {
            setSelectedMode(mode);
            setIsConfirming(true);
        }
    };

    const handleConfirm = () => {
        if (selectedMode === "helpful") {
            router.push("/loopy/chat/new");
        } else {
            router.push("/loopy/story");
        }
    };

    const backgroundVariants = {
        helpful: {
            backgroundColor: "#FDFCF8",
            backgroundImage: "radial-gradient(#e2e8f0 1.5px, transparent 1.5px)",
            backgroundSize: "24px 24px",
            transition: { duration: 0.8 }
        },
        story: {
            backgroundColor: "#050505",
            backgroundImage: "radial-gradient(#1f2937 1.5px, transparent 1.5px)",
            backgroundSize: "24px 24px",
            transition: { duration: 0.8 }
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={isGlobalLoading ? { opacity: 0 } : { opacity: 1 }}
            className="flex flex-col font-sans relative overflow-hidden h-[var(--app-h)]"
        >
            {/* The Animated "Fluid Aurora" Background Effect */}
            <motion.div 
                className="absolute inset-0 z-0 overflow-hidden"
                variants={backgroundVariants}
                animate={selectedMode}
                initial={selectedMode}
            >
                {/* Real-time moving Aurora Orbs */}
                <div className="absolute inset-0 pointer-events-none opacity-80" style={{ mixBlendMode: selectedMode === "story" ? "screen" : "multiply" }}>
                    
                    {/* Orb 1: Major Float */}
                    <motion.div
                        className="absolute top-0 left-0 w-[60vw] h-[60vw] rounded-full blur-[100px] md:blur-[140px]"
                        animate={{
                            backgroundColor: selectedMode === "helpful" ? "rgba(186, 230, 253, 0.6)" : "rgba(185, 28, 28, 0.4)", // blue-200 : red-700
                            x: ["-20%", "40%", "-20%"],
                            y: ["-10%", "50%", "-10%"],
                            scale: [1, 1.2, 1]
                        }}
                        transition={{
                            backgroundColor: { duration: 1.5 },
                            x: { duration: 18, repeat: Infinity, ease: "easeInOut" },
                            y: { duration: 22, repeat: Infinity, ease: "easeInOut" },
                            scale: { duration: 20, repeat: Infinity, ease: "easeInOut" }
                        }}
                    />

                    {/* Orb 2: Counter Float */}
                    <motion.div
                        className="absolute bottom-0 right-0 w-[55vw] h-[55vw] rounded-full blur-[100px] md:blur-[140px]"
                        animate={{
                            backgroundColor: selectedMode === "helpful" ? "rgba(212, 242, 104, 0.7)" : "rgba(245, 158, 11, 0.4)", // Lime : Amber
                            x: ["20%", "-40%", "20%"],
                            y: ["20%", "-30%", "20%"],
                            scale: [1.2, 0.9, 1.2]
                        }}
                        transition={{
                            backgroundColor: { duration: 1.5 },
                            x: { duration: 20, repeat: Infinity, ease: "easeInOut" },
                            y: { duration: 24, repeat: Infinity, ease: "easeInOut" },
                            scale: { duration: 18, repeat: Infinity, ease: "easeInOut" }
                        }}
                    />

                    {/* Orb 3: Core Stabilizer */}
                    <motion.div
                        className="absolute top-[20%] right-[30%] w-[45vw] h-[45vw] rounded-full blur-[100px] md:blur-[130px]"
                        animate={{
                            backgroundColor: selectedMode === "helpful" ? "rgba(204, 253, 246, 0.8)" : "rgba(76, 29, 149, 0.5)", // teal-100 : purple-900
                            x: ["30%", "-20%", "30%"],
                            y: ["-20%", "40%", "-20%"],
                            scale: [0.8, 1.3, 0.8]
                        }}
                        transition={{
                            backgroundColor: { duration: 1.5 },
                            x: { duration: 25, repeat: Infinity, ease: "easeInOut" },
                            y: { duration: 19, repeat: Infinity, ease: "easeInOut" },
                            scale: { duration: 22, repeat: Infinity, ease: "easeInOut" }
                        }}
                    />
                </div>

                {/* Noise overlay to give it texture (Glassmorphism / Grain) */}
                <div className="absolute inset-0 bg-[url('/noise.png')] opacity-40 md:opacity-30 mix-blend-overlay pointer-events-none z-10" />
            </motion.div>

            <div className="relative z-20">
                <LoopyHeader mode="select" setMode={() => {}} rank={rank} xp={xp} />
            </div>

            <main className="flex-1 relative flex flex-col z-10 items-center justify-center p-4">
                
                <div className="text-center mb-10 relative z-30">
                    <motion.h1 
                        layout="position"
                        className={`text-5xl md:text-6xl font-black tracking-tight drop-shadow-sm transition-colors duration-700 ${selectedMode === 'story' ? 'text-white' : 'text-[#050505]'}`}
                    >
                        Awaken Loopy
                    </motion.h1>
                    <motion.p 
                        layout="position"
                        className={`mt-4 text-base md:text-lg font-bold max-w-sm mx-auto transition-colors duration-700 ${selectedMode === 'story' ? 'text-zinc-500' : 'text-slate-500'}`}
                    >
                        Spin the dial to begin your session.
                    </motion.p>
                </div>

                {/* The Duolingo Chunky Circular Dial */}
                <motion.div 
                    layout="preserve-aspect"
                    className={`relative w-[340px] h-[340px] md:w-[520px] md:h-[520px] rounded-full mb-12 border-8 transition-colors duration-700 shadow-[0_15px_0_rgba(0,0,0,0.1)] overflow-hidden flex
                    ${selectedMode === 'helpful' ? 'border-slate-200 bg-white' : 'border-zinc-800 bg-[#0a0a0a]'}
                `}>
                    
                    {/* The Sliding Rotary Thumb (The Active Background) */}
                    <motion.div 
                        className="absolute inset-x-0 inset-y-0 z-0 pointer-events-none origin-center"
                        animate={{ rotate: selectedMode === "helpful" ? 0 : 180 }}
                        transition={{ type: "spring", stiffness: 100, damping: 20, mass: 1 }}
                    >
                        <div className={`absolute top-0 bottom-0 left-0 w-1/2 rounded-l-full transition-colors duration-500 border-r-0
                            ${selectedMode === 'helpful' 
                                ? 'bg-[#D4F268] border-8 border-transparent shadow-[inset_15px_0px_30px_rgba(255,255,255,0.8),inset_-10px_0_20px_rgba(163,230,53,0.8)]' 
                                : 'bg-amber-400 border-8 border-transparent shadow-[inset_15px_0px_30px_rgba(255,255,255,0.6),inset_-10px_0_20px_rgba(217,119,6,0.8)]'}
                        `} />
                    </motion.div>

                    {/* Clickable Zones with Popping Animations */}
                    <div className="absolute inset-0 z-10 flex">
                        {/* Left Side: Guide */}
                        <div 
                            onClick={() => handleSelect("helpful")}
                            className="w-1/2 h-full relative cursor-pointer flex items-center justify-start pl-6 md:pl-16 group/left"
                        >
                            <motion.div 
                                className="flex flex-col items-center gap-2 md:gap-3 relative z-20"
                                animate={{ 
                                    scale: selectedMode === 'helpful' ? 1.25 : 0.85, 
                                    opacity: selectedMode === 'helpful' ? 1 : 0.4,
                                    x: selectedMode === 'helpful' ? 10 : 0
                                }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            >
                                <div className={`p-4 md:p-6 rounded-full transition-all duration-300 font-black border-4 shadow-sm
                                    ${selectedMode === 'helpful' 
                                        ? 'bg-white text-black border-slate-200 shadow-[0_10px_0_#e2e8f0]' 
                                        : 'bg-slate-200 text-slate-500 border-transparent'}
                                `}>
                                    <BrainCircuit size={isDesktop ? 36 : 28} strokeWidth={3} />
                                </div>
                                <span className={`font-black uppercase tracking-widest text-[10px] md:text-sm transition-colors duration-300 ${selectedMode === 'helpful' ? 'text-slate-800' : 'text-slate-400'}`}>IDE Guide</span>
                            </motion.div>
                        </div>

                        {/* Right Side: Story */}
                        <div 
                            onClick={() => handleSelect("story")}
                            className="w-1/2 h-full relative cursor-pointer flex items-center justify-end pr-6 md:pr-16 group/right"
                        >
                            <motion.div 
                                className="flex flex-col items-center gap-2 md:gap-3 relative z-20"
                                animate={{ 
                                    scale: selectedMode === 'story' ? 1.25 : 0.85, 
                                    opacity: selectedMode === 'story' ? 1 : 0.4,
                                    x: selectedMode === 'story' ? -10 : 0
                                }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            >
                                <div className={`p-4 md:p-6 rounded-full transition-all duration-300 font-black border-4 shadow-sm
                                    ${selectedMode === 'story' 
                                        ? 'bg-[#050505] text-amber-400 border-zinc-800 shadow-[0_10px_0_#27272a]' 
                                        : 'bg-zinc-800 text-zinc-500 border-transparent'}
                                `}>
                                    <BookOpen size={isDesktop ? 36 : 28} strokeWidth={3} />
                                </div>
                                <span className={`font-black uppercase tracking-widest text-[10px] md:text-sm transition-colors duration-300 ${selectedMode === 'story' ? 'text-amber-500' : 'text-zinc-500'}`}>Core Story</span>
                            </motion.div>
                        </div>
                    </div>

                    {/* Center Mascot Hub */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[130px] h-[130px] md:w-[190px] md:h-[190px] rounded-full bg-[#FAFAF8] z-30 flex items-center justify-center overflow-hidden border-[8px] border-slate-200 shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
                        {/* Floor Light tracking the selection */}
                        <motion.div 
                            className="absolute bottom-[-10%] w-[120%] h-[50%] blur-3xl rounded-full"
                            animate={{
                                background: selectedMode === "story" ? "radial-gradient(ellipse, rgba(251,146,60,0.8) 0%, transparent 70%)" : "radial-gradient(ellipse, rgba(212,242,104,0.8) 0%, transparent 70%)"
                            }}
                            transition={{ duration: 0.8 }}
                        />
                        
                        <div className="relative translate-y-3 md:translate-y-6">
                            <LoopyMascot
                                size={isDesktop ? 150 : 120}
                                mood={isWarrior ? "warrior" : "happy"}
                                hasCrown={isWarrior}
                                hasSword={isWarrior}
                            />
                        </div>
                    </div>
                </motion.div>

                {/* Duolingo Chunky Confirmation Button */}
                <div className="h-20 flex justify-center items-center z-30">
                    <AnimatePresence mode="wait">
                        {isConfirming && (
                            <motion.button
                                layout
                                initial={{ opacity: 0, scale: 0.7, y: 30 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.7, y: 20 }}
                                transition={{ 
                                    opacity: { duration: 0.2 },
                                    layout: { type: "spring", stiffness: 350, damping: 25 },
                                    default: { type: "spring", stiffness: 450, damping: 25 }
                                }}
                                onClick={handleConfirm}
                                className={`px-10 py-5 rounded-[2rem] font-black flex items-center gap-3 text-lg border-[6px] transition-all hover:-translate-y-1 active:translate-y-2 active:border-b-[6px] overflow-hidden
                                    ${selectedMode === "story" 
                                        ? "bg-amber-400 border-b-[12px] border-amber-500 border-x-amber-400 border-t-amber-400 text-amber-950" 
                                        : "bg-[#D4F268] border-b-[12px] border-[#a3e635] border-x-[#D4F268] border-t-[#D4F268] text-[#050505]"}
                                `}
                            >
                                <AnimatePresence mode="popLayout" initial={false}>
                                    <motion.div 
                                        key={selectedMode}
                                        initial={{ opacity: 0, y: -20, filter: "blur(4px)" }}
                                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                                        exit={{ opacity: 0, y: 20, filter: "blur(4px)" }}
                                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                        className="flex items-center gap-3"
                                    >
                                        <span>{selectedMode === "story" ? "Enter Glitch Kingdom" : "Initiate IDE Link"}</span>
                                        {selectedMode === "helpful" ? <Sparkles size={22} strokeWidth={3} /> : <ChevronRight size={24} strokeWidth={4} />}
                                    </motion.div>
                                </AnimatePresence>
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </motion.div>
    );
}
