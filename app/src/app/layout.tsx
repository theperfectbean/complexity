import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Complexity",
  description: "Self-hosted Agentic answer engine",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${dmSans.variable} ${beVietnamPro.variable} ${sourceSerif.variable}`}
    >
      <body suppressHydrationWarning className="antialiased">
        <AppProviders nonce={nonce}>
          <AppShell contentClassName="flex min-h-screen flex-1">{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
