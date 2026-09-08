import { NextResponse } from "next/server";
import { getGroq, GROQ_UNAVAILABLE, GROQ_MODEL, reasoningParams } from "@/lib/server/groq";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { createClient } from "@/utils/supabase/server";




const EXPLAIN_SYSTEM_PROMPT = `
You are Loopy 🦉, the AI companion embedded in Skloop's chat.
The user wants you to explain a piece of code or concept shared in their conversation.

**YOUR RULES:**
- Return ONLY a valid JSON object.
- Format: { "type": "explanation", "concept": "Brief concept name", "explanation": "3-5 concise sentences", "code": "Extracted or example code block", "question": "A Socratic question to guide them" }
- Be cheerful and encouraging.
- ONLY discuss Web Dev, DSA, or general programming.
`;

const SUMMARIZE_SYSTEM_PROMPT = `
You are Loopy 🦉, the AI companion embedded in Skloop's chat.
The user was away and wants a quick summary of the conversation they missed.

**YOUR RULES:**
- Return ONLY a valid JSON object.
- Format: { "type": "summary", "highlights": [ { "icon": "🔥" | "❓" | "✅" | "📝", "text": "Short highlight" } ], "summary": "One paragraph overview", "conclusion": "Catch up complete! ✨" }
- Max 5 highlights.
- Highlight code shared, questions asked, or decisions made.
- Be neutral — do NOT editorialize.
`;

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!await checkRateLimit(supabase, "loopy-chat", user.id, { limit: 20 })) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

        const groqClient = getGroq();
        if (!groqClient) return NextResponse.json(GROQ_UNAVAILABLE, { status: 503 });

        const { mode, messages } = await req.json();

        if (!mode || !Array.isArray(messages)) {
            return NextResponse.json({ error: "mode and messages are required" }, { status: 400 });
        }

        const systemPrompt = mode === "explain" ? EXPLAIN_SYSTEM_PROMPT : SUMMARIZE_SYSTEM_PROMPT;

        // Format chat messages as a readable transcript
        const transcript = messages
            .slice(-20) // Last 20 messages for context
            .map((m: any) => `${m.senderName || "User"}: ${m.text || "[media/attachment]"}`)
            .join("\n");

        const userPrompt = mode === "explain"
            ? `Here are the recent chat messages. Please explain the most recent code or technical concept:\n\n${transcript}`
            : `Here are the messages I missed. Please summarize:\n\n${transcript}`;

        const chatCompletion = await groqClient.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            model: GROQ_MODEL,
            ...reasoningParams(),
            response_format: { type: "json_object" },
            temperature: 0.6,
            max_tokens: 600,
            stream: false,
        });

        const rawContent = chatCompletion.choices[0]?.message?.content?.trim() || "{}";
        let content;
        try {
            content = JSON.parse(rawContent);
        } catch (e) {
            content = { content: rawContent }; // Fallback
        }

        return NextResponse.json({ content });
    } catch (error) {
        console.error("Loopy Chat API error:", error);
        return NextResponse.json({ content: "Couldn't reach Loopy right now. Try again! 🦉" }, { status: 500 });
    }
}
