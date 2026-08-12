"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, useScroll, useTransform, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import { Code2, Braces, Swords, Trophy, Sparkles, ArrowRight, Terminal, User, Check } from "lucide-react";
import confetti from "canvas-confetti";
import Link from "next/link";

import dynamic from "next/dynamic";

const LiveServerLog = dynamic(() => import("./LiveServerLog"), { ssr: false });
const LootBoxShowcase = dynamic(() => import("./LootBoxShowcase"), { ssr: false });
const DevTradingCards = dynamic(() => import("./DevTradingCards"), { ssr: false });
const PlayableBossFight = dynamic(() => import("./PlayableBossFight"), { ssr: false });
const EmbeddedCodele = dynamic(() => import("./EmbeddedCodele"), { ssr: false });
const SkillTreeExplorer = dynamic(() => import("./SkillTreeExplorer"), { ssr: false });

import InView from "./InView";

export default function ExpandedSections() {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) return <div className="min-h-screen" />;

    return (
        <div className="w-full flex flex-col gap-24 md:gap-32 py-10 md:py-20 px-4 md:px-0 overflow-hidden will-change-transform">
            <InView><DevTradingCards /></InView>
            <InView><SkillTreeExplorer /></InView>
            <InView><CharacterSelect /></InView>

            <InView><LiveServerLog /></InView>

            <InView><LeaderboardSnippet /></InView>
            <InView><RPGDialogues /></InView>

            <InView><EmbeddedCodele /></InView>
            <InView><LootBoxShowcase /></InView>
            <InView><PlayableBossFight /></InView>

            <InView><InteractiveConsoleCTA /></InView>
        </div>
    );
}

// ---------------------------------------------------------------------------
// 1. CHOOSE YOUR CHARACTER (Tracks Preview)
// ---------------------------------------------------------------------------
function CharacterSelect() {
    const [selectedPath, setSelectedPath] = useState<string | null>(null);

    const handleSelect = (id: string) => {
        setSelectedPath(id);
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ["#D4F268", "#000000", "#FFFFFF"]
        });
    };

    return (
        <section className="relative w-full max-w-5xl mx-auto px-2 md:px-6">
            <div className="text-center mb-10 md:mb-16">
                <motion.div
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ type: "spring", bounce: 0.5 }}
                    className="inline-block px-4 py-1.5 rounded-full bg-black text-lime-400 text-xs font-black uppercase tracking-widest mb-4 border-2 border-lime-400 shadow-[2px_2px_0_0_#A3E635]"
                >
                    Enroll Now
                </motion.div>
                <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-black uppercase">Choose Your Path</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 perspective-[2000px]">
                <PathCard
                    title="The Builder"
                    subtitle="Web Development Mastery"
                    description="Master full-stack Web Development. Learn React, Next.js, databases, and ship real projects to your portfolio."
                    icon={<Code2 className="w-8 h-8 md:w-10 md:h-10 text-black" />}
                    color="bg-white"
                    accentColor="bg-lime-400"
                    glowColor="bg-lime-200"
                    isSelected={selectedPath === "web"}
                    onClick={() => handleSelect("web")}
                    skills={[
                        { name: "Frontend", level: 90, color: "bg-lime-400" },
                        { name: "Backend", level: 75, color: "bg-emerald-400" },
                        { name: "Design", level: 60, color: "bg-cyan-400" },
                    ]}
                />

                <PathCard
                    title="The Algomancer"
                    subtitle="DSA & Logic Mastery"
                    description="Conquer Data Structures and Algorithms optimized for technical interviews at top-tier tech companies."
                    icon={<Braces className="w-8 h-8 md:w-10 md:h-10 text-white" />}
                    color="bg-zinc-900"
                    accentColor="bg-orange-500"
                    glowColor="bg-orange-500/20"
                    textColor="text-white"
                    descColor="text-zinc-400"
                    isSelected={selectedPath === "dsa"}
                    onClick={() => handleSelect("dsa")}
                    skills={[
                        { name: "Logic", level: 95, color: "bg-orange-500" },
                        { name: "Math", level: 80, color: "bg-red-400" },
                        { name: "Speed", level: 85, color: "bg-yellow-400" },
                    ]}
                />
            </div>
        </section>
    );
}

function PathCard({
    title, subtitle, description, icon, color, accentColor, glowColor, textColor = "text-black", descColor = "text-zinc-600", skills, isSelected, onClick
}: any) {
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseXSpring = useSpring(x, { stiffness: 150, damping: 15, mass: 0.5 });
    const mouseYSpring = useSpring(y, { stiffness: 150, damping: 15, mass: 0.5 });

    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);
    const glareOpacity = useTransform(mouseXSpring, [-0.5, 0, 0.5], [0, 0.2, 0]);
    const glareX = useTransform(mouseXSpring, [-0.5, 0.5], ["0%", "100%"]);
    const glareY = useTransform(mouseYSpring, [-0.5, 0.5], ["0%", "100%"]);

    const handleMouseMove = (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        x.set(mouseX / width - 0.5);
        y.set(mouseY / height - 0.5);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <motion.div
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={onClick}
            whileTap={{ scale: 0.98 }}
            className={`${color} border-4 md:border-8 border-black rounded-3xl md:rounded-[2.5rem] p-6 md:p-10 relative overflow-hidden cursor-pointer hover:z-20 z-10 transition-shadow duration-300 will-change-transform`}
            style={{ rotateX, rotateY, transformStyle: "preserve-3d", transform: "translateZ(0)" }}
        >
            {/* Holographic Glare */}
            <motion.div
                className="absolute inset-0 z-50 pointer-events-none bg-gradient-to-br from-white to-transparent"
                style={{ opacity: glareOpacity, left: glareX, top: glareY, transform: "translate(-50%, -50%) scale(2)" }}
            />

            {/* Background Accent */}
            <div className={`absolute top-0 right-0 w-32 h-32 md:w-48 md:h-48 ${glowColor} rounded-bl-[100%] transition-transform group-hover:scale-110`} />

            {/* Selection Badge */}
            {isSelected && (
                <div className="absolute top-6 right-6 z-50 bg-black text-lime-400 border-4 border-lime-400 rounded-full w-12 h-12 flex items-center justify-center shadow-[4px_4px_0_0_#000] rotate-12">
                    <Check className="w-8 h-8" />
                </div>
            )}

            <div className="relative z-10" style={{ transform: "translateZ(40px)" }}>
                <div className={`w-14 h-14 md:w-20 md:h-20 ${accentColor} border-4 border-black rounded-2xl flex items-center justify-center mb-6 md:mb-8 shadow-[6px_6px_0_0_#000]`}>
                    {icon}
                </div>
                <h3 className={`text-3xl md:text-4xl font-black mb-2 uppercase ${textColor}`}>{title}</h3>
                <p className={`${descColor} font-bold mb-4 text-xs uppercase tracking-widest`}>{subtitle}</p>
                <p className={`${descColor} font-semibold mb-8 text-sm md:text-lg leading-relaxed`}>{description}</p>

                <div className="space-y-4">
                    {skills.map((skill: any, i: number) => (
                        <SkillBar key={i} name={skill.name} level={skill.level} color={skill.color} />
                    ))}
                </div>

                {/* Tactical Select Button */}
                <div className="mt-10 pt-6 border-t-4 border-black/5">
                    <button className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-2 ${isSelected
                        ? "bg-black text-lime-400 shadow-none translate-y-1"
                        : "bg-black text-white shadow-[0_6px_0_0_#3f3f46] hover:shadow-[0_4px_0_0_#3f3f46] hover:translate-y-1 active:shadow-none active:translate-y-1.5"
                        }`}>
                        {isSelected ? <><Check className="w-5 h-5" /> Path Selected</> : "Enroll in Track"}
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

function SkillBar({ name, level, color }: { name: string; level: number; color: string }) {
    return (
        <div className="flex items-center gap-2 md:gap-4">
            <span className="w-16 md:w-20 font-bold text-xs md:text-sm uppercase tracking-wider text-zinc-500">{name}</span>
            <div className="flex-1 h-3 md:h-4 bg-zinc-200 rounded-full overflow-hidden border-2 border-zinc-300">
                <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${level}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: 0.2, type: "spring" }}
                    className={`h-full ${color} border-r-2 border-black`}
                />
            </div>
        </div>
    );
}


// ---------------------------------------------------------------------------
// 2. LEADERBOARD SNIPPET (Social Proof/Competition)
// ---------------------------------------------------------------------------
function LeaderboardSnippet() {
    return (
        <section className="relative w-full max-w-5xl mx-auto px-2 md:px-6">
            <div className="relative bg-lime-300 border-4 md:border-8 border-black rounded-3xl md:rounded-[3rem] p-6 md:p-12 shadow-[12px_12px_0_0_#000] md:shadow-[20px_20px_0_0_#000] overflow-hidden">
                {/* Background Decor */}
                <div className="absolute -right-10 -top-10 md:-right-20 md:-top-20 opacity-20 rotate-12 pointer-events-none">
                    <Trophy className="w-48 h-48 md:w-96 md:h-96 text-black" />
                </div>

                <div className="flex flex-col md:flex-row gap-8 md:gap-12 relative z-10 items-center">
                    <div className="w-full md:w-1/2">
                        <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-4 text-black text-center md:text-left">Climb The Ranks</h2>
                        <p className="text-zinc-800 font-bold text-base md:text-lg mb-6 md:mb-8 text-center md:text-left text-balance">
                            Every module completed, every Codele puzzle solved, and every typing test aced earns you XP. Compete globally or against your study circle.
                        </p>
                        <div className="flex justify-center md:justify-start">
                            <Link href="/signup" className="w-full sm:w-auto">
                                <button className="w-full sm:w-auto h-14 px-8 rounded-full bg-black text-lime-400 text-lg font-black uppercase tracking-wider flex items-center justify-center gap-2 hover:-translate-y-1 active:translate-y-[4px] transition-transform shadow-[0_4px_0_0_#4d7c0f] active:shadow-none">
                                    <Swords className="w-5 h-5" /> Enter Arena
                                </button>
                            </Link>
                        </div>
                    </div>

                    <div className="w-full md:w-1/2">
                        <div className="bg-white border-4 border-black rounded-2xl p-4 md:p-5 shadow-[8px_8px_0_0_#000] flex flex-col gap-3">
                            <div className="flex justify-between items-center pb-2 border-b-4 border-black mb-2">
                                <span className="font-black uppercase tracking-widest text-xs md:text-sm text-zinc-500">Global Top 3 (Codele)</span>
                                <Trophy className="w-5 h-5 text-orange-500" />
                            </div>

                            {[
                                { rank: 1, name: "NeoHakr", score: "9,420 XP", bg: "bg-yellow-100", border: "border-yellow-400" },
                                { rank: 2, name: "ByteNinja", score: "8,910 XP", bg: "bg-zinc-100", border: "border-zinc-300" },
                                { rank: 3, name: "LoopMaster", score: "8,100 XP", bg: "bg-orange-50", border: "border-orange-300" }
                            ].map((user, i) => (
                                <div key={i} className={`flex items-center justify-between p-3 md:p-4 rounded-xl border-2 ${user.border} ${user.bg}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-black text-sm">#{user.rank}</div>
                                        <span className="font-bold text-sm md:text-base">{user.name}</span>
                                    </div>
                                    <span className="font-black text-sm md:text-base text-lime-600">{user.score}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}


// ---------------------------------------------------------------------------
// 3. RPG DIALOGUE TESTIMONIALS
// ---------------------------------------------------------------------------
function RPGDialogues() {
    const emptyText = "No reviews yet. You could be the first — start a track, then tell us how it went.";
    const [currentText, setCurrentText] = useState("");

    useEffect(() => {
        let i = 0;
        setCurrentText("");
        const typingInterval = setInterval(() => {
            if (i < emptyText.length) {
                // Fix for strict mode double-firing interval
                i++;
                setCurrentText(emptyText.substring(0, i));
            } else {
                clearInterval(typingInterval);
            }
        }, 30); // typing speed

        return () => clearInterval(typingInterval);
    }, [emptyText]);

    return (
        <section className="relative w-full max-w-4xl mx-auto px-2 md:px-6">
            <div className="text-center mb-8">
                <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-black uppercase">Word On The Street</h2>
            </div>

            {/* Retro Dialogue Box */}
            <div className="bg-white border-4 md:border-8 border-black rounded-xl p-4 md:p-8 shadow-[8px_8px_0_0_#000] md:shadow-[16px_16px_0_0_#000] relative">
                <div className="flex gap-4 md:gap-8">
                    {/* Avatar Portait */}
                    <div className="shrink-0">
                        <div className="w-16 h-16 md:w-24 md:h-24 bg-zinc-200 border-4 border-black rounded-lg shadow-[4px_4px_0_0_#000] flex items-center justify-center">
                            <User className="w-8 h-8 md:w-12 md:h-12 text-zinc-500" />
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-between min-h-[100px] md:min-h-[120px]">
                        <div>
                            <div className="inline-block px-3 py-1 bg-black text-white font-bold uppercase text-xs md:text-sm tracking-wider mb-2">
                                ???
                            </div>
                            <p className="text-lg md:text-2xl font-bold font-mono text-zinc-800 leading-snug">
                                {currentText}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            <p className="text-center font-bold text-zinc-400 mt-4 text-sm uppercase tracking-widest">Awaiting first entry</p>
        </section>
    );
}

// ---------------------------------------------------------------------------
// 4. INTERACTIVE CONSOLE CTA (Proving ground)
// ---------------------------------------------------------------------------
function InteractiveConsoleCTA() {
    const [inputValue, setInputValue] = useState("");
    const [unlocked, setUnlocked] = useState(false);
    const [shake, setShake] = useState(false);
    const consoleInputRef = useRef<HTMLInputElement>(null);



    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputValue.trim().toLowerCase() === "npm run start" || inputValue.trim().toLowerCase() === "init skloop") {
            setUnlocked(true);
        } else {
            setShake(true);
            setTimeout(() => setShake(false), 500);
        }
    };

    return (
        <section className="relative w-full max-w-5xl mx-auto px-2 md:px-6 mb-20">
            <div className="text-center mb-10">
                <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-black uppercase">Prove Your Worth</h2>
            </div>

            <motion.div
                animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.4 }}
                className="bg-black border-4 md:border-8 border-zinc-800 rounded-3xl md:rounded-[2rem] p-1 shadow-[12px_12px_0_0_#000] relative overflow-hidden z-10"
            >
                {/* Terminal Header */}
                <div className="bg-zinc-900 border-b-4 border-zinc-800 p-3 md:p-4 rounded-t-2xl md:rounded-[1.5rem] flex items-center justify-between">
                    <div className="flex gap-2">
                        <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-red-500" />
                        <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-yellow-500" />
                        <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-green-500" />
                    </div>
                    <div className="text-zinc-500 font-mono text-xs md:text-sm font-bold flex items-center gap-2">
                        <Terminal className="w-4 h-4" /> root@skloop:~
                    </div>
                </div>

                {/* Terminal Body */}
                <div className="p-6 md:p-10 min-h-[250px] md:min-h-[350px] flex flex-col justify-center">

                    <AnimatePresence mode="wait">
                        {!unlocked ? (
                            <motion.div
                                key="locked"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="flex flex-col items-center justify-center text-center"
                            >
                                <LockIcon className="w-12 h-12 text-zinc-600 mb-6" />
                                <p className="text-zinc-400 font-mono text-sm md:text-base mb-8">
                                    Terminal is locked. Enter <span className="text-lime-400">`npm run start`</span> to deploy your career.
                                </p>

                                <form onSubmit={handleSubmit} className="w-full max-w-md relative flex items-center">
                                    <span className="absolute left-4 text-lime-400 font-mono font-bold">$</span>
                                    <input
                                        ref={consoleInputRef}
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        className="w-full bg-zinc-900 border-2 border-zinc-700 text-white font-mono rounded-xl py-3 md:py-4 pl-10 pr-4 focus:outline-none focus:border-lime-400 focus:ring-1 focus:ring-lime-400 transition-all"
                                        placeholder="Type command here..."
                                        spellCheck="false"
                                    />
                                </form>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="unlocked"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ type: "spring", bounce: 0.5 }}
                                className="flex flex-col items-center text-center"
                            >
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,242,104,0.15)_0%,transparent_70%)] pointer-events-none" />

                                <Sparkles className="w-16 h-16 text-lime-400 mb-6 animate-pulse" />

                                <h3 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter mb-4">
                                    Access Granted
                                </h3>

                                <p className="text-zinc-400 font-bold text-base md:text-xl mb-10 max-w-md">
                                    Initialization complete. The servers are online and your player slot is ready.
                                </p>

                                <Link href="/signup" className="relative z-10 w-full sm:w-auto">
                                    <button className="w-full sm:w-auto h-16 md:h-20 px-8 md:px-12 rounded-full bg-lime-400 text-black text-lg md:text-2xl font-black flex items-center justify-center gap-3 md:gap-4 border-4 border-black shadow-[0_8px_0_0_#4d7c0f] hover:-translate-y-2 hover:shadow-[0_12px_0_0_#4d7c0f] active:translate-y-[8px] active:shadow-none transition-all uppercase tracking-widest group">
                                        Enter Skloop
                                        <ArrowRight className="w-6 h-6 md:w-8 md:h-8 group-hover:translate-x-2 transition-transform" />
                                    </button>
                                </Link>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </section>
    );
}

function LockIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
    )
}
