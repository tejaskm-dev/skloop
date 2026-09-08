"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Zap, Plus, Code2, Globe, ArrowUp } from "lucide-react";
import { LoopyMascot } from "@/components/loopy/LoopyMascot";
import { LoopyResponseRenderer } from "@/components/loopy/LoopyResponseRenderer";
import { ArtifactPanel, ArtifactChip, type LoopyArtifact } from "@/components/loopy/ArtifactPanel";
import { ThinkingPanel, SourceList, type ToolStep, type Source } from "@/components/loopy/ThinkingPanel";


type Message = {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    mood?: string;
    /** Slugs of artifacts produced on this turn, shown as chips in the transcript. */
    artifactSlugs?: string[];
    /** Tools that actually ran this turn, with real durations. */
    toolSteps?: ToolStep[];
    /** Pages search_web actually consulted. */
    sources?: Source[];
};

export default function LoopyChatPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: rawId } = React.use(params);
    // Use a ref for the actual chat ID so we can swap it from 'new' → real ID mid-session
    const [chatId, setChatId] = useState(rawId);
    
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [artifacts, setArtifacts] = useState<LoopyArtifact[]>([]);
    const [activeArtifact, setActiveArtifact] = useState<string | null>(null);
    const [panelOpen, setPanelOpen] = useState(false);
    // Server-side conversation id; distinct from the local route id.
    const conversationIdRef = useRef<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Initial load from local storage
    useEffect(() => {
        if (chatId !== "new") {
            try {
                const saved = localStorage.getItem(`loopy_chat_${chatId}`);
                if (saved) setMessages(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to load chat", e);
            }
        }
    }, [chatId]);

    // Save to local storage on message changes and update sidebar title
    useEffect(() => {
        if (chatId === "new" || messages.length === 0) return;
        
        try {
            localStorage.setItem(`loopy_chat_${chatId}`, JSON.stringify(messages));
            
            // Generate title from first user message
            const firstUserMsg = messages.find(m => m.role === "user");
            if (firstUserMsg) {
                let title = firstUserMsg.content.slice(0, 22).replace(/\n/g, ' ').trim();
                title += firstUserMsg.content.length > 22 ? "..." : "";
                
                const savedList = localStorage.getItem("loopy_chats_list");
                let chatList = savedList ? JSON.parse(savedList) : [];
                
                const existingIndex = chatList.findIndex((c: any) => c.id === chatId);
                if (existingIndex !== -1) {
                    if (chatList[existingIndex].title === "Untitled Chat") {
                        chatList[existingIndex].title = title;
                        localStorage.setItem("loopy_chats_list", JSON.stringify(chatList));
                        window.dispatchEvent(new Event("loopy_chats_updated"));
                    }
                } else {
                    chatList = [{ id: chatId, title }, ...chatList];
                    localStorage.setItem("loopy_chats_list", JSON.stringify(chatList));
                    window.dispatchEvent(new Event("loopy_chats_updated"));
                }
            }
        } catch (e) {
            console.error("Failed to save chat or update list", e);
        }
    }, [messages, chatId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth"
            });
        }
    }, [messages, isLoading]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 250)}px`;
        }
    }, [input]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        
        // If this is a brand-new chat (URL is /chat/new), generate a real ID and
        // update the URL + sidebar BEFORE sending so the chat gets persisted properly.
        let activeChatId = chatId;
        if (chatId === "new") {
            const newId = Date.now().toString();
            activeChatId = newId;
            setChatId(newId);
            // Register in sidebar immediately
            try {
                const title = input.slice(0, 22).replace(/\n/g, ' ').trim() + (input.length > 22 ? "..." : "");
                const savedList = localStorage.getItem("loopy_chats_list");
                const chatList = savedList ? JSON.parse(savedList) : [];
                const updated = [{ id: newId, title }, ...chatList];
                localStorage.setItem("loopy_chats_list", JSON.stringify(updated));
                window.dispatchEvent(new Event("loopy_chats_updated"));
            } catch (e) {}
            // Update URL silently without triggering a Next.js navigation/remount
            window.history.replaceState(null, '', `/loopy/chat/${activeChatId}`);
        }
        
        const userMsg: Message = { id: Date.now().toString(), role: "user", content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);

        // The assistant bubble is created up front and filled in as the stream
        // arrives, so text appears token by token instead of after a long wait.
        const assistantId = (Date.now() + 1).toString();
        setMessages(prev => [...prev, {
            id: assistantId,
            role: "assistant",
            content: "",
            mood: "thinking",
            artifactSlugs: [],
            toolSteps: [],
            sources: [],
        }]);

        const patchAssistant = (fn: (m: Message) => Message) => {
            setMessages(prev => prev.map(m => (m.id === assistantId ? fn(m) : m)));
        };

        try {
            const res = await fetch("/api/loopy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: input,
                    conversationId: conversationIdRef.current,
                    history: messages.map(m => ({ role: m.role, content: m.content })),
                }),
            });

            if (!res.ok || !res.body) throw new Error("API failed");

            // Newline-delimited JSON. A chunk can split an event, so the tail is
            // carried over until its newline arrives.
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.trim()) continue;

                    let evt: any;
                    try { evt = JSON.parse(line); } catch { continue; }

                    switch (evt.type) {
                        case "delta":
                            patchAssistant(m => ({ ...m, content: m.content + evt.text }));
                            break;

                        case "replace":
                            patchAssistant(m => ({ ...m, content: evt.text }));
                            break;

                        case "tool":
                            patchAssistant(m => {
                                const steps = [...(m.toolSteps ?? [])];
                                if (evt.status === "running") {
                                    steps.push({ name: evt.name, args: evt.args, status: "running" });
                                } else {
                                    // Close the most recent open step for this tool.
                                    for (let i = steps.length - 1; i >= 0; i--) {
                                        if (steps[i].name === evt.name && steps[i].status === "running") {
                                            steps[i] = { ...steps[i], status: "done", ms: evt.ms };
                                            break;
                                        }
                                    }
                                }
                                return { ...m, toolSteps: steps };
                            });
                            break;

                        case "sources":
                            patchAssistant(m => {
                                const existing = m.sources ?? [];
                                const seen = new Set(existing.map(s => s.url));
                                const merged = [...existing];
                                for (const src of evt.sources as Source[]) {
                                    if (!seen.has(src.url)) { seen.add(src.url); merged.push(src); }
                                }
                                return { ...m, sources: merged };
                            });
                            break;

                        case "artifact": {
                            const a = evt.artifact as LoopyArtifact;
                            setArtifacts(prev => {
                                const next = prev.filter(x => x.slug !== a.slug);
                                return [...next, a];
                            });
                            setActiveArtifact(a.slug);
                            setPanelOpen(true);
                            patchAssistant(m => ({
                                ...m,
                                artifactSlugs: Array.from(new Set([...(m.artifactSlugs ?? []), a.slug])),
                            }));
                            break;
                        }

                        case "done":
                            if (evt.conversationId) conversationIdRef.current = evt.conversationId;
                            patchAssistant(m => ({
                                ...m,
                                mood: evt.mood || "happy",
                                // Any step still open when the turn ends is closed,
                                // so nothing spins forever after a failure.
                                toolSteps: (m.toolSteps ?? []).map(t =>
                                    t.status === "running" ? { ...t, status: "done" as const } : t
                                ),
                            }));
                            break;

                        case "error":
                            patchAssistant(m => ({
                                ...m,
                                content: m.content || evt.message,
                                mood: "screaming",
                                toolSteps: (m.toolSteps ?? []).map(t =>
                                    t.status === "running" ? { ...t, status: "done" as const } : t
                                ),
                            }));
                            break;
                    }
                }
            }
        } catch (error) {
            console.error(error);
            patchAssistant(m => ({
                ...m,
                content: m.content || "**Error**: Couldn't reach Loopy. Check your connection and try again.",
                mood: "screaming",
                activeTool: null,
            }));
        } finally {
            setIsLoading(false);
        }
    };

    const isNew = messages.length === 0;

    // Citations from every turn, de-duplicated, for the panel's Sources tab.
    const allSources = (() => {
        const seen = new Set<string>();
        const out: Source[] = [];
        for (const m of messages) {
            for (const src of m.sources ?? []) {
                if (!seen.has(src.url)) { seen.add(src.url); out.push(src); }
            }
        }
        return out;
    })();

    const showPanel = (panelOpen && artifacts.length > 0) || (panelOpen && allSources.length > 0);

    return (
        <div className="flex h-full w-full min-h-0 relative z-10 selection:bg-[#D4F268] selection:text-black">
            {/* Conversation column. Narrows rather than reflows when the panel
                opens, so the transcript keeps its position. */}
            <div className={`flex flex-col h-full min-h-0 min-w-0 transition-[width] duration-300 ${showPanel ? "w-full lg:w-1/2" : "w-full"}`}>
            
            {/* Header */}
            <header className="sticky top-0 z-20 flex h-20 shrink-0 items-center gap-4 border-b border-zinc-200 bg-[#FAFAF8]/90 px-6 backdrop-blur-xl">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-[#D4F268]">
                    <div className="scale-[1.6] translate-y-[3px]">
                        <LoopyMascot size={44} mood="happy" />
                    </div>
                </div>
                <div className="min-w-0">
                    <h1 className="text-lg font-black leading-tight tracking-tight text-[#050505]">Loopy</h1>
                    <p className="text-xs font-bold text-zinc-400">Your learning buddy</p>
                </div>

                {/* Encouragement, hidden where it would crowd the panel */}
                <div className="ml-auto hidden items-center gap-2.5 rounded-2xl bg-[#F4FBE4] px-4 py-2.5 xl:flex">
                    <Zap size={15} className="shrink-0 text-[#7ca80f]" strokeWidth={2.5} />
                    <div>
                        <p className="text-xs font-black leading-tight text-zinc-900">
                            Curious minds build amazing things.
                        </p>
                        <p className="text-[11px] font-medium text-zinc-500">Keep exploring!</p>
                    </div>
                </div>
            </header>

            {/* Messages Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-[#FAFAF8] px-4 py-8 no-scrollbar md:px-6">
                
                {isNew && !isLoading && (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                        <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="w-24 h-24 bg-[#D4F268] rounded-full flex items-center justify-center mb-6 border-4 border-[#b5db3b] shadow-[0_10px_20px_rgba(212,242,104,0.3)]"
                        >
                            <Sparkles size={40} className="text-[#050505]" strokeWidth={2.5} />
                        </motion.div>
                        <h2 className="text-3xl font-black text-[#050505] mb-3">Initialize Guide</h2>
                        <p className="text-slate-500 font-medium max-w-sm text-base">Ask Loopy a question, debug an error, or request architectural advice.</p>
                    </div>
                )}

                <div className="mx-auto max-w-3xl space-y-7">
                    <AnimatePresence initial={false}>
                        {messages.map((msg) => (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ type: "spring", stiffness: 450, damping: 30 }}
                                className={`flex gap-3 font-sans ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                            >
                                {/* Avatar */}
                                <div className="mt-0.5 shrink-0">
                                    {msg.role === "assistant" ? (
                                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-zinc-200">
                                            <div className="scale-[1.5] translate-y-[3px]">
                                                <LoopyMascot size={40} mood={(msg.mood as any) || "happy"} />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#D4F268] text-[10px] font-black tracking-tight text-[#050505]">
                                            YOU
                                        </div>
                                    )}
                                </div>

                                {/* Content Bubble */}
                                <div className={`flex flex-col min-w-0 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start w-full"}`}>
                                    <div
                                        className={
                                            msg.role === "user"
                                                ? "rounded-3xl rounded-tr-md bg-[#EAF7C9] px-5 py-3.5 text-[15px] font-semibold leading-relaxed text-[#050505]"
                                                : "w-full rounded-3xl rounded-tl-md border border-zinc-200 bg-white px-5 py-4 text-[15px] leading-relaxed text-zinc-800"
                                        }
                                    >
                                        {msg.role === "assistant" ? (
                                            <>
                                                <ThinkingPanel steps={msg.toolSteps ?? []} />

                                                <LoopyResponseRenderer content={msg.content} />

                                                {msg.sources && msg.sources.length > 0 && (
                                                    <SourceList sources={msg.sources} compact />
                                                )}

                                                {/* Artifacts produced on this turn */}
                                                {(msg.artifactSlugs ?? []).map(slug => {
                                                    const a = artifacts.find(x => x.slug === slug);
                                                    if (!a) return null;
                                                    return (
                                                        <ArtifactChip
                                                            key={slug}
                                                            artifact={a}
                                                            onOpen={() => { setActiveArtifact(slug); setPanelOpen(true); }}
                                                        />
                                                    );
                                                })}
                                            </>
                                        ) : (
                                            <div className="whitespace-pre-wrap">{msg.content}</div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {isLoading && messages[messages.length - 1]?.content === "" && (messages[messages.length - 1]?.toolSteps ?? []).length === 0 && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4 md:gap-6">
                            <div className="mt-0.5 shrink-0">
                                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-zinc-200">
                                    <div className="scale-[1.5] translate-y-[3px] opacity-60">
                                        <LoopyMascot size={40} mood="thinking" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 rounded-3xl rounded-tl-md border border-zinc-200 bg-white px-4 py-4">
                                <span className="h-2 w-2 animate-bounce rounded-full bg-[#a3d417]" style={{ animationDelay: "0ms" }} />
                                <span className="h-2 w-2 animate-bounce rounded-full bg-[#a3d417]" style={{ animationDelay: "150ms" }} />
                                <span className="h-2 w-2 animate-bounce rounded-full bg-[#a3d417]/50" style={{ animationDelay: "300ms" }} />
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>

            {/* Input */}
            <div className="shrink-0 bg-gradient-to-t from-[#FAFAF8] via-[#FAFAF8] to-transparent px-4 pb-5 pt-4 md:px-8">
                <div className="relative mx-auto max-w-3xl">
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                        className="rounded-[1.75rem] border-2 border-zinc-200 bg-white transition-colors focus-within:border-[#D4F268]"
                    >
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                // Enter sends; Shift+Enter and Cmd+Enter both newline-or-send
                                // consistently with the hint shown below.
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder="Ask Loopy anything..."
                            aria-label="Message Loopy"
                            className="max-h-[220px] min-h-[56px] w-full resize-none rounded-t-[1.75rem] bg-transparent px-5 pt-4 text-[15px] font-medium leading-relaxed text-[#050505] outline-none placeholder:text-zinc-400 no-scrollbar"
                            rows={1}
                        />

                        <div className="flex items-center gap-2 px-3 pb-3">
                            {/* Quick prompts. These only shape the message — the
                                agent decides which tools to actually use. */}
                            <button
                                type="button"
                                onClick={() => setInput((v) => v || "Review this code:\n\n")}
                                aria-label="Insert a code prompt"
                                className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                            >
                                <Plus size={16} strokeWidth={2.5} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setInput((v) => v || "Explain this code:\n\n```\n\n```")}
                                className="flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                            >
                                <Code2 size={14} strokeWidth={2.5} /> Code
                            </button>
                            <button
                                type="button"
                                onClick={() => setInput((v) => v || "Search the web for ")}
                                className="flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                            >
                                <Globe size={14} strokeWidth={2.5} /> Web
                            </button>

                            <button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                aria-label="Send message"
                                className={`ml-auto flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95 ${
                                    input.trim() && !isLoading
                                        ? "bg-[#050505] text-white"
                                        : "cursor-not-allowed bg-zinc-100 text-zinc-300"
                                }`}
                            >
                                <ArrowUp size={18} strokeWidth={3} />
                            </button>
                        </div>
                    </form>

                    <p className="mt-2 text-right text-[11px] font-bold text-zinc-400">
                        Shift + Enter for a new line
                    </p>
                </div>
            </div>
            </div>

            {/* Artifact panel. Full-screen overlay on small viewports, split on
                large ones — there isn't room for a genuine split below lg. */}
            <AnimatePresence>
                {showPanel && (
                    <div className="fixed inset-0 z-40 lg:static lg:z-auto lg:block lg:w-1/2 lg:shrink-0">
                        <ArtifactPanel
                            artifacts={artifacts}
                            activeSlug={activeArtifact}
                            onSelect={setActiveArtifact}
                            onClose={() => setPanelOpen(false)}
                            sources={allSources}
                        />
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
