# 3D Emoji Assets Generator

Generate customizable 3D emoji assets from [Twemoji](https://github.com/jdecked/twemoji) SVGs. Choose from multiple shape presets (coins, speech bubbles), tweak every parameter, preview in real-time, and export as GLB, OBJ, STL, or USDZ — all in your browser. Includes a CLI for batch generation.


## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/wangyz1999/3d-emoji-assets-generator.git
cd 3d-emoji-assets-generator
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the web editor.


## CLI Usage

> [!IMPORTANT]
> The CLI renders models via a headless browser — **the dev server must be running before you generate anything.**
> You need two terminals open at the same time:
>
> ```bash
> # Terminal 1 — keep this running
> npm run dev
> ```
>
> ```bash
> # Terminal 2 — run your generate commands here
> npm run generate -- ...
> ```

### Generate a single emoji

```bash
npm run generate -- --shape bubble --emojis joy --format glb --output ./output/
```

`--emojis` accepts a shortname (`joy`), a Unicode code (`1f602`), a comma-separated mix of both, or `all`.

### Batch generate all emojis of default bubble shape

```bash
npm run generate -- --shape bubble --emojis all --format glb --output ./output/bubble/
```

For all available flags and per-shape style parameters, see the **[CLI Reference](docs/cli-reference.md)**.

> You can also view the full parameter list interactively in the web app — the **CLI Command** panel at the bottom of the left sidebar shows a live command that reflects your current settings.

## Export Formats

| Format | Extension | Best For |
|--------|-----------|----------|
| **GLB** | `.glb` | Universal 3D (Unity, Unreal, Blender, web) |
| **OBJ** | `.obj` | Legacy 3D software (geometry only, no materials) |
| **STL** | `.stl` | 3D printing |
| **USDZ** | `.usdz` | Apple AR QuickLook on iOS/macOS |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

See the [LICENSE](LICENSE) and [LICENSE-GRAPHICS](LICENSE-GRAPHICS) files for full license texts.

Code licensed under the MIT License: <http://opensource.org/licenses/MIT>

Graphics licensed under CC-BY 4.0: <https://creativecommons.org/licenses/by/4.0/>

> [!NOTE]
> The emoji graphics used in generated assets are from [Twemoji](https://github.com/jdecked/twemoji) by Twitter/X Corp.
> If you distribute or publish generated assets, you must include the following attribution:
>
> **"Emoji graphics by [Twemoji](https://github.com/jdecked/twemoji) © Twitter/X Corp, licensed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)"**