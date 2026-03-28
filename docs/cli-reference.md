# CLI Reference

Full parameter reference for the `3d-emoji-assets-generator` CLI.

All examples use the `npm run generate --` shorthand. This is equivalent to running `npx tsx cli/index.ts generate` directly.

> **Tip:** You can also view these parameters interactively in the web app — open the **CLI Command** panel at the bottom of the left sidebar to see a live command that reflects your current settings.

---

## Core Flags

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--shape` | yes | `coin` | Shape preset: `bubble`, `pin`, `coin`, or `badge` |
| `--format` | yes | `glb` | Output format: `glb`, `obj`, `stl`, or `usdz` |
| `--output` | yes | `./output` | Output directory path |
| `--emojis` | yes | `all` | Comma-separated shortnames (e.g. `joy,rocket`), Unicode codes (e.g. `1f602,1f680`), a mix of both, or `all` |
| `--naming` | no | `unicode` | File naming: `unicode` (e.g. `1f60a.glb`) or `shortname` (e.g. `grinning.glb`) |
| `--base-url` | no | `http://localhost:3000` | Dev server URL |
| `--concurrency` | no | `4` | Number of emojis rendered in parallel (see [Concurrency](#concurrency)) |
| `--emoji-source` | no | `local` | SVG source: `local` (`data/svg/`) or `remote` (jsDelivr CDN) — see [Local SVGs](#local-svgs) |

---

## Concurrency

By default the CLI renders **4 emojis in parallel** using concurrent browser pages. Increase this to speed up large batch jobs; decrease it if you hit memory or stability issues.

```bash
# Use 8 parallel workers for a faster batch run
npm run generate -- --shape bubble --emojis all --format glb --output ./output/ --concurrency 8

# Single-threaded (safest, slowest)
npm run generate -- --shape coin --emojis all --format glb --output ./output/ --concurrency 1
```

**Tuning tips:**
- Start with `--concurrency 4` (default) and increase gradually.
- Values between `4` and `8` are a good sweet spot on most machines.
- Very high values (16+) can cause the dev server or browser to run out of memory.
- If you see frequent `[FAIL]` errors, lower the concurrency.

---

## Local SVGs

By default the CLI fetches each emoji SVG from the **jsDelivr CDN** at render time (`--emoji-source remote`). With high concurrency this can trigger CDN rate-limits and cause `TimeoutError` failures.

The recommended fix for large batch jobs is to **download all SVGs once** and then generate entirely offline:

### Step 1 — Download SVGs

```bash
python scripts/download_svgs.py
```

This saves all ~4 000 SVGs to `data/svg/`. Already-downloaded files are skipped, so re-running is safe. Options:

```bash
python scripts/download_svgs.py --concurrency 16 --retries 5
```

| Flag | Default | Description |
|------|---------|-------------|
| `--concurrency` | `8` | Parallel download threads |
| `--retries` | `5` | Retry attempts per file on failure |

### Step 2 — Generate with local source

```bash
npm run generate -- --shape bubble --emojis all --format glb --output ./output/ \
  --emoji-source local --concurrency 8
```

With `--emoji-source local` the headless browser loads SVGs from `http://localhost:3000/api/svg/<code>.svg` (served directly from `data/svg/`) instead of the CDN — no network dependency, no rate-limits, and noticeably faster.

> **Note:** The dev server must still be running (`npm run dev`) — it is needed to render the 3D models, even in local mode.

---

## Shape: `coin`

A flat circular coin with an optional rim ring.

| Flag | Default | Range | Description |
|------|---------|-------|-------------|
| `--radius` | `2.5` | 1–5 | Coin radius |
| `--thickness` | `0.3` | 0.05–1 | Coin edge thickness |
| `--rim-width` | `0.07` | 0–0.3 | Border ring width (proportion of radius) |
| `--rim-color` | `"#2c3e50"` | hex | Color of the rim/edge ring |
| `--face-color` | `"#ffffff"` | hex | Color of the flat faces |
| `--metalness` | `0.2` | 0–1 | PBR metalness |
| `--roughness` | `0.4` | 0–1 | PBR roughness |
| `--emoji-scale` | `1.3` | 0.5–2 | Size of emoji relative to coin |
| `--no-rim` | — | flag | Disable the rim ring |
| `--single-sided` | — | flag | Render emoji on front face only (omit for both faces) |

### Example

```bash
npm run generate -- \
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
  --emojis joy,rocket,heart
```

---

## Shape: `bubble`

A speech bubble with an extruded body and a tail.

| Flag | Default | Range | Description |
|------|---------|-------|-------------|
| `--radius` | `2.5` | 1–5 | Bubble circle radius |
| `--depth` | `0.25` | 0.05–1 | Extrusion depth |
| `--tail-length` | `0.8` | 0.2–3 | Speech bubble tail length |
| `--tail-width` | `0.4` | 0.1–1.5 | Speech bubble tail width |
| `--color` | `"#e8e8e8"` | hex | Bubble fill color |
| `--bevel-size` | `0.15` | 0–0.3 | Edge rounding amount |
| `--roughness` | `0.5` | 0–1 | PBR roughness |
| `--emoji-scale` | `1.3` | 0.5–2 | Size of emoji relative to bubble |
| `--single-sided` | — | flag | Render emoji on front face only |

### Example

```bash
npm run generate -- \
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

---

## Shape: `pin`

A map/location pin with a pointed bottom.

| Flag | Default | Range | Description |
|------|---------|-------|-------------|
| `--pin-radius` | `2.2` | 1–5 | Outer radius of the pin head |
| `--inner-radius` | `1.5` | 0.5–4 | Inner disc radius (where emoji sits) |
| `--pin-point-length` | `4.5` | 2–8 | Length of the pin point/needle |
| `--depth` | `0.3` | 0.1–1 | Extrusion depth |
| `--shell-color` | `"#ef4444"` | hex | Outer shell color |
| `--inner-color` | `"#ffffff"` | hex | Inner disc color |
| `--metalness` | `0.1` | 0–1 | PBR metalness |
| `--roughness` | `0.2` | 0–1 | PBR roughness |
| `--emoji-scale` | `1.4` | 0.5–2 | Size of emoji relative to pin head |
| `--single-sided` | — | flag | Render emoji on front face only |

### Example

```bash
npm run generate -- \
  --shape pin \
  --pin-radius 2.2 \
  --inner-radius 1.5 \
  --pin-point-length 4.5 \
  --depth 0.3 \
  --shell-color "#ef4444" \
  --inner-color "#ffffff" \
  --metalness 0.1 \
  --roughness 0.2 \
  --format glb \
  --output ./output/pins/ \
  --emojis round_pushpin,house
```

---

## Shape: `badge`

A polygonal badge/medallion with a glowing frame.

| Flag | Default | Range | Description |
|------|---------|-------|-------------|
| `--sides` | `8` | 3–10 | Number of polygon sides |
| `--badge-radius` | `2.5` | 1–5 | Outer badge radius |
| `--inner-radius` | `2.0` | 0.5–4 | Inner disc radius (where emoji sits) |
| `--depth` | `0.4` | 0.1–1 | Extrusion depth |
| `--frame-color` | `"#22d3ee"` | hex | Outer frame color |
| `--inner-color` | `"#1e293b"` | hex | Inner disc color |
| `--emissive-intensity` | `0.6` | 0–1 | Glow/emissive intensity of the frame |
| `--metalness` | `0.8` | 0–1 | PBR metalness |
| `--roughness` | `0.2` | 0–1 | PBR roughness |
| `--emoji-scale` | `1.35` | 0.5–2 | Size of emoji relative to badge |
| `--single-sided` | — | flag | Render emoji on front face only |

### Example

```bash
npm run generate -- \
  --shape badge \
  --sides 6 \
  --badge-radius 2.5 \
  --inner-radius 2.0 \
  --depth 0.4 \
  --frame-color "#22d3ee" \
  --inner-color "#1e293b" \
  --emissive-intensity 0.6 \
  --metalness 0.8 \
  --roughness 0.2 \
  --format glb \
  --output ./output/badges/ \
  --emojis all
```

---

## Export Formats

| Format | Extension | Best For |
|--------|-----------|----------|
| `glb` | `.glb` | Universal 3D — Unity, Unreal, Blender, web |
| `obj` | `.obj` | Legacy 3D software (geometry only, no materials) |
| `stl` | `.stl` | 3D printing |
| `usdz` | `.usdz` | Apple AR QuickLook on iOS/macOS |

---

## File Naming

Generated filenames use the Twemoji Unicode code point by default (`--naming unicode`), or the emoji shortname with `--naming shortname`:

```
unicode:   1f60a.glb        # 😊
shortname: smiling_face_with_smiling_eyes.glb
```

Multi-codepoint emojis use hyphens:

```
2764-fe0f.glb    # ❤️  Red Heart
1f1fa-1f1f8.glb  # 🇺🇸 Flag: United States
```
