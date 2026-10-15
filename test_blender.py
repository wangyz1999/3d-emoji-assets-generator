"""Tests for blender.py.

Run from the repo root:

    python3 -m unittest discover -s tests -v

The parsing and face-detection tests need only the standard library. The
Blender-side tests run only if the `bpy` module is importable (for example
`pip install bpy` in a venv); otherwise they are skipped. The real `blender`
executable is not needed.
"""
import importlib.util
import json
import subprocess
import math
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import blender as B  # noqa: E402

HAS_BPY = importlib.util.find_spec("bpy") is not None


def model_for(code, size=2.0, segments=8, skin="none"):
    """`skin="none"` by default: most tests are about the Twemoji shapes, not the generated head."""
    model, _ = B.build_model(code, code, ROOT / "data" / "svg" / f"{code}.svg", size, segments, skin=skin)
    return model


def write_svg(tmp: Path, body: str) -> Path:
    p = tmp / "t.svg"
    p.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">{body}</svg>')
    return p


class PathFlattening(unittest.TestCase):
    def test_relative_square(self):
        (sp,) = B.flatten_path("M0 0h10v10H0z")
        self.assertEqual(sp[:3], [(0, 0), (10, 0), (10, 10)])
        self.assertAlmostEqual(abs(B.signed_area(B._clean_polygon(sp))), 100)

    def test_implicit_lineto_after_moveto(self):
        (sp,) = B.flatten_path("M0 0 10 0 10 10")
        self.assertEqual(sp, [(0, 0), (10, 0), (10, 10)])

    def test_arc_with_packed_flags(self):
        # "a5 5 0 1010 0": the two flags are written without separators.
        (sp,) = B.flatten_path("M0 0a5 5 0 1010 0", 8)
        self.assertEqual(sp[-1], (10, 0))
        for x, y in sp:
            self.assertAlmostEqual(((x - 5) ** 2 + y ** 2) ** 0.5, 5, places=6)

    def test_smooth_curve_continues(self):
        (sp,) = B.flatten_path("M0 0C0 10 10 10 10 0S20 -10 20 0", 8)
        self.assertEqual(len(sp), 1 + 8 + 8)
        self.assertEqual(sp[-1], (20, 0))

    def test_every_bundled_svg_parses(self):
        for svg in sorted((ROOT / "data" / "svg").glob("*.svg"))[::25]:
            B.parse_svg(svg)  # must not raise or hang


class Holes(unittest.TestCase):
    RING_ON_BLUE = ('<path fill="#3b88c3" d="M0 0h36v36H0z"/>'
                    '<path fill="#fff" fill-rule="evenodd" d="M4 4h28v28H4z M12 12h12v12H12z"/>')

    def parse(self, body):
        with tempfile.TemporaryDirectory() as t:
            return B.parse_svg(write_svg(Path(t), body))

    def test_ring_hole_takes_underlying_colour(self):
        parsed = self.parse(self.RING_ON_BLUE)
        holes = [u for u in parsed.units if u.hole]
        self.assertEqual(len(holes), 1)
        self.assertEqual(holes[0].color, "#3b88c3")
        self.assertIsNotNone(holes[0].parent)
        # hole is painted after its parent, so it shows through
        self.assertGreater(holes[0].order, holes[0].parent.order)

    def test_ring_does_not_hang_or_flag_the_outer_as_hole(self):
        # Regression: the outer polygon's interior point lies inside the hole,
        # which used to make the two sub-paths "contain" each other forever.
        parsed = self.parse('<path fill="#000" fill-rule="evenodd" d="M4 4h28v28H4z M12 12h12v12H12z"/>')
        self.assertEqual(sum(u.hole for u in parsed.units), 0)  # nothing underneath: hole dropped
        self.assertEqual(len([u for u in parsed.units if not u.hole]), 1)

    def test_same_direction_nesting_is_not_a_hole_under_nonzero(self):
        parsed = self.parse('<path fill="#000" d="M4 4h28v28H4z M12 12h12v12H12z"/>')
        self.assertEqual(sum(u.hole for u in parsed.units), 0)
        self.assertEqual(len(parsed.units), 2)


class FaceDetection(unittest.TestCase):
    def parts(self, code):
        return model_for(code)["facemap"]["parts"]

    def test_laughing_face(self):
        p = self.parts("1f602")
        for name in ("face", "eye_left", "eye_right", "brow_left", "brow_right", "mouth", "teeth",
                     "tear_left", "tear_right"):
            self.assertIn(name, p)
        # screen-side naming: left has the smaller x
        self.assertLess(p["eye_left"]["center"][0], p["eye_right"]["center"][0])

    def test_eyes_are_below_brows(self):
        # Regression: the brow pair is also symmetric and used to win (😭, 🐶).
        for code in ("1f602", "1f62d"):
            p = self.parts(code)
            self.assertLess(p["eye_left"]["center"][1], p["brow_left"]["center"][1], code)  # Z is up

    def test_crying_face_mouth_is_not_the_tear_puddle(self):
        p = self.parts("1f62d")
        self.assertIn("tongue", p)
        width = p["mouth"]["bbox"][2] - p["mouth"]["bbox"][0]
        self.assertLess(width, 0.6)  # the puddle spans the whole 2.0-wide face
        self.assertNotIn("#5dadec", p["mouth"]["colors"])

    def test_dog_eyes_are_the_dark_ovals(self):
        p = self.parts("1f436")
        self.assertEqual(p["eye_left"]["colors"], ["#292f33"])

    def test_pupils_and_blush(self):
        p = self.parts("1f633")
        for name in ("pupil_left", "pupil_right", "blush_left", "blush_right", "brow_left"):
            self.assertIn(name, p)

    def test_hands_and_hearts_are_not_blush(self):
        for code in ("1f631", "1f970"):
            self.assertFalse([k for k in self.parts(code) if k.startswith("blush")], code)

    def test_heart_eyes(self):
        p = self.parts("1f60d")
        self.assertEqual(p["eye_left"]["colors"], ["#dd2e44"])

    def test_non_faces(self):
        for code in ("1f680", "1f1e6-1f1eb", "1f1f4"):  # rocket, Afghan flag, letter button
            fm = model_for(code)["facemap"]
            self.assertFalse(fm["is_face"], code)
            self.assertEqual(fm["parts"], {})

    def test_complete_flag(self):
        self.assertTrue(model_for("1f602")["facemap"]["complete"])
        self.assertFalse(model_for("1f680")["facemap"]["complete"])


def node(model, part):
    return next(n for n in model["nodes"] if n["part"] == part)


def world(model, n):
    """World position of a node by walking its parents."""
    by_name = {x["name"]: x for x in model["nodes"]}
    pos = [0.0, 0.0, 0.0]
    while n:
        pos = [a + b for a, b in zip(pos, n["location"])]
        n = by_name.get(n["parent"])
    return pos


class Rig(unittest.TestCase):
    def test_hierarchy(self):
        m = model_for("1f633")
        name = m["name"]
        self.assertEqual(node(m, "root")["parent"], None)
        self.assertEqual(node(m, "eyes")["parent"], name)
        self.assertEqual(node(m, "eye_left")["parent"], f"{name}.eyes")
        self.assertEqual(node(m, "pupil_left")["parent"], f"{name}.eye_left")   # pupils follow their eye
        self.assertEqual(node(m, "brow_right")["parent"], f"{name}.brows")
        self.assertEqual(node(m, "blush_left")["parent"], f"{name}.face")
        m = model_for("1f602")
        self.assertEqual(node(m, "teeth")["parent"], "1f602.mouth")             # teeth follow the jaw
        self.assertEqual(node(m, "tear_left")["parent"], "1f602.tears")

    def test_parents_come_before_children(self):
        names = []
        for n in model_for("1f633")["nodes"]:
            self.assertTrue(n["parent"] is None or n["parent"] in names, n["name"])
            names.append(n["name"])

    def test_local_locations_add_up_to_world(self):
        m = model_for("1f633")
        for n in m["nodes"]:
            for a, b in zip(world(m, n), n["world"]):
                self.assertAlmostEqual(a, b, places=9, msg=n["name"])

    def test_stroke_points_are_relative_to_the_pivot(self):
        m = model_for("1f600")
        eye = node(m, "eye_left")        # pivot "center": the points straddle the origin
        xs = [p[0] for s in eye["strokes"] for p in s["points"]]
        zs = [p[2] for s in eye["strokes"] for p in s["points"]]
        self.assertAlmostEqual((min(xs) + max(xs)) / 2, 0, places=6)
        self.assertAlmostEqual((min(zs) + max(zs)) / 2, 0, places=6)

    def test_default_pivots(self):
        m = model_for("1f602")
        fm = m["facemap"]["parts"]
        self.assertAlmostEqual(fm["mouth"]["pivot"][1], fm["mouth"]["bbox"][3])            # "top"
        self.assertGreater(fm["brow_left"]["pivot"][0], fm["brow_left"]["center"][0])      # "inner" (towards x=0)
        self.assertLess(fm["brow_right"]["pivot"][0], fm["brow_right"]["center"][0])

    def test_depth_follows_paint_order(self):
        # Separate objects have no layer order, so later shapes sit nearer the camera (smaller Y).
        m = model_for("1f602")
        y = {n["part"]: n["world"][1] for n in m["nodes"] if n["kind"] == "gp"}
        self.assertLess(y["mouth"], y["face"])
        self.assertLess(y["teeth"], y["mouth"])        # teeth are painted over the mouth
        self.assertLess(y["tear_left"], y["face"])

    def test_paint_order_survives_the_split(self):
        # 🤔: the hand is drawn after (on top of) the mouth.
        m = model_for("1f914")
        y = {n["part"]: n["world"][1] for n in m["nodes"] if n["kind"] == "gp"}
        self.assertLess(y["hand"], y["mouth"])
        self.assertEqual(m["facemap"]["warnings"], [])

    def test_size_is_respected(self):
        m = model_for("1f600", size=4.0)
        x0, _, x1, _ = node(m, "face")["bbox"]
        self.assertAlmostEqual(x1 - x0, 4.0, places=2)


class Registry(unittest.TestCase):
    def test_every_spec_builds_cleanly(self):
        for code, spec in B.FACES.items():
            m = model_for(code)
            fm = m["facemap"]
            self.assertEqual(fm["warnings"], [], code)
            self.assertTrue(fm["supported"] and fm["is_face"] and fm["complete"], code)
            self.assertEqual([c["name"] for c in m["clips"]], list(spec.animations), code)   # none skipped

    def test_every_animation_name_exists(self):
        for code, spec in B.FACES.items():
            for a in spec.animations:
                self.assertIn(a, B.CLIPS, code)

    def test_rule_relabels_a_shape(self):
        m = model_for("1f62d")      # the pool of tears is its own object
        self.assertIn("tear_pool", m["facemap"]["parts"])
        self.assertEqual(node(m, "tear_pool")["parent"], "1f62d")

    def test_rule_that_matches_nothing_warns(self):
        spec = B.FaceSpec("t", ("talk",), rules=(B.Rule("nose", near=(1, 1), radius=0.5),))
        m, _ = B.build_model("1f600", "1f600", ROOT / "data/svg/1f600.svg", 2.0, 8, spec)
        self.assertTrue(any("nose" in w for w in m["facemap"]["warnings"]))

    def test_pivot_override_in_svg_units(self):
        base = model_for("1f600")["facemap"]["parts"]["eye_left"]["pivot"]
        spec = B.FaceSpec("t", ("blink",), pivots={"eye_left": (0, 5)})       # 5 SVG units down
        m, _ = B.build_model("1f600", "1f600", ROOT / "data/svg/1f600.svg", 2.0, 8, spec)
        piv = m["facemap"]["parts"]["eye_left"]["pivot"]
        self.assertAlmostEqual(piv[1], model_for("1f600")["facemap"]["parts"]["eye_left"]["center"][1] - 5 * 2.0 / 36)
        self.assertAlmostEqual(piv[0], base[0])

    def test_unknown_animation_warns(self):
        spec = B.FaceSpec("t", ("blink", "moonwalk"))
        m, _ = B.build_model("1f600", "1f600", ROOT / "data/svg/1f600.svg", 2.0, 8, spec)
        self.assertTrue(any("moonwalk" in w for w in m["facemap"]["warnings"]))
        self.assertEqual([c["name"] for c in m["clips"]], ["blink"])

    def test_clip_needing_missing_parts_is_skipped_with_a_warning(self):
        spec = B.FaceSpec("t", ("brow_raise", "blink"))      # 1f600 has no brows
        m, _ = B.build_model("1f600", "1f600", ROOT / "data/svg/1f600.svg", 2.0, 8, spec)
        self.assertEqual([c["name"] for c in m["clips"]], ["blink"])
        self.assertTrue(any("brow_raise" in w for w in m["facemap"]["warnings"]))

    def test_unlisted_emoji_get_a_generic_spec(self):
        m = model_for("1f921")      # clown: not in FACES
        self.assertFalse(m["facemap"]["supported"])


class Clips(unittest.TestCase):
    def test_every_clip_returns_to_rest_and_is_ordered(self):
        for code in B.FACES:
            m = model_for(code)
            last_end = 0
            for c in m["clips"]:
                self.assertGreaterEqual(c["start"], last_end, code)      # clips never overlap
                last_end = c["end"]
                for t in c["tracks"]:
                    frames = [k[0] for k in t["keys"]]
                    self.assertEqual(frames, sorted(frames))
                    self.assertEqual(frames[0], c["start"])
                    self.assertEqual(frames[-1], c["end"])
                    end = t["keys"][-1][1] - t["keys"][0][1]
                    if t["path"] == "rotation_euler":                       # a full turn is back at rest
                        end = (end + math.pi) % math.tau - math.pi
                    self.assertAlmostEqual(end, 0.0, msg=f"{code} {c['name']}")

    def test_every_clip_actually_moves_something(self):
        for code in B.FACES:
            for c in model_for(code)["clips"]:
                self.assertTrue(any(len({round(k[1], 6) for k in t["keys"]}) > 1 for t in c["tracks"]),
                                f"{code} {c['name']}")

    def test_blink_only_targets_the_listed_eyes(self):
        m = model_for("1f609")      # winking: the right eye is already the wink
        blink = next(c for c in m["clips"] if c["name"] == "blink")
        self.assertEqual({t["node"] for t in blink["tracks"]}, {"1f609.eye_left"})

    def test_talk_keeps_the_jaw_inside_the_face(self):
        m = model_for("1f600")
        mouth, talk = node(m, "mouth"), next(c for c in m["clips"] if c["name"] == "talk")
        peak = max(k[1] for t in talk["tracks"] if t["index"] == 2 for k in t["keys"])
        pz, z0 = mouth["world"][2], mouth["bbox"][1]
        self.assertGreaterEqual(pz - (pz - z0) * peak, -0.97 * m["size"] / 2 - 1e-9)

    def test_location_keys_are_offsets_from_the_rest_position(self):
        m = model_for("1f602")
        raise_clip = next(c for c in m["clips"] if c["name"] == "brow_raise")
        t = raise_clip["tracks"][0]
        rest = node(m, "brows")["location"][2]
        self.assertAlmostEqual(t["keys"][0][1], rest)
        self.assertGreater(max(k[1] for k in t["keys"]), rest)


class ZombieSkin(unittest.TestCase):
    def test_twemoji_head_disc_is_gone_and_replaced_by_layers(self):
        for code, spec in B.FACES.items():
            if not spec.zombie_head:
                continue
            m = model_for(code, skin="zombie")
            face = next(n for n in m["nodes"] if n["part"] == "face")
            self.assertEqual(face["kind"], "empty", code)           # no disc any more
            self.assertNotIn("face", m["facemap"]["parts"], code)
            layers = [n for n in m["nodes"] if n.get("skin")]
            self.assertEqual([n["part"] for n in layers], list(B.ZOMBIE_LAYERS), code)
            self.assertGreaterEqual(len(layers), 10)
            colors = {st["color"] for n in m["nodes"] if n["kind"] == "gp" for st in n["strokes"]}
            self.assertNotIn("#ffcc4d", colors, code)
            self.assertEqual(m["facemap"]["warnings"], [], code)
            self.assertEqual(m["facemap"]["skin"], "zombie")
            self.assertEqual(m["facemap"]["groups"]["head"], list(B.ZOMBIE_LAYERS))

    def test_skull_is_not_given_a_zombie_head(self):
        m = model_for("2620", skin="zombie")
        self.assertFalse([n for n in m["nodes"] if n.get("skin")])
        self.assertEqual(next(n for n in m["nodes"] if n["part"] == "face")["kind"], "gp")
        self.assertEqual(m["facemap"]["skin"], "none")

    def test_glasses_lenses_are_flesh_not_yellow(self):
        m = model_for("1f913", skin="zombie")
        holes = [st for n in m["nodes"] if n["kind"] == "gp" for st in n["strokes"] if st["hole"]]
        self.assertTrue(holes)
        self.assertTrue(all(st["color"] == B.ZOMBIE_LAYERS["flesh_base"][0] for st in holes))

    def test_head_is_not_a_circle(self):
        m = model_for("1f600", skin="zombie")
        base = next(n for n in m["nodes"] if n["part"] == "flesh_base")
        radii = [math.hypot(x + base["world"][0], z + base["world"][2]) for x, _, z in base["strokes"][0]["points"]]
        self.assertGreater(max(radii) - min(radii), 0.05)
        self.assertGreater(min(radii), 0.8)           # still covers where the features sit
        self.assertLess(max(radii), 1.05)

    def test_red_head_is_tinted_not_kept(self):
        red = model_for("1f621", skin="zombie")
        yellow = model_for("1f600", skin="zombie")
        col = lambda m: next(n for n in m["nodes"] if n["part"] == "flesh_base")["strokes"][0]["color"]
        self.assertNotEqual(col(red), col(yellow))
        self.assertGreater(B.hex_rgb(col(red))[0], B.hex_rgb(col(yellow))[0])   # redder

    def test_skin_none_keeps_the_original_disc(self):
        m = model_for("1f600", skin="none")
        face = next(n for n in m["nodes"] if n["part"] == "face")
        self.assertEqual(face["kind"], "gp")
        self.assertEqual({s["color"] for s in face["strokes"]}, {"#ffcc4d"})
        self.assertFalse([n for n in m["nodes"] if n.get("skin")])
        self.assertEqual(m["facemap"]["skin"], "none")

    def test_layers_are_children_of_face_inside_head_in_paint_order_behind_features(self):
        m = model_for("1f602", skin="zombie")
        by = {n["name"]: n for n in m["nodes"]}
        layers = [n for n in m["nodes"] if n.get("skin")]
        rim = layers[0]
        limit = max(math.hypot(x + rim["world"][0], z + rim["world"][2]) for x, _, z in rim["strokes"][0]["points"])
        ys = [n["world"][1] for n in layers]
        self.assertEqual(ys, sorted(ys, reverse=True))               # later layers are nearer the camera
        self.assertGreater(min(ys), by["1f602.eye_left"]["world"][1])  # but every one is behind the features
        self.assertGreater(min(ys), by["1f602.mouth"]["world"][1])
        for n in layers:
            self.assertEqual(n["parent"], "1f602.face")
            for st in n["strokes"]:
                for x, _, z in st["points"]:
                    self.assertLessEqual(math.hypot(x + n["world"][0], z + n["world"][2]), limit + 1e-9, n["part"])

    def test_deterministic_and_different_per_emoji(self):
        a = B.zombie_head_layers("1f600", 1.0)
        self.assertEqual(a, B.zombie_head_layers("1f600", 1.0))
        self.assertNotEqual(a["flesh_mottle"], B.zombie_head_layers("1f602", 1.0)["flesh_mottle"])
        self.assertNotEqual(a["flesh_base"], B.zombie_head_layers("1f602", 1.0)["flesh_base"])


class NewFaces(unittest.TestCase):
    def test_nerd_glasses_are_painted_behind_the_eyes_they_frame(self):
        m = model_for("1f913")
        y = {n["part"]: n["world"][1] for n in m["nodes"]}
        self.assertGreater(y["glasses"], y["eye_left"])          # larger Y = further from the camera
        self.assertGreater(y["glasses"], y["eye_right"])
        self.assertEqual(m["facemap"]["warnings"], [])

    def test_pleading_face_gets_brows_and_eye_whites_under_the_eyes(self):
        m = model_for("1f97a")
        self.assertEqual(node(m, "brow_left")["parent"], "1f97a.brows")
        self.assertEqual(node(m, "eyewhite_left")["parent"], "1f97a.eye_left")
        self.assertEqual(node(m, "highlight_left")["parent"], "1f97a.eye_left")

    def test_exploding_head_groups_smoke_and_flames(self):
        m = model_for("1f92f")
        self.assertEqual(node(m, "explosion")["kind"], "empty")
        for part in ("smoke", "flame_outer", "flame_mid", "flame_inner", "smoke_light_left"):
            self.assertEqual(node(m, part)["parent"], "1f92f.explosion", part)

    def test_zany_tongue_and_mask_and_skull_parts(self):
        self.assertEqual(node(model_for("1f92a"), "tongue_detail")["parent"], "1f92a.tongue")
        self.assertEqual(node(model_for("1f92a"), "tongue")["parent"], "1f92a.mouth")
        self.assertIn("mask", model_for("1f637")["facemap"]["parts"])
        parts = model_for("2620")["facemap"]["parts"]
        self.assertEqual({p for p in parts if p.startswith("bone_")},
                         {"bone_top_left", "bone_top_right", "bone_bottom_left", "bone_bottom_right"})

    def test_tear_well_grows_from_the_bottom(self):
        m = model_for("1f979")
        clip = next(c for c in m["clips"] if c["name"] == "tear_well")
        w = B.evaluate_pose(m, (clip["start"] + clip["end"]) // 2)
        self.assertGreater(w["1f979.tear_left"][3], 1.5)
        self.assertGreaterEqual(node(m, "tear_left")["bbox"][1], -1)   # pivot at the bottom edge
        self.assertAlmostEqual(node(m, "tear_left")["world"][2], node(m, "tear_left")["bbox"][1], places=6)

    def test_rattle_and_shake_move_the_root(self):
        for code, path in (("2620", "rotation_euler"), ("1f92f", "location")):
            m = model_for(code)
            name = "rattle" if code == "2620" else "shake"
            clip = next(c for c in m["clips"] if c["name"] == name)
            self.assertTrue(all(t["node"] == code and t["path"] == path for t in clip["tracks"]), code)

    def test_complete_flag_accepts_a_mask_or_skull(self):
        self.assertTrue(model_for("1f637")["facemap"]["complete"])
        self.assertTrue(model_for("2620")["facemap"]["complete"])


class MoreFaces(unittest.TestCase):
    def test_sunglasses_have_no_eyes_but_still_look_around(self):
        m = model_for("1f60e")
        parts = m["facemap"]["parts"]
        self.assertIn("glasses", parts)
        self.assertFalse([p for p in parts if p.startswith("eye_")])
        self.assertTrue(m["facemap"]["complete"])
        names = [c["name"] for c in m["clips"]]
        self.assertIn("look_around", names)
        self.assertNotIn("eye_dart", names)

    def test_smirk_raises_one_brow(self):
        m = model_for("1f60f")
        clip = next(c for c in m["clips"] if c["name"] == "brow_raise")
        self.assertEqual({t["node"] for t in clip["tracks"]}, {"1f60f.brow_right"})

    def test_sleeping_zs_and_shadows(self):
        m = model_for("1f634")
        for i in (1, 2, 3):
            self.assertEqual(node(m, f"zzz_shadow_{i}")["parent"], f"1f634.zzz_{i}")
            self.assertEqual(node(m, f"zzz_{i}")["parent"], "1f634")
        clip = next(c for c in m["clips"] if c["name"] == "zzz")
        self.assertEqual({t["node"] for t in clip["tracks"]}, {f"1f634.zzz_{i}" for i in (1, 2, 3)})

    def test_dizzy_eyes_spin_a_full_turn(self):
        m = model_for("1f635")
        clip = next(c for c in m["clips"] if c["name"] == "eye_spin")
        for t in clip["tracks"]:
            self.assertAlmostEqual(t["keys"][-1][1] - t["keys"][0][1], math.tau)

    def test_thinking_face_hand_is_not_the_mouth(self):
        m = model_for("1f914")
        parts = m["facemap"]["parts"]
        self.assertEqual(parts["hand"]["colors"], ["#f19020"])
        self.assertEqual(parts["mouth"]["colors"], ["#65471b"])
        self.assertEqual(parts["brow_left"]["rule"], "spec-rule")
        clip = next(c for c in m["clips"] if c["name"] == "chin_tap")
        self.assertTrue(all(t["node"] == "1f914.hand" for t in clip["tracks"]))

    def test_hearts_pulse_and_scream_hands_exist(self):
        m = model_for("1f970")
        for i in (1, 2, 3):
            self.assertEqual(node(m, f"heart_shadow_{i}")["parent"], f"1f970.heart_{i}")
        self.assertTrue({"hand_left", "hand_right", "pallor"} <= set(model_for("1f631")["facemap"]["parts"]))

    def test_wound_stays_clear_of_where_eyes_sit(self):
        for code in ("1f600", "1f612", "1f914", "1f92a"):
            m = model_for(code, skin="zombie")
            w = next(n for n in m["nodes"] if n["part"] == "wound_rim")
            xs = [x + w["world"][0] for st in w["strokes"] for x, _, _ in st["points"]]
            self.assertGreater(min(abs(x) for x in xs), 0.5, code)


class MoreFaces2(unittest.TestCase):
    def test_kiss_winks_with_the_right_eye_and_sends_a_heart(self):
        m = model_for("1f618")
        blink = next(c for c in m["clips"] if c["name"] == "blink")
        self.assertEqual({t["node"] for t in blink["tracks"]}, {"1f618.eye_left"})
        self.assertEqual(node(m, "heart_shadow_1")["parent"], "1f618.heart_1")

    def test_yum_has_a_tongue_with_a_crease(self):
        m = model_for("1f60b")
        self.assertEqual(node(m, "tongue_detail")["parent"], "1f60b.tongue")
        self.assertEqual(node(m, "tongue")["parent"], "1f60b.mouth")

    def test_shushing_finger_is_the_hand_not_the_mouth(self):
        m = model_for("1f92b")
        parts = m["facemap"]["parts"]
        self.assertEqual(parts["hand"]["colors"], ["#f19020"])
        self.assertEqual(parts["mouth"]["colors"], ["#65471b"])
        self.assertEqual(node(m, "hand_detail_1")["parent"], "1f92b.hand")
        self.assertEqual(m["facemap"]["warnings"], [])

    def test_nauseated_cheeks_puff_out_of_step(self):
        m = model_for("1f922")
        clip = next(c for c in m["clips"] if c["name"] == "puff")
        peaks = {t["node"]: max(t["keys"], key=lambda k: k[1])[0] for t in clip["tracks"]}
        self.assertNotEqual(peaks["1f922.cheek_left"], peaks["1f922.cheek_right"])

    def test_cold_face_icicles_are_four_tears_and_all_drip(self):
        m = model_for("1f976")
        self.assertEqual(len([p for p in m["facemap"]["parts"] if p.startswith("tear_")]), 4)
        clip = next(c for c in m["clips"] if c["name"] == "tear_drip")
        self.assertEqual(len({t["node"] for t in clip["tracks"]}), 4)
        self.assertEqual(m["facemap"]["warnings"], [])

    def test_yawn_opens_the_dark_mouth_and_squints(self):
        m = model_for("1f971")
        parts = m["facemap"]["parts"]
        self.assertEqual(parts["mouth"]["colors"], ["#664500"])
        self.assertEqual(parts["hand"]["colors"], ["#f4900c"])
        clip = next(c for c in m["clips"] if c["name"] == "yawn")
        w = B.evaluate_pose(m, (clip["start"] + clip["end"]) // 2)
        self.assertGreater(w["1f971.mouth"][0], 1.2)
        self.assertLess(w["1f971.eye_left"][3], 0.6)

    def test_face_without_a_mouth_is_still_complete(self):
        m = model_for("1f636")
        self.assertNotIn("mouth", m["facemap"]["parts"])
        self.assertTrue(m["facemap"]["complete"])

    def test_pale_forehead_patch_is_named_on_the_scared_faces(self):
        for code in ("1f628", "1f630", "1f631"):
            self.assertIn("pallor", model_for(code)["facemap"]["parts"], code)


class IdleAnimation(unittest.TestCase):
    def test_every_supported_face_has_the_idle_clips(self):
        for code, spec in B.FACES.items():
            self.assertIn("tilt", spec.animations, code)                  # every face tilts
            for a in spec.idle:
                self.assertIn(a, spec.animations, code)

    def test_look_around_looks_both_ways_features_lead_the_skull(self):
        m = model_for("1f644", skin="zombie")
        clip = next(c for c in m["clips"] if c["name"] == "look_around")
        xs = lambda name: [B.evaluate_pose(m, clip["start"] + o)[name][4] for o in range(0, 73)]
        rest = B.evaluate_pose(m, 1)
        dx = lambda name: [v - rest[name][4] for v in xs(name)]
        pupil, mouth, face = dx("1f644.pupil_left"), dx("1f644.mouth"), dx("1f644.face")
        for series in (pupil, mouth, face):                      # left (negative X) and right (positive X)
            self.assertLess(min(series), -1e-3)
            self.assertGreater(max(series), 1e-3)
        self.assertGreater(max(map(abs, mouth)), max(map(abs, face)) * 1.5)       # parallax
        first_move = lambda s: next(i for i, v in enumerate(s) if abs(v) > 1e-4)
        self.assertLess(first_move(pupil), first_move(face))                      # the eyes lead
        w = B.evaluate_pose(m, clip["start"] + 30)
        self.assertNotAlmostEqual(w["1f644.eyes"][1], 1.0)                        # the head is tilted (rotated)

    def test_tilt_is_slight_and_returns(self):
        m = model_for("1f600")
        clip = next(c for c in m["clips"] if c["name"] == "tilt")
        angles = [t["keys"] for t in clip["tracks"] if t["node"] == "1f600" and t["path"] == "rotation_euler"][0]
        vals = [v for _, v in angles]
        self.assertLessEqual(max(map(abs, vals)), 0.2)            # radians: well under 12 degrees
        self.assertTrue(min(vals) < 0 < max(vals))
        self.assertEqual(vals[0], 0.0)
        self.assertEqual(vals[-1], 0.0)

    def test_eye_dart_moves_the_pupils_only_a_little(self):
        m = model_for("1f92a")
        clip = next(c for c in m["clips"] if c["name"] == "eye_dart")
        for t in clip["tracks"]:
            rest = next(n for n in m["nodes"] if n["name"] == t["node"])["location"][t["index"]]
            self.assertLess(max(abs(v - rest) for _, v in t["keys"]), 0.5)
            self.assertTrue(t["node"].split(".")[1].startswith("pupil_"))


class PosePreview(unittest.TestCase):
    """The host-side pose evaluator behind --gif (pure Python, no Pillow needed)."""

    def test_rest_pose_matches_the_rig(self):
        m = model_for("1f602", skin="zombie")
        w = B.evaluate_pose(m, 1)
        by = {n["name"]: n for n in m["nodes"]}
        for name, n in by.items():
            parent = w[n["parent"]] if n["parent"] else None
            px, py, pz = (parent[4], parent[5], parent[6]) if parent else (0, 0, 0)
            self.assertAlmostEqual(w[name][4], px + n["location"][0], places=9, msg=name)
            self.assertAlmostEqual(w[name][6], pz + n["location"][2], places=9, msg=name)
            self.assertAlmostEqual(w[name][0], 1.0)
            self.assertAlmostEqual(w[name][3], 1.0)

    def test_blink_squashes_the_eye_and_the_pupil_follows(self):
        m = model_for("1f600", skin="none")
        clip = next(c for c in m["clips"] if c["name"] == "blink")
        mid = (clip["start"] + clip["end"]) // 2
        w = B.evaluate_pose(m, mid)
        self.assertLess(w["1f600.eye_left"][3], 0.2)
        self.assertLess(w["1f600.pupil_left"][3], 0.2) if "1f600.pupil_left" in w else None
        self.assertAlmostEqual(B.evaluate_pose(m, clip["end"] + 2)["1f600.eye_left"][3], 1.0)

    def test_every_face_is_back_at_rest_after_each_clip_and_at_the_end(self):
        for code in B.FACES:
            m = model_for(code, skin="zombie")
            last = max(c["end"] for c in m["clips"])
            rest, end = B.evaluate_pose(m, 1), B.evaluate_pose(m, last)
            for name in rest:
                for a, b in zip(rest[name], end[name]):
                    self.assertAlmostEqual(a, b, places=6, msg=f"{code} {name}")

    def test_rotation_about_the_view_axis(self):
        m = {"nodes": [{"name": "r", "parent": None, "location": [0, 0, 0], "kind": "empty"},
                       {"name": "c", "parent": "r", "location": [1, 0, 0], "kind": "empty"}],
             "clips": [{"name": "x", "start": 1, "end": 2,
                        "tracks": [{"node": "r", "path": "rotation_euler", "index": 1,
                                    "keys": [[1, math.pi / 2], [2, math.pi / 2]]}]}]}
        w = B.evaluate_pose(m, 1)
        self.assertAlmostEqual(w["c"][4], 0.0, places=9)
        self.assertAlmostEqual(w["c"][6], -1.0, places=9)    # Blender: +90 deg about Y sends +X to -Z


@unittest.skipUnless(importlib.util.find_spec("PIL"), "needs Pillow")
class GifExport(unittest.TestCase):
    def test_gif_is_written_looping_with_the_whole_timeline(self):
        from PIL import Image
        m = model_for("1f602", skin="zombie")
        with tempfile.TemporaryDirectory() as d:
            n = B.write_gif(m, Path(d) / "x.gif", px=96, fps=24)
            self.assertEqual(n, max(c["end"] for c in m["clips"]))
            g = Image.open(Path(d) / "x.gif")
            self.assertEqual(g.size, (96, 96))
            self.assertEqual(g.info.get("loop"), 0)
            total = 0
            for i in range(g.n_frames):          # identical frames are merged, their durations add up
                g.seek(i)
                total += g.info["duration"]
            self.assertGreaterEqual(total, n * 30)

    def test_gif_samples_the_timeline_at_the_requested_fps(self):
        m = model_for("1f600", skin="none")
        last = max(c["end"] for c in m["clips"])
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(B.write_gif(m, Path(d) / "a.gif", px=48), len(range(1, last + 1, 3)))   # default 8 fps
            self.assertEqual(B.write_gif(m, Path(d) / "b.gif", px=48, fps=24), last)

    def test_frames_differ_during_a_clip_and_background_is_applied(self):
        from PIL import ImageChops
        m = model_for("1f600", skin="zombie")
        clip = next(c for c in m["clips"] if c["name"] == "blink")
        mid = (clip["start"] + clip["end"]) // 2
        bg = B.hex_rgb("#102030")
        a = B.render_frame(m, B.evaluate_pose(m, 1), 128, bg)
        b = B.render_frame(m, B.evaluate_pose(m, mid), 128, bg)
        self.assertEqual(a.getpixel((1, 1)), bg)
        self.assertIsNotNone(ImageChops.difference(a, b).getbbox())
        self.assertEqual(ImageChops.difference(a, B.render_frame(m, B.evaluate_pose(m, clip["end"] + 2), 128, bg)).getbbox(), None)

    def test_cli_writes_gifs(self):
        with tempfile.TemporaryDirectory() as d:
            r = subprocess.run([sys.executable, str(ROOT / "blender.py"), "--emojis", "1f600", "--facemap-only",
                                "--gif", "--gif-size", "64", "--output", d], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertTrue((Path(d) / "1f600.gif").read_bytes().startswith(b"GIF8"))


class Cli(unittest.TestCase):
    def test_resolve_codes(self):
        short, _ = B.load_emoji_tables()
        self.assertEqual(B.resolve_codes("joy", short), ["1f602"])
        self.assertEqual(B.resolve_codes(":joy:,1F602,1f600", short), ["1f602", "1f600"])  # deduped
        with self.assertRaises(SystemExit):
            B.resolve_codes("definitely_not_an_emoji", short)

    def test_faces_keyword_and_all(self):
        short, _ = B.load_emoji_tables()
        self.assertEqual(B.resolve_codes("faces", short), list(B.FACES))
        self.assertEqual(B.resolve_codes("all", short), list(B.FACES))     # no --experimental: supported faces only
        self.assertEqual(len(B.resolve_codes("all", short, experimental=True)),
                         len(list((ROOT / "data" / "svg").glob("*.svg"))))

    def test_unsupported_emoji_are_refused_without_experimental(self):
        with tempfile.TemporaryDirectory() as t:
            self.assertEqual(B.host_main(["--emojis", "1f921", "--output", t, "--facemap-only"]), 1)
            self.assertEqual(list(Path(t).glob("*.json")), [])

    def test_experimental_exports_detected_faces_and_skips_non_faces(self):
        with tempfile.TemporaryDirectory() as t:
            rc = B.host_main(["--emojis", "1f921,1f680", "--output", t, "--facemap-only", "--experimental"])
            self.assertEqual(rc, 0)
            self.assertTrue((Path(t) / "1f921.facemap.json").exists())
            self.assertFalse((Path(t) / "1f680.facemap.json").exists())      # a rocket is not a face

    def test_faces_keyword_writes_every_supported_face(self):
        with tempfile.TemporaryDirectory() as t:
            self.assertEqual(B.host_main(["--emojis", "faces", "--output", t, "--facemap-only"]), 0)
            self.assertEqual(len(list(Path(t).glob("*.facemap.json"))), len(B.FACES))

    def test_list_faces(self):
        self.assertEqual(B.host_main(["--list-faces"]), 0)

    def test_facemap_only_needs_no_blender(self):
        with tempfile.TemporaryDirectory() as t:
            rc = B.host_main(["--emojis", "1f602", "--output", t, "--facemap-only", "--debug-svg"])
            self.assertEqual(rc, 0)
            fm = json.loads((Path(t) / "1f602.facemap.json").read_text())
            self.assertIn("eye_left", fm["parts"])
            self.assertTrue((Path(t) / "1f602.facemap.svg").exists())


@unittest.skipUnless(HAS_BPY, "bpy module not installed")
class BlenderSide(unittest.TestCase):
    def build(self, code):
        import bpy
        out = tempfile.mkdtemp() + f"/{code}.blend"
        B._build_emoji_in_blender(bpy, model_for(code, skin="zombie"), out)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.wm.open_mainfile(filepath=out)
        bpy.context.view_layer.update()
        return bpy

    def test_one_object_per_part_with_parenting(self):
        bpy = self.build("1f633")
        ob = bpy.data.objects
        self.assertEqual(ob["1f633.eye_left"].parent, ob["1f633.eyes"])
        self.assertEqual(ob["1f633.pupil_left"].parent, ob["1f633.eye_left"])
        self.assertEqual(ob["1f633.eyes"].parent, ob["1f633"])
        self.assertEqual(ob["1f633"].type, "EMPTY")
        self.assertEqual(ob["1f633.eye_left"].type, "GREASEPENCIL")
        self.assertEqual(ob["1f633.eye_left"]["part"], "eye_left")

    def test_world_positions_mirror_left_and_right(self):
        bpy = self.build("1f602")
        left, right = bpy.data.objects["1f602.eye_left"], bpy.data.objects["1f602.eye_right"]
        self.assertLess(left.matrix_world.translation.x, 0)
        self.assertAlmostEqual(left.matrix_world.translation.x, -right.matrix_world.translation.x, places=4)
        self.assertAlmostEqual(left.matrix_world.translation.z, right.matrix_world.translation.z, places=4)

    def test_depth_order(self):
        bpy = self.build("1f602")
        y = lambda n: bpy.data.objects[f"1f602.{n}"].matrix_world.translation.y
        self.assertLess(y("teeth"), y("mouth"))
        self.assertLess(y("mouth"), y("face"))

    def test_every_stroke_is_filled_and_outline_hidden(self):
        # Regression: Blender 5 only fills strokes with a non-zero `fill_id`;
        # without it the file contained all the shapes but nothing filled.
        bpy = self.build("1f602")
        gps = [o for o in bpy.data.objects if o.type == "GREASEPENCIL"]
        self.assertGreater(len(gps), 5)
        for o in gps:
            drawing = o.data.layers[0].frames[0].drawing
            ids = [v.value for v in drawing.attributes["fill_id"].data]
            self.assertTrue(all(i > 0 for i in ids), o.name)
            self.assertEqual(len(ids), len(set(ids)), o.name)
            self.assertTrue(all(v.value for v in drawing.attributes["hide_stroke"].data), o.name)

    def test_colour_is_converted_to_linear_and_materials_are_shared(self):
        bpy = self.build("1f602")
        mat = bpy.data.materials["emoji_86a85a"]   # zombie skin base
        r, g, b, a = mat.grease_pencil.fill_color
        self.assertAlmostEqual(r, B._srgb_to_linear(0x86 / 255), places=3)
        self.assertAlmostEqual(g, B._srgb_to_linear(0xA8 / 255), places=3)
        self.assertAlmostEqual(b, B._srgb_to_linear(0x5A / 255), places=3)
        self.assertEqual(len([m for m in bpy.data.materials if m.name.startswith("emoji_664500")]), 1)

    def test_face_map_and_markers_are_stored(self):
        bpy = self.build("1f602")
        root = bpy.data.objects["1f602"]
        fm = json.loads(root["face_map"])
        self.assertEqual(fm["parts"]["mouth"]["object"], "1f602.mouth")
        scene = bpy.context.scene
        self.assertEqual([m.name for m in scene.timeline_markers], [a["name"] for a in fm["animations"]])
        self.assertEqual(scene.frame_end, fm["animations"][-1]["end"])

    def test_animation_evaluates(self):
        bpy = self.build("1f600")
        scene = bpy.context.scene
        fm = json.loads(bpy.data.objects["1f600"]["face_map"])
        blink = next(a for a in fm["animations"] if a["name"] == "blink")
        eye = bpy.data.objects["1f600.eye_left"]
        scene.frame_set(blink["start"])
        self.assertAlmostEqual(eye.scale[2], 1.0)
        scene.frame_set(blink["start"] + 4)
        self.assertAlmostEqual(eye.scale[2], 0.1, places=4)
        scene.frame_set(blink["end"])
        self.assertAlmostEqual(eye.scale[2], 1.0, places=4)

    def test_children_follow_the_parent_when_animated(self):
        bpy = self.build("1f600")
        scene = bpy.context.scene
        fm = json.loads(bpy.data.objects["1f600"]["face_map"])
        talk = next(a for a in fm["animations"] if a["name"] == "talk")
        teeth = bpy.data.objects["1f600.teeth"]
        scene.frame_set(talk["start"])
        rest = teeth.matrix_world.translation.z
        scene.frame_set(talk["start"] + 9)
        bpy.context.view_layer.update()
        self.assertLess(teeth.matrix_world.translation.z, rest)     # the jaw dropped and took the teeth with it


if __name__ == "__main__":
    unittest.main()
