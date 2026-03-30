import { create } from "zustand";
import type { StyleConfig, ExportFormat, EmojiEntry, FileNaming } from "./types";
import { DEFAULT_FLAT } from "./constants";

interface AppState {
  selectedEmoji: EmojiEntry | null;
  styleConfig: StyleConfig;
  exportFormat: ExportFormat;
  fileNaming: FileNaming;
  mergeMaterials: boolean;
  emojiList: EmojiEntry[];
  emojiListLoading: boolean;
  isExporting: boolean;
  selectedCategory: string;
  emojiColors: string[];
  colorOverrides: Record<number, string>;

  setSelectedEmoji: (emoji: EmojiEntry) => void;
  setStyleConfig: (config: StyleConfig) => void;
  updateStyleConfig: (partial: Partial<StyleConfig>) => void;
  setExportFormat: (format: ExportFormat) => void;
  setFileNaming: (naming: FileNaming) => void;
  setMergeMaterials: (merge: boolean) => void;
  setEmojiList: (list: EmojiEntry[]) => void;
  setEmojiListLoading: (loading: boolean) => void;
  setIsExporting: (exporting: boolean) => void;
  setSelectedCategory: (category: string) => void;
  setEmojiColors: (colors: string[]) => void;
  setColorOverride: (index: number, color: string) => void;
  resetColorOverrides: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedEmoji: null,
  styleConfig: DEFAULT_FLAT,
  exportFormat: "glb",
  fileNaming: "unicode",
  mergeMaterials: true,
  emojiList: [],
  emojiListLoading: true,
  isExporting: false,
  selectedCategory: "",
  emojiColors: [],
  colorOverrides: {},

  setSelectedEmoji: (emoji) => set({ selectedEmoji: emoji, colorOverrides: {} }),
  setStyleConfig: (config) => set({ styleConfig: config }),
  updateStyleConfig: (partial) =>
    set((state) => ({
      styleConfig: { ...state.styleConfig, ...partial } as StyleConfig,
    })),
  setExportFormat: (format) => set({ exportFormat: format }),
  setFileNaming: (naming) => set({ fileNaming: naming }),
  setMergeMaterials: (merge) => set({ mergeMaterials: merge }),
  setEmojiList: (list) => set({ emojiList: list }),
  setEmojiListLoading: (loading) => set({ emojiListLoading: loading }),
  setIsExporting: (exporting) => set({ isExporting: exporting }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setEmojiColors: (colors) => set({ emojiColors: colors }),
  setColorOverride: (index, color) =>
    set((state) => ({
      colorOverrides: { ...state.colorOverrides, [index]: color },
    })),
  resetColorOverrides: () => set({ colorOverrides: {} }),
}));
