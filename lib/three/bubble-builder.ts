import * as THREE from "three";
import type { BubbleStyle } from "../types";
import { loadEmojiSVG } from "./svg-loader";

export function buildBubbleBase(config: BubbleStyle): {
  group: THREE.Group;
  maxZ: number;
} {
  const group = new THREE.Group();
  group.name = "EmotionBubble";

  const material = new THREE.MeshStandardMaterial({
    color: config.color,
    roughness: config.roughness,
    metalness: 0.0,
    emissive: 0x111111,
  });

  const R = config.radius;
  const bubbleShape = new THREE.Shape();

  const mergeY = -Math.sqrt(R * R - config.tailWidth * config.tailWidth);
  const startAngle = Math.atan2(mergeY, config.tailWidth);
  const endAngle = Math.atan2(mergeY, -config.tailWidth);

  bubbleShape.moveTo(0, -R - config.tailLength);
  bubbleShape.lineTo(config.tailWidth, mergeY);
  bubbleShape.absarc(0, 0, R, startAngle, endAngle, false);
  bubbleShape.lineTo(0, -R - config.tailLength);

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: config.depth,
    bevelEnabled: true,
    bevelSegments: 5,
    steps: 3,
    bevelSize: config.bevelSize,
    bevelThickness: config.bevelSize,
  };

  const geometry = new THREE.ExtrudeGeometry(bubbleShape, extrudeSettings);
  geometry.computeBoundingBox();

  const zOffset =
    -0.5 *
    (geometry.boundingBox!.max.z + geometry.boundingBox!.min.z);
  geometry.translate(0, 0, zOffset);
  geometry.computeBoundingBox();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  return { group, maxZ: geometry.boundingBox!.max.z };
}

export interface BubbleBuildResult {
  group: THREE.Group;
  colors: string[];
}

export async function buildBubble(
  config: BubbleStyle,
  svgUrl: string,
  colorOverrides?: Record<number, string>
): Promise<BubbleBuildResult> {
  const { group, maxZ } = buildBubbleBase(config);

  const { group: emojiGroup, colors } = await loadEmojiSVG(
    svgUrl,
    config.radius * config.emojiScale,
    colorOverrides
  );

  const frontEmoji = emojiGroup;
  frontEmoji.position.z = maxZ + 0.01;
  frontEmoji.position.y = 0;
  group.add(frontEmoji);

  if (config.doubleSided) {
    const backEmoji = emojiGroup.clone();
    backEmoji.rotation.y = Math.PI;
    backEmoji.position.z = -maxZ - 0.01;
    backEmoji.position.y = 0;
    group.add(backEmoji);
  }

  return { group, colors };
}
