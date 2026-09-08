"use client";

import dynamic from "next/dynamic";

/**
 * The Mux player is ~1.5MB of JS — by far the largest thing in the bundle.
 * It used to be a static import, and because this component is pulled into
 * ChatWindow, every user who opened chat downloaded the whole player whether
 * or not a video was ever rendered.
 *
 * Loading it on demand means the cost is paid only by the render that actually
 * shows a video. The component's public API is unchanged.
 */
const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), {
    ssr: false,
    loading: () => (
        <div
            className="w-full animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800"
            style={{ aspectRatio: "16/9" }}
        />
    ),
});

interface Props {
    url: string; // https://stream.mux.com/{playbackId}
    className?: string;
    onPlay?: () => void;
}

export function MuxVideoPlayer({ url, className, onPlay }: Props) {
    const playbackId = url.replace("https://stream.mux.com/", "");
    return (
        <MuxPlayer
            playbackId={playbackId}
            streamType="on-demand"
            className={className}
            style={{ aspectRatio: "16/9", width: "100%" }}
            onPlay={onPlay}
        />
    );
}
