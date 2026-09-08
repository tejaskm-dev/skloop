import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Auth + routing proxy (Next 16's renamed middleware).
 *
 * PERFORMANCE NOTE — this runs on EVERY request that matches the config below,
 * including the RSC payload fetch behind every client-side navigation. It used
 * to call `supabase.auth.getUser()`, which is not a local token decode: it makes
 * a network round-trip to the Supabase Auth server. That put one full
 * Auth round-trip on the critical path of every single page switch, and made
 * Auth availability a hard dependency for rendering any page.
 *
 * `getClaims()` verifies the JWT signature locally against the project's JWKS
 * (fetched once and cached) when the project uses asymmetric keys, falling back
 * to a network verification only for legacy HS256 projects. It is a safe
 * drop-in: strictly faster or equal, and never less strict, because it still
 * verifies the signature rather than trusting the cookie the way getSession()
 * would.
 *
 * Two further cuts below:
 *   - Requests carrying no Supabase auth cookie skip verification entirely —
 *     an absent cookie already tells us the caller is anonymous.
 *   - Static assets and Next's internal payload routes are excluded by matcher.
 */

/** Supabase stores its session in cookies prefixed `sb-<ref>-auth-token`. */
function hasAuthCookie(request: NextRequest): boolean {
    for (const cookie of request.cookies.getAll()) {
        if (cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')) {
            return true
        }
    }
    return false
}

export async function proxy(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    request.cookies.set({ name, value, ...options })
                    response = NextResponse.next({
                        request: { headers: request.headers },
                    })
                    response.cookies.set({ name, value, ...options })
                },
                remove(name: string, options: CookieOptions) {
                    request.cookies.set({ name, value: '', ...options })
                    response = NextResponse.next({
                        request: { headers: request.headers },
                    })
                    response.cookies.set({ name, value: '', ...options })
                },
            },
        }
    )

    // Skip verification entirely when there is no session cookie to verify.
    let userId: string | null = null

    if (hasAuthCookie(request)) {
        try {
            const { data } = await supabase.auth.getClaims()
            userId = data?.claims?.sub ?? null
        } catch {
            // Treat a verification failure as "not signed in" rather than 500ing
            // the whole request; the protected-path redirect below handles it.
            userId = null
        }
    }

    const isAuthed = userId !== null

    // Protect the AI routes (they spend money per call).
    const protectedApiRoutes = ['/api/loopy', '/api/loopy-chat', '/api/generate-roadmap']
    if (protectedApiRoutes.some(route => request.nextUrl.pathname.startsWith(route))) {
        if (!isAuthed) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
    }

    const url = request.nextUrl.clone()
    const hasSeenOnboarding = request.cookies.get('has_seen_onboarding')?.value === 'true'

    const isProtectedPath = request.nextUrl.pathname.match(/^\/(dashboard|profile|settings|roadmap|marketplace|mentorship|workspace|messages|notifications|stats|peer|practice|course|lesson|loopy|calendar|contacts|session)/);
    const isAuthPath = request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup');
    const isRootPath = request.nextUrl.pathname === '/';

    // Logic 1: Auth Guard for Protected Paths
    if (isProtectedPath && !isAuthed) {
        url.pathname = hasSeenOnboarding ? '/login' : '/'
        return NextResponse.redirect(url)
    }

    // Logic 2: Redirect authenticated users away from Public/Auth paths
    if (isAuthed && (isAuthPath || isRootPath)) {
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
    }

    // Logic 3: Onboarding "One-Time" Visibility for unauthenticated users
    if (!isAuthed && isRootPath && hasSeenOnboarding) {
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Excluded from the proxy:
         *  - _next/static, _next/image  : build assets, never need auth
         *  - favicon / manifest / icons : static
         *  - api/auth, auth             : Supabase's own auth routes
         *  - manifesto                  : always public
         *  - any request for a file with an extension (images, fonts, media)
         *
         * /api/loopy* is deliberately NOT excluded — those routes are gated above.
         */
        '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|robots\\.txt|sitemap\\.xml|api/auth|manifesto|auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|mp4|webm|lottie)$).*)',
    ],
}
