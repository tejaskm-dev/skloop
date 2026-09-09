"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";
import { useUser } from "@/context/UserContext";
import { signOutAction } from "@/actions/user-actions";
import {
    User,
    Bell,
    Lock,
    CreditCard,
    Palette,
    Keyboard,
    Bot,
    ArrowLeft,
    LogOut,
    Zap,
} from "lucide-react";

const SETTINGS_SECTIONS = [
    {
        group: "Account",
        items: [
            { id: "profile",       label: "Profile",            icon: User,       href: "/settings/profile" },
            { id: "account",       label: "Account & Security", icon: Lock,       href: "/settings/account" },
            { id: "notifications", label: "Notifications",      icon: Bell,       href: "/settings/notifications" },
        ],
    },
    {
        group: "Personalisation",
        items: [
            { id: "appearance", label: "Appearance",         icon: Palette,  href: "/settings/appearance" },
            { id: "shortcuts",  label: "Keyboard Shortcuts", icon: Keyboard, href: "/settings/shortcuts" },
        ],
    },
    {
        group: "AI & Plans",
        items: [
            { id: "ai",      label: "Loopy AI",        icon: Bot,        href: "/settings/ai" },
            { id: "billing", label: "Plans & Billing",  icon: CreditCard, href: "/settings/billing" },
        ],
    },
];

function UserRow() {
    const { user, profile } = useUser();
    const initials = profile?.full_name
        ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
        : (user?.email?.[0] ?? "?").toUpperCase();

    return (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-50">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 overflow-hidden">
                {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                    <span className="text-xs font-black text-black">{initials}</span>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 truncate">
                    {profile?.full_name || user?.email?.split("@")[0] || "User"}
                </p>
                <p className="text-[10px] text-zinc-400 font-medium truncate">{user?.email}</p>
            </div>
        </div>
    );
}

export function SettingsShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();

    const handleSignOut = async () => {
        const result = await signOutAction();
        if (result.success) {
            window.location.href = "/login";
        }
    };

    return (
        <div className="flex h-[var(--app-h)] bg-zinc-50">
            {/* Left Settings Sidebar */}
            <aside className="w-64 shrink-0 bg-white border-r border-zinc-100 flex flex-col h-full hidden md:flex">
                {/* Header */}
                <div className="p-6 border-b border-zinc-100">
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-900 text-sm font-bold transition-colors mb-5"
                    >
                        <ArrowLeft size={15} />
                        Back to App
                    </Link>
                    <div className="flex items-center gap-3">
                        <Logo className="w-8 h-8" />
                        <span className="font-black text-lg tracking-tight text-zinc-900">Settings</span>
                    </div>
                </div>

                {/* Nav sections */}
                <nav className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-6">
                    {SETTINGS_SECTIONS.map((section, sIdx) => (
                        <motion.div 
                            key={section.group}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: sIdx * 0.1 }}
                        >
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-3 mb-2">
                                {section.group}
                            </p>
                            <div className="space-y-1">
                                {section.items.map((item) => {
                                    const isActive =
                                        pathname === item.href || pathname.startsWith(item.href + "/");
                                    return (
                                        <Link
                                            key={item.id}
                                            href={item.href}
                                            className={cn(
                                                "relative flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all",
                                                isActive
                                                    ? "bg-primary text-primary-foreground" // Instant CSS background swap
                                                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/50"
                                            )}
                                        >
                                            <item.icon
                                                size={16}
                                                strokeWidth={isActive ? 2.5 : 2}
                                                className="shrink-0 relative z-10"
                                            />
                                            <span className="relative z-10">{item.label}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </motion.div>
                    ))}
                </nav>

                {/* Bottom: user + sign out */}
                <div className="p-4 border-t border-zinc-100 space-y-2">
                    <UserRow />
                    <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
                    >
                        <LogOut size={16} />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Mobile top nav */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-zinc-100 px-4 pt-safe">
                <div className="flex items-center gap-3 py-3">
                    <Link href="/dashboard" className="p-2 rounded-xl hover:bg-zinc-100 transition-colors">
                        <ArrowLeft size={20} className="text-zinc-600" />
                    </Link>
                    <span className="font-black text-base tracking-tight text-zinc-900 flex-1">Settings</span>
                </div>
                {/* Horizontal pill scroll */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 snap-x snap-mandatory">
                    {SETTINGS_SECTIONS.flatMap((s) => s.items).map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                        return (
                            <Link
                                key={item.id}
                                href={item.href}
                                className={cn(
                                    "relative shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all snap-start",
                                    isActive
                                        ? "bg-primary text-primary-foreground"
                                        : "text-zinc-500 hover:text-zinc-900 bg-zinc-100/80 hover:bg-zinc-200/80"
                                )}
                            >
                                <item.icon size={14} strokeWidth={isActive ? 2.5 : 2} className="relative z-10" />
                                <span className="relative z-10">{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Main content */}
            <main 
                id="app-scroll-container"
                className="flex-1 overflow-y-auto no-scrollbar bg-white rounded-l-[2.5rem] md:my-2 md:mr-2 border border-zinc-100 shadow-sm relative"
            >
                <motion.div
                    key={pathname}
                    initial={{ opacity: 0, y: 15, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="max-w-3xl mx-auto px-4 md:px-12 py-6 md:py-16 pt-[8rem] md:pt-16"
                >
                    {children}
                </motion.div>
            </main>
        </div>
    );
}
