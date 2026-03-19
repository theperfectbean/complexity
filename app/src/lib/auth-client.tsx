"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { ReactNode } from "react";
import { Toaster } from "sonner";

import { ThemeSync } from "@/components/shared/ThemeSync";

export function AppProviders({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <SessionProvider basePath="/api/auth">
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
        <ThemeSync />
        {children}
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </SessionProvider>
  );
}
