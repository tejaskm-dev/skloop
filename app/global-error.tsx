"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary.
 *
 * Catches failures in the root layout itself, which route-level error.tsx
 * cannot reach. It replaces the entire document, so it must render its own
 * <html> and <body> and cannot rely on any app styling or provider.
 *
 * Deliberately dependency-free: if this is rendering, something fundamental has
 * already failed, so it must not need anything that might also be broken.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Fire-and-forget; the reporter never throws.
        import("@/lib/report-error")
            .then((m) => m.reportError(error, { boundary: "global" }))
            .catch(() => {});
    }, [error]);

    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#FAFAF8",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    padding: "24px",
                }}
            >
                <div style={{ maxWidth: 460, textAlign: "center" }}>
                    <div
                        style={{
                            width: 64,
                            height: 64,
                            margin: "0 auto 20px",
                            borderRadius: 20,
                            background: "#D4F268",
                            border: "3px solid #b5db3b",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 30,
                        }}
                    >
                        🦉
                    </div>

                    <h1 style={{ fontSize: 24, fontWeight: 900, color: "#050505", margin: "0 0 10px" }}>
                        Something broke
                    </h1>
                    <p style={{ color: "#71717a", fontWeight: 500, lineHeight: 1.6, margin: "0 0 24px" }}>
                        That one is on us — the error has been logged. Reloading usually sorts it.
                    </p>

                    <button
                        onClick={reset}
                        style={{
                            padding: "12px 28px",
                            borderRadius: 16,
                            background: "#D4F268",
                            color: "#050505",
                            fontWeight: 900,
                            fontSize: 15,
                            border: "2px solid #b5db3b",
                            borderBottomWidth: 4,
                            cursor: "pointer",
                        }}
                    >
                        Try again
                    </button>

                    {error.digest && (
                        <p style={{ marginTop: 22, fontSize: 11, color: "#a1a1aa", fontFamily: "monospace" }}>
                            Reference: {error.digest}
                        </p>
                    )}
                </div>
            </body>
        </html>
    );
}
