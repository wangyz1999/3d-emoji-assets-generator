import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import type { FlatStyle } from "../types";

const LAYER_OFFSET = 0.003;

export async function buildFlat(
  config: FlatStyle,
  svgUrl: string
): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const loader = new SVGLoader();

    loader.load(
      svgUrl,
      (data) => {
        const group = new THREE.Group();
        group.name = "FlatEmoji";

        // Count total shapes so we can assign decreasing depth per layer
        let totalShapes = 0;
        for (const path of data.paths) {
          totalShapes += SVGLoader.createShapes(path).length;
        }

        let globalShapeIndex = 0;

        for (const path of data.paths) {
          const shapes = SVGLoader.createShapes(path);
          const material = new THREE.MeshStandardMaterial({
            color: path.color,
            emissive: path.color,
            emissiveIntensity: 0.15,
            roughness: config.roughness,
            metalness: config.metalness,
            side: THREE.DoubleSide,
          });

          for (const shape of shapes) {
            // Top layers (high index = face details) get full depth so they
            // protrude past the background on both sides. Bottom layers
            // (low index = background circle) get the least depth.
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

            // Center the extrusion around z=0 so it extends equally in ±z.
            // Then nudge forward slightly per layer to prevent z-fighting.
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

        resolve(group);
      },
      undefined,
      reject
    );
  });
}
