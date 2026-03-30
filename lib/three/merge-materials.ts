import * as THREE from "three";

interface PaletteEntry {
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
  roughness: number;
  metalness: number;
}

/**
 * Bake all materials in a scene into a single texture-atlas material.
 * Operates on a deep clone so the original model is untouched.
 * Returns the cloned group ready for export (caller should dispose it).
 */
export function mergeToSingleMaterial(root: THREE.Group): THREE.Group {
  const clone = deepCloneGroup(root);

  const palette = new Map<string, PaletteEntry>();
  const meshMaterialKeys: Map<THREE.Mesh, string[]> = new Map();

  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mats = Array.isArray(child.material)
      ? child.material
      : [child.material];
    const keys: string[] = [];
    for (const mat of mats) {
      if (mat instanceof THREE.MeshStandardMaterial) {
        const key = mat.color.getHexString();
        if (!palette.has(key)) {
          palette.set(key, {
            color: mat.color.clone(),
            emissive: mat.emissive?.clone() ?? new THREE.Color(0),
            emissiveIntensity: mat.emissiveIntensity ?? 0,
            roughness: mat.roughness ?? 0.5,
            metalness: mat.metalness ?? 0,
          });
        }
        keys.push(key);
      } else {
        const fallback = (mat as THREE.Material & { color?: THREE.Color }).color;
        const key = fallback ? fallback.getHexString() : "000000";
        if (!palette.has(key)) {
          palette.set(key, {
            color: fallback?.clone() ?? new THREE.Color(0),
            emissive: new THREE.Color(0),
            emissiveIntensity: 0,
            roughness: 0.5,
            metalness: 0,
          });
        }
        keys.push(key);
      }
    }
    meshMaterialKeys.set(child as THREE.Mesh, keys);
  });

  const entries = Array.from(palette.entries());
  const size = entries.length;
  if (size === 0) return clone;

  const keyToIdx = new Map<string, number>();
  entries.forEach(([key], i) => keyToIdx.set(key, i));

  const colorTex = buildPaletteTexture(
    entries.map(([, e]) => e.color),
    size,
    true,
  );
  const emissiveTex = buildPaletteTexture(
    entries.map(([, e]) => {
      const c = e.emissive.clone();
      c.multiplyScalar(e.emissiveIntensity);
      return c;
    }),
    size,
    true,
  );
  const rmTex = buildRoughnessMetalnessTexture(
    entries.map(([, e]) => ({ roughness: e.roughness, metalness: e.metalness })),
    size,
  );

  const shared = new THREE.MeshStandardMaterial({
    map: colorTex,
    emissiveMap: emissiveTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1,
    roughnessMap: rmTex,
    roughness: 1,
    metalnessMap: rmTex,
    metalness: 1,
    side: THREE.DoubleSide,
  });

  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mesh = child as THREE.Mesh;
    const keys = meshMaterialKeys.get(mesh);
    if (!keys) return;
    remapMeshUVs(mesh, keys, keyToIdx, size);
    const old = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    old.forEach((m) => m.dispose());
    mesh.material = shared;
  });

  return clone;
}

function deepCloneGroup(root: THREE.Group): THREE.Group {
  const cloned = root.clone(true);
  cloned.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry = child.geometry.clone();
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m: THREE.Material) => m.clone());
      } else {
        child.material = child.material.clone();
      }
    }
  });
  return cloned;
}

function buildPaletteTexture(
  colors: THREE.Color[],
  size: number,
  srgb: boolean,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = 1;
  const ctx = canvas.getContext("2d")!;
  colors.forEach((c, i) => {
    ctx.fillStyle = `#${c.getHexString()}`;
    ctx.fillRect(i, 0, 1, 1);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * GLTF packs roughness into the green channel and metalness into the blue
 * channel of a single metallicRoughness texture. Three's GLTFExporter reads
 * `roughnessMap` green and `metalnessMap` blue. We encode both into one
 * texture so the exporter produces a single packed image.
 */
function buildRoughnessMetalnessTexture(
  values: { roughness: number; metalness: number }[],
  size: number,
): THREE.DataTexture {
  const data = new Uint8Array(size * 4);
  values.forEach((v, i) => {
    const off = i * 4;
    data[off] = 0;
    data[off + 1] = Math.round(v.roughness * 255);
    data[off + 2] = Math.round(v.metalness * 255);
    data[off + 3] = 255;
  });
  const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function remapMeshUVs(
  mesh: THREE.Mesh,
  materialKeys: string[],
  keyToIdx: Map<string, number>,
  paletteSize: number,
): void {
  const geometry = mesh.geometry;
  const uvAttr = geometry.getAttribute("uv");
  if (!uvAttr) return;

  const newUVs = new Float32Array(uvAttr.count * 2);

  if (materialKeys.length === 1) {
    const idx = keyToIdx.get(materialKeys[0]) ?? 0;
    const u = (idx + 0.5) / paletteSize;
    for (let i = 0; i < uvAttr.count; i++) {
      newUVs[i * 2] = u;
      newUVs[i * 2 + 1] = 0.5;
    }
  } else {
    const defaultIdx = keyToIdx.get(materialKeys[0]) ?? 0;
    const defaultU = (defaultIdx + 0.5) / paletteSize;
    for (let i = 0; i < uvAttr.count; i++) {
      newUVs[i * 2] = defaultU;
      newUVs[i * 2 + 1] = 0.5;
    }
    const indexAttr = geometry.getIndex();
    for (const group of geometry.groups) {
      const matIdx = group.materialIndex ?? 0;
      const key = materialKeys[matIdx];
      if (!key) continue;
      const palIdx = keyToIdx.get(key) ?? 0;
      const u = (palIdx + 0.5) / paletteSize;
      if (indexAttr) {
        for (let i = group.start; i < group.start + group.count; i++) {
          const vi = indexAttr.getX(i);
          newUVs[vi * 2] = u;
          newUVs[vi * 2 + 1] = 0.5;
        }
      } else {
        for (let i = group.start; i < group.start + group.count; i++) {
          newUVs[i * 2] = u;
          newUVs[i * 2 + 1] = 0.5;
        }
      }
    }
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(newUVs, 2));
}
