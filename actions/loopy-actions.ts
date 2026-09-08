"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Loopy conversation list.
 *
 * The sidebar previously read a localStorage array of `{id, title}`, so it had
 * no previews, no real timestamps, and nothing survived a device change.
 * Conversations live in Postgres now (migration 008), so this reads the real
 * records — including the last message, for the preview line.
 */

export interface LoopyConversationSummary {
    id: string;
    title: string;
    preview: string | null;
    updatedAt: string;
}

export async function listMyConversations(limit = 30): Promise<LoopyConversationSummary[]> {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: convos, error } = await supabase
        .from("loopy_conversations")
        .select("id, title, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(Math.min(limit, 50));

    if (error) {
        console.error("[loopy] listMyConversations:", error.message);
        return [];
    }
    if (!convos || convos.length === 0) return [];

    // One query for the previews rather than one per conversation.
    const ids = convos.map((c) => c.id);
    const { data: messages } = await supabase
        .from("loopy_messages")
        .select("conversation_id, content, created_at, role")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(300);

    const previewFor = new Map<string, string>();
    for (const m of messages ?? []) {
        if (!previewFor.has(m.conversation_id) && m.content) {
            previewFor.set(m.conversation_id, String(m.content).replace(/\s+/g, " ").slice(0, 80));
        }
    }

    return convos.map((c) => ({
        id: c.id,
        title: c.title || "New chat",
        preview: previewFor.get(c.id) ?? null,
        updatedAt: c.updated_at,
    }));
}

/** Loads a conversation's messages so a chat can be reopened. */
export async function getConversation(conversationId: string) {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // RLS scopes this to the caller; the filter makes the intent explicit.
    const { data, error } = await supabase
        .from("loopy_messages")
        .select("id, role, content, mood, created_at")
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(200);

    if (error) {
        console.error("[loopy] getConversation:", error.message);
        return null;
    }
    return data ?? [];
}

export async function deleteConversation(conversationId: string) {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false };

    const { error } = await supabase
        .from("loopy_conversations")
        .delete()
        .eq("id", conversationId)
        .eq("user_id", user.id);

    return { success: !error };
}

export async function renameConversation(conversationId: string, title: string) {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false };

    const clean = String(title ?? "").trim().slice(0, 80);
    if (!clean) return { success: false };

    const { error } = await supabase
        .from("loopy_conversations")
        .update({ title: clean })
        .eq("id", conversationId)
        .eq("user_id", user.id);

    return { success: !error };
}
