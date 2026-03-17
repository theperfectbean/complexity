"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { ReactNode } from "react";
import { Toaster } from "sonner";

export function AppProviders({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <SessionProvider basePath="/api/auth">
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
        {children}
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </SessionProvider>
  );
}
