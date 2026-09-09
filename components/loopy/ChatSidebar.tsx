"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, Plus, Search, MoreHorizontal, Trash2, PanelLeft } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useSWR from "swr";
import { useUser } from "@/context/UserContext";
import type { LoopyConversationSummary } from "@/actions/loopy-actions";

/**
 * Loopy's sidebar.
 *
 * Conversations come from Postgres rather than the previous localStorage array
 * of `{id, title}`, so entries carry a real preview line and timestamp and
 * survive a device change.
 *
 * Deliberately just conversations: the nav links, the ⌘K binding and the XP
 * card were removed on request. A shortcut badge that isn't wired, or a stat
 * card duplicating the profile, is chrome that has to be maintained without
 * earning its place.
 */

function timeAgo(iso: string): string {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const fetchConversations = async () => {
    const { listMyConversations } = await import("@/actions/loopy-actions");
    return listMyConversations();
};

export function ChatSidebar({
    forceExpanded = false,
    onNavigate,
}: {
    forceExpanded?: boolean;
    /** Called when the user navigates, so a drawer can close itself. */
    onNavigate?: () => void;
} = {}) {
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useUser();

    const [collapsed, setCollapsed] = useState(false);
    const [query, setQuery] = useState("");
    const [menuFor, setMenuFor] = useState<string | null>(null);

    const { data, mutate } = useSWR<LoopyConversationSummary[]>(
        user ? ["loopyConversations", user.id] : null,
        fetchConversations,
        { revalidateOnFocus: false }
    );

    const conversations = data ?? [];

    useEffect(() => {
        // Only auto-collapse on desktop widths. On mobile this renders inside a
        // drawer, which is already an explicit open/closed state.
        if (!forceExpanded && window.innerWidth < 1024) setCollapsed(true);
    }, [forceExpanded]);

    // The chat page fires this after a turn so a new conversation appears.
    useEffect(() => {
        const refresh = () => mutate();
        window.addEventListener("loopy_chats_updated", refresh);
        return () => window.removeEventListener("loopy_chats_updated", refresh);
    }, [mutate]);

    const newChat = useCallback(() => {
        router.push("/loopy/chat/new");
        onNavigate?.();
    }, [router, onNavigate]);

    const remove = async (id: string) => {
        setMenuFor(null);
        mutate(conversations.filter((c) => c.id !== id), { revalidate: false });
        const { deleteConversation } = await import("@/actions/loopy-actions");
        await deleteConversation(id);
        mutate();
        if (pathname.includes(id)) router.push("/loopy/chat/new");
    };

    const filtered = query.trim()
        ? conversations.filter(
              (c) =>
                  c.title.toLowerCase().includes(query.toLowerCase()) ||
                  (c.preview ?? "").toLowerCase().includes(query.toLowerCase())
          )
        : conversations;

    if (collapsed && !forceExpanded) {
        return (
            <aside className="flex h-full w-[68px] shrink-0 flex-col items-center gap-3 border-r border-zinc-200 bg-white py-4">
                <button
                    onClick={() => setCollapsed(false)}
                    aria-label="Expand sidebar"
                    className="rounded-xl p-2.5 text-zinc-500 transition-colors hover:bg-zinc-100"
                >
                    <PanelLeft size={18} />
                </button>
                <button
                    onClick={newChat}
                    aria-label="New chat"
                    className="rounded-2xl bg-[#050505] p-3 text-white transition-transform active:scale-95"
                >
                    <Plus size={18} strokeWidth={3} />
                </button>
            </aside>
        );
    }

    return (
        <aside
            className={`flex h-full w-[272px] shrink-0 flex-col border-r border-zinc-200 bg-white ${
                forceExpanded ? "w-[min(84vw,300px)] shadow-2xl" : ""
            }`}
            style={forceExpanded ? { paddingTop: "env(safe-area-inset-top, 0px)" } : undefined}
        >
            {/* Brand */}
            <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#050505]">
                    <span className="text-lg font-black text-[#D4F268]">n</span>
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-black tracking-tight text-[#050505]">Loopy</h1>
                        <span className="rounded-md bg-[#D4F268] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#050505]">
                            Beta
                        </span>
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Learn · Build · Level Up
                    </p>
                </div>
                <button
                    onClick={() => setCollapsed(true)}
                    aria-label="Collapse sidebar"
                    className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                >
                    <PanelLeft size={16} />
                </button>
            </div>

            {/* New chat */}
            <div className="px-3 pb-2">
                <button
                    onClick={newChat}
                    className="flex w-full items-center gap-2.5 rounded-2xl bg-[#050505] px-4 py-3 text-sm font-black text-white transition-transform active:scale-[0.98]"
                >
                    <Plus size={16} strokeWidth={3} />
                    New Chat
                </button>
            </div>

            {/* Recent */}
            <div className="flex min-h-0 flex-1 flex-col px-3 pt-2">
                <div className="mb-1 flex items-center justify-between px-2">
                    <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400">
                        Recent Chats
                    </span>
                    <Search size={13} className="text-zinc-400" />
                </div>

                {conversations.length > 6 && (
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search chats..."
                        aria-label="Search conversations"
                        className="mb-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium outline-none focus:border-[#D4F268]"
                    />
                )}

                <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto no-scrollbar pb-3">
                    {filtered.length === 0 ? (
                        <li className="px-2 py-6 text-center text-xs font-medium text-zinc-400">
                            {query ? "No matches." : "No chats yet — start one above."}
                        </li>
                    ) : (
                        filtered.map((c) => {
                            const active = pathname.includes(c.id);
                            return (
                                <li key={c.id} className="group relative">
                                    <Link
                                        href={`/loopy/chat/${c.id}`}
                                        onClick={onNavigate}
                                        className={`block rounded-xl px-3 py-2.5 transition-colors ${
                                            active ? "bg-[#F4FBE4]" : "hover:bg-zinc-50"
                                        }`}
                                    >
                                        <span className="flex items-start gap-2.5">
                                            <MessageSquare
                                                size={14}
                                                className={`mt-0.5 shrink-0 ${active ? "text-[#7ca80f]" : "text-zinc-400"}`}
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[13px] font-bold text-zinc-900">
                                                    {c.title}
                                                </span>
                                                {c.preview && (
                                                    <span className="mt-0.5 block truncate text-[11px] font-medium text-zinc-400">
                                                        {c.preview}
                                                    </span>
                                                )}
                                                <span className="mt-0.5 block text-[10px] font-bold text-zinc-300">
                                                    {timeAgo(c.updatedAt)}
                                                </span>
                                            </span>
                                        </span>
                                    </Link>

                                    <button
                                        onClick={(e) => { e.preventDefault(); setMenuFor(menuFor === c.id ? null : c.id); }}
                                        aria-label={`Options for ${c.title}`}
                                        className="absolute right-2 top-2.5 rounded-md p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-200 group-hover:opacity-100"
                                    >
                                        <MoreHorizontal size={14} />
                                    </button>

                                    <AnimatePresence>
                                        {menuFor === c.id && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                className="absolute right-2 top-9 z-20 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg"
                                            >
                                                <button
                                                    onClick={() => remove(c.id)}
                                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-50"
                                                >
                                                    <Trash2 size={13} /> Delete
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </li>
                            );
                        })
                    )}
                </ul>
            </div>

        </aside>
    );
}
