import { createClient } from "@/utils/supabase/server";

/**
 * Server-only notification writer.
 *
 * This deliberately lives OUTSIDE actions/ and has no "use server" directive.
 * It used to be an exported server action, which made it a public endpoint:
 * anyone could POST an arbitrary title/content to any user_id, including
 * type: 'system' — a ready-made in-app phishing primitive.
 *
 * Notifications are only ever created as a side effect of a trusted server
 * flow (a message being sent, a mention being detected), so the only callers
 * are other server modules that have already authenticated the actor.
 */

export interface NotificationPayload {
    user_id: string;
    actor_id?: string;
    type: 'message' | 'achievement' | 'system' | 'mention';
    title: string;
    content?: string;
    metadata?: Record<string, unknown>;
}

export async function createNotification(payload: NotificationPayload) {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('notifications')
        .insert({
            user_id: payload.user_id,
            actor_id: payload.actor_id,
            type: payload.type,
            title: payload.title,
            content: payload.content,
            metadata: payload.metadata || {},
            is_read: false
        })
        .select()
        .single();

    if (error) {
        console.error("Error creating notification:", error);
        return null;
    }

    return data;
}
