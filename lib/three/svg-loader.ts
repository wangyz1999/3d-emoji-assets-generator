import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

const LAYER_OFFSET = 0.003;
const EMOJI_DEPTH = 0.05;

export async function loadEmojiSVG(
  url: string,
  targetSize: number
): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const loader = new SVGLoader();

    loader.load(
      url,
      (data) => {
        const paths = data.paths;
        const emojiGroup = new THREE.Group();

        const extrudeSettings: THREE.ExtrudeGeometryOptions = {
          depth: EMOJI_DEPTH,
          bevelEnabled: false,
        };

        let globalShapeIndex = 0;

        for (const path of paths) {
          const shapes = SVGLoader.createShapes(path);
          const pathMaterial = new THREE.MeshStandardMaterial({
            color: path.color,
            emissive: path.color,
            emissiveIntensity: 0.2,
            roughness: 0.3,
            metalness: 0.1,
            side: THREE.DoubleSide,
          });

          for (const shape of shapes) {
            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
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

        resolve(emojiGroup);
      },
      undefined,
      reject
    );
  });
}
