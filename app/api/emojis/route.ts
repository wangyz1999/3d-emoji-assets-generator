import { NextResponse } from "next/server";
import { JSDELIVR_API_URL, TWEMOJI_BASE_URL } from "@/lib/constants";
import type { EmojiEntry } from "@/lib/types";

interface JsDelivrFile {
  name: string;
  hash: string;
  size: number;
}

interface JsDelivrDir {
  type: "directory";
  name: string;
  files: (JsDelivrFile | JsDelivrDir)[];
}

interface JsDelivrPackage {
  type: string;
  name: string;
  version: string;
  files: (JsDelivrFile | JsDelivrDir)[];
}

let cachedEmojis: EmojiEntry[] | null = null;

function findSvgDir(
  files: (JsDelivrFile | JsDelivrDir)[],
  path: string[]
): (JsDelivrFile | JsDelivrDir)[] | null {
  if (path.length === 0) return files;

  const target = path[0];
  for (const entry of files) {
    if ("files" in entry && entry.name === target) {
      return findSvgDir(entry.files, path.slice(1));
    }
  }
  return null;
}

export async function GET() {
  if (cachedEmojis) {
    return NextResponse.json(cachedEmojis);
  }

  try {
    const res = await fetch(JSDELIVR_API_URL, {
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      throw new Error(`jsDelivr API returned ${res.status}`);
    }

    const data: JsDelivrPackage = await res.json();
    const svgFiles = findSvgDir(data.files, ["assets", "svg"]);

    if (!svgFiles) {
      throw new Error("Could not find assets/svg directory in package data");
    }

    const emojis: EmojiEntry[] = svgFiles
      .filter(
        (f): f is JsDelivrFile =>
          !("files" in f) && f.name.endsWith(".svg")
      )
      .map((f) => {
        const code = f.name.replace(".svg", "");
        return {
          code,
          url: `${TWEMOJI_BASE_URL}/${f.name}`,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));

    cachedEmojis = emojis;
    return NextResponse.json(emojis);
  } catch (error) {
    console.error("Failed to fetch emoji list:", error);
    return NextResponse.json(
      { error: "Failed to fetch emoji list" },
      { status: 500 }
    );
  }
}
