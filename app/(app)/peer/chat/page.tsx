"use client";

import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PeerProfile } from "@/components/peer/PeerCard";
import { ChatWindow } from "@/components/peer/ChatWindow";
import {
    Search,
    UserCircle2,
    Users,
    Loader2,
    X,
    MessageSquarePlus,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/utils/supabase/client";
import { getUserConversations, getOrCreateDirectConversation, getFriendsList } from "@/actions/chat-actions";
import useSWR from "swr";
import { useUser } from "@/context/UserContext";
import { useLoading } from "@/components/LoadingProvider";
import { cn } from "@/lib/utils";

// ============================================================
// NewChatPicker — Centered Modal
// ============================================================
interface Friend { id: string; name: string; username: string; avatarUrl?: string; }

function NewChatPicker({
    onSelect,
}: {
    onSelect: (friend: Friend) => Promise<void>;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [friends, setFriends] = useState<Friend[]>([]);
    const [query, setQuery] = useState("");
    const [isLoadingFriends, setIsLoadingFriends] = useState(false);
    const [openingFor, setOpeningFor] = useState<string | null>(null);

    // Fetch friends on open
    useEffect(() => {
        if (!isOpen) return;
        setIsLoadingFriends(true);
        getFriendsList().then(list => {
            setFriends(list);
            setIsLoadingFriends(false);
        });
    }, [isOpen]);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [isOpen]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    const filtered = friends.filter(f =>
        f.name.toLowerCase().includes(query.toLowerCase()) ||
        f.username.toLowerCase().includes(query.toLowerCase())
    );

    const handleSelect = async (friend: Friend) => {
        setOpeningFor(friend.id);
        await onSelect(friend);
        setOpeningFor(null);
        setIsOpen(false);
        setQuery("");
    };

    return (
        <>
            {/* Trigger button */}
            <button
                onClick={() => setIsOpen(true)}
                className={`flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full transition-all duration-200 ${isOpen
                    ? "bg-[#D4F268] text-[#1A1A1A] scale-95"
                    : "bg-zinc-100 hover:bg-[#D4F268] hover:text-[#1A1A1A] text-zinc-600 shadow-sm"
                    }`}
                title="New message"
            >
                <MessageSquarePlus size={18} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-[#1A1A1A]/40 backdrop-blur-sm"
                            onClick={() => setIsOpen(false)}
                        />

                        {/* Modal container */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            className="relative w-full max-w-md bg-[#FDFCF8] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
                            style={{ maxHeight: 'calc(100vh - 40px)', height: '600px' }} // Fixed height but responsive max constraint
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#E5E5E0] bg-white shrink-0 relative z-10">
                                <div>
                                    <h2 className="text-xl font-bold tracking-tight text-[#1A1A1A]">Start Conversation</h2>
                                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mt-1">Select a peer to chat</p>
                                </div>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Search */}
                            <div className="p-4 border-b border-[#E5E5E0] bg-white shrink-0 relative z-10">
                                <div className="relative group">
                                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-[#D4F268] transition-colors" />
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder="Search by name or username..."
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        className="w-full bg-[#FDFCF8] border border-[#E5E5E0] rounded-xl pl-10 pr-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[#D4F268]/50 focus:border-[#D4F268] transition-all placeholder:text-zinc-400 text-[#1A1A1A]"
                                    />
                                </div>
                            </div>

                            {/* Scrollable List */}
                            <div className="flex-1 overflow-y-auto p-4 bg-[#FDFCF8] relative z-0">
                                {isLoadingFriends ? (
                                    <div className="flex flex-col justify-center items-center h-full py-10">
                                        <Loader2 className="animate-spin text-[#D4F268] w-8 h-8 mb-4 border-2 border-transparent border-t-[#D4F268] rounded-full" />
                                        <p className="text-sm font-medium text-zinc-500">Loading peers...</p>
                                    </div>
                                ) : filtered.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
                                        <div className="w-16 h-16 bg-white shadow-sm border border-[#E5E5E0] rounded-2xl flex items-center justify-center mb-4 rotate-[-4deg]">
                                            <Search className="text-zinc-300" size={28} />
                                        </div>
                                        <p className="text-base font-bold text-[#1A1A1A] mb-1">
                                            {friends.length === 0 ? "No friends found" : "No matches"}
                                        </p>
                                        <p className="text-sm text-zinc-500">
                                            {friends.length === 0
                                                ? "Head over to the network tab to connect with other learners."
                                                : "Try searching for a different name."}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {filtered.map(friend => (
                                            <button
                                                key={friend.id}
                                                onClick={() => handleSelect(friend)}
                                                disabled={openingFor === friend.id}
                                                className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-white active:bg-zinc-50 transition-all duration-200 text-left group disabled:opacity-60 border border-transparent hover:border-[#E5E5E0] hover:shadow-sm"
                                            >
                                                <div className="flex items-center gap-4 min-w-0 pr-4">
                                                    <div className="relative shrink-0">
                                                        <Avatar
                                                            src={friend.avatarUrl}
                                                            fallback={friend.name.charAt(0)}
                                                            className="w-12 h-12 rounded-full border-2 border-white shadow-sm"
                                                        />
                                                        <div className="absolute right-0 bottom-0 w-3.5 h-3.5 bg-green-500 rounded-full border-[2.5px] border-white" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[15px] font-bold text-[#1A1A1A] truncate leading-tight group-hover:text-black">
                                                            {friend.name}
                                                        </p>
                                                        <p className="text-[13px] text-zinc-500 font-medium truncate mt-0.5">
                                                            @{friend.username}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-zinc-50 group-hover:bg-[#D4F268] text-zinc-300 group-hover:text-[#1A1A1A] transition-colors">
                                                    {openingFor === friend.id ? (
                                                        <Loader2 size={16} className="animate-spin text-[#1A1A1A]" />
                                                    ) : (
                                                        <MessageSquarePlus size={15} />
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}


// ⚠️ Next.js App Router: useSearchParams() MUST be inside a <Suspense> boundary.
// So the actual page logic lives in ChatPageContent, and the default export wraps it.
function ChatPageContent() {
    const { isLoading: isGlobalLoading } = useLoading();
    const searchParams = useSearchParams();
    const router = useRouter();
    const initialUserId = searchParams.get("userId");
    const initialCircleId = searchParams.get("circleId");

    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const [selectedPeerId, setSelectedPeerId] = useState<string | null>(initialCircleId || null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    
    const { user, profile, onlineUserIds } = useUser();
    const currentUserId = user?.id || null;

    // --- REALTIME SIDEBAR STATE ---
    const [typingState, setTypingState] = useState<Record<string, Record<string, string>>>({}); 
    // ^ conversationId -> { userId: userName } mapping

    // Fetch conversations using SWR for caching
    const { data: convosData, isLoading: isConvosLoading, mutate } = useSWR(
        currentUserId ? ['conversations', currentUserId] : null,
        async () => {
            const result = await getUserConversations();
            // Deduplicate
            const dedupe = (list: any[]) => {
                const seen = new Set<string>();
                return list.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
            };
            return {
                dms: dedupe(result.dms) as PeerProfile[],
                groups: dedupe(result.groups) as PeerProfile[]
            };
        }
    );

    const dms = convosData?.dms || [];
    const groups = convosData?.groups || [];
    const isLoading = !mounted || isConvosLoading || (currentUserId && !convosData);

    // ── Presence Tracking ──────────────────────────────────



    useEffect(() => {
        if (!currentUserId || !convosData) return;
        const supabase = createClient();

        const allConvoIds = [...convosData.dms, ...convosData.groups].map(c => c.id);
        if (allConvoIds.length === 0) return;

        // 1. Listen for new messages across ALL my conversations to update sidebar previews
        const messageChannel = supabase
            .channel('sidebar:messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
            }, (payload) => {
                const newMessage = payload.new as any;
                if (allConvoIds.includes(newMessage.conversation_id)) {
                    // Trigger SWR mutation to refresh conversation list with new last message
                    mutate();
                }
            })
            .subscribe();

        // 2. Listen for typing indicators globally
        // We use a single wildcard channel or separate ones? Supabase broadcast works better on specific channels.
        // To avoid too many channels, we'll join the ones for active conversations.
        const typingChannels = allConvoIds.map(id => {
            const chan = supabase.channel(`chat:typing:${id}`);
            chan.on('broadcast', { event: 'typing' }, ({ payload }) => {
                const { userId, userName, isTyping } = payload;
                if (userId === currentUserId) return;

                setTypingState(prev => {
                    const next = { ...prev };
                    const usersMap = { ...(next[id] || {}) };
                    
                    if (isTyping) {
                        usersMap[userId] = userName || `User_${userId.slice(0, 4)}`;
                    } else {
                        delete usersMap[userId];
                    }
                    
                    if (Object.keys(usersMap).length === 0) {
                        delete next[id];
                    } else {
                        next[id] = usersMap;
                    }
                    
                    return next;
                });
            }).subscribe();
            return chan;
        });

        return () => {
            supabase.removeChannel(messageChannel);
            typingChannels.forEach(c => supabase.removeChannel(c));
        };
    }, [currentUserId, convosData, mutate]);

    const getTypingSummary = (conversationId: string) => {
        const users = typingState[conversationId];
        if (!users) return null;

        const names = Object.values(users);
        if (names.length === 0) return null;
        if (names.length === 1) return `${names[0]} is typing...`;
        if (names.length === 2) return `${names[0]} & ${names[1]} are typing...`;
        return `${names[0]} and ${names.length - 1} others are typing...`;
    };

    useEffect(() => {
        const handleInitialRoute = async () => {
            if (!initialUserId || !convosData) return;
            
            const convoId = await getOrCreateDirectConversation(initialUserId);
            if (convoId) {
                // If it isn't completely loaded in SWR yet, immediately enrich logic
                if (!convosData.dms.find(d => d.id === convoId)) {
                    const supabase = createClient();
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('id, full_name, username, avatar_url, role')
                        .eq('id', initialUserId)
                        .single();

                    if (profile) {
                        const newDm: PeerProfile = {
                            id: convoId,
                            name: profile.full_name || profile.username || 'User',
                            username: profile.username || '',
                            avatarUrl: profile.avatar_url,
                            type: 'direct' as const,
                            track: profile.role || 'Learner',
                            level: 0, xp: 0, streak: 0, status: 'none' as const,
                        };
                        mutate({
                            dms: [...convosData.dms, newDm],
                            groups: convosData.groups
                        }, false);
                    }
                }
                setSelectedPeerId(convoId);
                router.replace('/peer/chat');
            }
        };

        if (initialUserId && convosData) {
            handleInitialRoute();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialUserId, initialCircleId, convosData?.dms?.length]);

    const allChats = [...dms, ...groups];
    // Gate on mounted: SWRProvider restores localStorage cache on the client instantly,
    // so allChats may be populated before the server's empty-state render is hydrated.
    // Without this, server renders the empty state while client renders the chat window → hydration mismatch.
    const selectedPeer = mounted ? (allChats.find(c => c.id === selectedPeerId) || null) : null;

    const totalUnread = allChats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    const dmsUnreadCount = dms.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    const groupsUnreadCount = groups.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

    // Optimistically clear unread count when opening a conversation
    const handleSelectConversation = (chatId: string) => {
        setSelectedPeerId(chatId);
        if (convosData) {
            const clearUnread = (list: PeerProfile[]) =>
                list.map(c => c.id === chatId ? { ...c, unreadCount: 0 } : c);
            mutate({ dms: clearUnread(convosData.dms), groups: clearUnread(convosData.groups) }, false);
        }
    };

    const filteredDms = dms.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.username.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const filteredGroups = groups.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatTime = (iso?: string) => {
        if (!iso) return '';
        const d = new Date(iso);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
        if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (diffDays === 1) return 'Yesterday';
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const handlePeerUpdate = (updatedPeer: Partial<PeerProfile> & { id: string }) => {
        if (!convosData) return;
        const updateList = (list: PeerProfile[]) =>
            list.map(p => p.id === updatedPeer.id ? { ...p, ...updatedPeer } : p);

        mutate({
            dms: updateList(convosData.dms),
            groups: updateList(convosData.groups)
        }, false);
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={isGlobalLoading ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0.4, duration: 0.8 }}
            className="flex flex-1 min-w-0 h-full bg-[#f8f9fa] md:rounded-[2rem] overflow-hidden border border-zinc-200/60 shadow-sm relative"
        >
            {/* Sidebar List */}
            <motion.div 
                animate={{ width: isSidebarCollapsed ? "80px" : "380px" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className={`shrink-0 flex flex-col border-r border-zinc-200/60 bg-white z-10 h-full relative ${selectedPeerId ? 'hidden md:flex' : 'flex'}`}
            >
                {/* Collapse/Expand Toggle Button (Desktop only) */}
                <button
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className="hidden md:flex absolute -right-3 top-24 z-20 w-6 h-6 bg-white border border-zinc-200 rounded-full items-center justify-center text-zinc-400 hover:text-black hover:border-black transition-all shadow-sm active:scale-95"
                >
                    {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col h-full overflow-hidden"
                >
                    {/* Header */}
                    <div className="pt-6 pb-4 px-5 shrink-0 bg-white overflow-hidden">
                        <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between xl:justify-start xl:gap-4'} mb-5`}>
                            {!isSidebarCollapsed && (
                            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
                                Chats
                                {mounted && totalUnread > 0 && (
                                    <span className="text-sm font-black bg-[#D4F268] text-black px-2 py-0.5 rounded-full">
                                        {totalUnread > 99 ? '99+' : totalUnread}
                                    </span>
                                )}
                            </h2>
                        )}
                            <div className="xl:ml-auto">
                                <NewChatPicker
                                    onSelect={async (friend) => {
                                        console.log("[UI] ChatPageContent: onSelect triggered for:", friend.name);
                                        // Add placeholder immediately
                                        const existingInDms = dms.find(d => {
                                            // We don't know convoId yet, so we can't match by id.
                                            // Just proceed — getOrCreateDirectConversation handles deduplication.
                                            return false;
                                        });
                                        const convoId = await getOrCreateDirectConversation(friend.id);
                                        console.log("[UI] ChatPageContent: getOrCreateDirectConversation result:", convoId);
                                        if (!convoId) return;

                                        // Add or update DM in sidebar using mutate
                                        if (convosData) {
                                            const exists = convosData.dms.find(d => d.id === convoId);
                                            if (!exists) {
                                                const newDm: PeerProfile = {
                                                    id: convoId,
                                                    name: friend.name,
                                                    username: friend.username,
                                                    avatarUrl: friend.avatarUrl,
                                                    type: 'direct' as const,
                                                    track: 'Learner',
                                                    level: 0, xp: 0, streak: 0, status: 'none' as const,
                                                };
                                                mutate({
                                                    dms: [...convosData.dms, newDm],
                                                    groups: convosData.groups
                                                }, false);
                                            }
                                        }
                                        setSelectedPeerId(convoId);
                                    }}
                                />
                            </div>
                        </div>
                        {!isSidebarCollapsed && (
                            <div className="relative group">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-lime-500 transition-colors" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search messages..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-zinc-100/80 border-0 rounded-xl pl-10 pr-4 py-2.5 text-[15px] font-medium outline-none focus:ring-2 focus:ring-lime-500/50 focus:bg-white transition-all shadow-sm placeholder:text-zinc-500 text-zinc-900"
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-6">
                        {isLoading ? (
                            <div className="flex justify-center items-center py-10">
                                <Loader2 className="animate-spin text-zinc-300 w-6 h-6" />
                            </div>
                        ) : (
                            <>
                                {/* Direct Messages */}
                                {filteredDms.length > 0 && (
                                    <div>
                                        <div className={`flex items-center justify-between px-2 mb-2 text-zinc-500 font-semibold text-xs uppercase tracking-wider ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                                            <div className="flex items-center gap-2">
                                                <UserCircle2 size={14} />
                                                {!isSidebarCollapsed && <span>Direct Messages</span>}
                                            </div>
                                            {!isSidebarCollapsed && dmsUnreadCount > 0 && (
                                                <span className="bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded-md text-[10px] font-bold">
                                                    {dmsUnreadCount}
                                                </span>
                                            )}
                                        </div>
                                        <div className="space-y-[2px]">
                                            <AnimatePresence mode="popLayout">
                                                {filteredDms.map((chat, index) => {
                                                    const isActive = selectedPeerId === chat.id;
                                                    return (
                                                        <motion.button
                                                            layout
                                                            initial={{ opacity: 0, y: 5 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, scale: 0.95 }}
                                                            transition={{ delay: index * 0.03 }}
                                                            key={chat.id}
                                                            onClick={() => handleSelectConversation(chat.id)}
                                                            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2' : 'gap-3 p-2.5'} rounded-xl transition-all duration-200 text-left relative overflow-hidden ${isActive ? "bg-lime-50" : "hover:bg-zinc-100/60"}`}
                                                        >
                                                            {isActive && (
                                                                <motion.div layoutId="activeDMIndicator" className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-lime-500" />
                                                            )}
                                                            <div className={`relative shrink-0 ${isSidebarCollapsed ? 'ml-0' : 'ml-1'}`}>
                                                                <Avatar
                                                                    src={chat.avatarUrl}
                                                                    fallback={chat.name.charAt(0)}
                                                                    className="w-[46px] h-[46px] rounded-full shrink-0 object-cover border border-zinc-200"
                                                                />
                                                                {onlineUserIds.has(chat.peerId || chat.id) && (
                                                                    <div className="absolute right-0 bottom-0 w-3 h-3 bg-lime-400 rounded-full border-2 border-white shadow-[0_0_8px_rgba(163,230,53,0.4)]" />
                                                                )}
                                                            </div>
                                                            {!isSidebarCollapsed && (
                                                                <div className="flex-1 min-w-0 pr-1">
                                                                    <div className="flex justify-between items-baseline mb-0.5">
                                                                        <span className={`text-[15px] font-semibold truncate ${isActive ? "text-lime-950" : "text-zinc-900"}`}>{chat.name}</span>
                                                                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                                                            <span className={`text-[11px] font-medium ${isActive ? "text-lime-600" : "text-zinc-400"}`}>
                                                                                {formatTime(chat.lastMessageAt)}
                                                                            </span>
                                                                            {(chat.unreadCount || 0) > 0 && (
                                                                                <motion.span
                                                                                    initial={{ scale: 0 }}
                                                                                    animate={{ scale: 1 }}
                                                                                    className="min-w-[20px] h-5 bg-[#D4F268] text-black text-[10px] font-black rounded-full flex items-center justify-center px-1.5 shadow-sm"
                                                                                >
                                                                                    {chat.unreadCount! > 99 ? '99+' : chat.unreadCount}
                                                                                </motion.span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex justify-between items-center gap-2">
                                                                        {getTypingSummary(chat.id) ? (
                                                                            <span className="text-[13px] text-lime-600 font-bold animate-pulse truncate">{getTypingSummary(chat.id)}</span>
                                                                        ) : mounted && localStorage.getItem(`skloop:chat:draft:${chat.id}`) ? (
                                                                            <span className="text-[13px] truncate text-amber-600 font-bold">
                                                                                Draft: {localStorage.getItem(`skloop:chat:draft:${chat.id}`)?.slice(0, 25)}...
                                                                            </span>
                                                                        ) : (
                                                                            <span className={`text-[13px] truncate ${isActive ? "text-lime-800/80 font-medium" : "text-zinc-500"}`}>
                                                                                {chat.lastMessage || 'No messages yet'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </motion.button>
                                                    );
                                                })}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                )}

                                {/* Study Circles */}
                                {filteredGroups.length > 0 && (
                                    <div>
                                        <div className={`flex items-center justify-between px-2 mb-2 text-zinc-500 font-semibold text-xs uppercase tracking-wider ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                                            <div className="flex items-center gap-2">
                                                <Users size={14} />
                                                {!isSidebarCollapsed && <span>Study Circles</span>}
                                            </div>
                                            {!isSidebarCollapsed && groupsUnreadCount > 0 && (
                                                <span className="bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded-md text-[10px] font-bold">
                                                    {groupsUnreadCount}
                                                </span>
                                            )}
                                        </div>
                                        <div className="space-y-[2px]">
                                            <AnimatePresence mode="popLayout">
                                                {filteredGroups.map((chat, index) => {
                                                    const isActive = selectedPeerId === chat.id;
                                                    return (
                                                        <motion.button
                                                            layout
                                                            initial={{ opacity: 0, y: 5 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, scale: 0.95 }}
                                                            transition={{ delay: index * 0.03 }}
                                                            key={chat.id}
                                                            onClick={() => handleSelectConversation(chat.id)}
                                                            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2' : 'gap-3 p-2.5'} rounded-xl transition-all duration-200 text-left relative overflow-hidden ${isActive ? "bg-lime-50" : "hover:bg-zinc-100/60"}`}
                                                        >
                                                            {isActive && (
                                                                <motion.div layoutId="activeGroupIndicator" className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-lime-500" />
                                                            )}
                                                            <div className={`relative shrink-0 ${isSidebarCollapsed ? 'ml-0' : 'ml-1'}`}>
                                                                <Avatar
                                                                    src={chat.avatarUrl}
                                                                    fallback={chat.name.charAt(0)}
                                                                    className={cn(
                                                                        "w-[46px] h-[46px] rounded-2xl shadow-sm border border-zinc-200/60",
                                                                        isActive ? "border-lime-500/20" : "border-zinc-200/60"
                                                                    )}
                                                                />
                                                            </div>
                                                            {!isSidebarCollapsed && (
                                                                <div className="flex-1 min-w-0 pr-1">
                                                                    <div className="flex justify-between items-baseline mb-0.5">
                                                                        <span className={`text-[15px] font-semibold truncate ${isActive ? "text-lime-950" : "text-zinc-900"}`}>{chat.name}</span>
                                                                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                                                            <span className={`text-[11px] font-medium ${isActive ? "text-lime-700" : "text-zinc-400"}`}>
                                                                                {formatTime(chat.lastMessageAt)}
                                                                            </span>
                                                                            {(chat.unreadCount || 0) > 0 && (
                                                                                <motion.span
                                                                                    initial={{ scale: 0 }}
                                                                                    animate={{ scale: 1 }}
                                                                                    className="min-w-[20px] h-5 bg-[#D4F268] text-black text-[10px] font-black rounded-full flex items-center justify-center px-1.5 shadow-sm"
                                                                                >
                                                                                    {chat.unreadCount! > 99 ? '99+' : chat.unreadCount}
                                                                                </motion.span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex justify-between items-center gap-2">
                                                                        {getTypingSummary(chat.id) ? (
                                                                            <span className="text-[13px] text-lime-600 font-bold animate-pulse truncate">{getTypingSummary(chat.id)}</span>
                                                                        ) : mounted && localStorage.getItem(`skloop:chat:draft:${chat.id}`) ? (
                                                                            <span className="text-[13px] truncate text-amber-600 font-bold">
                                                                                Draft: {localStorage.getItem(`skloop:chat:draft:${chat.id}`)?.slice(0, 25)}...
                                                                            </span>
                                                                        ) : (
                                                                            <span className={`text-[13px] truncate ${isActive ? "text-lime-800/80 font-medium" : "text-zinc-500"}`}>
                                                                                {chat.lastMessage || 'No messages yet'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </motion.button>
                                                    );
                                                })}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                )}

                                {filteredDms.length === 0 && filteredGroups.length === 0 && (
                                    <div className="text-center py-10 px-4">
                                        <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <MessageSquarePlus className="text-zinc-400" size={24} />
                                        </div>
                                        <h3 className="text-sm font-semibold text-zinc-900 mb-1">
                                            {searchTerm ? 'No results found' : 'No chats yet'}
                                        </h3>
                                        <p className="text-xs text-zinc-500">
                                            {searchTerm ? 'Try a different name.' : 'Find a peer to start a conversation.'}
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </motion.div>
            </motion.div>

            {/* Chat Area */}
            <AnimatePresence mode="popLayout">
                {selectedPeer ? (
                    <motion.div
                        key={selectedPeer.id}
                        className="fixed inset-0 h-[var(--app-h)] md:h-auto md:static md:inset-auto md:flex-1 md:min-w-0 md:flex md:flex-col bg-white z-50 md:z-auto shadow-[-4px_0_24px_-10px_rgba(0,0,0,0.05)] md:shadow-none"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                        <ChatWindow
                            peer={selectedPeer}
                            currentUserId={currentUserId}
                            currentUserName={profile?.full_name || profile?.username}
                            onBack={() => setSelectedPeerId(null)}
                            onPeerUpdate={handlePeerUpdate}
                        />
                    </motion.div>
                ) : (
                    <motion.div
                        key="empty"
                        className="hidden md:flex flex-1 flex-col h-full bg-[#f8f9fa] items-center justify-center relative overflow-hidden"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-lime-100 rounded-full blur-3xl opacity-40 pointer-events-none" />
                        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-zinc-200 rounded-full blur-3xl opacity-40 pointer-events-none" />
                        <div className="w-20 h-20 bg-white shadow-xl shadow-zinc-200/40 rounded-3xl flex items-center justify-center mb-6 border border-zinc-100 rotate-[-4deg]">
                            <MessageSquarePlus className="text-zinc-800" size={32} />
                        </div>
                        <h3 className="text-xl font-bold text-zinc-900 mb-2">Your Messages</h3>
                        <p className="text-zinc-500 text-sm max-w-[260px] text-center mb-6">Connect with peers or jump into a study circle to start collaborating.</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// Default export wraps in Suspense so useSearchParams works correctly
export default function ChatPage() {
    return (
        <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full">
                <Loader2 className="animate-spin text-zinc-300 w-6 h-6" />
            </div>
        }>
            <ChatPageContent />
        </Suspense>
    );
}
