"use client";

import { useState, useMemo } from "react";
import * as THREE from "three";
import { useAppStore } from "@/lib/store";
import { exportModel } from "@/lib/three/exporters";
import { EXPORT_FORMATS } from "@/lib/constants";
import type { FileNaming } from "@/lib/types";

const FILE_NAMING_OPTIONS: { id: FileNaming; label: string; example: string }[] = [
  { id: "unicode", label: "Unicode", example: "1f602" },
  { id: "shortname", label: "Shortname", example: "joy" },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function MobileExportBar() {
  const {
    selectedEmoji,
    exportFormat,
    setExportFormat,
    fileNaming,
    setFileNaming,
    isExporting,
    setIsExporting,
    styleConfig,
  } = useAppStore();

  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<"format" | "cli" | null>(null);
  const [copied, setCopied] = useState<"current" | "batch" | null>(null);

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
      const filename =
        fileNaming === "shortname" ? selectedEmoji.shortname : selectedEmoji.code;
      await exportModel(modelRef.current, exportFormat, filename);
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const toggle = (panel: "format" | "cli") =>
    setExpanded((prev) => (prev === panel ? null : panel));

  const buildParts = useMemo(() => {
    const parts = ["npm run generate --"];
    parts.push(`--shape ${styleConfig.shape}`);
    parts.push(`--format ${exportFormat}`);
    parts.push(`--naming ${fileNaming}`);
    parts.push("--output ./output/");

    if (styleConfig.shape === "coin") {
      parts.push(`--radius ${styleConfig.radius}`);
      parts.push(`--thickness ${styleConfig.thickness}`);
      if (styleConfig.showRim) {
        parts.push(`--rim-width ${styleConfig.rimWidth}`);
        parts.push(`--rim-color "${styleConfig.rimColor}"`);
      } else {
        parts.push("--no-rim");
      }
      parts.push(`--face-color "${styleConfig.faceColor}"`);
      parts.push(`--metalness ${styleConfig.metalness}`);
      parts.push(`--roughness ${styleConfig.roughness}`);
      parts.push(`--emoji-scale ${styleConfig.emojiScale}`);
      if (!styleConfig.doubleSided) parts.push("--single-sided");
    } else if (styleConfig.shape === "bubble") {
      parts.push(`--radius ${styleConfig.radius}`);
      parts.push(`--depth ${styleConfig.depth}`);
      parts.push(`--tail-length ${styleConfig.tailLength}`);
      parts.push(`--tail-width ${styleConfig.tailWidth}`);
      parts.push(`--color "${styleConfig.color}"`);
      parts.push(`--bevel-size ${styleConfig.bevelSize}`);
      parts.push(`--roughness ${styleConfig.roughness}`);
      parts.push(`--emoji-scale ${styleConfig.emojiScale}`);
      if (!styleConfig.doubleSided) parts.push("--single-sided");
    } else if (styleConfig.shape === "pin") {
      parts.push(`--pin-radius ${styleConfig.pinRadius}`);
      parts.push(`--inner-radius ${styleConfig.innerRadius}`);
      parts.push(`--pin-point-length ${styleConfig.pinPointLength}`);
      parts.push(`--depth ${styleConfig.depth}`);
      parts.push(`--shell-color "${styleConfig.shellColor}"`);
      parts.push(`--inner-color "${styleConfig.innerColor}"`);
      parts.push(`--metalness ${styleConfig.metalness}`);
      parts.push(`--roughness ${styleConfig.roughness}`);
      parts.push(`--emoji-scale ${styleConfig.emojiScale}`);
      if (!styleConfig.doubleSided) parts.push("--single-sided");
    } else if (styleConfig.shape === "badge") {
      parts.push(`--sides ${styleConfig.sides}`);
      parts.push(`--badge-radius ${styleConfig.badgeRadius}`);
      parts.push(`--inner-radius ${styleConfig.innerRadius}`);
      parts.push(`--depth ${styleConfig.depth}`);
      parts.push(`--frame-color "${styleConfig.frameColor}"`);
      parts.push(`--inner-color "${styleConfig.innerColor}"`);
      parts.push(`--emissive-intensity ${styleConfig.emissiveIntensity}`);
      parts.push(`--metalness ${styleConfig.metalness}`);
      parts.push(`--roughness ${styleConfig.roughness}`);
      parts.push(`--emoji-scale ${styleConfig.emojiScale}`);
      if (!styleConfig.doubleSided) parts.push("--single-sided");
    }
    return parts;
  }, [styleConfig, exportFormat, fileNaming]);

  const command = useMemo(() => {
    const parts = [...buildParts];
    if (selectedEmoji) {
      const id = selectedEmoji.shortname
        ? selectedEmoji.shortname.replace(/:/g, "")
        : selectedEmoji.code;
      parts.push(`--emojis ${id}`);
    } else {
      parts.push("--emojis all");
    }
    return parts.join(" \\\n  ");
  }, [buildParts, selectedEmoji]);

  const batchCommand = useMemo(() => {
    return [...buildParts, "--emojis all"].join(" \\\n  ");
  }, [buildParts]);

  const handleCopy = async (text: string, key: "current" | "batch") => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        <button
          onClick={handleExport}
          disabled={!selectedEmoji || isExporting}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExporting ? (
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          )}
          {isExporting ? "Exporting..." : "Download"}
        </button>

        <button
          onClick={() => toggle("format")}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${
            expanded === "format"
              ? "bg-zinc-700 text-white"
              : "bg-zinc-800 text-zinc-400 hover:text-white"
          }`}
        >
          .{exportFormat}
          <ChevronIcon open={expanded === "format"} />
        </button>

        <button
          onClick={() => toggle("cli")}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${
            expanded === "cli"
              ? "bg-zinc-700 text-white"
              : "bg-zinc-800 text-zinc-400 hover:text-white"
          }`}
        >
          CLI
          <ChevronIcon open={expanded === "cli"} />
        </button>
      </div>

      {expanded === "format" && (
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
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {expanded === "cli" && (
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex flex-col gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500">Current</span>
              <button
                onClick={() => handleCopy(command, "current")}
                className="text-[10px] text-blue-400 hover:text-blue-300"
              >
                {copied === "current" ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="overflow-x-auto text-[10px] leading-relaxed text-green-400 font-mono whitespace-pre">
              {command}
            </pre>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500">Batch</span>
              <button
                onClick={() => handleCopy(batchCommand, "batch")}
                className="text-[10px] text-blue-400 hover:text-blue-300"
              >
                {copied === "batch" ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="overflow-x-auto text-[10px] leading-relaxed text-amber-400 font-mono whitespace-pre">
              {batchCommand}
            </pre>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
