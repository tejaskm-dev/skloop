"use server";

import { createClient } from "@/utils/supabase/server";

// createNotification moved to lib/server/notifications.ts — it was an exported
// server action, i.e. a public endpoint that let anyone push an arbitrary
// notification (including type: 'system') to any user. It is only ever called
// from trusted server flows, so it no longer belongs on the action surface.

/**
 * Marks the CALLER'S notifications as read.
 * Can be filtered by type and metadata (e.g. conversation_id).
 */
export async function markNotificationsAsRead(filter?: { type?: string; conversationId?: string }) {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return { success: false, error: "Unauthorized" };
    }

    let query = supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

    if (filter?.type) {
        query = query.eq('type', filter.type);
    }

    if (filter?.conversationId) {
        // Use the containment operator for JSONB to check metadata
        query = query.contains('metadata', { conversation_id: filter.conversationId });
    }

    const { error } = await query;

    if (error) {
        console.error("Error marking notifications as read:", error);
        return { success: false, error: error.message };
    }

    return { success: true };
}
