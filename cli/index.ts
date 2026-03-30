#!/usr/bin/env node

import { Command } from "commander";
import { generate, type EmojiSource } from "./generate";
import { DEFAULT_COIN, DEFAULT_BUBBLE, DEFAULT_PIN, DEFAULT_BADGE, DEFAULT_FLAT } from "../lib/constants";
import type { CoinStyle, BubbleStyle, PinStyle, BadgeStyle, FlatStyle, ExportFormat, FileNaming, StyleConfig } from "../lib/types";

const program = new Command();

program
  .name("3d-emoji-gen")
  .description("Generate 3D emoji assets from Twemoji SVGs")
  .version("0.1.0");

program
  .command("generate")
  .description("Generate 3D emoji model(s)")
  .requiredOption("--shape <type>", "Shape type: coin, bubble, pin, badge, or flat", "coin")
  .requiredOption("--format <format>", "Export format: glb, obj, stl, usdz", "glb")
  .requiredOption("--output <dir>", "Output directory", "./output")
  .requiredOption("--emojis <codes>", "Comma-separated emoji codes or 'all'", "all")
  .option("--naming <type>", "File naming: unicode or shortname", "unicode")
  .option("--base-url <url>", "Base URL of the running dev server", "http://localhost:3000")
  .option("--concurrency <n>", "Number of emojis to render in parallel", "4")
  .option("--retries <n>", "Retry attempts per emoji on timeout", "3")
  .option("--emoji-source <source>", "SVG source: remote (CDN) or local (data/svg/)", "local")
  // Coin options
  .option("--radius <n>", "Coin/bubble radius", String(DEFAULT_COIN.radius))
  .option("--thickness <n>", "Coin thickness", String(DEFAULT_COIN.thickness))
  .option("--rim-width <n>", "Coin rim width (0-1)", String(DEFAULT_COIN.rimWidth))
  .option("--rim-color <hex>", "Coin rim color", DEFAULT_COIN.rimColor)
  .option("--face-color <hex>", "Coin face color", DEFAULT_COIN.faceColor)
  .option("--no-rim", "Disable coin rim")
  .option("--metalness <n>", "Material metalness (0-1)", String(DEFAULT_COIN.metalness))
  .option("--roughness <n>", "Material roughness (0-1)", String(DEFAULT_COIN.roughness))
  .option("--emoji-scale <n>", "Emoji scale factor", String(DEFAULT_COIN.emojiScale))
  .option("--single-sided", "Only put emoji on front face")
  // Bubble options
  .option("--depth <n>", "Depth (bubble/pin/badge)", String(DEFAULT_BUBBLE.depth))
  .option("--tail-length <n>", "Bubble tail length", String(DEFAULT_BUBBLE.tailLength))
  .option("--tail-width <n>", "Bubble tail width", String(DEFAULT_BUBBLE.tailWidth))
  .option("--color <hex>", "Bubble color", DEFAULT_BUBBLE.color)
  .option("--bevel-size <n>", "Bubble bevel size", String(DEFAULT_BUBBLE.bevelSize))
  // Pin options
  .option("--pin-radius <n>", "Pin outer radius", String(DEFAULT_PIN.pinRadius))
  .option("--inner-radius <n>", "Pin/badge inner radius", String(DEFAULT_PIN.innerRadius))
  .option("--pin-point-length <n>", "Pin pointer length", String(DEFAULT_PIN.pinPointLength))
  .option("--shell-color <hex>", "Pin shell color", DEFAULT_PIN.shellColor)
  .option("--inner-color <hex>", "Pin/badge inner color", DEFAULT_PIN.innerColor)
  // Badge options
  .option("--sides <n>", "Badge polygon sides (3-10)", String(DEFAULT_BADGE.sides))
  .option("--badge-radius <n>", "Badge outer radius", String(DEFAULT_BADGE.badgeRadius))
  .option("--frame-color <hex>", "Badge frame color", DEFAULT_BADGE.frameColor)
  .option("--emissive-intensity <n>", "Badge glow intensity", String(DEFAULT_BADGE.emissiveIntensity))
  .option("--merge-materials", "Bake all colors into one texture atlas (single material)")
  .action(async (opts) => {
    const shape = opts.shape as StyleConfig["shape"];
    const format = opts.format as ExportFormat;
    const naming = opts.naming as FileNaming;
    const emojis = opts.emojis.split(",").map((s: string) => s.trim());
    const concurrency = Math.max(1, parseInt(opts.concurrency, 10) || 4);
    const retries = Math.max(1, parseInt(opts.retries, 10) || 3);
    const emojiSource: EmojiSource =
      opts.emojiSource === "local" ? "local" : "remote";
    const mergeMaterials = !!opts.mergeMaterials;

    let config: StyleConfig;

    if (shape === "coin") {
      config = {
        shape: "coin",
        radius: parseFloat(opts.radius),
        thickness: parseFloat(opts.thickness),
        rimWidth: parseFloat(opts.rimWidth),
        rimColor: opts.rimColor,
        faceColor: opts.faceColor,
        showRim: opts.rim !== false,
        metalness: parseFloat(opts.metalness),
        roughness: parseFloat(opts.roughness),
        emojiScale: parseFloat(opts.emojiScale),
        doubleSided: !opts.singleSided,
      };
    } else if (shape === "bubble") {
      config = {
        shape: "bubble",
        radius: parseFloat(opts.radius),
        depth: parseFloat(opts.depth),
        tailLength: parseFloat(opts.tailLength),
        tailWidth: parseFloat(opts.tailWidth),
        color: opts.color,
        bevelSize: parseFloat(opts.bevelSize),
        roughness: parseFloat(opts.roughness),
        emojiScale: parseFloat(opts.emojiScale),
        doubleSided: !opts.singleSided,
      };
    } else if (shape === "pin") {
      config = {
        shape: "pin",
        pinRadius: parseFloat(opts.pinRadius),
        innerRadius: parseFloat(opts.innerRadius),
        pinPointLength: parseFloat(opts.pinPointLength),
        depth: parseFloat(opts.depth || String(DEFAULT_PIN.depth)),
        shellColor: opts.shellColor,
        innerColor: opts.innerColor,
        metalness: parseFloat(opts.metalness),
        roughness: parseFloat(opts.roughness),
        emojiScale: parseFloat(opts.emojiScale),
        doubleSided: !opts.singleSided,
      };
    } else if (shape === "badge") {
      config = {
        shape: "badge",
        sides: parseInt(opts.sides),
        badgeRadius: parseFloat(opts.badgeRadius),
        innerRadius: parseFloat(opts.innerRadius),
        depth: parseFloat(opts.depth || String(DEFAULT_BADGE.depth)),
        frameColor: opts.frameColor,
        innerColor: opts.innerColor,
        emissiveIntensity: parseFloat(opts.emissiveIntensity),
        metalness: parseFloat(opts.metalness),
        roughness: parseFloat(opts.roughness),
        emojiScale: parseFloat(opts.emojiScale),
        doubleSided: !opts.singleSided,
      };
    } else {
      config = {
        shape: "flat",
        depth: parseFloat(opts.depth || String(DEFAULT_FLAT.depth)),
        emojiScale: parseFloat(opts.emojiScale),
        roughness: parseFloat(opts.roughness),
        metalness: parseFloat(opts.metalness),
      };
    }

    console.log(`\n3D Emoji Generator`);
    console.log(`  Shape:        ${shape}`);
    console.log(`  Format:       ${format}`);
    console.log(`  Naming:       ${naming}`);
    console.log(`  Emojis:       ${emojis.join(", ")}`);
    console.log(`  Output:       ${opts.output}`);
    console.log(`  Concurrency:  ${concurrency}`);
    console.log(`  Retries:      ${retries}`);
    console.log(`  Emoji source: ${emojiSource}`);
    if (mergeMaterials) console.log(`  Merge mats:   yes`);
    console.log();

    await generate({
      config,
      emojis,
      format,
      naming,
      output: opts.output,
      baseUrl: opts.baseUrl,
      concurrency,
      retries,
      emojiSource,
      mergeMaterials,
    });
  });

program.parse();
