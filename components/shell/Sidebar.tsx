import { motion, AnimatePresence, Variants } from "framer-motion";
import {
    Home,
    Layers,
    BookOpen,
    Users,
    User,
    ChevronLeft,
    ChevronRight,
    GraduationCap,
    Bot,
    ShoppingBag,
    Settings,
} from "lucide-react";
import { useState, useRef, memo, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "../ui/Button";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";
import { useMediaQuery } from "@/hooks/use-media-query";
import { preload } from "swr";
import { fetchUserTasks, 
    fetchCourseTrack, 
    fetchPracticeStats, 
    fetchPeers, 
    fetchStudyCircles, 
    fetchGlobalLeaderboard, 
    fetchMentorStatus, 
    fetchFindMentorData, 
    fetchMySessionsAsMentee, 
    fetchMentorDashboardData,
    fetchUserProfile,
    fetchShopData,
    fetchDailyQuests,
    fetchHeroCourse,
    fetchConversations
} from "@/lib/swr-fetchers";
import { useUser } from "@/context/UserContext";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip";

interface NavItemType {
    label: string;
    href: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: any;
    badge?: string | number;
    subItems?: { label: string; href: string }[];
}

interface NavItemProps {
    item: NavItemType;
    isCollapsed: boolean;
    isDesktop: boolean;
    pathname: string;
    setMobileOpen?: (open: boolean) => void;
    setIsCollapsed: (collapsed: boolean) => void;
    user?: any;
}

// Wrapped in memo to prevent unnecessary re-renders when parent Sidebar state changes 
const NavItem = memo(({ item, isCollapsed, isDesktop, pathname, setMobileOpen, setIsCollapsed, user }: NavItemProps) => {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const isActive = pathname === item.href || (item.subItems && item.subItems.some((sub) => pathname === sub.href));
    const showLabel = !isCollapsed || !isDesktop;
    const showTooltip = isCollapsed && isDesktop;

    // Auto-expand sub-menu if active and sidebar is expanded
    if (isActive && showLabel && !isOpen) {
        // Optional: auto-open active section on load?
        // simple approach: let user open it, or use useEffect. 
        // For now, let's just keep manual toggle unless active.
    }

    const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prefetchedRoutes = useRef<Set<string>>(new Set());

    const handlePrefetch = (href: string) => {
        if (!user) return;

        // Prefetch the ROUTE, not just its data.
        //
        // This function previously only warmed the SWR cache, so a click still
        // had to wait on the RSC payload. And because every route here is
        // dynamic, Next's default <Link> prefetch fetches nothing beyond the
        // loading boundary — so the payload was always fetched on click.
        //
        // router.prefetch() pulls the full payload; with
        // experimental.staleTimes.dynamic set in next.config.ts it then stays in
        // the client router cache, making the click itself instant.
        //
        // Done on hover rather than via prefetch={true} deliberately: the latter
        // prefetches on viewport entry, which would fire a burst of RSC requests
        // for every sidebar item on each page load — expensive on a free-tier
        // database. Fired once per route per mount.
        if (!prefetchedRoutes.current.has(href)) {
            prefetchedRoutes.current.add(href);
            try {
                router.prefetch(href);
            } catch {
                // Prefetch is an optimisation; never let it break navigation.
            }
        }

        if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = setTimeout(() => {
        if (href === '/dashboard') {
            preload(['userTasks', user.id], fetchUserTasks as any);
            preload(['dailyQuests', user.id], fetchDailyQuests as any);
            preload(['heroCourse', user.id], fetchHeroCourse as any);
        } else if (href.startsWith('/course/')) {
            const courseId = href.split('/').pop();
            if (courseId && courseId !== 'course') {
                preload(['course', courseId, user.id], fetchCourseTrack as any);
            }
        } else if (href === '/practice') {
            preload(['practiceStats', user.id], fetchPracticeStats as any);
        } else if (href === '/peer/my-peers') {
            preload(['peers', user.id], fetchPeers as any);
        } else if (href === '/peer/study-circles') {
            preload(['studyCircles'], fetchStudyCircles as any);
        } else if (href === '/peer/leaderboard') {
            preload(['globalLeaderboard'], fetchGlobalLeaderboard as any);
        } else if (href === '/mentorship/apply') {
            preload(['mentorStatus'], fetchMentorStatus as any);
        } else if (href === '/mentorship/find') {
            preload(['findMentorData'], fetchFindMentorData as any);
        } else if (href === '/mentorship/sessions') {
            preload(['mySessionsAsMentee'], fetchMySessionsAsMentee as any);
        } else if (href === '/mentorship/dashboard') {
            preload(['mentorDashboard', user.id], fetchMentorDashboardData as any);
        } else if (href === '/profile') {
            preload(['userProfile', user.id], fetchUserProfile as any);
        } else if (href === '/shop') {
            preload(['shopData', user.id], fetchShopData as any);
        }
        }, 150);
    };

    const [mounted, setMounted] = useState(false);
    
    // Fix hydration mismatch caused by client-only badge/status values (e.g. from SWR/Zustand)
    require('react').useEffect(() => {
        setMounted(true);
    }, []);

    const itemContent = (
        <div className={cn(
            "flex items-center gap-3 xl:gap-4 px-4 xl:px-5 py-3 xl:py-4 rounded-[1.5rem] transition-all duration-300 relative overflow-hidden",
            isActive
                ? "bg-primary text-primary-foreground shadow-sm font-bold"
                : "text-gray-500 hover:bg-gray-50 hover:text-foreground",
            isCollapsed && isDesktop ? "justify-center px-0" : ""
        )}>
            <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} className="shrink-0 z-10 xl:w-[22px] xl:h-[22px]" />
            {showLabel && (
                <div className="flex-1 flex items-center justify-between min-w-0">
                    <span className="truncate text-sm xl:text-sm z-10 font-medium text-left">{item.label}</span>
                    <div className="flex items-center gap-2">
                        {mounted && item.badge && (
                            <span className={cn(
                                "text-[10px] xl:text-[10px] font-bold px-2 py-0.5 rounded-full z-10",
                                isActive 
                                    ? "bg-white/50 text-black" 
                                    : "bg-[#84cc16] text-white shadow-sm ring-1 ring-white/20 animate-in zoom-in-75 duration-300"
                            )}>
                                {item.badge}
                            </span>
                        )}
                        {item.subItems && <ChevronRight size={16} className={cn("transition-transform duration-200 shrink-0", isOpen ? "rotate-90" : "")} />}
                    </div>
                </div>
            )}
        </div>
    );

    if (item.subItems) {
        return (
            <div className="mb-1">
                <TooltipProvider delayDuration={300}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={() => {
                                    if (isCollapsed && isDesktop) {
                                        setIsCollapsed(false);
                                        setIsOpen(true);
                                    } else {
                                        setIsOpen(!isOpen);
                                    }
                                }}
                                className="w-full text-left outline-none"
                            >
                                {itemContent}
                            </button>
                        </TooltipTrigger>
                        {showTooltip && (
                            <TooltipContent side="right">
                                <p>{item.label}</p>
                            </TooltipContent>
                        )}
                    </Tooltip>
                </TooltipProvider>

                <AnimatePresence>
                    {isOpen && showLabel && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden ml-4 pl-4 border-l border-gray-100 space-y-1 mt-1"
                        >
                            {item.subItems.map((sub, idx: number) => {
                                const isSubActive = pathname === sub.href;
                                return (
                                    <Link
                                        key={idx}
                                        href={sub.href}
                                        onMouseEnter={() => handlePrefetch(sub.href)}
                                        onTouchStart={() => handlePrefetch(sub.href)}
                                        onClick={() => setMobileOpen?.(false)}
                                        className={cn(
                                            "flex items-center justify-between py-2 px-4 rounded-xl text-xs xl:text-sm transition-colors !no-underline",
                                            isSubActive ? "text-primary font-bold bg-primary/5" : "text-gray-500 hover:text-foreground hover:bg-gray-50"
                                        )}
                                        style={{ textDecoration: 'none' }}
                                    >
                                        <span>{sub.label}</span>
                                        {mounted && (sub as any).badge && (
                                            <span className={cn(
                                                "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                                                isSubActive ? "bg-primary text-primary-foreground" : "bg-[#84cc16] text-white"
                                            )}>
                                                {(sub as any).badge}
                                            </span>
                                        )}
                                    </Link>
                                );
                            })}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Link
                        href={item.href}
                        onMouseEnter={() => handlePrefetch(item.href)}
                        onTouchStart={() => handlePrefetch(item.href)}
                        onClick={() => {
                            setMobileOpen?.(false);
                        }}
                        className="block group mb-1 outline-none !no-underline"
                        style={{ textDecoration: 'none' }}
                    >
                        {itemContent}
                    </Link>
                </TooltipTrigger>
                {showTooltip && (
                    <TooltipContent side="right">
                        <p>{item.label}</p>
                    </TooltipContent>
                )}
            </Tooltip>
        </TooltipProvider>
    );
});

// Extracted SidebarContent to prevent re-renders affecting animation
interface SidebarContentProps {
    isCollapsed: boolean;
    isDesktop: boolean;
    pathname: string;
    setMobileOpen?: (open: boolean) => void;
    setIsCollapsed: (collapsed: boolean) => void;
}

const SidebarContent = ({ isCollapsed, isDesktop, pathname, setMobileOpen, setIsCollapsed }: SidebarContentProps) => {
    const { user } = useUser();
    
    // Fetch conversations for unread counts
    const { data: convos } = useSWR(
        user?.id ? ['conversations', user.id] : null,
        fetchConversations,
        { refreshInterval: 30000 } // Poll every 30s as fallback, though realtime triggers mutation
    );

    const totalUnread = useMemo(() => {
        if (!convos) return 0;
        return [...convos.dms, ...convos.groups].reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    }, [convos]);
    
    const navItems = [
        { icon: Home, label: "Home", href: "/dashboard" },
        {
            icon: Layers,
            label: "Tracks",
            href: "#",
            subItems: [
                { label: "My Roadmap", href: "/roadmap" },
                { label: "Web Development", href: "/course/web-development" },
                { label: "DSA Foundations", href: "/course/dsa" },
            ]
        },
        {
            icon: BookOpen,
            label: "Practice",
            href: "/practice",
            subItems: [
                { label: "Daily Hub", href: "/practice" },
                { label: "Daily Codele", href: "/practice/daily-codele" },
                { label: "Typing Speed", href: "/practice/typing-speed" },
                { label: "DSA Quiz", href: "/practice/dsa-quiz" },
            ]
        },
        {
            icon: GraduationCap,
            label: "Mentorship",
            href: "#",
            subItems: [
                { label: "Find Mentor", href: "/mentorship/find" },
                { label: "My Sessions", href: "/mentorship/sessions" },
                { label: "Become a Mentor", href: "/mentorship/apply" },
                { label: "Mentor Dashboard", href: "/mentorship/dashboard" },
            ]
        },
        {
            icon: Users,
            label: "Peers",
            href: "#",
            badge: totalUnread > 0 ? totalUnread : undefined,
            subItems: [
                { label: "My Peers", href: "/peer/my-peers" },
                { 
                    label: "Chat", 
                    href: "/peer/chat",
                    badge: totalUnread > 0 ? totalUnread : undefined 
                } as any,
                { label: "Study Circles", href: "/peer/study-circles" },
                { label: "Leaderboard", href: "/peer/leaderboard" },
            ]
        },
        { icon: User, label: "Profile", href: "/profile" },
        { icon: ShoppingBag, label: "Loopy Shop", href: "/shop" },
        { icon: Bot, label: "Loopy AI", href: "/loopy" },
    ];

    return (
        <div className="flex-1 flex flex-col h-full bg-surface shadow-2xl md:shadow-none border md:border-none rounded-[2rem] overflow-hidden relative transition-all duration-300">
            {/* Brand Header */}
            <div className={cn("p-6 xl:p-8 pb-6 flex items-center gap-4 transition-all duration-300", isCollapsed && isDesktop ? "justify-center px-2" : "")}>
                <div className="h-10 w-10 text-primary rounded-xl flex items-center justify-center shrink-0 transition-transform hover:scale-110">
                    <Logo className="w-10 h-10" />
                </div>
                {(!isCollapsed || !isDesktop) && (
                    <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="font-bold text-xl xl:text-2xl tracking-tight text-foreground whitespace-nowrap"
                    >
                        Skloop
                    </motion.span>
                )}
                {/* Mobile Close Button */}
                <div className="md:hidden ml-auto">
                    <Button variant="ghost" className="h-10 w-10 p-0" onClick={() => setMobileOpen?.(false)}>
                        <ChevronLeft />
                    </Button>
                </div>
            </div>

            {/* Separator */}
            <div className="mx-6 mb-6 h-px bg-gray-100" />

            {/* Navigation Links */}
            <nav className="flex-1 px-3 xl:px-4 space-y-1 xl:space-y-2 overflow-y-auto no-scrollbar">
                {navItems.map((item, idx: number) => (
                    <NavItem
                        key={idx}
                        item={item}
                        isCollapsed={isCollapsed}
                        isDesktop={isDesktop}
                        pathname={pathname}
                        setMobileOpen={setMobileOpen}
                        setIsCollapsed={setIsCollapsed}
                        user={user}
                    />
                ))}
            </nav>

            {/* Bottom Actions Area */}
            <div className="p-4 mt-auto space-y-1">
                {/* Settings Link */}
                <TooltipProvider delayDuration={300}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Link
                                href="/settings"
                                className={cn(
                                    "w-full flex items-center gap-4 px-5 py-3 rounded-[1.5rem] transition-all duration-200 font-medium text-sm",
                                    pathname.startsWith('/settings')
                                        ? "bg-primary text-primary-foreground"
                                        : "text-gray-400 hover:bg-gray-50 hover:text-foreground",
                                    isCollapsed ? "justify-center px-0" : ""
                                )}
                            >
                                <Settings size={20} strokeWidth={2} className="shrink-0" />
                                {!isCollapsed && <span>Settings</span>}
                            </Link>
                        </TooltipTrigger>
                        {isCollapsed && isDesktop && (
                            <TooltipContent side="right">
                                <p>Settings</p>
                            </TooltipContent>
                        )}
                    </Tooltip>
                </TooltipProvider>

                {/* Clean Collapse Toggle - Desktop Only */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className={cn(
                        "hidden md:flex w-full items-center gap-4 px-5 py-3 rounded-[1.5rem] transition-all duration-200 text-gray-400 hover:bg-gray-50 hover:text-foreground",
                        isCollapsed ? "justify-center" : ""
                    )}
                >
                    {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                    {!isCollapsed && <span className="font-medium text-xs xl:text-sm">Collapse Sidebar</span>}
                </button>
            </div>
        </div>
    );
};

export function Sidebar({ mobileOpen = false, setMobileOpen }: { mobileOpen?: boolean; setMobileOpen?: (open: boolean) => void }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const pathname = usePathname();
    const isDesktop = useMediaQuery("(min-width: 768px)");
    const isWide = useMediaQuery("(min-width: 1280px)");

    // Animation Variants - 'Snap & Glide'
    const drawerVariants: Variants = {
        open: {
            x: 0,
            opacity: 1,
            scale: 1,
            transition: {
                type: "spring",
                stiffness: 300,
                damping: 30
            }
        },
        closed: {
            x: "-100%",
            opacity: 0,
            scale: 0.95,
            transition: {
                type: "tween",
                ease: "easeInOut",
                duration: 0.3
            }
        }
    };

    return (
        <>
            {/* Desktop Sidebar (Persistent) */}
            <motion.aside
                initial={false}
                animate={{ width: isCollapsed ? 90 : (isWide ? 340 : 260) }} // Responsive width: 340px on wide screens, 260px on laptops
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="hidden md:flex flex-col h-full shrink-0"
            >
                <div className="h-full w-full card-float p-0 rounded-[2.5rem] overflow-hidden">
                    <SidebarContent
                        isCollapsed={isCollapsed}
                        isDesktop={isDesktop}
                        pathname={pathname}
                        setMobileOpen={setMobileOpen}
                        setIsCollapsed={setIsCollapsed}
                    />
                </div>
            </motion.aside>

            {/* Mobile Sidebar (Drawer) */}
            <AnimatePresence>
                {mobileOpen && (
                    <>
                        <motion.div
                            key="mobile-overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            onClick={() => setMobileOpen?.(false)}
                            className="md:hidden fixed inset-0 bg-black/60 z-[90] backdrop-blur-sm"
                        />
                        <motion.aside
                            key="mobile-drawer"
                            initial="closed"
                            animate="open"
                            exit="closed"
                            variants={drawerVariants}
                            className="md:hidden fixed inset-y-4 left-4 z-[100] w-80 shadow-2xl"
                        >
                            <SidebarContent
                                isCollapsed={false}
                                isDesktop={false}
                                pathname={pathname}
                                setMobileOpen={setMobileOpen}
                                setIsCollapsed={setIsCollapsed}
                            />
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
