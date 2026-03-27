#!/usr/bin/env node

import { Command } from "commander";
import { generate } from "./generate";
import { DEFAULT_COIN, DEFAULT_BUBBLE } from "../lib/constants";
import type { CoinStyle, BubbleStyle, ExportFormat } from "../lib/types";

const program = new Command();

program
  .name("3d-emoji-gen")
  .description("Generate 3D emoji assets from Twemoji SVGs")
  .version("0.1.0");

program
  .command("generate")
  .description("Generate 3D emoji model(s)")
  .requiredOption("--shape <type>", "Shape type: coin or bubble", "coin")
  .requiredOption("--format <format>", "Export format: glb, obj, stl, usdz", "glb")
  .requiredOption("--output <dir>", "Output directory", "./output")
  .requiredOption("--emojis <codes>", "Comma-separated emoji codes or 'all'", "all")
  .option("--base-url <url>", "Base URL of the running dev server", "http://localhost:3000")
  // Coin options
  .option("--radius <n>", "Coin/bubble radius", String(DEFAULT_COIN.radius))
  .option("--thickness <n>", "Coin thickness", String(DEFAULT_COIN.thickness))
  .option("--rim-width <n>", "Coin rim width (0-1)", String(DEFAULT_COIN.rimWidth))
  .option("--rim-color <hex>", "Coin rim color", DEFAULT_COIN.rimColor)
  .option("--face-color <hex>", "Coin face color", DEFAULT_COIN.faceColor)
  .option("--metalness <n>", "Material metalness (0-1)", String(DEFAULT_COIN.metalness))
  .option("--roughness <n>", "Material roughness (0-1)", String(DEFAULT_COIN.roughness))
  .option("--emoji-scale <n>", "Emoji scale factor", String(DEFAULT_COIN.emojiScale))
  .option("--single-sided", "Only put emoji on front face")
  // Bubble options
  .option("--depth <n>", "Bubble depth", String(DEFAULT_BUBBLE.depth))
  .option("--tail-length <n>", "Bubble tail length", String(DEFAULT_BUBBLE.tailLength))
  .option("--tail-width <n>", "Bubble tail width", String(DEFAULT_BUBBLE.tailWidth))
  .option("--color <hex>", "Bubble color", DEFAULT_BUBBLE.color)
  .option("--bevel-size <n>", "Bubble bevel size", String(DEFAULT_BUBBLE.bevelSize))
  .action(async (opts) => {
    const shape = opts.shape as "coin" | "bubble";
    const format = opts.format as ExportFormat;
    const emojis = opts.emojis.split(",").map((s: string) => s.trim());

    let config: CoinStyle | BubbleStyle;

    if (shape === "coin") {
      config = {
        shape: "coin",
        radius: parseFloat(opts.radius),
        thickness: parseFloat(opts.thickness),
        rimWidth: parseFloat(opts.rimWidth),
        rimColor: opts.rimColor,
        faceColor: opts.faceColor,
        metalness: parseFloat(opts.metalness),
        roughness: parseFloat(opts.roughness),
        emojiScale: parseFloat(opts.emojiScale),
        doubleSided: !opts.singleSided,
      };
    } else {
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
    }

    console.log(`\n3D Emoji Generator`);
    console.log(`  Shape:  ${shape}`);
    console.log(`  Format: ${format}`);
    console.log(`  Emojis: ${emojis.join(", ")}`);
    console.log(`  Output: ${opts.output}\n`);

    await generate({
      config,
      emojis,
      format,
      output: opts.output,
      baseUrl: opts.baseUrl,
    });
  });

program.parse();
