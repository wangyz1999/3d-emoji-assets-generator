import { create } from "zustand";
import type { StyleConfig, ExportFormat, EmojiEntry, FileNaming } from "./types";
import { DEFAULT_COIN } from "./constants";

interface AppState {
  selectedEmoji: EmojiEntry | null;
  styleConfig: StyleConfig;
  exportFormat: ExportFormat;
  fileNaming: FileNaming;
  emojiList: EmojiEntry[];
  emojiListLoading: boolean;
  isExporting: boolean;
  selectedCategory: string;

  setSelectedEmoji: (emoji: EmojiEntry) => void;
  setStyleConfig: (config: StyleConfig) => void;
  updateStyleConfig: (partial: Partial<StyleConfig>) => void;
  setExportFormat: (format: ExportFormat) => void;
  setFileNaming: (naming: FileNaming) => void;
  setEmojiList: (list: EmojiEntry[]) => void;
  setEmojiListLoading: (loading: boolean) => void;
  setIsExporting: (exporting: boolean) => void;
  setSelectedCategory: (category: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedEmoji: null,
  styleConfig: DEFAULT_COIN,
  exportFormat: "glb",
  fileNaming: "unicode",
  emojiList: [],
  emojiListLoading: true,
  isExporting: false,
  selectedCategory: "",

  setSelectedEmoji: (emoji) => set({ selectedEmoji: emoji }),
  setStyleConfig: (config) => set({ styleConfig: config }),
  updateStyleConfig: (partial) =>
    set((state) => ({
      styleConfig: { ...state.styleConfig, ...partial } as StyleConfig,
    })),
  setExportFormat: (format) => set({ exportFormat: format }),
  setFileNaming: (naming) => set({ fileNaming: naming }),
  setEmojiList: (list) => set({ emojiList: list }),
  setEmojiListLoading: (loading) => set({ emojiListLoading: loading }),
  setIsExporting: (exporting) => set({ isExporting: exporting }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
}));
