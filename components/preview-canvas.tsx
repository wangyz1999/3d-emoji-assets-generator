"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useAppStore } from "@/lib/store";
import { buildCoin } from "@/lib/three/coin-builder";
import { buildBubble } from "@/lib/three/bubble-builder";

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material?.dispose();
      }
    }
  });
}

function SceneContent() {
  const groupRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const [, setVersion] = useState(0);
  const selectedEmoji = useAppStore((s) => s.selectedEmoji);
  const styleConfig = useAppStore((s) => s.styleConfig);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__currentModel = modelRef;
  }, []);

  const buildModel = useCallback(async () => {
    if (!selectedEmoji || !groupRef.current) return;

    while (groupRef.current.children.length > 0) {
      const child = groupRef.current.children[0];
      groupRef.current.remove(child);
      disposeObject(child);
    }
    modelRef.current = null;

    try {
      let model: THREE.Group;
      if (styleConfig.shape === "coin") {
        model = await buildCoin(styleConfig, selectedEmoji.url);
      } else {
        model = await buildBubble(styleConfig, selectedEmoji.url);
      }

      modelRef.current = model;
      if (groupRef.current) {
        groupRef.current.add(model);
      }
      setVersion((v) => v + 1);
    } catch (err) {
      console.error("Failed to build model:", err);
    }
  }, [selectedEmoji, styleConfig]);

  useEffect(() => {
    buildModel();
  }, [buildModel]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.rotation.y += 0.005;
    groupRef.current.position.y = Math.sin(t * 2) * 0.15;
  });

  return <group ref={groupRef} />;
}

export default function PreviewCanvas() {
  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [0, 5, 8], fov: 45 }}
        shadows
        dpr={[1, 2]}
        gl={{
          antialias: true,
          toneMapping: THREE.NoToneMapping,
        }}
      >
        <color attach="background" args={["#141419"]} />
        <fogExp2 attach="fog" args={["#141419", 0.02]} />

        <ambientLight intensity={0.6} />
        <directionalLight
          position={[5, 8, 5]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.001}
        />
        <pointLight position={[-5, 0, -5]} intensity={1} color="#e0e7ff" />

        <SceneContent />

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -4, 0]}
          receiveShadow
        >
          <planeGeometry args={[50, 50]} />
          <shadowMaterial opacity={0.3} />
        </mesh>

        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={3}
          maxDistance={20}
        />
      </Canvas>
    </div>
  );
}
