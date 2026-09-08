"use client";

import { Sidebar } from "./Sidebar";
import { useState, useRef, useEffect } from "react";
import { AppScrollProvider } from "@/components/providers/AppScrollProvider";
import { ReactLenis, useLenis } from "lenis/react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useLoading } from "@/components/LoadingProvider";

import { NotificationListener } from "../notifications/NotificationListener";
import { Button } from "../ui/Button";
import { Menu, Search, Bell, Zap } from "lucide-react";
import Logo from "@/components/Logo";
import { useUser } from "@/context/UserContext";
import { DSAFloatingButton } from "@/components/dsa/DSAFloatingButton";
import { FreeCodeFloatingButton } from "@/components/freecode/FreeCodeFloatingButton";

// Pages that need fixed full-height layout (no scroll)
const FULL_HEIGHT_ROUTES = ["/peer/chat", "/messages", "/loopy/chat"];

// Settings routes — skip the main sidebar entirely; settings has its own layout
const SETTINGS_ROUTES = ["/settings"];


/**
 * Smooth scrolling is an enhancement, not a requirement.
 *
 * Lenis runs a permanent requestAnimationFrame loop and re-drives scroll on the
 * main thread. On a fast desktop that reads as polish; on a mid-tier phone or an
 * older laptop it reads as lag — and `syncTouch` in particular fights the
 * browser's native touch scrolling, which is GPU-accelerated and already smooth.
 *
 * So: off entirely for anyone who asked for reduced motion, off for coarse
 * (touch) pointers, and off on low-core devices. Everyone else keeps the effect.
 */
function useSmoothScrollEnabled() {
    const [enabled, setEnabled] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const coarsePointer = window.matchMedia("(pointer: coarse)");
        // navigator.hardwareConcurrency is absent on some browsers; assume capable.
        const lowPower = (navigator.hardwareConcurrency ?? 8) <= 4;

        const evaluate = () => {
            setEnabled(!reducedMotion.matches && !coarsePointer.matches && !lowPower);
        };

        evaluate();
        reducedMotion.addEventListener("change", evaluate);
        coarsePointer.addEventListener("change", evaluate);

        return () => {
            reducedMotion.removeEventListener("change", evaluate);
            coarsePointer.removeEventListener("change", evaluate);
        };
    }, []);

    return enabled;
}

// PERF 6: Inner component that pauses/resumes Lenis for full-height routes
// instead of unmounting/remounting the Lenis instance on every navigation.
function LenisController({ isFullHeight }: { isFullHeight: boolean }) {
    const lenis = useLenis();
    useEffect(() => {
        if (!lenis) return;
        if (isFullHeight) {
            lenis.stop();
        } else {
            lenis.start();
        }
    }, [lenis, isFullHeight]);
    return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const smoothScroll = useSmoothScrollEnabled();
    const pathname = usePathname();
    const { isLoading } = useLoading();
    // PERF 5: Skip the enter animation after the initial load to prevent nav flash
    const hasLoadedRef = useRef(false);
    if (!isLoading) hasLoadedRef.current = true;

    const isFullHeight = FULL_HEIGHT_ROUTES.some(r => pathname.startsWith(r));
    const isSettingsRoute = SETTINGS_ROUTES.some(r => pathname.startsWith(r));

    // For settings routes, skip the sidebar — settings has its own SettingsShell layout
    if (isSettingsRoute) {
        return (
            <>
                <NotificationListener />
                {children}
            </>
        );
    }

    return (
        <div className="flex h-[100dvh] bg-background p-0 md:p-4 gap-4 overflow-hidden items-stretch">
            <NotificationListener />
            <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
            <div
                className="md:hidden fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-zinc-100 z-[80]"
                style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
            >
                <div className="h-16 flex items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setMobileOpen(true)}
                            className="flex items-center gap-2 hover:opacity-80 transition-opacity active:scale-95"
                        >
                            <Logo className="w-8 h-8" />
                            <span className="font-black text-lg tracking-tight text-zinc-900">skloop</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center overflow-hidden shadow-sm active:scale-90 transition-transform">
                            <div className="w-full h-full bg-gradient-to-br from-lime-400 to-lime-600 opacity-20" />
                        </button>
                    </div>
                </div>
            </div>

            <main className="flex-1 md:card-float overflow-hidden relative flex flex-col h-full md:min-h-[90vh]">
                <motion.div
                    key={pathname}
                    initial={hasLoadedRef.current ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex-1 h-full overflow-hidden flex flex-col pt-[calc(4rem+env(safe-area-inset-top,0px))] md:pt-0 relative z-[50]"
                >
                    <AppScrollProvider>
                        {isFullHeight ? (
                            // Full-height pages (e.g. chat) bypass Lenis entirely so the
                            // Lenis internal div doesn't cap height and cause a gap.
                            <div className="flex flex-col flex-1 h-full overflow-hidden">
                                {children}
                            </div>
                        ) : smoothScroll ? (
                            // Capable, motion-tolerant devices get Lenis smooth scroll.
                            <ReactLenis
                                root={false}
                                autoRaf={true}
                                id="app-scroll-container"
                                options={{
                                    lerp: 0.08,
                                    duration: 1.5,
                                    smoothWheel: true,
                                    // syncTouch is deliberately off: it hijacks native
                                    // touch scrolling, which is the main source of
                                    // scroll jank on phones.
                                    syncTouch: false,
                                    touchMultiplier: 2
                                }}
                                className="flex-1 overflow-y-auto no-scrollbar h-full"
                            >
                                {children}
                            </ReactLenis>
                        ) : (
                            // Touch, low-core, or reduced-motion: native scrolling,
                            // which is GPU-accelerated and costs no main-thread work.
                            <div className="flex-1 overflow-y-auto no-scrollbar h-full">
                                {children}
                            </div>
                        )}
                    </AppScrollProvider>
                </motion.div>
            </main>
            <DSAFloatingButton />
            <FreeCodeFloatingButton />
        </div>
    );
}
