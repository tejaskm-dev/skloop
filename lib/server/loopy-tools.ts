import type { createClient } from "@/utils/supabase/server";
import { wrapUntrusted, AGENT_LIMITS } from "./loopy-security";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Tools available to the Loopy agent.
 *
 * SECURITY MODEL — the important part:
 *
 * No tool takes a user id. Every one resolves the acting user from the session
 * that was established before the model ran. That is deliberate: a tool schema
 * is something the model fills in, and a model can be talked into filling it in
 * with someone else's id. Keeping identity out of the schema entirely means a
 * fully jailbroken model still cannot reach another user's data — the worst it
 * can do is ask for its own.
 *
 * This is the same rule applied to the server actions: identity comes from the
 * session, never from the caller.
 *
 * Everything a tool returns is wrapped by wrapUntrusted() before it re-enters
 * the conversation, because lesson text and profile fields are user-authored
 * and could otherwise carry injected instructions.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Schemas exposed to the model
// ─────────────────────────────────────────────────────────────────────────────

export const LOOPY_TOOLS = [
    {
        type: "function" as const,
        function: {
            name: "search_curriculum",
            description:
                "Search Skloop's own lessons, topics and DSA content. Use this whenever the learner asks about a concept that the platform teaches, so you can answer from the actual course material and point them at the right lesson — rather than answering from memory.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Search terms, e.g. 'binary search' or 'flexbox alignment'.",
                    },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "get_my_progress",
            description:
                "Fetch the current learner's own progress: level, XP, streak, courses in flight and recently completed topics. Use it to personalise guidance and to pick a next step that follows on from what they've actually done.",
            parameters: { type: "object", properties: {} },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "create_artifact",
            description:
                "Create or update a substantial, self-contained piece of work shown in a side panel next to the chat — runnable code, a diagram, a written explainer, a visual. Use it when the content is something the learner will read, keep, or come back to, rather than a sentence or two of conversation. Calling it again with the same slug updates that artifact and creates a new version, so prefer updating over making near-duplicates.",
            parameters: {
                type: "object",
                properties: {
                    slug: {
                        type: "string",
                        description:
                            "Short stable kebab-case handle, e.g. 'binary-search-demo'. Reuse it to update the same artifact.",
                    },
                    kind: {
                        type: "string",
                        enum: ["code", "markdown", "html", "svg", "mermaid"],
                        description: "code for runnable snippets, mermaid for flowcharts, html for interactive demos.",
                    },
                    title: { type: "string", description: "Human-readable title." },
                    language: {
                        type: "string",
                        description: "For kind=code: the language, e.g. 'javascript', 'python'.",
                    },
                    content: { type: "string", description: "The full artifact body." },
                },
                required: ["slug", "kind", "title", "content"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "app_help",
            description:
                "Answer questions about how Skloop itself works — XP, levels, streaks, coins, quests, chests, the shop, mentorship, or where to find a feature. Use it for 'how do I…' questions about the product rather than about code.",
            parameters: {
                type: "object",
                properties: {
                    topic: {
                        type: "string",
                        description: "What they're asking about, e.g. 'streaks' or 'how to become a mentor'.",
                    },
                },
                required: ["topic"],
            },
        },
    },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Product knowledge for app_help
// ─────────────────────────────────────────────────────────────────────────────
// Kept server-side and curated rather than retrieved, so answers about how the
// product works are correct instead of invented.

const APP_FACTS: Record<string, string> = {
    xp: "XP comes from completing lessons, topics, daily quests and practice games. Every 500 XP is one level.",
    level: "Level = floor(XP / 500) + 1. Level 10 unlocks the veteran path to becoming a mentor.",
    streak: "Streaks increase by logging in on consecutive days. Missing a day resets it — unless a Streak Shield is held, which is consumed automatically to save it.",
    coins: "Coins are earned from quests and chests, and spent in the Shop on cosmetics, titles, cards and consumables.",
    quests: "Quests come in daily, weekly and monthly cycles. Completing three in a cycle earns a chest — common for daily, rare for weekly, legendary for monthly.",
    chests: "Chests are earned by completing three quests in a cycle. Opening one grants bonus coins and may roll a quest-exclusive cosmetic.",
    shop: "The Shop sells cosmetics, titles, collectible cards and consumables like the XP Booster, Coin Magnet and Streak Shield.",
    mentor: "Two routes to mentor: reach level 10 and apply via the veteran path, or redeem a vouch code from an existing mentor. Mentors can publish sessions and issue vouch codes.",
    practice: "Practice has Daily Codele (a five-letter programming word puzzle), a typing speed race, and DSA quizzes. All award XP and count toward quests.",
    roadmap: "The roadmap lays out tracks as ordered modules and topics. Topics unlock in sequence — prerequisites must be completed first.",
    freecode: "FreeCode is the in-browser sandbox for building and running projects without local setup.",
};

function lookupAppFacts(topic: string): string {
    const q = topic.toLowerCase();
    const hits = Object.entries(APP_FACTS)
        .filter(([k, v]) => q.includes(k) || k.includes(q) || v.toLowerCase().includes(q))
        .map(([, v]) => v);

    return hits.length > 0
        ? hits.join("\n")
        : Object.values(APP_FACTS).join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolContext {
    supabase: Supabase;
    userId: string;
    conversationId: string;
    /** Artifacts written this turn, surfaced to the client for the side panel. */
    artifacts: Array<{ slug: string; kind: string; title: string; language?: string; content: string; version: number }>;
}

function truncate(s: string): string {
    return s.length > AGENT_LIMITS.MAX_TOOL_RESULT_CHARS
        ? s.slice(0, AGENT_LIMITS.MAX_TOOL_RESULT_CHARS) + "\n…(truncated)"
        : s;
}

/**
 * Runs one tool call. Returns a string to feed back to the model as the tool
 * result. Never throws — a tool failure becomes a message the model can recover
 * from, rather than collapsing the whole turn.
 */
export async function executeTool(
    name: string,
    rawArgs: string,
    ctx: ToolContext
): Promise<string> {
    let args: Record<string, unknown>;
    try {
        args = rawArgs ? JSON.parse(rawArgs) : {};
    } catch {
        return "Tool call failed: arguments were not valid JSON.";
    }

    try {
        switch (name) {
            // ── Curriculum retrieval ────────────────────────────────────────
            case "search_curriculum": {
                const query = String(args.query ?? "").slice(0, 200);
                if (!query) return "No query supplied.";

                // Escape PostgREST pattern metacharacters so a crafted query
                // can't broaden the filter.
                const safe = query.replace(/[%,()]/g, " ").trim();
                if (!safe) return "No usable query supplied.";

                const [topicsRes, lessonsRes] = await Promise.all([
                    ctx.supabase
                        .from("topics")
                        .select("id, title, description")
                        .ilike("title", `%${safe}%`)
                        .limit(5),
                    ctx.supabase
                        .from("lessons")
                        .select("id, title, course_id")
                        .ilike("title", `%${safe}%`)
                        .limit(5),
                ]);

                const payload = {
                    topics: topicsRes.data ?? [],
                    lessons: lessonsRes.data ?? [],
                };

                if (payload.topics.length === 0 && payload.lessons.length === 0) {
                    return `No Skloop material matched "${safe}". Answer from your own knowledge and say the platform doesn't cover it yet.`;
                }
                return truncate(wrapUntrusted("skloop-curriculum", payload));
            }

            // ── Own progress ────────────────────────────────────────────────
            // Note there is no userId parameter: identity is ctx.userId, taken
            // from the verified session.
            case "get_my_progress": {
                const [profileRes, coursesRes, topicsRes] = await Promise.all([
                    ctx.supabase
                        .from("profiles")
                        .select("level, xp, streak, coins")
                        .eq("id", ctx.userId)
                        .single(),
                    ctx.supabase
                        .from("user_courses")
                        .select("completed_lessons, courses (title, total_lessons)")
                        .eq("user_id", ctx.userId)
                        .order("last_accessed", { ascending: false })
                        .limit(3),
                    ctx.supabase
                        .from("user_topic_progress")
                        .select("topic_id, topics (title)")
                        .eq("user_id", ctx.userId)
                        .eq("status", "completed")
                        .order("updated_at", { ascending: false })
                        .limit(5),
                ]);

                return truncate(
                    wrapUntrusted("learner-progress", {
                        profile: profileRes.data ?? null,
                        activeCourses: coursesRes.data ?? [],
                        recentlyCompletedTopics: topicsRes.data ?? [],
                    })
                );
            }

            // ── Artifacts ───────────────────────────────────────────────────
            case "create_artifact": {
                const slug = String(args.slug ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60);
                const kind = String(args.kind ?? "code");
                const title = String(args.title ?? "Untitled").slice(0, 120);
                const language = args.language ? String(args.language).slice(0, 40) : null;
                const content = String(args.content ?? "");

                if (!slug) return "create_artifact needs a slug.";
                if (!content.trim()) return "create_artifact needs content.";
                if (!["code", "markdown", "html", "svg", "mermaid"].includes(kind)) {
                    return `Unsupported artifact kind "${kind}".`;
                }
                if (content.length > 100_000) {
                    return "That artifact is too large — keep it under 100,000 characters.";
                }

                const { data, error } = await ctx.supabase.rpc("upsert_loopy_artifact", {
                    p_conversation_id: ctx.conversationId,
                    p_slug: slug,
                    p_kind: kind,
                    p_title: title,
                    p_language: language,
                    p_content: content,
                });

                if (error) {
                    console.error("create_artifact RPC error:", error.message);
                    return "Could not save the artifact.";
                }

                const result = data as { success: boolean; error?: string; version?: number };
                if (!result?.success) return result?.error || "Could not save the artifact.";

                ctx.artifacts.push({
                    slug,
                    kind,
                    title,
                    language: language ?? undefined,
                    content,
                    version: result.version ?? 1,
                });

                // The body is deliberately not echoed back — the model just
                // wrote it, and replaying it burns context for nothing.
                return `Artifact "${title}" saved as ${slug} (version ${result.version}). It is now visible in the side panel. Do not repeat its contents in your reply — refer to it instead.`;
            }

            // ── Product help ────────────────────────────────────────────────
            case "app_help": {
                const topic = String(args.topic ?? "").slice(0, 120);
                return truncate(wrapUntrusted("skloop-product-facts", lookupAppFacts(topic)));
            }

            default:
                return `Unknown tool "${name}".`;
        }
    } catch (err) {
        console.error(`Loopy tool "${name}" failed:`, err);
        return `The ${name} tool failed. Continue without it and tell the learner you couldn't look that up.`;
    }
}
