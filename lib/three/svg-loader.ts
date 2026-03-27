import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

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
          depth: 0.02,
          bevelEnabled: false,
        };

        let globalShapeIndex = 0;

        for (const path of paths) {
          const shapes = SVGLoader.createShapes(path);
          const pathMaterial = new THREE.MeshStandardMaterial({
            color: path.color,
            roughness: 0.3,
            metalness: 0.1,
            side: THREE.DoubleSide,
          });

          for (const shape of shapes) {
            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            const mesh = new THREE.Mesh(geometry, pathMaterial);
            mesh.position.z = globalShapeIndex * 0.002;
            globalShapeIndex++;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            emojiGroup.add(mesh);
          }
        }

        const box = new THREE.Box3().setFromObject(emojiGroup);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        emojiGroup.children.forEach((child) => {
          const mesh = child as THREE.Mesh;
          mesh.position.x -= center.x;
          mesh.position.y -= center.y;
          mesh.position.z -= center.z;
        });

        const maxDim = Math.max(size.x, size.y);
        const scale = targetSize / maxDim;
        emojiGroup.scale.set(scale, -scale, 1);

        resolve(emojiGroup);
      },
      undefined,
      reject
    );
  });
}
