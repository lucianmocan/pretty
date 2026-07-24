import type { Metadata } from "next";
import {
  Fira_Code,
  Geist,
  Geist_Mono,
  IBM_Plex_Mono,
  JetBrains_Mono,
  Luckiest_Guy,
} from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const luckiestGuy = Luckiest_Guy({
  variable: "--font-luckiest-guy",
  subsets: ["latin"],
  weight: "400",
});

// Per-code-block font choices (see lib/presets.ts FONT_OPTIONS) -- loaded
// once here so every block can reference them via CSS variable, no matter
// which one is actually picked.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://scripture-eight.vercel.app"),
  title: {
    default: "Scripture — Design code that explains itself",
    template: "%s · Scripture",
  },
  description:
    "A local-first design studio for turning editable code, text, images, and annotations into polished technical visuals.",
  openGraph: {
    title: "Scripture — Design code that explains itself",
    description:
      "Turn editable code, context, and annotation into polished visual narratives.",
    url: "/",
    siteName: "Scripture",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Scripture code composition studio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Scripture — Design code that explains itself",
    description:
      "Turn editable code, context, and annotation into polished visual narratives.",
    images: ["/og.png"],
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
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
