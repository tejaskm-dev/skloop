/**
 * Web search for the Loopy agent.
 *
 * Groq's `compound` models ship built-in web search, but they don't accept
 * custom tool definitions — so using them would mean giving up artifacts,
 * curriculum lookup and progress. Implementing search as our own tool keeps
 * both.
 *
 * Provider is chosen from whichever key is configured, so this works with no
 * signup and upgrades cleanly:
 *
 *   TAVILY_API_KEY       — built for LLM use, returns clean snippets (best)
 *   BRAVE_SEARCH_API_KEY — generous free tier, good general index
 *
 * A KEY IS REQUIRED. There is deliberately no keyless fallback: DuckDuckGo's
 * HTML endpoint was tried and returns HTTP 202 with an anti-bot page for
 * automated requests, so it yields nothing. Shipping it anyway would have meant
 * the model reporting "I searched and found nothing" — which is a worse failure
 * than admitting search isn't configured, because it reads as a real result.
 *
 * With no key set, the tool says so plainly and the model answers from its own
 * knowledge while telling the learner it couldn't verify.
 */

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    /** Bare hostname, for display. */
    domain: string;
    /** Favicon URL, resolved from the domain for the sources UI. */
    favicon: string;
}

const TIMEOUT_MS = 8000;
const MAX_RESULTS = 5;

/** Google's favicon service avoids fetching each site just for an icon. */
function faviconFor(domain: string): string {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function toResult(title: string, url: string, snippet: string): SearchResult | null {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
        const domain = parsed.hostname.replace(/^www\./, "");
        return {
            title: (title || domain).slice(0, 200),
            url: parsed.toString(),
            snippet: (snippet || "").slice(0, 500),
            domain,
            favicon: faviconFor(domain),
        };
    } catch {
        return null;
    }
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        return await fn(controller.signal);
    } finally {
        clearTimeout(timer);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────────────────────────────────────

async function searchTavily(query: string, signal: AbortSignal): Promise<SearchResult[]> {
    const key = process.env.TAVILY_API_KEY!;

    const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        signal,
        headers: {
            "Content-Type": "application/json",
            // Tavily moved to Bearer auth but still accepts api_key in the body.
            // Sending both means this works on either, at no cost.
            Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
            api_key: key,
            query,
            max_results: MAX_RESULTS,
            // "basic" is 1 credit; "advanced" is 2. Not worth double the spend
            // against a 1,000/month free tier.
            search_depth: "basic",
            include_answer: false,
            include_raw_content: false,
        }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Tavily ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }

    const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
    return (json.results ?? [])
        .map((r) => toResult(r.title ?? "", r.url ?? "", r.content ?? ""))
        .filter((r): r is SearchResult => r !== null);
}

async function searchBrave(query: string, signal: AbortSignal): Promise<SearchResult[]> {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(MAX_RESULTS));

    const res = await fetch(url, {
        signal,
        headers: {
            Accept: "application/json",
            "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY!,
        },
    });
    if (!res.ok) throw new Error(`Brave ${res.status}`);

    const json = (await res.json()) as {
        web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    return (json.web?.results ?? [])
        .map((r) => toResult(r.title ?? "", r.url ?? "", r.description ?? ""))
        .filter((r): r is SearchResult => r !== null);
}

/**
 * Probe kept for reference. DuckDuckGo's HTML endpoint responds 202 with an
 * anti-bot interstitial to non-browser clients, so it cannot serve as a
 * fallback. Left documented so nobody re-adds it expecting it to work.
 */

// ─────────────────────────────────────────────────────────────────────────────

export function searchProviderName(): "tavily" | "brave" | "none" {
    if (process.env.TAVILY_API_KEY) return "tavily";
    if (process.env.BRAVE_SEARCH_API_KEY) return "brave";
    return "none";
}

/** Whether web search can run at all. */
export function isSearchConfigured(): boolean {
    return searchProviderName() !== "none";
}

/**
 * Runs a web search. Never throws — a failed search should degrade the answer,
 * not the conversation.
 */
export async function searchWeb(query: string): Promise<{ results: SearchResult[]; provider: string; error?: string }> {
    const provider = searchProviderName();
    const trimmed = query.trim().slice(0, 300);

    if (!trimmed) return { results: [], provider, error: "Empty query" };

    if (provider === "none") {
        return { results: [], provider, error: "not_configured" };
    }

    try {
        const results = await withTimeout((signal) =>
            provider === "tavily" ? searchTavily(trimmed, signal) : searchBrave(trimmed, signal)
        );

        // De-duplicate by domain so five results aren't five pages of one site.
        const seen = new Set<string>();
        const deduped = results.filter((r) => {
            if (seen.has(r.domain)) return false;
            seen.add(r.domain);
            return true;
        });

        return { results: deduped.slice(0, MAX_RESULTS), provider };
    } catch (err) {
        console.error(`[web-search] ${provider} failed:`, err);
        return {
            results: [],
            provider,
            error: err instanceof Error ? err.message : "Search failed",
        };
    }
}
