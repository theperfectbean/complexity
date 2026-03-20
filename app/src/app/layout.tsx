import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";
import { AppProviders } from "@/lib/auth-client";
import { GeistSans } from "geist/font/sans";
import { Be_Vietnam_Pro, Source_Serif_4, DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be-vietnam",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

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
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${beVietnamPro.variable} ${sourceSerif.variable} ${dmSans.variable}`}>
      <body className="bg-background font-sans text-foreground antialiased selection:bg-primary/10 selection:text-primary">
        <AppProviders nonce={nonce}>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
