"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, ChevronDown, Globe, BookOpen, User, Calculator, FolderOpen, FileCode, Sparkles } from "lucide-react";

/**
 * The "thinking" panel.
 *
 * Every row here corresponds to a tool that actually ran on the server — the
 * agent streams a `tool` event with a real elapsed time when each one finishes.
 *
 * It deliberately does NOT show the model's reasoning. We set
 * `reasoning_format: "hidden"` so chain-of-thought never reaches the client, so
 * any "understanding your question / preparing an answer" sequence would be
 * invented. Steps that don't match what happened teach people to distrust every
 * other status in the UI, so this shows only what can be evidenced.
 */

export interface ToolStep {
    name: string;
    /** Short preview of the tool's input, e.g. the search query. */
    args?: string;
    status: "running" | "done";
    /** Wall-clock duration, present once finished. */
    ms?: number;
}

const TOOL_META: Record<string, { label: string; verb: string; Icon: typeof Globe; tint: string }> = {
    search_web:        { label: "Web search",     verb: "Searching the web",       Icon: Globe,      tint: "text-sky-500" },
    search_curriculum: { label: "Skloop lessons", verb: "Searching Skloop lessons", Icon: BookOpen,   tint: "text-lime-600" },
    get_my_progress:   { label: "Your progress",  verb: "Checking your progress",  Icon: User,       tint: "text-violet-500" },
    calculate:         { label: "Calculator",     verb: "Working that out",        Icon: Calculator, tint: "text-amber-500" },
    list_my_projects:  { label: "Your projects",  verb: "Looking through your projects", Icon: FolderOpen, tint: "text-orange-500" },
    read_project_file: { label: "Your code",      verb: "Reading your code",       Icon: FileCode,   tint: "text-rose-500" },
    create_artifact:   { label: "Artifact",       verb: "Building that out",       Icon: Sparkles,   tint: "text-fuchsia-500" },
    app_help:          { label: "Skloop help",    verb: "Looking that up",         Icon: BookOpen,   tint: "text-teal-500" },
};

function fmtDuration(ms?: number): string {
    if (ms === undefined) return "";
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function ThinkingPanel({ steps }: { steps: ToolStep[] }) {
    const [open, setOpen] = useState(true);
    if (steps.length === 0) return null;

    const running = steps.some((s) => s.status === "running");
    const totalMs = steps.reduce((sum, s) => sum + (s.ms ?? 0), 0);

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50/80"
        >
            <button
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-zinc-100/60"
            >
                <ChevronDown
                    size={14}
                    className={`shrink-0 text-zinc-400 transition-transform ${open ? "" : "-rotate-90"}`}
                    strokeWidth={2.5}
                />
                <span className="text-sm font-bold text-zinc-700">
                    {running ? "Thinking…" : "Steps taken"}
                </span>
                {!running && totalMs > 0 && (
                    <span className="ml-auto font-mono text-[11px] text-zinc-400">
                        {fmtDuration(totalMs)}
                    </span>
                )}
                {running && <Loader2 size={13} className="ml-auto animate-spin text-[#a3d417]" />}
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden px-4 pb-3"
                    >
                        {steps.map((step, i) => {
                            const meta = TOOL_META[step.name] ?? {
                                label: step.name, verb: step.name, Icon: Sparkles, tint: "text-zinc-400",
                            };
                            const done = step.status === "done";

                            return (
                                <motion.li
                                    key={`${step.name}-${i}`}
                                    initial={{ opacity: 0, x: -6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex items-center gap-2.5 py-1.5"
                                >
                                    {done ? (
                                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#a3d417]">
                                            <Check size={10} className="text-white" strokeWidth={4} />
                                        </span>
                                    ) : (
                                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-zinc-300">
                                            <Loader2 size={9} className="animate-spin text-zinc-400" />
                                        </span>
                                    )}

                                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-600">
                                        {meta.verb}
                                        {step.args && <span className="text-zinc-400"> — {step.args}</span>}
                                    </span>

                                    {done && step.ms !== undefined && (
                                        <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                                            {fmtDuration(step.ms)}
                                        </span>
                                    )}
                                </motion.li>
                            );
                        })}
                    </motion.ul>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface Source {
    title: string;
    url: string;
    domain: string;
    favicon: string;
    snippet: string;
}

/**
 * Citations for a turn.
 *
 * These are the pages `search_web` actually fetched, recorded server-side —
 * not URLs the model produced from memory, which is where citation UIs usually
 * go wrong.
 */
export function SourceList({ sources, compact = false }: { sources: Source[]; compact?: boolean }) {
    if (sources.length === 0) return null;

    if (compact) {
        // Favicon row shown inline under a reply.
        return (
            <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Sources</span>
                <div className="flex items-center -space-x-1.5">
                    {sources.slice(0, 6).map((s) => (
                        <a
                            key={s.url}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            title={`${s.title} — ${s.domain}`}
                            className="transition-transform hover:z-10 hover:scale-110"
                        >
                            {/* Plain <img>: these are arbitrary third-party
                                domains, so routing them through the optimiser
                                would need every one allowlisted. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={s.favicon}
                                alt=""
                                width={16}
                                height={16}
                                loading="lazy"
                                className="h-4 w-4 rounded-sm bg-white ring-2 ring-white"
                            />
                        </a>
                    ))}
                </div>
                {sources.length > 6 && (
                    <span className="text-[10px] font-bold text-zinc-500">+{sources.length - 6}</span>
                )}
            </div>
        );
    }

    return (
        <ul className="space-y-2 p-4">
            {sources.map((s, i) => (
                <li key={s.url}>
                    <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="group flex gap-3 rounded-2xl border-2 border-slate-200 bg-white p-3 transition-colors hover:border-[#b5db3b]"
                    >
                        <span className="mt-0.5 shrink-0 font-mono text-[11px] font-bold text-zinc-400">
                            {i + 1}
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={s.favicon}
                            alt=""
                            width={20}
                            height={20}
                            loading="lazy"
                            className="mt-0.5 h-5 w-5 shrink-0 rounded"
                        />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black text-zinc-900 group-hover:text-[#5c7a0a]">
                                {s.title}
                            </span>
                            <span className="block truncate text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                                {s.domain}
                            </span>
                            {s.snippet && (
                                <span className="mt-1 block line-clamp-2 text-xs font-medium text-zinc-500">
                                    {s.snippet}
                                </span>
                            )}
                        </span>
                    </a>
                </li>
            ))}
        </ul>
    );
}
