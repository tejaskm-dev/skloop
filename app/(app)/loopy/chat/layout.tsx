"use client";

import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import { ChatSidebar } from "@/components/loopy/ChatSidebar";

/**
 * Loopy chat shell.
 *
 * Mobile needed real work rather than a narrower desktop layout:
 *
 *  - This was `fixed inset-0 z-50`, but AppShell's mobile header is fixed at
 *    z-80, so the app bar painted over the chat's own header. The shell now
 *    starts below that bar on small screens (its height plus the safe-area
 *    inset) and only goes truly full-screen from md up.
 *
 *  - The sidebar's "collapsed" state still occupied a 68px strip, which on a
 *    390px screen is a sixth of the width spent on one button. On mobile it is
 *    an off-canvas drawer instead: no permanent strip, opened from the header.
 *
 *  - 100dvh (not 100vh) so the layout tracks mobile browser chrome as it
 *    shows and hides, rather than sitting under it.
 */
export default function LoopyChatLayout({ children }: { children: React.ReactNode }) {
    const [drawerOpen, setDrawerOpen] = useState(false);

    // A drawer that leaves the page scrolling behind it feels broken.
    useEffect(() => {
        if (!drawerOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = previous; };
    }, [drawerOpen]);

    return (
        <div
            // Sits below the app's mobile header, which is fixed at z-80; from
            // md up that header is hidden, so the shell takes the full height.
            // Expressed in classes, not an inline style, because an inline
            // `top` would win over the md: breakpoint.
            className="fixed inset-x-0 bottom-0 top-[calc(4rem+env(safe-area-inset-top,0px))] z-50 flex overflow-hidden bg-[#FAFAF8] font-sans md:top-0"
        >
            {/* Desktop: a real column. Mobile: an off-canvas drawer. */}
            <div className="hidden md:flex">
                <ChatSidebar />
            </div>

            {drawerOpen && (
                <>
                    <button
                        aria-label="Close menu"
                        onClick={() => setDrawerOpen(false)}
                        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
                    />
                    <div className="fixed inset-y-0 left-0 z-50 animate-in slide-in-from-left duration-200 md:hidden">
                        <ChatSidebar forceExpanded onNavigate={() => setDrawerOpen(false)} />
                    </div>
                </>
            )}

            <main className="relative z-30 flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[#FAFAF8] text-[#050505] md:shadow-[-10px_0_30px_rgba(0,0,0,0.03)]">
                {/* Ambient wash, desktop only — on a small screen it's just paint. */}
                <div className="pointer-events-none absolute left-[20%] top-[-20%] hidden h-[40%] w-[60%] rounded-full bg-[#D4F268]/20 blur-[120px] md:block" />

                {/* Mobile chat bar. The page's own header is desktop-only, so
                    this carries the identity and the drawer trigger. */}
                <div className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-[#FAFAF8]/95 px-3 backdrop-blur-xl md:hidden">
                    <button
                        onClick={() => setDrawerOpen(true)}
                        aria-label="Open conversations"
                        className="rounded-xl p-2 text-zinc-600 transition-colors active:bg-zinc-100"
                    >
                        <Menu size={20} strokeWidth={2.5} />
                    </button>
                    <span className="text-base font-black tracking-tight text-[#050505]">Loopy</span>
                    <span className="ml-auto rounded-md bg-[#D4F268] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#050505]">
                        Beta
                    </span>
                </div>

                {children}
            </main>
        </div>
    );
}
