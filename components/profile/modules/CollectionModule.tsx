"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { TradingCard } from "@/components/profile/TradingCards";
import { Loader2, ShoppingBag, Check, Zap, HelpCircle } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { useUser } from "@/context/UserContext";
import { SHOP_ITEMS, ShopItem } from "@/lib/shop-items";
import { motion, AnimatePresence } from "framer-motion";
import useSWR, { useSWRConfig } from "swr";
import { fetchSealedChests } from "@/lib/swr-fetchers";
import { ChestGraphic } from "../../ui/ChestGraphic";
import { ChestUnboxingModal } from "../../ui/ChestUnboxingModal";

const getIcon = (name: string | null) => {
    if (!name) return HelpCircle;
    const Icon = (LucideIcons as any)[name];
    if (typeof Icon === 'function' || (Icon && typeof Icon === 'object' && ('$$typeof' in Icon || 'render' in Icon))) {
        return Icon;
    }
    return HelpCircle;
};

export function CollectionModule() {
    const { profile, user, refreshProfile } = useUser();
    const router = useRouter();
    const { toast } = useToast();
    const { mutate: globalMutate } = useSWRConfig();

    const [processingId, setProcessingId] = useState<string | null>(null);

    // -- Unboxing State --
    const [unboxingConfig, setUnboxingConfig] = useState<{
        id?: string;
        rarity: 'common' | 'rare' | 'legendary';
    } | null>(null);

    // -- SWR for Hydrated Inventory --
    const { data: inventoryData, isLoading: inventoryLoading, mutate: mutateInventory } = useSWR(
        user?.id && profile?.inventory && profile.inventory.length > 0 ? ['inventory-hydration', user.id, profile.inventory] : null,
        async () => {
            const supabase = createClient();
            const ids = profile?.inventory || [];
            if (ids.length === 0) return { cards: [], cosmetics: [], consumables: [], exclusives: [] };

            const [shopRes, exRes] = await Promise.all([
                supabase.from("shop_items").select("*").in("id", ids),
                supabase.from("quest_exclusives").select("*").in("id", ids)
            ]);

            const dbShopItems = shopRes.data || [];
            const dbExclusives = exRes.data || [];
            const localMatches = SHOP_ITEMS.filter(item => ids.includes(item.id));
            
            const combinedShop = [...dbShopItems];
            localMatches.forEach(local => {
                if (!combinedShop.find(db => db.id === local.id)) {
                    combinedShop.push(local);
                }
            });

            const hydratedShop = combinedShop.map((item: any) => ({
                ...item,
                icon: typeof item.icon === 'function' ? item.icon : getIcon(item.icon_name)
            }));

            const hydratedExclusives = dbExclusives.map((item: any) => ({
                ...item,
                icon: getIcon(item.icon_name)
            }));

            return {
                cards: hydratedShop.filter((i: any) => i.category === "card"),
                cosmetics: hydratedShop.filter((i: any) => i.category === "cosmetic" || i.category === "title"),
                consumables: hydratedShop.filter((i: any) => i.category === "consumable"),
                exclusives: hydratedExclusives
            };
        }
    );

    // -- SWR for Sealed Chests --
    const { data: sealedChests, isLoading: chestsLoading, mutate: mutateChests } = useSWR(
        user?.id ? ['sealed-chests', user.id] : null,
        fetchSealedChests
    );

    const isLoading = inventoryLoading || chestsLoading;

    // -- Helper derived state --
    const ownedCards = inventoryData?.cards || [];
    const ownedCosmetics = inventoryData?.cosmetics || [];
    const ownedConsumables = inventoryData?.consumables || [];
    const questExclusives = inventoryData?.exclusives || [];

    const activePowers = profile?.active_powers || {};
    const equippedTitle = profile?.equipped_title || null;
    const equippedRing = profile?.equipped_ring || null;
    const equippedFrame = profile?.equipped_frame || null;

    const handleUseConsumable = async (item: ShopItem) => {
        if (item.id === 'item_streak_shield') {
            toast("Streak Shields are automatically used if you miss a day!", "info");
            return;
        }

        setProcessingId(item.id);
        try {
            const { activateBoostItem } = await import("@/actions/shop-actions");
            const res = await activateBoostItem(item.id);

            if (res.success) {
                toast(`${item.name} activated!`, "success");
                await refreshProfile();
                mutateInventory();
            } else {
                toast(res.error || "Failed to activate.", "error");
            }
        } catch (err) {
            toast("An error occurred.", "error");
        } finally {
            setProcessingId(null);
        }
    };

    const handleEquip = async (item: any) => {
        setProcessingId(item.id);
        try {
            const isTitle = item.type === "title" || item.category === "title";
            const isRing = item.type === "ring" || item.category === "cosmetic";
            const isFrame = item.type === "avatar_frame";

            const currentEquipped = isTitle ? equippedTitle : isRing ? equippedRing : equippedFrame;
            const alreadyEquipped = currentEquipped === item.id;

            const slot = isTitle
                ? "equipped_title"
                : isRing
                    ? "equipped_ring"
                    : "equipped_frame";

            const { equipCosmetic } = await import("@/actions/shop-actions");
            const res = await equipCosmetic(slot, alreadyEquipped ? null : item.id);
            if (!res.success) throw new Error(res.error);

            await refreshProfile();
            toast(alreadyEquipped ? `${item.name} unequipped.` : `${item.name} equipped!`, "success");
        } catch {
            toast("Failed to equip. Try again.", "error");
        } finally {
            setProcessingId(null);
        }
    };

    if (isLoading) return (
        <div className="flex justify-center items-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
        </div>
    );

    const EmptyState = ({ label, sub }: { label: string; sub: string }) => (
        <div className="bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-[2rem] p-14 text-center">
            <div className="w-12 h-12 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShoppingBag size={22} className="text-zinc-400" />
            </div>
            <h3 className="text-lg font-black text-zinc-900 mb-1">{label}</h3>
            <p className="text-zinc-400 text-sm mb-6">{sub}</p>
            <Button onClick={() => router.push("/shop")} variant="outline" className="rounded-xl font-bold">
                Browse the Shop
            </Button>
        </div>
    );

    const isPowerActive = (id: string) => {
        const now = new Date().toISOString();
        if (id === 'item_xp_booster') {
            return (activePowers.xp_multiplier || 0) > 1 && (activePowers.xp_expires || "") > now;
        }
        if (id === 'item_coin_magnet') {
            return (activePowers.coins_multiplier || 0) > 1 && (activePowers.coins_expires || "") > now;
        }
        return false;
    };

    return (
        <div className="space-y-14 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* ── Trading Cards ── */}
            <section>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Trading Cards</h2>
                    <span className="text-xs font-black uppercase tracking-wider text-zinc-500 bg-zinc-100 px-3 py-1.5 rounded-full">
                        {ownedCards.length} {ownedCards.length === 1 ? "card" : "cards"}
                    </span>
                </div>
                {ownedCards.length > 0 ? (
                    <div className="flex flex-wrap gap-6 justify-center md:justify-start">
                        {ownedCards.map(card => <TradingCard key={card.id} item={card} />)}
                    </div>
                ) : (
                    <EmptyState label="No cards yet" sub="Unlock holographic collectibles from the Loopy Shop." />
                )}
            </section>

            {/* ── Power-ups ── */}
            <section>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Power-ups</h2>
                    <span className="text-xs font-black uppercase tracking-wider text-zinc-500 bg-zinc-100 px-3 py-1.5 rounded-full">
                        {ownedConsumables.length} available
                    </span>
                </div>
                {ownedConsumables.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {ownedConsumables.map(item => {
                            const RawIcon = item.icon;
                            const Icon = (typeof RawIcon === 'function' || (RawIcon && typeof RawIcon === 'object' && ('$$typeof' in RawIcon || 'render' in RawIcon))) ? RawIcon : HelpCircle;
                            const processing = processingId === item.id;
                            const active = isPowerActive(item.id);

                            return (
                                <div
                                    key={item.id}
                                    className="bg-white border border-zinc-100 rounded-2xl p-4 flex items-center gap-4 hover:shadow-sm hover:border-zinc-200 transition-all"
                                >
                                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-sm shrink-0`}>
                                        <Icon size={22} className="text-white" strokeWidth={1.5} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-black text-zinc-900 text-sm truncate">{item.name}</h4>
                                        <p className="text-[10px] text-zinc-400 font-bold truncate">{item.description}</p>
                                    </div>
                                    <button
                                        onClick={() => handleUseConsumable(item)}
                                        disabled={processing || active}
                                        className={`
                                            shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all
                                            ${active
                                                ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                                                : "bg-zinc-900 text-white hover:bg-zinc-700"}
                                        `}
                                    >
                                        {processing && <Loader2 size={11} className="animate-spin" />}
                                        {active ? "Active" : "Use"}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState label="Out of Power-ups" sub="Visit the shop for Streak Shields, XP Boosters, and more." />
                )}
            </section>

            {/* ── Cosmetics & Titles ── */}
            <section>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Cosmetics & Titles</h2>
                    <span className="text-xs font-black uppercase tracking-wider text-zinc-500 bg-zinc-100 px-3 py-1.5 rounded-full">
                        {ownedCosmetics.length} owned
                    </span>
                </div>
                {ownedCosmetics.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {ownedCosmetics.map(item => {
                            const RawIcon = item.icon;
                            const Icon = (typeof RawIcon === 'function' || (RawIcon && typeof RawIcon === 'object' && ('$$typeof' in RawIcon || 'render' in RawIcon))) ? RawIcon : HelpCircle;
                            const isEquipped = item.category === "title"
                                ? equippedTitle === item.id
                                : equippedRing === item.id;
                            const processing = processingId === item.id;

                            return (
                                <div
                                    key={item.id}
                                    className={`
                                        bg-white border rounded-2xl p-4 flex items-center gap-4 transition-all duration-200
                                        ${isEquipped ? "border-zinc-900 shadow-md" : "border-zinc-100 hover:border-zinc-300 hover:shadow-sm"}
                                    `}
                                >
                                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-sm shrink-0`}>
                                        <Icon size={22} className="text-white" strokeWidth={1.5} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-black text-zinc-900 text-sm truncate">{item.name}</h4>
                                            {isEquipped && (
                                                <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-zinc-900 text-[#D4F268] px-2 py-0.5 rounded-full">
                                                    <Zap size={9} className="fill-[#D4F268] post-process:fill-[#D4F268]" /> Equipped
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                                            {item.category} · {item.rarity}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => handleEquip(item)}
                                        disabled={processing}
                                        className={`
                                            shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all
                                            ${isEquipped
                                                ? "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                                                : "bg-zinc-900 text-white hover:bg-zinc-700"}
                                        `}
                                    >
                                        {processing ? (
                                            <LucideIcons.Loader2 size={11} className="animate-spin" />
                                        ) : isEquipped ? (
                                            <Check size={11} />
                                        ) : null}
                                        {isEquipped ? "Unequip" : "Equip"}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState label="No cosmetics" sub="Stand out with exclusive avatar rings and profile titles." />
                )}
            </section>

            {/* ── Quest Exclusives ── */}
            <section>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Quest Exclusives</h2>
                    <span className="text-xs font-black uppercase tracking-wider text-[#D4F268] bg-zinc-900 px-3 py-1.5 rounded-full">
                        {questExclusives.length} earned
                    </span>
                </div>
                {questExclusives.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {questExclusives.map((item: any) => {
                            const RawIcon = item.icon;
                            const Icon = (typeof RawIcon === 'function' || (RawIcon && typeof RawIcon === 'object' && ('$$typeof' in RawIcon || 'render' in RawIcon))) ? RawIcon : HelpCircle;
                            const isEquipped = item.type === "title"
                                ? equippedTitle === item.id
                                : item.type === "ring"
                                ? equippedRing === item.id
                                : equippedFrame === item.id;
                            const processing = processingId === item.id;

                            return (
                                <div
                                    key={item.id}
                                    className={`
                                        bg-zinc-50 border rounded-2xl p-4 flex items-center gap-4 transition-all duration-200
                                        ${isEquipped ? "border-[#D4F268] bg-zinc-900 text-white shadow-xl scale-[1.02]" : "border-zinc-200 hover:border-zinc-400 hover:shadow-sm"}
                                    `}
                                >
                                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-md shrink-0`}>
                                        <Icon size={22} className="text-white" strokeWidth={1.5} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className={`font-black text-sm truncate ${isEquipped ? 'text-white' : 'text-zinc-900'}`}>{item.name}</h4>
                                            {isEquipped && (
                                                <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-[#D4F268] text-zinc-900 px-2 py-0.5 rounded-full">
                                                    Equipped
                                                </span>
                                            )}
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase tracking-widest ${isEquipped ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                            {item.rarity} {item.type.replace('_', ' ')}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => handleEquip(item)}
                                        disabled={processing}
                                        className={`
                                            shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all
                                            ${isEquipped
                                                ? "bg-white/10 text-white hover:bg-white/20"
                                                : "bg-zinc-900 text-white hover:bg-zinc-700"}
                                        `}
                                    >
                                        {processing ? (
                                            <LucideIcons.Loader2 size={11} className="animate-spin" />
                                        ) : isEquipped ? (
                                            <Check size={11} />
                                        ) : null}
                                        {isEquipped ? "Unequip" : "Equip"}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState label="No exclusives yet" sub="Complete quest cycles and open chests to earn rare rewards." />
                )}
            </section>

            {/* ── Sealed Chests ── */}
            <section>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Sealed Chests</h2>
                    <span className="text-xs font-black uppercase tracking-wider text-zinc-500 bg-zinc-100 px-3 py-1.5 rounded-full">
                        {(sealedChests || []).length} stored
                    </span>
                </div>
                {(sealedChests && sealedChests.length > 0) ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {sealedChests.map((chest: any) => (
                            <motion.div
                                key={chest.id}
                                layoutId={`chest-${chest.id}`}
                                className="bg-white border border-zinc-100 rounded-[2rem] p-6 flex flex-col items-center text-center hover:shadow-xl hover:-translate-y-1 transition-all group"
                            >
                                <div className={`w-20 h-20 rounded-3xl mb-4 flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-110 ${
                                    chest.chest_type === 'legendary' ? 'bg-amber-500 shadow-amber-200' : 
                                    chest.chest_type === 'rare' ? 'bg-blue-500 shadow-blue-200' : 
                                    'bg-zinc-400 shadow-zinc-200'
                                }`}>
                                    <ChestGraphic rarity={chest.chest_type} isOpen={false} />
                                </div>
                                <h4 className="font-black text-zinc-900 mb-1 capitalize">{chest.chest_type} Chest</h4>
                                <p className="text-xs text-zinc-400 font-bold mb-6">Earned via Quests</p>
                                <Button 
                                    onClick={() => {
                                        setUnboxingConfig({
                                            id: chest.id,
                                            rarity: chest.chest_type
                                        });
                                    }}
                                    className="w-full rounded-xl font-black text-xs uppercase tracking-widest"
                                >
                                    Open Now
                                </Button>
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-[2rem] p-12 text-center">
                        <p className="text-zinc-400 font-bold mb-2">Your Loadout is empty.</p>
                        <p className="text-xs text-zinc-300 uppercase tracking-widest">Earn chests by completing daily & weekly quests.</p>
                    </div>
                )}
            </section>

            <ChestUnboxingModal 
                isOpen={!!unboxingConfig}
                onClose={() => setUnboxingConfig(null)}
                chestData={unboxingConfig}
                onSuccess={() => {
                    mutateChests();
                    mutateInventory();
                    refreshProfile();
                    if (user) globalMutate(['dailyQuests', user.id]);
                }}
            />
        </div>
    );
}
