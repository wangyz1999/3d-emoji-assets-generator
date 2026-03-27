export interface EmojiCategory {
  id: string;
  label: string;
}

export const CATEGORIES: EmojiCategory[] = [
  { id: "smileys", label: "Smileys & Emotion" },
  { id: "people", label: "People & Body" },
  { id: "animals", label: "Animals & Nature" },
  { id: "food", label: "Food & Drink" },
  { id: "travel", label: "Travel & Places" },
  { id: "activities", label: "Activities" },
  { id: "objects", label: "Objects" },
  { id: "symbols", label: "Symbols" },
  { id: "flags", label: "Flags" },
  { id: "other", label: "Other" },
];

const CATEGORY_PRIORITY: Record<string, number> = Object.fromEntries(
  CATEGORIES.map((c, i) => [c.id, i])
);

export function categorizeEmoji(code: string): string {
  const cp = parseInt(code.split("-")[0], 16);

  // Flags (regional indicator pairs)
  if (cp >= 0x1f1e6 && cp <= 0x1f1ff) return "flags";
  if (cp === 0x1f3f4) return "flags";

  // Smileys & Emotion
  if (cp >= 0x1f600 && cp <= 0x1f64f) return "smileys";
  if (cp >= 0x1f910 && cp <= 0x1f92f) return "smileys";
  if (cp >= 0x1f970 && cp <= 0x1f97a) return "smileys";
  if (cp >= 0x1fae0 && cp <= 0x1faef) return "smileys";
  if (cp === 0x263a || cp === 0x2639) return "smileys";
  if (cp >= 0x2764 && cp <= 0x2767) return "smileys";
  if (cp === 0x2763) return "smileys";
  if (cp >= 0x1f490 && cp <= 0x1f49f) return "smileys";
  if (cp === 0x1f48b || cp === 0x1f48c) return "smileys";
  if (cp >= 0x1f4a0 && cp <= 0x1f4af) return "smileys";
  if (cp === 0x1f573) return "smileys";

  // People & Body
  if (cp >= 0x1f440 && cp <= 0x1f450) return "people";
  if (cp >= 0x1f466 && cp <= 0x1f487) return "people";
  if (cp >= 0x1f48d && cp <= 0x1f48e) return "people";
  if (cp >= 0x1f90c && cp <= 0x1f91f) return "people";
  if (cp >= 0x1f930 && cp <= 0x1f93a) return "people";
  if (cp >= 0x1f9b0 && cp <= 0x1f9b9) return "people";
  if (cp >= 0x1f9d0 && cp <= 0x1f9ff) return "people";
  if (cp >= 0x1fac0 && cp <= 0x1fac5) return "people";
  if (cp >= 0x1faf0 && cp <= 0x1faff) return "people";
  if (cp >= 0x270a && cp <= 0x270d) return "people";
  if (cp === 0x1f385) return "people";
  if (cp >= 0x1f3fb && cp <= 0x1f3ff) return "people";
  if (cp >= 0x1f451 && cp <= 0x1f465) return "people";

  // Animals & Nature
  if (cp >= 0x1f400 && cp <= 0x1f43f) return "animals";
  if (cp >= 0x1f980 && cp <= 0x1f9af) return "animals";
  if (cp >= 0x1fab0 && cp <= 0x1fabf) return "animals";
  if (cp >= 0x1f330 && cp <= 0x1f343) return "animals";
  if (cp >= 0x1f3f5 && cp <= 0x1f3f5) return "animals";

  // Food & Drink
  if (cp >= 0x1f345 && cp <= 0x1f37f) return "food";
  if (cp >= 0x1f950 && cp <= 0x1f96f) return "food";
  if (cp >= 0x1fad0 && cp <= 0x1fadf) return "food";

  // Travel & Places
  if (cp >= 0x1f680 && cp <= 0x1f6ff) return "travel";
  if (cp >= 0x1f300 && cp <= 0x1f32f) return "travel";

  // Activities
  if (cp >= 0x1f3a0 && cp <= 0x1f3f0) return "activities";
  if (cp >= 0x1f93c && cp <= 0x1f945) return "activities";
  if (cp >= 0x26bd && cp <= 0x26be) return "activities";
  if (cp === 0x1f3f3) return "activities";

  // Objects
  if (cp >= 0x1f4b0 && cp <= 0x1f4ff) return "objects";
  if (cp >= 0x1f500 && cp <= 0x1f5ff) return "objects";
  if (cp >= 0x1fa70 && cp <= 0x1faaf) return "objects";
  if (cp >= 0x1f380 && cp <= 0x1f393) return "objects";

  // Symbols
  if (cp >= 0x2600 && cp <= 0x26ff) return "symbols";
  if (cp >= 0x2700 && cp <= 0x27bf) return "symbols";
  if (cp >= 0x2b00 && cp <= 0x2bff) return "symbols";
  if (cp >= 0x1f170 && cp <= 0x1f19a) return "symbols";
  if (cp >= 0x1f200 && cp <= 0x1f2ff) return "symbols";
  if (cp >= 0x3030 && cp <= 0x303d) return "symbols";
  if (cp >= 0x23e9 && cp <= 0x23fa) return "symbols";
  if (cp >= 0x25aa && cp <= 0x25fe) return "symbols";
  if (cp >= 0x2000 && cp <= 0x2bff) return "symbols";

  return "other";
}

export function getEmojiSortKey(code: string): string {
  const category = categorizeEmoji(code);
  const priority = CATEGORY_PRIORITY[category] ?? 99;
  return `${String(priority).padStart(2, "0")}_${code}`;
}
