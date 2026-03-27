export type ShapeType = "coin" | "bubble";

export type ExportFormat = "glb" | "obj" | "stl" | "usdz";

export interface CoinStyle {
  shape: "coin";
  radius: number;
  thickness: number;
  rimWidth: number;
  rimColor: string;
  faceColor: string;
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

export type StyleConfig = CoinStyle | BubbleStyle;

export interface EmojiEntry {
  code: string;
  url: string;
}
