"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw, Home } from "lucide-react";
import Link from "next/link";

/**
 * Error boundary for every authenticated route.
 *
 * Without this, any render failure inside (app) — a null profile, a malformed
 * response, an unexpected shape from a tool — unmounted the tree and left a
 * blank screen with no way forward. The app shell (sidebar, nav) stays mounted
 * around this, so the user can navigate away rather than reload.
 */
export default function AppError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        import("@/lib/report-error")
            .then((m) => m.reportError(error, { boundary: "app" }))
            .catch(() => {});
    }, [error]);

    return (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl border-2 border-amber-200 bg-amber-50 text-amber-600">
                <AlertTriangle size={28} strokeWidth={2.5} />
            </div>

            <h2 className="mt-6 text-2xl font-black text-zinc-900">This page hit a snag</h2>
            <p className="mt-2 max-w-sm font-medium leading-relaxed text-zinc-500">
                Not your fault — it&apos;s been logged. Try again, or head back to your dashboard.
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <button
                    onClick={reset}
                    className="flex items-center gap-2 rounded-2xl border-2 border-b-4 border-[#b5db3b] bg-[#D4F268] px-6 py-3 font-black text-[#050505] transition-all active:translate-y-0.5 active:border-b-2"
                >
                    <RotateCw size={16} strokeWidth={3} /> Try again
                </button>
                <Link
                    href="/dashboard"
                    className="flex items-center gap-2 rounded-2xl border-2 border-zinc-200 bg-white px-6 py-3 font-bold text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                    <Home size={16} strokeWidth={2.5} /> Dashboard
                </Link>
            </div>

            {error.digest && (
                <p className="mt-7 font-mono text-[11px] text-zinc-400">Reference: {error.digest}</p>
            )}
        </div>
    );
}
