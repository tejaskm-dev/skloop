"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import * as LucideIcons from "lucide-react";
import { HelpCircle, CheckCircle2, Circle, Flame, Terminal, Gift, ArrowRight, Sparkles, BookOpen, Brain, Keyboard, Map, UserPlus, FolderOpen, Sunrise, FastForward, Coins, X } from "lucide-react";
import { claimDailyQuest } from "@/actions/task-actions";
import { skipQuestWithConsumable } from "@/actions/quest-actions";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { fetchDailyQuests } from "@/lib/swr-fetchers";
import { RewardBurst } from "../ui/RewardBurst";
import { useToast } from "@/components/ui/ToastProvider";
import { ChestUnboxingModal } from "../ui/ChestUnboxingModal";

const QUEST_TARGETS: Record<string, number> = {
    'codele_3w': 3,
    'lessons_5w': 5,
    'quiz_3w': 3,
    'streak_7': 7,
    'codele_15m': 15,
    'streak_20m': 20,
    'lessons_20m': 20,
    'quiz_10m': 10,
};

const ICON_MAP: Record<string, any> = {
    'sunrise': Sunrise,
    'terminal': Terminal,
    'book-open': BookOpen,
    'brain': Brain,
    'keyboard': Keyboard,
    'map': Map,
    'user-plus': UserPlus,
    'folder': FolderOpen,
    'flame': Flame,
};

type TabType = "daily" | "weekly" | "monthly";

export default function DailyQuestsWidget({ refreshKey = 0 }: { refreshKey?: number }) {
    const { profile, user, refreshProfile } = useUser();
    const router = useRouter();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<TabType>("daily");
    const [claimingId, setClaimingId] = useState<string | null>(null);
    const [claimFeedback, setClaimFeedback] = useState<{ id: string; message: string } | null>(null);
    const [isMounted, setIsMounted] = useState(false);
    const [showRewardBurst, setShowRewardBurst] = useState(false);
    const [burstOrigin, setBurstOrigin] = useState({ x: 50, y: 50 });
    const [selectedQuest, setSelectedQuest] = useState<any | null>(null);
    const [unboxingConfig, setUnboxingConfig] = useState<{
        type?: "daily" | "weekly" | "monthly";
        id?: string;
        rarity: 'common' | 'rare' | 'legendary';
    } | null>(null);
 
    useEffect(() => {
        setIsMounted(true);
    }, []);

    const { data, isLoading, mutate } = useSWR(
        user?.id ? ['dailyQuests', user.id] : null,
        fetchDailyQuests as any,
        { revalidateOnFocus: true }
    );

    const questsData = data?.questsData || { daily: [], weekly: [], monthly: [] };
    const chestCount = data?.chestCount || 0;
    const claimedCycleKeys = data?.claimedCycleKeys || [];
    const lastCourseSlug = data?.lastCourseSlug || null;
    const quests = questsData[activeTab] || [];

    const handleClaimQuest = async (questId: string, e?: React.MouseEvent) => {
        if (!user?.id || claimingId) return;
        setClaimingId(questId);
        if (e) setBurstOrigin({ x: (e.clientX / window.innerWidth) * 100, y: (e.clientY / window.innerHeight) * 100 });
        try {
            const result = await claimDailyQuest(questId);
            if (result.success) {
                setShowRewardBurst(true);
                setClaimFeedback({ id: questId, message: result.message });
                // Optimistic update: mark quest as completed immediately in the local SWR cache
                // so the Claim button doesn't briefly reappear while the re-fetch is in flight.
                await mutate(
                    (currentData: any) => {
                        if (!currentData?.questsData) return currentData;
                        const updated = { ...currentData.questsData };
                        for (const type of ['daily', 'weekly', 'monthly'] as const) {
                            updated[type] = (updated[type] || []).map((q: any) =>
                                q.key === questId ? { ...q, is_completed: true, auto_progress: -1 } : q
                            );
                        }
                        return { ...currentData, questsData: updated };
                    },
                    { revalidate: false }
                );
                await refreshProfile();
                setTimeout(() => setClaimFeedback(null), 3000);
            } else {
                setClaimFeedback({ id: questId, message: result.message });
                setTimeout(() => setClaimFeedback(null), 3000);
            }
        } finally {
            setClaimingId(null);
        }
    };

    const handleSkipQuest = async (questKey: string) => {
        if (!user || claimingId) return;
        setClaimingId(questKey);
        try {
            const result = await skipQuestWithConsumable(questKey, activeTab);
            if (result.success) {
                setClaimFeedback({ id: questKey, message: "Quest Skipped! ⚡" });
                await mutate();
                await refreshProfile();
                setTimeout(() => setClaimFeedback(null), 3000);
            } else {
                setClaimFeedback({ id: questKey, message: result.message || "Failed." });
                setTimeout(() => setClaimFeedback(null), 3000);
            }
        } finally {
            setClaimingId(null);
        }
    };

    const completedCount = isMounted ? quests.filter((q: any) => q.is_completed).length : 0;
    const requiredForChest = 3;
    const chestProgress = Math.min(completedCount, requiredForChest);
    
    const currentCycleKey = activeTab === 'daily' 
        ? `daily:${new Date().toISOString().split('T')[0]}`
        : activeTab === 'weekly' 
            ? (() => {
                const now = new Date();
                const target = new Date(now.valueOf());
                const dayNr = (now.getDay() + 6) % 7;
                target.setDate(target.getDate() - dayNr + 3);
                const firstThursday = target.valueOf();
                target.setMonth(0, 1);
                if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
                const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
                return `weekly:${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
            })()
            : `monthly:${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;

    const isCycleRewardClaimed = isMounted && claimedCycleKeys.includes(currentCycleKey);
    const chestReady = chestProgress === requiredForChest && !isCycleRewardClaimed;
    const hasUnopenedChests = isMounted && chestCount > 0;
    const chestColor = activeTab === 'daily' ? 'bg-[#9db44d]' : activeTab === 'weekly' ? 'bg-blue-500' : 'bg-amber-500';
    const chestLabel = activeTab === 'daily' ? 'Common Chest' : activeTab === 'weekly' ? 'Rare Chest' : 'Legendary Chest';

    const handleChestClick = () => {
        if (!chestReady) return;
        setUnboxingConfig({
            type: activeTab,
            rarity: activeTab === 'daily' ? 'common' : activeTab === 'weekly' ? 'rare' : 'legendary'
        });
    };

    return (
        <>
            <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-100 shadow-sm relative overflow-hidden group w-full">
                <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full blur-3xl -mr-10 -mt-20 opacity-50 z-0" />

                <div className="relative z-10 w-full">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                Quests
                                {chestReady && (
                                    <span className={`text-white text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-widest shadow-sm ${chestColor}`}>
                                        Ready
                                    </span>
                                )}
                            </h3>
                            {isMounted && (
                                <p className="text-sm text-slate-500 font-medium mt-1">
                                    {activeTab === 'daily' && `Reset in ${24 - new Date().getHours()} hours`}
                                    {activeTab === 'weekly' && `Reset in ${(() => {
                                        const nextMonday = new Date();
                                        nextMonday.setDate(nextMonday.getDate() + ((7 - nextMonday.getDay() + 1) % 7 || 7));
                                        nextMonday.setHours(0, 0, 0, 0);
                                        return Math.ceil((nextMonday.getTime() - new Date().getTime()) / 86400000);
                                    })()} days`}
                                    {activeTab === 'monthly' && `Reset in ${(() => {
                                        const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
                                        return Math.ceil((nextMonth.getTime() - new Date().getTime()) / 86400000);
                                    })()} days`}
                                </p>
                            )}
                        </div>

                        <div className="flex bg-slate-100 p-1 rounded-full relative">
                            {(["daily", "weekly", "monthly"] as TabType[]).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-4 py-2 rounded-full text-xs font-bold transition-all capitalize relative z-10 ${activeTab === tab ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {tab}
                                    {activeTab === tab && (
                                        <motion.div
                                            layoutId="active-tab-pill"
                                            className="absolute inset-0 bg-white rounded-full shadow-sm -z-10"
                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                        />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3 min-h-[250px] relative">
                        <AnimatePresence mode="wait">
                        {(!isMounted || isLoading) ? (
                                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 space-y-4">
                                    {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-50 rounded-2xl w-full animate-pulse" />)}
                                </motion.div>
                            ) : quests.length === 0 ? (
                                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center text-slate-400">
                                    No quests found.
                                </motion.div>
                            ) : (
                                <motion.div key="content" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="space-y-3 w-full">
                                    {[...quests]
                                        .sort((a, b) => Number(a.is_completed) - Number(b.is_completed))
                                        .map((quest) => {
                                            const Icon = ICON_MAP[quest.icon] || Gift;
                                            const isDone = quest.is_completed;
                                            const isClaiming = claimingId === quest.key;
                                            const feedback = claimFeedback?.id === quest.key ? claimFeedback?.message : null;
                                            const progressRaw = quest.auto_progress === -1 ? 1 : quest.auto_progress;
                                            let href = "";
                                            if (!isDone) {
                                                if (quest.key === 'codele') href = '/practice/daily-codele';
                                                else if (quest.key === 'type_race') href = '/practice/typing-speed';
                                                else if (quest.key === 'quiz_attempt') href = '/practice/dsa-quiz';
                                                else if (quest.key === 'lesson') href = lastCourseSlug ? `/course/${lastCourseSlug}` : '/course';
                                            }

                                            return (
                                                <motion.div 
                                                    key={quest.id} 
                                                    layoutId={`quest-bg-${quest.id}`}
                                                    initial={{ opacity: 0, scale: 0.95 }} 
                                                    animate={{ opacity: 1, scale: 1 }} 
                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                    onClick={() => setSelectedQuest(quest)}
                                                    className={`group/quest flex items-center justify-between p-3 md:p-4 rounded-2xl transition-all w-full border cursor-pointer relative z-10 ${isDone ? 'bg-slate-50 border-slate-100 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'}`}
                                                >
                                                    <div className="flex items-center gap-3 md:gap-4 min-w-0">
                                                        <motion.div 
                                                            layoutId={`quest-icon-${quest.id}`}
                                                            className={`p-2 rounded-xl flex-shrink-0 ${isDone ? 'bg-slate-200 text-slate-400' : 'bg-slate-100 text-slate-700'}`}
                                                        >
                                                            <Icon size={18} />
                                                        </motion.div>
                                                        <div className={`flex flex-col items-start min-w-0 ${isDone ? 'opacity-50' : ''}`}>
                                                            <motion.h4 
                                                                layoutId={`quest-title-${quest.id}`}
                                                                className={`font-bold text-xs md:text-sm truncate w-full ${isDone ? 'text-slate-500 line-through' : 'text-slate-800 group-hover/quest:text-black'}`}
                                                            >
                                                                {quest.title}
                                                            </motion.h4>
                                                            <div className="flex gap-2 items-center mt-1">
                                                                <div className="flex items-center gap-1 text-[10px] font-bold text-blue-500 bg-blue-50/50 px-1.5 py-0.5 rounded-md"><Sparkles size={10} />{quest.xp_reward}</div>
                                                                <div className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-50/50 px-1.5 py-0.5 rounded-md"><Coins size={10} />{quest.coins_reward}</div>
                                                            </div>
                                                            {!isDone && quest.type !== 'daily' && QUEST_TARGETS[quest.key] && (
                                                                <div className="w-32 md:w-40 mt-2">
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <span className="text-[10px] font-bold text-slate-400">Progress</span>
                                                                        <span className="text-[10px] font-bold text-slate-600">{progressRaw} / {QUEST_TARGETS[quest.key]}</span>
                                                                    </div>
                                                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                                        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (progressRaw / QUEST_TARGETS[quest.key]) * 100)}%` }} className="h-full bg-gradient-to-r from-lime-400 to-emerald-500 rounded-full" transition={{ type: "spring", damping: 20, stiffness: 100 }} />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 md:gap-3 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                                                        <AnimatePresence>{feedback && <motion.span initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="text-[10px] font-bold text-emerald-600 hidden sm:inline">{feedback}</motion.span>}</AnimatePresence>
                                                        {!isDone && quest.key === 'login' && activeTab === 'daily' ? (
                                                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); handleClaimQuest(quest.key, e); }} disabled={isClaiming} className="text-[10px] font-bold bg-[#D4F268] text-slate-900 px-3 py-1.5 rounded-lg hover:bg-lime-300 transition-colors disabled:opacity-70 shadow-sm relative z-20">
                                                                {isClaiming ? '...' : 'Claim'}
                                                            </motion.button>
                                                        ) : !isDone && href ? (
                                                            <div className="flex gap-1.5 relative z-20">
                                                                {profile?.inventory?.includes('item_daily_skip') && <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); handleSkipQuest(quest.key); }} className="text-[10px] font-bold text-zinc-500 bg-zinc-50 border border-zinc-100 px-2 py-1 rounded-lg"><FastForward size={12} /></motion.button>}
                                                                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.9 }} onClick={(e) => e.stopPropagation()}><Link href={href} className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-transparent hover:border-slate-200 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"><span>Go</span> <ArrowRight size={12} /></Link></motion.div>
                                                            </div>
                                                        ) : null}
                                                        <div className="flex flex-col items-end pl-2 border-l border-slate-100">
                                                            {isDone ? <CheckCircle2 className="text-[#D4F268]" size={24} fill="#18181b" /> : <Circle className="text-slate-300" size={24} />}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between gap-4">
                    <div className="flex-grow">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{chestLabel}</span>
                            <span className="text-xs font-bold text-slate-800">{chestProgress} / {requiredForChest}</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex gap-1">
                            {Array.from({ length: requiredForChest }).map((_, i) => (
                                <div key={i} className={`h-full flex-1 rounded-full transition-all duration-500 ${i < chestProgress ? chestColor : 'bg-transparent'}`} />
                            ))}
                        </div>
                    </div>
                    <motion.button 
                        layoutId="chest-button"
                        whileHover={{ scale: (chestReady || hasUnopenedChests) ? 1.05 : 1 }} 
                        whileTap={{ scale: (chestReady || hasUnopenedChests) ? 0.95 : 1 }} 
                        onClick={() => {
                            if (chestReady) handleChestClick();
                            else if (hasUnopenedChests) router.push('/profile');
                        }}
                        className={`px-6 h-14 rounded-2xl flex items-center gap-3 justify-center flex-shrink-0 shadow-sm relative transition-all ${chestReady ? `${chestColor} animate-bounce text-white border-none shadow-xl scale-110` : hasUnopenedChests ? 'bg-amber-100 border-2 border-amber-300 text-amber-600 animate-pulse' : 'bg-slate-50 border border-slate-200 text-slate-400 opacity-70 cursor-not-allowed'}`}
                    >
                        <Gift size={24} className={chestReady || hasUnopenedChests ? 'animate-bounce' : ''} />
                        {chestReady && <span className="font-black text-sm uppercase tracking-widest">Claim Chest</span>}
                        {(chestReady || hasUnopenedChests) && !chestReady && (
                            <span className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                {chestCount}
                            </span>
                        )}
                        {chestReady && (
                           <motion.div 
                             layoutId="chest-glow"
                             className={`absolute inset-0 rounded-2xl ${chestColor} blur-xl opacity-40 -z-10`}
                             animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.6, 0.4] }}
                             transition={{ repeat: Infinity, duration: 2 }}
                           />
                        )}
                    </motion.button>
                </div>

                <RewardBurst trigger={showRewardBurst} onComplete={() => setShowRewardBurst(false)} origin={burstOrigin} />
            </div>

            <ChestUnboxingModal 
                isOpen={!!unboxingConfig}
                onClose={() => setUnboxingConfig(null)}
                chestData={unboxingConfig}
                onSuccess={() => mutate()}
            />

            <AnimatePresence>
                {selectedQuest && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                            onClick={(e) => { e.stopPropagation(); setSelectedQuest(null); }}
                        />
                        <motion.div
                            layoutId={`quest-bg-${selectedQuest.id}`}
                            className="relative w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-2xl overflow-hidden border border-slate-100 z-[10000]"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-lime-400/10 rounded-full blur-2xl -mr-10 -mt-10" />
                            
                            <div className="relative z-10">
                                <div className="flex items-start justify-between mb-6">
                                    <motion.div 
                                        layoutId={`quest-icon-${selectedQuest.id}`}
                                        className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700 shadow-inner"
                                    >
                                        {(() => {
                                            const Icon = ICON_MAP[selectedQuest.icon] || Gift;
                                            return <Icon size={32} />;
                                        })()}
                                    </motion.div>
                                    <button 
                                        onClick={() => setSelectedQuest(null)}
                                        className="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                <motion.h3 
                                    layoutId={`quest-title-${selectedQuest.id}`}
                                    className="text-2xl font-black text-slate-900 leading-tight mb-2"
                                >
                                    {selectedQuest.title}
                                </motion.h3>
                                
                                <p className="text-slate-500 font-medium leading-relaxed mb-6">
                                    {selectedQuest.description || "Complete this quest to earn rewards and progress through your technical journey."}
                                </p>

                                <div className="space-y-4 mb-8">
                                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reward Pool</span>
                                            <div className="flex gap-3 mt-1">
                                                <div className="flex items-center gap-1 text-sm font-black text-blue-600">
                                                    <Sparkles size={14} className="fill-blue-600" />
                                                    {selectedQuest.xp_reward} XP
                                                </div>
                                                <div className="flex items-center gap-1 text-sm font-black text-amber-500">
                                                    <Coins size={14} className="fill-amber-500" />
                                                    {selectedQuest.coins_reward} COINS
                                                </div>
                                            </div>
                                        </div>
                                        {(selectedQuest.is_completed || selectedQuest.auto_progress === -1) && <CheckCircle2 className="text-[#D4F268]" size={24} fill="#18181b" />}
                                    </div>

                                    {!(selectedQuest.is_completed || selectedQuest.auto_progress === -1) && selectedQuest.type !== 'daily' && QUEST_TARGETS[selectedQuest.key] && (
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Progress</span>
                                                <span className="text-xs font-black text-slate-900">
                                                    {selectedQuest.auto_progress} / {QUEST_TARGETS[selectedQuest.key]}
                                                </span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                                <motion.div 
                                                    initial={{ width: 0 }} 
                                                    animate={{ width: `${Math.min(100, (selectedQuest.auto_progress / QUEST_TARGETS[selectedQuest.key]) * 100)}%` }} 
                                                    className="h-full bg-gradient-to-r from-lime-400 to-emerald-500"
                                                    transition={{ type: "spring", damping: 20, stiffness: 100 }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3">
                                    {!(selectedQuest.is_completed || selectedQuest.auto_progress === -1) && selectedQuest.key === 'login' && activeTab === 'daily' ? (
                                        <button 
                                            onClick={(e) => { handleClaimQuest(selectedQuest.key, e); setSelectedQuest(null); }}
                                            className="flex-1 bg-[#D4F268] text-slate-900 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-lime-900/10 hover:bg-lime-300 transition-all active:scale-95"
                                        >
                                            Claim Rewards
                                        </button>
                                    ) : !(selectedQuest.is_completed || selectedQuest.auto_progress === -1) && (() => {
                                        if (selectedQuest.key === 'codele') return '/practice/daily-codele';
                                        if (selectedQuest.key === 'type_race') return '/practice/typing-speed';
                                        if (selectedQuest.key === 'quiz_attempt') return '/practice/dsa-quiz';
                                        if (selectedQuest.key === 'lesson') return lastCourseSlug ? `/course/${lastCourseSlug}` : '/course';
                                        return null;
                                    })() ? (
                                        <button 
                                            onClick={() => {
                                                const url = (() => {
                                                    if (selectedQuest.key === 'codele') return '/practice/daily-codele';
                                                    if (selectedQuest.key === 'type_race') return '/practice/typing-speed';
                                                    if (selectedQuest.key === 'quiz_attempt') return '/practice/dsa-quiz';
                                                    if (selectedQuest.key === 'lesson') return lastCourseSlug ? `/course/${lastCourseSlug}` : '/course';
                                                    return null;
                                                })();
                                                if (url) router.push(url);
                                                setSelectedQuest(null);
                                            }}
                                            className="flex-1 bg-zinc-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-zinc-900/20 hover:bg-zinc-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                                        >
                                            Go to Activity <ArrowRight size={16} />
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => setSelectedQuest(null)}
                                            className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                                        >
                                            {(selectedQuest.is_completed || selectedQuest.auto_progress === -1) ? "Completed" : "Back"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}
