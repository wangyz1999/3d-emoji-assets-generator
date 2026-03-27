import { NextResponse } from "next/server";
import { TWEMOJI_BASE_URL } from "@/lib/constants";
import type { EmojiEntry } from "@/lib/types";
import emojisData from "@/data/emojis.json";

interface RawEmoji {
  emoji: string;
  name: string;
  shortname: string;
  unicode: string;
  html: string;
  category: string;
  order: string;
}

function unicodeToTwemojiCode(unicode: string): string {
  return unicode
    .split(" ")
    .map((cp) => cp.toLowerCase())
    .join("-");
}

let cachedEmojis: EmojiEntry[] | null = null;

export async function GET() {
  if (cachedEmojis) {
    return NextResponse.json(cachedEmojis);
  }

  try {
    const raw = emojisData.emojis as RawEmoji[];

    const seen = new Set<string>();
    const emojis: EmojiEntry[] = [];

    for (let i = 0; i < raw.length; i++) {
      const e = raw[i];
      if (!e.unicode || !e.name) continue;
      const code = unicodeToTwemojiCode(e.unicode);
      if (seen.has(code)) continue;
      seen.add(code);
      const numOrder = e.order ? parseInt(e.order, 10) : NaN;
      emojis.push({
        code,
        url: `${TWEMOJI_BASE_URL}/${code}.svg`,
        name: e.name,
        shortname: e.shortname.replace(/:/g, ""),
        category: e.category || "Other",
        order: Number.isNaN(numOrder) ? 100_000 + i : numOrder,
      });
    }

    emojis.sort((a, b) => a.order - b.order);
    cachedEmojis = emojis;
    return NextResponse.json(emojis);
  } catch (error) {
    console.error("Failed to load emoji data:", error);
    return NextResponse.json(
      { error: "Failed to load emoji data" },
      { status: 500 }
    );
  }
}
