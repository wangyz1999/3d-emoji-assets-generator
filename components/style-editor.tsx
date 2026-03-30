"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { DEFAULT_COIN, DEFAULT_BUBBLE, DEFAULT_PIN, DEFAULT_BADGE, DEFAULT_FLAT } from "@/lib/constants";
import type { StyleConfig, CoinStyle, BubbleStyle, PinStyle, BadgeStyle, FlatStyle } from "@/lib/types";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-24 shrink-0 text-[11px] text-zinc-400">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-700 accent-blue-500"
      />
      <span className="w-8 shrink-0 text-right text-[11px] font-mono text-zinc-500">
        {value.toFixed(step < 1 ? 2 : 0)}
      </span>
    </div>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-24 shrink-0 text-[11px] text-zinc-400">{label}</label>
      <div className="flex flex-1 items-center justify-end gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-5 cursor-pointer rounded border border-zinc-600 bg-transparent"
        />
        <span className="text-[11px] font-mono text-zinc-500">{value}</span>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-24 shrink-0 text-[11px] text-zinc-400">{label}</label>
      <div className="flex flex-1 justify-end">
        <button
          onClick={() => onChange(!checked)}
          className={`relative h-4 w-7 rounded-full transition-colors ${
            checked ? "bg-blue-500" : "bg-zinc-600"
          }`}
        >
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${
              checked ? "left-[14px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

const SHAPE_OPTIONS = [
  { id: "flat", label: "Flat", defaults: DEFAULT_FLAT },
  { id: "bubble", label: "Bubble", defaults: DEFAULT_BUBBLE },
  { id: "pin", label: "Pin", defaults: DEFAULT_PIN },
  { id: "coin", label: "Coin", defaults: DEFAULT_COIN },
  { id: "badge", label: "Badge", defaults: DEFAULT_BADGE },
] as const;

function ShapeToggle() {
  const { styleConfig, setStyleConfig } = useAppStore();

  const switchTo = (shape: string) => {
    if (shape === styleConfig.shape) return;
    const option = SHAPE_OPTIONS.find((o) => o.id === shape);
    if (option) setStyleConfig({ ...option.defaults });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 rounded-lg bg-zinc-800 p-1">
        {SHAPE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => switchTo(opt.id)}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              styleConfig.shape === opt.id
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CoinControls({ config }: { config: CoinStyle }) {
  const { updateStyleConfig } = useAppStore();
  const update = (partial: Partial<CoinStyle>) =>
    updateStyleConfig(partial as Partial<StyleConfig>);

  return (
    <div className="flex flex-col gap-2">
      <Slider
        label="Radius"
        value={config.radius}
        min={1}
        max={5}
        step={0.1}
        onChange={(v) => update({ radius: v })}
      />
      <Slider
        label="Thickness"
        value={config.thickness}
        min={0.05}
        max={1}
        step={0.05}
        onChange={(v) => update({ thickness: v })}
      />
      <Toggle
        label="Show Rim"
        checked={config.showRim}
        onChange={(v) => update({ showRim: v })}
      />
      {config.showRim && (
        <>
          <Slider
            label="Rim Width"
            value={config.rimWidth}
            min={0}
            max={0.3}
            step={0.01}
            onChange={(v) => update({ rimWidth: v })}
          />
          <ColorInput
            label="Rim Color"
            value={config.rimColor}
            onChange={(v) => update({ rimColor: v })}
          />
        </>
      )}
      <ColorInput
        label="Face Color"
        value={config.faceColor}
        onChange={(v) => update({ faceColor: v })}
      />
      <Slider
        label="Metalness"
        value={config.metalness}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => update({ metalness: v })}
      />
      <Slider
        label="Roughness"
        value={config.roughness}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => update({ roughness: v })}
      />
      <Slider
        label="Emoji Scale"
        value={config.emojiScale}
        min={0.5}
        max={2}
        step={0.05}
        onChange={(v) => update({ emojiScale: v })}
      />
      <Toggle
        label="Double Sided"
        checked={config.doubleSided}
        onChange={(v) => update({ doubleSided: v })}
      />
    </div>
  );
}

function BubbleControls({ config }: { config: BubbleStyle }) {
  const { updateStyleConfig } = useAppStore();
  const update = (partial: Partial<BubbleStyle>) =>
    updateStyleConfig(partial as Partial<StyleConfig>);

  return (
    <div className="flex flex-col gap-2">
      <Slider
        label="Radius"
        value={config.radius}
        min={1}
        max={5}
        step={0.1}
        onChange={(v) => update({ radius: v })}
      />
      <Slider
        label="Depth"
        value={config.depth}
        min={0.05}
        max={1}
        step={0.05}
        onChange={(v) => update({ depth: v })}
      />
      <Slider
        label="Tail Length"
        value={config.tailLength}
        min={0.2}
        max={3}
        step={0.1}
        onChange={(v) => update({ tailLength: v })}
      />
      <Slider
        label="Tail Width"
        value={config.tailWidth}
        min={0.1}
        max={1.5}
        step={0.05}
        onChange={(v) => update({ tailWidth: v })}
      />
      <ColorInput
        label="Color"
        value={config.color}
        onChange={(v) => update({ color: v })}
      />
      <Slider
        label="Bevel Size"
        value={config.bevelSize}
        min={0}
        max={0.3}
        step={0.01}
        onChange={(v) => update({ bevelSize: v })}
      />
      <Slider
        label="Roughness"
        value={config.roughness}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => update({ roughness: v })}
      />
      <Slider
        label="Emoji Scale"
        value={config.emojiScale}
        min={0.5}
        max={2}
        step={0.05}
        onChange={(v) => update({ emojiScale: v })}
      />
      <Toggle
        label="Double Sided"
        checked={config.doubleSided}
        onChange={(v) => update({ doubleSided: v })}
      />
    </div>
  );
}

function PinControls({ config }: { config: PinStyle }) {
  const { updateStyleConfig } = useAppStore();
  const update = (partial: Partial<PinStyle>) =>
    updateStyleConfig(partial as Partial<StyleConfig>);

  return (
    <div className="flex flex-col gap-2">
      <Slider
        label="Pin Radius"
        value={config.pinRadius}
        min={1}
        max={5}
        step={0.1}
        onChange={(v) => update({ pinRadius: v })}
      />
      <Slider
        label="Inner Radius"
        value={config.innerRadius}
        min={0.5}
        max={4}
        step={0.1}
        onChange={(v) => update({ innerRadius: v })}
      />
      <Slider
        label="Point Length"
        value={config.pinPointLength}
        min={2}
        max={8}
        step={0.1}
        onChange={(v) => update({ pinPointLength: v })}
      />
      <Slider
        label="Depth"
        value={config.depth}
        min={0.1}
        max={1}
        step={0.05}
        onChange={(v) => update({ depth: v })}
      />
      <ColorInput
        label="Shell Color"
        value={config.shellColor}
        onChange={(v) => update({ shellColor: v })}
      />
      <ColorInput
        label="Inner Color"
        value={config.innerColor}
        onChange={(v) => update({ innerColor: v })}
      />
      <Slider
        label="Metalness"
        value={config.metalness}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => update({ metalness: v })}
      />
      <Slider
        label="Roughness"
        value={config.roughness}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => update({ roughness: v })}
      />
      <Slider
        label="Emoji Scale"
        value={config.emojiScale}
        min={0.5}
        max={2}
        step={0.05}
        onChange={(v) => update({ emojiScale: v })}
      />
      <Toggle
        label="Double Sided"
        checked={config.doubleSided}
        onChange={(v) => update({ doubleSided: v })}
      />
    </div>
  );
}

function BadgeControls({ config }: { config: BadgeStyle }) {
  const { updateStyleConfig } = useAppStore();
  const update = (partial: Partial<BadgeStyle>) =>
    updateStyleConfig(partial as Partial<StyleConfig>);

  return (
    <div className="flex flex-col gap-2">
      <Slider
        label="Polygon Sides"
        value={config.sides}
        min={3}
        max={10}
        step={1}
        onChange={(v) => update({ sides: v })}
      />
      <Slider
        label="Badge Radius"
        value={config.badgeRadius}
        min={1}
        max={5}
        step={0.1}
        onChange={(v) => update({ badgeRadius: v })}
      />
      <Slider
        label="Inner Radius"
        value={config.innerRadius}
        min={0.5}
        max={4}
        step={0.1}
        onChange={(v) => update({ innerRadius: v })}
      />
      <Slider
        label="Depth"
        value={config.depth}
        min={0.1}
        max={1}
        step={0.05}
        onChange={(v) => update({ depth: v })}
      />
      <ColorInput
        label="Frame Color"
        value={config.frameColor}
        onChange={(v) => update({ frameColor: v })}
      />
      <ColorInput
        label="Inner Color"
        value={config.innerColor}
        onChange={(v) => update({ innerColor: v })}
      />
      <Slider
        label="Glow Intensity"
        value={config.emissiveIntensity}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => update({ emissiveIntensity: v })}
      />
      <Slider
        label="Metalness"
        value={config.metalness}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => update({ metalness: v })}
      />
      <Slider
        label="Roughness"
        value={config.roughness}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => update({ roughness: v })}
      />
      <Slider
        label="Emoji Scale"
        value={config.emojiScale}
        min={0.5}
        max={2}
        step={0.05}
        onChange={(v) => update({ emojiScale: v })}
      />
      <Toggle
        label="Double Sided"
        checked={config.doubleSided}
        onChange={(v) => update({ doubleSided: v })}
      />
    </div>
  );
}

function FlatControls({ config }: { config: FlatStyle }) {
  const { updateStyleConfig } = useAppStore();
  const update = (partial: Partial<FlatStyle>) =>
    updateStyleConfig(partial as Partial<StyleConfig>);

  return (
    <div className="flex flex-col gap-2">
      <Slider
        label="Depth"
        value={config.depth}
        min={0.2}
        max={10}
        step={0.1}
        onChange={(v) => update({ depth: v })}
      />
      <Slider
        label="Metalness"
        value={config.metalness}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => update({ metalness: v })}
      />
      <Slider
        label="Roughness"
        value={config.roughness}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => update({ roughness: v })}
      />
      <Slider
        label="Emoji Scale"
        value={config.emojiScale}
        min={0.5}
        max={2}
        step={0.05}
        onChange={(v) => update({ emojiScale: v })}
      />
    </div>
  );
}

function ShapeControls() {
  const { styleConfig } = useAppStore();

  switch (styleConfig.shape) {
    case "coin":
      return <CoinControls config={styleConfig} />;
    case "bubble":
      return <BubbleControls config={styleConfig} />;
    case "pin":
      return <PinControls config={styleConfig} />;
    case "badge":
      return <BadgeControls config={styleConfig} />;
    case "flat":
      return <FlatControls config={styleConfig} />;
  }
}

export default function StyleEditor() {
  const isMobile = useIsMobile();
  const [controlsOpen, setControlsOpen] = useState(!isMobile);

  useEffect(() => {
    setControlsOpen(!isMobile);
  }, [isMobile]);

  return (
    <div className="flex flex-col gap-4">
      {isMobile ? (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <ShapeToggle />
            </div>
            <button
              onClick={() => setControlsOpen((o) => !o)}
              className="flex h-[34px] items-center gap-1 rounded-lg bg-zinc-800 px-2.5 text-[11px] font-medium text-zinc-400 transition-colors hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <ChevronIcon open={controlsOpen} />
            </button>
          </div>
          {controlsOpen && (
            <div className="border-t border-zinc-700/50 pt-3">
              <ShapeControls />
            </div>
          )}
        </>
      ) : (
        <>
          <ShapeToggle />
          <div className="border-t border-zinc-700/50 pt-3">
            <ShapeControls />
          </div>
        </>
      )}
    </div>
  );
}
