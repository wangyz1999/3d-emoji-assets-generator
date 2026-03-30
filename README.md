# 3D Emoji Generator

[![Deploy](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)
[![License: MIT](https://img.shields.io/badge/Code-MIT-green?style=flat-square)](LICENSE)
[![License: CC BY 4.0](https://img.shields.io/badge/Graphics-CC%20BY%204.0-lightgrey?style=flat-square)](LICENSE-GRAPHICS)
[![Twemoji](https://img.shields.io/badge/Emoji-Twemoji-blue?style=flat-square)](https://github.com/jdecked/twemoji)
[![Three.js](https://img.shields.io/badge/3D-Three.js-black?style=flat-square&logo=threedotjs)](https://threejs.org)


[![Preview](app/twitter-image.png)](https://emoji3d.org)

Generate customizable 3D emoji assets from [Twemoji](https://github.com/jdecked/twemoji) SVGs, built with [Three.js](https://threejs.org). Choose from multiple shape presets (coins, speech bubbles), tweak every parameter, preview in real-time, and export as GLB, OBJ, STL, or USDZ — all in your browser. Includes a CLI for batch generation.

Pre-generated packs of all 4,009 emojis in **bubble**, **coin**, and **flat** shapes are also [available for download](https://github.com/wangyz1999/3d-emoji-assets-generator?tab=readme-ov-file#download-pre-generated-assets)

<details>
<summary><strong>How it works</strong></summary>

Each Twemoji SVG is parsed into individual color paths. Every path is extruded into 3D geometry via `ExtrudeGeometry`, layered with small Z offsets to preserve draw order. The emoji group is then mounted onto a shape base (coin, bubble, pin, badge) or exported standalone (flat). On export, an optional **merge-materials** pass bakes all colors into a single texture atlas — one pixel per unique color — and remaps UVs so the final GLB has exactly one material, ready for game engines.

</details>

[![Visit the Live App HERE](https://img.shields.io/badge/🚀_Visit_The_Live_App_Here->>>_emoji3d.org_<<<-red?style=for-the-badge)](https://emoji3d.org)


![Screenshot of 3D Emoji Generator](app/app_screenshot.png)

### 1000 Rotating Emojis in Unreal

https://github.com/user-attachments/assets/49414e71-578b-40b5-b034-19634161dce5

## Download Pre-generated Assets

Pre-generated 4,009 emoji GLB asset packs are available for download in **bubble**, **coin**, and **flat** shapes.


**[Download Pre-generated Assets on Google Drive](https://drive.google.com/drive/folders/1zSVN45hfUKDhuf6YsjPyC4E12omm_R5b?usp=drive_link)**

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

Open [http://localhost:3000](http://localhost:3000).


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

### Speed up batch generation with concurrency

Use `--concurrency` to render multiple emojis in parallel (default: `4`):

```bash
npm run generate -- --shape bubble --emojis all --format glb --output ./output/bubble/ --concurrency 8
```

### Use Local Emoji

```bash
npm run generate -- --shape bubble --emojis all --format glb --output ./output/ --emoji-source local
```

For all available flags and per-shape style parameters, see the **[CLI Reference](docs/cli-reference.md)**.

> You can also view the full parameter list interactively in the web app — the **CLI Command** panel at the bottom of the left sidebar shows a live command that reflects your current settings.

## Single-Material Export (Merge Materials)

By default, exported models bake **all colors into one texture atlas** so the `.glb` uses a **single material**. This is critical for game engines like **Unreal Engine** and **Unity**, where each material creates a separate draw call — an emoji like the astronaut would otherwise produce 13+ materials.

Enable the "Merge into single material" toggle in the web app, or add `--merge-materials` in the CLI:

```bash
npm run generate -- --shape coin --emojis astronaut --format glb --merge-materials --output ./output/
```

> Without this flag, each SVG color becomes its own material — fine for Blender editing, but impractical in game engines.

## Export Formats

| Format   | Extension |
|----------|-----------|
| **GLB**  | `.glb`    |
| **OBJ**  | `.obj`    |
| **STL**  | `.stl`    |
| **USDZ** | `.usdz`   |


## Contributing

Contributions, feature requests, bug reports, and ideas are all welcome! Feel free to submit a Pull Request or open an issue.

## License

See the [LICENSE](LICENSE) and [LICENSE-GRAPHICS](LICENSE-GRAPHICS) files for full license texts.

Code licensed under the MIT License: <http://opensource.org/licenses/MIT>

Graphics licensed under CC-BY 4.0: <https://creativecommons.org/licenses/by/4.0/>

The emoji graphics used in generated assets are from [Twemoji](https://github.com/jdecked/twemoji) by Twitter/X Corp. If you distribute or publish generated assets, you must include attribution to Twemoji
