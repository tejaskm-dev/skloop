import { NextRequest, NextResponse } from "next/server";
import Mux from "@mux/mux-node";
import { createClient } from "@/utils/supabase/server";

/**
 * Mux direct-upload broker.
 *
 * POST was previously unauthenticated with cors_origin "*", so anyone could
 * mint unlimited upload URLs against the account — billing abuse plus an
 * anonymous public file host. Both handlers now require a session, and uploads
 * are pinned to this app's own origin.
 *
 * The Mux client is constructed lazily: building it at module scope means a
 * missing token crashes route collection during `next build`.
 */
let muxClient: Mux | null = null;

function getMux(): Mux | null {
    if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) return null;
    if (!muxClient) {
        muxClient = new Mux({
            tokenId: process.env.MUX_TOKEN_ID,
            tokenSecret: process.env.MUX_TOKEN_SECRET,
        });
    }
    return muxClient;
}

async function requireUser() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

/** Origin uploads are allowed from. Falls back to same-origin in development. */
function allowedOrigin(req: NextRequest): string {
    return (
        process.env.NEXT_PUBLIC_SITE_URL ||
        req.nextUrl.origin ||
        "https://skloop.online"
    );
}

// POST: Create a Mux Direct Upload URL
export async function POST(req: NextRequest) {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const mux = getMux();
    if (!mux) {
        return NextResponse.json({ error: "Video uploads are not configured." }, { status: 503 });
    }

    try {
        const upload = await mux.video.uploads.create({
            cors_origin: allowedOrigin(req),
            new_asset_settings: {
                playback_policy: ["public"],
                passthrough: user.id, // ties the resulting asset back to its uploader
            },
        });
        return NextResponse.json({ uploadUrl: upload.url, uploadId: upload.id });
    } catch (err) {
        console.error("[Mux] Failed to create upload:", err);
        return NextResponse.json({ error: "Failed to create Mux upload" }, { status: 500 });
    }
}

// GET: Poll for playback ID once asset is ready
export async function GET(req: NextRequest) {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const mux = getMux();
    if (!mux) {
        return NextResponse.json({ error: "Video uploads are not configured." }, { status: 503 });
    }

    const uploadId = req.nextUrl.searchParams.get("uploadId");
    if (!uploadId) return NextResponse.json({ error: "Missing uploadId" }, { status: 400 });

    try {
        const upload = await mux.video.uploads.retrieve(uploadId);

        if (!upload.asset_id) {
            return NextResponse.json({ status: upload.status, playbackId: null });
        }

        const asset = await mux.video.assets.retrieve(upload.asset_id);

        // Only the uploader may poll their own asset.
        if (asset.passthrough && asset.passthrough !== user.id) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const playbackId = asset.playback_ids?.[0]?.id ?? null;

        return NextResponse.json({ status: asset.status, playbackId });
    } catch (err) {
        console.error("[Mux] Failed to retrieve upload status:", err);
        return NextResponse.json({ error: "Failed to retrieve upload status" }, { status: 500 });
    }
}
