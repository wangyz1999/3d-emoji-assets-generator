"use client";

import { useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";

export default function CommandPreview() {
  const { styleConfig, exportFormat, fileNaming, selectedEmoji } = useAppStore();
  const [copied, setCopied] = useState<"current" | "batch" | null>(null);

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

  const handleCopy = async (text: string, key: "current" | "batch") => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        CLI Command
      </span>

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
    </div>
  );
}
