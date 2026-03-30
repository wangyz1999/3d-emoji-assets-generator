import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { PinStyle } from "../types";
import { loadEmojiSVG } from "./svg-loader";

export function buildPinBase(config: PinStyle): {
  group: THREE.Group;
  faceZ: number;
} {
  const group = new THREE.Group();
  group.name = "QuestPin";

  const shellMaterial = new THREE.MeshPhysicalMaterial({
    color: config.shellColor,
    metalness: config.metalness,
    roughness: config.roughness,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  });

  const R = config.pinRadius;
  const L = config.pinPointLength;

  const tangentAngle = Math.acos(R / L);
  const angleRight = -Math.PI / 2 + tangentAngle;
  const angleLeft = 1.5 * Math.PI - tangentAngle;

  const pinShape = new THREE.Shape();
  pinShape.moveTo(0, -L);
  pinShape.lineTo(R * Math.cos(angleRight), R * Math.sin(angleRight));
  pinShape.absarc(0, 0, R, angleRight, angleLeft, false);
  pinShape.lineTo(0, -L);

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: config.depth,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 2,
    bevelSize: 0.12,
    bevelThickness: 0.12,
  };

  let pinGeometry: THREE.BufferGeometry = new THREE.ExtrudeGeometry(
    pinShape,
    extrudeSettings,
  );
  pinGeometry = mergeVertices(pinGeometry);
  pinGeometry.computeVertexNormals();
  pinGeometry.computeBoundingBox();
  const zOffset =
    -0.5 * (pinGeometry.boundingBox!.max.z + pinGeometry.boundingBox!.min.z);
  pinGeometry.translate(0, 0, zOffset);
  pinGeometry.computeBoundingBox();

  const pinMesh = new THREE.Mesh(pinGeometry, shellMaterial);
  pinMesh.castShadow = true;
  pinMesh.receiveShadow = true;
  group.add(pinMesh);

  const innerMaterial = new THREE.MeshStandardMaterial({
    color: config.innerColor,
    roughness: 0.4,
    metalness: 0.0,
  });

  const innerDepth = pinGeometry.boundingBox!.max.z * 2 + 0.04;
  const innerGeo = new THREE.CylinderGeometry(
    config.innerRadius,
    config.innerRadius,
    innerDepth,
    64
  );
  innerGeo.rotateX(Math.PI / 2);

  const innerMesh = new THREE.Mesh(innerGeo, innerMaterial);
  innerMesh.castShadow = true;
  innerMesh.receiveShadow = true;
  group.add(innerMesh);

  const faceZ = innerDepth / 2;

  return { group, faceZ };
}

export interface PinBuildResult {
  group: THREE.Group;
  colors: string[];
}

export async function buildPin(
  config: PinStyle,
  svgUrl: string,
  colorOverrides?: Record<number, string>
): Promise<PinBuildResult> {
  const { group, faceZ } = buildPinBase(config);

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
