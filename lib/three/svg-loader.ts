import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const LAYER_OFFSET = 0.003;
const EMOJI_DEPTH = 0.05;

export interface EmojiSVGResult {
  group: THREE.Group;
  colors: string[];
}

export async function loadEmojiSVG(
  url: string,
  targetSize: number,
  colorOverrides?: Record<number, string>,
  curveSegments: number = 8,
): Promise<EmojiSVGResult> {
  return new Promise((resolve, reject) => {
    const loader = new SVGLoader();

    loader.load(
      url,
      (data) => {
        const paths = data.paths;
        const emojiGroup = new THREE.Group();
        const originalColors: string[] = [];

        const extrudeSettings: THREE.ExtrudeGeometryOptions = {
          depth: EMOJI_DEPTH,
          bevelEnabled: false,
          curveSegments,
        };

        let globalShapeIndex = 0;

        for (let pathIdx = 0; pathIdx < paths.length; pathIdx++) {
          const path = paths[pathIdx];
          const shapes = SVGLoader.createShapes(path);
          const originalHex = "#" + path.color.getHexString();
          originalColors.push(originalHex);

          const useColor = colorOverrides?.[pathIdx]
            ? new THREE.Color(colorOverrides[pathIdx])
            : path.color;

          const pathMaterial = new THREE.MeshStandardMaterial({
            color: useColor,
            emissive: useColor,
            emissiveIntensity: 0.2,
            roughness: 0.3,
            metalness: 0.1,
            side: THREE.DoubleSide,
          });

          for (const shape of shapes) {
            let geometry: THREE.BufferGeometry = new THREE.ExtrudeGeometry(
              shape,
              extrudeSettings,
            );
            geometry = mergeVertices(geometry);
            geometry.computeVertexNormals();
            const mesh = new THREE.Mesh(geometry, pathMaterial);
            mesh.position.z = globalShapeIndex * LAYER_OFFSET;
            globalShapeIndex++;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            emojiGroup.add(mesh);
          }
        }

        const box = new THREE.Box3().setFromObject(emojiGroup);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Only center X and Y -- keep Z offsets intact so all layers
        // stack upward from z=0. This prevents the bottom layers from
        // dipping below the mounting surface and causing z-fighting.
        emojiGroup.children.forEach((child) => {
          const mesh = child as THREE.Mesh;
          mesh.position.x -= center.x;
          mesh.position.y -= center.y;
        });

        const maxDim = Math.max(size.x, size.y);
        const scale = targetSize / maxDim;
        // Lock Z-scale to 1 so micro-offsets stay at full precision
        emojiGroup.scale.set(scale, -scale, 1);

        resolve({ group: emojiGroup, colors: originalColors });
      },
      undefined,
      reject
    );
  });
}
