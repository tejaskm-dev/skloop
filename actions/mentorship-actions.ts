"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

/** Generate a random uppercase alphanumeric code of given length */
function randomCode(length = 12): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
    let result = "";
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    for (const byte of arr) result += chars[byte % chars.length];
    return result;
}

/** Calculates user level based on XP (500 XP per level) - Keep in sync with UserContext */
function calculateLevel(xp: number): number {
    return Math.floor(xp / 500) + 1;
}

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface MentorCard {
    id: string;
    name: string;
    username: string;
    avatarUrl?: string;
    headline?: string;
    bio?: string;
    skills: string[];
    specialties: string[];
    isAccepting: boolean;
    avgRating: number | null;
    reviewCount: number;
}

export interface MentorSession {
    id: string;
    mentorId: string;
    mentorName: string;
    mentorAvatar?: string;
    menteeId?: string;
    title: string;
    topic?: string;
    description?: string;
    message?: string;
    status: "pending" | "accepted" | "declined" | "published" | "completed";
    videoUrl?: string;
    thumbnailUrl?: string;
    premiereAt?: string;
    isPublic: boolean;
    createdAt: string;
}

export interface VouchCode {
    id: string;
    code: string;
    issuedBy: string;
    usedBy?: string;
    usedAt?: string;
    expiresAt?: string;
    createdAt: string;
}

export interface VideoComment {
    id: string;
    sessionId: string;
    parentId?: string;
    authorId: string;
    authorName: string;
    authorAvatar?: string;
    authorLevel: number;
    content: string;
    likesCount: number;
    dislikesCount: number;
    replyCount: number;
    userVote: "like" | "dislike" | null;
    createdAt: string;
}

export interface VideoReview {
    rating: number;
    comment?: string;
    createdAt: string;
    reviewerName: string;
    reviewerAvatar?: string;
}

export interface VideoDetailData {
    session: MentorSession & { viewCount: number; avgRating: number | null; reviewCount: number };
    mentor: {
        id: string;
        name: string;
        username: string;
        avatarUrl?: string;
        headline?: string;
        bio?: string;
        skills: string[];
        avgRating: number | null;
        reviewCount: number;
    };
    userReview: { rating: number; comment?: string } | null;
    ratingDistribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
    recentReviews: VideoReview[];
    totalComments: number;
}

// ─────────────────────────────────────────────
// PUBLIC: Find Mentor Directory
// ─────────────────────────────────────────────

export async function getMentors(): Promise<MentorCard[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("profiles")
        .select(`
            id, full_name, username, avatar_url, skills, bio,
            mentor_profiles!mentor_profiles_id_fkey (
                headline, bio, specialties, is_accepting
            )
        `)
        .eq("is_mentor", true);

    if (error || !data) return [];

    // Get avg ratings per mentor
    const mentorIds = data.map((m: any) => m.id);
    const { data: reviews } = await supabase
        .from("session_reviews")
        .select(`
            rating,
            mentor_sessions!inner (mentor_id)
        `)
        .in("mentor_sessions.mentor_id", mentorIds);

    // Build rating map
    const ratingMap: Record<string, { sum: number; count: number }> = {};
    for (const r of (reviews ?? []) as any[]) {
        const mid = r.mentor_sessions?.mentor_id;
        if (!mid) continue;
        if (!ratingMap[mid]) ratingMap[mid] = { sum: 0, count: 0 };
        ratingMap[mid].sum += r.rating;
        ratingMap[mid].count += 1;
    }

    return data.map((p: any) => {
        const mp = Array.isArray(p.mentor_profiles) ? p.mentor_profiles[0] : p.mentor_profiles;
        const r = ratingMap[p.id];
        return {
            id: p.id,
            name: p.full_name || p.username || "Mentor",
            username: p.username || "",
            avatarUrl: p.avatar_url,
            headline: mp?.headline,
            bio: mp?.bio || p.bio,
            skills: p.skills || [],
            specialties: mp?.specialties || [],
            isAccepting: mp?.is_accepting ?? true,
            avgRating: r ? Math.round((r.sum / r.count) * 10) / 10 : null,
            reviewCount: r?.count ?? 0,
        };
    });
}

// ─────────────────────────────────────────────
// PUBLIC: Mentor Video Library (public posts)
// ─────────────────────────────────────────────

export async function getPublicSessions(mentorId?: string): Promise<MentorSession[]> {
    const supabase = await createClient();

    let query = supabase
        .from("mentor_sessions")
        .select(`
            *,
            mentor:profiles!mentor_sessions_mentor_id_fkey (full_name, username, avatar_url)
        `)
        .eq("is_public", true)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        // Catalogue listing — capped so it cannot grow into a full-table read
        // as published sessions accumulate.
        .limit(100);

    if (mentorId) query = query.eq("mentor_id", mentorId);

    const { data } = await query;
    return (data ?? []).map(formatSession);
}

// ─────────────────────────────────────────────
// MY SESSIONS: as mentee
// ─────────────────────────────────────────────

export async function getMySessionsAsMentee(): Promise<MentorSession[]> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
        .from("mentor_sessions")
        .select(`
            *,
            mentor:profiles!mentor_sessions_mentor_id_fkey (full_name, username, avatar_url)
        `)
        .eq("mentee_id", user.id)
        .order("created_at", { ascending: false });

    return (data ?? []).map(formatSession);
}

// ─────────────────────────────────────────────
// MENTOR DASHBOARD
// ─────────────────────────────────────────────

export async function getMySessionsAsMentor(): Promise<{
    pending: MentorSession[];
    upcoming: MentorSession[];
    history: MentorSession[];
    published: MentorSession[];
    stats: {
        sessions: number;
        avgRating: number | null;
        reviewCount: number;
        ratingDistribution: { [key: number]: number };
        recentReviews: any[];
    };
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { pending: [], upcoming: [], history: [], published: [], stats: { sessions: 0, avgRating: null, reviewCount: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, recentReviews: [] } };

    const { data } = await supabase
        .from("mentor_sessions")
        .select(`
            *,
            mentor:profiles!mentor_sessions_mentor_id_fkey (full_name, username, avatar_url)
        `)
        .eq("mentor_id", user.id)
        .order("created_at", { ascending: false });

    const sessions = (data ?? []).map(formatSession);
    const pending = sessions.filter(s => s.status === "pending");
    const upcoming = sessions.filter(s => s.status === "accepted");
    const history = sessions.filter(s => s.status === "completed" || s.status === "declined");
    const published = sessions.filter(s => s.status === "published" && s.videoUrl);

    // Reviews for this mentor
    const sessionIds = sessions.map(s => s.id);
    const { data: reviews } = await supabase
        .from("session_reviews")
        .select(`
            rating,
            comment,
            created_at,
            reviewer:profiles(full_name, username, avatar_url)
        `)
        .in("session_id", sessionIds)
        .order("created_at", { ascending: false });

    const avgRating = reviews && reviews.length > 0
        ? Math.round(((reviews as any[]).reduce((a, r) => a + r.rating, 0) / reviews.length) * 10) / 10
        : null;

    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (reviews) {
        reviews.forEach(r => {
            if (r.rating >= 1 && r.rating <= 5) {
                ratingDistribution[r.rating as keyof typeof ratingDistribution]++;
            }
        });
    }

    const recentReviews = (reviews || []).slice(0, 5).map(r => {
        const rev = Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer;
        return {
            rating: r.rating,
            comment: r.comment,
            createdAt: r.created_at,
            reviewerName: rev?.full_name || rev?.username || "Anonymous",
            reviewerAvatar: rev?.avatar_url
        };
    });

    return {
        pending,
        upcoming,
        history,
        published,
        stats: {
            sessions: published.length + history.length,
            avgRating,
            reviewCount: reviews?.length ?? 0,
            ratingDistribution,
            recentReviews
        },
    };
}

export async function markSessionCompleted(sessionId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    const { error } = await supabase
        .from("mentor_sessions")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", sessionId)
        .eq("mentor_id", user.id);

    if (error) return { success: false, error: error.message };
    revalidatePath("/mentorship/dashboard");
    return { success: true };
}

export async function markSessionCompletedByMentee(sessionId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    const { error } = await supabase
        .from("mentor_sessions")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", sessionId)
        .eq("mentee_id", user.id);

    if (error) return { success: false, error: error.message };
    revalidatePath("/mentorship/sessions");
    return { success: true };
}

export async function handleSessionRequest(sessionId: string, action: "accept" | "decline") {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const newStatus = action === "accept" ? "accepted" : "declined";
    const { error } = await supabase
        .from("mentor_sessions")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", sessionId)
        .eq("mentor_id", user.id);

    if (error) throw new Error(error.message);
}

export async function publishMentorVideo(input: {
    title: string;
    topic?: string;
    description?: string;
    videoUrl: string;
    thumbnailUrl?: string;
    premiereAt?: string;
    playlistId?: string;
}): Promise<{ success: boolean; error?: string; sessionId?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const { data: profile } = await supabase
        .from("profiles")
        .select("is_mentor")
        .eq("id", user.id)
        .single();

    if (!profile?.is_mentor) return { success: false, error: "Only mentors can publish sessions" };

    const { data: session, error } = await supabase.from("mentor_sessions").insert({
        mentor_id: user.id,
        title: input.title,
        topic: input.topic,
        description: input.description,
        video_url: input.videoUrl,
        thumbnail_url: input.thumbnailUrl,
        premiere_at: input.premiereAt || null,
        status: "published",
        is_public: true,
    }).select("id").single();

    if (error || !session) return { success: false, error: error?.message ?? "Failed to publish" };

    if (input.playlistId) {
        await supabase.from("playlist_videos").insert({
            playlist_id: input.playlistId,
            session_id: session.id,
        });
    }

    revalidatePath("/mentorship/find");
    revalidatePath("/mentorship/dashboard");
    return { success: true, sessionId: session.id };
}

export async function deleteMentorVideo(sessionId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    const { error } = await supabase
        .from("mentor_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("mentor_id", user.id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/mentorship/dashboard");
    revalidatePath("/mentorship/find");
    return { success: true };
}

// ─────────────────────────────────────────────
// VOUCH CODES
// ─────────────────────────────────────────────

export async function generateVouchCode(): Promise<string> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Verify user is a mentor
    const { data: profile } = await supabase
        .from("profiles")
        .select("is_mentor")
        .eq("id", user.id)
        .single();
    if (!profile?.is_mentor) throw new Error("Only mentors can generate vouch codes");

    // Rate limit: max 2 codes per 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
        .from("mentor_vouch_codes")
        .select("id", { count: "exact", head: true })
        .eq("issued_by", user.id)
        .is("used_by", null) // only count unused ones OR count all generated today
        .gte("created_at", since);

    // Count ALL codes generated (used or not) in last 24h
    const { count: todayCount } = await supabase
        .from("mentor_vouch_codes")
        .select("id", { count: "exact", head: true })
        .eq("issued_by", user.id)
        .gte("created_at", since);

    if ((todayCount ?? 0) >= 2) {
        throw new Error("Rate limit: you can generate at most 2 vouch codes per day");
    }

    const code = randomCode(12);

    const { error } = await supabase.from("mentor_vouch_codes").insert({
        code,
        issued_by: user.id,
    });

    if (error) throw new Error(error.message);
    return code;
}

export async function redeemVouchCode(code: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    // Validation, consumption of the code, and the mentor grant all happen
    // inside grant_mentor_via_vouch(). Doing it in one statement closes the
    // race where two callers could redeem the same code concurrently.
    const { data, error } = await supabase.rpc("grant_mentor_via_vouch", {
        p_code: code,
    });

    if (error) {
        console.error("redeemVouchCode RPC error:", error.message);
        return { success: false, error: "Could not redeem code" };
    }

    const result = data as { success: boolean; error?: string };
    if (!result?.success) {
        return { success: false, error: result?.error || "Could not redeem code" };
    }

    revalidatePath("/mentorship/dashboard");
    revalidatePath("/mentorship/apply");
    revalidatePath("/mentorship/find");

    return { success: true };
}

// ─────────────────────────────────────────────
// APPLY: Veteran Path
// ─────────────────────────────────────────────

export async function applyVeteranPath(): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    // The level-10 requirement is enforced inside grant_mentor_via_veteran()
    // against the stored profile, so it holds even if this action is called
    // directly. is_mentor is an authorization column and is no longer
    // client-writable — see migrations 001 and 003.
    const { data, error } = await supabase.rpc("grant_mentor_via_veteran");

    if (error) {
        console.error("applyVeteranPath RPC error:", error.message);
        return { success: false, error: "Could not complete application" };
    }

    const result = data as { success: boolean; error?: string };
    if (!result?.success) {
        return { success: false, error: result?.error || "Could not complete application" };
    }

    revalidatePath("/mentorship/dashboard");
    revalidatePath("/mentorship/apply");
    revalidatePath("/mentorship/find");

    return { success: true };
}

export async function getMyMentorStatus(userId?: string): Promise<{
    isMentor: boolean;
    level: number;
    xp: number;
    profile?: { headline?: string; bio?: string; isAccepting: boolean; specialties: string[]; hourlyRate: number };
}> {
    const supabase = await createClient();

    // If no userId provided, try to get it server-side (may fail if auth is blocked)
    let resolvedUserId = userId;
    if (!resolvedUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { isMentor: false, level: 0, xp: 0 };
        resolvedUserId = user.id;
    }

    const { data, error } = await supabase
        .from("profiles")
        .select(`id, level, xp, is_mentor, mentor_profiles!mentor_profiles_id_fkey(headline, bio, is_accepting, specialties)`)
        .eq("id", resolvedUserId)
        .maybeSingle();

    // ── SERVER-SIDE DIAGNOSTICS (visible in Next.js terminal) ─────────────
    // ──────────────────────────────────────────────────────────────────────

    const mp = data?.mentor_profiles as any;
    const mpData = Array.isArray(mp) ? mp[0] : mp;

    return {
        isMentor: data?.is_mentor ?? false,
        level: data?.level ?? calculateLevel(data?.xp || 0),
        xp: data?.xp || 0,
        profile: mpData ? {
            headline: mpData.headline,
            bio: mpData.bio,
            isAccepting: mpData.is_accepting ?? true,
            specialties: mpData.specialties ?? [],
            hourlyRate: mpData.hourly_rate ?? 0,
        } : undefined,
    };
}

// ─────────────────────────────────────────────
// VIDEO DETAIL PAGE
// ─────────────────────────────────────────────

export async function getVideoDetails(sessionId: string): Promise<VideoDetailData | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: session } = await supabase
        .from("mentor_sessions")
        .select(`
            id, title, topic, description, video_url, thumbnail_url,
            premiere_at, created_at, is_public, status, mentor_id, view_count,
            mentor:profiles!mentor_sessions_mentor_id_fkey (
                id, full_name, username, avatar_url, skills, bio,
                mentor_profiles!mentor_profiles_id_fkey (headline, specialties)
            )
        `)
        .eq("id", sessionId)
        .eq("is_public", true)
        .eq("status", "published")
        .single();

    if (!session) return null;

    const mentorRaw = Array.isArray((session as any).mentor) ? (session as any).mentor[0] : (session as any).mentor;
    const mp = Array.isArray(mentorRaw?.mentor_profiles) ? mentorRaw?.mentor_profiles[0] : mentorRaw?.mentor_profiles;

    // Reviews for this session
    const { data: sessionReviews } = await supabase
        .from("session_reviews")
        .select("id, rating, comment, created_at, reviewer_id, reviewer:profiles(full_name, username, avatar_url)")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false });

    // Current user's review
    let userReview: { rating: number; comment?: string } | null = null;
    if (user) {
        const mine = (sessionReviews || []).find((r: any) => r.reviewer_id === user.id);
        if (mine) userReview = { rating: mine.rating, comment: mine.comment || undefined };
    }

    // Rating distribution
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let ratingSum = 0;
    for (const r of (sessionReviews || []) as any[]) {
        if (r.rating >= 1 && r.rating <= 5) {
            ratingDistribution[r.rating as keyof typeof ratingDistribution]++;
            ratingSum += r.rating;
        }
    }
    const reviewCount = sessionReviews?.length ?? 0;
    const avgRating = reviewCount > 0 ? Math.round((ratingSum / reviewCount) * 10) / 10 : null;

    const recentReviews: VideoReview[] = (sessionReviews || []).slice(0, 8).map((r: any) => {
        const rev = Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer;
        return {
            rating: r.rating,
            comment: r.comment || undefined,
            createdAt: r.created_at,
            reviewerName: rev?.full_name || rev?.username || "Anonymous",
            reviewerAvatar: rev?.avatar_url,
        };
    });

    // Mentor avg rating across all their sessions
    const { data: allMentorSessions } = await supabase
        .from("mentor_sessions")
        .select("id")
        .eq("mentor_id", (session as any).mentor_id);

    const mentorSessionIds = (allMentorSessions || []).map((s: any) => s.id);
    const { data: allMentorReviews } = mentorSessionIds.length > 0
        ? await supabase.from("session_reviews").select("rating").in("session_id", mentorSessionIds)
        : { data: [] };

    const mentorAvgRating = allMentorReviews && allMentorReviews.length > 0
        ? Math.round((allMentorReviews.reduce((a, r) => a + r.rating, 0) / allMentorReviews.length) * 10) / 10
        : null;

    // Total comment count
    const { count: totalComments } = await supabase
        .from("video_comments")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId);

    return {
        session: {
            id: (session as any).id,
            mentorId: (session as any).mentor_id,
            mentorName: mentorRaw?.full_name || mentorRaw?.username || "Mentor",
            mentorAvatar: mentorRaw?.avatar_url,
            title: (session as any).title,
            topic: (session as any).topic,
            description: (session as any).description,
            status: (session as any).status,
            videoUrl: (session as any).video_url,
            thumbnailUrl: (session as any).thumbnail_url,
            premiereAt: (session as any).premiere_at,
            isPublic: (session as any).is_public,
            createdAt: (session as any).created_at,
            viewCount: (session as any).view_count || 0,
            avgRating,
            reviewCount,
        },
        mentor: {
            id: mentorRaw?.id || (session as any).mentor_id,
            name: mentorRaw?.full_name || mentorRaw?.username || "Mentor",
            username: mentorRaw?.username || "",
            avatarUrl: mentorRaw?.avatar_url,
            headline: mp?.headline,
            bio: mp?.bio || mentorRaw?.bio,
            skills: mentorRaw?.skills || [],
            avgRating: mentorAvgRating,
            reviewCount: allMentorReviews?.length ?? 0,
        },
        userReview,
        ratingDistribution,
        recentReviews,
        totalComments: totalComments ?? 0,
    };
}

export async function incrementVideoView(sessionId: string): Promise<void> {
    const supabase = await createClient();

    // Requires a session: this was callable by anyone, so view counts could be
    // inflated arbitrarily. The read-modify-write fallback below also races, so
    // the RPC is strongly preferred — see increment_video_view.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Try RPC first (requires SQL function + GRANT from mentor_reports_schema.sql)
    const { error } = await supabase.rpc("increment_video_view", { session_id_input: sessionId });
    if (error) {
        // Fallback: fetch current count and increment directly
        const { data } = await supabase
            .from("mentor_sessions")
            .select("view_count")
            .eq("id", sessionId)
            .single();
        if (data) {
            await supabase
                .from("mentor_sessions")
                .update({ view_count: (data.view_count || 0) + 1 })
                .eq("id", sessionId);
        }
    }
}

export async function getVideoComments(sessionId: string, page = 0, pageSize = 20): Promise<VideoComment[]> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: comments } = await supabase
        .from("video_comments")
        .select(`
            id, session_id, author_id, content, likes_count, dislikes_count, reply_count, created_at,
            author:profiles!video_comments_author_id_fkey (full_name, username, avatar_url, level)
        `)
        .eq("session_id", sessionId)
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

    if (!comments || comments.length === 0) return [];

    return formatComments(supabase, comments as any[], user?.id);
}

export async function getCommentReplies(parentId: string): Promise<VideoComment[]> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: comments } = await supabase
        .from("video_comments")
        .select(`
            id, session_id, author_id, content, likes_count, dislikes_count, reply_count, created_at,
            author:profiles!video_comments_author_id_fkey (full_name, username, avatar_url, level)
        `)
        .eq("parent_id", parentId)
        .order("created_at", { ascending: true });

    if (!comments || comments.length === 0) return [];

    return formatComments(supabase, comments as any[], user?.id);
}

async function formatComments(supabase: any, comments: any[], userId?: string): Promise<VideoComment[]> {
    const ids = comments.map(c => c.id);
    let userVotes = new Map<string, "like" | "dislike">();

    if (userId && ids.length > 0) {
        const { data: votes } = await supabase
            .from("video_comment_votes")
            .select("comment_id, vote_type")
            .eq("user_id", userId)
            .in("comment_id", ids);
        if (votes) votes.forEach((v: any) => userVotes.set(v.comment_id, v.vote_type));
    }

    return comments.map(c => {
        const author = Array.isArray(c.author) ? c.author[0] : c.author;
        return {
            id: c.id,
            sessionId: c.session_id,
            authorId: c.author_id,
            authorName: author?.full_name || author?.username || "User",
            authorAvatar: author?.avatar_url,
            authorLevel: author?.level || 1,
            content: c.content,
            likesCount: c.likes_count || 0,
            dislikesCount: c.dislikes_count || 0,
            replyCount: c.reply_count || 0,
            userVote: userVotes.get(c.id) || null,
            createdAt: c.created_at,
        };
    });
}

export async function submitVideoComment(sessionId: string, content: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 2000) return { success: false, error: "Comment must be 1–2000 characters" };

    const { data: sessionCheck } = await supabase
        .from("mentor_sessions")
        .select("id")
        .eq("id", sessionId)
        .eq("is_public", true)
        .eq("status", "published")
        .single();

    if (!sessionCheck) return { success: false, error: "Video not found" };

    const { error } = await supabase.from("video_comments").insert({
        session_id: sessionId,
        author_id: user.id,
        content: trimmed,
    });

    if (error) return { success: false, error: error.message };
    revalidatePath(`/mentorship/video/${sessionId}`);
    return { success: true };
}

export async function deleteVideoComment(commentId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    const { error } = await supabase
        .from("video_comments")
        .delete()
        .eq("id", commentId)
        .eq("author_id", user.id);

    if (error) return { success: false, error: error.message };
    return { success: true };
}

export async function voteOnComment(commentId: string, voteType: "like" | "dislike"): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    const { data: existing } = await supabase
        .from("video_comment_votes")
        .select("id, vote_type")
        .eq("comment_id", commentId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (!existing) {
        const { error } = await supabase.from("video_comment_votes").insert({ comment_id: commentId, user_id: user.id, vote_type: voteType });
        if (error) return { success: false, error: error.message };
    } else if (existing.vote_type === voteType) {
        // Same vote — toggle off
        const { error } = await supabase.from("video_comment_votes").delete().eq("id", existing.id);
        if (error) return { success: false, error: error.message };
    } else {
        // Switch vote type
        const { error } = await supabase.from("video_comment_votes").update({ vote_type: voteType }).eq("id", existing.id);
        if (error) return { success: false, error: error.message };
    }

    return { success: true };
}

export async function submitReply(sessionId: string, content: string, parentId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 2000) return { success: false, error: "Reply must be 1–2000 characters" };

    const { error } = await supabase.from("video_comments").insert({
        session_id: sessionId,
        author_id: user.id,
        content: trimmed,
        parent_id: parentId,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
}

export async function submitVideoRating(sessionId: string, rating: number, comment?: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    if (rating < 1 || rating > 5) return { success: false, error: "Rating must be between 1 and 5" };

    const { error } = await supabase.from("session_reviews").upsert({
        session_id: sessionId,
        reviewer_id: user.id,
        rating,
        comment: comment || null,
    }, { onConflict: "session_id,reviewer_id" });

    if (error) return { success: false, error: error.message };
    revalidatePath(`/mentorship/video/${sessionId}`);
    revalidatePath("/mentorship/find");
    return { success: true };
}

export async function submitReview(sessionId: string, rating: number, comment?: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { error } = await supabase.from("session_reviews").insert({
        session_id: sessionId,
        reviewer_id: user.id,
        rating,
        comment: comment || null,
    });

    if (error) throw new Error(error.message);
}

export async function getMyVouchCodes(): Promise<VouchCode[]> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
        .from("mentor_vouch_codes")
        .select("*")
        .eq("issued_by", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

    return (data ?? []).map((c: any) => ({
        id: c.id,
        code: c.code,
        issuedBy: c.issued_by,
        usedBy: c.used_by,
        usedAt: c.used_at,
        expiresAt: c.expires_at,
        createdAt: c.created_at,
    }));
}

// ─────────────────────────────────────────────
// MENTOR REPORTS
// ─────────────────────────────────────────────

export async function submitMentorReport(input: {
    reportedMentorId: string;
    sessionId?: string;
    reason: string;
    description: string;
    evidenceUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    const VALID_REASONS = [
        "inappropriate_content", "misinformation", "harassment",
        "spam", "misleading_credentials", "other",
    ];
    if (!VALID_REASONS.includes(input.reason)) return { success: false, error: "Invalid reason" };
    if (input.description.length < 20 || input.description.length > 2000) {
        return { success: false, error: "Description must be 20–2000 characters" };
    }

    const { error } = await supabase.from("mentor_reports").insert({
        reporter_id: user.id,
        reported_mentor_id: input.reportedMentorId,
        session_id: input.sessionId || null,
        reason: input.reason,
        description: input.description,
        evidence_url: input.evidenceUrl || null,
    });

    if (error) {
        // Unique index violation = already reported
        if (error.code === "23505") return { success: false, error: "You have already reported this mentor for this video." };
        return { success: false, error: error.message };
    }

    return { success: true };
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function formatSession(s: any): MentorSession {
    const mentor = Array.isArray(s.mentor) ? s.mentor[0] : s.mentor;
    return {
        id: s.id,
        mentorId: s.mentor_id,
        mentorName: mentor?.full_name || mentor?.username || "Mentor",
        mentorAvatar: mentor?.avatar_url,
        menteeId: s.mentee_id,
        title: s.title,
        topic: s.topic,
        description: s.description,
        message: s.message,
        status: s.status,
        videoUrl: s.video_url,
        thumbnailUrl: s.thumbnail_url,
        premiereAt: s.premiere_at,
        isPublic: s.is_public,
        createdAt: s.created_at,
    };
}

// ─────────────────────────────────────────────
// MENTOR PLAYLIST TYPES
// ─────────────────────────────────────────────

export interface MentorPlaylist {
    id: string;
    mentorId: string;
    mentorName: string;
    mentorAvatar?: string;
    title: string;
    description?: string;
    thumbnailUrl?: string;
    isCustomThumbnail: boolean;
    isPublic: boolean;
    videoCount: number;
    createdAt: string;
}

export interface PlaylistVideo {
    sessionId: string;
    title: string;
    thumbnailUrl?: string;
    topic?: string;
    viewCount: number;
    avgRating: number | null;
    reviewCount: number;
    position: number;
}

export interface UserPlaylistProgress {
    playlistId: string;
    lastSessionId: string;
    updatedAt: string;
}

export interface PlaylistWithVideos extends MentorPlaylist {
    videos: PlaylistVideo[];
    userProgress?: UserPlaylistProgress;
}

// ─────────────────────────────────────────────
// MENTOR PLAYLIST ACTIONS
// ─────────────────────────────────────────────

export async function getPublicPlaylists(mentorId?: string): Promise<MentorPlaylist[]> {
    const supabase = await createClient();

    let query = supabase
        .from("mentor_playlists")
        .select(`
            id,
            mentor_id,
            title,
            description,
            thumbnail_url,
            is_public,
            video_count,
            created_at,
            mentor:profiles!mentor_playlists_mentor_id_fkey (
                full_name,
                username,
                avatar_url
            )
        `)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(50);

    if (mentorId) {
        query = query.eq("mentor_id", mentorId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((p: any) => formatPlaylist(p));
}

export async function getMyPlaylists(): Promise<MentorPlaylist[]> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from("mentor_playlists")
        .select(`
            id,
            mentor_id,
            title,
            description,
            thumbnail_url,
            is_public,
            video_count,
            created_at,
            mentor:profiles!mentor_playlists_mentor_id_fkey (
                full_name,
                username,
                avatar_url
            )
        `)
        .eq("mentor_id", user.id)
        .order("created_at", { ascending: false });

    if (error || !data) return [];

    return data.map((p: any) => formatPlaylist(p));
}

export async function getPlaylistDetails(playlistId: string): Promise<PlaylistWithVideos | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: playlist, error: playlistError } = await supabase
        .from("mentor_playlists")
        .select(`
            id,
            mentor_id,
            title,
            description,
            thumbnail_url,
            is_public,
            video_count,
            created_at,
            mentor:profiles!mentor_playlists_mentor_id_fkey (
                full_name,
                username,
                avatar_url
            )
        `)
        .eq("id", playlistId)
        .single();

    if (playlistError || !playlist) return null;

    const { data: videoRows, error: videosError } = await supabase
        .from("playlist_videos")
        .select(`
            position,
            session:mentor_sessions!playlist_videos_session_id_fkey (
                id,
                title,
                thumbnail_url,
                topic,
                view_count,
                session_reviews (
                    rating
                )
            )
        `)
        .eq("playlist_id", playlistId)
        .order("position", { ascending: true });

    if (videosError || !videoRows) {
        return { ...formatPlaylist(playlist), videos: [] };
    }

    const videos: PlaylistVideo[] = videoRows.map((row: any) => {
        const s = Array.isArray(row.session) ? row.session[0] : row.session;
        const reviews: { rating: number }[] = s?.session_reviews ?? [];
        const reviewCount = reviews.length;
        const avgRating =
            reviewCount > 0
                ? reviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / reviewCount
                : null;

        return {
            sessionId: s?.id ?? "",
            title: s?.title ?? "",
            thumbnailUrl: s?.thumbnail_url ?? undefined,
            topic: s?.topic ?? undefined,
            viewCount: s?.view_count ?? 0,
            avgRating,
            reviewCount,
            position: row.position,
        };
    });

    // Fetch user progress if logged in
    let userProgress: UserPlaylistProgress | undefined;
    if (user) {
        const { data: progress } = await supabase
            .from("user_playlist_progress")
            .select("playlist_id, last_session_id, updated_at")
            .eq("user_id", user.id)
            .eq("playlist_id", playlistId)
            .maybeSingle();
        if (progress) {
            userProgress = {
                playlistId: progress.playlist_id,
                lastSessionId: progress.last_session_id,
                updatedAt: progress.updated_at,
            };
        }
    }

    return { ...formatPlaylist(playlist), videos, userProgress };
}

export async function createPlaylist(input: {
    title: string;
    description?: string;
    thumbnailUrl?: string;
    isCustomThumbnail?: boolean;
}): Promise<{ success: boolean; error?: string; id?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    if (!input.title || input.title.trim().length === 0) {
        return { success: false, error: "Title is required" };
    }

    const { data, error } = await supabase
        .from("mentor_playlists")
        .insert({
            mentor_id: user.id,
            title: input.title.trim(),
            description: input.description?.trim() ?? null,
            thumbnail_url: input.thumbnailUrl ?? null,
            is_custom_thumbnail: input.isCustomThumbnail ?? false,
        })
        .select("id")
        .single();

    if (error || !data) {
        return { success: false, error: error?.message ?? "Failed to create playlist" };
    }

    revalidatePath("/mentorship");
    return { success: true, id: data.id };
}

export async function deletePlaylist(playlistId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    const { error } = await supabase
        .from("mentor_playlists")
        .delete()
        .eq("id", playlistId)
        .eq("mentor_id", user.id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/mentorship");
    return { success: true };
}

export async function updatePlaylist(
    playlistId: string,
    input: { title?: string; description?: string }
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    const updates: Record<string, string> = {};
    if (input.title !== undefined) updates.title = input.title.trim();
    if (input.description !== undefined) updates.description = input.description.trim();

    if (Object.keys(updates).length === 0) {
        return { success: false, error: "No fields to update" };
    }

    const { error } = await supabase
        .from("mentor_playlists")
        .update(updates)
        .eq("id", playlistId)
        .eq("mentor_id", user.id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/mentorship");
    return { success: true };
}

export async function addVideoToPlaylist(
    playlistId: string,
    sessionId: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    const { data: playlist, error: ownerError } = await supabase
        .from("mentor_playlists")
        .select("id")
        .eq("id", playlistId)
        .eq("mentor_id", user.id)
        .single();

    if (ownerError || !playlist) {
        return { success: false, error: "Playlist not found or access denied" };
    }

    const { data: maxRow } = await supabase
        .from("playlist_videos")
        .select("position")
        .eq("playlist_id", playlistId)
        .order("position", { ascending: false })
        .limit(1)
        .single();

    const nextPosition = maxRow ? maxRow.position + 1 : 0;

    const { error } = await supabase
        .from("playlist_videos")
        .insert({ playlist_id: playlistId, session_id: sessionId, position: nextPosition });

    if (error) {
        if (error.code === "23505") return { success: false, error: "Already in playlist" };
        return { success: false, error: error.message };
    }

    revalidatePath("/mentorship");
    return { success: true };
}

export async function removeVideoFromPlaylist(
    playlistId: string,
    sessionId: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    const { data: playlist, error: ownerError } = await supabase
        .from("mentor_playlists")
        .select("id")
        .eq("id", playlistId)
        .eq("mentor_id", user.id)
        .single();

    if (ownerError || !playlist) {
        return { success: false, error: "Playlist not found or access denied" };
    }

    const { error } = await supabase
        .from("playlist_videos")
        .delete()
        .eq("playlist_id", playlistId)
        .eq("session_id", sessionId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/mentorship");
    return { success: true };
}

// ─────────────────────────────────────────────
// PLAYLIST HELPERS
// ─────────────────────────────────────────────

function formatPlaylist(p: any): MentorPlaylist {
    const mentor = Array.isArray(p.mentor) ? p.mentor[0] : p.mentor;
    return {
        id: p.id,
        mentorId: p.mentor_id,
        mentorName: mentor?.full_name || mentor?.username || "Mentor",
        mentorAvatar: mentor?.avatar_url ?? undefined,
        title: p.title,
        description: p.description ?? undefined,
        thumbnailUrl: p.thumbnail_url ?? undefined,
        isCustomThumbnail: p.is_custom_thumbnail ?? false,
        isPublic: p.is_public,
        videoCount: p.video_count,
        createdAt: p.created_at,
    };
}

export async function trackPlaylistProgress(
    playlistId: string,
    sessionId: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    const { error } = await supabase.from("user_playlist_progress").upsert({
        user_id: user.id,
        playlist_id: playlistId,
        last_session_id: sessionId,
        updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,playlist_id" });

    if (error) return { success: false, error: error.message };
    return { success: true };
}

export async function updatePlaylistThumbnail(
    playlistId: string,
    input: { thumbnailUrl?: string; isCustom?: boolean }
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not logged in" };

    const updates: any = {};
    if (input.thumbnailUrl !== undefined) updates.thumbnail_url = input.thumbnailUrl;
    if (input.isCustom !== undefined) updates.is_custom_thumbnail = input.isCustom;

    const { error } = await supabase
        .from("mentor_playlists")
        .update(updates)
        .eq("id", playlistId)
        .eq("mentor_id", user.id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/mentorship");
    return { success: true };
}
