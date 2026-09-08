import { NextResponse } from "next/server";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createClient } from "@/utils/supabase/server";

/**
 * Link-preview fetcher.
 *
 * This endpoint takes a caller-supplied URL and fetches it from the server, so
 * without guards it is a textbook SSRF: `?url=http://169.254.169.254/...`
 * reaches cloud metadata, `http://localhost:*` reaches internal services, and
 * the response body (title/description) comes straight back to the caller.
 *
 * Guards applied here:
 *   1. Requires a session — it is a logged-in feature, not a public proxy.
 *   2. http/https only.
 *   3. Every resolved IP is checked against private/loopback/link-local ranges
 *      BEFORE the request is made.
 *   4. Redirects are followed manually, re-validating each hop, so a public
 *      host cannot bounce us to an internal one.
 *   5. Response size and time are capped.
 */

const MAX_REDIRECTS = 3;
const MAX_BYTES = 512 * 1024; // 512 KB of HTML is plenty for meta tags
const TIMEOUT_MS = 5000;

/** True for addresses that must never be reachable through this endpoint. */
function isBlockedIp(ip: string): boolean {
    const v = isIP(ip);

    if (v === 4) {
        const p = ip.split(".").map(Number);
        if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
        const [a, b] = p;
        if (a === 0) return true;                          // 0.0.0.0/8
        if (a === 10) return true;                         // private
        if (a === 127) return true;                        // loopback
        if (a === 169 && b === 254) return true;           // link-local / cloud metadata
        if (a === 172 && b >= 16 && b <= 31) return true;  // private
        if (a === 192 && b === 168) return true;           // private
        if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
        if (a === 192 && b === 0) return true;             // IETF protocol assignments
        if (a >= 224) return true;                         // multicast + reserved
        return false;
    }

    if (v === 6) {
        const lower = ip.toLowerCase();
        if (lower === "::" || lower === "::1") return true;
        if (lower.startsWith("fe80")) return true;                 // link-local
        if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
        if (lower.startsWith("ff")) return true;                   // multicast
        // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4 address.
        const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped) return isBlockedIp(mapped[1]);
        return false;
    }

    return true; // not a recognisable IP literal
}

/** Parses, scheme-checks, and DNS-resolves a URL, rejecting internal targets. */
async function assertSafeUrl(raw: string): Promise<URL> {
    const parsed = new URL(raw);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Unsupported scheme");
    }

    const host = parsed.hostname.replace(/^\[|\]$/g, "");

    // A literal IP skips DNS entirely.
    if (isIP(host)) {
        if (isBlockedIp(host)) throw new Error("Blocked address");
        return parsed;
    }

    const records = await dnsLookup(host, { all: true });
    if (records.length === 0) throw new Error("Could not resolve host");
    for (const r of records) {
        if (isBlockedIp(r.address)) throw new Error("Blocked address");
    }

    return parsed;
}

/** Reads at most MAX_BYTES from the response body. */
async function readCapped(res: Response): Promise<string> {
    const reader = res.body?.getReader();
    if (!reader) return "";

    const chunks: Uint8Array[] = [];
    let total = 0;

    while (total < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            total += value.length;
        }
    }
    reader.cancel().catch(() => {});

    const buf = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        buf.set(c.subarray(0, Math.min(c.length, total - offset)), offset);
        offset += c.length;
        if (offset >= total) break;
    }
    return new TextDecoder("utf-8").decode(buf);
}

export async function GET(req: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");

    if (!url) {
        return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let domain: string;
    try {
        domain = new URL(url).hostname;
    } catch {
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const fallback = { domain, title: url, description: null, image: null, siteName: domain };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        let target = await assertSafeUrl(url);
        let res: Response | null = null;

        // Follow redirects by hand so each hop is re-validated.
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            res = await fetch(target, {
                signal: controller.signal,
                redirect: "manual",
                headers: {
                    "User-Agent": "SkloopBot/1.0 (link preview; +https://skloop.online)",
                    Accept: "text/html,application/xhtml+xml",
                },
            });

            if (res.status >= 300 && res.status < 400) {
                const location = res.headers.get("location");
                if (!location) break;
                target = await assertSafeUrl(new URL(location, target).toString());
                continue;
            }
            break;
        }

        if (!res || !res.ok) return NextResponse.json(fallback);

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("html")) return NextResponse.json(fallback);

        const html = await readCapped(res);

        // Bounded character classes — the previous [^>]* patterns could backtrack
        // badly on hostile markup.
        const og = (property: string): string | null => {
            const a = html.match(
                new RegExp(`<meta[^>]{0,400}property=["']og:${property}["'][^>]{0,400}content=["']([^"']{0,600})["']`, "i")
            );
            const b = html.match(
                new RegExp(`<meta[^>]{0,400}content=["']([^"']{0,600})["'][^>]{0,400}property=["']og:${property}["']`, "i")
            );
            return a?.[1] ?? b?.[1] ?? null;
        };

        const title = og("title") || html.match(/<title>([\s\S]{0,300}?)<\/title>/i)?.[1] || url;
        const description =
            og("description") ||
            html.match(/<meta[^>]{0,400}name=["']description["'][^>]{0,400}content=["']([^"']{0,600})["']/i)?.[1] ||
            null;
        const image = og("image") || null;
        const siteName = og("site_name") || domain;

        return NextResponse.json({ domain, title, description, image, siteName });
    } catch {
        return NextResponse.json(fallback);
    } finally {
        clearTimeout(timeout);
    }
}
