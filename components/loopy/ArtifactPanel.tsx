"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, Code2, FileText, Image as ImageIcon, GitBranch, Play } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface LoopyArtifact {
    slug: string;
    kind: "code" | "markdown" | "html" | "svg" | "mermaid";
    title: string;
    language?: string;
    content: string;
    version: number;
}

const KIND_ICON = {
    code: Code2,
    markdown: FileText,
    html: Play,
    svg: ImageIcon,
    mermaid: GitBranch,
} as const;

/**
 * Side panel for Loopy's artifacts.
 *
 * Renders substantial, self-contained pieces of work next to the conversation
 * rather than inline — the same split Claude and ChatGPT use, and the reason
 * artifacts are worth having: the work stays put and stays referenceable while
 * the conversation moves on.
 *
 * SECURITY — html and svg artifacts are model-generated, so they are rendered
 * inside a sandboxed iframe with no allow-same-origin. That means no access to
 * the parent DOM, cookies, localStorage or the Supabase session. Scripts can
 * run (an interactive demo is the point) but only against an opaque origin, so
 * the blast radius of a prompt-injected artifact is the iframe itself.
 */
export function ArtifactPanel({
    artifacts,
    activeSlug,
    onSelect,
    onClose,
}: {
    artifacts: LoopyArtifact[];
    activeSlug: string | null;
    onSelect: (slug: string) => void;
    onClose: () => void;
}) {
    const [copied, setCopied] = useState(false);

    const active = useMemo(
        () => artifacts.find((a) => a.slug === activeSlug) ?? artifacts[artifacts.length - 1],
        [artifacts, activeSlug]
    );

    if (!active) return null;

    const Icon = KIND_ICON[active.kind] ?? Code2;

    const copy = () => {
        navigator.clipboard.writeText(active.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    return (
        <motion.aside
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="flex h-full w-full flex-col border-l-2 border-slate-200 bg-[#FAFAF8]"
        >
            {/* Header */}
            <header className="flex h-16 shrink-0 items-center justify-between border-b-2 border-slate-200 px-4">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-[#b5db3b] bg-[#D4F268] text-[#050505]">
                        <Icon size={17} strokeWidth={2.6} />
                    </div>
                    <div className="min-w-0">
                        <h2 className="truncate text-sm font-black text-zinc-900">{active.title}</h2>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                            {active.language || active.kind}
                            {active.version > 1 && ` · v${active.version}`}
                        </p>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    <button
                        onClick={copy}
                        aria-label="Copy artifact"
                        className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                    >
                        {copied ? <Check size={16} className="text-lime-600" /> : <Copy size={16} />}
                    </button>
                    <button
                        onClick={onClose}
                        aria-label="Close panel"
                        className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                    >
                        <X size={16} />
                    </button>
                </div>
            </header>

            {/* Tabs, when a conversation has produced more than one */}
            {artifacts.length > 1 && (
                <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 px-3 py-2 no-scrollbar">
                    {artifacts.map((a) => (
                        <button
                            key={a.slug}
                            onClick={() => onSelect(a.slug)}
                            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                                a.slug === active.slug
                                    ? "bg-[#D4F268] text-[#050505]"
                                    : "text-zinc-500 hover:bg-zinc-100"
                            }`}
                        >
                            {a.title}
                        </button>
                    ))}
                </div>
            )}

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-auto">
                <ArtifactBody artifact={active} />
            </div>
        </motion.aside>
    );
}

function ArtifactBody({ artifact }: { artifact: LoopyArtifact }) {
    switch (artifact.kind) {
        case "html":
        case "svg":
            return <SandboxedPreview artifact={artifact} />;

        case "mermaid":
            // Rendered as a fenced block; the chat renderer picks up mermaid.
            return (
                <pre className="whitespace-pre-wrap break-words p-5 font-mono text-[13px] leading-relaxed text-zinc-800">
                    {artifact.content}
                </pre>
            );

        case "markdown":
            return (
                <div className="prose prose-zinc prose-sm max-w-none p-5 prose-pre:bg-zinc-900 prose-pre:text-zinc-100">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown>
                </div>
            );

        case "code":
        default:
            return (
                <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-zinc-800">
                    <code>{artifact.content}</code>
                </pre>
            );
    }
}

/**
 * Renders model-generated markup inside a locked-down iframe.
 *
 * `sandbox="allow-scripts"` WITHOUT `allow-same-origin` is the important part:
 * the frame gets an opaque origin, so scripts inside it cannot touch the parent
 * document, cookies, localStorage, or the Supabase session. srcDoc keeps the
 * content from ever being served off this app's own origin.
 */
function SandboxedPreview({ artifact }: { artifact: LoopyArtifact }) {
    const [showSource, setShowSource] = useState(false);

    const srcDoc = useMemo(() => {
        const body =
            artifact.kind === "svg"
                ? `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh">${artifact.content}</div>`
                : artifact.content;

        return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:;">
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;padding:12px;color:#18181b}</style>
</head><body>${body}</body></html>`;
    }, [artifact]);

    return (
        <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center justify-end gap-1 border-b border-slate-100 px-3 py-1.5">
                <button
                    onClick={() => setShowSource((v) => !v)}
                    className="rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                >
                    {showSource ? "Preview" : "Source"}
                </button>
            </div>

            {showSource ? (
                <pre className="flex-1 overflow-auto p-5 font-mono text-[13px] leading-relaxed text-zinc-800">
                    <code>{artifact.content}</code>
                </pre>
            ) : (
                <iframe
                    // No allow-same-origin: opaque origin, no access to this app.
                    sandbox="allow-scripts"
                    srcDoc={srcDoc}
                    title={artifact.title}
                    className="min-h-0 flex-1 border-0 bg-white"
                    referrerPolicy="no-referrer"
                />
            )}
        </div>
    );
}

/** Inline chip shown in the transcript when a turn produced an artifact. */
export function ArtifactChip({
    artifact,
    onOpen,
}: {
    artifact: LoopyArtifact;
    onOpen: () => void;
}) {
    const Icon = KIND_ICON[artifact.kind] ?? Code2;
    return (
        <button
            onClick={onOpen}
            className="group mt-2 flex w-full items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-3 text-left transition-colors hover:border-[#b5db3b] hover:bg-[#FCFEF5]"
        >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#b5db3b] bg-[#D4F268] text-[#050505]">
                <Icon size={18} strokeWidth={2.6} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-zinc-900">{artifact.title}</p>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    {artifact.language || artifact.kind}
                    {artifact.version > 1 && ` · v${artifact.version}`}
                </p>
            </div>
            <span className="shrink-0 pr-1 text-[11px] font-bold uppercase tracking-wider text-zinc-400 group-hover:text-[#7ca80f]">
                Open
            </span>
        </button>
    );
}

export { AnimatePresence };
