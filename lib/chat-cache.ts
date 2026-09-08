"use client";

import type { MessageRow } from "@/actions/chat-actions";

/**
 * A small session-scoped cache of recent chat history.
 *
 * Chat was the one surface not reading through a cache: opening a conversation
 * always waited on a full server round-trip before any message appeared, even
 * one you had just been looking at. This holds the tail of each conversation so
 * reopening paints immediately, with the fetched copy replacing it a moment
 * later.
 *
 * Deliberately sessionStorage, not localStorage: message content is sensitive,
 * and sessionStorage is scoped to the tab and cleared when it closes. Entries
 * are also namespaced by user id and dropped on sign-out, so one account can
 * never render another's history from cache on a shared device.
 */

const PREFIX = "skloop-chat-cache";
/** Only the tail is worth caching — enough to fill a screen. */
const MAX_CACHED_MESSAGES = 30;
/** Beyond this the cache is more likely to mislead than help. */
const MAX_AGE_MS = 15 * 60 * 1000;

let currentUserId: string | null = null;

/** Scopes subsequent reads and writes to a user. Call on session resolve. */
export function setChatCacheUser(userId: string | null) {
    if (currentUserId && currentUserId !== userId) {
        clearChatCache();
    }
    currentUserId = userId;
}

function keyFor(conversationId: string): string | null {
    if (!currentUserId) return null;
    return `${PREFIX}:${currentUserId}:${conversationId}`;
}

/** Shape as stored — Dates have been serialised to ISO strings. */
type SerializedMessage = Omit<MessageRow, "timestamp" | "deliveredAt" | "readAt" | "playedAt" | "editedAt"> & {
    timestamp: string;
    deliveredAt?: string;
    readAt?: string;
    playedAt?: string;
    editedAt?: string;
};

interface CachedEntry {
    at: number;
    messages: SerializedMessage[];
}

export function readCachedMessages(conversationId: string): MessageRow[] | null {
    const key = keyFor(conversationId);
    if (!key || typeof window === "undefined") return null;

    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;

        const entry = JSON.parse(raw) as CachedEntry;
        if (!entry?.at || Date.now() - entry.at > MAX_AGE_MS) {
            sessionStorage.removeItem(key);
            return null;
        }

        // Timestamps survive JSON as strings; the UI expects Date objects.
        return entry.messages.map((m) => ({
            ...m,
            timestamp: new Date(m.timestamp),
            deliveredAt: m.deliveredAt ? new Date(m.deliveredAt) : undefined,
            readAt: m.readAt ? new Date(m.readAt) : undefined,
            playedAt: m.playedAt ? new Date(m.playedAt) : undefined,
            editedAt: m.editedAt ? new Date(m.editedAt) : undefined,
        })) as MessageRow[];
    } catch {
        return null;
    }
}

export function writeCachedMessages(conversationId: string, messages: MessageRow[]) {
    const key = keyFor(conversationId);
    if (!key || typeof window === "undefined") return;

    try {
        // JSON.stringify turns the Date fields into ISO strings; readCachedMessages
        // revives them. The cast documents that boundary rather than hiding it.
        const entry = {
            at: Date.now(),
            messages: messages.slice(-MAX_CACHED_MESSAGES),
        } satisfies { at: number; messages: MessageRow[] };
        sessionStorage.setItem(key, JSON.stringify(entry));
    } catch {
        // Quota exceeded or storage unavailable — the cache is optional.
    }
}

/** Drops every cached conversation. Called on sign-out and on user change. */
export function clearChatCache() {
    if (typeof window === "undefined") return;
    try {
        const doomed: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k?.startsWith(PREFIX)) doomed.push(k);
        }
        doomed.forEach((k) => sessionStorage.removeItem(k));
    } catch {
        // ignore
    }
}
