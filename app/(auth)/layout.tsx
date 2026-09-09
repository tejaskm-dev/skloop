import { AuthVisuals } from "@/components/auth/AuthVisuals";

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        // Full height, pure white background for that "Lab" feel
        <div className="h-[var(--app-h)] w-full flex bg-white text-zinc-900 overflow-hidden font-sans">
            {/* Left Panel: The Simulation Viewport */}
            <div className="hidden lg:block w-1/2 relative h-full bg-zinc-50">
                <AuthVisuals />
            </div>

            {/* Right Panel: The Control Interface */}
            <div className="w-full lg:w-1/2 h-full flex flex-col relative bg-white">
                {/* Mobile Decor */}
                <div className="absolute top-0 w-full h-2 bg-gradient-to-r from-lime-400 via-lime-300 to-lime-400 lg:hidden" />

                {/* Content Wrapper */}
                <div className="flex-1 flex items-center justify-center p-4 sm:p-8 relative z-10 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
}
