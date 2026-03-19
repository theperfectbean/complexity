"use client";

import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

/**
 * Syncs the user's saved theme from the DB on first authenticated load.
 * This ensures theme preference follows the user across devices.
 */
export function ThemeSync() {
  const { data: session, status } = useSession();
  const { setTheme } = useTheme();
  const synced = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user || synced.current) return;
    synced.current = true;

    fetch("/api/profile")
      .then(r => r.ok ? r.json() as Promise<{ theme?: string | null }> : null)
      .then(profile => {
        if (profile?.theme) {
          setTheme(profile.theme);
        }
      })
      .catch(() => undefined);
  }, [status, session, setTheme]);

  return null;
}
