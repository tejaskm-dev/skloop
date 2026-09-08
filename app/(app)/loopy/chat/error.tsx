"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * Compact boundary for the full-height chat surfaces, which sit inside a fixed
 * layout where the standard centred error card would overflow.
 */
export default function ChatError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        import("@/lib/report-error")
            .then((m) => m.reportError(error, { boundary: "chat" }))
            .catch(() => {});
    }, [error]);

    return (
        <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-amber-200 bg-amber-50 text-amber-600">
                <AlertTriangle size={22} strokeWidth={2.5} />
            </div>
            <div>
                <p className="font-black text-zinc-900">Couldn&apos;t load this conversation</p>
                <p className="mt-1 text-sm font-medium text-zinc-500">It&apos;s been logged. Give it another go.</p>
            </div>
            <button
                onClick={reset}
                className="flex items-center gap-2 rounded-xl border-2 border-b-4 border-[#b5db3b] bg-[#D4F268] px-5 py-2.5 text-sm font-black text-[#050505] active:translate-y-0.5 active:border-b-2"
            >
                <RotateCw size={14} strokeWidth={3} /> Retry
            </button>
        </div>
    );
}
