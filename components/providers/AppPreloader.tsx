"use client";

import { useEffect } from "react";
import { useLoading } from "@/components/LoadingProvider";

/**
 * Warms caches for things the user is *likely* to need next.
 *
 * What this used to do, and why it was removed:
 *   - `fetch('/api/user/stats')` — that route does not exist, so every boot
 *     fired a 404.
 *   - `import('gsap')` and `import('framer-motion')` — eagerly downloading two
 *     animation engines on startup defeats the route-level code splitting that
 *     would otherwise fetch them only where they're used. On a mid-tier phone
 *     this competed with the JS actually needed for first paint.
 *
 * What remains is deferred to idle time so it can never contend with initial
 * render, and is strictly best-effort.
 */
export function AppPreloader() {
    const { registerPreloadTasks } = useLoading();

    useEffect(() => {
        // requestIdleCallback isn't available in Safari; fall back to a timeout.
        type IdleWindow = Window & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            cancelIdleCallback?: (handle: number) => void;
        };
        const w = window as IdleWindow;

        const schedule = w.requestIdleCallback
            ? (cb: () => void) => w.requestIdleCallback!(cb, { timeout: 3000 })
            : (cb: () => void) => window.setTimeout(cb, 1500);

        const handle = schedule(() => {
            const preloadTasks: Promise<unknown>[] = [
                // Small, genuinely-likely-next modules only.
                import("@/lib/swr-fetchers").catch(() => {}),
                import("@/components/profile/UserProfileModal").catch(() => {}),
            ];

            if (registerPreloadTasks) {
                registerPreloadTasks(preloadTasks);
            }
        });

        return () => {
            if (w.cancelIdleCallback) {
                w.cancelIdleCallback(handle);
            } else {
                clearTimeout(handle);
            }
        };
    }, [registerPreloadTasks]);

    return null; // logic-only component
}
