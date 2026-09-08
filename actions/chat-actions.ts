"use server";

import { createClient } from "@/utils/supabase/server";
import { getAvatarUrl } from "@/lib/utils";

export interface MessageAttachment {
    url: string;
    type: 'image' | 'video' | 'audio' | 'file';
    name?: string;
}

export interface MessageRow {
    id: string;
    senderId: string;
    senderName?: string;
    senderAvatar?: string;
    text?: string;
    caption?: string;
    mediaUrl?: string; // Legacy support
    attachments?: MessageAttachment[];
    type: "text" | "image" | "video" | "audio" | "sticker" | "gif" | "file" | "poll" | "code";
    status?: 'sent' | 'delivered' | 'read';
    deliveredAt?: Date;
    readAt?: Date;
    playedAt?: Date;
    replyToId?: string;
    isEdited?: boolean;
    editedAt?: Date;
    isDeleted?: boolean;
    reactions?: { emoji: string; count: number; userIds: string[] }[];
    timestamp: Date;
    pollId?: string; // Link to polls table for type === 'poll'
    snippetId?: string; // Link to code_snippets table for type === 'code'
    snippetData?: { title: string; language: string; code: string }; // Prefetched snippet data
}


// ─────────────────────────────────────────────────────────────────────────────
// Access guards
//
// Every exported function in a "use server" module is a publicly callable POST
// endpoint. These two helpers make the trust boundary explicit: identity always
// comes from the session, and any function that touches a conversation first
// proves the caller is a participant in it.
// ─────────────────────────────────────────────────────────────────────────────

type ChatClient = Awaited<ReturnType<typeof createClient>>;

async function requireUser(supabase: ChatClient) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error("Unauthorized");
    return user;
}

/**
 * Throws unless `userId` is a participant of `conversationId`.
 * Without this, knowing a conversation UUID was enough to read its messages,
 * members, media and pinned items, or to post into it.
 */
async function requireConversationMember(
    supabase: ChatClient,
    conversationId: string,
    userId: string
) {
    const { data, error } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !data) throw new Error("Forbidden: not a member of this conversation");
}

/**
 * Fetches message history for a specific conversation with sender profiles joined.
 * Supports cursor-based pagination via `options.before` (ISO timestamp) and `options.limit`.
 */
export async function getConversationMessages(
    conversationId: string,
    options?: { before?: string; limit?: number }
): Promise<MessageRow[]> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
        .from('messages')
        .select(`
            id,
            sender_id,
            content,
            caption,
            type,
            status,
            reply_to_id,
            attachments,
            is_edited,
            edited_at,
            is_deleted,
            poll_id,
            snippet_id,
            delivered_at,
            read_at,
            played_at,
            created_at,
            profiles (
                id,
                full_name,
                username,
                avatar_url
            ),
            message_reactions (
                emoji,
                user_id
            ),
            code_snippets:code_snippets!messages_snippet_id_fkey (
                title,
                language,
                code
            ),
            message_status (
                user_id,
                read_at
            )
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(options?.limit ?? 50);

    if (options?.before) {
        query = query.lt('created_at', options.before);
    }

    const { data: dbMessages, error } = await query;

    if (error) {
        console.error("Error fetching messages:", error);
        return [];
    }

    // Reverse to chronological order for the UI
    const messages = (dbMessages ?? []).reverse();

    return messages.map((m: any) => {
        const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        const contentTrimmed = typeof m.content === 'string' ? m.content.trim() : "";
        const isUrl = contentTrimmed.startsWith('https://') || contentTrimmed.startsWith('http://');
        const isGif = isUrl && (contentTrimmed.includes('giphy.com') || contentTrimmed.includes('tenor.com'));

        // If it's a GIF or a direct image URL, override 'text' type for better rendering
        let msgType = m.type;
        if (msgType === 'text' || !msgType) {
            msgType = isGif ? 'gif' : isUrl ? 'image' : 'text';
        }

        const personalStatus = Array.isArray(m.message_status) 
            ? m.message_status.find((s: any) => s.user_id === user.id) 
            : (m.message_status?.user_id === user.id ? m.message_status : null);

        return {
            id: m.id,
            senderId: m.sender_id,
            senderName: profile?.full_name || profile?.username || `User_${m.sender_id?.slice(0, 4) || 'xxxx'}`,
            senderAvatar: profile?.avatar_url,
            text: m.content || undefined,
            caption: m.caption || undefined,
            type: msgType as any,
            mediaUrl: isUrl ? m.content : undefined,
            attachments: m.attachments || [],
            status: personalStatus ? 'read' : (m.status || 'sent'),
            replyToId: m.reply_to_id || undefined,
            isEdited: m.is_edited || false,
            editedAt: m.edited_at ? new Date(m.edited_at) : undefined,
            isDeleted: m.is_deleted || false,
            pollId: m.poll_id || undefined,
            snippetId: m.snippet_id || undefined,
            snippetData: m.code_snippets ? (Array.isArray(m.code_snippets) ? m.code_snippets[0] : m.code_snippets) : undefined,
            deliveredAt: m.delivered_at ? new Date(m.delivered_at) : undefined,
            readAt: personalStatus?.read_at ? new Date(personalStatus.read_at) : (m.read_at ? new Date(m.read_at) : undefined),
            playedAt: m.played_at ? new Date(m.played_at) : undefined,
            reactions: m.message_reactions ? (m.message_reactions as any[]).reduce((acc: any[], r) => {
                const existing = acc.find(a => a.emoji === r.emoji);
                if (existing) {
                    existing.count++;
                    existing.userIds.push(r.user_id);
                } else {
                    acc.push({ emoji: r.emoji, count: 1, userIds: [r.user_id] });
                }
                return acc;
            }, []) : [],
            timestamp: new Date(m.created_at),
        } as MessageRow;
    });
}

/**
 * Sends a new message to a conversation.
 * Uses the authenticated user's identity from the server session.
 */
export async function sendMessage(
    conversationId: string,
    content: string,
    type: MessageRow['type'] = 'text',
    caption?: string,
    attachments: MessageAttachment[] = [],
    replyToId?: string
): Promise<any> {
    const supabase = await createClient();

    // senderId used to be a parameter, so anyone could post as anyone.
    const user = await requireUser(supabase);
    const senderId = user.id;
    await requireConversationMember(supabase, conversationId, senderId);

    const { data, error } = await supabase
        .from('messages')
        .insert({
            conversation_id: conversationId,
            sender_id: senderId,
            content: content,
            type: type,
            attachments: attachments,
            ...(caption ? { caption } : {}),
            ...(replyToId ? { reply_to_id: replyToId } : {}),
            status: 'sent'
        })
        .select()
        .single();

    if (error) {
        console.error("Error sending message:", error);
        throw new Error(error.message);
    }

    // --- TRIGGER NOTIFICATIONS ---
    try {
        // 1. Get all other participants in the conversation
        const { data: participants } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .neq('user_id', senderId);

        if (participants && participants.length > 0) {
            // 2. Get sender profile for the notification title/content
            const { data: senderProfile } = await supabase
                .from('profiles')
                .select('full_name, username')
                .eq('id', senderId)
                .single();

            const senderName = senderProfile?.full_name || senderProfile?.username || `User_${senderId.slice(0, 4)}`;
            
            // 3. Create notifications for each participant
            const { createNotification } = await import("@/lib/server/notifications");
            
            const results = await Promise.all(participants.map(p =>
                createNotification({
                    user_id: p.user_id,
                    actor_id: senderId,
                    type: 'message',
                    title: `New message from ${senderName}`,
                    content: type === 'text' ? content : `Sent a ${type}`,
                    metadata: {
                        conversation_id: conversationId,
                        message_id: data.id
                    }
                })
            ));

            // Detect @mentions and send priority notifications
            const mentionMatches = content.match(/@(\w+)/g);
            if (mentionMatches && type === 'text') {
                for (const mention of mentionMatches) {
                    const username = mention.slice(1);
                    const { data: mentionedProfile } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('username', username)
                        .single();

                    if (mentionedProfile && mentionedProfile.id !== senderId) {
                        await createNotification({
                            user_id: mentionedProfile.id,
                            actor_id: senderId,
                            type: 'mention',
                            title: `${senderName} mentioned you`,
                            content: content.slice(0, 100),
                            metadata: { conversation_id: conversationId, message_id: data.id }
                        });
                    }
                }
            }
        } else {
        }
    } catch (notifError) {
        // Non-blocking error for notifications
        console.error("Failed to send notifications:", notifError);
    }

    return data;
}

/**
 * Finds an existing direct conversation between two users, or creates one.
 * Returns the conversation ID.
 */
export async function getOrCreateDirectConversation(targetUserId: string): Promise<string | null> {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return null;
    }

    // Call the "God Mode" RPC to handle the entire creation flow atomically
    const { data: convoId, error: rpcError } = await supabase
        .rpc('initiate_direct_chat', {
            target_user_id: targetUserId,
        });

    if (rpcError) {
        console.error("[Chat Action] initiate_direct_chat RPC failed:", rpcError);
        console.error("Make sure you have run the new SQL script in the Supabase SQL Editor.");
        return null;
    }

    return convoId as string;
}

/**
 * Fetches all conversations the current user is part of, with last-message previews.
 */
export async function getUserConversations() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { dms: [], groups: [] };
    }

    // Get all conversation IDs for this user
    const { data: myConvos, error } = await supabase
        .from('conversation_participants')
        .select(`
            conversation_id,
            conversations (
                id, type, title, tags, description, avatar_url, updated_at
            )
        `)
        .eq('user_id', user.id);
    
    if (error || !myConvos || myConvos.length === 0) {
        return { dms: [], groups: [] };
    }

    // Sort by updated_at manually since we're joining
    myConvos.sort((a, b) => {
        const timeA = new Date((a.conversations as any)?.updated_at || 0).getTime();
        const timeB = new Date((b.conversations as any)?.updated_at || 0).getTime();
        return timeB - timeA;
    });

    const convoIds = myConvos.map((mc: any) => mc.conversation_id);

    // Compute unread counts for all conversations personalized for the user
    // 1. Get all messages that are NOT globally read AND not sent by me (candidate unreads)
    const { data: potentialUnreads } = await supabase
        .from('messages')
        .select('id, conversation_id')
        .in('conversation_id', convoIds)
        .neq('sender_id', user.id)
        .neq('status', 'read')
        .eq('is_deleted', false)
        // Badge counts don't need to be exact past a point, and this stops one
        // very stale conversation from dragging thousands of rows over the wire.
        .limit(500);

    const unreadMap = new Map<string, number>();

    if (potentialUnreads && potentialUnreads.length > 0) {
        // 2. Fetch IDs of messages the CURRENT user has already read (personal receipts)
        const potentialIds = potentialUnreads.map(m => m.id);
        const { data: readReceipts } = await supabase
            .from('message_status')
            .select('message_id')
            .in('message_id', potentialIds)
            .eq('user_id', user.id);
        
        const readSent = new Set(readReceipts?.map(r => r.message_id) || []);
        
        // 3. Count only those that the user HAS NOT confirmed as read
        for (const msg of potentialUnreads) {
            if (!readSent.has(msg.id)) {
                unreadMap.set(msg.conversation_id, (unreadMap.get(msg.conversation_id) || 0) + 1);
            }
        }
    }

    // Pull all participants for these convos (to find the 'other' person in DMs)
    const { data: allParticipants } = await supabase
        .from('conversation_participants')
        .select(`
            conversation_id,
            user_id,
            profiles (
                id, username, full_name, avatar_url, role, last_seen
            )
        `)
        .in('conversation_id', convoIds)
        .neq('user_id', user.id);

    // Pull last messages for preview.
    //
    // This previously had no limit: it fetched EVERY message in EVERY
    // conversation the user belongs to, ordered desc, then kept the first per
    // conversation in JS. Cost grew with total message history on every load of
    // the conversation list — and on Supabase's free tier that egress is
    // metered. The row cap keeps it bounded; a conversation whose last message
    // falls outside the window simply shows no preview, which is far better
    // than transferring an entire history to render one line of text.
    //
    // The durable fix is a `last_message_id` column on `conversations`,
    // maintained by a trigger — see migration 006.
    const LAST_MESSAGE_SCAN_CAP = 400;
    const { data: lastMessages } = await supabase
        .from('messages')
        .select('conversation_id, content, created_at, sender_id')
        .in('conversation_id', convoIds)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(LAST_MESSAGE_SCAN_CAP);

    // Build a map: conversation_id -> last message
    const lastMsgMap = new Map<string, { content: string; created_at: string; sender_id: string }>();
    for (const msg of (lastMessages ?? [])) {
        if (!lastMsgMap.has(msg.conversation_id)) {
            lastMsgMap.set(msg.conversation_id, msg);
        }
    }

    const dms: any[] = [];
    const groups: any[] = [];

    for (const mc of myConvos) {
        const convo = (mc as any).conversations;
        if (!convo) continue;

        const lastMsg = lastMsgMap.get(convo.id);
        const lastMessage = lastMsg?.content;
        const lastMessageAt = lastMsg?.created_at;

        if (convo.type === 'group') {
            groups.push({
                id: convo.id,
                name: convo.title || 'Study Circle',
                username: 'group',
                description: convo.description,
                avatarUrl: getAvatarUrl(convo.avatar_url),
                track: convo.tags?.[0] || 'Study Circle',
                type: 'group',
                level: 0, xp: 0, streak: 0, status: 'none',
                lastMessage,
                lastMessageAt,
                unreadCount: unreadMap.get(convo.id) || 0,
            });
        } else if (convo.type === 'direct') {
            const peer = allParticipants?.find((p: any) => p.conversation_id === convo.id);
            if (peer && peer.profiles) {
                const profile = Array.isArray(peer.profiles) ? peer.profiles[0] : peer.profiles as any;
                dms.push({
                    id: convo.id,
                    peerId: peer.user_id, // actual user ID for presence tracking
                    name: profile?.full_name || profile?.username || 'User',
                    username: profile?.username || `user_${profile?.id.substring(0, 5)}`,
                    avatarUrl: getAvatarUrl(profile?.avatar_url),
                    track: profile?.role || 'Learner',
                    lastSeen: profile?.last_seen,
                    type: 'direct',
                    level: 0, xp: 0, streak: 0, status: 'none',
                    lastMessage,
                    lastMessageAt,
                    unreadCount: unreadMap.get(convo.id) || 0,
                });
            }
        }
    }

    return { dms, groups };
}

/**
 * Fetches real members of a group conversation.
 */
export async function getConversationMembers(conversationId: string) {
    const supabase = await createClient();

    const user = await requireUser(supabase);
    await requireConversationMember(supabase, conversationId, user.id);

    const { data, error } = await supabase
        .from('conversation_participants')
        .select(`
            user_id,
            role,
            joined_at,
            profiles (
                id, full_name, username, avatar_url
            )
        `)
        .eq('conversation_id', conversationId);

    if (error) {
        console.error("Error fetching members:", error);
        return [];
    }

    return (data ?? []).map((p: any) => {
        const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles as any;
        return {
            id: p.user_id,
            name: profile?.full_name || profile?.username || `User_${p.user_id?.slice(0, 4) || 'xxxx'}`,
            username: profile?.username || '',
            avatarUrl: profile?.avatar_url,
            role: p.role,
            joinedAt: p.joined_at,
        };
    });
}

/**
 * Returns accepted friends (connections) with profile info.
 * Used to populate the New Chat picker.
 */
export async function getFriendsList(): Promise<{
    id: string;
    name: string;
    username: string;
    avatarUrl?: string;
}[]> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: connections } = await supabase
        .from('connections')
        .select('requester_id, recipient_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

    if (!connections || connections.length === 0) {
        return [];
    }

    const peerIds = connections.map((c: any) =>
        c.requester_id === user.id ? c.recipient_id : c.requester_id
    );

    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', peerIds);

    return (profiles ?? []).map((p: any) => ({
        id: p.id,
        name: p.full_name || p.username || 'User',
        username: p.username || '',
        avatarUrl: p.avatar_url,
    }));
}

/**
 * Uploads a file to Supabase Storage and returns the public URL.
 */
export async function uploadChatFile(formData: FormData): Promise<string | null> {
    const file = formData.get('file') as File;
    if (!file) return null;

    // Explicit size check (50MB Supabase Limit)
    if (file.size > 50 * 1024 * 1024) {
        throw new Error("File is too large! Maximum size is 50MB.");
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from('message_attachments')
        .upload(filePath, file, { 
            cacheControl: '3600',
            upsert: false 
        });

    if (uploadError) {
        console.error("Error uploading file:", uploadError);
        const storageError = uploadError as any;
        if (storageError.status === 413 || storageError.message?.includes('too large')) {
            throw new Error("File exceeds storage limits (50MB). Tip: Try a shorter video!");
        }
        throw new Error("Failed to upload file to the Source. Check your connection!");
    }

    const { data: { publicUrl } } = supabase.storage
        .from('message_attachments')
        .getPublicUrl(filePath);

    return publicUrl;
}

/**
 * Edits an existing message.
 */
export async function editMessage(messageId: string, content: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await supabase
        .from('messages')
        .update({
            content: content,
            is_edited: true,
            edited_at: new Date().toISOString()
        })
        .eq('id', messageId)
        .eq('sender_id', user.id) // Security check
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

/**
 * Marks a message as deleted.
 */
export async function deleteMessage(messageId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await supabase
        .from('messages')
        .update({
            is_deleted: true,
            content: "Message deleted" // Wipe content for safety
        })
        .eq('id', messageId)
        .eq('sender_id', user.id) // Security check
        .select()
        .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
}

/**
 * Marks all unread messages from others in a conversation as read.
 * Uses the current user's ID so it never accidentally marks their own messages.
 */
export async function markMessagesAsRead(conversationId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // 1. Fetch total participants in this conversation
    const { count: participantCount } = await supabase
        .from('conversation_participants')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conversationId);

    const requiredReaders = (participantCount || 2) - 1; // Default to 1 (1-on-1) if count fails

    // 2. Fetch IDs of all unread messages from others
    const { data: unreadMsgs } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .neq('sender_id', user.id)
        .neq('status', 'read');

    if (!unreadMsgs || unreadMsgs.length === 0) return { success: true };

    const messageIds = unreadMsgs.map(m => m.id);

    // 3. Insert per-user status for each unread message
    const statusRows = messageIds.map(id => ({
        message_id: id,
        user_id: user.id,
        read_at: new Date().toISOString()
    }));

    await supabase.from('message_status').upsert(statusRows, { onConflict: 'message_id,user_id' });

    // 4. Update the main message ONLY if all participants have read it
    if (requiredReaders <= 1) {
        // 1-on-1: current user reading it means it's fully read
        await supabase.from('messages').update({ status: 'read', read_at: new Date().toISOString() }).in('id', messageIds);
    } else {
        // Group: fetch read counts for these messages
        const { data: allStatuses } = await supabase
            .from('message_status')
            .select('message_id')
            .in('message_id', messageIds)
            .not('read_at', 'is', null);

        if (allStatuses) {
            const counts: Record<string, number> = {};
            allStatuses.forEach(s => counts[s.message_id] = (counts[s.message_id] || 0) + 1);
            
            const fullyReadMessageIds = Object.entries(counts)
                .filter(([_, count]) => count >= requiredReaders)
                .map(([id, _]) => id);

            if (fullyReadMessageIds.length > 0) {
                await supabase.from('messages').update({ status: 'read', read_at: new Date().toISOString() }).in('id', fullyReadMessageIds);
            }
        }
    }

    return { success: true };
}

/**
 * Marks a specific (voice) message as played.
 */
export async function markMessageAsPlayed(messageId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Get the message's conversation_id to know participant count
    const { data: msg } = await supabase.from('messages').select('conversation_id').eq('id', messageId).single();
    if (!msg) return;

    const { count: participantCount } = await supabase
        .from('conversation_participants')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', msg.conversation_id);

    const requiredPlayers = (participantCount || 2) - 1; 

    // 2. Insert into message_status for current user
    await supabase.from('message_status').upsert({
        message_id: messageId,
        user_id: user.id,
        played_at: new Date().toISOString()
    }, { onConflict: 'message_id,user_id' });

    // 3. Update the main message ONLY if all participants have played it
    if (requiredPlayers <= 1) {
        await supabase.from('messages').update({ played_at: new Date().toISOString() }).eq('id', messageId).is('played_at', null);
    } else {
        // Count played_at statuses for this message
        const { count: playedCount } = await supabase
            .from('message_status')
            .select('*', { count: 'exact', head: true })
            .eq('message_id', messageId)
            .not('played_at', 'is', null);

        if (playedCount && playedCount >= requiredPlayers) {
            await supabase.from('messages').update({ played_at: new Date().toISOString() }).eq('id', messageId).is('played_at', null);
        }
    }
}

/**
 * Fetches individual read/played statuses for a message (including those who haven't read it).
 */
export async function getMessageStatuses(messageId: string) {
    const supabase = await createClient();

    // 1. Get the message's conversation_id and sender_id
    const { data: msg, error: msgError } = await supabase
        .from('messages')
        .select('conversation_id, sender_id')
        .eq('id', messageId)
        .single();
        
    if (msgError || !msg) return [];

    const user = await requireUser(supabase);
    await requireConversationMember(supabase, msg.conversation_id, user.id);

    // 2. Fetch all participants in the conversation (except the sender)
    const { data: participants } = await supabase
        .from('conversation_participants')
        .select(`
            user_id,
            profiles (
                id,
                full_name,
                username,
                avatar_url
            )
        `)
        .eq('conversation_id', msg.conversation_id)
        .neq('user_id', msg.sender_id);

    // 3. Fetch actual statuses
    const { data: statuses } = await supabase
        .from('message_status')
        .select(`
            user_id,
            read_at,
            played_at
        `)
        .eq('message_id', messageId);

    // 4. Merge participants with their status
    return (participants || []).map((p: any) => {
        const s = statuses?.find((stat: any) => stat.user_id === p.user_id);
        return {
            readAt: s?.read_at || null,
            playedAt: s?.played_at || null,
            user: p.profiles
        };
    });
}

/**
 * Marks messages from others in a conversation as delivered (sent → delivered).
 */
export async function markMessagesAsDelivered(conversationId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false };

    const { error } = await supabase
        .from('messages')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .neq('sender_id', user.id)
        .eq('status', 'sent');

    if (error) {
        console.error("Error marking as delivered:", error);
        return { success: false };
    }
    return { success: true };
}

/**
 * Toggles an emoji reaction on a message.
 */
export async function toggleReaction(messageId: string, emoji: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Check if reaction exists
    const { data: existing } = await supabase
        .from('message_reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji)
        .maybeSingle();

    if (existing) {
        // Remove it
        await supabase.from('message_reactions').delete().eq('id', existing.id);
        return { action: 'removed' };
    } else {
        // Add it
        await supabase.from('message_reactions').insert({
            message_id: messageId,
            user_id: user.id,
            emoji
        });
        return { action: 'added' };
    }
}

// ============================================================
// PINNED MESSAGES
// ============================================================

/**
 * Pins a message in a conversation (overwrites any existing pin).
 */
export async function pinMessage(conversationId: string, messageId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Upsert: remove existing pin and add new one
    await supabase.from('pinned_messages').delete().eq('conversation_id', conversationId);
    const { data, error } = await supabase.from('pinned_messages').insert({
        conversation_id: conversationId,
        message_id: messageId,
        pinned_by: user.id,
    }).select().single();

    if (error) throw new Error(error.message);
    return data;
}

/**
 * Unpins the current pinned message in a conversation.
 */
export async function unpinMessage(conversationId: string) {
    const supabase = await createClient();

    const user = await requireUser(supabase);
    await requireConversationMember(supabase, conversationId, user.id);

    const { error } = await supabase
        .from('pinned_messages')
        .delete()
        .eq('conversation_id', conversationId);

    if (error) throw new Error(error.message);
    return { success: true };
}

/**
 * Fetches the current pinned message for a conversation.
 */
export async function getPinnedMessage(conversationId: string) {
    const supabase = await createClient();

    const user = await requireUser(supabase);
    await requireConversationMember(supabase, conversationId, user.id);
    const { data, error } = await supabase
        .from('pinned_messages')
        .select(`
            message_id,
            messages (
                id,
                content,
                sender_id,
                type,
                profiles ( full_name, username )
            )
        `)
        .eq('conversation_id', conversationId)
        .maybeSingle();

    if (error) return null;
    if (!data) return null;

    const msg = Array.isArray(data.messages) ? data.messages[0] : data.messages as any;
    const profile = Array.isArray(msg?.profiles) ? msg?.profiles[0] : msg?.profiles;
    return {
        messageId: data.message_id,
        text: msg?.content,
        senderName: profile?.full_name || profile?.username || 'User',
    };
}

// ============================================================
// POLLS
// ============================================================

export interface PollOption { text: string; }

/**
 * Creates a poll and sends it as a message in the conversation.
 */
export async function createPoll(
    conversationId: string,
    question: string,
    options: PollOption[]
) {
    const supabase = await createClient();

    const user = await requireUser(supabase);
    const senderId = user.id;
    await requireConversationMember(supabase, conversationId, senderId);

    // First create the message placeholder
    const { data: msgData, error: msgError } = await supabase
        .from('messages')
        .insert({
            conversation_id: conversationId,
            sender_id: senderId,
            content: `📊 Poll: ${question}`,
            type: 'poll',
            status: 'sent',
        })
        .select()
        .single();

    if (msgError) throw new Error(msgError.message);

    // Create the poll
    const { data: pollData, error: pollError } = await supabase
        .from('polls')
        .insert({
            conversation_id: conversationId,
            created_by: senderId,
            message_id: msgData.id,
            question,
            options: options,
        })
        .select()
        .single();

    if (pollError) throw new Error(pollError.message);

    // Link poll_id back to message
    await supabase.from('messages').update({ poll_id: pollData.id }).eq('id', msgData.id);

    return { message: msgData, poll: pollData };
}

/**
 * Fetches a poll and its vote counts.
 */
export async function getPoll(pollId: string) {
    const supabase = await createClient();

    const user = await requireUser(supabase);

    const { data: pollRow } = await supabase
        .from('polls')
        .select('conversation_id')
        .eq('id', pollId)
        .maybeSingle();

    if (pollRow?.conversation_id) {
        await requireConversationMember(supabase, pollRow.conversation_id, user.id);
    }

    const { data, error } = await supabase
        .from('polls')
        .select(`*, poll_votes ( option_index, user_id )`)
        .eq('id', pollId)
        .single();

    if (error) return null;
    return data;
}

/**
 * Records a user's vote on a poll (replaces existing vote).
 */
export async function votePoll(pollId: string, optionIndex: number) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Delete existing vote
    await supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('user_id', user.id);

    // Insert new vote
    const { data, error } = await supabase.from('poll_votes').insert({
        poll_id: pollId,
        user_id: user.id,
        option_index: optionIndex,
    }).select().single();

    if (error) throw new Error(error.message);
    return data;
}

// ============================================================
// SCHEDULED MESSAGES
// ============================================================

/**
 * Creates a scheduled message to send at a future time.
 */
export async function scheduleMessage(
    conversationId: string,
    content: string,
    sendAt: string // ISO string
) {
    const supabase = await createClient();

    const user = await requireUser(supabase);
    const senderId = user.id;
    await requireConversationMember(supabase, conversationId, senderId);
    const { data, error } = await supabase.from('scheduled_messages').insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        type: 'text',
        send_at: sendAt,
    }).select().single();

    if (error) throw new Error(error.message);
    return data;
}

/**
 * Fetches all pending scheduled messages for a conversation
 * that are overdue (past send_at time).
 */
export async function getOverdueScheduledMessages(conversationId: string) {
    const supabase = await createClient();

    const user = await requireUser(supabase);
    await requireConversationMember(supabase, conversationId, user.id);

    const { data, error } = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('sender_id', user.id)
        .eq('is_sent', false)
        .lte('send_at', new Date().toISOString())
        .order('send_at', { ascending: true });

    if (error) return [];
    return data || [];
}

/**
 * Marks a scheduled message as sent.
 */
export async function markScheduledMessageSent(scheduledId: string) {
    const supabase = await createClient();
    await supabase.from('scheduled_messages').update({ is_sent: true }).eq('id', scheduledId);
}

/**
 * Fetches all pending (future) scheduled messages for the current user in a conversation.
 */
export async function getPendingScheduledMessages(conversationId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('sender_id', user.id)
        .eq('is_sent', false)
        .gt('send_at', new Date().toISOString())
        .order('send_at', { ascending: true });

    return data || [];
}

/**
 * Fetches all media (images, videos, files) from a conversation.
 */
export async function getConversationMedia(conversationId: string) {
    const supabase = await createClient();

    const user = await requireUser(supabase);
    await requireConversationMember(supabase, conversationId, user.id);

    // Fetch messages with a broader query to see what's happening
    const { data, error } = await supabase
        .from('messages')
        .select(`
            id, 
            attachments, 
            created_at, 
            type, 
            content,
            caption,
            snippet_id
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("[Action] getConversationMedia Error:", error.message);
        return [];
    }


    if (!data || data.length === 0) return [];

    // Optional: Fetch snippet metadata separately to avoid join issues
    const snippetIds = data.filter(m => m.snippet_id).map(m => m.snippet_id);
    let snippetMap: Record<string, any> = {};
    if (snippetIds.length > 0) {
        const { data: snippets } = await supabase
            .from('code_snippets')
            .select('id, title, language')
            .in('id', snippetIds);
        
        snippets?.forEach(s => {
            snippetMap[s.id] = s;
        });
    }

    const allMedia = data.flatMap((msg: any) => {
        const results = [];
        
        const isUrl = typeof msg.content === 'string' && msg.content.startsWith('https://');
        const isGif = isUrl && msg.content.includes('giphy.com');
        const effectiveType = msg.type || (isGif ? 'gif' : isUrl ? 'image' : 'text');

        // 1. Handle code snippets
        if (effectiveType === 'code' || msg.snippet_id) {
            const snip = snippetMap[msg.snippet_id];
            results.push({
                messageId: msg.id,
                timestamp: msg.created_at,
                type: 'code',
                title: snip?.title || 'Untitled Snippet',
                language: snip?.language || 'text',
                snippetId: msg.snippet_id
            });
        }

        // 2. Handle modern attachments array
        const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
        attachments.forEach((att: any) => {
            if (att.type === 'video') return;

            results.push({
                messageId: msg.id,
                timestamp: msg.created_at,
                type: att.type,
                url: att.url,
                name: att.name || (att.type === 'audio' ? 'Voice Note' : 'Media'),
                content: msg.caption || msg.content
            });
        });

        // 3. Handle legacy media
        if (attachments.length === 0) {
            const mediaTypes = ['image', 'audio', 'sticker', 'gif'];
            if (mediaTypes.includes(effectiveType)) {
                 results.push({
                    messageId: msg.id,
                    timestamp: msg.created_at,
                    type: effectiveType,
                    url: msg.content,
                    name: effectiveType === 'audio' ? 'Voice Note' : 'Media',
                    content: msg.caption
                });
            }
        }

        return results;
    });

    return allMedia;
}

/**
 * Creates a code snippet and sends it as a message.
 */
export async function sendCodeSnippet(
    conversationId: string,
    title: string,
    code: string,
    language: string
) {
    const supabase = await createClient();

    const user = await requireUser(supabase);
    const senderId = user.id;
    await requireConversationMember(supabase, conversationId, senderId);
    const snippetId = crypto.randomUUID();

    // 1. Create the code snippet entry first
    const { data: snippetData, error: snippetError } = await supabase
        .from('code_snippets')
        .insert({
            id: snippetId,
            conversation_id: conversationId,
            created_by: senderId,
            title,
            language,
            code
        })
        .select()
        .single();

    if (snippetError) throw new Error(snippetError.message);

    // 2. Create the message WITH the snippet_id already linked
    const { data: msgData, error: msgError } = await supabase
        .from('messages')
        .insert({
            conversation_id: conversationId,
            sender_id: senderId,
            content: `Shared a code snippet: ${title}`,
            type: 'code',
            snippet_id: snippetId,
            status: 'sent'
        })
        .select()
        .single();

    if (msgError) {
        // Cleanup snippet if message fails
        await supabase.from('code_snippets').delete().eq('id', snippetId);
        throw new Error(msgError.message);
    }

    // 3. Back-link the message_id in the snippet (optional but good for consistency)
    await supabase.from('code_snippets').update({ message_id: msgData.id }).eq('id', snippetId);

    return { 
        message: { ...msgData, snippet_id: snippetId }, 
        snippet: snippetData 
    };
}

/**
 * Fetches code snippet details.
 */
export async function getCodeSnippet(snippetId: string) {
    const supabase = await createClient();

    const user = await requireUser(supabase);

    // A snippet id alone used to be enough to read anyone's shared code.
    const { data: linkedMessage } = await supabase
        .from('messages')
        .select('conversation_id')
        .eq('snippet_id', snippetId)
        .maybeSingle();

    if (linkedMessage?.conversation_id) {
        await requireConversationMember(supabase, linkedMessage.conversation_id, user.id);
    }

    const { data, error } = await supabase
        .from('code_snippets')
        .select('*')
        .eq('id', snippetId)
        .single();

    if (error) return null;
    return data;
}

