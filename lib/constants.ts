import type { CoinStyle, BubbleStyle, PinStyle, BadgeStyle } from "./types";

export const TWEMOJI_VERSION = "17.0.2";
export const TWEMOJI_BASE_URL = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@${TWEMOJI_VERSION}/assets/svg`;
export const JSDELIVR_API_URL = `https://data.jsdelivr.com/v1/packages/gh/jdecked/twemoji@${TWEMOJI_VERSION}`;

export const DEFAULT_EMOJI_CODE = "1f602";

export const DEFAULT_COIN: CoinStyle = {
  shape: "coin",
  radius: 2.5,
  thickness: 0.3,
  rimWidth: 0.07,
  rimColor: "#2c3e50",
  faceColor: "#ffffff",
  showRim: true,
  doubleSided: true,
  metalness: 0.2,
  roughness: 0.4,
  emojiScale: 1.3,
};

export const DEFAULT_BUBBLE: BubbleStyle = {
  shape: "bubble",
  radius: 2.5,
  depth: 0.25,
  tailLength: 0.8,
  tailWidth: 0.4,
  color: "#e8e8e8",
  doubleSided: true,
  bevelSize: 0.15,
  roughness: 0.5,
  emojiScale: 1.3,
};

export const DEFAULT_PIN: PinStyle = {
  shape: "pin",
  pinRadius: 2.2,
  innerRadius: 1.5,
  pinPointLength: 4.5,
  depth: 0.3,
  shellColor: "#ef4444",
  innerColor: "#ffffff",
  metalness: 0.1,
  roughness: 0.2,
  doubleSided: true,
  emojiScale: 1.4,
};

export const DEFAULT_BADGE: BadgeStyle = {
  shape: "badge",
  sides: 6,
  badgeRadius: 2.5,
  innerRadius: 2.0,
  depth: 0.4,
  frameColor: "#22d3ee",
  innerColor: "#1e293b",
  emissiveIntensity: 0.6,
  metalness: 0.8,
  roughness: 0.2,
  doubleSided: true,
  emojiScale: 1.35,
};

export const EXPORT_FORMATS = [
  { id: "glb" as const, name: "GLB", description: "Binary glTF (recommended)" },
  { id: "obj" as const, name: "OBJ", description: "Wavefront OBJ (geometry only)" },
  { id: "stl" as const, name: "STL", description: "Stereolithography (3D printing)" },
  { id: "usdz" as const, name: "USDZ", description: "Apple AR QuickLook" },
];
