"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import * as THREE from "three";
import { buildCoin } from "@/lib/three/coin-builder";
import { buildBubble } from "@/lib/three/bubble-builder";
import { buildPin } from "@/lib/three/pin-builder";
import { buildBadge } from "@/lib/three/badge-builder";
import { buildFlat } from "@/lib/three/flat-builder";
import type { CoinStyle, BubbleStyle, PinStyle, BadgeStyle, FlatStyle, ExportFormat } from "@/lib/types";
import { DEFAULT_COIN, DEFAULT_BUBBLE, DEFAULT_PIN, DEFAULT_BADGE, DEFAULT_FLAT, TWEMOJI_BASE_URL, LOCAL_SVG_BASE_URL } from "@/lib/constants";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";
import { mergeToSingleMaterial } from "@/lib/three/merge-materials";

function parseConfig(params: URLSearchParams): {
  config: CoinStyle | BubbleStyle | PinStyle | BadgeStyle | FlatStyle;
  emoji: string;
  format: ExportFormat;
  mergeMaterials: boolean;
} {
  const shape = params.get("shape") ?? "coin";
  const emoji = params.get("emoji") ?? "1f60a";
  const format = (params.get("format") ?? "glb") as ExportFormat;
  const mergeMaterials = params.get("mergeMaterials") === "true";
  const curveSegments = parseInt(params.get("curveSegments") ?? "8") || 8;

  if (shape === "bubble") {
    const config: BubbleStyle = {
      ...DEFAULT_BUBBLE,
      radius: parseFloat(params.get("radius") ?? String(DEFAULT_BUBBLE.radius)),
      depth: parseFloat(params.get("depth") ?? String(DEFAULT_BUBBLE.depth)),
      tailLength: parseFloat(params.get("tailLength") ?? String(DEFAULT_BUBBLE.tailLength)),
      tailWidth: parseFloat(params.get("tailWidth") ?? String(DEFAULT_BUBBLE.tailWidth)),
      color: params.get("color") ?? DEFAULT_BUBBLE.color,
      bevelSize: parseFloat(params.get("bevelSize") ?? String(DEFAULT_BUBBLE.bevelSize)),
      roughness: parseFloat(params.get("roughness") ?? String(DEFAULT_BUBBLE.roughness)),
      emojiScale: parseFloat(params.get("emojiScale") ?? String(DEFAULT_BUBBLE.emojiScale)),
      doubleSided: params.get("doubleSided") !== "false",
      curveSegments,
    };
    return { config, emoji, format, mergeMaterials };
  }

  if (shape === "pin") {
    const config: PinStyle = {
      ...DEFAULT_PIN,
      pinRadius: parseFloat(params.get("pinRadius") ?? String(DEFAULT_PIN.pinRadius)),
      innerRadius: parseFloat(params.get("innerRadius") ?? String(DEFAULT_PIN.innerRadius)),
      pinPointLength: parseFloat(params.get("pinPointLength") ?? String(DEFAULT_PIN.pinPointLength)),
      depth: parseFloat(params.get("depth") ?? String(DEFAULT_PIN.depth)),
      shellColor: params.get("shellColor") ?? DEFAULT_PIN.shellColor,
      innerColor: params.get("innerColor") ?? DEFAULT_PIN.innerColor,
      metalness: parseFloat(params.get("metalness") ?? String(DEFAULT_PIN.metalness)),
      roughness: parseFloat(params.get("roughness") ?? String(DEFAULT_PIN.roughness)),
      emojiScale: parseFloat(params.get("emojiScale") ?? String(DEFAULT_PIN.emojiScale)),
      doubleSided: params.get("doubleSided") !== "false",
      curveSegments,
    };
    return { config, emoji, format, mergeMaterials };
  }

  if (shape === "badge") {
    const config: BadgeStyle = {
      ...DEFAULT_BADGE,
      sides: parseInt(params.get("sides") ?? String(DEFAULT_BADGE.sides)),
      badgeRadius: parseFloat(params.get("badgeRadius") ?? String(DEFAULT_BADGE.badgeRadius)),
      innerRadius: parseFloat(params.get("innerRadius") ?? String(DEFAULT_BADGE.innerRadius)),
      depth: parseFloat(params.get("depth") ?? String(DEFAULT_BADGE.depth)),
      frameColor: params.get("frameColor") ?? DEFAULT_BADGE.frameColor,
      innerColor: params.get("innerColor") ?? DEFAULT_BADGE.innerColor,
      emissiveIntensity: parseFloat(params.get("emissiveIntensity") ?? String(DEFAULT_BADGE.emissiveIntensity)),
      metalness: parseFloat(params.get("metalness") ?? String(DEFAULT_BADGE.metalness)),
      roughness: parseFloat(params.get("roughness") ?? String(DEFAULT_BADGE.roughness)),
      emojiScale: parseFloat(params.get("emojiScale") ?? String(DEFAULT_BADGE.emojiScale)),
      doubleSided: params.get("doubleSided") !== "false",
      curveSegments,
    };
    return { config, emoji, format, mergeMaterials };
  }

  if (shape === "flat") {
    const config: FlatStyle = {
      ...DEFAULT_FLAT,
      depth: parseFloat(params.get("depth") ?? String(DEFAULT_FLAT.depth)),
      emojiScale: parseFloat(params.get("emojiScale") ?? String(DEFAULT_FLAT.emojiScale)),
      roughness: parseFloat(params.get("roughness") ?? String(DEFAULT_FLAT.roughness)),
      metalness: parseFloat(params.get("metalness") ?? String(DEFAULT_FLAT.metalness)),
      curveSegments,
    };
    return { config, emoji, format, mergeMaterials };
  }

  const config: CoinStyle = {
    ...DEFAULT_COIN,
    radius: parseFloat(params.get("radius") ?? String(DEFAULT_COIN.radius)),
    thickness: parseFloat(params.get("thickness") ?? String(DEFAULT_COIN.thickness)),
    rimWidth: parseFloat(params.get("rimWidth") ?? String(DEFAULT_COIN.rimWidth)),
    rimColor: params.get("rimColor") ?? DEFAULT_COIN.rimColor,
    faceColor: params.get("faceColor") ?? DEFAULT_COIN.faceColor,
    showRim: params.get("showRim") !== "false",
    metalness: parseFloat(params.get("metalness") ?? String(DEFAULT_COIN.metalness)),
    roughness: parseFloat(params.get("roughness") ?? String(DEFAULT_COIN.roughness)),
    emojiScale: parseFloat(params.get("emojiScale") ?? String(DEFAULT_COIN.emojiScale)),
    doubleSided: params.get("doubleSided") !== "false",
    curveSegments,
  };
  return { config, emoji, format, mergeMaterials };
}

async function exportToBuffer(
  model: THREE.Group,
  format: ExportFormat,
  shouldMergeMaterials: boolean = false,
): Promise<{ buffer: ArrayBuffer | string | Uint8Array; ext: string }> {
  if (shouldMergeMaterials) {
    model = mergeToSingleMaterial(model);
  }
  model.rotation.set(0, 0, 0);
  model.position.set(0, 0, 0);

  switch (format) {
    case "glb": {
      const exporter = new GLTFExporter();
      return new Promise((resolve, reject) => {
        exporter.parse(
          model,
          (gltf) => resolve({ buffer: gltf as ArrayBuffer, ext: "glb" }),
          (err) => reject(err),
          { binary: true }
        );
      });
    }
    case "obj": {
      const exporter = new OBJExporter();
      return { buffer: exporter.parse(model), ext: "obj" };
    }
    case "stl": {
      const exporter = new STLExporter();
      const stlResult = exporter.parse(model, { binary: true });
      const stlBuffer = stlResult instanceof DataView ? stlResult.buffer as ArrayBuffer : stlResult;
      return { buffer: stlBuffer, ext: "stl" };
    }
    case "usdz": {
      const exporter = new USDZExporter();
      const result = await exporter.parseAsync(model);
      return { buffer: result, ext: "usdz" };
    }
  }
}

function CLIRenderContent() {
  const searchParams = useSearchParams();
  const statusRef = useRef<HTMLDivElement>(null);

  const generate = useCallback(async () => {
    const { config, emoji, format, mergeMaterials: shouldMerge } = parseConfig(searchParams);
    const emojiSource = searchParams.get("emojiSource") ?? "remote";
    const svgBase = emojiSource === "local" ? LOCAL_SVG_BASE_URL : TWEMOJI_BASE_URL;
    const svgUrl = `${svgBase}/${emoji}.svg`;

    try {
      if (statusRef.current) {
        statusRef.current.textContent = `Building ${emoji}...`;
      }

      let model: THREE.Group;
      if (config.shape === "coin") {
        ({ group: model } = await buildCoin(config as CoinStyle, svgUrl));
      } else if (config.shape === "bubble") {
        ({ group: model } = await buildBubble(config as BubbleStyle, svgUrl));
      } else if (config.shape === "pin") {
        ({ group: model } = await buildPin(config as PinStyle, svgUrl));
      } else if (config.shape === "badge") {
        ({ group: model } = await buildBadge(config as BadgeStyle, svgUrl));
      } else {
        ({ group: model } = await buildFlat(config as FlatStyle, svgUrl));
      }

      const { buffer, ext } = await exportToBuffer(model, format, shouldMerge);

      // Signal Puppeteer that the model is ready
      (window as unknown as Record<string, unknown>).__exportResult = {
        buffer:
          typeof buffer === "string"
            ? buffer
            : Array.from(new Uint8Array(buffer as ArrayBuffer)),
        filename: `${emoji}.${ext}`,
        done: true,
      };

      if (statusRef.current) {
        statusRef.current.textContent = `Done: ${emoji}.${ext}`;
        statusRef.current.setAttribute("data-done", "true");
      }
    } catch (err) {
      console.error("Generation error:", err);
      if (statusRef.current) {
        statusRef.current.textContent = `Error: ${err}`;
        statusRef.current.setAttribute("data-error", "true");
      }
    }
  }, [searchParams]);

  useEffect(() => {
    generate();
  }, [generate]);

  return (
    <div className="relative flex h-screen flex-col items-center justify-center bg-black text-white">
      <div ref={statusRef} id="status" className="text-sm">
        Initializing...
      </div>
      <p className="absolute bottom-3 text-[10px] text-zinc-600">
        Emoji graphics by{" "}
        <a
          href="https://github.com/jdecked/twemoji"
          className="underline hover:text-zinc-400"
          target="_blank"
          rel="noopener noreferrer"
        >
          Twemoji
        </a>{" "}
        © Twitter/X Corp, licensed under{" "}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          className="underline hover:text-zinc-400"
          target="_blank"
          rel="noopener noreferrer"
        >
          CC-BY 4.0
        </a>
      </p>
    </div>
  );
}

import { Suspense } from "react";

export default function CLIRenderPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-black text-white text-sm">Loading...</div>}>
      <CLIRenderContent />
    </Suspense>
  );
}
