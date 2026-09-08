import type { createClient } from "@/utils/supabase/server";
import { wrapUntrusted, AGENT_LIMITS } from "./loopy-security";
import { searchWeb, isSearchConfigured } from "./web-search";
import { checkRateLimit } from "./rate-limit";
import { evaluateExpression } from "./calculator";

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
    {
        type: "function" as const,
        function: {
            name: "search_web",
            description:
                "Search the web for current information — library versions, recent releases, error messages, documentation, anything that may have changed since training. Use it when the answer depends on something current, or when you are not confident and a citation would help. Always mention that you looked it up.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The search query." },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "calculate",
            description:
                "Evaluate an arithmetic expression exactly. Use it for any real calculation — Big-O growth, memory sizes, percentages, conversions — rather than doing mental arithmetic, which models get wrong. Supports + - * / % ^, parentheses, and sqrt/abs/floor/ceil/round/min/max/pow/log/log2/log10/exp/sin/cos/tan, plus the constants pi and e.",
            parameters: {
                type: "object",
                properties: {
                    expression: { type: "string", description: "e.g. '2^20 / 1024' or 'log2(1000000)'" },
                },
                required: ["expression"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "list_my_projects",
            description:
                "List the learner's own FreeCode projects with their file names. Use it when they refer to something they've built ('my portfolio site', 'the project I made') so you can talk about their actual code.",
            parameters: { type: "object", properties: {} },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "read_project_file",
            description:
                "Read one file from one of the learner's own FreeCode projects, so you can review or debug their real code. Call list_my_projects first to get exact project and file names.",
            parameters: {
                type: "object",
                properties: {
                    project: { type: "string", description: "Project name or slug, from list_my_projects." },
                    file: { type: "string", description: "File name, e.g. 'index.html'." },
                },
                required: ["project", "file"],
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
    /** Web results cited this turn, surfaced to the client's Sources tab. */
    sources: Array<{ title: string; url: string; domain: string; favicon: string; snippet: string }>;
    /** Searches performed this turn, for the per-turn cap. */
    searchCount: number;
}

/**
 * Search budgets.
 *
 * Tavily's free tier is 1,000 credits per MONTH shared across the whole
 * application, not per user. Without caps a single user could exhaust it in
 * minutes — the turn limit alone allows 20 turns/minute, each able to call a
 * tool up to 8 times.
 *
 * Three layers, cheapest check first:
 *   per turn  — stops one question fanning out into many searches
 *   per user  — stops one person consuming everyone's quota
 *   global    — a hard ceiling below the plan's limit, so the bill cannot run
 *
 * The global cap is deliberately under 1,000 to leave headroom, and every limit
 * is env-overridable so they can be raised on a paid plan without a redeploy.
 */
const SEARCH_LIMITS = {
    PER_TURN: Number(process.env.LOOPY_SEARCH_PER_TURN ?? 2),
    PER_USER_PER_DAY: Number(process.env.LOOPY_SEARCH_PER_USER_DAY ?? 15),
    GLOBAL_PER_MONTH: Number(process.env.LOOPY_SEARCH_GLOBAL_MONTH ?? 800),
} as const;

/** Shape of the FreeCode rows these tools read. */
interface ProjectFileNode {
    name?: string;
    type?: string;
    content?: string;
    language?: string;
}

interface ProjectRow {
    name?: string;
    slug?: string;
    description?: string;
    updated_at?: string;
    files?: ProjectFileNode[];
}

const DAY_SECONDS = 86_400;
const MONTH_SECONDS = 30 * DAY_SECONDS;

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


            // ── Web search ──────────────────────────────────────────────────
            case "search_web": {
                const query = String(args.query ?? "").slice(0, 300);
                if (!query.trim()) return "No query supplied.";

                // ── Budget checks, before any credit is spent ───────────────
                if (ctx.searchCount >= SEARCH_LIMITS.PER_TURN) {
                    return `Already searched ${ctx.searchCount} time(s) this turn, which is the limit. Answer with what you have.`;
                }

                const userOk = await checkRateLimit(ctx.supabase, "search:user", ctx.userId, {
                    limit: SEARCH_LIMITS.PER_USER_PER_DAY,
                    windowSeconds: DAY_SECONDS,
                });
                if (!userOk) {
                    return "This learner has used their web searches for today. Do NOT claim you searched. Answer from your own knowledge and say you couldn't check anything current.";
                }

                // Shared across everyone — the actual spend ceiling.
                const globalOk = await checkRateLimit(ctx.supabase, "search:global", "all", {
                    limit: SEARCH_LIMITS.GLOBAL_PER_MONTH,
                    windowSeconds: MONTH_SECONDS,
                });
                if (!globalOk) {
                    console.warn("[web-search] global monthly budget exhausted");
                    return "Web search is unavailable right now. Do NOT claim you searched. Answer from your own knowledge.";
                }

                ctx.searchCount++;

                const { results, provider, error } = await searchWeb(query);

                if (error === "not_configured") {
                    // Distinct from "found nothing" on purpose: the model must not
                    // tell the learner it searched when no search happened.
                    return "Web search is not configured on this deployment. Do NOT claim you searched. Answer from your own knowledge and say you couldn't check anything current.";
                }

                if (error || results.length === 0) {
                    return `Web search returned no results (provider: ${provider}${error ? `, ${error}` : ""}). Say you looked but found nothing useful, then answer from your own knowledge.`;
                }

                // Recorded for the Sources tab, so citations are the real pages
                // that were consulted rather than URLs the model recalled.
                for (const r of results) {
                    if (!ctx.sources.some((s) => s.url === r.url)) {
                        ctx.sources.push({
                            title: r.title, url: r.url, domain: r.domain,
                            favicon: r.favicon, snippet: r.snippet,
                        });
                    }
                }

                // Search results are arbitrary web pages — the least trustworthy
                // input in the system, so they get the same fencing as DB rows.
                return truncate(
                    wrapUntrusted(
                        "web-search",
                        results.map((r, i) => ({
                            ref: i + 1,
                            title: r.title,
                            url: r.url,
                            domain: r.domain,
                            snippet: r.snippet,
                        }))
                    ) + "\n\nCite the pages you actually used, by domain."
                );
            }

            // ── Calculator ──────────────────────────────────────────────────
            case "calculate": {
                const expression = String(args.expression ?? "");
                if (!expression.trim()) return "No expression supplied.";

                try {
                    const value = evaluateExpression(expression);
                    return `${expression} = ${value}`;
                } catch (err) {
                    // A rejected expression is normal input, not a failure —
                    // tell the model so it can rephrase rather than retry blindly.
                    return `Could not evaluate "${expression}": ${
                        err instanceof Error ? err.message : "invalid expression"
                    }. Only arithmetic is supported.`;
                }
            }

            // ── The learner's own projects ──────────────────────────────────
            case "list_my_projects": {
                const { data, error } = await ctx.supabase
                    .from("freecode_projects")
                    .select("name, slug, description, files, updated_at")
                    .eq("user_id", ctx.userId)
                    .order("updated_at", { ascending: false })
                    .limit(20);

                if (error) {
                    console.error("list_my_projects error:", error.message);
                    return "Could not list projects.";
                }
                if (!data || data.length === 0) {
                    return "This learner has no FreeCode projects yet. Suggest building one.";
                }

                // File names and sizes only — contents come from
                // read_project_file, so listing stays cheap in context.
                const summary = (data as ProjectRow[]).map((p) => ({
                    name: p.name,
                    slug: p.slug,
                    description: p.description,
                    updatedAt: p.updated_at,
                    files: Array.isArray(p.files)
                        ? p.files
                              .filter((f) => f?.type === "file")
                              .map((f) => ({ name: f.name, language: f.language, chars: (f.content ?? "").length }))
                        : [],
                }));

                return truncate(wrapUntrusted("learner-projects", summary));
            }

            case "read_project_file": {
                const projectRef = String(args.project ?? "").slice(0, 120).toLowerCase();
                const fileName = String(args.file ?? "").slice(0, 120).toLowerCase();
                if (!projectRef || !fileName) return "Both project and file are required.";

                const { data, error } = await ctx.supabase
                    .from("freecode_projects")
                    .select("name, slug, files")
                    .eq("user_id", ctx.userId)   // scoped to the caller's own projects
                    .limit(50);

                if (error) {
                    console.error("read_project_file error:", error.message);
                    return "Could not read that project.";
                }

                const project = ((data ?? []) as ProjectRow[]).find(
                    (p) =>
                        String(p.slug ?? "").toLowerCase() === projectRef ||
                        String(p.name ?? "").toLowerCase() === projectRef
                );
                if (!project) {
                    return `No project called "${projectRef}". Call list_my_projects for the exact names.`;
                }

                const files: ProjectFileNode[] = Array.isArray(project.files) ? project.files : [];
                const file = files.find(
                    (f) => f?.type === "file" && String(f.name ?? "").toLowerCase() === fileName
                );
                if (!file) {
                    const available = files.filter((f) => f?.type === "file").map((f) => f.name);
                    return `No file "${fileName}" in that project. Available: ${available.join(", ") || "none"}.`;
                }

                return truncate(
                    wrapUntrusted(`project:${project.name}/${file.name}`, String(file.content ?? ""))
                );
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

/**
 * The tools actually offered to the model this request.
 *
 * search_web is withheld when no provider key is set. Advertising a tool that
 * always fails wastes a model round-trip and invites the model to claim it
 * searched when nothing happened.
 */
export function getLoopyTools() {
    const searchReady = isSearchConfigured();
    return LOOPY_TOOLS.filter((t) => searchReady || t.function.name !== "search_web");
}
