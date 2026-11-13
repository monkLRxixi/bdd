import { create } from "zustand";

import { api } from "@/lib/api";
import type { Settings } from "@/lib/types";

const fallback: Settings = {
  downloadDir: "",
  qn: 127,
  codec: "avc1",
  audioId: 30280,
  saveCover: true,
  ffmpegPath: "ffmpeg",
  notifyOnComplete: true,
  concurrency: 2,
};

interface SettingsStore {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<Settings>;
  save: (settings: Settings) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>()((set) => ({
  settings: fallback,
  loaded: false,

  load: async () => {
    try {
      const settings = await api.getSettings();
      set({ settings, loaded: true });
      return settings;
    } catch {
      set({ loaded: true });
      return fallback;
    }
  },

  save: async (settings) => {
    await api.saveSettings(settings);
    set({ settings, loaded: true });
  },
}));

type Theme = "light" | "dark";

function initialTheme(): Theme {
  const stored = localStorage.getItem("bilidown-theme");
  if (stored === "light" || stored === "dark") return stored;
  return "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("bilidown-theme", theme);
}

interface UiStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const startTheme = initialTheme();
applyTheme(startTheme);

export const useUiStore = create<UiStore>()((set) => ({
  theme: startTheme,
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const theme = state.theme === "light" ? "dark" : "light";
      applyTheme(theme);
      return { theme };
    }),
}));
