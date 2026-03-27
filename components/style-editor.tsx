"use client";

import { useAppStore } from "@/lib/store";
import { DEFAULT_COIN, DEFAULT_BUBBLE } from "@/lib/constants";
import type { StyleConfig, CoinStyle, BubbleStyle } from "@/lib/types";

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
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-zinc-400">{label}</label>
        <span className="text-xs font-mono text-zinc-500">
          {value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-blue-500"
      />
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
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs text-zinc-400">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 cursor-pointer rounded border border-zinc-600 bg-transparent"
        />
        <span className="text-xs font-mono text-zinc-500">{value}</span>
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
    <div className="flex items-center justify-between">
      <label className="text-xs text-zinc-400">{label}</label>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? "bg-blue-500" : "bg-zinc-600"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function ShapeToggle() {
  const { styleConfig, setStyleConfig } = useAppStore();
  const isCoin = styleConfig.shape === "coin";

  const switchTo = (shape: "coin" | "bubble") => {
    if (shape === styleConfig.shape) return;
    if (shape === "coin") {
      setStyleConfig({ ...DEFAULT_COIN });
    } else {
      setStyleConfig({ ...DEFAULT_BUBBLE });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Shape
      </label>
      <div className="flex gap-1 rounded-lg bg-zinc-800 p-1">
        <button
          onClick={() => switchTo("coin")}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
            isCoin
              ? "bg-blue-600 text-white"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Coin
        </button>
        <button
          onClick={() => switchTo("bubble")}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
            !isCoin
              ? "bg-blue-600 text-white"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Bubble
        </button>
      </div>
    </div>
  );
}

function CoinControls({ config }: { config: CoinStyle }) {
  const { updateStyleConfig } = useAppStore();
  const update = (partial: Partial<CoinStyle>) =>
    updateStyleConfig(partial as Partial<StyleConfig>);

  return (
    <div className="flex flex-col gap-3">
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
    <div className="flex flex-col gap-3">
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

export default function StyleEditor() {
  const { styleConfig } = useAppStore();

  return (
    <div className="flex flex-col gap-4">
      <ShapeToggle />
      <div className="border-t border-zinc-700/50 pt-3">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Settings
        </label>
        {styleConfig.shape === "coin" ? (
          <CoinControls config={styleConfig} />
        ) : (
          <BubbleControls config={styleConfig} />
        )}
      </div>
    </div>
  );
}
