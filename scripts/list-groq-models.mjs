/**
 * Lists the Groq models this account can actually use.
 *
 * The agent was calling `llama-3.3-70b-versatile`, which Groq now returns
 * model_not_found for — that single decommissioned name took down every AI
 * feature in the app at once. Guessing a replacement would repeat the mistake,
 * so this asks the API.
 *
 * Run:  node scripts/list-groq-models.mjs
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

const KEY = process.env.GROQ_API_KEY;
if (!KEY) {
    console.error("GROQ_API_KEY not found in .env.local or environment.");
    process.exit(1);
}

const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${KEY}` },
});

if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    console.error(await res.text());
    process.exit(1);
}

const { data = [] } = await res.json();

// Loopy needs a chat model with tool support and a reasonable context window.
// Whisper/TTS/guard models are listed separately so they aren't mistaken for
// candidates.
const isAudio = (id) => /whisper|tts|playai/i.test(id);
const isGuard = (id) => /guard|prompt-?guard/i.test(id);

const chat = data.filter((m) => !isAudio(m.id) && !isGuard(m.id));
const other = data.filter((m) => isAudio(m.id) || isGuard(m.id));

const fmt = (m) =>
    `  ${m.id.padEnd(42)} ctx=${String(m.context_window ?? "?").padStart(7)}  owner=${m.owned_by ?? "?"}`;

console.log(`\nCHAT MODELS AVAILABLE (${chat.length})`);
console.log("─".repeat(78));
chat.sort((a, b) => (b.context_window ?? 0) - (a.context_window ?? 0)).forEach((m) => console.log(fmt(m)));

if (other.length) {
    console.log(`\nNOT CHAT (audio / safety) — ignore these`);
    console.log("─".repeat(78));
    other.forEach((m) => console.log(fmt(m)));
}

// Suggest a replacement, preferring larger instruct-tuned models that are the
// usual fit for tool-calling.
const preferred = chat
    .filter((m) => /llama|qwen|kimi|gpt-oss|deepseek/i.test(m.id))
    .sort((a, b) => (b.context_window ?? 0) - (a.context_window ?? 0));

console.log("\n" + "═".repeat(78));
if (preferred.length) {
    console.log("SUGGESTED replacement for llama-3.3-70b-versatile:");
    preferred.slice(0, 5).forEach((m, i) => console.log(`  ${i + 1}. ${m.id}  (ctx ${m.context_window ?? "?"})`));
    console.log("\nPick one and set LOOPY_MODEL in .env.local, e.g.");
    console.log(`  LOOPY_MODEL=${preferred[0].id}`);
} else {
    console.log("No obvious chat candidate — paste the list above and I'll pick.");
}
console.log("═".repeat(78));
