"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Challenge verification logging.
 *
 * This was an unauthenticated server action that wrote caller-supplied strings
 * straight to stdout — anyone could flood the logs or forge log lines by
 * embedding newlines. It's a development aid, so it now requires a session, is
 * a no-op in production, caps volume, and strips control characters.
 */
export async function logValidationProgress(logs: string[]) {
    if (process.env.NODE_ENV === "production") return;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (!Array.isArray(logs)) return;

    // Strip C0/C1 control characters — newlines are what make log forging work.
    const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;
    const sanitize = (s: unknown) => String(s).replace(CONTROL_CHARS, " ").slice(0, 300);

    console.log("\n==================================================");
    console.log(`[NODE LOG] CHALLENGE VERIFICATION - user ${user.id}`);
    console.log("==================================================");

    logs.slice(0, 50).forEach((log) => {
        console.log(`[VERIFY] ${sanitize(log)}`);
    });

    console.log("==================================================\n");
}
