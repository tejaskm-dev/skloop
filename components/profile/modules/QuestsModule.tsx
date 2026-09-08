"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as LucideIcons from "lucide-react";
import { HelpCircle, Sunrise, Terminal, BookOpen, Brain, Keyboard, Map, UserPlus, FolderOpen, Flame, Gift, CheckCircle2, Circle, ArrowRight, Sparkles, X, Coins } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import Link from "next/link";
import { fetchDailyQuests } from "@/lib/swr-fetchers";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/components/ui/ToastProvider";
import { Modal } from "@/components/ui/Modal";

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
    'trophy': Gift,
};

type TabType = "daily" | "weekly" | "monthly";

export function QuestsModule() {
    const { user, refreshProfile } = useUser();
    const { mutate } = useSWRConfig();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<TabType>("daily");
    
    const { data, isLoading } = useSWR(
        user?.id ? ['dailyQuests', user.id] : null,
        fetchDailyQuests as any,
        { revalidateOnFocus: true }
    );

    const questsData = data?.questsData || { daily: [], weekly: [], monthly: [] };
    const lastCourseSlug = data?.lastCourseSlug || null;

    const [claimingId, setClaimingId] = useState<string | null>(null);
    const [chestClaiming, setChestClaiming] = useState<any | null>(null);
    const [rewardRevealed, setRewardRevealed] = useState<any | null>(null);
    const [isUnboxing, setIsUnboxing] = useState(false);
    const [flyingChest, setFlyingChest] = useState(false);
    const [taps, setTaps] = useState(0);
    const [selectedQuest, setSelectedQuest] = useState<any | null>(null);
    const [claimFeedback, setClaimFeedback] = useState<{ id: string; message: string } | null>(null);

    const handleClaimQuest = async (questId: string) => {
        if (!user || claimingId) return;

        setClaimingId(questId);
        try {
            const { claimDailyQuest } = await import('@/actions/task-actions');
            const result = await claimDailyQuest(questId);

            setClaimFeedback({ id: questId, message: result.message });
            if (result.success) {
                // Mutate the quests cache to reflect changes immediately
                mutate(['dailyQuests', user.id]);
                await refreshProfile();
            }
            setTimeout(() => setClaimFeedback(null), 3000);
        } finally {
            setClaimingId(null);
        }
    };

    const quests = questsData[activeTab] || [];
    const chestCount = data?.chestCount || 0;

    // Calculate chest progress based on completions for the current visible tab
    const completedCount = quests.filter((q: any) => q.is_completed).length;
    const requiredForChest = 3;
    const chestProgress = Math.min(completedCount, requiredForChest);
    const chestReady = chestProgress === requiredForChest;

    const chestColor = activeTab === 'daily' ? 'bg-[#9db44d]' : activeTab === 'weekly' ? 'bg-blue-500' : 'bg-amber-500';
    const chestLabel = activeTab === 'daily' ? 'Common Chest' : activeTab === 'weekly' ? 'Rare Chest' : 'Legendary Chest';

    const handleChestClick = () => {
        if (!chestReady) return;
        setChestClaiming({
            type: activeTab,
            label: chestLabel,
            color: chestColor,
            rarity: activeTab === 'daily' ? 'common' : activeTab === 'weekly' ? 'rare' : 'legendary'
        });
    };

    const handleOpenNow = async () => {
        if (!user || !chestClaiming || rewardRevealed || taps < 3 || isUnboxing) return;
        
        setIsUnboxing(true);

        try {
            const { getSealedChests, openChest } = await import("@/actions/quest-actions");
            const sealed = await getSealedChests();
            const targetChest = sealed.find(c => c.chest_type === chestClaiming.rarity);
            
            if (!targetChest) {
                setChestClaiming(null);
                setIsUnboxing(false);
                return;
            }

            const result = await openChest(targetChest.id);
            if (result.success) {
                setRewardRevealed({ ...result.reward, bonusCoins: result.bonusCoins });
                mutate(['dailyQuests', user.id]);
                await refreshProfile();
            }
        } finally {
            setIsUnboxing(false);
        }
    };

    const handleTapChest = () => {
        if (rewardRevealed || isUnboxing) return;
        const nextTaps = taps + 1;
        setTaps(nextTaps);
        if (nextTaps === 3) {
            handleOpenNow();
        }
    };

    const handleSaveToLoadout = async () => {
        if (!chestClaiming) return;
        
        setFlyingChest(true);
        await new Promise(resolve => setTimeout(resolve, 800));
        
        setChestClaiming(null);
        setFlyingChest(false);
        setTaps(0);
        toast("Chest saved to loadout! Open it later in your Collections.", "success");
    };

    return (
        <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm relative overflow-hidden">
            {/* Background flourish */}
            <div className="absolute -top-32 -right-32 w-96 h-96 bg-slate-50 rounded-full blur-3xl opacity-50 pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-800">Quests & Rewards</h2>
                    <p className="text-slate-500 mt-1">Complete objectives to earn XP, Coins, and cosmetic Chests.</p>
                </div>

                {/* Tab Switcher */}
                <div className="flex bg-slate-100 p-1 rounded-full">
                    {(["daily", "weekly", "monthly"] as TabType[]).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-full text-sm font-bold transition-all capitalize ${activeTab === tab ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

                    {/* Chest Progress Header */}
                    <div className="mb-8 p-6 bg-slate-50 rounded-[2rem] border border-slate-100 flex flex-col md:flex-row items-center gap-6 relative group">
                        <motion.div 
                            layoutId="chest-button"
                            onClick={handleChestClick}
                            className={`w-20 h-20 rounded-[1.5rem] bg-white shadow-xl flex items-center justify-center flex-shrink-0 relative cursor-pointer ${chestReady ? 'animate-bounce border-2 border-[#D4F268]' : ''}`}
                        >
                            <Gift size={32} className={chestReady ? "text-[#D4F268]" : "text-slate-400"} />
                            {chestReady && (
                                <motion.div 
                                    layoutId="chest-glow"
                                    className={`absolute inset-0 rounded-[1.5rem] ${chestColor} blur-xl opacity-40 -z-10`}
                                    animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.6, 0.4] }}
                                    transition={{ repeat: Infinity, duration: 2 }}
                                />
                            )}
                            {chestReady && (
                                <span className="absolute -top-2 -right-2 w-7 h-7 bg-[#D4F268] text-slate-900 text-xs font-black rounded-full flex items-center justify-center border-2 border-white shadow-lg">
                                    !
                                </span>
                            )}
                        </motion.div>
                        <div className="flex-grow w-full">
                            <div className="flex justify-between items-end mb-2">
                                <span className="font-black text-slate-800 uppercase tracking-widest text-xs">{chestLabel} Status</span>
                                <span className="text-xs font-black text-slate-500">{chestProgress} / {requiredForChest}</span>
                            </div>
                            <div className="h-4 bg-slate-200 rounded-full overflow-hidden flex gap-1">
                                {Array.from({ length: requiredForChest }).map((_, i) => (
                                    <div key={i} className={`h-full flex-1 rounded-full transition-all duration-500 ${i < chestProgress ? chestColor : 'bg-transparent'}`} />
                                ))}
                            </div>
                            <p className="text-xs font-medium text-slate-500 mt-2">
                                {chestReady
                                    ? "Quest cycle complete! Open your chest now for exclusive rewards."
                                    : `Complete ${requiredForChest - chestProgress} more ${activeTab} quests to earn a ${chestLabel}.`}
                            </p>
                        </div>
                        {chestReady && (
                            <button 
                                onClick={handleChestClick}
                                className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all"
                            >
                                Claim Chest
                            </button>
                        )}
                    </div>

                    {/* Quests List */}
                    <div className="space-y-4 min-h-[300px]">
                        <AnimatePresence mode="popLayout">
                            {isLoading ? (
                                <div className="animate-pulse space-y-4">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="h-20 bg-slate-50 rounded-2xl w-full" />
                                    ))}
                                </div>
                            ) : quests.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    No quests found for this cycle.
                                </div>
                            ) : (
                                [...quests]
                                    .sort((a, b) => Number(a.is_completed) - Number(b.is_completed))
                                    .map((quest) => {
                                        const RawIcon = ICON_MAP[quest.icon] || Gift;
                                        const Icon = (typeof RawIcon === 'function' || (RawIcon && typeof RawIcon === 'object' && ('$$typeof' in RawIcon || 'render' in RawIcon))) ? RawIcon : HelpCircle;
                                        const isDone = quest.is_completed;
                                        const isClaiming = claimingId === quest.key;

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
                                                className={`
                                                flex items-center justify-between p-4 md:p-6 rounded-[2rem] border transition-all cursor-pointer group/card
                                                ${isDone ? 'bg-slate-50 border-transparent opacity-60' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xl hover:-translate-y-1'}
                                            `}
                                            >
                                                <div className="flex items-center gap-6">
                                                    <motion.div 
                                                        layoutId={`quest-icon-${quest.id}`}
                                                        className={`p-4 rounded-2xl ${isDone ? 'bg-slate-200 text-slate-400' : 'bg-slate-100 text-slate-700'}`}
                                                    >
                                                        <Icon size={24} />
                                                    </motion.div>
                                                    <div>
                                                        <motion.h4 
                                                            layoutId={`quest-title-${quest.id}`}
                                                            className={`text-lg font-black ${isDone ? 'text-slate-500 line-through' : 'text-slate-800'}`}
                                                        >
                                                            {quest.title}
                                                        </motion.h4>
                                                        <p className="text-sm font-medium text-slate-500 line-clamp-1">{quest.description}</p>

                                                        {/* Partial progress bar for multi-step quests */}
                                                        {!isDone && quest.target_amount > 1 && (
                                                            <div className="mt-2 flex items-center gap-2">
                                                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-[120px]">
                                                                    <div
                                                                        className="h-full bg-[#D4F268] rounded-full transition-all duration-500"
                                                                        style={{ width: `${Math.min((quest.auto_progress / quest.target_amount) * 100, 100)}%` }}
                                                                    />
                                                                </div>
                                                                <span className="text-[10px] font-black text-slate-400 tabular-nums">
                                                                    {quest.auto_progress}/{quest.target_amount}
                                                                </span>
                                                            </div>
                                                        )}

                                                        <div className="flex items-center gap-3 mt-3">
                                                            <div className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest">
                                                                <Sparkles size={12} className="fill-blue-600" /> {quest.xp_reward} XP
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-500 bg-amber-50 px-3 py-1 rounded-full uppercase tracking-widest">
                                                                <Coins size={12} fill="#f59e0b" /> {quest.coins_reward} COINS
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6 shrink-0" onClick={e => e.stopPropagation()}>
                                                    {!isDone && quest.key === 'login' && activeTab === 'daily' ? (
                                                        <motion.button
                                                            whileHover={{ scale: 1.05 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            onClick={(e) => { e.stopPropagation(); handleClaimQuest(quest.key); }}
                                                            disabled={isClaiming}
                                                            className="text-xs font-black bg-[#D4F268] text-slate-900 px-5 py-2.5 rounded-xl hover:bg-lime-300 transition-all shadow-lg shadow-lime-900/10 uppercase tracking-widest disabled:opacity-50"
                                                        >
                                                            {isClaiming ? '...' : 'Claim'}
                                                        </motion.button>
                                                    ) : !isDone && href ? (
                                                        <Link href={href} className="text-xs font-black text-slate-500 bg-slate-50 border border-slate-100 hover:border-slate-200 px-5 py-2.5 rounded-xl transition-all uppercase tracking-widest flex items-center gap-2">
                                                            Go <ArrowRight size={14} />
                                                        </Link>
                                                    ) : null}
                                                    
                                                    <div className="pl-4 border-l border-slate-100 h-10 flex items-center">
                                                        {isDone ? <CheckCircle2 className="text-[#D4F268]" size={32} fill="#18181b" /> : <Circle className="text-slate-200" size={32} />}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })
                            )}
                        </AnimatePresence>
                    </div>

            {/* ── VISCERAL UNBOXING MODAL ── */}
            <Modal
                isOpen={!!chestClaiming}
                onClose={() => {
                    if (!isUnboxing) {
                        setChestClaiming(null);
                        setTaps(0);
                        setRewardRevealed(null);
                    }
                }}
                className="max-w-md p-0 overflow-hidden bg-transparent border-none shadow-none"
            >
                <div className="relative h-[500px] flex flex-col items-center justify-center">
                    <AnimatePresence mode="wait">
                        {!rewardRevealed ? (
                            <motion.div
                                key="chest"
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ 
                                    scale: 1, 
                                    opacity: 1,
                                    x: taps > 0 ? [0, -10, 10, -10, 10, 0] : 0,
                                    rotate: taps > 0 ? [0, -5, 5, -5, 5, 0] : 0
                                }}
                                exit={{ scale: 1.5, opacity: 0, filter: 'brightness(2)' }}
                                transition={{ 
                                    type: "spring",
                                    duration: taps > 0 ? 0.2 : 0.5
                                }}
                                onClick={handleTapChest}
                                className="cursor-pointer group relative"
                            >
                                {/* Glow Effect */}
                                <div className={`absolute inset-0 blur-3xl opacity-20 group-hover:opacity-40 transition-opacity ${
                                    chestClaiming?.rarity === 'legendary' ? 'bg-amber-400' : 
                                    chestClaiming?.rarity === 'rare' ? 'bg-blue-400' : 'bg-white'
                                }`} />
                                
                                <div className={`w-48 h-48 rounded-[3rem] flex items-center justify-center text-white shadow-2xl relative z-10 ${
                                    chestClaiming?.rarity === 'legendary' ? 'bg-gradient-to-br from-amber-400 to-orange-600' : 
                                    chestClaiming?.rarity === 'rare' ? 'bg-gradient-to-br from-blue-400 to-indigo-600' : 
                                    'bg-gradient-to-br from-zinc-400 to-zinc-600'
                                }`}>
                                    <Gift size={100} strokeWidth={1} className={taps === 0 ? "animate-bounce" : ""} />
                                    
                                    {/* Flying Ghost Chest */}
                                    {flyingChest && (
                                        <motion.div
                                            initial={{ scale: 1, x: 0, y: 0, opacity: 1 }}
                                            animate={{ 
                                                scale: 0.2, 
                                                x: 400, 
                                                y: -600, 
                                                opacity: 0 
                                            }}
                                            transition={{ duration: 0.8, ease: "circIn" }}
                                            className={`absolute inset-0 rounded-[3rem] ${chestClaiming.color} flex items-center justify-center text-white z-50`}
                                        >
                                            <Gift size={60} />
                                        </motion.div>
                                    )}
                                </div>

                                <div className={`mt-8 text-center bg-black/50 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 transition-opacity ${flyingChest ? 'opacity-0' : 'opacity-100'}`}>
                                    <p className="text-white font-black uppercase tracking-widest text-xs">
                                        {taps === 0 ? "Tap to Open" : taps === 1 ? "Keep Tapping!" : taps === 2 ? "Almost there!" : "REVEALING..."}
                                    </p>
                                    <div className="flex gap-1 justify-center mt-2">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className={`h-1 w-4 rounded-full transition-colors ${i <= taps ? 'bg-[#D4F268]' : 'bg-white/20'}`} />
                                        ))}
                                    </div>
                                </div>

                                {/* Save Button */}
                                {taps === 0 && !flyingChest && (
                                    <motion.button
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        onClick={(e) => { e.stopPropagation(); handleSaveToLoadout(); }}
                                        className="absolute -bottom-16 left-1/2 -translate-x-1/2 whitespace-nowrap px-6 py-2 bg-black/40 hover:bg-black/60 border border-white/20 rounded-full text-white text-xs font-bold transition-all"
                                    >
                                        Save to Loadout
                                    </motion.button>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="reward"
                                initial={{ scale: 0.5, opacity: 0, y: 50 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                className="w-full bg-white rounded-[3rem] p-8 text-center shadow-2xl border-4 border-[#D4F268] relative"
                            >
                                <div className="w-32 h-32 rounded-3xl mx-auto mb-6 flex items-center justify-center bg-zinc-900 text-white shadow-lg">
                                    <Gift size={60} />
                                </div>
                                <h2 className="text-3xl font-black text-zinc-900 mb-2">{rewardRevealed.name}</h2>
                                <p className="text-zinc-500 font-bold mb-8">{rewardRevealed.description || `A legendary reward earned from quests!`}</p>
                                
                                <button 
                                    onClick={() => {
                                        setChestClaiming(null);
                                        setRewardRevealed(null);
                                        setTaps(0);
                                    }}
                                    className="w-full bg-black text-white py-6 rounded-2xl font-black text-lg shadow-xl hover:shadow-[#D4F268]/20 transition-all font-outfit"
                                >
                                    Epic!
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </Modal>

                {/* Quest Detail Modal */}
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
                                                const RawIcon = ICON_MAP[selectedQuest.icon] || Gift;
                                                const Icon = (typeof RawIcon === 'function' || (RawIcon && typeof RawIcon === 'object' && ('$$typeof' in RawIcon || 'render' in RawIcon))) ? RawIcon : HelpCircle;
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
                                        {selectedQuest.description}
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
                                            {selectedQuest.is_completed && <CheckCircle2 className="text-[#D4F268]" size={24} fill="#18181b" />}
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        {!selectedQuest.is_completed && (
                                            <button 
                                                onClick={() => setSelectedQuest(null)}
                                                className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-black transition-all"
                                            >
                                                Complete Task
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => setSelectedQuest(null)}
                                            className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-200 transition-all"
                                        >
                                            Back
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
    );
}
