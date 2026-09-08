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
export const GROQ_MODEL = process.env.LOOPY_MODEL || "openai/gpt-oss-120b";

/** Standard body for routes reached while the model is rejected. */
export const GROQ_MODEL_UNAVAILABLE = {
    error: "The AI model is unavailable. Check LOOPY_MODEL.",
} as const;

/**
 * Extra parameters that depend on which model is configured.
 *
 * gpt-oss and qwen3 emit reasoning tokens. Without `reasoning_format: "hidden"`
 * that chain-of-thought streams straight into the chat bubble alongside the
 * answer — the model thinking out loud in front of the learner.
 *
 * The flag is only sent to models that support it: passing it to a
 * non-reasoning model is rejected, and this is exactly the kind of
 * model-specific detail that should live in one place rather than in six route
 * files.
 */
export function reasoningParams(): Record<string, unknown> {
    const m = GROQ_MODEL.toLowerCase();
    const isReasoning = m.includes("gpt-oss") || m.includes("qwen3") || m.includes("deepseek");

    if (!isReasoning) return {};

    return {
        reasoning_format: "hidden",
        // Keep latency sane for a chat tutor; override if answers feel shallow.
        reasoning_effort: process.env.LOOPY_REASONING_EFFORT || "low",
    };
}
