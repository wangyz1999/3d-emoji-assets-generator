"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import * as THREE from "three";
import { buildCoin } from "@/lib/three/coin-builder";
import { buildBubble } from "@/lib/three/bubble-builder";
import type { CoinStyle, BubbleStyle, ExportFormat } from "@/lib/types";
import { DEFAULT_COIN, DEFAULT_BUBBLE } from "@/lib/constants";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";

function parseConfig(params: URLSearchParams): {
  config: CoinStyle | BubbleStyle;
  emoji: string;
  format: ExportFormat;
} {
  const shape = params.get("shape") ?? "coin";
  const emoji = params.get("emoji") ?? "1f60a";
  const format = (params.get("format") ?? "glb") as ExportFormat;

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
    };
    return { config, emoji, format };
  }

  const config: CoinStyle = {
    ...DEFAULT_COIN,
    radius: parseFloat(params.get("radius") ?? String(DEFAULT_COIN.radius)),
    thickness: parseFloat(params.get("thickness") ?? String(DEFAULT_COIN.thickness)),
    rimWidth: parseFloat(params.get("rimWidth") ?? String(DEFAULT_COIN.rimWidth)),
    rimColor: params.get("rimColor") ?? DEFAULT_COIN.rimColor,
    faceColor: params.get("faceColor") ?? DEFAULT_COIN.faceColor,
    metalness: parseFloat(params.get("metalness") ?? String(DEFAULT_COIN.metalness)),
    roughness: parseFloat(params.get("roughness") ?? String(DEFAULT_COIN.roughness)),
    emojiScale: parseFloat(params.get("emojiScale") ?? String(DEFAULT_COIN.emojiScale)),
    doubleSided: params.get("doubleSided") !== "false",
  };
  return { config, emoji, format };
}

async function exportToBuffer(
  model: THREE.Group,
  format: ExportFormat
): Promise<{ buffer: ArrayBuffer | string | Uint8Array; ext: string }> {
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
    const { config, emoji, format } = parseConfig(searchParams);
    const svgUrl = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.2/assets/svg/${emoji}.svg`;

    try {
      if (statusRef.current) {
        statusRef.current.textContent = `Building ${emoji}...`;
      }

      let model: THREE.Group;
      if (config.shape === "coin") {
        model = await buildCoin(config as CoinStyle, svgUrl);
      } else {
        model = await buildBubble(config as BubbleStyle, svgUrl);
      }

      const { buffer, ext } = await exportToBuffer(model, format);

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
    <div className="flex h-screen items-center justify-center bg-black text-white">
      <div ref={statusRef} id="status" className="text-sm">
        Initializing...
      </div>
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
