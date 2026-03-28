"use client";

import { useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";

export default function CommandPreview() {
  const { styleConfig, exportFormat, fileNaming, selectedEmoji } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const buildParts = useMemo(() => {
    const parts = ["npx 3d-emoji-gen generate"];

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
      parts.push(`--emojis ${selectedEmoji.code}`);
    } else {
      parts.push("--emojis all");
    }
    return parts.join(" \\\n  ");
  }, [buildParts, selectedEmoji]);

  const batchCommand = useMemo(() => {
    const parts = [...buildParts, "--emojis all"];
    return parts.join(" \\\n  ");
  }, [buildParts]);

  const handleCopy = async (text: string) => {
    const singleLine = text.replace(/ \\\n\s+/g, " ");
    await navigator.clipboard.writeText(singleLine);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-300"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        CLI Command
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-700 bg-zinc-900 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500">Current emoji</span>
            <button
              onClick={() => handleCopy(command)}
              className="text-[10px] text-blue-400 hover:text-blue-300"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="overflow-x-auto text-[11px] leading-relaxed text-green-400">
            {command}
          </pre>

          <div className="mt-2 border-t border-zinc-700/50 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500">
                Batch (all emojis)
              </span>
              <button
                onClick={() => handleCopy(batchCommand)}
                className="text-[10px] text-blue-400 hover:text-blue-300"
              >
                Copy
              </button>
            </div>
            <pre className="mt-1 overflow-x-auto text-[11px] leading-relaxed text-amber-400">
              {batchCommand}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
