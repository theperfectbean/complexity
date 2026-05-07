import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";
import { AppProviders } from "@/lib/auth-client";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Complexity",
  description: "Self-hosted Agentic answer engine",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Complexity",
  },
  formatDetection: {
    telephone: false,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning className={GeistSans.variable}>
      <body className="bg-background font-sans text-foreground antialiased selection:bg-primary/10 selection:text-primary">
        <AppProviders nonce={nonce}>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
