import * as THREE from "three";
import type { CoinStyle } from "../types";
import { loadEmojiSVG } from "./svg-loader";

export function buildCoinBase(config: CoinStyle): THREE.Group {
  const group = new THREE.Group();
  group.name = "Coin";

  const rimMaterial = new THREE.MeshStandardMaterial({
    color: config.rimColor,
    roughness: config.roughness,
    metalness: config.metalness,
  });

  const faceMaterial = new THREE.MeshStandardMaterial({
    color: config.faceColor,
    roughness: Math.max(0.1, config.roughness - 0.2),
    metalness: Math.max(0, config.metalness - 0.1),
  });

  const bodyGeometry = new THREE.CylinderGeometry(
    config.radius,
    config.radius,
    config.thickness,
    64
  );
  bodyGeometry.rotateX(Math.PI / 2);

  const coinBody = new THREE.Mesh(bodyGeometry, [
    rimMaterial,
    faceMaterial,
    faceMaterial,
  ]);
  coinBody.castShadow = true;
  coinBody.receiveShadow = true;
  group.add(coinBody);

  const innerRadius = config.radius * (1 - config.rimWidth);
  const ringGeometry = new THREE.RingGeometry(innerRadius, config.radius, 64);

  const frontRing = new THREE.Mesh(ringGeometry, rimMaterial);
  frontRing.position.z = config.thickness / 2 + 0.005;
  frontRing.receiveShadow = true;
  group.add(frontRing);

  const backRing = new THREE.Mesh(ringGeometry, rimMaterial);
  backRing.position.z = -(config.thickness / 2) - 0.005;
  backRing.rotation.y = Math.PI;
  backRing.receiveShadow = true;
  group.add(backRing);

  return group;
}

export async function buildCoin(
  config: CoinStyle,
  svgUrl: string
): Promise<THREE.Group> {
  const group = buildCoinBase(config);

  const emojiGroup = await loadEmojiSVG(
    svgUrl,
    config.radius * config.emojiScale
  );

  const frontEmoji = emojiGroup;
  frontEmoji.position.z = config.thickness / 2 + 0.01;
  group.add(frontEmoji);

  if (config.doubleSided) {
    const backEmoji = emojiGroup.clone();
    backEmoji.rotation.y = Math.PI;
    backEmoji.position.z = -(config.thickness / 2) - 0.01;
    group.add(backEmoji);
  }

  return group;
}
