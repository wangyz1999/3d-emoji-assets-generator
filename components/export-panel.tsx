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
      await exportModel(modelRef.current, exportFormat, filename);
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
    <div className="flex flex-col gap-3">
      <div>
        <div className="grid grid-cols-4 gap-1.5">
          {EXPORT_FORMATS.map((fmt) => (
            <button
              key={fmt.id}
              onClick={() => setExportFormat(fmt.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
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
      </div>

      <div>
        <div className="grid grid-cols-2 gap-1.5">
          {FILE_NAMING_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFileNaming(opt.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
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

      <button
        onClick={handleExport}
        disabled={!selectedEmoji || isExporting}
        className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isExporting ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Exporting...
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
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
