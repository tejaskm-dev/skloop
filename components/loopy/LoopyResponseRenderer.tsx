"use client";

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Play, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

const ExpandableList = ({ items }: { items: React.ReactNode[] }) => {
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? items : items.slice(0, 4);
    const hiddenCount = items.length - 4;

    return (
        <div className="mb-4 rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
            <AnimatePresence initial={false}>
                {visible.map((item, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, height: 0, y: -6 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -4 }}
                        transition={{
                            duration: 0.22,
                            delay: expanded && i >= 4 ? (i - 4) * 0.055 : 0,
                            ease: [0.34, 1.2, 0.64, 1],
                        }}
                        className="px-4 py-3 text-white/90 font-medium text-sm leading-relaxed flex items-start gap-3 hover:bg-white/5 transition-colors"
                    >
                        <motion.span
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: expanded && i >= 4 ? (i - 4) * 0.055 + 0.08 : 0.06 * Math.min(i, 3), type: 'spring', stiffness: 400, damping: 20 }}
                            className="text-[#D4F268] shrink-0 font-black mt-0.5 text-base leading-none"
                        >
                            ▸
                        </motion.span>
                        <span className="flex-1 [&_ul]:mt-1 [&_ul]:space-y-1 [&_li]:text-white/70 [&_li]:text-xs [&_strong]:text-white [&_strong]:font-black">
                            {item}
                        </span>
                    </motion.div>
                ))}
            </AnimatePresence>

            {items.length > 4 && (
                <motion.button
                    onClick={() => setExpanded(!expanded)}
                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full px-4 py-2.5 text-xs font-black uppercase tracking-widest text-[#D4F268] flex items-center justify-center gap-2 bg-white/[0.02] transition-colors"
                >
                    <motion.span
                        animate={{ rotate: expanded ? 180 : 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                        className="inline-flex"
                    >
                        <ChevronDown size={14} />
                    </motion.span>
                    <AnimatePresence mode="wait">
                        <motion.span
                            key={expanded ? 'less' : 'more'}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                        >
                            {expanded ? 'Show Less' : `Show ${hiddenCount} More`}
                        </motion.span>
                    </AnimatePresence>
                </motion.button>
            )}
        </div>
    );
};

const CodeBlock = ({ language, code }: { language: string; code: string }) => {
    const [copied, setCopied] = useState(false);
    const [output, setOutput] = useState<{ lines: string[]; isError: boolean } | null>(null);
    const isRunnable = language === 'js' || language === 'javascript';

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const [running, setRunning] = useState(false);

    // Executed in a sandboxed iframe with an opaque origin, not on this page.
    // The previous new Function(code)() ran in the app's own realm, with access
    // to the DOM, cookies and the live Supabase session — which is far too much
    // authority for a snippet, and more so now that Loopy can generate code.
    const handleRun = async () => {
        setRunning(true);
        try {
            const { runSandboxed } = await import("@/lib/sandbox-run");
            setOutput(await runSandboxed(code));
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="my-6 rounded-2xl overflow-hidden border border-slate-700 bg-[#0f0f10] shadow-2xl group/code">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#1a1a1d] border-b border-white/10">
                <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                    <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                    <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                </div>
                <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{language}</span>
                <div className="flex items-center gap-2 opacity-0 group-hover/code:opacity-100 transition-opacity">
                    {isRunnable && (
                        <button
                            onClick={handleRun}
                            disabled={running}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#D4F268] hover:bg-[#bef264] disabled:opacity-60 text-black rounded-lg text-xs font-black transition-colors"
                        >
                            <Play size={11} fill="currentColor" /> {running ? 'Running…' : 'Run'}
                        </button>
                    )}
                    <button onClick={handleCopy} className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition-colors">
                        <Copy size={11} /> {copied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
            </div>
            <pre className="p-5 text-sm font-mono text-[#e8e6e3] overflow-x-auto leading-relaxed">
                <code>{code}</code>
            </pre>

            {/* Inline output panel — animated */}
            <AnimatePresence>
                {output && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: [0.34, 1.1, 0.64, 1] }}
                        className={`border-t ${output.isError ? 'border-red-500/30 bg-red-950/40' : 'border-[#D4F268]/20 bg-[#0a1a00]/60'} overflow-hidden`}
                    >
                        <div className="px-5 py-3">
                            <div className="flex items-center justify-between mb-2">
                                <motion.span
                                    initial={{ opacity: 0, x: -6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.08 }}
                                    className={`text-[10px] font-black uppercase tracking-widest ${output.isError ? 'text-red-400' : 'text-[#D4F268]'}`}
                                >
                                    {output.isError ? '✖ Error' : '▶ Output'}
                                </motion.span>
                                <button
                                    onClick={() => setOutput(null)}
                                    className="text-[10px] text-slate-600 hover:text-slate-400 font-bold transition-colors"
                                >
                                    clear
                                </button>
                            </div>
                            <div className="space-y-0.5">
                                {output.lines.map((line, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.05 + i * 0.04, duration: 0.18 }}
                                        className={`font-mono text-[13px] leading-relaxed ${line.startsWith('✖') ? 'text-red-400' :
                                                line.startsWith('⚠') ? 'text-amber-400' :
                                                    line.startsWith('→') ? 'text-[#D4F268]' :
                                                        line.startsWith('✓') ? 'text-emerald-400' :
                                                            'text-slate-300'
                                            }`}
                                    >
                                        {line}
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export function LoopyResponseRenderer({ content }: { content: string }) {
    if (!content) return null;

    // Guard: if the AI accidentally leaked raw JSON instead of just markdown,
    // try to extract the content field rather than rendering the JSON blob.
    let safeContent = content;
    if (content.trimStart().startsWith('{')) {
        try {
            const parsed = JSON.parse(content);
            if (parsed.content && typeof parsed.content === 'string') {
                safeContent = parsed.content;
            }
        } catch {
            // Not valid JSON — render as-is
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.34, 1.1, 0.64, 1] }}
            className="text-white/95 text-[15px] leading-relaxed break-words overflow-hidden"
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                children={safeContent}
                components={{
                    // --- Block elements ---
                    h1: ({ children }) => (
                        <motion.h1
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            className="text-xl font-black text-white mb-3 mt-6 pb-2 border-b border-white/10"
                        >
                            {children}
                        </motion.h1>
                    ),
                    h2: ({ children }) => (
                        <motion.h2
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="text-lg font-black text-white mb-2 mt-5"
                        >
                            {children}
                        </motion.h2>
                    ),
                    h3: ({ children }) => (
                        <motion.h3
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.18, ease: 'easeOut' }}
                            className="text-base font-black text-white/90 mb-2 mt-4"
                        >
                            {children}
                        </motion.h3>
                    ),

                    p: ({ children }) => {
                        const flat = React.Children.toArray(children)
                            .map(c => (typeof c === 'string' ? c : ''))
                            .join('')
                            .toLowerCase();

                        const isWarning =
                            flat.includes('watch out') ||
                            flat.includes('common mistake') ||
                            flat.includes('warning:') ||
                            flat.includes('caution:');

                        if (isWarning) {
                            return (
                                <motion.div
                                    initial={{ opacity: 0, x: -8, scale: 0.98 }}
                                    animate={{ opacity: 1, x: 0, scale: 1 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                                    className="my-4 bg-amber-500/15 border border-amber-400/30 rounded-xl p-4 flex gap-3"
                                >
                                    <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                                    <span className="text-amber-200 font-medium leading-relaxed">{children}</span>
                                </motion.div>
                            );
                        }

                        return <p className="mb-3 last:mb-0 text-white/90 leading-relaxed">{children}</p>;
                    },

                    // --- Inline elements ---
                    strong: ({ children }) => (
                        <strong className="font-black text-[#D4F268]">{children}</strong>
                    ),
                    em: ({ children }) => (
                        <em className="italic text-white/70">{children}</em>
                    ),
                    a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#D4F268] underline underline-offset-2 hover:text-white transition-colors">
                            {children}
                        </a>
                    ),

                    // --- Code ---
                    code: ({ className, children, ...props }: any) => {
                        const isInline = !className;
                        if (isInline) {
                            return (
                                <code className="bg-white/10 text-[#D4F268] px-1.5 py-0.5 rounded font-mono text-[0.85em] font-bold border border-white/10">
                                    {children}
                                </code>
                            );
                        }
                        const match = /language-(\w+)/.exec(className || '');
                        const lang = match ? match[1] : 'code';
                        const code = String(children).replace(/\n$/, '');
                        return <CodeBlock language={lang} code={code} />;
                    },

                    // --- Lists ---
                    ul: ({ children }) => {
                        const items = React.Children.toArray(children).filter(
                            (child) => React.isValidElement(child)
                        );
                        if (items.length === 0) {
                            return <ul className="list-disc list-inside space-y-1 my-3 text-white/90">{children}</ul>;
                        }
                        const itemContents = items.map((item) => {
                            if (!React.isValidElement(item)) return item;
                            const liChildren = (item.props as any).children;
                            return <>{liChildren}</>;
                        });
                        return <ExpandableList items={itemContents} />;
                    },
                    ol: ({ children }) => {
                        const items = React.Children.toArray(children).filter(
                            (child) => React.isValidElement(child)
                        );
                        return (
                            <ol className="space-y-3 my-4">
                                {items.map((child, i) => (
                                    <motion.li
                                        key={i}
                                        initial={{ opacity: 0, x: -12 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{
                                            delay: i * 0.07,
                                            type: 'spring',
                                            stiffness: 320,
                                            damping: 26,
                                        }}
                                        className="flex gap-3 items-start"
                                    >
                                        <motion.span
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: i * 0.07 + 0.06, type: 'spring', stiffness: 400, damping: 18 }}
                                            className="shrink-0 w-6 h-6 rounded-full bg-[#D4F268] text-black text-xs font-black flex items-center justify-center mt-0.5"
                                        >
                                            {i + 1}
                                        </motion.span>
                                        <span className="text-white/90 leading-relaxed font-medium flex-1">
                                            {React.isValidElement(child) ? (child.props as any).children : child}
                                        </span>
                                    </motion.li>
                                ))}
                            </ol>
                        );
                    },

                    // --- Blockquote ---
                    blockquote: ({ children }) => (
                        <motion.blockquote
                            initial={{ opacity: 0, borderLeftWidth: 0 }}
                            animate={{ opacity: 1, borderLeftWidth: 4 }}
                            transition={{ duration: 0.3 }}
                            className="border-l-4 border-[#D4F268]/50 pl-4 my-4 text-white/60 italic"
                        >
                            {children}
                        </motion.blockquote>
                    ),

                    // --- HR ---
                    hr: () => <hr className="border-white/10 my-6" />,
                }}
            />
        </motion.div>
    );
}