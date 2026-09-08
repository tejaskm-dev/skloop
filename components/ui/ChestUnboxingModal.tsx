"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Modal } from "@/components/ui/Modal";
import { ChestGraphic } from "./ChestGraphic";
import { Button } from "@/components/ui/Button";
import { Gift, Coins, Sparkles, ChevronDown, ChevronUp, Check, ArrowRight, Loader2, HelpCircle, X } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/components/ui/ToastProvider";
import confetti from "canvas-confetti";
import { saveChestAction, openChest, claimAndOpenChest } from "@/actions/quest-actions";

const getIcon = (name: string | null) => {
    if (!name) return HelpCircle;
    const Icon = (LucideIcons as any)[name];
    if (typeof Icon === 'function' || (Icon && typeof Icon === 'object' && ('$$typeof' in Icon || 'render' in Icon))) {
        return Icon;
    }
    return HelpCircle;
};

interface ChestUnboxingModalProps {
    isOpen: boolean;
    onClose: () => void;
    chestData: {
        id?: string; // If opening existing
        type?: "daily" | "weekly" | "monthly"; // If claiming from cycle
        rarity: 'common' | 'rare' | 'legendary';
    } | null;
    onSuccess?: () => void;
}

export function ChestUnboxingModal({ isOpen, onClose, chestData, onSuccess }: ChestUnboxingModalProps) {
    const { user, refreshProfile } = useUser();
    const { toast } = useToast();
    const [step, setStep] = useState<"preview" | "tapping" | "revealed">("preview");
    const [showLootTable, setShowLootTable] = useState(false);
    const [lootPool, setLootPool] = useState<any[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [taps, setTaps] = useState(0);
    const [reward, setReward] = useState<any | null>(null);
    const [bonusCoins, setBonusCoins] = useState(0);

    // Fetch loot pool for preview
    useEffect(() => {
        if (isOpen && chestData) {
            const fetchLoot = async () => {
                const supabase = createClient();
                const { data } = await supabase
                    .from('quest_exclusives')
                    .select('*')
                    .eq('rarity', chestData.rarity);
                setLootPool(data || []);
            };
            fetchLoot();
            // Reset state ONLY when opening the modal for a new chest
            setStep("preview");
            setTaps(0);
            setReward(null);
            setShowLootTable(false);
        }
    }, [isOpen]); // Depend on isOpen to reset state on new open

    if (!chestData) return null;

    const handleSaveToLoadout = async () => {
        if (!user || !chestData.type) return;
        setIsProcessing(true);
        try {
            const res = await saveChestAction(chestData.type);
            if (res.success) {
                toast("Chest saved to your loadout!", "success");
                onSuccess?.();
                onClose();
            } else {
                toast(res.error || "Failed to save chest.", "error");
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleStartOpening = () => {
        setStep("tapping");
    };

    const handleTap = (e: React.MouseEvent) => {
        if (isProcessing || step !== "tapping") return;
        
        // Visual feedback for tap
        const nextTaps = taps + 1;
        setTaps(nextTaps);
        
        if (nextTaps >= 3) {
            handleFinalReveal();
        }
    };

    const handleFinalReveal = async () => {
        if (!user || isProcessing) return;
        setIsProcessing(true);
        try {
            let res;
            if (chestData.id) {
                // Opening existing
                res = await openChest(chestData.id);
            } else if (chestData.type) {
                // Claiming AND opening
                res = await claimAndOpenChest(chestData.type);
            }

            const result = res as { success: boolean; reward: any; bonusCoins: number; error?: string };

            if (result?.success) {
                setReward(result.reward || null);
                setBonusCoins(result.bonusCoins || 0);
                setStep("revealed");
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#D4F268', '#ffffff', '#000000']
                });

                // Refresh profile coins/inventory in background — do NOT call onSuccess here
                // because mutate() would trigger a parent re-render that can reset the step back
                // to "preview" before the user sees the reward. onSuccess is called on dismiss.
                await refreshProfile();
            } else {
                toast(result?.error || "Failed to open chest.", "error");
                setStep("preview");
                setTaps(0);
            }
        } catch (err) {
            console.error("Final reveal error:", err);
            toast("An error occurred.", "error");
            setStep("preview");
            setTaps(0);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => !isProcessing && onClose()}
            className="max-w-md p-0 overflow-hidden bg-transparent border-none shadow-none"
        >
            <div className="relative min-h-[550px] flex flex-col items-center justify-center p-4">
                {/* Close Button (only in preview or revealed) */}
                {(step === "preview" || step === "revealed") && !isProcessing && (
                    <button 
                        onClick={onClose}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/40 transition-colors z-[100]"
                    >
                        <X size={20} />
                    </button>
                )}

                <AnimatePresence>
                    {step === "preview" && (
                        <motion.div
                            key="preview"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8, y: 20 }}
                            className="w-full bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 flex flex-col items-center"
                        >
                            <div className="w-40 h-40 mb-6">
                                <ChestGraphic rarity={chestData.rarity} isOpen={false} />
                            </div>

                            <h2 className="text-2xl font-black text-slate-900 capitalize mb-2">
                                {chestData.rarity} Chest
                            </h2>
                            <p className="text-slate-500 font-medium text-center mb-6">
                                Contains exclusive items and bonus coins!
                            </p>

                            <div className="w-full space-y-3 mb-8">
                                <button
                                    onClick={() => setShowLootTable(!showLootTable)}
                                    className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                                            <Gift size={16} className="text-slate-600" />
                                        </div>
                                        <span className="text-sm font-bold text-slate-700">Possible Rewards</span>
                                    </div>
                                    {showLootTable ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </button>

                                <AnimatePresence>
                                    {showLootTable && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="grid grid-cols-2 gap-2 p-2">
                                                {lootPool.length > 0 ? lootPool.map((item) => {
                                                    const Icon = getIcon(item.icon_name);
                                                    return (
                                                        <div key={item.id} className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-100">
                                                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${item.gradient} flex items-center justify-center shrink-0`}>
                                                                <Icon size={14} className="text-white" />
                                                            </div>
                                                            <span className="text-[10px] font-black text-slate-900 truncate">{item.name}</span>
                                                        </div>
                                                    );
                                                }) : (
                                                    <div className="col-span-2 py-4 text-center text-xs text-slate-400 font-bold">
                                                        Loading rewards pool...
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-100">
                                                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                                                        <Coins size={14} className="text-amber-500" />
                                                    </div>
                                                    <span className="text-[10px] font-black text-slate-900">
                                                        {chestData.rarity === 'legendary' ? '1000' : chestData.rarity === 'rare' ? '250' : '50'}+ Coins
                                                    </span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="w-full grid grid-cols-2 gap-3">
                                {chestData.type && (
                                    <Button
                                        variant="outline"
                                        onClick={handleSaveToLoadout}
                                        disabled={isProcessing}
                                        className="rounded-2xl h-14 font-black uppercase tracking-widest text-xs border-2"
                                    >
                                        {isProcessing ? <Loader2 className="animate-spin" /> : "Save to Loadout"}
                                    </Button>
                                )}
                                <Button
                                    onClick={handleStartOpening}
                                    className={`rounded-2xl h-14 font-black uppercase tracking-widest text-xs shadow-lg shadow-black/10 ${chestData.type ? '' : 'col-span-2'}`}
                                >
                                    Open Now
                                </Button>
                            </div>
                        </motion.div>
                    )}

                    {step === "tapping" && (
                        <motion.div
                            key="tapping"
                            initial={{ opacity: 0, scale: 0.9, y: 50 }}
                            animate={{ 
                                opacity: 1, 
                                scale: 1, 
                                y: 0,
                                x: taps > 0 ? [0, -10, 10, -10, 10, 0] : 0,
                                rotate: taps > 0 ? [0, -5, 5, -5, 5, 0] : 0
                            }}
                            exit={{ opacity: 0, scale: 1.5, filter: "brightness(2)" }}
                            transition={{ 
                                x: { type: "keyframes", duration: 0.2 },
                                rotate: { type: "keyframes", duration: 0.2 }
                            }}
                            onClick={handleTap}
                            className="cursor-pointer flex flex-col items-center"
                        >
                            <div className="w-64 h-64 mb-8">
                                <ChestGraphic rarity={chestData.rarity} isOpen={false} />
                            </div>

                            <div className="bg-black/50 backdrop-blur-md px-10 py-6 rounded-full border border-white/20 text-center shadow-2xl">
                                <p className="text-white font-black uppercase tracking-widest text-sm mb-3">
                                    {isProcessing ? "REVEALING..." : taps === 0 ? "Tap to Break Seal" : taps === 1 ? "Keep Going!" : "One More Tap!"}
                                </p>
                                <div className="flex gap-2 justify-center">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className={`h-2 w-8 rounded-full transition-all duration-300 ${i <= taps ? 'bg-[#D4F268] shadow-[0_0_10px_rgba(212,242,104,0.8)]' : 'bg-white/20'}`} />
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === "revealed" && (
                        <motion.div
                            key="revealed"
                            initial={{ opacity: 0, scale: 0.8, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            className="w-full bg-white rounded-[3rem] p-10 text-center shadow-2xl border-4 border-[#D4F268] relative flex flex-col items-center"
                        >
                            <div className="w-48 h-48 mb-6">
                                <ChestGraphic
                                    rarity={chestData.rarity}
                                    isOpen={true}
                                    icon={reward ? (() => {
                                        const Icon = getIcon(reward.icon_name);
                                        return <Icon size={60} className="text-white" />;
                                    })() : <Coins size={60} className="text-white" />}
                                />
                            </div>

                            {reward ? (
                                <>
                                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-zinc-900 text-[#D4F268] rounded-full text-[10px] font-black uppercase tracking-widest mb-4 shadow-xl">
                                        <Sparkles size={12} className="fill-[#D4F268]" />
                                        {reward.rarity} {reward.type.replace('_', ' ')}
                                    </div>
                                    <h2 className="text-3xl font-black text-slate-900 mb-2">{reward.name}</h2>
                                    <p className="text-slate-500 font-bold mb-6">{reward.description || "An exclusive quest reward!"}</p>
                                </>
                            ) : (
                                <>
                                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest mb-4 shadow-xl">
                                        <Coins size={12} />
                                        Coin Reward
                                    </div>
                                    <h2 className="text-3xl font-black text-slate-900 mb-2">Chest Opened!</h2>
                                    <p className="text-slate-500 font-bold mb-6">You received bonus coins!</p>
                                </>
                            )}

                            <div className="flex items-center gap-3 bg-amber-50 px-6 py-4 rounded-2xl border-2 border-amber-100/50 mb-8 w-full">
                                <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-200 shrink-0">
                                    <Coins size={24} className="text-white" />
                                </div>
                                <div className="text-left flex-1">
                                    <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Bonus Reward</span>
                                    <div className="text-xl font-black text-amber-700">+{bonusCoins} Coins</div>
                                </div>
                                <div className="text-[10px] font-black text-amber-500 bg-white px-2 py-1 rounded-lg border border-amber-100">
                                    CLAIMED
                                </div>
                            </div>

                            <Button
                                onClick={() => { onSuccess?.(); onClose(); }}
                                className="w-full bg-black text-white py-8 rounded-2xl font-black text-xl shadow-xl hover:shadow-[#D4F268]/20 transition-all group"
                            >
                                <span className="flex items-center justify-center gap-3">
                                    Epic! <ArrowRight size={24} className="group-hover:translate-x-2 transition-transform" />
                                </span>
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </Modal>
    );
}
