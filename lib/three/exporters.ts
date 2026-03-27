import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";
import type { ExportFormat } from "../types";

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.style.display = "none";
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export async function exportModel(
  object: THREE.Group,
  format: ExportFormat,
  filename: string
): Promise<void> {
  const originalRotation = object.rotation.clone();
  const originalPosition = object.position.clone();
  object.rotation.set(0, 0, 0);
  object.position.set(0, 0, 0);

  try {
    switch (format) {
      case "glb":
        await exportGLB(object, filename);
        break;
      case "obj":
        exportOBJ(object, filename);
        break;
      case "stl":
        exportSTL(object, filename);
        break;
      case "usdz":
        await exportUSDZ(object, filename);
        break;
    }
  } finally {
    object.rotation.copy(originalRotation);
    object.position.copy(originalPosition);
  }
}

async function exportGLB(
  object: THREE.Object3D,
  filename: string
): Promise<void> {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (gltf) => {
        const blob = new Blob([gltf as ArrayBuffer], {
          type: "application/octet-stream",
        });
        downloadBlob(blob, `${filename}.glb`);
        resolve();
      },
      (error) => reject(error),
      { binary: true }
    );
  });
}

function exportOBJ(object: THREE.Object3D, filename: string): void {
  const exporter = new OBJExporter();
  const result = exporter.parse(object);
  const blob = new Blob([result], { type: "text/plain" });
  downloadBlob(blob, `${filename}.obj`);
}

function exportSTL(object: THREE.Object3D, filename: string): void {
  const exporter = new STLExporter();
  const result = exporter.parse(object, { binary: true });
  const buffer = result instanceof DataView ? result.buffer as ArrayBuffer : result;
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  downloadBlob(blob, `${filename}.stl`);
}

async function exportUSDZ(
  object: THREE.Object3D,
  filename: string
): Promise<void> {
  const exporter = new USDZExporter();
  const result = await exporter.parseAsync(object);
  const blob = new Blob([result], {
    type: "model/vnd.usdz+zip",
  });
  downloadBlob(blob, `${filename}.usdz`);
}
