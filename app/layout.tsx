import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import clsx from "clsx";

import { ToastProvider } from "@/components/ui/ToastProvider";
import { KeyboardInsets } from "@/components/providers/KeyboardInsets";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL("https://skloop.online"),
  title: {
    default: "Skloop | Trade Skills & Level Up",
    template: "%s | Skloop"
  },
  description: "The Habit Engineering Platform for technical mastery. Trade skills, conquer roadmaps, and level up your engineering elite journey.",
  keywords: ["skloop", "skill trading", "habit engineering", "learning roadmap", "coding practice", "technical mastery"],
  authors: [{ name: "Skloop Team" }],
  creator: "Skloop",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://skloop.online",
    siteName: "Skloop",
    title: "Skloop | Trade Skills & Level Up",
    description: "Conquer technical mastery through gamified roadmaps and visceral UI.",
    images: [
      {
        url: "/image.png", // Using existing image.png as OG image
        width: 1200,
        height: 630,
        alt: "Skloop - Habit Engineering Platform"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Skloop | Trade Skills & Level Up",
    description: "Conquer technical mastery through gamified roadmaps and visceral UI.",
    images: ["/image.png"],
    creator: "@skloop_online"
  },
  icons: {
    icon: "/skloop.ico",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    }
  }
};

/**
 * Next's default viewport tag omits `interactive-widget`, which leaves Chrome
 * on its default of `resizes-visual`: the software keyboard shrinks only the
 * visual viewport, so `100dvh` still measures a viewport the keyboard is
 * covering half of. `resizes-content` makes the layout viewport shrink too, so
 * full-height screens size themselves to the space above the keyboard with no
 * JS at all. Safari does not implement it yet; KeyboardInsets covers iOS.
 *
 * There is deliberately no `maximumScale` or `userScalable: false` here. Those
 * are the usual shortcut for stopping focus-zoom, but they disable pinch-zoom
 * for everyone permanently (WCAG 1.4.4). The font-size floor in globals.css
 * removes the browser's reason to zoom instead.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "name": "Skloop",
      "url": "https://skloop.online",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://skloop.online/search?q={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@type": "SiteNavigationElement",
      "name": [
        "Login",
        "Sign Up",
        "Practice Arena",
        "Learning Roadmap",
        "Dashboard",
        "Manifesto"
      ],
      "url": [
        "https://skloop.online/login",
        "https://skloop.online/signup",
        "https://skloop.online/practice",
        "https://skloop.online/roadmap",
        "https://skloop.online/dashboard",
        "https://skloop.online/manifesto"
      ]
    }
  ]
};

import { LoadingProvider } from "@/components/LoadingProvider";
import { Suspense } from "react";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={clsx(
          inter.variable,
          "bg-background text-foreground font-sans min-h-screen bg-dot-pattern",
          "pb-[env(safe-area-inset-bottom)]"
        )}
      >
        <KeyboardInsets />
        <ToastProvider>
          <Suspense fallback={null}>
            <LoadingProvider>
              {children}
            </LoadingProvider>
          </Suspense>
        </ToastProvider>
      </body>
    </html>
  );
}
