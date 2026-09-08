"use client";

import { useState, useEffect } from "react";
import { PodiumDisplay } from "@/components/peer/PodiumDisplay";
import { LeaderboardTable } from "@/components/peer/LeaderboardTable";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Trophy, Globe, Users, Coins, Zap, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/utils/supabase/client";
import useSWR from "swr";
import { fetchGlobalLeaderboard, fetchFriendsLeaderboard, fetchUserRank, type LeaderboardUser } from "@/lib/swr-fetchers";
import { useUser } from "@/context/UserContext";
import { TopSlimeBorder } from "@/components/ui/TopSlimeBorder";
import { SlimePillBackground } from "@/components/ui/SlimePillBackground";
import { SlimeWaterfall } from "@/components/ui/SlimeWaterfall";
import localFont from "next/font/local";

const meltedMonster = localFont({
    src: "../../../../public/MeltedMonster.woff2",
    display: "swap",
    variable: "--font-melted-monster"
});

export default function LeaderboardPage() {
    const [activeTab, setActiveTab] = useState<"global" | "friends">("global");
    const [metric, setMetric] = useState<"xp" | "coins">("xp");
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    const { user } = useUser();
    const currentUserId = user?.id || null;

    // 1. Fetch Global Top 50
    const { data: globalDataData, isLoading: isGlobalLoading } = useSWR(
        ['globalLeaderboard', metric],
        fetchGlobalLeaderboard as any
    );
    const globalData = globalDataData || [];

    // 2. Fetch Friends Rankings
    const { data: friendsDataData, isLoading: isFriendsLoading } = useSWR(
        currentUserId ? ['friendsLeaderboard', currentUserId, metric] : null,
        fetchFriendsLeaderboard as any
    );
    const friendsData = friendsDataData || [];

    // 3. Fetch user's own fallback rank if they are not in the top 50
    const isInTop50 = currentUserId ? globalData.some((p: LeaderboardUser) => p.id === currentUserId) : true;
    
    // We only fetch this if they are logged in and NOT in the top 50
    const { data: myFallbackRank, isLoading: isRankLoading } = useSWR(
        (currentUserId && !isInTop50 && globalData.length > 0) ? ['userRank', currentUserId, metric] : null,
        fetchUserRank as any
    );

    const isLoading = isGlobalLoading || (currentUserId && isFriendsLoading) || isRankLoading;

    const data: LeaderboardUser[] = activeTab === "global" ? globalData : friendsData;
    const topThree = data.filter((u: LeaderboardUser) => u.rank <= 3);
    const rest = data.filter((u: LeaderboardUser) => u.rank > 3);

    const currentUserRank = data.find((u: LeaderboardUser) => u.id === currentUserId);

    return (
        <div className={`flex flex-col bg-[#0a0f0a] min-h-screen relative text-white ${meltedMonster.variable}`}>
            {/* Gamified Texture Overlay and Slime Waterfall */}
            <div
                className="absolute inset-0 z-0 opacity-10 mix-blend-overlay pointer-events-none"
                style={{
                    // Was an inline SVG data URI running feTurbulence (fractalNoise,
                    // 3 octaves) — procedural noise the browser had to rasterise on
                    // every page load, embedded in the HTML each render. Swapped for
                    // an equivalent pre-rendered 128px tile: same grain at this
                    // opacity, no filter work, and HTTP-cacheable across pages.
                    backgroundImage: 'url("/noise.png")',
                    backgroundRepeat: "repeat",
                    backgroundSize: "128px 128px",
                }}
            ></div>
            <SlimeWaterfall />
            
            {/* Header with Totals */}
            <div className="relative z-10 px-6 pt-16 pb-8 md:px-10 md:pt-24 md:pb-10">
                <div className="max-w-4xl mx-auto text-center">
                    <h1 className="flex flex-col items-center justify-center mb-6">
                        <motion.span 
                            animate={{ y: [0, -3, 0] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                            className="font-melted tracking-widest text-[#D4F268] text-5xl md:text-6xl lg:text-[5.5rem] pb-2 uppercase" 
                            style={{ 
                                fontFamily: 'var(--font-melted-monster)',
                                textShadow: '0px 2px 0px #A3E635, 0px 4px 0px #65A30D, 0px 6px 0px #3F6212, 0px 8px 0px #14532D, 0px 15px 20px rgba(0,0,0,0.8)',
                                WebkitTextStroke: '1.5px #0a0f0a'
                            }}
                        >
                            Leaderboards
                        </motion.span>
                    </h1>
                    <p className="text-zinc-400 font-medium mb-8">Compete with the best. Rise to the top.</p>

                    <div className="flex flex-col items-center gap-4">
                        {/* Metric Switcher */}
                        <div className="inline-flex bg-white/5 p-1 rounded-full border border-white/10 shadow-2xl backdrop-blur-md mb-2 relative">
                            <button
                                onClick={() => setMetric("xp")}
                                className={`relative px-5 py-2 text-xs font-bold transition-all rounded-full z-10 flex items-center gap-2 ${metric === "xp" ? "text-zinc-950" : "text-zinc-400 hover:text-white"}`}
                            >
                                {metric === "xp" && (
                                    <SlimePillBackground layoutId="metricTargetLeaderboard" />
                                )}
                                <Zap size={14} className={`relative z-10 ${metric === "xp" ? "text-zinc-950" : ""}`} />
                                <span className="relative z-10">XP</span>
                            </button>
                            <button
                                onClick={() => setMetric("coins")}
                                className={`relative px-5 py-2 text-xs font-bold transition-all rounded-full z-10 flex items-center gap-2 ${metric === "coins" ? "text-zinc-950" : "text-zinc-400 hover:text-white"}`}
                            >
                                {metric === "coins" && (
                                    <SlimePillBackground layoutId="metricTargetLeaderboard" />
                                )}
                                <Coins size={14} className={`relative z-10 ${metric === "coins" ? "text-zinc-950" : ""}`} />
                                <span className="relative z-10">Coins</span>
                            </button>
                        </div>

                        {/* Tab Switcher */}
                        <div className="inline-flex bg-white/5 p-1.5 rounded-full border border-white/10 shadow-2xl backdrop-blur-md relative">
                            <button
                                onClick={() => setActiveTab("global")}
                                className={`relative z-10 px-6 py-2 rounded-full text-sm font-bold transition-colors ${activeTab === "global" ? "text-zinc-950" : "text-zinc-400 hover:text-white"}`}
                            >
                                {activeTab === "global" && (
                                    <SlimePillBackground layoutId="tabTargetLeaderboard" />
                                )}
                                <span className="flex items-center gap-2 relative z-10"><Globe size={16} /> Global</span>
                            </button>
                            <button
                                onClick={() => setActiveTab("friends")}
                                className={`relative z-10 px-6 py-2 rounded-full text-sm font-bold transition-colors ${activeTab === "friends" ? "text-zinc-950" : "text-zinc-400 hover:text-white"}`}
                            >
                                {activeTab === "friends" && (
                                    <SlimePillBackground layoutId="tabTargetLeaderboard" />
                                )}
                                <span className="flex items-center gap-2 relative z-10"><Users size={16} /> Friends</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 px-6 py-8 md:px-10">
                <div className="max-w-4xl mx-auto pb-20 md:pb-6 relative">
                    {!mounted || isLoading ? (
                        <div className="flex justify-center items-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-zinc-900" />
                        </div>
                    ) : data.length > 0 ? (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={`${activeTab}-${metric}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                            >
                                {/* Podium */}
                                <PodiumDisplay users={topThree} metric={metric} />

                                {/* Table */}
                                <div className="mt-8 relative z-10">
                                    <LeaderboardTable users={rest} metric={metric} currentUserId={currentUserId} />
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    ) : (
                        <div className="text-center py-20 relative z-10">
                            <div className="bg-white/5 border border-white/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trophy className="text-zinc-500" size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-white">No rankings yet</h3>
                            <p className="text-zinc-500">Be the first to climb the leaderboard!</p>
                        </div>
                    )}

                    {/* Sticky Rank Bar — shows for in-list AND out-of-top-50 users */}
                    {mounted && (currentUserRank || myFallbackRank) && (() => {
                        const bar = currentUserRank ?? myFallbackRank!;
                        return (
                            <div className="sticky bottom-6 mt-8 mx-auto w-full max-w-2xl px-4 hidden md:block z-50">
                                <div className="bg-[#D4F268] text-zinc-950 p-4 rounded-2xl shadow-[0_10px_30px_rgba(212,242,104,0.4)] flex items-center justify-between border border-[#b1f142]">
                                    <div className="flex items-center gap-4">
                                        <span className={`font-black text-3xl text-zinc-900 drop-shadow-sm`}>#{bar.rank}</span>
                                        <div className="flex items-center gap-3">
                                            <Avatar src={bar.avatarUrl} className="w-12 h-12 border-2 border-zinc-950 shadow-md" fallback={bar.name.charAt(0)} />
                                            <div>
                                                <div className="font-black text-base text-zinc-950 flex items-center gap-2">
                                                    You
                                                    <span className="text-[9px] font-black bg-zinc-950 text-[#D4F268] px-1.5 py-0.5 rounded-md uppercase tracking-widest">
                                                        YOU
                                                    </span>
                                                </div>
                                                <div className="text-sm text-zinc-800 font-bold">
                                                    {metric === "xp" ? `${bar.xp} XP` : `${bar.coins} Coins`}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-xs font-black leading-none bg-zinc-900/10 border border-zinc-900/10 px-3 py-1.5 rounded-full text-zinc-900">
                                        {currentUserRank ? "Active" : `Rank #${bar.rank}`}
                                    </span>
                                </div>
                            </div>
                        );
                    })()}

                </div>
            </div>
        </div>
    );
}
