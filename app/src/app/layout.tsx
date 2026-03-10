import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { AppProviders } from "@/lib/auth-client";
import "./globals.css";

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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Geist:wght@100..900&display=swap"
          rel="stylesheet"
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root {
                --font-geist: 'Geist', sans-serif;
                --font-be-vietnam: 'Be Vietnam Pro', sans-serif;
              }
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning className="antialiased">
        <AppProviders>
          <AppShell contentClassName="flex min-h-screen flex-1">{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
