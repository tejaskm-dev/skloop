"use client";

import { useState } from "react";
import Image from "next/image";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface AvatarProps {
    src?: string;
    fallback: string;
    className?: string;
    frameId?: string | null;
    glowId?: string | null;
    onClick?: () => void;
}

const FRAME_STYLES: Record<string, string> = {
    // Common
    'q_frame_silver': 'border-[3px] border-slate-300 shadow-[0_0_10px_rgba(203,213,225,0.5)]',
    'q_frame_bronze': 'border-[3px] border-orange-700 shadow-[0_0_10px_rgba(194,65,12,0.4)]',
    'q_frame_slate': 'border-[3px] border-slate-700 shadow-[0_0_10px_rgba(51,65,85,0.6)]',
    'q_frame_gate': 'border-[3px] border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]',

    // Rare
    'q_frame_holo_v1': 'border-[3px] border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.7)] hover:scale-105 transition-transform',
    'q_frame_neon_pulse': 'border-[3px] border-lime-400 shadow-[0_0_20px_#D4F268] animate-pulse',
    'q_frame_circuit': 'border-[3px] border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.6)]',
    'q_frame_magma': 'border-[3px] border-orange-600 shadow-[0_0_20px_rgba(234,88,12,0.8)]',

    // Legendary
    'q_frame_divine': 'border-[4px] border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.9)] animate-pulse',
    'q_frame_void_rift': 'border-[4px] border-purple-900 bg-black shadow-[0_0_30px_rgba(88,28,135,1)]',
    'q_frame_cyber_glitch': 'border-[3px] border-fuchsia-500 shadow-[0_0_15px_#d946ef] grayscale-[0.5] contrast-125',
};

const RING_GLOWS: Record<string, string> = {
    'q_ring_mist': 'shadow-[0_0_20px_rgba(203,213,225,0.8)] border-[2px] border-white/50',
    'q_ring_ocean': 'shadow-[0_0_20px_rgba(30,64,175,0.8)] border-[2px] border-blue-600',
    'q_ring_solar': 'shadow-[0_0_30px_rgba(251,191,36,0.9)] border-[2px] border-amber-500 animate-pulse',
    'q_ring_quantum': 'shadow-[0_0_35px_#D4F268] border-[2px] border-lime-500 animate-bounce-slow',
    'q_ring_singularity': 'shadow-[0_0_40px_rgba(88,28,135,1)] border-[2px] border-purple-900',
};

export function Avatar({ src, fallback, className, frameId, glowId, onClick }: AvatarProps) {
    const frameClass = frameId ? FRAME_STYLES[frameId] : "";
    const glowClass = glowId ? RING_GLOWS[glowId] : "";
    const [imgError, setImgError] = useState(false);

    // Treat empty strings as missing — they pass the truthiness check but always 404
    const validSrc = src && src.trim() !== "" ? src : undefined;
    const showImage = validSrc && !imgError;

    return (
        <div 
            className={cn("relative isolate", onClick && "cursor-pointer")}
            onClick={onClick}
        >
            {/* Glow Ring Effect */}
            {glowId && (
                <div
                    className={cn(
                        "absolute inset-[-4px] rounded-full blur-md opacity-60 animate-pulse -z-10",
                        glowId === 'q_ring_solar' ? "bg-amber-500" :
                        glowId === 'q_ring_quantum' ? "bg-lime-400" :
                        glowId === 'q_ring_void' ? "bg-purple-600" : "bg-slate-300"
                    )}
                />
            )}

            <div
                className={cn(
                    "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface border border-white/10 transition-all duration-500",
                    frameClass,
                    glowClass,
                    className
                )}
            >
                {showImage ? (
                    // Optimised through next/image rather than a raw <img>.
                    //
                    // Avatars render between 32px and 96px but the raw tag served
                    // whatever the user originally uploaded — often multiple
                    // megabytes — once per leaderboard row and once per chat
                    // message. The optimiser resizes and converts to AVIF/WebP at
                    // the edge, and `sizes` tells it which variant to pick.
                    //
                    // `unoptimized` is a safety valve for data: URLs (crop preview
                    // before upload), which the optimiser can't process.
                    <Image
                        src={validSrc}
                        alt={fallback}
                        fill
                        sizes="96px"
                        className="h-full w-full object-cover"
                        onError={() => setImgError(true)}
                        unoptimized={validSrc.startsWith("data:") || validSrc.startsWith("blob:")}
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-primary/10 text-xs font-bold text-primary">
                        {fallback?.[0]?.toUpperCase() ?? "?"}
                    </div>
                )}
            </div>

            {/* Special Frame Overlay for Animated Frames */}
            {frameId === 'q_frame_glitch' && (
                <div className="absolute inset-0 rounded-full border-2 border-cyan-400 opacity-50 animate-ping pointer-events-none" />
            )}
        </div>
    );
}
