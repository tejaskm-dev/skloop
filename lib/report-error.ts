"use client";

/**
 * Client error reporting.
 *
 * The app had no error monitoring at all, which meant a render failure produced
 * a blank screen for the user and no signal for anyone else — you'd find out
 * from a complaint, or never.
 *
 * This deliberately does NOT pull in an SDK. It posts a small structured
 * payload to /api/client-error, which logs server-side (visible in Vercel logs
 * immediately, no account or new dependency needed) and forwards to Sentry if
 * SENTRY_DSN is ever configured. Swapping in a full SDK later is a change to
 * that route, not to every call site.
 *
 * It never throws and never blocks: reporting a problem must not create one.
 */

export interface ErrorContext {
    /** Which boundary caught it — "global", "app", or a route segment. */
    boundary?: string;
    /** Anything else useful; kept small, and never anything sensitive. */
    [key: string]: unknown;
}

/** Avoids hammering the endpoint when a component errors in a render loop. */
const recentlySent = new Map<string, number>();
const DEDUPE_WINDOW_MS = 30_000;
const MAX_TRACKED = 50;

export function reportError(error: Error & { digest?: string }, context: ErrorContext = {}) {
    try {
        const key = `${error.name}:${error.message}`.slice(0, 200);
        const now = Date.now();

        const last = recentlySent.get(key);
        if (last && now - last < DEDUPE_WINDOW_MS) return;

        if (recentlySent.size > MAX_TRACKED) recentlySent.clear();
        recentlySent.set(key, now);

        const payload = {
            name: error.name,
            message: String(error.message ?? "").slice(0, 500),
            // Stacks can be long and occasionally carry inlined values.
            stack: String(error.stack ?? "").slice(0, 4000),
            digest: error.digest,
            url: typeof window !== "undefined" ? window.location.pathname : undefined,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : undefined,
            context,
            at: new Date().toISOString(),
        };

        const body = JSON.stringify(payload);

        // sendBeacon survives an unload; fetch keepalive is the fallback.
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
            navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
            return;
        }

        void fetch("/api/client-error", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
        }).catch(() => {});
    } catch {
        // Reporting must never be the thing that breaks.
    }
}
