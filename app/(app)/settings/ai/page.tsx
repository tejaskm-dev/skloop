"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Brain, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function AISettingsPage() {
    const { user, profile } = useUser();
    const { toast } = useToast();
    const supabase = createClient();

    const [contextMemory, setContextMemory] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [initialized, setInitialized] = useState(false);

    const aiQueriesUsed: number = (profile as any)?.ai_queries_today ?? 0;
    const aiQueriesLimit = 10;
    const usagePct = Math.min(100, (aiQueriesUsed / aiQueriesLimit) * 100);

    useEffect(() => {
        if (profile && !initialized) {
            setContextMemory(!!(profile as any)?.ai_context_memory);
            setInitialized(true);
        }
    }, [profile, initialized]);

    const handleSave = async () => {
        if (!user) return;
        setIsSaving(true);
        try {
            // Written to its own column. This preference used to live inside
            // active_powers, which also carries xp_multiplier / coins_multiplier —
            // so a client able to save it could also grant itself a reward
            // multiplier. active_powers is server-only now (migration 001).
            const { error } = await supabase
                .from("profiles")
                .update({ ai_context_memory: contextMemory })
                .eq("id", user.id);
            if (error) throw error;
            toast("Loopy AI settings saved!", "success");
        } catch (err: any) {
            toast(err.message || "Failed to save.", "error");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-3xl font-black text-zinc-900 tracking-tight">Loopy AI</h1>
                <p className="text-zinc-500 font-medium mt-1">Manage your AI usage and preferences.</p>
            </div>

            <div className="space-y-6">
                {/* Usage bar */}
                <div className="bg-white rounded-[2rem] p-6 border border-zinc-100 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400">AI Usage Today</h2>
                        <span className="text-xs font-bold text-zinc-400">Resets at midnight UTC</span>
                    </div>
                    <div className="flex items-center gap-4 mb-3">
                        <div className="flex-1 h-3 bg-zinc-100 rounded-full overflow-hidden">
                            <div
                                className={cn(
                                    "h-full rounded-full transition-all duration-500",
                                    usagePct >= 90 ? "bg-red-400" : usagePct >= 70 ? "bg-amber-400" : "bg-primary"
                                )}
                                style={{ width: `${usagePct}%` }}
                            />
                        </div>
                        <span className="text-sm font-black text-zinc-900 shrink-0">
                            {aiQueriesUsed} / {aiQueriesLimit}
                        </span>
                    </div>
                    <p className="text-xs text-zinc-400 font-medium">
                        On the Free plan.{" "}
                        <Link href="/settings/billing" className="text-primary font-black hover:underline">
                            Upgrade to Pro
                        </Link>{" "}
                        for 100 queries/day.
                    </p>
                </div>

                {/* Context memory */}
                <div className="bg-white rounded-[2rem] p-6 border border-zinc-100 shadow-sm">
                    <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4">Context Memory</h2>
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                            <Brain size={18} className="text-zinc-600" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-bold text-zinc-900">Remember recent lessons</p>
                            <p className="text-xs text-zinc-400 mt-0.5">
                                Loopy uses your completed lessons as context when answering questions
                            </p>
                        </div>
                        <button
                            onClick={() => setContextMemory(!contextMemory)}
                            className={cn(
                                "w-12 h-7 rounded-full transition-colors relative shrink-0",
                                contextMemory ? "bg-primary" : "bg-zinc-200"
                            )}
                        >
                            <div className={cn(
                                "h-5 w-5 bg-white rounded-full shadow-sm absolute top-1 transition-all duration-200",
                                contextMemory ? "left-6" : "left-1"
                            )} />
                        </button>
                    </div>
                </div>

                <div className="flex justify-end">
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-primary text-black font-black rounded-xl px-8 h-12 shadow-lg shadow-primary/20"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : "Save Settings"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
