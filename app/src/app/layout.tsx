import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AppShell } from "@/components/layout/AppShell";
import { AppProviders } from "@/lib/auth-client";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
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
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <AppProviders>
          <AppShell contentClassName="flex min-h-screen flex-1">{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
