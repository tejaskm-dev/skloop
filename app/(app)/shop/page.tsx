"use client";

import { useEffect, useState, memo, useRef } from "react";
import { motion, AnimatePresence, useSpring, useMotionTemplate, useTransform, useMotionValue } from "framer-motion";
import {
    ShoppingBag, Shield, CreditCard, Palette, Tag, Zap,
    CheckCircle, HelpCircle, Crown, Circle, Diamond, GitBranch
} from "lucide-react";
import { purchaseShopItem } from "@/actions/shop-actions";
import { ShopItem, ShopItemCategory } from "@/lib/shop-items";
import { sfx } from "@/lib/sfx";
import { ItemArtwork } from "@/components/shop/ItemArtwork";
import confetti from "canvas-confetti";
import { CurrencyCoin } from "@/components/ui/CurrencyCoin";
import { useToast } from "@/components/ui/ToastProvider";
import useSWR from "swr";
import { fetchShopData } from "@/lib/swr-fetchers";
import { useUser } from "@/context/UserContext";
import { useLoading } from "@/components/LoadingProvider";
import localFont from "next/font/local";
import { TopSlimeBorder } from "@/components/ui/TopSlimeBorder";
import { SlimePillBackground } from "@/components/ui/SlimePillBackground";

const meltedMonster = localFont({
    src: "../../../public/MeltedMonster.woff2",
    display: "swap",
    variable: "--font-melted-monster"
});

const ICON_MAP: Record<string, any> = {
    Shield, Crown, Zap, Circle, Diamond, CreditCard, GitBranch, ShoppingBag, Palette, Tag
};

const getIcon = (name: string | null) => {
    if (!name) return HelpCircle;
    return ICON_MAP[name] || HelpCircle;
};

const Card3DWrapper = ({ children, className, style, delay = 0 }: any) => {
    const ref = useRef<HTMLDivElement>(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30 });
    const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30 });

    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["7.5deg", "-7.5deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-7.5deg", "7.5deg"]);

    const background = useMotionTemplate`radial-gradient(1000px circle at ${useTransform(mouseXSpring, v => (v + 0.5) * 100)}% ${useTransform(mouseYSpring, v => (v + 0.5) * 100)}%, rgba(255,255,255,0.08), transparent 40%)`;

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
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
            ref={ref}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15, transition: { duration: 0.2 } }}
            transition={{ delay: delay * 0.5, duration: 0.4, type: "spring", bounce: 0.3 }}
            className={`group perspective-[1200px] ${className}`}
            style={style}
        >
            <motion.div
                style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                className="relative w-full h-full rounded-[inherit] transition-all duration-200 ease-out"
            >
                {/* 3D Glass Gleam layer mapping cursor */}
                <motion.div
                    className="pointer-events-none absolute inset-0 z-[100] rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-500 mix-blend-overlay"
                    style={{ background }}
                />
                
                {children}
            </motion.div>
        </motion.div>
    );
};

// Squircle wavy shapes using border-radius
const getBlobRadius = (idx: number) => {
    const seeds = [
        "28px 25px 26px 29px / 26px 29px 25px 27px",
        "26px 29px 24px 27px / 29px 25px 28px 24px",
        "27px 24px 28px 25px / 24px 28px 26px 29px",
        "25px 28px 26px 24px / 28px 24px 29px 25px"
    ];
    return seeds[idx % seeds.length];
};

// Component removed to @/components/shop/ItemArtwork

const RARITY_CONFIG = {
    common: { label: "Common", glow: "shadow-[0_0_15px_rgba(255,255,255,0.1)]", border: "border-zinc-500", text: "text-zinc-300", bg: "bg-zinc-800" },
    rare: { label: "Rare", glow: "shadow-[0_0_15px_rgba(56,189,248,0.3)]", border: "border-sky-400", text: "text-sky-300", bg: "bg-sky-950/40" },
    epic: { label: "Epic", glow: "shadow-[0_0_15px_rgba(168,85,247,0.3)]", border: "border-purple-500", text: "text-purple-300", bg: "bg-purple-950/40" },
    legendary: { label: "Legendary", glow: "shadow-[0_0_15px_rgba(250,204,21,0.3)]", border: "border-yellow-400", text: "text-yellow-300", bg: "bg-yellow-950/40" },
};

const DailyTimer = memo(() => {
    const [timeLeft, setTimeLeft] = useState("");

    useEffect(() => {
        const updateTimer = () => {
            const now = new Date();
            const tomorrow = new Date();
            tomorrow.setHours(24, 0, 0, 0);
            
            const diff = tomorrow.getTime() - now.getTime();
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            
            setTimeLeft(
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <span className="text-[10px] font-mono font-bold text-zinc-400 bg-black/40 px-2.5 py-1 rounded-lg border border-white/5">
            {timeLeft || "00:00:00"}
        </span>
    );
});
DailyTimer.displayName = "DailyTimer";

const DailyDealCard = memo(({
    item,
    idx,
    owned,
    processing,
    coins,
    handlePurchase,
    setHoveredPrice
}: {
    item: ShopItem,
    idx: number,
    owned: boolean,
    processing: boolean,
    coins: number,
    handlePurchase: (item: ShopItem) => Promise<boolean>,
    setHoveredPrice: (price: number | null) => void
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [justPurchased, setJustPurchased] = useState(false);
    const canAfford = coins >= item.price;
    const rarity = RARITY_CONFIG[item.rarity as keyof typeof RARITY_CONFIG];
    const Icon = item.icon || getIcon(item.icon_name || null);

    useEffect(() => setIsMounted(true), []);

    const onBuyClick = async (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (rect.left + rect.width / 2) / window.innerWidth;
        const y = (rect.top + rect.height / 2) / window.innerHeight;

        const success = await handlePurchase(item);
        if (success) {
            sfx.coin();
            setTimeout(() => sfx.thud(), 400);
            setJustPurchased(true);
            confetti({ particleCount: 150, spread: 70, origin: { x, y }, colors: [item.accentColor || '#10b981', '#ffffff', '#eab308'], zIndex: 9999, gravity: 1.2 });
            setTimeout(() => setJustPurchased(false), 2000);
        } else {
            sfx.error();
        }
    };

    return (
        <Card3DWrapper
            delay={idx * 0.1}
            onMouseEnter={() => setHoveredPrice(item.price)}
            onMouseLeave={() => setHoveredPrice(null)}
            className="group relative flex flex-col p-[2px] transition-all duration-300 z-10 col-span-1 md:col-span-2 lg:col-span-1 h-full min-h-[16rem] rounded-[28px]"
        >
            <div className="absolute inset-0 rounded-[28px] overflow-hidden" style={{ transform: "translateZ(-1px)" }}>
                {/* Animated Conic Border Glow.
                    willChange promotes this to its own compositor layer so the
                    rotation runs on the GPU as a pure transform, with no repaint. */}
                <div className="absolute inset-[-100%] z-0 animate-[spin_4s_linear_infinite]"
                     style={{
                         background: `conic-gradient(from 0deg, transparent 0 340deg, ${item.accentColor} 360deg)`,
                         willChange: "transform",
                     }}
                />
                {/* Outer static border */}
                <div className={`absolute inset-0 z-0 bg-zinc-950/40 border border-white/10 rounded-[28px] opacity-80 group-hover:opacity-100 transition-opacity duration-300 ${rarity.glow}`} />
                {/* Inner background.
                    This deliberately has NO backdrop-filter. It sits at 95% opacity
                    over the spinning conic gradient above, so a backdrop blur was
                    contributing ~5% of an already-smooth gradient — visually a no-op.
                    It was, however, extremely expensive: backdrop-filter caches its
                    rasterized backdrop, and an element animating behind it
                    invalidates that cache every single frame, forcing a 64px
                    Gaussian blur re-computation per card per frame. Removing it
                    changes nothing on screen and lets the ring above composite on
                    the GPU untouched. */}
                <div className="absolute inset-[2px] bg-zinc-950/95 z-0 rounded-[26px]" />
            </div>

            {/* Inner Content Component applying 3D popup depth */}
            <motion.div animate={justPurchased ? { scale: [1, 1.05, 1], rotate: [0, -3, 3, -3, 0] } : {}} transition={{ duration: 0.5 }} className="relative z-10 flex flex-col h-full p-5 pb-10" style={{ transform: "translateZ(30px)" }}>
                <AnimatePresence>
                    {justPurchased && (
                        <motion.div initial={{ scale: 0.5, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: -10, opacity: 1 }} exit={{ opacity: 0, scale: 1.2 }} transition={{ type: "spring", damping: 10, stiffness: 200 }} className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-md rounded-[26px]">
                            <h3 className={`text-6xl text-[#b1f142] drop-shadow-[0_0_25px_rgba(177,241,66,0.8)] ${meltedMonster.className}`} style={{ transform: "translateZ(50px)" }}>SLIMED!</h3>
                        </motion.div>
                    )}
                </AnimatePresence>
                {/* Badges */}
                <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-2 items-center">
                        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" /> Deal
                        </span>
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md ${rarity.bg} ${rarity.text} border border-white/10`}>
                            {rarity.label}
                        </span>
                    </div>
                    {/* Real-time Timer */}
                    {isMounted && <DailyTimer />}
                </div>

                {/* Content Area */}
                <div className="flex flex-row items-center gap-5 mt-1 relative z-20" style={{ transform: "translateZ(40px)" }}>
                    <div className="relative w-20 h-20 flex-shrink-0 flex items-center justify-center p-2 rounded-2xl bg-gradient-to-br from-white/5 to-transparent border border-white/10 overflow-hidden transform-gpu">
                        {/* Background glow behind icon */}
                        <div className="absolute inset-0 bg-white/10 blur-[20px] rounded-full pointer-events-none" />
                        
                        {item.imageUrl ? (
                             <img src={item.imageUrl} alt="" className="w-full h-full object-cover mix-blend-screen opacity-90 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
                        ) : (
                             <ItemArtwork item={item} fallbackIcon={Icon} />
                        )}
                    </div>

                    <div className="flex flex-col items-start text-left flex-1 min-w-0">
                        <h3 className="text-lg font-black text-white tracking-tight leading-tight truncate w-full">{item.name}</h3>
                        <p className="text-zinc-400 text-[11px] leading-relaxed font-medium line-clamp-2 mt-1">
                            {item.description}
                        </p>
                    </div>
                </div>

                {/* Purchase Button */}
                <div className="absolute -bottom-5 inset-x-5 flex items-center justify-center z-50 pointer-events-auto shadow-2xl rounded-xl" style={{ transform: "translateZ(40px)" }}>
                    {!isMounted ? (
                        <div className="absolute inset-0 top-4 h-11 w-full bg-white/5 rounded-xl animate-pulse" />
                    ) : owned ? (
                        <div className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3 h-11">
                            <CheckCircle size={15} className="text-zinc-500 shrink-0" />
                            <span className="text-xs font-bold text-zinc-500">Owned</span>
                        </div>
                    ) : (
                        <motion.button
                            onMouseEnter={() => canAfford && !processing}
                            whileHover={canAfford && !processing ? { scale: 1.03 } : {}}
                            whileTap={canAfford && !processing ? { scale: 0.95 } : {}}
                            onClick={onBuyClick}
                            disabled={!canAfford || processing}
                            className={`
                                w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-all duration-300 h-11
                                ${canAfford
                                    ? "bg-[#D4F268] text-zinc-950 hover:bg-[#bef264] hover:shadow-[0_0_20px_rgba(212,242,104,0.4)] hover:-translate-y-0.5 relative overflow-hidden"
                                    : "bg-white/5 text-zinc-600 cursor-not-allowed border border-white/5"}
                            `}
                        >
                            <span className="relative z-10">{processing ? "Processing..." : canAfford ? "Claim Deal" : "Locked"}</span>
                            <div className="flex items-center gap-1.5 relative z-10">
                                <span className="text-zinc-500 font-bold line-through opacity-60 text-[10px] mr-1">{(item.price * 1.5).toLocaleString()}</span>
                                <span className={canAfford ? "text-zinc-950 font-black" : "text-zinc-600 font-black"}>{item.price.toLocaleString()}</span>
                                <CurrencyCoin size="sm" className={`w-4 h-4 ${!canAfford && "opacity-50 grayscale"}`} />
                            </div>
                        </motion.button>
                    )}
                </div>
            </motion.div>
        </Card3DWrapper>
    );
});
DailyDealCard.displayName = "DailyDealCard";

const ShopItemCard = memo(({
    item,
    idx,
    owned,
    processing,
    coins,
    handlePurchase,
    setHoveredPrice
}: {
    item: ShopItem,
    idx: number,
    owned: boolean,
    processing: boolean,
    coins: number,
    handlePurchase: (item: ShopItem) => Promise<boolean>,
    setHoveredPrice: (price: number | null) => void
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [justPurchased, setJustPurchased] = useState(false);
    const canAfford = coins >= item.price;
    const rarity = RARITY_CONFIG[item.rarity as keyof typeof RARITY_CONFIG];
    const Icon = item.icon || getIcon(item.icon_name || null);

    useEffect(() => setIsMounted(true), []);

    const onBuyClick = async (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (rect.left + rect.width / 2) / window.innerWidth;
        const y = (rect.top + rect.height / 2) / window.innerHeight;

        const success = await handlePurchase(item);
        if (success) {
            sfx.coin();
            setTimeout(() => sfx.thud(), 400);
            setJustPurchased(true);
            confetti({ particleCount: 150, spread: 70, origin: { x, y }, colors: [item.accentColor || '#10b981', '#ffffff', '#eab308'], zIndex: 9999, gravity: 1.2 });
            setTimeout(() => setJustPurchased(false), 2000);
        } else {
            sfx.error();
        }
    };

    return (
        <Card3DWrapper
            delay={Math.min(idx * 0.05, 0.3)}
            onMouseEnter={() => setHoveredPrice(item.price)}
            onMouseLeave={() => setHoveredPrice(null)}
            className="group relative flex flex-col p-[2px] transition-all duration-300 z-10 h-full min-h-[18rem]"
            style={{ borderRadius: getBlobRadius(idx) }}
        >
            <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: 'inherit', transform: "translateZ(-1px)" }}>
                {/* Outer Glowing Border layer */}
                <div className={`absolute inset-0 z-0 bg-transparent border-2 ${rarity.border} opacity-80 group-hover:opacity-100 transition-opacity duration-300 ${rarity.glow}`} style={{ borderRadius: 'inherit' }} />
                
                {/* Dark Inner Background.
                    Backdrop blur reduced 24px -> 4px. Blur cost scales sharply with
                    radius, and at 90% opacity the difference between the two is not
                    perceptible. The backdrop here is static (no animation behind it),
                    so it stays cacheable and the effect is kept rather than removed. */}
                <div className="absolute inset-[2px] bg-zinc-950/90 backdrop-blur-sm z-0" style={{ borderRadius: 'inherit' }} />
            </div>

            {/* Inner Content Component */}
            <motion.div animate={justPurchased ? { scale: [1, 1.05, 1], rotate: [0, -3, 3, -3, 0] } : {}} transition={{ duration: 0.5 }} className="relative z-10 flex flex-col h-full p-4 pb-12" style={{ transform: "translateZ(25px)" }}>
                <AnimatePresence>
                    {justPurchased && (
                        <motion.div initial={{ scale: 0.5, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: -10, opacity: 1 }} exit={{ opacity: 0, scale: 1.2 }} transition={{ type: "spring", damping: 10, stiffness: 200 }} className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-md" style={{ borderRadius: isMounted ? getBlobRadius(idx) : '24px' }}>
                            <h3 className={`text-5xl text-[#b1f142] drop-shadow-[0_0_25px_rgba(177,241,66,0.8)] ${meltedMonster.className}`} style={{ transform: "translateZ(50px)" }}>SLIMED!</h3>
                        </motion.div>
                    )}
                </AnimatePresence>
                {/* Badges */}
                <div className="flex justify-between items-start mb-2">
                    <div className="flex gap-2">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md ${rarity.bg} ${rarity.text} border border-white/10`}>
                            {rarity.label}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md bg-white/5 text-zinc-300 border border-white/10 backdrop-blur-sm">
                            {item.category}
                        </span>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex flex-col items-center text-center justify-center gap-2 flex-1" style={{ transform: "translateZ(35px)" }}>
                    <div className="relative z-10 w-24 h-24 mb-2 flex-shrink-0 flex items-center justify-center transform-gpu">
                        {/* Background glow behind icon */}
                        <div className="absolute inset-0 bg-white/20 blur-[30px] rounded-full pointer-events-none" />
                        
                        {item.imageUrl ? (
                             <img src={item.imageUrl} alt="" className="w-full h-full object-cover mix-blend-screen opacity-90 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
                        ) : (
                             <ItemArtwork item={item} fallbackIcon={Icon} />
                        )}
                    </div>

                    <div className="flex flex-col items-center">
                        <h3 className="text-lg font-black text-white tracking-tight mb-1">{item.name}</h3>
                        <p className="text-zinc-400 text-xs leading-relaxed font-medium line-clamp-2 mb-2">
                            {item.description}
                        </p>
                    </div>
                </div>

                {/* Purchase Button */}
                <div className="absolute -bottom-5 inset-x-4 flex items-center justify-center z-50 pointer-events-auto shadow-2xl rounded-xl" style={{ transform: "translateZ(35px)" }}>
                    {!isMounted ? (
                        <div className="absolute inset-0 top-4 h-11 w-full bg-white/5 rounded-xl animate-pulse" />
                    ) : owned ? (
                        <div className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3 h-11">
                            <CheckCircle size={15} className="text-zinc-500 shrink-0" />
                            <span className="text-xs font-bold text-zinc-500">Owned</span>
                        </div>
                    ) : (
                        <motion.button
                            onMouseEnter={() => canAfford && !processing}
                            whileHover={canAfford && !processing ? { scale: 1.03 } : {}}
                            whileTap={canAfford && !processing ? { scale: 0.95 } : {}}
                            onClick={onBuyClick}
                            disabled={!canAfford || processing}
                            className={`
                                w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-all duration-300 h-11
                                ${canAfford
                                    ? "bg-[#D4F268] text-zinc-950 hover:bg-[#bef264] hover:shadow-[0_0_20px_rgba(212,242,104,0.4)] hover:-translate-y-0.5 relative overflow-hidden"
                                    : "bg-white/5 text-zinc-600 cursor-not-allowed border border-white/5"}
                            `}
                        >
                            <span className="relative z-10">{processing ? "Processing..." : canAfford ? "Purchase" : "Locked"}</span>
                            <div className="flex items-center gap-1.5 relative z-10">
                                <span className={canAfford ? "text-zinc-950 font-black" : "text-zinc-600 font-black"}>{item.price.toLocaleString()}</span>
                                <CurrencyCoin size="sm" className={`w-4 h-4 ${!canAfford && "opacity-50 grayscale"}`} />
                            </div>
                        </motion.button>
                    )}
                </div>
            </motion.div>
        </Card3DWrapper>
    );
});
ShopItemCard.displayName = "ShopItemCard";

const SlimeMascot = memo(({ dailyDeals, coins, hoveredPrice }: { dailyDeals: ShopItem[], coins: number, hoveredPrice: number | null }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [clickCount, setClickCount] = useState(0);
    const [msgOverride, setMsgOverride] = useState<string | null>(null);
    const [isSleeping, setIsSleeping] = useState(false);
    const [showWakeAlert, setShowWakeAlert] = useState(false);

    const mouseX = useMotionValue(1000);
    const mouseY = useMotionValue(500);
    const idleTimeoutRef = useRef<NodeJS.Timeout>(null);

    useEffect(() => {
        const resetIdle = () => {
            if (isSleeping) {
                setIsSleeping(false);
                setShowWakeAlert(true);
                setTimeout(() => setShowWakeAlert(false), 1500);
            }
            if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
            idleTimeoutRef.current = setTimeout(() => setIsSleeping(true), 12000);
        };

        // Throttle with rAF so Framer Motion springs don't recalculate every pixel
        let framePending = false;
        const handleMouseMove = (e: MouseEvent) => {
            if (!framePending) {
                framePending = true;
                requestAnimationFrame(() => {
                    mouseX.set(e.clientX);
                    mouseY.set(e.clientY);
                    framePending = false;
                });
            }
            resetIdle();
        };
        window.addEventListener("mousemove", handleMouseMove);
        resetIdle();
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
        };
    }, [mouseX, mouseY, isSleeping]);

    const eyeXOffset = useSpring(useTransform(mouseX, [0, 2000], [-5, 5]), { damping: 20, stiffness: 200 });
    const eyeYOffset = useSpring(useTransform(mouseY, [0, 1000], [-5, 5]), { damping: 20, stiffness: 200 });

    const handlePoke = () => {
        setClickCount(c => c + 1);
        const msgs = ["Stop poking me! I'm made of code!", "Hey! That tickles!", "Are you going to buy something or just poke me?", "Ouch! My pixels!"];
        setMsgOverride(msgs[clickCount % msgs.length]);
        setIsHovered(true);
        setTimeout(() => setMsgOverride(null), 3000);
    };

    // Contextual dialogue - increased threshold to 100 for visibility
    useEffect(() => {
        if (hoveredPrice && coins < hoveredPrice && hoveredPrice - coins <= 100) {
            setMsgOverride(`You're so close! Only ${hoveredPrice - coins} more coins for this! 🚀`);
            setIsHovered(true);
            const t = setTimeout(() => setMsgOverride(null), 4000);
            return () => clearTimeout(t);
        }
    }, [hoveredPrice, coins]);

    return (
        <>
            <div 
                className="fixed bottom-8 right-8 z-50 flex items-end gap-2 pointer-events-none"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => !msgOverride && setIsHovered(false)}
            >
                <AnimatePresence>
                    {showWakeAlert && (
                        <motion.div key="wake-alert" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="absolute -top-12 left-1/2 -translate-x-1/2 bg-[#D4F268] text-black font-black px-2 py-1 rounded text-lg shadow-xl z-50">
                            !
                        </motion.div>
                    )}
                    {(isHovered || msgOverride || isSleeping) && (
                        <motion.div 
                            key="loopy-bubble"
                            initial={{ opacity: 0, y: 10, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.9 }}
                            transition={{ type: "spring", bounce: 0.5 }}
                            className="pointer-events-auto bg-zinc-900 border border-[#D4F268]/30 rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-sm p-4 shadow-2xl mb-16 mr-2 origin-bottom-right max-w-[220px]"
                        >
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[#D4F268] text-[10px] font-black uppercase tracking-widest shrink-0 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#D4F268] animate-pulse" /> 
                                    {isSleeping ? "Loopy Resting" : msgOverride ? "Loopy Says" : "Loopy Tip"}
                                </span>
                                <AnimatePresence mode="wait">
                                    <motion.p 
                                        key={isSleeping ? "sleep" : msgOverride ? msgOverride : "tip"}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -5 }}
                                        transition={{ duration: 0.2 }}
                                        className="text-xs font-medium text-zinc-300 leading-relaxed"
                                    >
                                        {isSleeping ? "Zzz... (Move mouse to wake Loopy)" : msgOverride || (
                                            <>Don't miss out! The <span className="text-white font-black">{dailyDeals[0]?.name || "Shiny New Upgrade"}</span> is heavily discounted today! ⏱️</>
                                        )}
                                    </motion.p>
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                
                <motion.div
                    animate={isSleeping ? 
                        { rotate: 15, scale: 0.95, y: [0, 5, 0] } : 
                        msgOverride ? { y: [0, -20, 0], scale: [1, 1.2, 0.9, 1] } : 
                        isHovered ? { y: -10, rotate: -5 } : 
                        { y: 0, rotate: 0 }
                    }
                    transition={isSleeping ?
                        { y: { duration: 3, repeat: Infinity, ease: "easeInOut" }, rotate: { type: "spring" } } :
                        msgOverride ? { duration: 0.4, times: [0, 0.5, 0.8, 1] } : 
                        { type: "spring", bounce: 0.6 }
                    }
                    onClick={handlePoke}
                    className="w-24 h-24 relative pointer-events-auto cursor-crosshair drop-shadow-[0_0_20px_rgba(212,242,104,0.6)] hover:scale-105 transition-transform"
                >
                    <svg viewBox="0 0 100 100" className="w-full h-full text-[#D4F268] fill-current">
                         <path d="M 50,20 C 30,20 15,40 18,65 C 20,85 35,90 50,90 C 65,90 80,85 82,65 C 85,40 70,20 50,20 Z" />
                         {/* Eyes tracking cursor or sleeping */}
                         {!isSleeping ? (
                            <>
                                <motion.circle cx="35" cy="45" r="4.5" style={{ x: eyeXOffset, y: eyeYOffset }} fill="#09090b" />
                                <motion.circle cx="65" cy="45" r="4.5" style={{ x: eyeXOffset, y: eyeYOffset }} fill="#09090b" />
                            </>
                         ) : (
                            <>
                                <line x1="30" y1="45" x2="40" y2="45" stroke="#09090b" strokeWidth="2.5" strokeLinecap="round" />
                                <line x1="60" y1="45" x2="70" y2="45" stroke="#09090b" strokeWidth="2.5" strokeLinecap="round" />
                            </>
                         )}
                         {/* Reactive Mouth */}
                         <motion.path animate={{ d: isSleeping ? "M 45,60 Q 50,60 55,60" : msgOverride ? "M 45,55 Q 50,48 55,55" : "M 45,55 Q 50,60 55,55" }} transition={{ type: "spring", bounce: 0.6 }} stroke="#09090b" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                         {/* Highlight */}
                         <ellipse cx="30" cy="35" rx="5" ry="3" fill="white" opacity="0.6" transform="rotate(-20 30 35)" />
                    </svg>
                </motion.div>
            </div>
        </>
    );
});
SlimeMascot.displayName = "SlimeMascot";

const RollingNumber = memo(({ value, isMounted }: { value: number; isMounted: boolean }) => {
    const springValue = useSpring(value, { stiffness: 60, damping: 15, mass: 1 });
    const displayValue = useTransform(springValue, (latest) => Math.round(latest).toLocaleString());

    useEffect(() => {
        springValue.set(value);
    }, [springValue, value]);

    if (!isMounted) return <span>0</span>;
    return <motion.span>{displayValue}</motion.span>;
});
RollingNumber.displayName = "RollingNumber";

export default function ShopPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const { isLoading: isGlobalLoading } = useLoading();
    const currentUserId = user?.id || null;
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => setIsMounted(true), []);

    const [activeCategory, setActiveCategory] = useState<ShopItemCategory | "all">("all");
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);

    const { data: shopData, mutate } = useSWR(
        currentUserId ? ['shopData', currentUserId] : null,
        fetchShopData as any,
        { revalidateOnFocus: false }
    );

    const items = shopData?.items || [];
    const coins = shopData?.coins || 0;
    const inventory = shopData?.inventory || [];
    const streakShields = shopData?.streakShields || 0;

    const handlePurchase = async (item: ShopItem) => {
        // These two are UX guards only — the authoritative balance and
        // ownership checks happen server-side in purchase_shop_item().
        if (coins < item.price) {
            toast("Not enough coins. Need " + (item.price - coins).toLocaleString() + " more.", "error");
            return false;
        }
        if (item.category !== "consumable" && inventory.includes(item.id)) {
            toast("You already have this item in your collection.", "info");
            return false;
        }
        setProcessingId(item.id);
        try {
            const result = await purchaseShopItem(item.id);

            if (!result.success) {
                toast(result.error || "Something went wrong. Please try again.", "error");
                return false;
            }

            // Trust the server's post-purchase state rather than recomputing it.
            mutate({
                ...shopData,
                coins: result.coins ?? coins,
                inventory: result.inventory ?? inventory,
                streakShields: result.streakShields ?? streakShields,
            }, false);
            mutate();

            toast(`${item.name} acquired. Check your collection!`, "success");
            return true;
        } catch {
            toast("Something went wrong. Please try again.", "error");
            return false;
        } finally {
            setProcessingId(null);
        }
    };

    const CATEGORIES: { id: ShopItemCategory | "all"; label: string; Icon: any }[] = [
        { id: "all", label: "All", Icon: ShoppingBag },
        { id: "cosmetic", label: "Cosmetics", Icon: Palette },
        { id: "title", label: "Titles", Icon: Tag },
        { id: "consumable", label: "Consumables", Icon: Shield },
        { id: "card", label: "Cards", Icon: CreditCard },
    ];

    const filtered = items.filter((i: ShopItem) => activeCategory === "all" || i.category === activeCategory);
    
    // Daily deals: Pick 3 items dynamically based on the current date
    const dailyDeals: ShopItem[] = [];
    if (items.length > 0) {
        // Build a stable random seed based on today's local date
        const todayDateString = new Date().toLocaleDateString('en-CA'); // e.g., 'YYYY-MM-DD'
        let seed = 0;
        for (let i = 0; i < todayDateString.length; i++) {
            seed = ((seed << 5) - seed) + todayDateString.charCodeAt(i);
            seed |= 0;
        }
        seed = Math.abs(seed);
        
        // Use the seed to pick 3 distinct items (prioritizing non-consumables if enough exist)
        const pool = [...items].sort((a, b) => a.id.localeCompare(b.id)); // Deterministic order
        
        while (dailyDeals.length < 3 && pool.length > 0) {
            const index = seed % pool.length;
            dailyDeals.push(pool[index]);
            pool.splice(index, 1);
            // Advance the seed (Park-Miller pseudo-random formula)
            seed = (seed * 16807) % 2147483647;
        }
    }

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={isGlobalLoading ? { opacity: 0 } : { opacity: 1 }}
            transition={{ duration: 0.8 }}
            className={`min-h-screen bg-[#0a0f0a] text-white overflow-hidden relative ${meltedMonster.variable}`}
        >
            <TopSlimeBorder />

            {/* ───── Hero Header ───── */}
            <div className="relative z-10 pt-20 pb-10 px-8 max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row items-end md:items-center justify-between gap-8">
                    <div>
                        <p className="text-[#D4F268] text-xs font-black uppercase tracking-[0.25em] mb-2 opacity-80">Loopy Economy</p>
                        <motion.h1 
                            animate={{ y: [0, -4, 0] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                            className="font-melted text-6xl md:text-7xl lg:text-[5.5rem] tracking-widest pb-4 mb-2 uppercase leading-none text-[#D4F268]" 
                            style={{ 
                                fontFamily: 'var(--font-melted-monster)',
                                textShadow: '0px 2px 0px #A3E635, 0px 5px 0px #65A30D, 0px 8px 0px #3F6212, 0px 10px 0px #14532D, 0px 20px 30px rgba(0,0,0,0.8)',
                                WebkitTextStroke: '2px #0a0f0a'
                            }}
                        >
                            Loopy Shop
                        </motion.h1>
                        <p className="text-zinc-400 max-w-sm text-sm font-medium leading-relaxed">
                            Trade your hard-earned coins for cosmetics, titles, and holographic collectibles.
                        </p>
                    </div>

                    {/* Balance card minimal to fit Dark Theme */}
                    <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl px-6 py-4 flex flex-col items-end shadow-2xl">
                        <span className="text-zinc-500 text-[9px] font-black uppercase tracking-widest">Available Balance</span>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-3xl font-black text-white"><RollingNumber value={coins} isMounted={isMounted} /></span>
                            <CurrencyCoin size="md" className="w-6 h-6" />
                        </div>
                    </div>
                </div>
            </div>

            {/* ───── Content ───── */}
            <div className="relative z-20 max-w-7xl mx-auto px-8 pb-32">
                
                {/* Daily Deals Section */}
                <div className="mb-14">
                    <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-3">
                        Daily Deals
                        <div className="h-px bg-white/10 flex-1 ml-4" />
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12 pb-8">
                        <AnimatePresence>
                            {dailyDeals.map((item: ShopItem, idx: number) => (
                                <DailyDealCard 
                                    key={`daily-${item.id}`}
                                    item={item}
                                    idx={idx}
                                    owned={item.category !== "consumable" && inventory.includes(item.id)}
                                    processing={processingId === item.id}
                                    coins={coins}
                                    handlePurchase={handlePurchase}
                                    setHoveredPrice={setHoveredPrice}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Filter pill bar */}
                <div className="w-full relative mb-8 flex md:justify-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div className="flex items-center p-1 md:p-1.5 bg-white/5 border border-white/10 rounded-full shadow-2xl backdrop-blur-md min-w-max">
                        {CATEGORIES.map(({ id, label, Icon }) => {
                            const active = activeCategory === id;
                            return (
                                <button
                                    key={id}
                                    onClick={() => {
                                        setActiveCategory(id);
                                    }}
                                    className={`
                                        relative px-3.5 md:px-5 py-1.5 md:py-2 text-[11px] md:text-xs font-bold transition-all rounded-full z-10 flex items-center gap-1.5 md:gap-2 whitespace-nowrap
                                        ${active ? "text-zinc-950" : "text-zinc-400 hover:text-white"}
                                    `}
                                >
                                    {active && (
                                        <SlimePillBackground layoutId="shop-category-pill" />
                                    )}
                                    <Icon size={14} className={active ? "text-zinc-950" : ""} />
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-3">
                    All Items
                    <div className="h-px bg-white/10 flex-1 ml-4" />
                </h2>
                {/* Item Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-12 pb-8">
                    <AnimatePresence>
                        {filtered.map((item: ShopItem, idx: number) => (
                            <ShopItemCard 
                                key={item.id}
                                item={item}
                                idx={idx}
                                owned={item.category !== "consumable" && inventory.includes(item.id)}
                                processing={processingId === item.id}
                                coins={coins}
                                handlePurchase={handlePurchase}
                                setHoveredPrice={setHoveredPrice}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            </div>

            {/* Mascot Fixed on Bottom Right */}
            {isMounted && <SlimeMascot dailyDeals={dailyDeals} coins={coins} hoveredPrice={hoveredPrice} />}
            
        </motion.div>
    );
}
