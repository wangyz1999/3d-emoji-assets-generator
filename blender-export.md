# Blender Grease Pencil export

`blender.py` (repo root) converts the Twemoji SVGs in `data/svg/` into Blender **Grease Pencil** objects and works out which shapes are the **eyes, mouth, brows, …** so they can be animated later.

It is independent of the Three.js pipeline: it reads the SVGs directly, so the dev server is **not** needed.

## Requirements

- Python 3.8+ (standard library only, no `pip install`)
- **Blender 4.3 or newer** (needs the new Grease Pencil data model). On Ubuntu:
  ```bash
  sudo snap install blender --classic
  ```
  Ubuntu's apt `blender` package is usually older than 4.3 and will not work.

`blender.py` looks for Blender via `--blender PATH`, then `$BLENDER`, then `PATH`, then `/snap/bin`, `/opt/blender*`, `~/blender*`.

## Usage

```bash
# the supported faces (see --list-faces); one or a few by shortname / unicode code
python3 blender.py --emojis joy,1f600 --output ./output/blender/

# every supported face (`all` and `faces` are the same thing)
python3 blender.py --emojis all --output ./output/blender/

python3 blender.py --list-faces

# try auto-detection on any other face emoji (generic rig, blink + talk only)
python3 blender.py --emojis 1f974 --experimental

# just work out the face map: no Blender needed
python3 blender.py --emojis all --facemap-only --debug-svg
```

Only faces are targeted. Emoji not in the `FACES` registry are skipped (with a message) unless `--experimental` is given, and then non-faces are skipped too.

| Flag | Default | |
|------|---------|--|
| `--emojis` | `faces` | shortnames, unicode codes, a mix, `faces` or `all` |
| `--list-faces` | off | print the supported faces and their animations |
| `--experimental` | off | allow emoji outside the registry (generic rig) |
| `--output` | `./output/blender` | output directory (already git-ignored) |
| `--naming` | `unicode` | `unicode` (`1f602`) or `shortname` (`joy`) file names |
| `--size` | `2.0` | emoji size in Blender units |
| `--skin` | `zombie` | `zombie` replaces the head with generated zombie flesh layers, `none` keeps the original disc |
| `--gif` | off | also write `<name>.gif`: every animation clip played in a row (needs Pillow, no Blender) |
| `--gif-size` / `--gif-fps` / `--gif-background` | `320` / `8` / `#ffffff` | GIF pixels, frame rate and background colour |
| `--curve-segments` | `16` | line segments per Bezier curve |
| `--blender` | auto | path to the Blender executable |
| `--facemap-only` | off | write the face-map JSON only, skip Blender |
| `--debug-svg` | off | write `<name>.facemap.svg`, the shapes outlined and labelled |
| `--verbose` | off | show all Blender output |

## Supported faces

`python3 blender.py --list-faces` prints them. Besides the grinning/laughing/crying set: 🤪 😬 😷 🤯 🤓 🥺 🥹 ☠️ 🙄 😎 😏 😒 😔 😕 😠 😴 😵 😱 🤔 🥰 😘 😋 🤩 🤫 🤢 🥵 🥶 🥱 🙂 😶 😑 😨 😰 (the demo below is 🤪). The newer entries rely on `rules` to name shapes auto-detection has no label for (`tongue`, `mask`, `glasses`, `smoke`, `flame_*`, `eyewhite_*`, `bone_*`, `nose`, ...). ☠️ is not a face but has eyes, so it is supported without a zombie head (`zombie_head=False`).

![zany face](demo/zany_face.gif)

*`python3 blender.py --emojis zany_face --gif --facemap-only`*

## The `FACES` registry

Each supported face has an entry in `FACES` (top of the rig section of `blender.py`):

```python
"1f62d": FaceSpec("loudly crying face",
    animations=("brow_raise", "tear_drip", "talk"),
    rules=(Rule("tear_pool", near=(18, 34), radius=2.5, color="#5dadec"),),
    pivots={}, params={"talk": {"gain": 1.5}})
```

- `mouthless`: `True` for a face with no mouth (😶), so it still counts as `complete`.
- `idle`: which of the idle clips to append (default all three; sunglasses have no eyes to dart, a sleeping face only tilts).
- `zombie_head`: set `False` when `face` is not a head to replace (the skull).
- `rules`: relabel a shape by SVG position (and optionally colour) when auto-detection gets it wrong or has no name for it. A rule that matches nothing prints a warning.
- `pivots`: where each part rotates/scales from. A mode (`center`, `top`, `bottom`, `inner`, `outer`, `left`, `right`) or an `(dx, dy)` offset in SVG units from the part centre. Defaults: brows `inner`, mouth/tongue/tears `top`.
- `animations`: clips built for this face; `params` tunes them per clip (e.g. `targets`, `gain`).

To add a face: add an entry, run `--facemap-only --debug-svg`, fix labels with `rules`, pick pivots/animations. The test-suite builds every entry and fails on warnings.

## Output

| File | |
|------|--|
| `<name>.blend` | one collection with the rig, animation and a camera |
| `<name>.facemap.json` | which shapes were identified as what |
| `<name>.facemap.svg` | (`--debug-svg`) a picture of that mapping |

### Object-per-part rig

Grease Pencil is easiest to animate (and to put modifiers on) when split into many objects, so every part is its **own object**, parented in a hierarchy. Each object's origin is its pivot, and strokes are stored relative to it, so rotating or scaling an object works around the right point.

```
1f602                      root empty (animate this to move the whole face)
├─ 1f602.face              head origin (empty)
│  ├─ flesh_rim … stitches  zombie head layers
│  └─ 1f602.blush_left / blush_right
├─ 1f602.eyes              group empties: eyes, brows, tears
│  ├─ 1f602.eye_left       └─ pupil_*, highlight_*
├─ 1f602.brows ─ brow_left, brow_right
├─ 1f602.mouth             └─ teeth, tongue, mouth_detail
└─ 1f602.tears ─ tear_left, tear_right
```

Only parts a face actually has are created. Paint order is kept with a tiny depth offset along Y (later = further from the front camera). **`left`/`right` are screen-side** (`left` has the smaller X).

### Zombie head

The flat Twemoji head disc is **removed**. `face` becomes an empty (the head's origin) and the head is generated from scratch as a stack of Grease Pencil objects, back to front: `flesh_rim`, `flesh_base` (an irregular, lumpy silhouette, narrower at the chin), `flesh_shadow`, `flesh_highlight`, `cheek_hollows`, `flesh_mottle`, `flesh_pale`, `rot`, `veins`, `bruise`, `wound_rim`, `wound_flesh`, `scar`, `stitches`. They sit behind every face part (the head is always a full canvas-sized disc, even for 🤯 whose Twemoji head is cut off), so the only Twemoji shapes left are the parts you animate on top (`blush_*` stays parented to `face`).

Generation is procedural and seeded by the emoji code: reproducible, but no two faces look alike; all marks stay inside the head outline. A head that is not Twemoji yellow (the red 😡) gets the same flesh tinted toward its colour. `--skin none` keeps the original disc. Palette and layers: `ZOMBIE_LAYERS`, shapes: `zombie_head_layers()`. The layers are listed under `groups.head` in the face map, and `face` is no longer a part there.

### Animation clips

Clips are ordinary keyframes on one timeline (24 fps, 6-frame gaps) with a **timeline marker** at the start of each. Every supported face also gets the idle set (`look_around`, `eye_dart`, `tilt`, see `IDLE_CLIPS`). Each clip returns to the rest pose. Location keys are stored as rest position + offset. Because everything is plain keyframes, you can edit them, or add Grease Pencil modifiers to individual part objects.

| Clip | What moves |
|------|-----------|
| `blink` | eyes squash (`targets` param picks which) |
| `talk` | mouth opens/closes, kept inside the face (`gain`) |
| `brow_raise` | brows lift (`targets` param: e.g. only the right brow for 😏 🤔) |
| `look` | pupils (or eyes) look left, right and down; this is the rolling-eyes clip |
| `pulse` | eyes pulse (heart eyes) |
| `tear_drip` / `tear_well` | tears stretch down from the top / well up from the bottom |
| `bounce` | the whole face hops |
| `look_around` | the idle "look left, look right": the pupils (or eyes) lead, then the head follows: the features slide further than the skull (parallax) and the head tilts a touch |
| `eye_dart` | small quick glances: the eyes jump, hold, jump again |
| `tilt` | slow, slight head tilt each way (about 5 degrees) |
| `crazy_eyes` | pupils drift in opposite directions (🤪) |
| `tongue_wag` | tongue swings (🤪) |
| `chatter` | mouth and teeth shiver (😬) |
| `breathe` | mask swells (😷) |
| `explode` | smoke and flames puff up (🤯) |
| `shake` / `rattle` | the whole head shakes sideways / rattles (🤯, ☠️) |
| `glasses_push` | glasses lift and tilt (🤓) |
| `zzz` | the snore Zs bob up one after another (😴) |
| `eye_spin` | crossed-out eyes spin a full turn (😵) |
| `chin_tap` | the hand taps the chin (🤔) |
| `heartbeat` | the hearts pulse one after another (🥰) |
| `shush` | the finger sways (🤫) |
| `puff` | the cheeks swell, out of step (🤢) |
| `yawn` | mouth opens wide, eyes squeeze shut, hand lifts (🥱) |
| `shimmer` | eye highlights twinkle (🥺 🥹) |
| `quiver` | the lip trembles (🥺) |

### `facemap.json`

```jsonc
{
  "code": "1f602", "title": "face with tears of joy",
  "supported": true,     // in the FACES registry
  "is_face": true,       // permissive: head + eyes and/or mouth
  "complete": true,      // both eyes AND a mouth
  "root": "1f602",
  "groups": { "eyes": [...], "pupils": [...], "brows": [...], "mouth": [...], "tears": [...] },
  "animations": [ { "name": "blink", "start": 1, "end": 9 } ],
  "warnings": [],
  "parts": {
    "eye_left": {
      "object": "1f602.eye_left", "parent": "1f602.eyes", "strokes": 1,
      "pivot": [-0.33, 0.25], "center": [-0.33, 0.25],
      "bbox": [...], "svg_bbox": [9.5, 10.0, 14.5, 17.0],
      "colors": ["#664500"], "rule": "eye-pair", "confidence": 1.0
    }
  }
}
```

The same JSON is stored on the root empty as the custom property `face_map` (plus `emoji_code`).

## GIF preview

```bash
pip install pillow
python3 blender.py --emojis joy,1f633 --gif --facemap-only --output ./output/blender/
```

`--gif` writes `<name>.gif` with all the clips played one after another (looping). It replays the same node tree and keyframes that go into the `.blend`, rasterised with Pillow, so it needs neither Blender nor a GPU (add `--facemap-only` to skip the `.blend`). Keyframes are eased with a smoothstep, close to Blender's default interpolation, but it is a preview rather than a Blender render. The 24 fps timeline is sampled down to 8 fps by default (`--gif-fps`), which keeps GIFs around 1 MB.

## Animating the parts

```python
import bpy
eye = bpy.data.objects["1f602.eye_left"]
for frame, squash in ((1, 1.0), (6, 0.1), (11, 1.0)):
    eye.scale[2] = squash                      # Z is vertical in front view
    eye.keyframe_insert("scale", index=2, frame=frame)
```

## How the face detection works

Twemoji SVGs have no semantic names, and often draw both eyes, both brows *and* the mouth in a single `<path>`. So `blender.py` splits every path into its sub-paths and classifies each polygon geometrically:

1. **Head**: a round shape covering most of the canvas (this is what rules out flags and button icons).
2. **Eyes**: the best mirror-symmetric pair in the upper half. When two symmetric pairs exist (eyes *and* brows), the lower one wins.
3. **Mouth**: the biggest non-skin, non-blue shape in the lower centre. Shapes inside it become `teeth` / `tongue` / `mouth_detail` by colour.
4. **Pupils/highlights** inside eyes, **brows** (thin, dark, above an eye), **tears** (blue) and **blush** (soft pink circles).

Measured over all 4,009 bundled emoji against Unicode's own face categories (face-*, cat/monkey faces): **96 % of real faces are detected, 90 % with both eyes and a mouth.** Expect some misses (😎 sunglasses hide the eyes, 🙃 is upside-down, 🤯 👾 🤖 are unusual shapes) and some extra detections: people and animal faces are detected too (usually correct), and a few objects with symmetric blobs (🎳, 🌮) are labelled as faces. Check `complete`, `confidence` and `--debug-svg` if it matters.

## Known limitations

- **Blender version**: developed and tested against **Blender 5.2.2**. The code also targets 4.3–4.5 (it falls back to the older material flags and `grease_pencils_v3`), but that path is **untested**. Older than 4.3 is refused with a clear message.
- **Verification**: the rig and clips were checked by reading the scene back through the `bpy` module; the real `blender` executable and 4.3–4.5 were not run.
- **Holes and the zombie head**: a hole is a stroke painted in the colour underneath, so with the zombie head the nerd-glasses lenses are flat flesh colour (the mottling does not show through them).
- **Fills only.** Twemoji is flat colour, so there are no strokes, gradients, clip paths or masks (14 SVGs use a clip path, which is ignored with a warning in `facemap.json`).
- **Holes** (rings, the "O" in a button) cannot be cut out of a single Grease Pencil fill, so the hole is painted as an extra stroke in the colour of whatever is behind it. It looks right, but it is not transparent.
- **Face detection is heuristic**, see above.

## Tests

```bash
python3 -m unittest discover -s tests -v
```

The parsing and face-detection tests need nothing else. The Blender-side tests run only if the `bpy` module is installed (`pip install bpy` in a venv; the real `blender` executable is not needed) and are skipped otherwise.
