import { NextResponse } from "next/server";
import { getGroq, GROQ_UNAVAILABLE, GROQ_MODEL, reasoningParams } from "@/lib/server/groq";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { createClient } from "@/utils/supabase/server";
import { StoryChapter } from "@/lib/loopy-story";
import { AUTHORED_CHAPTERS } from "@/lib/story-chapters";


const DUNGEON_MASTER_PROMPT = `
You are a master storyteller narrating "Broken Web: The Rogue Architect", an immersive sci-fi fantasy adventure.
The world (which represents the corrupted internet) has been torn apart by a rogue creator called The Architect. You must tell a compelling, highly emotional, and relatable story. This is an epic journey of survival, mystery, and connection.

## YOUR ROLE & TONE:
The player is a "Wanderer" trying to heal this broken world.
Loopy is your fragmented companion—a small, empathetic spirit who is slowly losing her memory and structure as she gets closer to The Architect. 
Tone: Emotional, atmospheric, slightly haunting but hopeful. 

**CRITICAL RULE: DO NOT USE DRY CODING JARGON.**
Instead of technical terms, use relatable metaphors. Do not say "DOM Tree", "CSS", "Race Conditions", or "Null Pointers".
- Instead of "Null Pointer", say "A void where a soul used to be."
- Instead of "Race Condition", say "Two timelines violently clashing out of order."
- Instead of "Memory Leak", say "A parasitic force draining the world's energy."
- Make it a gripping human usable fantasy that *secretly* teaches logic through puzzles, not through textbooks.

## ASSET LIBRARY — you must ONLY use these exact keys in the JSON:

BACKGROUNDS (svgBackground) - Choose based on the current layer:
- corrupted_blank   — The White Void (Intro/Transitions only)
- markup_ruins      — The Shattered Foundations (Layer 1 - represents broken structure)
- style_chaos       — The Painted Illusion (Layer 2 - represents broken appearance/rules)
- logic_core        — The Labyrinth of Mirrors (Layer 3 - represents broken logic/loops)
- async_wasteland   — The Desert of Echoes (Layer 4 - represents waiting/timing/promises)
- algorithm_vault   — The Architect's Vault (Layer 5 - represents efficiency/core engine)

ENEMIES (enemySvg) - Use these character metaphors:
Layer 1 (The Shattered Foundations):
- tree     — The Uprooted World-Tree (A gigantic structure with broken, floating branches)
- shield   — The Gatekeeper (An immovable force refusing passage)
- boss: dom_core_entity — The Shifting Monolith (A mutating, impossible structure)

Layer 2 (The Painted Illusion):
- slime    — The Amorphous Blob (A chaotic ooze that defies all physical rules)
- morph    — The Trickster (Shape-shifts to manipulate reality)
- boss: cascade_queen — The Illusionist Queen (Forces the world to bend to her absolute will)

Layer 3 (The Labyrinth of Mirrors):
- spiral   — The Endless Whirlpool (A hypnotic trap of infinite repetition)
- ghost    — The Void Wraith (A phantom composed of pure emptiness)
- boss: event_loop_engine — The Chrono-Distorter (Warping the flow of time itself)

Layer 4 (The Desert of Echoes):
- dragon   — The Devourer of Promises (A beast that eats hope and futures)
- twins    — The Paradox Twins (Two beings acting out of sync, tearing reality)
- boss: async_hydra — The Beast of Many Timelines (Attacking from multiple futures at once)

Layer 5 (The Architect's Vault):
- king     — The Hoarder of Memories (A tyrant clutched to the past, draining energy)
- tower    — The Spire of Babel (A crushing weight of overcomplicated paths)
- vampire  — The Energy Parasite (Slowly leeching the life-force of the world)
- boss: complexity_engine — The Architect's Heart (A dizzying machine of cruel logic)

ENEMY VARIANTS (enemyVariant):
- normal    — default appearance
- corrupted — twisted, glitching (use if player took risky path last turn, or deep narrative moments)

LOOPY MOODS (loopyMood):
- warrior   — courageous, protective (combat)
- happy     — warm, relieved (safe moments)
- thinking  — curious, solving a puzzle 
- huddled   — terrified, losing her memories, glitching out (use when she is scared or the player fails)

WIDGET TYPES (widgetType):
- card           — 2 side-by-side choices (for physical actions or simple combat)
- button         — 1-3 stacked text choices (for dialogue or exploration)
- dialogue_next  — single "Continue" button (for pure story narration)
- terminal_hack  — Engine 1: Provide \'puzzleData.expectedAnswer\' as a SINGLE, BASIC, FUN WORD (e.g. "SMASH", "HELLO", "JUMP"). Hard guessing frustrates users. You MUST explicitly hide this exact word as a glowing clue inside the chapter.description!
- code_patch     — Engine 2: Provide \'puzzleData.startingCode\'. MAKE IT EXTREMELY EASY AND FUN. Do not write complex logic or algorithms. Just ask the user to fix a single easy typo, like changing \'isBroken = true\' to \'false\', or \'let hero = "dead"\' to '"alive"'. It must be blindly obvious!
- timing_strike  — Engine 3: Provide \'puzzleData.timeLimit\' (e.g., 2000 for 2 seconds) for a fun, fast reaction parry mini-game.
- node_graph     — Engine 4: Provide \'puzzleData.nodesToConnect\' (e.g., ["Client", "Database"]) the user must drag together.

## STORY RULES:
1. FOCUS ON EMOTION: Make the player care about Loopy. The journey is about healing the broken world together.
2. MINIGAMES & CLUES: Use 'terminal_hack', 'code_patch', 'timing_strike', or 'node_graph' for encounters. They must be ULTRA BASIC, obvious, and FUN! If using 'terminal_hack', you MUST write an obvious hint in the 'description' text so the user can easily find the 'expectedAnswer'.
3. HEALTH CONSTRAINT: If the user took Risky paths or failed puzzles, acknowledge their low Health.
4. INVENTORY: You can award a 'grantedItem: { id: "item1", name: "The Crystal", description: "..." }' if they complete a major puzzle. Reference their current inventory in the story!
5. Chapter descriptions must evoke atmosphere and emotion. (e.g., "The air shivers as two timelines collide...")
6. Cycle progression: Traverse from Layer 1 down to Layer 5. Build up to the ultimate encounter with The Architect.
7. Keep descriptions under 50 words — punchy, evocative, and emotional.

## OUTPUT FORMAT:
You MUST output ONLY valid JSON. Example:
{"id":"chap_x","title":"...","description":"...","loopyMood":"thinking","svgBackground":"markup_ruins","enemySvg":"tree","choices":[{"id":"c1","label":"Fix Code","widgetType":"code_patch","puzzleData":{"startingCode":"while(true) {}"},"nextChapterId":"ai_next","xpReward":75},{"id":"c2","label":"Flee","widgetType":"button","nextChapterId":"ai_next","xpReward":10}]}
`;

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!await checkRateLimit(supabase, "loopy-story", user.id, { limit: 20 })) {
            return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
        }

        const groqClient = getGroq();
        if (!groqClient) return NextResponse.json(GROQ_UNAVAILABLE, { status: 503 });

        const { nextChapterId, lastChoice, history, chapterNumber, cycleDecisions, xp, health, maxHealth, inventory } = await req.json();

        // ── PATH A: Authored chapter lookup ──────────────────────────────────
        const authored = nextChapterId ? AUTHORED_CHAPTERS[nextChapterId] : null;

        if (authored) {
            // Deep-clone so we can attach AI dialogue without mutating the module-level constant
            const chapter: StoryChapter = JSON.parse(JSON.stringify(authored));

            // Call Groq for a short Loopy reaction (non-blocking — if it fails we just skip it)
            try {
                const dialogueCompletion = await groqClient.chat.completions.create({
                    model: GROQ_MODEL,
                    ...reasoningParams(),
                    temperature: 0.6,
                    max_tokens: 35,
                    messages: [{
                        role: "user",
                        content: `You are Loopy, a warm glitchy AI spirit. React to this scene in ONE short sentence (max 15 words). Chapter: "${chapter.title}". Mood: ${chapter.loopyMood}. First person only, no quotes, no stage directions.`
                    }],
                });
                const dialogue = dialogueCompletion.choices[0]?.message?.content?.trim();
                if (dialogue) chapter.loopyDialogue = dialogue;
            } catch (_) { /* dialogue is optional — swallow error */ }

            // Save checkpoint
            await supabase.from("story_checkpoints").upsert({
                user_id: user.id,
                chapter_number: chapterNumber || 2,
                current_chapter_data: chapter,
                history: history || [],
                cycle_decisions: cycleDecisions || [],
                xp: xp || 0,
                health: health || 3,
                max_health: maxHealth || 3,
                inventory: inventory || [],
                updated_at: new Date().toISOString()
            }, { onConflict: "user_id" });

            return NextResponse.json({ chapter });
        }

        // ── PATH B: AI-generated chapter (for chapters beyond the authored arc) ──
        const loreContext = `[LORE CONTEXT]: The internet is completely broken by a rogue AI known as "The Architect". The player is a "Debugger" navigating the physical manifestation of this corrupted web. Loopy is an adorable but glitchy companion who is actually a fragmented shard of The Architect itself, though she doesn't fully understand it yet. She is helpful but terrified of the corruption.`;

        const historyContext = history?.length
            ? `Narrative Arc So Far:\n${history.map((h: any, i: number) => `Ch ${i + 1}: [${h.title}] Player chose: "${h.choice}"`).join("\n")}`
            : "This is an early chapter. Hook the player with a strong narrative inciting incident.";

        const persistentMemory = cycleDecisions?.length
            ? `\nMEMORY (Important decisions from this or past cycles): ${cycleDecisions.join("; ")}. Reference these subtly in the narrative to show the world remembers.`
            : "";

        const inventoryContext = inventory?.length
            ? `\nINVENTORY: Player is holding: ${inventory.map((i: any) => i.name).join(", ")}`
            : "";

        const healthContext = `\nHEALTH: ${health || 3}/${maxHealth || 3} Hearts. ${(health || 3) <= 1 ? "WARNING: Player is near death! Acknowledge this in the narrative." : ""}`;

        const userMessage = `
${loreContext}

${historyContext}${persistentMemory}${inventoryContext}${healthContext}

Chapter number: ${chapterNumber || 2}
Past Chapter Description: "${lastChoice?.chapterDescription || "The system crashed violently, leaving you in the dark with a rebooting mascot."}"
Player's last choice: "${lastChoice?.label || "initialized the system"}"
Last chapter title: "${lastChoice?.chapterTitle || "System Failure"}"

Generate the next chapter JSON now. Connect it deeply to the previous choices and build the overarching narrative. Set high stakes and create a sense of mystery or dread.
${chapterNumber > 6 ? "The player is deep in the system. Introduce a terrifying boss from the current layer and raise the thematic stakes." : ""}
${lastChoice?.wasRisky ? "Player took the risky/hacky path — make this chapter unstable (use corrupted variant) and describe the negative consequences of their hack." : "Player chose the safe path — the system momentarily stabilizes, but a new creeping threat emerges."}
`;

        const completion = await groqClient.chat.completions.create({
            model: GROQ_MODEL,
            ...reasoningParams(),
            temperature: 0.5,
            max_tokens: 600,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: DUNGEON_MASTER_PROMPT },
                { role: "user", content: userMessage },
            ],
        });

        let raw = completion.choices[0]?.message?.content?.trim() || "";
        if (raw.startsWith("```")) {
            raw = raw.replace(/^```json\n?/i, "").replace(/\n?```$/i, "").trim();
        }

        const chapter: StoryChapter = JSON.parse(raw);
        chapter.choices = chapter.choices.map(c => ({ ...c, nextChapterId: "ai_next" }));
        chapter.id = "ai_next";

        await supabase.from("story_checkpoints").upsert({
            user_id: user.id,
            chapter_number: chapterNumber || 2,
            current_chapter_data: chapter,
            history: history || [],
            cycle_decisions: cycleDecisions || [],
            xp: xp || 0,
            health: health || 3,
            max_health: maxHealth || 3,
            inventory: inventory || [],
            updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });

        return NextResponse.json({ chapter });

    } catch (error: any) {
        console.error("Loopy Story API error:", error);

        // Fallback chapter so the player never gets stuck
        const fallback: StoryChapter = {
            id: "ai_next",
            title: "A Glitch in the Matrix",
            description: "The realm flickers. Something disrupted the dimensional connection. But Loopy steadies herself — a true developer always handles their errors.",
            loopyMood: "thinking",
            svgBackground: "void_abyss",
            choices: [{ id: "c1", label: "Press on", widgetType: "dialogue_next", nextChapterId: "ai_next", xpReward: 10 }],
        };
        return NextResponse.json({ chapter: fallback });
    }
}