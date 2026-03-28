import puppeteer from "puppeteer";
import { writeFile, mkdir, readFile } from "fs/promises";
import { resolve, join } from "path";
import type { StyleConfig, ExportFormat, FileNaming } from "../lib/types";
import { JSDELIVR_API_URL } from "../lib/constants";

interface RawEmoji {
  emoji: string;
  name: string;
  shortname: string;
  unicode: string;
  category: string;
}

interface GenerateOptions {
  config: StyleConfig;
  emojis: string[];
  format: ExportFormat;
  naming: FileNaming;
  output: string;
  baseUrl: string;
}

function unicodeToTwemojiCode(unicode: string): string {
  return unicode
    .split(" ")
    .map((cp) => cp.toLowerCase())
    .join("-");
}

async function loadEmojiMap(): Promise<Map<string, RawEmoji>> {
  const dataPath = resolve(__dirname, "..", "data", "emojis.json");
  const raw = JSON.parse(await readFile(dataPath, "utf-8"));
  const map = new Map<string, RawEmoji>();
  for (const e of raw.emojis as RawEmoji[]) {
    if (e.unicode) {
      const code = unicodeToTwemojiCode(e.unicode);
      map.set(code, e);
    }
  }
  return map;
}

async function fetchAllEmojiCodes(): Promise<string[]> {
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

function buildQueryParams(config: StyleConfig, emoji: string, format: ExportFormat): string {
  const params = new URLSearchParams();
  params.set("emoji", emoji);
  params.set("format", format);
  params.set("shape", config.shape);

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
  }

  return params.toString();
}

export async function generate(options: GenerateOptions): Promise<void> {
  const { config, format, naming, output, baseUrl } = options;
  let { emojis } = options;

  console.log("Loading emoji data...");
  const emojiMap = await loadEmojiMap();

  if (emojis.length === 1 && emojis[0] === "all") {
    console.log("Fetching complete emoji list...");
    emojis = await fetchAllEmojiCodes();
    console.log(`Found ${emojis.length} emojis`);
  }

  const outputDir = resolve(output);
  await mkdir(outputDir, { recursive: true });

  console.log(`Launching headless browser...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  const total = emojis.length;
  let completed = 0;
  let errors = 0;

  for (const emoji of emojis) {
    const page = await browser.newPage();

    try {
      const query = buildQueryParams(config, emoji, format);
      const url = `${baseUrl}/cli-render?${query}`;

      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

      const result = await page.waitForFunction(
        () => {
          const w = window as any;
          return w.__exportResult?.done || document.querySelector("#status")?.getAttribute("data-error");
        },
        { timeout: 30000 }
      );

      const hasError = await page.evaluate(
        () => document.querySelector("#status")?.getAttribute("data-error") === "true"
      );

      if (hasError) {
        const errMsg = await page.evaluate(
          () => document.querySelector("#status")?.textContent
        );
        console.error(`  [FAIL] ${emoji}: ${errMsg}`);
        errors++;
        continue;
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
        completed++;
        const pct = ((completed / total) * 100).toFixed(1);
        process.stdout.write(`\r  [${pct}%] ${completed}/${total} generated (${errors} errors)`);
      }
    } catch (err) {
      console.error(`\n  [FAIL] ${emoji}: ${err}`);
      errors++;
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log(`\n\nDone! Generated ${completed}/${total} files in ${outputDir}`);
  if (errors > 0) {
    console.log(`${errors} emoji(s) failed.`);
  }
}
