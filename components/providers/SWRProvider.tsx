"use client";

import { SWRConfig } from "swr";
import { ReactNode, useEffect, useRef, useState } from "react";

const CACHE_KEY = "skloop-swr-cache";
/** Guards against a pathological cache blocking startup. */
const MAX_CACHE_BYTES = 512 * 1024;

/**
 * SWR cache persisted to localStorage.
 *
 * Two problems this version fixes:
 *
 * 1. The cache used to be read with a synchronous JSON.parse inside the
 *    useState initialiser, so a large blob blocked the main thread before
 *    first paint — worst on exactly the low-end devices that can least afford
 *    it. The provider now starts with an empty Map and hydrates after mount.
 *
 * 2. It persisted on `beforeunload`, which is unreliable on mobile: it doesn't
 *    fire when a tab is backgrounded and then discarded, so phone users
 *    effectively never got a warm cache. `visibilitychange` + `pagehide` are
 *    the events that actually fire there.
 */
export function SWRProvider({ children }: { children: ReactNode }) {
    const [provider] = useState(() => new Map());
    const hydrated = useRef(false);

    // Hydrate after mount so parsing never blocks first paint.
    useEffect(() => {
        if (hydrated.current) return;
        hydrated.current = true;

        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw || raw.length > MAX_CACHE_BYTES) {
                if (raw) localStorage.removeItem(CACHE_KEY);
                return;
            }
            const entries = JSON.parse(raw);
            if (Array.isArray(entries)) {
                for (const [k, v] of entries) provider.set(k, v);
            }
        } catch {
            // Corrupt or unavailable storage: start cold rather than crash.
            try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
        }
    }, [provider]);

    useEffect(() => {
        const persist = () => {
            try {
                const serialized = JSON.stringify(Array.from(provider.entries()));
                if (serialized.length <= MAX_CACHE_BYTES) {
                    localStorage.setItem(CACHE_KEY, serialized);
                }
            } catch {
                // Quota exceeded or storage blocked — non-fatal.
            }
        };

        const onVisibility = () => {
            if (document.visibilityState === "hidden") persist();
        };

        // pagehide + visibilitychange are the pair that actually fire on mobile.
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("pagehide", persist);

        return () => {
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("pagehide", persist);
        };
    }, [provider]);

    return (
        <SWRConfig
            value={{
                provider: () => provider,
                revalidateOnFocus: true,
                focusThrottleInterval: 300000, // only re-fetch on focus if 5 minutes have passed
                revalidateOnReconnect: true,
                keepPreviousData: true,
                dedupingInterval: 10000,
                fetcher: async (resource: string, init?: RequestInit) => {
                    const res = await fetch(resource, init);
                    return res.json();
                }
            }}
        >
            {children}
        </SWRConfig>
    );
}
