"use client";

import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <label className="inline-flex w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-2xs">
      <span className="text-sm">Theme</span>
      <select
        aria-label="Theme"
        className="rounded-md border bg-background px-2 py-1 text-sm"
        value={theme ?? "system"}
        onChange={(event) => setTheme(event.target.value)}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
