import type { EmojiEntry, EmojiGroup } from "./types";
import { TWEMOJI_BASE_URL } from "./constants";

let cachedList: EmojiEntry[] | null = null;

export async function fetchEmojiList(): Promise<EmojiEntry[]> {
  if (cachedList) return cachedList;

  const res = await fetch("/api/emojis");
  if (!res.ok) throw new Error("Failed to fetch emoji list");

  const data: EmojiEntry[] = await res.json();
  cachedList = data;
  return data;
}

export function emojiCodeToUrl(code: string): string {
  return `${TWEMOJI_BASE_URL}/${code}.svg`;
}

export function codePointToEmoji(code: string): string {
  const codePoints = code.split("-").map((cp) => parseInt(cp, 16));
  return String.fromCodePoint(...codePoints);
}

export function getMainCategory(category: string): string {
  const idx = category.indexOf("(");
  if (idx > 0) return category.slice(0, idx).trim();
  return category.trim() || "Other";
}

export function getUniqueMainCategories(list: EmojiEntry[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const e of list) {
    const main = getMainCategory(e.category);
    if (!seen.has(main)) {
      seen.add(main);
      result.push(main);
    }
  }
  return result;
}

/**
 * Groups emojis by name hierarchy.
 * "thumbs up" (base) + "thumbs up: dark skin tone" (variant) → one group.
 * Only creates collapsed groups when a base emoji exists; otherwise each
 * variant stays standalone. Preserves the original JSON order.
 */
export function groupEmojis(list: EmojiEntry[]): EmojiGroup[] {
  const groupMap = new Map<
    string,
    { base: EmojiEntry | null; variants: EmojiEntry[]; order: number }
  >();
  const standalones: { emoji: EmojiEntry; order: number }[] = [];

  for (let i = 0; i < list.length; i++) {
    const emoji = list[i];
    const colonIdx = emoji.name.indexOf(": ");

    if (colonIdx > 0) {
      const baseName = emoji.name.slice(0, colonIdx);
      const existing = groupMap.get(baseName);
      if (existing) {
        existing.variants.push(emoji);
      } else {
        groupMap.set(baseName, { base: null, variants: [emoji], order: i });
      }
    } else {
      const existing = groupMap.get(emoji.name);
      if (existing) {
        existing.base = emoji;
      } else {
        groupMap.set(emoji.name, { base: emoji, variants: [], order: i });
      }
    }
  }

  const result: { group: EmojiGroup; order: number }[] = [];

  for (const [, entry] of groupMap) {
    if (entry.base) {
      result.push({
        group: { base: entry.base, variants: entry.variants },
        order: entry.order,
      });
    } else {
      for (let i = 0; i < entry.variants.length; i++) {
        result.push({
          group: { base: entry.variants[i], variants: [] },
          order: entry.order + i * 0.001,
        });
      }
    }
  }

  result.sort((a, b) => a.order - b.order);
  return result.map((r) => r.group);
}

function matchesSearch(emoji: EmojiEntry, lower: string): boolean {
  if (emoji.code.includes(lower)) return true;
  if (emoji.name.toLowerCase().includes(lower)) return true;
  if (emoji.shortname.toLowerCase().includes(lower)) return true;
  try {
    if (codePointToEmoji(emoji.code) === lower) return true;
  } catch {
    // ignore
  }
  return false;
}

export function filterEmojiGroups(
  groups: EmojiGroup[],
  search: string,
  category?: string
): EmojiGroup[] {
  return groups.filter((group) => {
    if (category) {
      const mainCat = getMainCategory(group.base.category);
      if (mainCat !== category) return false;
    }

    if (!search.trim()) return true;

    const lower = search.toLowerCase();
    if (matchesSearch(group.base, lower)) return true;
    return group.variants.some((v) => matchesSearch(v, lower));
  });
}

export function findGroupForEmoji(
  groups: EmojiGroup[],
  emoji: EmojiEntry
): EmojiGroup | undefined {
  return groups.find(
    (g) =>
      g.base.code === emoji.code ||
      g.variants.some((v) => v.code === emoji.code)
  );
}
