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

/**
 * The chat model every AI route uses.
 *
 * This was hardcoded in seven places across six route files, so when Groq
 * decommissioned `llama-3.3-70b-versatile` the result was model_not_found on
 * every AI feature simultaneously — and fixing it meant editing six files.
 *
 * Overridable via LOOPY_MODEL so a future decommission is an environment
 * variable rather than a redeploy. Run scripts/list-groq-models.mjs to see what
 * the account can actually use.
 */
export const GROQ_MODEL = process.env.LOOPY_MODEL || "llama-3.1-8b-instant";

/** Standard body for routes reached while the model is rejected. */
export const GROQ_MODEL_UNAVAILABLE = {
    error: "The AI model is unavailable. Check LOOPY_MODEL.",
} as const;
