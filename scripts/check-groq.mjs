/**
 * Isolates the Loopy failure to either Groq or the app.
 *
 * The agent has been failing with a generic message, and I've been inferring the
 * cause rather than observing it. This calls Groq directly — same model, same
 * tool payload, same streaming flag — with no Next.js, no Supabase, no auth in
 * the way. Whatever it prints is the actual API behaviour.
 *
 * Run:  node scripts/check-groq.mjs
 * Needs GROQ_API_KEY in .env.local (or the environment).
 */

import fs from "node:fs";
import path from "node:path";

// Minimal .env.local reader — avoids requiring dotenv just for this.
function loadEnv() {
    const p = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) {
            process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
    }
}
loadEnv();

const KEY = process.env.GROQ_API_KEY;
if (!KEY) {
    console.error("GROQ_API_KEY not found in .env.local or environment.");
    process.exit(1);
}

const MODEL = process.env.LOOPY_MODEL || "llama-3.1-8b-instant";
const URL = "https://api.groq.com/openai/v1/chat/completions";

const TOOLS = [
    {
        type: "function",
        function: {
            name: "app_help",
            description: "Answer questions about how the app works.",
            parameters: {
                type: "object",
                properties: { topic: { type: "string", description: "What they're asking about." } },
                required: ["topic"],
            },
        },
    },
];

async function attempt(label, body) {
    process.stdout.write(`\n── ${label} `.padEnd(60, "─") + "\n");

    const res = await fetch(URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${KEY}`,
        },
        body: JSON.stringify(body),
    });

    console.log(`  HTTP ${res.status} ${res.statusText}`);

    if (!res.ok) {
        const text = await res.text();
        console.log("  ERROR BODY:");
        console.log(
            text
                .slice(0, 1500)
                .split("\n")
                .map((l) => "    " + l)
                .join("\n")
        );
        return false;
    }

    if (body.stream) {
        // Read a few SSE frames to prove streaming actually works.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let frames = 0;
        let sawToolCall = false;
        let text = "";

        while (frames < 40) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split("\n")) {
                if (!line.startsWith("data: ")) continue;
                const payload = line.slice(6).trim();
                if (payload === "[DONE]") { frames = 999; break; }
                try {
                    const j = JSON.parse(payload);
                    const d = j.choices?.[0]?.delta;
                    if (d?.content) text += d.content;
                    if (d?.tool_calls) sawToolCall = true;
                    frames++;
                } catch { /* partial frame */ }
            }
        }
        reader.cancel().catch(() => {});
        console.log(`  streamed OK — text: ${JSON.stringify(text.slice(0, 80))}`);
        console.log(`  tool_calls seen in stream: ${sawToolCall}`);
    } else {
        const j = await res.json();
        const msg = j.choices?.[0]?.message;
        console.log(`  content: ${JSON.stringify((msg?.content ?? "").slice(0, 80))}`);
        console.log(`  tool_calls: ${msg?.tool_calls ? msg.tool_calls.length : 0}`);
    }
    return true;
}

const base = {
    model: MODEL,
    messages: [
        { role: "system", content: "You are a terse assistant." },
        { role: "user", content: "hello" },
    ],
    max_tokens: 100,
};

console.log(`model: ${MODEL}`);

// Narrows the failure to one variable at a time.
const plain      = await attempt("1. plain (no tools, no stream)", { ...base });
const streaming  = await attempt("2. streaming, no tools",         { ...base, stream: true });
const tools      = await attempt("3. tools, no streaming",         { ...base, tools: TOOLS, tool_choice: "auto" });
const both       = await attempt("4. tools + streaming (what Loopy does)", {
    ...base, tools: TOOLS, tool_choice: "auto", stream: true,
});

console.log("\n" + "═".repeat(60));
console.log("  plain ................. " + (plain ? "ok" : "FAILED"));
console.log("  streaming ............. " + (streaming ? "ok" : "FAILED"));
console.log("  tools ................. " + (tools ? "ok" : "FAILED"));
console.log("  tools + streaming ..... " + (both ? "ok" : "FAILED"));
console.log("═".repeat(60));

if (!plain && !streaming && !tools && !both) {
    console.log("\n=> EVERY request failed identically, so it is not tools or");
    console.log("   streaming — it is the request basics: the model name, the key,");
    console.log("   or account access. Read the error body above; a 404 with");
    console.log("   model_not_found means the model is gone or unavailable to you.");
    console.log("   Run: node scripts/list-groq-models.mjs");
} else if (!both && tools && streaming) {
    console.log("\n=> Groq rejects tools+streaming together for this model.");
    console.log("   Fix: drop stream:true on steps that pass tools, or switch model.");
} else if (!tools) {
    console.log("\n=> Groq rejects the tool payload. See the error body above.");
} else if (!plain) {
    console.log("\n=> The key or account is the problem, not the request shape.");
} else if (both) {
    console.log("\n=> Groq is fine. The failure is inside the app, not the API.");
}
