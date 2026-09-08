import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',

  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },

    // ── Client Router Cache ────────────────────────────────────────────────
    // Since Next 15 the default staleTime for DYNAMIC routes is 0, so every
    // navigation to a dynamic page refetches its RSC payload from the server.
    // Every route in this app is dynamic, which is why page switching costs a
    // full round-trip every single time — including going back to a page you
    // were just on.
    //
    // `dynamic: 180` keeps a visited route's payload in the client cache for
    // three minutes: re-entering it is instant with zero network. `static: 300`
    // does the same for prefetched/static segments.
    //
    // The trade-off is staleness — a page re-entered within the window renders
    // from cache. That's fine here because the data-carrying widgets all run on
    // SWR, which revalidates on mount and on focus, so content still refreshes;
    // the shell just stops blocking on the server first.
    staleTimes: {
      dynamic: 180,
      static: 300,
    },

    // Inlines small CSS into the document instead of a separate <link>,
    // removing a render-blocking request on first paint.
    inlineCss: true,
  },

  images: {
    // Long cache for optimized images; they're content-hashed by path.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    return [
      {
        // Required for Sandpack's Next.js template (Nodebox uses SharedArrayBuffer)
        source: "/freecode/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
      {
        // Static files in /public. (Next already sets immutable caching on
        // /_next/static itself, so that path is deliberately not overridden.)
        source: "/:all*(svg|jpg|jpeg|png|webp|avif|gif|ico|woff|woff2|lottie)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

export default nextConfig;
