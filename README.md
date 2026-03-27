# 3D Emoji Assets Generator

Generate customizable 3D emoji assets from [Twemoji](https://github.com/jdecked/twemoji) SVGs. Choose from multiple shape presets (coins, speech bubbles), tweak every parameter, preview in real-time, and export as GLB, OBJ, STL, or USDZ — all in your browser. Includes a CLI for batch generation.

## Features

- **Full Twemoji library** — browse and search all 3,600+ emoji SVGs
- **Multiple shape presets** — Gold Coin, Silver Coin, Chat Bubble, Thought Bubble, and more
- **Real-time 3D preview** — orbit, zoom, and inspect your model with Three.js
- **Granular style controls** — radius, thickness, rim width, colors, metalness, roughness, bevel, tail dimensions, emoji scale, single/double sided
- **Browser-based export** — download individual assets as `.glb`, `.obj`, `.stl`, or `.usdz`
- **CLI batch generation** — generate hundreds of emoji assets with a single command
- **Command preview** — tweak styles in the web editor, then copy the equivalent CLI command for batch runs
- **Consistent file naming** — all files named by Unicode code point (e.g., `1f004.glb`, `1f60a.obj`)

## Use Cases

- **NPC emotion indicators** — mount a speech bubble above an NPC's head showing their current emotion
- **Game UI coins** — collectible coin items with emoji faces for rewards, currencies, or achievements
- **Chat/messaging 3D stickers** — embed 3D emoji in AR/VR messaging apps
- **3D printing** — export STL files of your favorite emoji as physical objects
- **Apple AR QuickLook** — export USDZ for instant AR previews on iOS

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/your-username/3d-emoji-assets-generator.git
cd 3d-emoji-assets-generator
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the web editor.

### Production Build

```bash
npm run build
npm start
```

## Web Editor

The web app provides a two-panel interface:

**Left panel — Controls:**
1. **Presets** — quick-select from predefined styles (Gold Coin, Chat Bubble, etc.)
2. **Shape toggle** — switch between Coin and Bubble
3. **Style settings** — sliders and color pickers for all parameters (conditional on shape type)
4. **Emoji picker** — searchable grid of all Twemoji SVGs
5. **Export** — format selector (GLB/OBJ/STL/USDZ) and download button
6. **CLI Command** — expandable section showing the CLI command that reproduces your current settings

**Right panel — 3D Preview:**
- Click and drag to rotate
- Scroll to zoom
- Auto-rotates and bobs for presentation

## Style Parameters

### Coin

| Parameter | CLI Flag | Range | Description |
|-----------|----------|-------|-------------|
| Radius | `--radius` | 1–5 | Coin radius |
| Thickness | `--thickness` | 0.05–1 | Coin edge thickness |
| Rim Width | `--rim-width` | 0–0.3 | Border ring width (proportion) |
| Rim Color | `--rim-color` | hex | Color of the rim/edge |
| Face Color | `--face-color` | hex | Color of the flat faces |
| Metalness | `--metalness` | 0–1 | PBR metalness |
| Roughness | `--roughness` | 0–1 | PBR roughness |
| Emoji Scale | `--emoji-scale` | 0.5–2 | Size of emoji relative to coin |
| Double Sided | `--single-sided` | flag | Omit to get emoji on both faces |

### Bubble

| Parameter | CLI Flag | Range | Description |
|-----------|----------|-------|-------------|
| Radius | `--radius` | 1–5 | Bubble circle radius |
| Depth | `--depth` | 0.05–1 | Extrusion depth |
| Tail Length | `--tail-length` | 0.2–3 | Speech bubble tail length |
| Tail Width | `--tail-width` | 0.1–1.5 | Speech bubble tail width |
| Color | `--color` | hex | Bubble color |
| Bevel Size | `--bevel-size` | 0–0.3 | Edge rounding amount |
| Roughness | `--roughness` | 0–1 | PBR roughness |
| Emoji Scale | `--emoji-scale` | 0.5–2 | Size of emoji relative to bubble |
| Double Sided | `--single-sided` | flag | Omit to get emoji on both faces |

## CLI Usage

The CLI uses Puppeteer to render models headlessly. **The dev server must be running.**

### Setup

Start the dev server in one terminal:

```bash
npm run dev
```

### Generate a single emoji

```bash
npx tsx cli/index.ts generate --shape coin --emojis 1f60a --format glb --output ./output/
```

### Generate with custom style

```bash
npx tsx cli/index.ts generate \
  --shape coin \
  --radius 2.5 \
  --thickness 0.3 \
  --rim-width 0.07 \
  --rim-color "#b8860b" \
  --face-color "#ffd700" \
  --metalness 0.6 \
  --roughness 0.25 \
  --emoji-scale 1.3 \
  --format glb \
  --output ./output/ \
  --emojis 1f60a,1f680,2764-fe0f
```

### Batch generate all emojis

```bash
npx tsx cli/index.ts generate --shape coin --emojis all --format glb --output ./output/coins/
```

### Generate bubble style

```bash
npx tsx cli/index.ts generate \
  --shape bubble \
  --radius 2.5 \
  --depth 0.25 \
  --tail-length 1.2 \
  --tail-width 0.7 \
  --color "#ffffff" \
  --bevel-size 0.08 \
  --roughness 0.3 \
  --format glb \
  --output ./output/bubbles/ \
  --emojis all
```

### Using npm script shorthand

```bash
npm run generate -- --shape coin --emojis 1f60a --format glb --output ./output/
```

### CLI Flags Reference

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--shape` | yes | `coin` | `coin` or `bubble` |
| `--format` | yes | `glb` | `glb`, `obj`, `stl`, `usdz` |
| `--output` | yes | `./output` | Output directory path |
| `--emojis` | yes | `all` | Comma-separated codes or `all` |
| `--base-url` | no | `http://localhost:3000` | Dev server URL |

Plus all style-specific flags listed in the tables above.

## Export Formats

| Format | Extension | Best For |
|--------|-----------|----------|
| **GLB** | `.glb` | Universal 3D (Unity, Unreal, Blender, web) |
| **OBJ** | `.obj` | Legacy 3D software (geometry only, no materials) |
| **STL** | `.stl` | 3D printing |
| **USDZ** | `.usdz` | Apple AR QuickLook on iOS/macOS |

### Engine Import Tips

- **Unity** — drag `.glb` files into the Assets folder (requires glTFast or UniGLTF package)
- **Unreal Engine** — use the glTF Importer plugin or Datasmith to import `.glb`
- **Blender** — File > Import > glTF 2.0 (`.glb`)
- **Godot** — drag `.glb` into the FileSystem dock

## File Naming

All generated files use the Twemoji Unicode code point as the filename:

```
1f004.glb      # 🀄 Mahjong Red Dragon
1f60a.glb      # 😊 Smiling Face with Smiling Eyes
1f680.glb      # 🚀 Rocket
2764-fe0f.glb  # ❤️ Red Heart
1f1fa-1f1f8.glb # 🇺🇸 Flag: United States
```

## Tech Stack

- [Next.js](https://nextjs.org/) 16 — App Router, React 19
- [Three.js](https://threejs.org/) — 3D rendering and export
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) — React renderer for Three.js
- [Drei](https://github.com/pmndrs/drei) — useful R3F helpers
- [Tailwind CSS](https://tailwindcss.com/) v4 — styling
- [Zustand](https://zustand.docs.pmnd.rs/) — state management
- [Twemoji](https://github.com/jdecked/twemoji) — open-source emoji SVGs
- [Commander](https://github.com/tj/commander.js) — CLI framework
- [Puppeteer](https://pptr.dev/) — headless browser for CLI generation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT — see [LICENSE](LICENSE) for details.

## Credits

- Emoji graphics by [Twemoji](https://github.com/jdecked/twemoji) (MIT License)
- Served via [jsDelivr](https://www.jsdelivr.com/) CDN
