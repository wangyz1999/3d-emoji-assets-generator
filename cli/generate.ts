import puppeteer, { type Browser } from "puppeteer";
import { writeFile, mkdir, readFile } from "fs/promises";
import { resolve, join } from "path";
import pLimit from "p-limit";
import type { StyleConfig, ExportFormat, FileNaming } from "../lib/types";
import { JSDELIVR_API_URL } from "../lib/constants";

interface RawEmoji {
  emoji: string;
  name: string;
  shortname: string;
  unicode: string;
  category: string;
}

export type EmojiSource = "remote" | "local";

interface GenerateOptions {
  config: StyleConfig;
  emojis: string[];
  format: ExportFormat;
  naming: FileNaming;
  output: string;
  baseUrl: string;
  concurrency: number;
  emojiSource: EmojiSource;
  retries: number;
  mergeMaterials?: boolean;
}

function unicodeToTwemojiCode(unicode: string): string {
  return unicode
    .split(" ")
    .map((cp) => cp.toLowerCase())
    .join("-");
}

interface EmojiMaps {
  byCode: Map<string, RawEmoji>;
  byShortname: Map<string, string>; // shortname (no colons) -> code
}

async function loadEmojiMaps(): Promise<EmojiMaps> {
  const dataPath = resolve(__dirname, "..", "data", "emojis.json");
  const raw = JSON.parse(await readFile(dataPath, "utf-8"));
  const byCode = new Map<string, RawEmoji>();
  const byShortname = new Map<string, string>();
  for (const e of raw.emojis as RawEmoji[]) {
    if (e.unicode) {
      const code = unicodeToTwemojiCode(e.unicode);
      byCode.set(code, e);
      if (e.shortname) {
        const bare = e.shortname.replace(/:/g, "").toLowerCase();
        byShortname.set(bare, code);
      }
    }
  }
  return { byCode, byShortname };
}

function resolveEmojiCode(input: string, byShortname: Map<string, string>): string {
  // Already a unicode code (e.g. "1f602" or "1f1fa-1f1f8")
  if (/^[0-9a-f]+([-][0-9a-f]+)*$/i.test(input)) return input.toLowerCase();
  // Shortname with or without colons (e.g. "joy" or ":joy:")
  const bare = input.replace(/:/g, "").toLowerCase();
  const resolved = byShortname.get(bare);
  if (!resolved) throw new Error(`Unknown emoji shortname: "${input}"`);
  return resolved;
}

async function fetchAllEmojiCodes(emojiSource: EmojiSource): Promise<string[]> {
  // When using local SVGs, read ids.json directly — no network call needed
  if (emojiSource === "local") {
    const idsPath = resolve(__dirname, "..", "data", "ids.json");
    return JSON.parse(await readFile(idsPath, "utf-8")) as string[];
  }

  const res = await fetch(JSDELIVR_API_URL);
  const data = await res.json();

  function findSvgDir(files: any[], path: string[]): any[] | null {
    if (path.length === 0) return files;
    for (const entry of files) {
      if (entry.files && entry.name === path[0]) {
        return findSvgDir(entry.files, path.slice(1));
      }
    }
    return null;
  }

  const svgFiles = findSvgDir(data.files, ["assets", "svg"]);
  if (!svgFiles) throw new Error("Could not find emoji SVG files");

  return svgFiles
    .filter((f: any) => !f.files && f.name.endsWith(".svg"))
    .map((f: any) => f.name.replace(".svg", ""))
    .sort();
}

function getOutputFilename(
  emojiCode: string,
  naming: FileNaming,
  emojiMap: Map<string, RawEmoji>
): string {
  if (naming === "shortname") {
    const entry = emojiMap.get(emojiCode);
    if (entry) {
      return entry.shortname.replace(/:/g, "");
    }
  }
  return emojiCode;
}

function buildQueryParams(config: StyleConfig, emoji: string, format: ExportFormat, emojiSource: EmojiSource, mergeMaterials?: boolean): string {
  const params = new URLSearchParams();
  params.set("emoji", emoji);
  params.set("format", format);
  params.set("shape", config.shape);
  params.set("emojiSource", emojiSource);
  if (mergeMaterials) params.set("mergeMaterials", "true");

  if (config.shape === "coin") {
    params.set("radius", String(config.radius));
    params.set("thickness", String(config.thickness));
    params.set("rimWidth", String(config.rimWidth));
    params.set("rimColor", config.rimColor);
    params.set("faceColor", config.faceColor);
    params.set("showRim", String(config.showRim));
    params.set("metalness", String(config.metalness));
    params.set("roughness", String(config.roughness));
    params.set("emojiScale", String(config.emojiScale));
    params.set("doubleSided", String(config.doubleSided));
  } else if (config.shape === "bubble") {
    params.set("radius", String(config.radius));
    params.set("depth", String(config.depth));
    params.set("tailLength", String(config.tailLength));
    params.set("tailWidth", String(config.tailWidth));
    params.set("color", config.color);
    params.set("bevelSize", String(config.bevelSize));
    params.set("roughness", String(config.roughness));
    params.set("emojiScale", String(config.emojiScale));
    params.set("doubleSided", String(config.doubleSided));
  } else if (config.shape === "pin") {
    params.set("pinRadius", String(config.pinRadius));
    params.set("innerRadius", String(config.innerRadius));
    params.set("pinPointLength", String(config.pinPointLength));
    params.set("depth", String(config.depth));
    params.set("shellColor", config.shellColor);
    params.set("innerColor", config.innerColor);
    params.set("metalness", String(config.metalness));
    params.set("roughness", String(config.roughness));
    params.set("emojiScale", String(config.emojiScale));
    params.set("doubleSided", String(config.doubleSided));
  } else if (config.shape === "badge") {
    params.set("sides", String(config.sides));
    params.set("badgeRadius", String(config.badgeRadius));
    params.set("innerRadius", String(config.innerRadius));
    params.set("depth", String(config.depth));
    params.set("frameColor", config.frameColor);
    params.set("innerColor", config.innerColor);
    params.set("emissiveIntensity", String(config.emissiveIntensity));
    params.set("metalness", String(config.metalness));
    params.set("roughness", String(config.roughness));
    params.set("emojiScale", String(config.emojiScale));
    params.set("doubleSided", String(config.doubleSided));
  } else if (config.shape === "flat") {
    params.set("depth", String(config.depth));
    params.set("emojiScale", String(config.emojiScale));
    params.set("roughness", String(config.roughness));
    params.set("metalness", String(config.metalness));
  }

  return params.toString();
}

const PAGE_TIMEOUT = 60_000;

async function processEmoji(
  browser: Browser,
  emoji: string,
  config: StyleConfig,
  format: ExportFormat,
  naming: FileNaming,
  outputDir: string,
  baseUrl: string,
  emojiMap: Map<string, RawEmoji>,
  emojiSource: EmojiSource,
  retries: number,
  mergeMaterials?: boolean,
): Promise<"ok" | "error"> {
  const query = buildQueryParams(config, emoji, format, emojiSource, mergeMaterials);
  const url = `${baseUrl}/cli-render?${query}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT });

      await page.waitForFunction(
        () => {
          const w = window as any;
          return w.__exportResult?.done || document.querySelector("#status")?.getAttribute("data-error");
        },
        { timeout: PAGE_TIMEOUT }
      );

      const hasError = await page.evaluate(
        () => document.querySelector("#status")?.getAttribute("data-error") === "true"
      );

      if (hasError) {
        const errMsg = await page.evaluate(
          () => document.querySelector("#status")?.textContent
        );
        console.error(`\n  [FAIL] ${emoji}: ${errMsg}`);
        return "error";
      }

      const exportData = await page.evaluate(() => {
        const w = window as any;
        return w.__exportResult;
      });

      if (exportData?.buffer) {
        const ext = exportData.filename.split(".").pop()!;
        const outputName = getOutputFilename(emoji, naming, emojiMap);
        const filePath = join(outputDir, `${outputName}.${ext}`);

        let data: Buffer;
        if (typeof exportData.buffer === "string") {
          data = Buffer.from(exportData.buffer, "utf-8");
        } else {
          data = Buffer.from(exportData.buffer);
        }

        await writeFile(filePath, data);
        return "ok";
      }

      return "error";
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      if (isTimeout && attempt < retries) {
        console.error(`\n  [RETRY ${attempt}/${retries}] ${emoji}: timeout`);
      } else {
        console.error(`\n  [FAIL] ${emoji}: ${err}`);
        return "error";
      }
    } finally {
      await page.close();
    }
  }

  return "error";
}

export async function generate(options: GenerateOptions): Promise<void> {
  const { config, format, naming, output, baseUrl, concurrency, emojiSource, retries, mergeMaterials } = options;
  let { emojis } = options;

  console.log("Loading emoji data...");
  const { byCode: emojiMap, byShortname } = await loadEmojiMaps();

  if (emojis.length === 1 && emojis[0] === "all") {
    if (emojiSource === "local") {
      console.log("Reading local emoji list...");
    } else {
      console.log("Fetching complete emoji list...");
    }
    emojis = await fetchAllEmojiCodes(emojiSource);
    console.log(`Found ${emojis.length} emojis`);
  } else {
    emojis = emojis.map((e) => resolveEmojiCode(e, byShortname));
  }

  const outputDir = resolve(output);
  await mkdir(outputDir, { recursive: true });

  console.log(`Launching headless browser... (concurrency: ${concurrency})`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  const total = emojis.length;
  let completed = 0;
  let errors = 0;

  const limit = pLimit(concurrency);

  await Promise.all(
    emojis.map((emoji) =>
      limit(async () => {
        const result = await processEmoji(
          browser, emoji, config, format, naming, outputDir, baseUrl, emojiMap, emojiSource, retries, mergeMaterials
        );
        if (result === "ok") {
          completed++;
        } else {
          errors++;
        }
        const pct = ((completed + errors) / total * 100).toFixed(1);
        process.stdout.write(`\r  [${pct}%] ${completed}/${total} generated (${errors} errors)`);
      })
    )
  );

  await browser.close();

  console.log(`\n\nDone! Generated ${completed}/${total} files in ${outputDir}`);
  if (errors > 0) {
    console.log(`${errors} emoji(s) failed.`);
  }
}
