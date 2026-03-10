import type { Metadata } from "next";
import { Be_Vietnam_Pro, Geist } from "next/font/google";

import { AppShell } from "@/components/layout/AppShell";
import { AppProviders } from "@/lib/auth-client";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Complexity",
  description: "Self-hosted Perplexity-style answer engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${geistSans.variable} ${beVietnam.variable} antialiased`}>
        <AppProviders>
          <AppShell contentClassName="flex min-h-screen flex-1">{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
