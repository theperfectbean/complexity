import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const SettingsSchema = z.object({
  model: z.string().default("gpt-4o"),
  temperature: z.number().min(0).max(2).default(0.7),
  localMode: z.boolean().default(false),
  ollamaEndpoint: z.string().default("http://localhost:11434"),
});

export type Settings = z.infer<typeof SettingsSchema>;

interface SettingsState {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: SettingsSchema.parse({}),
      updateSetting: (key, value) => 
        set((state) => ({
          settings: { ...state.settings, [key]: value }
        })),
    }),
    {
      name: "complexity-settings",
    }
  )
);
