import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import type { FlatStyle } from "../types";

const LAYER_OFFSET = 0.003;

export interface FlatBuildResult {
  group: THREE.Group;
  colors: string[];
}

export async function buildFlat(
  config: FlatStyle,
  svgUrl: string,
  colorOverrides?: Record<number, string>
): Promise<FlatBuildResult> {
  return new Promise((resolve, reject) => {
    const loader = new SVGLoader();

    loader.load(
      svgUrl,
      (data) => {
        const group = new THREE.Group();
        group.name = "FlatEmoji";
        const originalColors: string[] = [];

        let totalShapes = 0;
        for (const path of data.paths) {
          totalShapes += SVGLoader.createShapes(path).length;
        }

        let globalShapeIndex = 0;

        for (let pathIdx = 0; pathIdx < data.paths.length; pathIdx++) {
          const path = data.paths[pathIdx];
          const shapes = SVGLoader.createShapes(path);
          const originalHex = "#" + path.color.getHexString();
          originalColors.push(originalHex);

          const useColor = colorOverrides?.[pathIdx]
            ? new THREE.Color(colorOverrides[pathIdx])
            : path.color;

          const material = new THREE.MeshStandardMaterial({
            color: useColor,
            emissive: useColor,
            emissiveIntensity: 0.15,
            roughness: config.roughness,
            metalness: config.metalness,
            side: THREE.DoubleSide,
          });

          for (const shape of shapes) {
            const t = totalShapes > 1 ? globalShapeIndex / (totalShapes - 1) : 1;
            const layerDepth = config.depth * (0.5 + t * 0.5);

            const extrudeSettings: THREE.ExtrudeGeometryOptions = {
              depth: layerDepth,
              bevelEnabled: true,
              bevelSegments: 3,
              bevelSize: 0.02 * layerDepth,
              bevelThickness: 0.02 * layerDepth,
            };

            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

            geometry.translate(0, 0, -layerDepth / 2);

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.z = globalShapeIndex * LAYER_OFFSET;
            globalShapeIndex++;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);
          }
        }

        const box = new THREE.Box3().setFromObject(group);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        group.children.forEach((child) => {
          const mesh = child as THREE.Mesh;
          mesh.position.x -= center.x;
          mesh.position.y -= center.y;
        });

        const targetSize = 2.5 * config.emojiScale;
        const maxDim = Math.max(size.x, size.y);
        const scale = targetSize / maxDim;
        group.scale.set(scale, -scale, scale);

        resolve({ group, colors: originalColors });
      },
      undefined,
      reject
    );
  });
}
