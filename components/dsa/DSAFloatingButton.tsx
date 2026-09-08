"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function DSAFloatingButton() {
    const pathname = usePathname();

    // Only show on the DSA Track landing page
    if (pathname !== "/course/dsa") return null;

    return (
        <motion.div
            initial={{ scale: 0, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            whileHover={{ scale: 1.1, rotate: 5 }}
            whileTap={{ scale: 0.9, rotate: -5 }}
            transition={{
                type: "spring",
                stiffness: 400,
                damping: 25
            }}
            className="fixed bottom-24 right-4 md:bottom-10 md:right-10 z-[100]"
        >
            <Link href="/dsa" className="block relative group">
                {/* Glow Effect */}
                <div className="absolute inset-0 bg-primary blur-3xl opacity-30 group-hover:opacity-60 transition-opacity rounded-full scale-150" />

                <div className="relative w-24 h-24 md:w-32 md:h-32 flex items-center justify-center">
                    <Image
                        src="/dsa.png"
                        alt="DSA Reference"
                        fill
                        sizes="(max-width: 768px) 96px, 128px"
                        className="object-contain filter drop-shadow-xl"
                    />
                </div>

                {/* Tooltip-like label for Desktop */}
                <div className="hidden md:block absolute right-full mr-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div className="bg-black text-primary px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap shadow-xl border border-primary/20">
                        Explore DSA
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}
