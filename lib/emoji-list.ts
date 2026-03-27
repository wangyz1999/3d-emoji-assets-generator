import type { EmojiEntry } from "./types";
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

export function filterEmojis(
  list: EmojiEntry[],
  search: string
): EmojiEntry[] {
  if (!search.trim()) return list;
  const lower = search.toLowerCase();
  return list.filter((e) => {
    if (e.code.includes(lower)) return true;
    try {
      const emoji = codePointToEmoji(e.code);
      if (emoji === search) return true;
    } catch {
      // ignore invalid code points
    }
    return false;
  });
}
