export type ShapeType = "coin" | "bubble" | "pin" | "badge" | "flat";

export type ExportFormat = "glb" | "obj" | "stl" | "usdz";

export interface CoinStyle {
  shape: "coin";
  radius: number;
  thickness: number;
  rimWidth: number;
  rimColor: string;
  faceColor: string;
  showRim: boolean;
  doubleSided: boolean;
  metalness: number;
  roughness: number;
  emojiScale: number;
}

export interface BubbleStyle {
  shape: "bubble";
  radius: number;
  depth: number;
  tailLength: number;
  tailWidth: number;
  color: string;
  doubleSided: boolean;
  bevelSize: number;
  roughness: number;
  emojiScale: number;
}

export interface PinStyle {
  shape: "pin";
  pinRadius: number;
  innerRadius: number;
  pinPointLength: number;
  depth: number;
  shellColor: string;
  innerColor: string;
  metalness: number;
  roughness: number;
  doubleSided: boolean;
  emojiScale: number;
}

export interface BadgeStyle {
  shape: "badge";
  sides: number;
  badgeRadius: number;
  innerRadius: number;
  depth: number;
  frameColor: string;
  innerColor: string;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
  doubleSided: boolean;
  emojiScale: number;
}

export interface FlatStyle {
  shape: "flat";
  depth: number;
  emojiScale: number;
  roughness: number;
  metalness: number;
}

export type StyleConfig = CoinStyle | BubbleStyle | PinStyle | BadgeStyle | FlatStyle;

export type FileNaming = "unicode" | "shortname";

export interface EmojiEntry {
  code: string;
  url: string;
  name: string;
  shortname: string;
  category: string;
  order: number;
}

export interface EmojiGroup {
  base: EmojiEntry;
  variants: EmojiEntry[];
}
