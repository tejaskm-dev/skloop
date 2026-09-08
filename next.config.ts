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
    // Long cache for optimized images.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    formats: ['image/avif', 'image/webp'],

    // Device/image widths the optimizer will generate. Trimmed to the sizes this
    // app actually renders — avatars (32-96px) and cards — so fewer variants get
    // generated and cached.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],

    // ── Remote hosts ───────────────────────────────────────────────────────
    // Without these, next/image cannot touch any remotely-hosted image, which
    // is why avatars and uploads were all raw <img> tags served at full
    // original resolution — a multi-megabyte upload rendered into a 40px
    // circle, on every leaderboard row and chat message.
    //
    // Vercel's optimizer does the resizing and format conversion, so this works
    // regardless of the Supabase plan (Supabase's own image transformation is a
    // paid add-on; this route doesn't need it).
    remotePatterns: [
      // Supabase Storage — avatars, banners, chat attachments.
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
      // GIF pickers used in chat.
      { protocol: 'https', hostname: 'media.giphy.com' },
      { protocol: 'https', hostname: 'media*.giphy.com' },
      { protocol: 'https', hostname: 'media.tenor.com' },
      { protocol: 'https', hostname: 'c.tenor.com' },
      // Content imagery and fallbacks.
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'ui-avatars.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'image.mux.com' },
    ],
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
