"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Palette } from "lucide-react";

const COLOR_THEMES = [
  { id: "default", name: "Default", color: "oklch(0.4341 0.0392 41.99)" },
  { id: "midnight", name: "Midnight", color: "oklch(0.5857 0.16 260.66)" },
  { id: "forest", name: "Forest", color: "oklch(0.5225 0.12 154.55)" },
  { id: "slate", name: "Slate", color: "oklch(0.4431 0.02 240)" },
  { id: "pink", name: "Pink", color: "oklch(0.6568 0.196 328.62)" },
  { id: "purple", name: "Purple", color: "oklch(0.5408 0.22 284.12)" },
];

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Parse current theme string (e.g., "midnight" or "midnight-dark")
  const currentBaseTheme = COLOR_THEMES.find(t => theme?.includes(t.id))?.id || "default";
  const isDark = theme?.includes("dark") || (theme === "system" && resolvedTheme === "dark");

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleBaseThemeChange = (newBase: string) => {
    const mode = isDark ? "dark" : "light";
    if (newBase === "default") {
      setTheme(mode);
    } else {
      setTheme(`${newBase}-${mode}`);
    }
  };

  const toggleMode = () => {
    const newMode = isDark ? "light" : "dark";
    if (currentBaseTheme === "default") {
      setTheme(newMode);
    } else {
      setTheme(`${currentBaseTheme}-${newMode}`);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Appearance</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setTheme("system")}
            className={`rounded-md p-1.5 transition-colors ${
              theme === "system" ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            }`}
            title="System"
          >
            <Monitor className="h-4 w-4" />
          </button>
          <button
            onClick={toggleMode}
            className={`rounded-md p-1.5 transition-colors ${
              !isDark && theme !== "system" ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            }`}
            title="Light Mode"
          >
            <Sun className="h-4 w-4" />
          </button>
          <button
            onClick={toggleMode}
            className={`rounded-md p-1.5 transition-colors ${
              isDark && theme !== "system" ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            }`}
            title="Dark Mode"
          >
            <Moon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {COLOR_THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => handleBaseThemeChange(t.id)}
            className={`flex flex-col items-center gap-2 rounded-lg border p-2 text-center text-xs transition-all hover:border-primary/50 ${
              currentBaseTheme === t.id
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "bg-card border-border"
            }`}
          >
            <div
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: t.color }}
            />
            <span className="truncate w-full">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
