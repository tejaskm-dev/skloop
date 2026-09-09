"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

/**
 * Renders a mermaid diagram.
 *
 * Mermaid artifacts previously displayed their own source in a <pre>, so a
 * request for a visual produced `graph TD; A --> B` as text — the one outcome
 * a learner is guaranteed to notice.
 *
 * The library is ~500KB, so it is imported dynamically and only ever loads for
 * a conversation that actually contains a diagram.
 */
export function MermaidDiagram({ code, id }: { code: string; id: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [state, setState] = useState<"loading" | "ready" | "error">("loading");
    const [error, setError] = useState<string>("");

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setState("loading");
            try {
                const mermaid = (await import("mermaid")).default;

                mermaid.initialize({
                    startOnLoad: false,
                    // securityLevel "strict" disables click handlers and inline
                    // scripts in the diagram — the source is model-generated.
                    securityLevel: "strict",
                    theme: "base",
                    themeVariables: {
                        primaryColor: "#EAF7C9",
                        primaryTextColor: "#18181b",
                        primaryBorderColor: "#a3d417",
                        lineColor: "#a1a1aa",
                        fontFamily: "ui-sans-serif, system-ui, sans-serif",
                        fontSize: "14px",
                    },
                });

                // A unique id per render; mermaid keys its internal state on it.
                const renderId = `mermaid-${id}-${Math.random().toString(36).slice(2)}`;
                const { svg } = await mermaid.render(renderId, code.trim());

                if (cancelled) return;
                if (containerRef.current) containerRef.current.innerHTML = svg;
                setState("ready");
            } catch (err) {
                if (cancelled) return;
                // Invalid diagram source is normal model output, not a crash —
                // show the source so the learner still gets something useful.
                setError(err instanceof Error ? err.message : "Could not render this diagram");
                setState("error");
            }
        })();

        return () => { cancelled = true; };
    }, [code, id]);

    if (state === "error") {
        return (
            <div className="p-5">
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                    <AlertTriangle size={14} />
                    Couldn&apos;t render this diagram
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-50 p-4 font-mono text-[12px] leading-relaxed text-zinc-600">
                    {code}
                </pre>
                {error && <p className="mt-2 font-mono text-[11px] text-zinc-400">{error}</p>}
            </div>
        );
    }

    return (
        <div className="relative min-h-[120px] p-5">
            {state === "loading" && (
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-400">
                    <Loader2 size={14} className="animate-spin" />
                    Rendering diagram…
                </div>
            )}
            <div
                ref={containerRef}
                className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
            />
        </div>
    );
}
