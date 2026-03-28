"use client";

import dynamic from "next/dynamic";
import EmojiPicker from "@/components/emoji-picker";
import StyleEditor from "@/components/style-editor";
import ExportPanel from "@/components/export-panel";
import CommandPreview from "@/components/command-preview";

const PreviewCanvas = dynamic(() => import("@/components/preview-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
        <p className="text-sm text-zinc-500">Loading 3D renderer...</p>
      </div>
    </div>
  ),
});

export default function Home() {
  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white lg:flex-row">
      {/* Left Panel - Controls */}
      <aside className="flex w-full flex-col border-b border-zinc-800 lg:w-[480px] lg:border-b-0 lg:border-r">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h1 className="text-lg font-bold tracking-tight">
            3D Emoji Generator
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 p-5">
            <StyleEditor />
            <EmojiPicker />
            <ExportPanel />
            <CommandPreview />
          </div>
        </div>
      </aside>

      {/* Right Panel - 3D Preview */}
      <main className="relative min-h-[400px] flex-1">
        <PreviewCanvas />
      </main>
    </div>
  );
}
