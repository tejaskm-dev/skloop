/**
 * Verifies web search end to end and reports what it costs.
 *
 * The Tavily path was written without a key available, so it was unverified
 * until now. This calls the provider directly and prints the credit-relevant
 * details, so a misconfiguration shows up here rather than as a silent
 * "I couldn't find anything" in the chat.
 *
 * Run: node scripts/check-search.mjs
 */
import fs from "node:fs";
import path from "node:path";

function loadEnv() {
    const p = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
}
loadEnv();

const tavily = process.env.TAVILY_API_KEY;
const brave = process.env.BRAVE_SEARCH_API_KEY;

console.log("provider keys:");
console.log("  TAVILY_API_KEY      ", tavily ? "set" : "not set");
console.log("  BRAVE_SEARCH_API_KEY", brave ? "set" : "not set");

if (!tavily && !brave) {
    console.log("\nNo key set locally. search_web is hidden from the model, and");
    console.log("Loopy answers from its own knowledge without claiming to search.");
    console.log("Add TAVILY_API_KEY to .env.local to verify it here.");
    process.exit(0);
}

if (tavily) {
    console.log("\n── Tavily ──────────────────────────────────────");
    const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tavily}` },
        body: JSON.stringify({
            api_key: tavily,
            query: "what is new in react 19",
            max_results: 5,
            search_depth: "basic",
        }),
    });
    console.log("  HTTP", res.status);
    if (!res.ok) {
        console.log("  BODY:", (await res.text()).slice(0, 400));
        process.exit(1);
    }
    const j = await res.json();
    console.log("  results:", j.results?.length ?? 0, " (1 credit spent)");
    for (const r of (j.results ?? []).slice(0, 3)) {
        console.log("   •", new URL(r.url).hostname.padEnd(24), (r.title || "").slice(0, 46));
    }
}

console.log("\n── Budget in effect ────────────────────────────");
console.log("  per turn        ", process.env.LOOPY_SEARCH_PER_TURN ?? 2);
console.log("  per user/day    ", process.env.LOOPY_SEARCH_PER_USER_DAY ?? 15);
console.log("  global/month    ", process.env.LOOPY_SEARCH_GLOBAL_MONTH ?? 800, "(Tavily free tier is 1000)");
console.log("\n  Worst case: the global cap is a hard ceiling, so spend cannot");
console.log("  exceed it regardless of how many users or how heavy the use.");
