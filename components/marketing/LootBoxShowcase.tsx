"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Coins, Crown, Gift } from "lucide-react";

export default function LootBoxShowcase() {
    return (
        <section className="relative w-full max-w-5xl mx-auto px-2 md:px-6">
            <div className="text-center mb-12 md:mb-20">
                <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-black uppercase">Earn Epic Loot</h2>
                <p className="text-zinc-600 font-bold mt-4 text-balance text-lg">
                    Every line of code you write earns you XP and Skloop Coins. Spend them to unlock profile cosmetics, titles, and streak freezes.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 px-4 md:px-0">
                <LootChest
                    title="Daily Supply"
                    color="bg-zinc-800"
                    borderColor="border-zinc-700"
                    glow="shadow-[0_0_30px_rgba(161,161,170,0.5)]"
                    icon={<Coins className="w-12 h-12 text-zinc-300" />}
                    reward="50 Skloop Coins"
                />
                <LootChest
                    title="Rare Cache"
                    color="bg-lime-500"
                    borderColor="border-lime-400"
                    glow="shadow-[0_0_40px_rgba(212,242,104,0.8)]"
                    icon={<Gift className="w-12 h-12 text-black" />}
                    reward="Exclusive 'Syntax Error' Profile Badge"
                />
                <LootChest
                    title="Legendary Drop"
                    color="bg-orange-500"
                    borderColor="border-orange-400"
                    glow="shadow-[0_0_50px_rgba(249,115,22,0.8)]"
                    icon={<Crown className="w-12 h-12 text-white" />}
                    reward="Animated Profile Frame + 'Legendary' Title"
                />
            </div>

            {/* Disclaimer */}
            <p className="text-center font-bold text-zinc-400 mt-12 text-sm uppercase tracking-widest">
                * Loot boxes shown are illustrative. Skloop does not feature predatory microtransactions. Only skill earns loot.
            </p>
        </section>
    );
}

function LootChest({ title, color, borderColor, glow, icon, reward }: { title: string, color: string, borderColor: string, glow: string, icon: React.ReactNode, reward: string }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div
            className="relative h-64 md:h-80 flex flex-col items-center justify-end cursor-pointer group perspective-[1000px]"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
        >
            {/* The Reward Particle (Pops out when open) */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.5 }}
                        animate={{ opacity: 1, y: -80, scale: 1 }}
                        exit={{ opacity: 0, y: 0, scale: 0.8 }}
                        transition={{ type: "spring", bounce: 0.6 }}
                        className="absolute z-20 flex flex-col items-center"
                    >
                        <div className="relative">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                                className="absolute -inset-8 -z-10"
                            >
                                <Sparkles className="w-full h-full text-yellow-400/50" />
                            </motion.div>
                            <div className="w-20 h-20 md:w-24 md:h-24 bg-white border-4 border-black rounded-full flex items-center justify-center shadow-[4px_4px_0_0_#000]">
                                {icon}
                            </div>
                        </div>
                        <div className="mt-4 bg-black text-white text-xs md:text-sm font-bold px-4 py-2 rounded-full border-2 border-white shadow-[0_4px_0_0_rgba(255,255,255,0.3)] text-center w-[120%] whitespace-nowrap">
                            {reward}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* The 3D Chest Assembly */}
            <div className="relative w-40 h-32 md:w-48 md:h-40 pointer-events-none z-10">
                {/* Chest Base */}
                <motion.div
                    animate={isOpen ? { scaleY: 0.95 } : { scaleY: 1 }}
                    className={`absolute bottom-0 w-full h-3/4 ${color} border-4 border-black rounded-b-xl shadow-[8px_8px_0_0_#000] z-10 transform origin-bottom`}
                >
                    {/* Metal bands */}
                    <div className="absolute top-0 bottom-0 left-4 w-2 bg-black/20" />
                    <div className="absolute top-0 bottom-0 right-4 w-2 bg-black/20" />
                    {/* Keyhole */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-4 h-6 bg-black rounded-t-full rounded-b border border-white/20" />
                </motion.div>

                {/* Chest Lid (Rotates open) */}
                <motion.div
                    initial={false}
                    animate={isOpen ? { rotateX: -60, y: -10 } : { rotateX: 0, y: 0 }}
                    transition={{ type: "spring", bounce: 0.5, stiffness: 200 }}
                    style={{ transformOrigin: "bottom" }}
                    className={`absolute top-0 w-full h-1/2 ${color} border-4 border-black rounded-t-3xl shadow-[0_-4px_0_inset_rgba(0,0,0,0.2)] z-20 ${isOpen ? glow : ''}`}
                >
                    {/* Metal bands mapping */}
                    <div className="absolute top-0 bottom-0 left-4 w-2 bg-black/20" />
                    <div className="absolute top-0 bottom-0 right-4 w-2 bg-black/20" />
                </motion.div>

                {/* Internal Glow when open */}
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={`absolute bottom-0 w-full h-3/4 bg-yellow-400/50 blur-xl z-0`}
                        />
                    )}
                </AnimatePresence>
            </div>

            <h3 className="text-xl font-black mt-6 uppercase tracking-wider">{title}</h3>
        </div>
    );
}
