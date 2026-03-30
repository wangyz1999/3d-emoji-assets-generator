"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Sky, Stars } from "@react-three/drei";
import * as THREE from "three";
import { useAppStore } from "@/lib/store";
import { buildCoin } from "@/lib/three/coin-builder";
import { buildBubble } from "@/lib/three/bubble-builder";
import { buildPin } from "@/lib/three/pin-builder";
import { buildBadge } from "@/lib/three/badge-builder";
import { buildFlat } from "@/lib/three/flat-builder";
import { Pause, Play, RefreshCw, Grid3x3, SunDim, Layers, Camera, Maximize, Minimize } from "lucide-react";

type EnvTheme = "dark" | "neon" | "sky" | "stars" | "fog" | "chroma-green" | "chroma-blue";

const ENV_THEMES: { id: EnvTheme; label: string }[] = [
  { id: "dark",         label: "Dark"         },
  { id: "neon",         label: "Neon"         },
  { id: "sky",          label: "Sky"          },
  { id: "stars",        label: "Stars"        },
  { id: "fog",          label: "Fog"          },
  { id: "chroma-green", label: "Chroma Green" },
  { id: "chroma-blue",  label: "Chroma Blue"  },
];

// Per-theme config used both inside and outside the Canvas
const THEME_CONFIG: Record<EnvTheme, {
  bg: string;
  fogColor: string | null;   // null = no fog
  fogNear: number;
  fogFar: number;
  fogExp: boolean;           // true = fogExp2, false = linear fog
}> = {
  dark:         { bg: "#141419", fogColor: "#141419", fogNear: 0,  fogFar: 0,  fogExp: true  },
  neon:         { bg: "#0a0014", fogColor: null,       fogNear: 0,  fogFar: 0,  fogExp: false },
  sky:          { bg: "#87ceeb", fogColor: null,       fogNear: 0,  fogFar: 0,  fogExp: false },
  stars:        { bg: "#141419", fogColor: null,       fogNear: 0,  fogFar: 0,  fogExp: false },
  fog:          { bg: "#c8d8e8", fogColor: "#c8d8e8",  fogNear: 6,  fogFar: 22, fogExp: false },
  "chroma-green": { bg: "#00ff00", fogColor: null,     fogNear: 0,  fogFar: 0,  fogExp: false },
  "chroma-blue":  { bg: "#0000ff", fogColor: null,     fogNear: 0,  fogFar: 0,  fogExp: false },
};

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

function applyWireframe(model: THREE.Group, enabled: boolean) {
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => { m.wireframe = enabled; });
    }
  });
}

function SceneContent({
  animated,
  rotateDir,
  wireframe,
  showShadow,
  envTheme,
  onModelReady,
}: {
  animated: boolean;
  rotateDir: 1 | -1;
  wireframe: boolean;
  showShadow: boolean;
  envTheme: EnvTheme;
  onModelReady: (model: THREE.Group | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const wireframeRef = useRef(wireframe);
  const [, setVersion] = useState(0);
  const selectedEmoji = useAppStore((s) => s.selectedEmoji);
  const styleConfig = useAppStore((s) => s.styleConfig);
  const colorOverrides = useAppStore((s) => s.colorOverrides);
  const setEmojiColors = useAppStore((s) => s.setEmojiColors);

  useEffect(() => {
    wireframeRef.current = wireframe;
  }, [wireframe]);

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
    onModelReady(null);

    try {
      let model: THREE.Group;
      let colors: string[] = [];
      if (styleConfig.shape === "coin") {
        const result = await buildCoin(styleConfig, selectedEmoji.url, colorOverrides);
        model = result.group;
        colors = result.colors;
      } else if (styleConfig.shape === "bubble") {
        const result = await buildBubble(styleConfig, selectedEmoji.url, colorOverrides);
        model = result.group;
        colors = result.colors;
      } else if (styleConfig.shape === "pin") {
        const result = await buildPin(styleConfig, selectedEmoji.url, colorOverrides);
        model = result.group;
        colors = result.colors;
      } else if (styleConfig.shape === "badge") {
        const result = await buildBadge(styleConfig, selectedEmoji.url, colorOverrides);
        model = result.group;
        colors = result.colors;
      } else {
        const result = await buildFlat(styleConfig, selectedEmoji.url, colorOverrides);
        model = result.group;
        colors = result.colors;
      }

      setEmojiColors(colors);
      applyWireframe(model, wireframeRef.current);
      modelRef.current = model;
      if (groupRef.current) {
        groupRef.current.add(model);
      }
      onModelReady(model);
      setVersion((v) => v + 1);
    } catch (err) {
      console.error("Failed to build model:", err);
    }
  }, [selectedEmoji, styleConfig, colorOverrides, onModelReady, setEmojiColors]);

  useEffect(() => {
    buildModel();
  }, [buildModel]);

  useEffect(() => {
    if (!modelRef.current) return;
    applyWireframe(modelRef.current, wireframe);
  }, [wireframe]);

  useFrame(({ clock }) => {
    if (!groupRef.current || !animated) return;
    const t = clock.getElapsedTime();
    groupRef.current.rotation.y += 0.005 * rotateDir;
    groupRef.current.position.y = Math.sin(t * 2) * 0.15;
  });

  return (
    <>
      {envTheme === "sky" && (
        <Sky sunPosition={[40, 8, 100]} turbidity={12} rayleigh={0.5} mieCoefficient={0.005} mieDirectionalG={0.8} />
      )}
      {envTheme === "stars" && (
        <Stars radius={80} depth={50} count={4000} factor={4} fade />
      )}
      {envTheme === "neon" && (
        <Grid
          position={[0, -4, 0]}
          args={[40, 40]}
          cellSize={1}
          cellThickness={0.6}
          cellColor="#ff00cc"
          sectionSize={5}
          sectionThickness={1.2}
          sectionColor="#00ffff"
          fadeDistance={28}
          fadeStrength={1.2}
          infiniteGrid
        />
      )}

      <group ref={groupRef} />

      {showShadow && envTheme !== "neon" && envTheme !== "stars" && envTheme !== "chroma-green" && envTheme !== "chroma-blue" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -4, 0]} receiveShadow>
          <planeGeometry args={[50, 50]} />
          <shadowMaterial opacity={0.3} />
        </mesh>
      )}
    </>
  );
}

export default function PreviewCanvas() {
  const [animated, setAnimated] = useState(true);
  const [rotateDir, setRotateDir] = useState<1 | -1>(-1);
  const [wireframe, setWireframe] = useState(false);
  const [showShadow, setShowShadow] = useState(true);
  const [envIndex, setEnvIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const modelRef = useRef<THREE.Group | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  const handleModelReady = useCallback((model: THREE.Group | null) => {
    modelRef.current = model;
  }, []);

  const handleScreenshot = useCallback(() => {
    if (!glRef.current) return;
    const canvas = glRef.current.domElement;
    // Re-render one frame to ensure preserveDrawingBuffer captures correctly
    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "emoji3d-screenshot.png";
    a.click();
  }, []);

  const handleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Force R3F to re-measure the canvas after fullscreen transition
      setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const envTheme = ENV_THEMES[envIndex].id;
  const envLabel = ENV_THEMES[envIndex].label; // used in button title only
  const cfg = THEME_CONFIG[envTheme];

  const btnClass =
    "flex items-center justify-center rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition hover:bg-white/20";

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <Canvas
        onCreated={({ gl }) => { glRef.current = gl; }}
        fallback={
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-900 text-center text-sm text-zinc-400">
            <span className="text-2xl">⚠️</span>
            <p className="font-medium text-zinc-200">WebGL is not available</p>
            <p className="max-w-xs text-xs leading-relaxed">
              Your browser or device does not support WebGL, which is required
              for the 3D preview. Try enabling hardware acceleration in your
              browser settings, or use Chrome/Edge/Safari.
            </p>
          </div>
        }
        camera={{ position: [0, 5, 8], fov: 45 }}
        shadows
        dpr={[1, 2]}
        gl={{
          antialias: true,
          toneMapping: THREE.NoToneMapping,
          preserveDrawingBuffer: true,
        }}
      >
        <color attach="background" args={[cfg.bg]} />

        {/* Fog — always declared at Canvas level so switching theme clears it cleanly */}
        {cfg.fogColor && cfg.fogExp && (
          <fogExp2 attach="fog" args={[cfg.fogColor, 0.02]} />
        )}
        {cfg.fogColor && !cfg.fogExp && (
          <fog attach="fog" args={[cfg.fogColor, cfg.fogNear, cfg.fogFar]} />
        )}

        <ambientLight intensity={envTheme === "neon" ? 0.2 : envTheme === "chroma-green" || envTheme === "chroma-blue" ? 1.2 : 0.6} />
        <directionalLight
          position={[5, 8, 5]}
          intensity={envTheme === "sky" ? 1.0 : envTheme === "chroma-green" || envTheme === "chroma-blue" ? 1.2 : 1.5}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.001}
        />
        {envTheme === "neon" ? (
          <>
            <pointLight position={[-4, 2,  4]} intensity={3} color="#ff00cc" />
            <pointLight position={[ 4, 2, -4]} intensity={3} color="#00ffff" />
          </>
        ) : envTheme === "chroma-green" || envTheme === "chroma-blue" ? null : (
          <pointLight position={[-5, 0, -5]} intensity={1} color="#e0e7ff" />
        )}

        <SceneContent
          animated={animated}
          rotateDir={rotateDir}
          wireframe={wireframe}
          showShadow={showShadow}
          envTheme={envTheme}
          onModelReady={handleModelReady}
        />

        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={3}
          maxDistance={20}
        />
      </Canvas>

      <div className="absolute bottom-3 right-3 flex flex-col gap-2">
        <button
          onClick={handleFullscreen}
          className={btnClass}
          title={isFullscreen ? "Exit fullscreen" : "View fullscreen"}
        >
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
        <button
          onClick={handleScreenshot}
          className={btnClass}
          title="Take screenshot"
        >
          <Camera size={16} />
        </button>
        <button
          onClick={() => setEnvIndex((i) => (i + 1) % ENV_THEMES.length)}
          className={btnClass}
          title={`Environment: ${envLabel} (click to cycle)`}
        >
          <Layers size={16} />
        </button>
        <button
          onClick={() => setRotateDir((d) => (d === 1 ? -1 : 1))}
          className={`${btnClass} ${rotateDir === 1 ? "bg-white/30" : ""}`}
          title={rotateDir === -1 ? "Switch to counter-clockwise" : "Switch to clockwise"}
        >
          <RefreshCw size={16} className={rotateDir === 1 ? "-scale-x-100" : ""} />
        </button>
        <button
          onClick={() => setWireframe((w) => !w)}
          className={`${btnClass} ${wireframe ? "bg-white/30" : ""}`}
          title={wireframe ? "Disable wireframe" : "Enable wireframe"}
        >
          <Grid3x3 size={16} />
        </button>
        <button
          onClick={() => setShowShadow((s) => !s)}
          className={`${btnClass} ${!showShadow ? "bg-white/30" : ""}`}
          title={showShadow ? "Hide shadow" : "Show shadow"}
        >
          <SunDim size={16} />
        </button>
        <button
          onClick={() => setAnimated((a) => !a)}
          className={btnClass}
          title={animated ? "Pause animation" : "Play animation"}
        >
          {animated ? <Pause size={16} /> : <Play size={16} />}
        </button>
      </div>
    </div>
  );
}
