"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Gift, Sparkles, AlertCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { getSealedChests, openChest } from "@/actions/quest-actions";
import { useUser } from "@/context/UserContext";
import { useAppScroll } from "@/components/providers/AppScrollProvider";

interface TrophyCaseModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function TrophyCaseModal({ isOpen, onClose }: TrophyCaseModalProps) {
    const { user, profile, refreshProfile } = useUser();
    const [activeTab, setActiveTab] = useState<"owned" | "chests">("owned");

    // Data
    const [chests, setChests] = useState<any[]>([]);
    const [inventory, setInventory] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Opening state
    const [openingChestId, setOpeningChestId] = useState<string | null>(null);
    const [rewardReveal, setRewardReveal] = useState<any | null>(null);
    const [focusedChestId, setFocusedChestId] = useState<string | null>(null);
    const [taps, setTaps] = useState(0);

    const fetchData = async () => {
        if (!user) return;
        setIsLoading(true);
        const supabase = createClient();

        const sealed = await getSealedChests();
        setChests(sealed);

        // 1. Shop products from user_inventory table
        const { data: inv } = await supabase
            .from("user_inventory")
            .select(`
                quantity,
                products (
                    id, name, type, description, rarity, image_url
                )
            `)
            .eq("user_id", user.id);

        const shopItems = (inv || []).map(row => ({
            source: 'shop',
            quantity: row.quantity,
            ...(row.products as any)
        }));

        // 2. Quest exclusive rewards stored as string IDs in profiles.inventory jsonb
        const exclusiveIds: string[] = Array.isArray(profile?.inventory) ? profile.inventory : [];
        let exclusiveItems: any[] = [];
        if (exclusiveIds.length > 0) {
            const { data: exclusives } = await supabase
                .from('quest_exclusives')
                .select('id, name, type, rarity, icon_name, gradient')
                .in('id', exclusiveIds);
            exclusiveItems = (exclusives || []).map(item => ({
                source: 'quest',
                id: item.id,
                name: item.name,
                type: item.type,
                rarity: item.rarity,
                icon_name: item.icon_name,
                gradient: item.gradient,
                quantity: 1,
            }));
        }

        setInventory([...shopItems, ...exclusiveItems]);
        setIsLoading(false);
    };

    const { lenis } = useAppScroll();

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, user?.id]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isOpen]);

    const handleFocusChest = (chestId: string) => {
        setFocusedChestId(chestId);
        setTaps(0);
    };

    const handleTapChest = async () => {
        if (openingChestId) return;
        if (taps < 2) {
            setTaps(prev => prev + 1);
        } else {
            setTaps(3);
            await handleOpenChest(focusedChestId!);
        }
    };

    const handleOpenChest = async (chestId: string) => {
        if (!user) return;
        setOpeningChestId(chestId);
        try {
            await new Promise(r => setTimeout(r, 600));
            const result = await openChest(chestId);
            if (result.success) {
                setRewardReveal({ ...result.reward, bonusCoins: result.bonusCoins });
                refreshProfile();
            } else {
                console.error("Chest Open Error:", result.error);
                alert("Failed to grant chest reward! Run inventory_rls_fix.sql: " + result.error);
                setOpeningChestId(null);
                setFocusedChestId(null);
            }
        } catch (e) {
            console.error(e);
            setOpeningChestId(null);
            setFocusedChestId(null);
        }
    };

    const handleCloseReveal = () => {
        setRewardReveal(null);
        setOpeningChestId(null);
        setFocusedChestId(null);
        setTaps(0);
        fetchData();
    };

    if (!isOpen) return null;

    // --- Helpers ---
    const getRarityColor = (rarity: string) => {
        if (rarity === "legendary") return "text-amber-500 bg-amber-50 border-amber-200";
        if (rarity === "rare") return "text-blue-500 bg-blue-50 border-blue-200";
        return "text-slate-500 bg-slate-50 border-slate-200";
    };

    // --- Sub-renders ---
    const renderReveal = () => (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-12"
        >
            <div className="relative mb-8">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 bg-amber-200 blur-[80px] rounded-full opacity-50 -z-10"
                />
                <Gift size={80} className="text-amber-500" />
            </div>
            <h3 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">Reward Unlocked!</h3>
            <div className={`mt-6 p-6 rounded-3xl border-2 flex flex-col items-center gap-4 min-w-[280px] ${getRarityColor(rewardReveal.rarity)}`}>
                <div className="w-20 h-20 bg-white rounded-2xl shadow-sm flex items-center justify-center">
                    <Sparkles size={32} className={rewardReveal.rarity === "legendary" ? "text-amber-500" : "text-blue-500"} />
                </div>
                <div className="text-center">
                    <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">{rewardReveal.rarity}</p>
                    <h4 className="text-lg font-bold">{rewardReveal.name}</h4>
                    <p className="text-sm opacity-80 mt-1">{rewardReveal.type?.replace("_", " ")}</p>
                </div>
            </div>
            {rewardReveal.bonusCoins > 0 && (
                <div className="mt-4 px-4 py-2 bg-amber-100 text-amber-600 rounded-full text-sm font-bold flex items-center gap-2">
                    <AlertCircle size={16} /> +{rewardReveal.bonusCoins} Bonus Coins
                </div>
            )}
            <button
                onClick={handleCloseReveal}
                className="mt-10 px-8 py-3 bg-slate-900 text-white rounded-full font-bold shadow-lg hover:bg-slate-800 transition-all hover:scale-105 active:scale-95"
            >
                Awesome!
            </button>
        </motion.div>
    );

    const renderFocusedChest = () => {
        const chest = chests.find(c => c.id === focusedChestId);
        if (!chest) return null;
        const isOpening = openingChestId === chest.id;
        const isLegendary = chest.chest_type === "legendary";
        const isRare = chest.chest_type === "rare";
        let color = "bg-zinc-800";
        let glow = "shadow-[0_0_30px_rgba(161,161,170,0.5)]";
        if (isLegendary) { color = "bg-orange-500"; glow = "shadow-[0_0_50px_rgba(249,115,22,0.8)]"; }
        else if (isRare) { color = "bg-lime-500"; glow = "shadow-[0_0_40px_rgba(212,242,104,0.8)]"; }
        const currentScale = 1 + (taps * 0.15);

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-40 bg-white/70 backdrop-blur-md flex flex-col items-center justify-center p-6 rounded-[2rem]"
            >
                <div className="absolute top-8 right-8">
                    {!isOpening && (
                        <button onClick={() => setFocusedChestId(null)} className="p-3 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors">
                            <X size={24} />
                        </button>
                    )}
                </div>
                <h3 className="text-3xl font-black mb-16 uppercase tracking-tight text-slate-800">
                    {isOpening ? "Unlocking..." : `Tap to power up! (${taps}/3)`}
                </h3>
                <motion.div
                    animate={
                        isOpening
                            ? { scale: currentScale * 0.9, x: [0, -10, 10, -10, 10, 0], transition: { duration: 0.5, repeat: Infinity } }
                            : { scale: currentScale }
                    }
                    whileTap={!isOpening ? { scale: currentScale * 0.9 } : {}}
                    onClick={handleTapChest}
                    className="relative h-64 w-64 md:h-80 md:w-80 flex flex-col items-center justify-end cursor-pointer"
                >
                    <div className="relative w-48 h-40 md:w-64 md:h-52 pointer-events-none z-10">
                        <motion.div
                            animate={isOpening ? { scaleY: 0.95 } : { scaleY: 1 }}
                            className={`absolute bottom-0 w-full h-3/4 ${color} border-4 md:border-8 border-black rounded-b-xl shadow-[12px_12px_0_0_#000] z-10 transform origin-bottom`}
                        >
                            <div className="absolute top-0 bottom-0 left-4 w-3 bg-black/20" />
                            <div className="absolute top-0 bottom-0 right-4 w-3 bg-black/20" />
                            <div className="absolute top-6 left-1/2 -translate-x-1/2 w-6 h-10 bg-black rounded-t-full rounded-b border-2 border-white/20" />
                        </motion.div>
                        <motion.div
                            initial={false}
                            animate={isOpening ? { rotateX: -60, y: -10 } : { rotateX: 0, y: 0 }}
                            transition={{ type: "spring", bounce: 0.5, stiffness: 200 }}
                            style={{ transformOrigin: "bottom" }}
                            className={`absolute top-0 w-full h-1/2 ${color} border-4 md:border-8 border-black rounded-t-3xl z-20 ${taps > 0 ? glow : ""}`}
                        >
                            <div className="absolute top-0 bottom-0 left-4 w-3 bg-black/20" />
                            <div className="absolute top-0 bottom-0 right-4 w-3 bg-black/20" />
                        </motion.div>
                        <AnimatePresence>
                            {(isOpening || taps > 0) && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: taps * 0.3 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute bottom-0 w-full h-3/4 bg-yellow-400/40 blur-xl z-0"
                                />
                            )}
                        </AnimatePresence>
                    </div>
                    <AnimatePresence>
                        {taps > 0 && !isOpening && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="absolute -top-10 text-yellow-400"
                            >
                                <Sparkles size={48} className="animate-pulse" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
                <p className="mt-16 text-sm font-bold text-slate-400 tracking-wider uppercase">
                    {chest.chest_type} Chest • {chest.cycle_key.split(":")[0]} Reward
                </p>
            </motion.div>
        );
    };

    // --- Main render ---
    return (
        <>
            {/* Layer 1: Backdrop — visual blur + click to close */}
            <div
                className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm"
                aria-hidden="true"
                onClick={onClose}
            />

            {/* Layer 2: Scroll layer — data-lenis-prevent tells Lenis to not intercept wheel
                events here, so native overflow-y-auto scroll works correctly */}
            <div
                className="fixed inset-0 z-[101] overflow-y-auto"
                data-lenis-prevent
                onClick={onClose}
            >
                {/* Layer 3: Centering wrapper — click propagation stopped here */}
                <div
                    className="flex min-h-full items-center justify-center p-4 py-8"
                    onClick={e => e.stopPropagation()}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl relative"
                    >
                        {/* Header */}
                        <div className="flex justify-between items-center p-6 border-b border-slate-100">
                            <h2 className="text-2xl font-bold text-slate-800">Trophy Case</h2>
                            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        {/* Reward reveal screen */}
                        {rewardReveal ? (
                            <div className="p-6">{renderReveal()}</div>
                        ) : (
                            <>
                                {/* Tab switcher */}
                                <div className="px-6 py-4 flex gap-2 border-b border-slate-100">
                                    <button
                                        onClick={() => setActiveTab("owned")}
                                        className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${activeTab === "owned" ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"}`}
                                    >
                                        Owned Items
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("chests")}
                                        className={`px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${activeTab === "chests" ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"}`}
                                    >
                                        Sealed Chests
                                        {chests.length > 0 && (
                                            <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{chests.length}</span>
                                        )}
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="p-6 bg-slate-50/50 rounded-b-[2rem]">
                                    {isLoading ? (
                                        <div className="flex items-center justify-center h-40">
                                            <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
                                        </div>
                                    ) : activeTab === "owned" ? (
                                        inventory.length === 0 ? (
                                            <div className="text-center py-12 text-slate-400">
                                                <Gift size={48} className="mx-auto mb-4 opacity-20" />
                                                <p>Your trophy case is empty.<br />Complete quests to earn rewards!</p>
                                            </div>
                                        ) : (
                                            <div
                                                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[420px] overflow-y-auto pr-1"
                                                data-lenis-prevent
                                            >
                                                {inventory.map(item => (
                                                    <div key={item.id} className={`p-4 rounded-2xl flex flex-col items-center text-center bg-white border shadow-sm ${getRarityColor(item.rarity)}`}>
                                                        <div className="w-12 h-12 bg-white/50 rounded-xl mb-3 flex items-center justify-center">
                                                            <Sparkles size={20} className="opacity-50" />
                                                        </div>
                                                        <p className="text-xs font-bold line-clamp-2 leading-tight">{item.name}</p>
                                                        <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 mt-1">
                                                            {item.type?.replace("_", " ")}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    ) : chests.length === 0 ? (
                                        <div className="text-center py-12 text-slate-400">
                                            <Gift size={48} className="mx-auto mb-4 opacity-20" />
                                            <p>No sealed chests.<br />Complete 3 quests in a cycle to earn one!</p>
                                        </div>
                                    ) : (
                                        <div
                                            className="max-h-[420px] overflow-y-auto space-y-3 pr-1"
                                            data-lenis-prevent
                                        >
                                            {chests.map(chest => {
                                                const isLegendary = chest.chest_type === "legendary";
                                                const isRare = chest.chest_type === "rare";
                                                let color = "bg-zinc-800";
                                                if (isLegendary) color = "bg-orange-500";
                                                else if (isRare) color = "bg-lime-500";
                                                return (
                                                    <div
                                                        key={chest.id}
                                                        onClick={() => handleFocusChest(chest.id)}
                                                        className={`p-4 rounded-2xl border-2 flex items-center justify-between gap-4 bg-white cursor-pointer active:scale-95 transition-all ${isLegendary ? "border-amber-200 shadow-amber-100/50 shadow-lg" : "border-slate-200 shadow-sm"}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-3 rounded-xl flex-shrink-0 ${isLegendary ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-600"}`}>
                                                                <Gift size={22} />
                                                            </div>
                                                            <div>
                                                                <h4 className="font-bold text-slate-800 capitalize">{chest.chest_type} Chest</h4>
                                                                <p className="text-xs text-slate-500 font-medium">From {chest.cycle_key.split(":")[0]} quests</p>
                                                            </div>
                                                        </div>
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0 ${color}`}>
                                                            <Sparkles size={14} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                            </>
                        )}

                        {/* Focused chest opening overlay */}
                        <AnimatePresence>
                            {focusedChestId && !rewardReveal && renderFocusedChest()}
                        </AnimatePresence>
                    </motion.div>
                </div>
            </div >
        </>
    );
}
