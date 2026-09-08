import Groq from "groq-sdk";

/**
 * Lazily-constructed Groq client.
 *
 * The AI routes each did `if (!process.env.GROQ_API_KEY) throw` at module
 * scope. Next collects page data for every route at build time, so a missing
 * key didn't just disable the feature — it failed the whole production build:
 *
 *   Error: GROQ_API_KEY is not set
 *   Failed to collect page data for /api/loopy-video
 *
 * Deferring construction to request time means the build succeeds without the
 * secret and the route returns a clean 503 instead.
 */
let client: Groq | null = null;

export function getGroq(): Groq | null {
    if (!process.env.GROQ_API_KEY) return null;
    if (!client) {
        client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return client;
}

/** Standard body for routes reached while the key is unset. */
export const GROQ_UNAVAILABLE = {
    error: "AI features are not configured.",
} as const;
