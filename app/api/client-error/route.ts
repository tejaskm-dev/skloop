import { NextResponse } from "next/server";

/**
 * Sink for client-side error reports.
 *
 * Logs structured errors server-side so they land in Vercel's log stream — the
 * point being that this works today, with no account to create and no SDK in
 * the client bundle. If SENTRY_DSN is configured it also forwards there, so
 * moving to a real error tracker is a change here rather than at every call
 * site.
 *
 * Unauthenticated on purpose: errors in the auth flow itself, or on public
 * pages, are exactly the ones worth hearing about. That makes it a spam target,
 * so the payload is size-capped, fields are truncated, and nothing is written to
 * the database.
 */

const MAX_BODY_BYTES = 16 * 1024;

interface ErrorReport {
    name?: string;
    message?: string;
    stack?: string;
    digest?: string;
    url?: string;
    userAgent?: string;
    context?: Record<string, unknown>;
    at?: string;
}

function clamp(value: unknown, max: number): string {
    return String(value ?? "").slice(0, max);
}

export async function POST(req: Request) {
    try {
        const raw = await req.text();
        if (raw.length > MAX_BODY_BYTES) {
            return NextResponse.json({ ok: true }); // drop quietly
        }

        let report: ErrorReport;
        try {
            report = JSON.parse(raw);
        } catch {
            return NextResponse.json({ ok: true });
        }

        const entry = {
            level: "error",
            source: "client",
            name: clamp(report.name, 100),
            message: clamp(report.message, 500),
            digest: clamp(report.digest, 100) || undefined,
            path: clamp(report.url, 200),
            boundary: clamp(report.context?.boundary, 60) || undefined,
            userAgent: clamp(report.userAgent, 200),
            stack: clamp(report.stack, 4000),
            at: clamp(report.at, 40) || new Date().toISOString(),
        };

        // Single-line JSON so log search can filter on it.
        console.error("[client-error]", JSON.stringify(entry));

        // Optional forward. No SDK: one fetch to the Sentry store endpoint keeps
        // this dependency-free until you decide you want the full integration.
        const dsn = process.env.SENTRY_DSN;
        if (dsn) {
            void forwardToSentry(dsn, entry).catch(() => {});
        }

        return NextResponse.json({ ok: true });
    } catch {
        // Never let the error sink become an error source.
        return NextResponse.json({ ok: true });
    }
}

/**
 * Minimal Sentry Store API call. Parses the DSN rather than requiring the SDK.
 * DSN format: https://<key>@<host>/<projectId>
 */
async function forwardToSentry(dsn: string, entry: Record<string, unknown>) {
    const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
    if (!match) return;

    const [, key, host, projectId] = match;
    const url = `https://${host}/api/${projectId}/store/`;

    await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}, sentry_client=skloop/1.0`,
        },
        body: JSON.stringify({
            platform: "javascript",
            level: "error",
            timestamp: entry.at,
            logger: "client",
            message: { formatted: `${entry.name}: ${entry.message}` },
            extra: entry,
        }),
    });
}
