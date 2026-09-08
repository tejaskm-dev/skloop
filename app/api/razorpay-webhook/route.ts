import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import crypto from "crypto";

// NOTE: payments are not wired up yet (both create-order routes return 503), so
// this handler should never fire in production today. The fixes below are the
// safety-critical ones; before going live you still need idempotency keyed on
// the Razorpay payment id — Razorpay retries, and increment_profile_stats is
// additive, so a redelivery would grant coins twice.

export async function POST(req: NextRequest) {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
    }

    const body = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    // Verify HMAC signature
    const expected = crypto
        .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
        .update(body)
        .digest("hex");

    // Constant-time comparison: a plain !== leaks how much of the signature
    // matched via response timing.
    const sigBuf = Buffer.from(signature ?? "", "utf8");
    const expBuf = Buffer.from(expected, "utf8");

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    }

    const event = JSON.parse(body);

    // A webhook carries no user session, so the cookie-based client here ran as
    // `anon` — with RLS on, every write below silently no-opped and a paying
    // user never received their plan. Fulfilment needs the service role.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceRoleKey || !supabaseUrl) {
        console.error("[razorpay-webhook] SUPABASE_SERVICE_ROLE_KEY is not set; cannot fulfil.");
        return NextResponse.json({ error: "Fulfilment not configured." }, { status: 503 });
    }

    const supabase = createAdminClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const entity = event?.payload?.payment?.entity;
    const notes  = entity?.notes || {};

    switch (event.event) {
        case "payment.captured": {
            const userId = notes.user_id;
            const type   = notes.type;
            if (!userId) break;

            if (type === "subscription") {
                const plan    = notes.plan    as string;
                const billing = notes.billing as string;

                const expiresAt = new Date();
                if (billing === "yearly") {
                    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
                } else {
                    expiresAt.setMonth(expiresAt.getMonth() + 1);
                }

                const { error: planError } = await supabase
                    .from("profiles")
                    .update({ plan, plan_expires_at: expiresAt.toISOString() })
                    .eq("id", userId);

                if (planError) {
                    console.error("[razorpay-webhook] plan update failed:", planError.message);
                    // Non-2xx tells Razorpay to retry rather than silently dropping it.
                    return NextResponse.json({ error: "Fulfilment failed" }, { status: 500 });
                }
            }

            if (type === "coin_purchase") {
                const coins = parseInt(notes.coins || "0", 10);
                if (coins > 0) {
                    const { error: coinError } = await supabase.rpc("increment_profile_stats", {
                        x_user_id:   userId,
                        xp_amount:   0,
                        coins_amount: coins,
                    });

                    if (coinError) {
                        console.error("[razorpay-webhook] coin grant failed:", coinError.message);
                        return NextResponse.json({ error: "Fulfilment failed" }, { status: 500 });
                    }
                }
            }
            break;
        }
    }

    return NextResponse.json({ received: true });
}
