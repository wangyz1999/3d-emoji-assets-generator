"use client";

import dynamic from "next/dynamic";
import EmojiPicker from "@/components/emoji-picker";
import StyleEditor from "@/components/style-editor";
import ExportPanel from "@/components/export-panel";
import CommandPreview from "@/components/command-preview";
import MobileExportBar from "@/components/mobile-export-bar";

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
        <div className="border-b border-zinc-800 px-5 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              3D Emoji
            </span>{" "}
            <span className="text-white">Generator</span>
          </h1>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/wangyz1999/3d-emoji-assets-generator"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
              title="GitHub"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
            <a
              href="https://buymeacoffee.com/wangyz1999"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-yellow-400"
              title="Buy Me a Coffee"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {/* steam */}
                <path d="M8 3c0 1 1 1 1 2s-1 1-1 2"/>
                <path d="M12 3c0 1 1 1 1 2s-1 1-1 2"/>
                {/* cup body */}
                <path d="M5 8h14l-1.5 9a2 2 0 0 1-2 1.5h-7a2 2 0 0 1-2-1.5L5 8z"/>
                {/* handle */}
                <path d="M19 9h1a2 2 0 0 1 0 4h-1"/>
                {/* saucer */}
                <line x1="3" y1="20" x2="21" y2="20"/>
              </svg>
            </a>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-3 p-5 lg:gap-5">
            <StyleEditor />
            <EmojiPicker />
            {/* Mobile: compact single-row export + format + CLI */}
            <div className="lg:hidden">
              <MobileExportBar />
            </div>
            {/* Desktop: full export panel + CLI preview */}
            <div className="hidden lg:flex lg:flex-col lg:gap-5">
              <ExportPanel />
              <CommandPreview />
            </div>
          </div>
          <p className="attribution-sidebar px-5 pt-3 pb-4 text-xs text-zinc-500">
            Emoji graphics by{" "}
            <a href="https://github.com/jdecked/twemoji" target="_blank" rel="noopener noreferrer" className="text-zinc-400 underline hover:text-white">Twemoji</a>{" "}
            © Twitter/X Corp, licensed under{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="text-zinc-400 underline hover:text-white">CC-BY 4.0</a>
          </p>
        </div>
      </aside>

      {/* Right Panel - 3D Preview */}
      <main className="relative min-h-[400px] flex-1">
        <PreviewCanvas />
        <p className="attribution-canvas absolute bottom-2 left-0 right-0 text-center text-xs text-zinc-500">
          Emoji graphics by{" "}
          <a href="https://github.com/jdecked/twemoji" target="_blank" rel="noopener noreferrer" className="text-zinc-400 underline hover:text-white">Twemoji</a>
        </p>
      </main>
    </div>
  );
}
