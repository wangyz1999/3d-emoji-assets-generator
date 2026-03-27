import { create } from "zustand";
import type { StyleConfig, ExportFormat, EmojiEntry } from "./types";
import { DEFAULT_COIN } from "./constants";

interface AppState {
  selectedEmoji: EmojiEntry | null;
  styleConfig: StyleConfig;
  exportFormat: ExportFormat;
  emojiList: EmojiEntry[];
  emojiListLoading: boolean;
  isExporting: boolean;

  setSelectedEmoji: (emoji: EmojiEntry) => void;
  setStyleConfig: (config: StyleConfig) => void;
  updateStyleConfig: (partial: Partial<StyleConfig>) => void;
  setExportFormat: (format: ExportFormat) => void;
  setEmojiList: (list: EmojiEntry[]) => void;
  setEmojiListLoading: (loading: boolean) => void;
  setIsExporting: (exporting: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedEmoji: null,
  styleConfig: DEFAULT_COIN,
  exportFormat: "glb",
  emojiList: [],
  emojiListLoading: true,
  isExporting: false,

  setSelectedEmoji: (emoji) => set({ selectedEmoji: emoji }),
  setStyleConfig: (config) => set({ styleConfig: config }),
  updateStyleConfig: (partial) =>
    set((state) => ({
      styleConfig: { ...state.styleConfig, ...partial } as StyleConfig,
    })),
  setExportFormat: (format) => set({ exportFormat: format }),
  setEmojiList: (list) => set({ emojiList: list }),
  setEmojiListLoading: (loading) => set({ emojiListLoading: loading }),
  setIsExporting: (exporting) => set({ isExporting: exporting }),
}));
