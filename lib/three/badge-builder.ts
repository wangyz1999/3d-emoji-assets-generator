import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { BadgeStyle } from "../types";
import { loadEmojiSVG } from "./svg-loader";

function polyShape(radius: number, sides: number): THREE.Shape {
  const shape = new THREE.Shape();
  const startAngle = Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / sides;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.lineTo(
    Math.cos(startAngle) * radius,
    Math.sin(startAngle) * radius
  );
  return shape;
}

function polyPath(radius: number, sides: number): THREE.Path {
  const path = new THREE.Path();
  const startAngle = Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / sides;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.lineTo(
    Math.cos(startAngle) * radius,
    Math.sin(startAngle) * radius
  );
  return path;
}

export function buildBadgeBase(config: BadgeStyle): {
  group: THREE.Group;
  faceZ: number;
} {
  const group = new THREE.Group();
  group.name = "SciFiBadge";

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: config.frameColor,
    emissive: config.frameColor,
    emissiveIntensity: config.emissiveIntensity,
    metalness: config.metalness,
    roughness: config.roughness,
  });

  const sides = config.sides;
  const frameShape = polyShape(config.badgeRadius, sides);
  frameShape.holes.push(polyPath(config.innerRadius, sides));

  const frameExtrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: config.depth,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 2,
    bevelSize: 0.05,
    bevelThickness: 0.05,
  };

  let frameGeometry: THREE.BufferGeometry = new THREE.ExtrudeGeometry(
    frameShape,
    frameExtrudeSettings,
  );
  frameGeometry = mergeVertices(frameGeometry);
  frameGeometry.computeVertexNormals();
  frameGeometry.computeBoundingBox();
  const zOffsetFrame =
    -0.5 *
    (frameGeometry.boundingBox!.max.z + frameGeometry.boundingBox!.min.z);
  frameGeometry.translate(0, 0, zOffsetFrame);

  const frameMesh = new THREE.Mesh(frameGeometry, frameMaterial);
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;
  group.add(frameMesh);

  const innerMaterial = new THREE.MeshStandardMaterial({
    color: config.innerColor,
    metalness: 0.5,
    roughness: 0.6,
  });

  const innerShape = polyShape(config.innerRadius + 0.05, sides);
  const innerDepth = config.depth - 0.15;
  const innerExtrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: innerDepth,
    bevelEnabled: false,
  };
  let innerGeometry: THREE.BufferGeometry = new THREE.ExtrudeGeometry(
    innerShape,
    innerExtrudeSettings,
  );
  innerGeometry = mergeVertices(innerGeometry);
  innerGeometry.computeVertexNormals();
  innerGeometry.computeBoundingBox();
  const zOffsetInner =
    -0.5 *
    (innerGeometry.boundingBox!.max.z + innerGeometry.boundingBox!.min.z);
  innerGeometry.translate(0, 0, zOffsetInner);
  innerGeometry.computeBoundingBox();

  const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
  innerMesh.receiveShadow = true;
  group.add(innerMesh);

  const faceZ = innerGeometry.boundingBox!.max.z;

  return { group, faceZ };
}

export interface BadgeBuildResult {
  group: THREE.Group;
  colors: string[];
}

export async function buildBadge(
  config: BadgeStyle,
  svgUrl: string,
  colorOverrides?: Record<number, string>
): Promise<BadgeBuildResult> {
  const { group, faceZ } = buildBadgeBase(config);

  const { group: emojiGroup, colors } = await loadEmojiSVG(
    svgUrl,
    config.innerRadius * config.emojiScale,
    colorOverrides,
    config.curveSegments,
  );

  const clearance = 0.01;

  const frontEmoji = emojiGroup;
  frontEmoji.position.z = faceZ + clearance;
  group.add(frontEmoji);

  if (config.doubleSided) {
    const backEmoji = emojiGroup.clone();
    backEmoji.rotation.y = Math.PI;
    backEmoji.position.z = -(faceZ + clearance);
    group.add(backEmoji);
  }

  return { group, colors };
}
