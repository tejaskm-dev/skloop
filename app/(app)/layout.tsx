import { AppShell } from "@/components/shell/AppShell";
import { UserProvider } from "@/context/UserContext";
import { SWRProvider } from "@/components/providers/SWRProvider";
import { AppPreloader } from "@/components/providers/AppPreloader";
import { getCachedUser, getCachedProfile } from "@/utils/supabase/auth";
import { redirect } from "next/navigation";

// NOTE: no `export const dynamic = "force-dynamic"` here.
//
// It was redundant — this layout reads cookies (via the Supabase server client),
// and cookies() already opts the segment into dynamic rendering. What
// force-dynamic added was harm: it forced EVERY route beneath (app) to be fully
// dynamic, which disabled static shell generation, made <Link> prefetching
// nearly useless (a prefetch could only ever fetch loading.tsx), and guaranteed
// a server round-trip on every navigation.

export default async function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Memoised per request — proxy.ts already validated the session, and server
    // actions invoked during this render reuse the same round-trip rather than
    // each making their own call to Supabase Auth.
    const user = await getCachedUser();

    if (!user) {
        redirect("/");
    }

    // Fetched on the server to prevent a flash of empty state.
    const profile = await getCachedProfile();

    return (
        <UserProvider initialUser={user} initialProfile={profile}>
            <SWRProvider>
                <AppPreloader />
                <AppShell>
                    {children}
                </AppShell>
            </SWRProvider>
        </UserProvider>
    );
}
