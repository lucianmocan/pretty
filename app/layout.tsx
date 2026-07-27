import type { Metadata } from "next";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ViewportScaler } from "@/components/layout/viewport-scaler";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const luckiestGuy = localFont({
  src: "./fonts/luckiest-guy-latin.woff2",
  variable: "--font-luckiest-guy",
  weight: "400",
});

// Per-code-block font choices (see lib/presets.ts FONT_OPTIONS) -- loaded
// once here so every block can reference them via CSS variable, no matter
// which one is actually picked.
const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
});

const firaCode = localFont({
  src: "./fonts/fira-code-latin.woff2",
  variable: "--font-fira-code",
  weight: "300 700",
});

const ibmPlexMono = localFont({
  src: [
    {
      path: "./fonts/ibm-plex-mono-400-latin.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/ibm-plex-mono-500-latin.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://trypretty.dev"),
  title: {
    default: "Pretty — Nice code.",
    template: "%s · Pretty",
  },
  description:
    "A local-first design studio for turning editable code, text, images, and annotations into polished technical visuals.",
  openGraph: {
    title: "Pretty — Nice code.",
    description:
      "Turn editable code, context, and annotation into polished visual narratives.",
    url: "/",
    siteName: "Pretty",
    type: "website",
    images: [
      {
        url: "/og-pretty.png",
        width: 1200,
        height: 630,
        alt: "Pretty code composition studio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pretty — Nice code.",
    description:
      "Turn editable code, context, and annotation into polished visual narratives.",
    images: ["/og-pretty.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${luckiestGuy.variable} ${jetbrainsMono.variable} ${firaCode.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ViewportScaler />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
