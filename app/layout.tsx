import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://emoji3d.org";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "3D Emoji Generator — Free 3D Emoji Assets",
    template: "%s | 3D Emoji Generator",
  },
  description:
    "Free online 3D emoji generator. Create customizable 3D emoji assets from Twemoji SVGs with coin, bubble, and more shape presets. Export as GLB, OBJ, STL, or USDZ for games, AR, Blender, Unity, and 3D projects.",
  keywords: [
    "3D emoji",
    "emoji 3D",
    "3D emoji generator",
    "emoji assets",
    "GLB emoji",
    "USDZ emoji",
    "AR emoji",
    "Twemoji 3D",
    "3D emoji download",
    "free 3D emoji",
    "emoji for Unity",
    "emoji for Blender",
    "emoji OBJ",
    "emoji STL",
    "3D sticker",
  ],
  authors: [{ name: "3D Emoji Generator", url: siteUrl }],
  creator: "3D Emoji Generator",
  publisher: "3D Emoji Generator",
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "3D Emoji Generator",
    title: "3D Emoji Generator — Free 3D Emoji Assets",
    description:
      "Create and export customizable 3D emoji assets (GLB, OBJ, STL, USDZ) for games, AR, and 3D projects. Free, browser-based, no sign-up required.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "3D Emoji Generator — Free 3D Emoji Assets",
    description:
      "Create and export customizable 3D emoji assets (GLB, OBJ, STL, USDZ) for games, AR, and 3D projects. Free, browser-based, no sign-up required.",
    creator: "@wangyz1999",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
    other: [{ rel: "manifest", url: "/site.webmanifest" }],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full bg-zinc-950 text-white">{children}</body>
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-0NPV14H60S"
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-0NPV14H60S');
        `}
      </Script>
    </html>
  );
}
