import type { Metadata } from "next";
import { Inter, Merriweather } from "next/font/google";
import { getThemeCssVars } from "@/lib/tokens";
import { AuthProvider } from "@/components/providers/AuthProvider";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-merriweather",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EOS — Exim Operation System",
  description: "Phase 1 Import Operation",
  manifest: "/faveicon/site.webmanifest",
  icons: {
    icon: [
      { url: "/faveicon/favicon.ico", sizes: "any" },
      { url: "/faveicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/faveicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/faveicon/apple-touch-icon.png",
    other: [
      {
        rel: "android-chrome-192x192",
        url: "/faveicon/android-chrome-192x192.png",
      },
      {
        rel: "android-chrome-512x512",
        url: "/faveicon/android-chrome-512x512.png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const themeVars = getThemeCssVars();
  return (
    <html lang="en" className={`${inter.variable} ${merriweather.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeVars }} />
      </head>
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
