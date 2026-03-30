"use client";

import { useState } from "react";
import * as THREE from "three";
import { useAppStore } from "@/lib/store";
import { exportModel } from "@/lib/three/exporters";
import { EXPORT_FORMATS } from "@/lib/constants";
import type { ExportFormat, FileNaming } from "@/lib/types";

const FILE_NAMING_OPTIONS: { id: FileNaming; label: string; example: string }[] = [
  { id: "unicode", label: "Unicode", example: "1f602" },
  { id: "shortname", label: "Shortname", example: "joy" },
];

function getExportFilename(
  emoji: { code: string; shortname: string },
  naming: FileNaming
): string {
  return naming === "shortname" ? emoji.shortname : emoji.code;
}

export default function ExportPanel() {
  const {
    selectedEmoji,
    exportFormat,
    setExportFormat,
    fileNaming,
    setFileNaming,
    mergeMaterials,
    setMergeMaterials,
    isExporting,
    setIsExporting,
  } = useAppStore();
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!selectedEmoji || isExporting) return;

    const modelRef = (
      window as unknown as Record<string, { current: THREE.Group | null }>
    ).__currentModel;
    if (!modelRef?.current) {
      setError("No model loaded yet");
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const filename = getExportFilename(selectedEmoji, fileNaming);
      await exportModel(modelRef.current, exportFormat, filename, {
        mergeMaterials,
      });
    } catch (err) {
      console.error("Export failed:", err);
      setError("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const previewFilename = selectedEmoji
    ? `${getExportFilename(selectedEmoji, fileNaming)}.${exportFormat}`
    : "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="flex gap-px rounded overflow-hidden bg-zinc-700 flex-1">
          {EXPORT_FORMATS.map((fmt) => (
            <button
              key={fmt.id}
              onClick={() => setExportFormat(fmt.id)}
              className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${
                exportFormat === fmt.id
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
              }`}
              title={fmt.description}
            >
              .{fmt.name}
            </button>
          ))}
        </div>
        <div className="flex gap-px rounded overflow-hidden bg-zinc-700">
          {FILE_NAMING_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFileNaming(opt.id)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                fileNaming === opt.id
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
              }`}
              title={`e.g. ${opt.example}.${exportFormat}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <label
        className="flex items-center gap-2 cursor-pointer"
        title="Bake all colors into a single texture atlas so the exported model uses one material — ideal for game engines like Unreal / Unity"
      >
        <button
          onClick={() => setMergeMaterials(!mergeMaterials)}
          className={`relative h-4 w-7 rounded-full transition-colors ${
            mergeMaterials ? "bg-blue-500" : "bg-zinc-600"
          }`}
        >
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${
              mergeMaterials ? "left-[14px]" : "left-0.5"
            }`}
          />
        </button>
        <span className="text-[11px] text-zinc-400">
          Merge into single material
        </span>
      </label>

      <button
        onClick={handleExport}
        disabled={!selectedEmoji || isExporting}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isExporting ? (
          <>
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Exporting...
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download {previewFilename}
          </>
        )}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
