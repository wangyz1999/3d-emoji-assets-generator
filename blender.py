#!/usr/bin/env python3
"""Export Twemoji SVGs to Blender Grease Pencil, with face-part tagging.

Usage (system Python 3.8+, no third-party packages needed):

    python3 blender.py --emojis joy,1f600,1f60d --output ./output/blender/
    python3 blender.py --emojis all --output ./output/blender/ --facemap-only

For every emoji this writes:

    <name>.blend          Grease Pencil object, one layer per face part
    <name>.facemap.json   which shapes were identified as eyes, mouth, ...
    <name>.facemap.svg    (--debug-svg) the labelled shapes, to eyeball the mapping

How it works
------------
This one file runs in two modes.

1. Host mode (plain ``python3``): parses the SVG, flattens every path into
   polygons, works out which polygons are the face / eyes / mouth / ..., and
   writes a job file. It then starts Blender in the background as a subprocess,
   running *this same file* with ``--python``.
2. Blender mode (``--blender-side``): reads the job file and builds the
   Grease Pencil data with ``bpy``. All the geometry work has already been
   done, so this half is deliberately thin.

Blender >= 4.3 is required (the new "Grease Pencil v3" data model).

Layer naming (what you will find in the .blend)
-----------------------------------------------
    face                      the head shape
    eye_left / eye_right      left/right *as seen by the viewer* (screen side)
    pupil_*  / highlight_*    shapes contained in an eye
    brow_left / brow_right
    mouth, teeth, tongue, mouth_detail
    tear_*, blush_*
    other_01, other_02, ...   everything else, split into runs so the original
                              SVG paint order is preserved

Each layer's origin (pivot) sits at the centre of its shapes, so scaling an
eye layer on Z blinks around the eye, rotating a brow pivots around the brow.
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import warnings
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parent
SVG_DIR = REPO_ROOT / "data" / "svg"
EMOJI_JSON = REPO_ROOT / "data" / "emojis.json"

MIN_BLENDER = (4, 3)  # Grease Pencil v3 data model

Point = Tuple[float, float]


# ---------------------------------------------------------------------------
# Small geometry helpers
# ---------------------------------------------------------------------------

def signed_area(pts: List[Point]) -> float:
    s = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return s / 2.0


def polygon_centroid(pts: List[Point]) -> Point:
    a = signed_area(pts)
    if abs(a) < 1e-9:
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
    cx = cy = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        f = x1 * y2 - x2 * y1
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    return (cx / (6 * a), cy / (6 * a))


def point_in_polygon(p: Point, pts: List[Point]) -> bool:
    x, y = p
    inside = False
    n = len(pts)
    j = n - 1
    for i in range(n):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y):
            if x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inside = not inside
        j = i
    return inside


def interior_point(pts: List[Point]) -> Point:
    """A point that is reliably *inside* the polygon (centre of its widest
    horizontal span), unlike the centroid which can fall outside for crescents
    and arcs."""
    ys = [p[1] for p in pts]
    y0, y1 = min(ys), max(ys)
    h = y1 - y0
    best: Optional[Tuple[float, Point]] = None
    n = len(pts)
    for frac in (0.5, 0.35, 0.65, 0.25, 0.75):
        y = y0 + h * frac + 1e-7
        xs = []
        for i in range(n):
            xa, ya = pts[i]
            xb, yb = pts[(i + 1) % n]
            if (ya <= y < yb) or (yb <= y < ya):
                xs.append(xa + (y - ya) * (xb - xa) / (yb - ya))
        xs.sort()
        for k in range(0, len(xs) - 1, 2):
            width = xs[k + 1] - xs[k]
            if best is None or width > best[0]:
                best = (width, ((xs[k] + xs[k + 1]) / 2, y))
    if best is not None:
        return best[1]
    return polygon_centroid(pts)


def mat_mul(m1, m2):
    """Compose affine matrices (a, b, c, d, e, f): result applies m2 first."""
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def mat_apply(m, p: Point) -> Point:
    a, b, c, d, e, f = m
    return (a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f)


_NUM_RE = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


def parse_transform(s: str):
    m = IDENTITY
    for name, args in re.findall(r"(\w+)\s*\(([^)]*)\)", s or ""):
        v = [float(x) for x in _NUM_RE.findall(args)]
        if name == "matrix" and len(v) == 6:
            t = tuple(v)
        elif name == "translate":
            t = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0.0)
        elif name == "scale":
            t = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
        elif name == "rotate":
            a = math.radians(v[0])
            ca, sa = math.cos(a), math.sin(a)
            t = (ca, sa, -sa, ca, 0, 0)
            if len(v) == 3:
                t = mat_mul(mat_mul((1, 0, 0, 1, v[1], v[2]), t), (1, 0, 0, 1, -v[1], -v[2]))
        elif name == "skewX":
            t = (1, 0, math.tan(math.radians(v[0])), 1, 0, 0)
        elif name == "skewY":
            t = (1, math.tan(math.radians(v[0])), 0, 1, 0, 0)
        else:
            continue
        m = mat_mul(m, t)
    return m


# ---------------------------------------------------------------------------
# SVG path flattening
# ---------------------------------------------------------------------------

class _Scanner:
    def __init__(self, s: str):
        self.s = s
        self.i = 0

    def _skip(self):
        s, n = self.s, len(self.s)
        while self.i < n and s[self.i] in " \t\r\n,":
            self.i += 1

    def command(self) -> Optional[str]:
        self._skip()
        if self.i < len(self.s) and self.s[self.i].isalpha():
            c = self.s[self.i]
            self.i += 1
            return c
        return None

    def has_number(self) -> bool:
        self._skip()
        return self.i < len(self.s) and (self.s[self.i] in "+-." or self.s[self.i].isdigit())

    def number(self) -> float:
        self._skip()
        m = _NUM_RE.match(self.s, self.i)
        if not m:
            raise ValueError(f"expected number at {self.i} in path data")
        self.i = m.end()
        return float(m.group())

    def flag(self) -> int:
        # Arc flags may be packed with no separators ("a2 2 0 0112 3").
        self._skip()
        c = self.s[self.i] if self.i < len(self.s) else ""
        if c not in ("0", "1"):
            raise ValueError(f"expected arc flag at {self.i} in path data")
        self.i += 1
        return int(c)


def _cubic(p0, p1, p2, p3, n):
    out = []
    for i in range(1, n + 1):
        t = i / n
        mt = 1 - t
        out.append((
            mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0],
            mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1],
        ))
    return out


def _quad(p0, p1, p2, n):
    out = []
    for i in range(1, n + 1):
        t = i / n
        mt = 1 - t
        out.append((
            mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
            mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
        ))
    return out


def _arc(x1, y1, rx, ry, phi_deg, fa, fs, x2, y2, n):
    """SVG elliptical arc (spec appendix F.6.5) flattened to points."""
    if x1 == x2 and y1 == y2:
        return []
    rx, ry = abs(rx), abs(ry)
    if rx == 0 or ry == 0:
        return [(x2, y2)]
    phi = math.radians(phi_deg)
    cp, sp = math.cos(phi), math.sin(phi)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p = cp * dx + sp * dy
    y1p = -sp * dx + cp * dy
    lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if lam > 1:
        s = math.sqrt(lam)
        rx *= s
        ry *= s
    num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    coef = math.sqrt(max(0.0, num / den)) if den else 0.0
    if fa == fs:
        coef = -coef
    cxp = coef * rx * y1p / ry
    cyp = -coef * ry * x1p / rx
    cx = cp * cxp - sp * cyp + (x1 + x2) / 2
    cy = sp * cxp + cp * cyp + (y1 + y2) / 2

    def ang(ux, uy, vx, vy):
        return math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)

    th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if fs == 0 and dth > 0:
        dth -= 2 * math.pi
    elif fs == 1 and dth < 0:
        dth += 2 * math.pi
    segs = max(1, math.ceil(n * abs(dth) / (math.pi / 2)))
    out = []
    for i in range(1, segs + 1):
        t = th1 + dth * i / segs
        out.append((
            cp * rx * math.cos(t) - sp * ry * math.sin(t) + cx,
            sp * rx * math.cos(t) + cp * ry * math.sin(t) + cy,
        ))
    out[-1] = (x2, y2)
    return out


def flatten_path(d: str, n: int = 8) -> List[List[Point]]:
    """Flatten SVG path data into polylines (one per sub-path).

    ``n`` is the number of line segments per Bezier curve (and per 90 degrees
    of an arc) - the same knob as ``--curve-segments`` in the TS CLI.
    """
    sc = _Scanner(d)
    subpaths: List[List[Point]] = []
    cur: Optional[List[Point]] = None
    x = y = sx = sy = 0.0
    cmd: Optional[str] = None
    last_c2: Optional[Point] = None  # last cubic control point (for S)
    last_q: Optional[Point] = None   # last quad control point (for T)

    def finish():
        nonlocal cur
        if cur is not None and len(cur) >= 2:
            subpaths.append(cur)
        cur = None

    while True:
        c = sc.command()
        if c is not None:
            cmd = c
        elif sc.has_number() and cmd is not None and cmd not in "Zz":
            if cmd == "M":
                cmd = "L"
            elif cmd == "m":
                cmd = "l"
        else:
            break

        rel = cmd.islower()
        up = cmd.upper()
        ox, oy = (x, y) if rel else (0.0, 0.0)

        if up == "Z":
            if cur is not None:
                finish()
            x, y = sx, sy
            last_c2 = last_q = None
            continue

        if up == "M":
            finish()
            x, y = ox + sc.number(), oy + sc.number()
            sx, sy = x, y
            cur = [(x, y)]
            last_c2 = last_q = None
            continue

        if cur is None:
            cur = [(x, y)]
            sx, sy = x, y

        if up == "L":
            x, y = ox + sc.number(), oy + sc.number()
            cur.append((x, y))
            last_c2 = last_q = None
        elif up == "H":
            x = (x if rel else 0.0) + sc.number()
            cur.append((x, y))
            last_c2 = last_q = None
        elif up == "V":
            y = (y if rel else 0.0) + sc.number()
            cur.append((x, y))
            last_c2 = last_q = None
        elif up == "C":
            p1 = (ox + sc.number(), oy + sc.number())
            p2 = (ox + sc.number(), oy + sc.number())
            p3 = (ox + sc.number(), oy + sc.number())
            cur.extend(_cubic((x, y), p1, p2, p3, n))
            x, y = p3
            last_c2, last_q = p2, None
        elif up == "S":
            p1 = (2 * x - last_c2[0], 2 * y - last_c2[1]) if last_c2 else (x, y)
            p2 = (ox + sc.number(), oy + sc.number())
            p3 = (ox + sc.number(), oy + sc.number())
            cur.extend(_cubic((x, y), p1, p2, p3, n))
            x, y = p3
            last_c2, last_q = p2, None
        elif up == "Q":
            p1 = (ox + sc.number(), oy + sc.number())
            p2 = (ox + sc.number(), oy + sc.number())
            cur.extend(_quad((x, y), p1, p2, n))
            x, y = p2
            last_q, last_c2 = p1, None
        elif up == "T":
            p1 = (2 * x - last_q[0], 2 * y - last_q[1]) if last_q else (x, y)
            p2 = (ox + sc.number(), oy + sc.number())
            cur.extend(_quad((x, y), p1, p2, n))
            x, y = p2
            last_q, last_c2 = p1, None
        elif up == "A":
            rx, ry, rot = sc.number(), sc.number(), sc.number()
            fa, fs = sc.flag(), sc.flag()
            ex, ey = ox + sc.number(), oy + sc.number()
            cur.extend(_arc(x, y, rx, ry, rot, fa, fs, ex, ey, n))
            x, y = ex, ey
            last_c2 = last_q = None
        else:
            raise ValueError(f"unsupported path command {cmd!r}")

    finish()
    return subpaths


def _clean_polygon(pts: List[Point]) -> List[Point]:
    out: List[Point] = []
    for p in pts:
        if not out or abs(p[0] - out[-1][0]) > 1e-9 or abs(p[1] - out[-1][1]) > 1e-9:
            out.append(p)
    while len(out) > 1 and abs(out[0][0] - out[-1][0]) < 1e-9 and abs(out[0][1] - out[-1][1]) < 1e-9:
        out.pop()
    return out


def _ellipse_polygon(cx, cy, rx, ry, n) -> List[Point]:
    count = max(8, 4 * n)
    return [
        (cx + rx * math.cos(2 * math.pi * i / count), cy + ry * math.sin(2 * math.pi * i / count))
        for i in range(count)
    ]


# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------

_NAMED = {
    "red": "#ff0000", "green": "#008000", "navy": "#000080",
    "white": "#ffffff", "black": "#000000",
}


def parse_color(s: str) -> Optional[str]:
    """Return '#rrggbb', or None if unparseable."""
    s = s.strip().lower()
    if s in _NAMED:
        return _NAMED[s]
    m = re.fullmatch(r"#([0-9a-f]{3})", s)
    if m:
        return "#" + "".join(ch * 2 for ch in m.group(1))
    if re.fullmatch(r"#[0-9a-f]{6}", s):
        return s
    return None


def hex_rgb(h: str) -> Tuple[int, int, int]:
    return int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)


def color_dist(a: str, b: str) -> float:
    ra, rb = hex_rgb(a), hex_rgb(b)
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(ra, rb)))


def luminance(h: str) -> float:
    r, g, b = hex_rgb(h)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


# ---------------------------------------------------------------------------
# SVG -> units (one unit = one filled polygon)
# ---------------------------------------------------------------------------

@dataclass
class Unit:
    """One filled polygon. A single SVG <path> with several sub-paths becomes
    several units - this matters because Twemoji often draws both eyes, the
    brows *and* the mouth in one <path>."""
    pts: List[Point]
    color: str
    alpha: float
    elem: int
    order: float = 0.0
    hole: bool = False
    parent: Optional["Unit"] = None  # for holes: the shape they are cut from
    uid: int = -1
    label: str = "other"
    rule: str = ""
    confidence: float = 0.0
    bbox: Tuple[float, float, float, float] = field(init=False)
    area: float = field(init=False)
    centroid: Point = field(init=False)

    def __post_init__(self):
        xs = [p[0] for p in self.pts]
        ys = [p[1] for p in self.pts]
        self.bbox = (min(xs), min(ys), max(xs), max(ys))
        self.area = abs(signed_area(self.pts))
        self.centroid = polygon_centroid(self.pts)

    @property
    def w(self) -> float:
        return self.bbox[2] - self.bbox[0]

    @property
    def h(self) -> float:
        return self.bbox[3] - self.bbox[1]

    def interior(self) -> Point:
        return interior_point(self.pts)


_SKIP_TAGS = {"defs", "clipPath", "title", "desc", "metadata", "style", "mask"}


def _local(tag: str) -> str:
    return tag.split("}")[-1]


@dataclass
class _Elem:
    id: int
    color: str
    alpha: float
    rule: str
    subpaths: List[List[Point]]


def _detect_holes(subpaths: List[List[Point]], rule: str):
    """For every sub-path of one SVG element decide whether it is a hole in
    another sub-path. Returns [(is_hole, parent_index_or_None)]."""
    n = len(subpaths)
    areas = [abs(signed_area(p)) for p in subpaths]
    orient = [1 if signed_area(p) > 0 else -1 for p in subpaths]
    # Nesting is decided from boundary vertices, not an "interior point": the
    # interior point of a ring's outer polygon sits in the middle of the ring,
    # i.e. inside the hole, which would make the two sub-paths contain each other.
    probes = [(p[0], p[len(p) // 2]) for p in subpaths]
    result = []
    for i in range(n):
        containers = [j for j in range(n)
                      if j != i and areas[j] > areas[i]
                      and all(point_in_polygon(q, subpaths[j]) for q in probes[i])]
        parent = min(containers, key=lambda j: areas[j]) if containers else None
        if rule == "evenodd":
            is_hole = len(containers) % 2 == 1
        else:  # nonzero
            wn = sum(orient[j] for j in containers)
            is_hole = wn != 0 and wn + orient[i] == 0
        result.append((is_hole, parent))
    return result


@dataclass
class ParsedSvg:
    vb: Tuple[float, float, float, float]  # minx, miny, w, h
    units: List[Unit]
    warnings: List[str]


def parse_svg(path: Path, curve_segments: int = 8) -> ParsedSvg:
    root = ET.parse(str(path)).getroot()
    vb_attr = root.get("viewBox")
    if vb_attr:
        vb = tuple(float(v) for v in re.split(r"[\s,]+", vb_attr.strip()))
    else:
        vb = (0.0, 0.0, float(root.get("width", 36)), float(root.get("height", 36)))
    warnings: List[str] = []
    elems: List[_Elem] = []

    def warn(msg: str):
        if msg not in warnings:
            warnings.append(msg)

    def walk(el, ctm, st):
        tag = _local(el.tag)
        if tag in _SKIP_TAGS:
            return
        st = dict(st)
        for k in ("fill", "fill-opacity", "fill-rule"):
            if el.get(k) is not None:
                st[k] = el.get(k)
        if el.get("opacity") is not None:
            st["opacity"] = st["opacity"] * float(el.get("opacity"))
        if el.get("clip-path"):
            warn("clip-path ignored")
        stroke = el.get("stroke")
        if stroke and stroke != "none":
            warn("stroke ignored (fills only)")
        m = mat_mul(ctm, parse_transform(el.get("transform"))) if el.get("transform") else ctm

        if tag in ("svg", "g"):
            for child in el:
                walk(child, m, st)
            return

        if tag == "path":
            raw = flatten_path(el.get("d", ""), curve_segments)
        elif tag == "circle":
            r = float(el.get("r", 0))
            raw = [_ellipse_polygon(float(el.get("cx", 0)), float(el.get("cy", 0)), r, r, curve_segments)]
        elif tag == "ellipse":
            raw = [_ellipse_polygon(float(el.get("cx", 0)), float(el.get("cy", 0)),
                                    float(el.get("rx", 0)), float(el.get("ry", 0)), curve_segments)]
        else:
            warn(f"<{tag}> not supported, skipped")
            return

        fill = st["fill"]
        if fill == "none":
            return
        color = parse_color(fill)
        if color is None:
            warn(f"unrecognised fill {fill!r}, used black")
            color = "#000000"
        subpaths = []
        for sp in raw:
            poly = _clean_polygon([mat_apply(m, p) for p in sp])
            if len(poly) >= 3 and abs(signed_area(poly)) > 1e-9:
                subpaths.append(poly)
        if subpaths:
            alpha = max(0.0, min(1.0, st["opacity"] * float(st["fill-opacity"])))
            elems.append(_Elem(len(elems), color, alpha, st["fill-rule"], subpaths))

    walk(root, IDENTITY, {"fill": "#000000", "fill-opacity": "1", "fill-rule": "nonzero", "opacity": 1.0})

    # Elements -> units, resolving holes.
    units: List[Unit] = []
    seq = 0
    for e in elems:
        holes = _detect_holes(e.subpaths, e.rule)
        local: Dict[int, Unit] = {}
        for k, poly in enumerate(e.subpaths):
            if not holes[k][0]:
                u = Unit(poly, e.color, e.alpha, e.id, order=float(seq))
                seq += 1
                local[k] = u
                units.append(u)
        last_order = max((u.order for u in local.values()), default=float(seq))
        for k, poly in enumerate(e.subpaths):
            if not holes[k][0]:
                continue
            # A hole shows whatever was painted underneath: use the colour of
            # the topmost earlier shape covering it (painter's algorithm).
            ip = interior_point(poly)
            under = None
            for cand in reversed(units):
                if cand.elem < e.id and not cand.hole and point_in_polygon(ip, cand.pts):
                    under = cand
                    break
            if under is None:
                warn("hole with nothing underneath dropped")
                continue
            parent_k = holes[k][1]
            for _ in range(len(e.subpaths)):  # bounded walk up the nesting chain
                if parent_k is None or parent_k in local:
                    break
                parent_k = holes[parent_k][1]
            else:
                parent_k = None
            parent = local.get(parent_k) if parent_k is not None else None
            base = parent.order if parent is not None else last_order
            n_before = sum(1 for u in units if u.hole and u.elem == e.id)
            h = Unit(poly, under.color, 1.0, e.id, order=base + 0.001 * (n_before + 1),
                     hole=True, parent=parent)
            units.append(h)

    units.sort(key=lambda u: u.order)
    for i, u in enumerate(units):
        u.uid = i
    return ParsedSvg(vb, units, warnings)


# ---------------------------------------------------------------------------
# Face-part classification
# ---------------------------------------------------------------------------

def _side(u: float) -> str:
    return "left" if u < 0 else "right"


def _is_whiteish(c: str) -> bool:
    r, g, b = hex_rgb(c)
    return min(r, g, b) >= 200 and max(r, g, b) - min(r, g, b) <= 40


def _is_reddish(c: str) -> bool:
    r, g, b = hex_rgb(c)
    return r >= 170 and r - g >= 60 and r - b >= 30


def _is_bluish(c: str) -> bool:
    r, g, b = hex_rgb(c)
    return b >= 180 and b - r >= 50 and b >= g


def _is_blush(c: str) -> bool:
    """Soft pink (cheek blush). Deliberately excludes saturated reds such as
    the hearts in heart-eyes, which have a much lower green channel."""
    r, g, b = hex_rgb(c)
    return r >= 190 and r - g >= 50 and 90 <= g <= 175 and 100 <= b <= 200


def _is_roundish(u: Unit) -> bool:
    """Circle/ellipse-like outline (rules out hearts, hands, stars)."""
    fit = u.area / (math.pi * (u.w / 2) * (u.h / 2))
    return 0.85 <= fit <= 1.15 and 0.4 <= u.w / u.h <= 2.5


def _mostly_inside(inner: Unit, outer: Unit) -> bool:
    if not point_in_polygon(inner.interior(), outer.pts):
        return False
    inside = sum(1 for p in inner.pts if point_in_polygon(p, outer.pts))
    return inside / len(inner.pts) >= 0.6


def classify(units: List[Unit], vb) -> dict:
    """Label each unit with a face part. Mutates ``unit.label/rule/confidence``
    and returns a summary dict."""
    _, _, vw, vh = vb
    for u in units:
        u.label, u.rule, u.confidence = "other", "", 0.0

    solids = [u for u in units if not u.hole]
    summary = {"is_face": False, "head": None}

    # --- head: the big shape that fills (most of) the canvas ---------------
    # It must also be round: an ellipse has area = pi*a*b, whereas the rounded
    # square backgrounds of flags and buttons come out at ~4/pi = 1.27.
    head = None
    for u in sorted(solids, key=lambda u: -u.area):
        if u.w >= 0.6 * vw and u.h >= 0.6 * vh and u.area >= 0.3 * vw * vh:
            ellipse_fit = u.area / (math.pi * (u.w / 2) * (u.h / 2))
            if 0.75 <= ellipse_fit <= 1.12 and 0.75 <= u.w / u.h <= 1.33:
                head = u
                break
    if head is None:
        return summary

    hcx, hcy = (head.bbox[0] + head.bbox[2]) / 2, (head.bbox[1] + head.bbox[3]) / 2
    hw, hh = head.w / 2, head.h / 2
    norm: Dict[int, Tuple[float, float]] = {}

    def nm(u: Unit):
        if u.uid not in norm:
            norm[u.uid] = ((u.centroid[0] - hcx) / hw, (u.centroid[1] - hcy) / hh)
        return norm[u.uid]

    feats = [u for u in solids if u is not head and u.order > head.order
             and abs(nm(u)[0]) <= 1.1 and abs(nm(u)[1]) <= 1.1]
    taken: set = set()

    def mark(u: Unit, label: str, rule: str, conf: float):
        u.label, u.rule, u.confidence = label, rule, conf
        taken.add(u.uid)

    # --- eyes: a mirror-symmetric pair in the upper half --------------------
    cand = [f for f in feats
            if -0.85 <= nm(f)[1] <= 0.2 and 0.12 <= abs(nm(f)[0]) <= 0.85
            and 0.002 <= f.area / head.area <= 0.2 and f.w / (2 * hw) <= 0.5]

    # Tears and blush are never eyes, even when they happen to be symmetric.
    cand = [f for f in cand if not _is_bluish(f.color) and not _is_blush(f.color)]

    def valid_pairs(tier: str):
        found = []
        for i in range(len(cand)):
            for j in range(i + 1, len(cand)):
                a, b = cand[i], cand[j]
                ua, va = nm(a)
                ub, vb_ = nm(b)
                if ua * ub >= 0:
                    continue
                ratio = min(a.area, b.area) / max(a.area, b.area)
                dv, mir = abs(va - vb_), abs(ua + ub)
                cd = color_dist(a.color, b.color)
                if tier == "strict":
                    ok = ratio >= 0.5 and dv <= 0.12 and mir <= 0.15 and cd <= 48
                else:
                    ok = ratio >= 0.12 and dv <= 0.3 and mir <= 0.3 and cd <= 120
                if not ok:
                    continue
                found.append((dv + mir + 0.5 * (1 - ratio) + cd / 255, a, b))
        return found

    def choose_pair(pairs):
        """Best-scoring pair - but brows form a symmetric pair too, and sit
        above the eyes, so prefer the lowest pair among comparably good ones."""
        pairs = sorted(pairs, key=lambda p: p[0])
        best = pairs[0]

        def mean_v(p):
            return (nm(p[1])[1] + nm(p[2])[1]) / 2

        lowest = max((p for p in pairs if p[0] <= best[0] + 0.35), key=mean_v)
        return lowest if mean_v(lowest) >= mean_v(best) + 0.1 else best

    eyes: Dict[str, Unit] = {}
    pair, conf, rule = None, 1.0, "eye-pair"
    strict = valid_pairs("strict")
    if strict:
        pair = choose_pair(strict)
    else:
        relaxed = valid_pairs("relaxed")
        if relaxed:
            pair, conf, rule = choose_pair(relaxed), 0.6, "eye-pair-relaxed"
    if pair is not None:
        _, a, b = pair
        for e in (a, b):
            side = _side(nm(e)[0])
            eyes[side] = e
            mark(e, f"eye_{side}", rule, conf)

    # --- mouth: biggest non-skin shape low and central ----------------------
    mouth = None
    mcand = [f for f in feats if f.uid not in taken and nm(f)[1] >= 0.05
             and abs(nm(f)[0]) <= 0.45 and color_dist(f.color, head.color) > 40]
    # Prefer non-blue shapes (a pool of tears is blue and can be bigger than
    # the mouth) and ignore anything spanning the whole width of the face.
    mcand = [f for f in mcand if f.w / (2 * hw) <= 0.9]
    if mcand:
        mouth = max(mcand, key=lambda f: (not _is_bluish(f.color), f.area))
        mark(mouth, "mouth", "mouth-lower-center", 0.8)

    # --- single-eye fallback (winks, cyclops) only if a mouth was found -----
    if not eyes and mouth is not None:
        scand = [f for f in feats if f.uid not in taken and -0.7 <= nm(f)[1] <= 0.0
                 and 0.1 <= abs(nm(f)[0]) <= 0.75 and color_dist(f.color, head.color) > 40
                 and 0.002 <= f.area / head.area <= 0.2]
        if scand:
            e = max(scand, key=lambda f: f.area)
            side = _side(nm(e)[0])
            eyes[side] = e
            mark(e, f"eye_{side}", "eye-single", 0.4)

    # --- details inside eyes: pupils / highlights ---------------------------
    for side, eye in eyes.items():
        for f in feats:
            if f.uid in taken or f.order <= eye.order or f.area >= eye.area:
                continue
            if _mostly_inside(f, eye):
                kind = "pupil" if luminance(f.color) < luminance(eye.color) - 20 else "highlight"
                mark(f, f"{kind}_{side}", "inside-eye", 0.7)

    # --- teeth / tongue / extra shapes inside the mouth ---------------------
    if mouth is not None:
        for f in feats:
            if f.uid in taken or f.order <= mouth.order or f.area >= mouth.area:
                continue
            if _mostly_inside(f, mouth):
                if _is_whiteish(f.color):
                    mark(f, "teeth", "inside-mouth-white", 0.7)
                elif _is_reddish(f.color):
                    mark(f, "tongue", "inside-mouth-red", 0.7)
                else:
                    mark(f, "mouth_detail", "inside-mouth", 0.5)

    # --- eyebrows: thin dark shapes above an eye -----------------------------
    for side, eye in eyes.items():
        for f in feats:
            if f.uid in taken:
                continue
            u_, v_ = nm(f)
            eu, ev = nm(eye)
            if _side(u_) != side or not (0.02 <= ev - v_ <= 0.6) or v_ < -0.98:
                continue
            thin = f.area / max(f.w * f.h, 1e-9) < 0.45
            overlap = min(f.bbox[2], eye.bbox[2]) - max(f.bbox[0], eye.bbox[0])
            # Brows are dark. (Don't compare to the eye colour alone: eyes can be white.)
            dark_or_like_eye = luminance(f.color) < 120 or color_dist(f.color, eye.color) <= 90
            if thin and overlap >= 0.3 * min(f.w, eye.w) and f.w / (2 * hw) <= 0.5 and dark_or_like_eye:
                mark(f, f"brow_{side}", "thin-above-eye", 0.6)

    # --- tears / blush on the sides -----------------------------------------
    for f in feats:
        if f.uid in taken:
            continue
        u_, v_ = nm(f)
        if _is_bluish(f.color) and abs(u_) >= 0.2:
            mark(f, f"tear_{_side(u_)}", "blue-on-side", 0.5)
        elif _is_blush(f.color) and abs(u_) >= 0.3 and v_ >= -0.15 and _is_roundish(f):
            mark(f, f"blush_{_side(u_)}", "pink-on-cheek", 0.5)

    is_face = bool(eyes) or mouth is not None
    if not is_face:
        for u in units:
            u.label, u.rule, u.confidence = "other", "", 0.0
        return summary

    mark(head, "face", "head", 1.0)
    for u in units:
        if u.hole and u.parent is not None:
            u.label, u.rule, u.confidence = u.parent.label, "hole-of-" + u.parent.label, u.parent.confidence
    summary.update(
        is_face=True,
        # True only when both eyes AND a mouth were found - use this when you
        # need to be sure; `is_face` alone is deliberately permissive.
        complete=len(eyes) == 2 and mouth is not None,
        head={"bbox": list(head.bbox), "color": head.color},
    )
    return summary


# ---------------------------------------------------------------------------
# Units -> layered model (the thing the Blender side consumes)
# ---------------------------------------------------------------------------

def _bboxes_overlap(a, b) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def build_layers(units: List[Unit]):
    """Group units into layers by part label, keeping SVG paint order.

    Labelled parts get one layer each (positioned at their first appearance);
    unlabelled shapes are split into runs so they stay in front of / behind
    the right parts. Returns (ordered list of (layer_name, part, [units]), warnings).
    """
    layers: Dict[str, List[Unit]] = {}
    parts: Dict[str, str] = {}
    run = 0
    prev_other = False
    for u in units:
        if u.label == "other":
            if not prev_other:
                run += 1
            key = f"other_{run:02d}"
            prev_other = True
        else:
            key = u.label
            prev_other = False
        layers.setdefault(key, []).append(u)
        parts.setdefault(key, u.label)
    ordered = sorted(layers.items(), key=lambda kv: kv[1][0].order)

    # Paint-order sanity check: layers are drawn whole, so an overlapping pair
    # of shapes can only come out wrong if their layers are ordered against
    # their original paint order.
    warnings: List[str] = []
    if len(units) <= 400:
        layer_pos = {name: i for i, (name, _) in enumerate(ordered)}
        key_of = {u.uid: name for name, us in ordered for u in us}
        bad = 0
        for i, a in enumerate(units):
            for b in units[i + 1:]:
                if key_of[a.uid] != key_of[b.uid] and layer_pos[key_of[a.uid]] > layer_pos[key_of[b.uid]] \
                        and _bboxes_overlap(a.bbox, b.bbox):
                    bad += 1
        if bad:
            warnings.append(f"{bad} overlapping shape pair(s) end up in the wrong paint order between layers")
    return [(name, parts[name], us) for name, us in ordered], warnings


# ---------------------------------------------------------------------------
# Supported faces: per-emoji customisation
# ---------------------------------------------------------------------------
#
# Auto-detection (classify() above) does the heavy lifting, but each face we
# *support* is listed here so it can be customised:
#
#   rules       force the label of a shape that auto-detection got wrong
#   pivots      where a part rotates/scales from (default: see DEFAULT_PIVOTS)
#   animations  which clips to generate, in timeline order (see CLIPS)
#   params      per-clip tweaks, e.g. {"blink": {"targets": ("eye_left",)}}
#
# Emoji that are not listed here are skipped unless --experimental is given.

@dataclass(frozen=True)
class Rule:
    """Force the label of one shape, picked by position in SVG coordinates."""
    label: str                       # part name, or "other" to demote a shape
    near: Tuple[float, float]        # the shape whose centroid is closest to this is picked
    radius: float = 3.0              # ... if it is within this distance
    color: Optional[str] = None      # ... and, if given, has exactly this '#rrggbb' fill


IDLE_CLIPS = ("look_around", "eye_dart", "tilt")


@dataclass(frozen=True)
class FaceSpec:
    title: str
    animations: Tuple[str, ...] = ("blink", "talk")
    rules: Tuple[Rule, ...] = ()
    # part -> "center" | "top" | "bottom" | "inner" | "outer" | "left" | "right"
    #         | (dx, dy) offset from the centre in SVG units (y points down)
    pivots: Dict[str, object] = field(default_factory=dict)
    params: Dict[str, dict] = field(default_factory=dict)
    zombie_head: bool = True         # False when the "face" shape is not a head to replace (the skull)
    mouthless: bool = False          # a face with no mouth at all (😶) still counts as complete
    idle: Tuple[str, ...] = IDLE_CLIPS   # clips appended to every face; drop the ones that make no sense


FACES: Dict[str, FaceSpec] = {
    "1f600": FaceSpec("grinning face", ("blink", "talk")),
    "1f603": FaceSpec("grinning face with big eyes", ("blink", "talk")),
    "1f604": FaceSpec("grinning face with smiling eyes", ("talk", "bounce")),       # arc eyes: no blink
    "1f601": FaceSpec("beaming face with smiling eyes", ("talk", "bounce")),
    "1f602": FaceSpec("face with tears of joy", ("talk", "brow_raise", "tear_drip", "bounce")),
    "1f609": FaceSpec("winking face", ("blink", "brow_raise", "talk"),
                      params={"blink": {"targets": ("eye_left",)}}),                # right eye is the wink
    "1f60d": FaceSpec("smiling face with heart-eyes", ("pulse", "talk")),
    "1f62d": FaceSpec("loudly crying face", ("brow_raise", "tear_drip", "talk"),
                      rules=(Rule("tear_pool", near=(18, 34), radius=2.5, color="#5dadec"),)),
    "1f61b": FaceSpec("face with tongue", ("blink", "talk")),
    "1f633": FaceSpec("flushed face", ("blink", "look", "brow_raise", "talk")),
    "1f644": FaceSpec("face with rolling eyes", ("look", "blink", "talk")),
    "1f621": FaceSpec("pouting face", ("talk",)),                                   # brows are merged into the eyes
    "1f610": FaceSpec("neutral face", ("blink", "talk"), params={"talk": {"gain": 4.0}}),  # thin line mouth
    "1f60a": FaceSpec("smiling face with smiling eyes", ("talk", "bounce")),
    "1f62e": FaceSpec("face with open mouth", ("blink", "talk"), pivots={"mouth": "center"}),
    "1f622": FaceSpec("crying face", ("blink", "brow_raise", "tear_drip", "talk")),
    "1f92a": FaceSpec("zany face", ("blink", "crazy_eyes", "talk", "tongue_wag", "bounce"),
                      rules=(Rule("tongue", near=(17, 30), radius=2.5, color="#e8596e"),
                             Rule("tongue_detail", near=(17, 28.5), radius=1.5, color="#dd2f45"))),
    "1f62c": FaceSpec("grimacing face", ("blink", "chatter", "bounce"),
                      rules=(Rule("teeth", near=(18, 25), radius=1.5, color="#ffffff"),)),
    "1f637": FaceSpec("face with medical mask", ("blink", "breathe", "bounce"),
                      rules=(Rule("mask", near=(18, 24), radius=2.0, color="#f5f8fa"),)),
    "1f92f": FaceSpec("exploding head", ("explode", "blink", "talk", "shake"),
                      rules=(Rule("face", near=(18, 24), radius=1.5, color="#ffcb4c"),
                             Rule("eye_left", near=(12, 20.6), radius=1.5, color="#65471b"),
                             Rule("eye_right", near=(24, 20.6), radius=1.5, color="#65471b"),
                             Rule("mouth", near=(18, 28.6), radius=1.5, color="#65471b"),
                             Rule("smoke", near=(18, 6.5), radius=2.0, color="#ccd6dd"),
                             Rule("smoke_light_left", near=(12, 7), radius=1.5, color="#e1e8ed"),
                             Rule("smoke_light_right", near=(27.8, 5.8), radius=1.5, color="#e1e8ed"),
                             Rule("flame_outer", near=(18.3, 14.5), radius=1.5, color="#f19020"),
                             Rule("flame_mid", near=(17.8, 13), radius=1.5, color="#f36c24"),
                             Rule("flame_inner", near=(18.1, 11.6), radius=1.5, color="#ce5c1f")),
                      pivots={"mouth": "center"}),
    "1f913": FaceSpec("nerd face", ("blink", "talk", "glasses_push", "bounce"),
                      rules=(Rule("glasses", near=(18, 14), radius=1.5, color="#292f33"),
                             Rule("teeth_gap", near=(18, 28.8), radius=1.0, color="#65471b"))),
    "1f97a": FaceSpec("pleading face", ("shimmer", "brow_raise", "blink", "quiver"),
                      rules=(Rule("brow_left", near=(10, 9), radius=1.5, color="#65471b"),
                             Rule("brow_right", near=(26, 9), radius=1.5, color="#65471b"),
                             Rule("eyewhite_left", near=(11.5, 17.5), radius=1.2, color="#ffffff"),
                             Rule("eyewhite_right", near=(24.5, 17.5), radius=1.2, color="#ffffff"))),
    "1f979": FaceSpec("face holding back tears", ("tear_well", "shimmer", "brow_raise", "blink", "talk"),
                      rules=(Rule("brow_left", near=(10, 9), radius=1.5, color="#65471b"),
                             Rule("brow_right", near=(26, 9), radius=1.5, color="#65471b"),
                             Rule("eyewhite_left", near=(11.5, 17.5), radius=1.2, color="#ffffff"),
                             Rule("eyewhite_right", near=(24.5, 17.5), radius=1.2, color="#ffffff")),
                      pivots={"tear_left": "bottom", "tear_right": "bottom"}),
    "1f60e": FaceSpec("smiling face with sunglasses", ("glasses_push", "talk", "bounce"),
                      rules=(Rule("glasses", near=(18, 14.2), radius=2.0, color="#292f33"),),
                      idle=("look_around", "tilt")),                                # no visible eyes
    "1f60f": FaceSpec("smirking face", ("blink", "brow_raise", "talk"),
                      params={"brow_raise": {"targets": ("brow_right",)}}),         # one raised brow
    "1f612": FaceSpec("unamused face", ("blink", "look", "brow_raise", "talk"),
                      rules=(Rule("brow_left", near=(11, 12), radius=1.5, color="#664500"),
                             Rule("brow_right", near=(25, 12), radius=1.5, color="#664500"))),
    "1f614": FaceSpec("pensive face", ("blink", "brow_raise", "talk")),
    "1f615": FaceSpec("confused face", ("blink", "look", "talk")),
    "1f620": FaceSpec("angry face", ("talk", "shake")),                             # brows are merged into the eyes
    "1f634": FaceSpec("sleeping face", ("breathe", "zzz"), idle=("tilt",),
                      rules=(Rule("zzz_shadow_1", near=(15.3, 7.7), radius=1.5, color="#ffac33"),
                             Rule("zzz_1", near=(15.9, 7.3), radius=1.5, color="#2a6797"),
                             Rule("zzz_shadow_2", near=(22.0, 4.3), radius=1.5, color="#ffac33"),
                             Rule("zzz_2", near=(22.8, 3.9), radius=1.5, color="#2a6797"),
                             Rule("zzz_shadow_3", near=(30.6, 8.2), radius=1.5, color="#ffac33"),
                             Rule("zzz_3", near=(31.6, 7.7), radius=1.5, color="#2a6797")),
                      pivots={"mouth": "center"}, params={"breathe": {"targets": ("mouth",), "amount": 0.18}}),
    "1f635": FaceSpec("face with crossed-out eyes", ("eye_spin", "brow_raise", "talk"), idle=("look_around", "tilt"),
                      pivots={"mouth": "center"}),
    "1f631": FaceSpec("face screaming in fear", ("shake", "pulse", "talk"), idle=("look_around", "tilt"),
                      rules=(Rule("pallor", near=(18, 10.7), radius=3.0, color="#bdddf4"),
                             Rule("hand_left", near=(3.8, 27.4), radius=2.0, color="#fcab40"),
                             Rule("hand_right", near=(32.2, 27.5), radius=2.0, color="#fcab40")),
                      pivots={"mouth": "center"}),
    "1f914": FaceSpec("thinking face", ("brow_raise", "look", "chin_tap", "blink", "talk"),
                      rules=(Rule("mouth", near=(18.5, 20.9), radius=1.5, color="#65471b"),
                             Rule("hand", near=(15.5, 26.9), radius=9.0, color="#f19020"),
                             Rule("brow_left", near=(13.2, 5.2), radius=1.5, color="#65471b"),
                             Rule("brow_right", near=(25.4, 9.4), radius=1.5, color="#65471b")),
                      pivots={"hand": (-6, 6)}, params={"brow_raise": {"targets": ("brow_right",)}}),
    "1f970": FaceSpec("smiling face with hearts", ("heartbeat", "talk"),
                      rules=(Rule("heart_shadow_1", near=(26.5, 5.9), radius=1.5, color="#ffac33"),
                             Rule("heart_1", near=(28.1, 5.2), radius=1.5, color="#dd2e44"),
                             Rule("heart_shadow_2", near=(8.0, 29.6), radius=1.5, color="#ffac33"),
                             Rule("heart_2", near=(6.2, 30.5), radius=1.5, color="#dd2e44"),
                             Rule("heart_shadow_3", near=(30.2, 27.7), radius=1.5, color="#ffac33"),
                             Rule("heart_3", near=(31.8, 27.6), radius=1.5, color="#dd2e44"))),
    "1f618": FaceSpec("face blowing a kiss", ("blink", "brow_raise", "heartbeat", "talk"),
                      params={"blink": {"targets": ("eye_left",)}},                  # the right eye is the wink
                      rules=(Rule("heart_shadow_1", near=(28.3, 26.6), radius=1.5, color="#ffac33"),
                             Rule("heart_1", near=(30.1, 25.9), radius=1.5, color="#dd2e44"))),
    "1f60b": FaceSpec("face savoring food", ("tongue_wag", "talk"),
                      rules=(Rule("tongue", near=(28.5, 29.8), radius=2.5, color="#e75b70"),
                             Rule("tongue_detail", near=(27.9, 29.0), radius=2.0, color="#de3146"))),
    "1f929": FaceSpec("star-struck", ("pulse", "eye_spin", "talk")),
    "1f92b": FaceSpec("shushing face", ("brow_raise", "blink", "shush"),
                      rules=(Rule("mouth", near=(17.8, 23.1), radius=1.5, color="#65471b"),
                             Rule("hand", near=(19.2, 28.4), radius=3.0, color="#f19020"),
                             Rule("hand_detail_1", near=(21.1, 28.8), radius=1.5, color="#65471b"),
                             Rule("hand_detail_2", near=(19.5, 33.2), radius=1.5, color="#65471b")),
                      pivots={"hand": "bottom"}),
    "1f922": FaceSpec("nauseated face", ("blink", "puff", "talk"),
                      rules=(Rule("mouth", near=(17.9, 24.2), radius=1.5, color="#292f33"),
                             Rule("cheek_left", near=(13.4, 24.4), radius=1.5, color="#3e721d"),
                             Rule("cheek_right", near=(22.6, 24.4), radius=1.5, color="#3e721d"))),
    "1f975": FaceSpec("hot face", ("tear_drip", "brow_raise", "blink", "talk")),
    "1f976": FaceSpec("cold face", ("chatter", "shake", "tear_drip", "blink"),
                      rules=(Rule("teeth", near=(18, 25.8), radius=1.5, color="#ffffff"),
                             Rule("tear_left", near=(2.4, 28.3), radius=1.5, color="#bbddf5"),      # the four ice
                             Rule("tear_right", near=(33.3, 24.1), radius=1.5, color="#bbddf5"),    # shapes are
                             Rule("tear_top_left", near=(8.3, 12.5), radius=1.5, color="#bbddf5"),  # painted either side
                             Rule("tear_top_right", near=(21.9, 4.3), radius=1.5, color="#bbddf5"))),   # of the brows
    "1f971": FaceSpec("yawning face", ("yawn",), idle=("look_around", "tilt"),
                      rules=(Rule("mouth", near=(18, 19.5), radius=2.0, color="#664500"),
                             Rule("hand", near=(12.2, 27), radius=6.0, color="#f4900c")),
                      pivots={"mouth": "center"}),
    "1f642": FaceSpec("slightly smiling face", ("blink", "talk")),
    "1f636": FaceSpec("face without mouth", ("blink",), mouthless=True),
    "1f611": FaceSpec("expressionless face", ("blink", "talk")),
    "1f628": FaceSpec("fearful face", ("brow_raise", "blink", "shake", "talk"),
                      rules=(Rule("pallor", near=(18, 8.4), radius=3.0, color="#bdddf4"),)),
    "1f630": FaceSpec("anxious face with sweat", ("tear_drip", "brow_raise", "blink", "talk"),
                      rules=(Rule("pallor", near=(18, 8.4), radius=3.0, color="#bdddf4"),)),
    "2620": FaceSpec("skull and crossbones", ("blink", "rattle", "bounce"), zombie_head=False,
                     rules=(Rule("face", near=(18, 18), radius=1.5, color="#ccd6dd"),
                            Rule("eye_left", near=(13.6, 15.5), radius=1.5, color="#292f33"),
                            Rule("eye_right", near=(22.4, 15.5), radius=1.5, color="#292f33"),
                            Rule("nose", near=(18, 21.7), radius=1.5, color="#292f33"),
                            Rule("bone_top_left", near=(5.6, 5.8), radius=2.0, color="#aab8c2"),
                            Rule("bone_top_right", near=(30.3, 5.8), radius=2.0, color="#aab8c2"),
                            Rule("bone_bottom_left", near=(5.6, 30), radius=2.0, color="#aab8c2"),
                            Rule("bone_bottom_right", near=(30.3, 30), radius=2.0, color="#aab8c2"))),
}


# Every supported face also gets the idle set: looking left and right (head turn + tilt),
# eye darts and a slow head tilt.
FACES = {c: replace(sp, animations=sp.animations + tuple(a for a in sp.idle if a not in sp.animations))
         for c, sp in FACES.items()}


def apply_rules(units: List[Unit], rules) -> List[str]:
    """Apply a spec's relabelling rules. Returns warnings for rules that matched nothing."""
    warns: List[str] = []
    for r in rules:
        best = None
        for u in units:
            if u.hole or (r.color and u.color != r.color):
                continue
            d = math.hypot(u.centroid[0] - r.near[0], u.centroid[1] - r.near[1])
            if d <= r.radius and (best is None or d < best[0]):
                best = (d, u)
        if best is None:
            warns.append(f"rule for '{r.label}' near {r.near} matched no shape")
            continue
        u = best[1]
        u.label, u.rule, u.confidence = r.label, "spec-rule", 1.0
    for u in units:  # a hole follows the shape it is cut from
        if u.hole and u.parent is not None:
            u.label, u.rule, u.confidence = u.parent.label, "hole-of-" + u.parent.label, u.parent.confidence
    return warns


def generic_spec(labels) -> FaceSpec:
    """Spec for --experimental: pick clips from whatever parts were detected."""
    anims = []
    if "eye_left" in labels or "eye_right" in labels:
        anims.append("blink")
    if "brow_left" in labels or "brow_right" in labels:
        anims.append("brow_raise")
    if "mouth" in labels:
        anims.append("talk")
    return FaceSpec("(auto-detected)", tuple(anims))


# ---------------------------------------------------------------------------
# Rig: one Grease Pencil object per part
# ---------------------------------------------------------------------------

DEPTH_STEP = 0.001   # world-Y offset per paint-order rank, times `size` (separate objects need depth)
DEFAULT_PIVOTS = {"brow_left": "inner", "brow_right": "inner", "mouth": "top", "tongue": "top",
                  "tear_left": "top", "tear_right": "top", "tear_pool": "center"}
FPS = 24
CLIP_GAP = 6         # frames between clips on the timeline


def _pivot_point(bbox, mode, s: float) -> Tuple[float, float]:
    """Pivot (Blender X, Z) for a part with world bbox (x0, z0, x1, z1)."""
    x0, z0, x1, z1 = bbox
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    if isinstance(mode, (tuple, list)):
        return cx + mode[0] * s, cz - mode[1] * s
    if mode == "top":
        return cx, z1
    if mode == "bottom":
        return cx, z0
    if mode == "left":
        return x0, cz
    if mode == "right":
        return x1, cz
    if mode in ("inner", "outer"):
        near_edge, far_edge = (x0, x1) if abs(x0) < abs(x1) else (x1, x0)
        return (near_edge if mode == "inner" else far_edge), cz
    return cx, cz


def _parent_key(part: str, present) -> str:
    """Which node a part hangs from: pupils follow their eye, teeth their mouth..."""
    cand = "root"
    if part.startswith(("pupil_", "highlight_", "eyewhite_")):
        cand = "eye_" + part.split("_", 1)[1]
    elif part.startswith("eye_"):
        cand = "eyes"
    elif part.startswith("brow_"):
        cand = "brows"
    elif part in ("teeth", "tongue", "mouth_detail", "teeth_gap"):
        cand = "mouth"
    elif part == "tongue_detail":
        cand = "tongue"
    elif part.startswith(("zzz_shadow_", "heart_shadow_")):
        cand = part.replace("_shadow", "")                      # a shadow follows its Z / heart
    elif part.startswith("hand_detail"):
        cand = "hand"
    elif part.startswith(("smoke", "flame")):
        cand = "explosion"
    elif part.startswith("tear_") and part != "tear_pool":
        cand = "tears"
    elif part.startswith("blush_"):
        cand = "face"
    return cand if cand == "root" or cand in present or cand in ("eyes", "brows", "tears", "explosion") else "root"


def build_rig(name: str, layer_list, spec: FaceSpec, vb, size: float):
    """Turn (key, part, units) groups into a node tree.

    Returns the nodes parents-first. Every node has a *world* position and a
    *local* location (relative to its parent, which is how Blender stores it);
    stroke points are relative to the node's own origin, which is its pivot.
    """
    minx, miny, vw, vh = vb
    cx, cy = minx + vw / 2, miny + vh / 2
    s = size / max(vw, vh)

    parts: Dict[str, dict] = {}
    for key, part, us in layer_list:
        pts_by_unit = [[((p[0] - cx) * s, -(p[1] - cy) * s) for p in u.pts] for u in us]   # (X, Z)
        xs = [p[0] for pts in pts_by_unit for p in pts]
        zs = [p[1] for pts in pts_by_unit for p in pts]
        parts[key] = {"key": key, "part": part, "units": us, "pts": pts_by_unit,
                      "bbox": (min(xs), min(zs), max(xs), max(zs)), "first_order": us[0].order}

    # Depth: later-painted shapes sit closer to the camera (which looks along +Y).
    rank = {k: i for i, k in enumerate(sorted(parts, key=lambda k: parts[k]["first_order"]))}

    present = set(parts)
    nodes: Dict[str, dict] = {"root": {"key": "root", "kind": "empty", "parent": "root-none", "world": [0.0, 0.0, 0.0]}}
    for key, p in parts.items():
        default = "top" if key.startswith("tear_") and key != "tear_pool" else DEFAULT_PIVOTS.get(key, "center")
        mode = spec.pivots.get(key, default)
        px, pz = _pivot_point(p["bbox"], mode, s)
        nodes[key] = {"key": key, "kind": "gp", "parent": _parent_key(key, present),
                      "world": [px, -rank[key] * DEPTH_STEP * size, pz], "data": p}
    for group in ("eyes", "brows", "tears", "explosion"):
        kids = [n for n in nodes.values() if n.get("parent") == group]
        if kids:
            gx = sum(k["world"][0] for k in kids) / len(kids)
            gz = sum(k["world"][2] for k in kids) / len(kids)
            nodes[group] = {"key": group, "kind": "empty", "parent": "root", "world": [gx, 0.0, gz]}

    def depth(k):
        d = 0
        while nodes[k]["parent"] != "root-none":
            k = nodes[k]["parent"]
            d += 1
        return d

    ordered = sorted(nodes.values(), key=lambda n: (depth(n["key"]), n.get("data", {}).get("first_order", -1)))
    out = []
    for n in ordered:
        par = nodes.get(n["parent"])
        pw = par["world"] if par else [0.0, 0.0, 0.0]
        node = {
            "name": name if n["key"] == "root" else f"{name}.{n['key']}",
            "part": n["key"],
            "kind": n["kind"],
            "parent": None if n["parent"] == "root-none" else (name if n["parent"] == "root" else f"{name}.{n['parent']}"),
            "world": n["world"],
            "location": [n["world"][i] - pw[i] for i in range(3)],
        }
        if n["kind"] == "gp":
            d = n["data"]
            px, pz = n["world"][0], n["world"][2]
            node["strokes"] = [
                {"points": [[x - px, 0.0, z - pz] for x, z in pts], "color": u.color, "alpha": u.alpha, "hole": u.hole}
                for u, pts in zip(d["units"], d["pts"])
            ]
            node["bbox"] = list(d["bbox"])
            node["units"] = d["units"]
        out.append(node)
    return out



# ---------------------------------------------------------------------------
# Zombie head: replaces the flat Twemoji head with many layers of zombie flesh
# ---------------------------------------------------------------------------
#
# The original head disc is thrown away. `face` becomes an empty and the head is
# rebuilt from scratch as a stack of Grease Pencil objects (an irregular, lumpy
# silhouette, shading, mottling, rot, a wound, veins, a bruise, stitches), so
# the only Twemoji shapes left are the face parts, which animate on top.
# Everything is procedural and seeded by the emoji code: reproducible, but no
# two faces look identical.

SKIN_STYLES = ("zombie", "none")
TWEMOJI_YELLOW = "#ffcc4d"
# Paint order, back to front: part name -> (colour, alpha)
ZOMBIE_LAYERS = {
    "flesh_rim": ("#4f6b34", 1.0),        # dark outer shell (shows as the rim)
    "flesh_base": ("#86a85a", 1.0),       # main flesh
    "flesh_shadow": ("#5f7d3a", 0.75),    # jaw / underside shading
    "flesh_highlight": ("#b4cb84", 0.55), # forehead light
    "cheek_hollows": ("#5f7d3a", 0.45),   # sunken cheeks
    "flesh_mottle": ("#5f7d3a", 0.6),     # dark mottled patches
    "flesh_pale": ("#c2d596", 0.5),       # sickly pale patches
    "rot": ("#5b5a2c", 0.7),              # brown decay near the edge
    "veins": ("#5a4a86", 0.6),            # purple veins
    "bruise": ("#7a3f9e", 0.55),          # bruise
    "wound_rim": ("#6e2424", 1.0),        # torn wound edge
    "wound_flesh": ("#b04a48", 1.0),      # exposed muscle
    "scar": ("#5a2d2d", 1.0),             # forehead scar
    "stitches": ("#2b2320", 1.0),         # stitches across the scar
}
ZOMBIE_PARTS = tuple(ZOMBIE_LAYERS)


def _is_twemoji_yellow(color: str) -> bool:
    r, g, b = hex_rgb(color)
    return r >= 240 and 195 <= g <= 212 and b <= 90


def _mix_hex(a: str, b: str, t: float) -> str:
    ra, rb = hex_rgb(a), hex_rgb(b)
    return "#%02x%02x%02x" % tuple(round(x + (y - x) * t) for x, y in zip(ra, rb))


def _blob(rng, cx, cz, r, n=14, wobble=0.35):
    """A lumpy closed polygon around (cx, cz)."""
    phase = rng.uniform(0, math.tau)
    rad = [r * (1 + wobble * math.sin(3 * math.tau * i / n + phase) * rng.uniform(0.5, 1.0)
                + 0.15 * rng.uniform(-1, 1)) for i in range(n)]
    return [(cx + rad[i] * math.cos(math.tau * i / n), cz + rad[i] * math.sin(math.tau * i / n)) for i in range(n)]


def _bar(p0, p1, width):
    (x0, z0), (x1, z1) = p0, p1
    dx, dz = x1 - x0, z1 - z0
    L = math.hypot(dx, dz) or 1.0
    nx, nz = -dz / L * width / 2, dx / L * width / 2
    return [(x0 + nx, z0 + nz), (x1 + nx, z1 + nz), (x1 - nx, z1 - nz), (x0 - nx, z0 - nz)]


def zombie_head_layers(code: str, radius: float):
    """{part: [polygon, ...]} in head-centred (X, Z) coordinates, parts in paint order."""
    import random
    rng = random.Random(f"zombie-{code}")
    R = radius
    lumps = [(k, rng.uniform(0.012, 0.03) * (1 if k < 4 else 0.6), rng.uniform(0, math.tau)) for k in (2, 3, 5, 7)]

    def head_r(a):
        """Radius of the head silhouette at angle a: round-ish, lumpy, narrower at the chin."""
        r = 1.0 + sum(amp * math.sin(k * a + ph) for k, amp, ph in lumps)
        r *= 1.0 - 0.07 * max(0.0, -math.sin(a)) ** 1.5      # chin
        r *= 1.0 + 0.02 * max(0.0, math.sin(a))              # cranium
        return R * 0.985 * r

    def outline(scale=1.0, dz=0.0, n=64):
        return [(scale * head_r(math.tau * i / n) * math.cos(math.tau * i / n),
                 scale * head_r(math.tau * i / n) * math.sin(math.tau * i / n) + dz * R) for i in range(n)]

    def clamp(pts, k=0.93):
        out = []
        for x, z in pts:
            lim = head_r(math.atan2(z, x)) * k
            d = math.hypot(x, z)
            f = lim / d if d > lim else 1.0
            out.append((x * f, z * f))
        return out

    def band(a0, a1, r_out, r_in, shift=(0.0, 0.0), n=18):
        """A crescent hugging the rim between two angles."""
        outer = [(r_out * head_r(a) * math.cos(a), r_out * head_r(a) * math.sin(a))
                 for a in (a0 + (a1 - a0) * i / n for i in range(n + 1))]
        inner = [(r_in * head_r(a) * math.cos(a) + shift[0] * R, r_in * head_r(a) * math.sin(a) + shift[1] * R)
                 for a in (a1 - (a1 - a0) * i / n for i in range(n + 1))]
        return clamp(outer + inner, 0.985)

    def spot(rmin, rmax):
        a, d = rng.uniform(0, math.tau), rng.uniform(rmin, rmax)
        return d * head_r(a) * math.cos(a), d * head_r(a) * math.sin(a)

    out: Dict[str, list] = {k: [] for k in ZOMBIE_LAYERS}
    out["flesh_rim"] = [outline(1.0)]
    out["flesh_base"] = [outline(0.955, dz=-0.012)]
    out["flesh_shadow"] = [band(math.radians(195), math.radians(345), 0.955, 0.55, shift=(0.0, 0.12))]
    out["flesh_highlight"] = [band(math.radians(55), math.radians(150), 0.93, 0.7, shift=(-0.05, -0.02))]
    for side in (-1, 1):
        out["cheek_hollows"].append(clamp(_blob(rng, side * R * 0.55, -R * 0.2, R * 0.2, wobble=0.2)))
    for _ in range(10):
        x, z = spot(0.1, 0.8)
        out["flesh_mottle"].append(clamp(_blob(rng, x, z, R * rng.uniform(0.07, 0.17))))
    for _ in range(7):
        x, z = spot(0.1, 0.75)
        out["flesh_pale"].append(clamp(_blob(rng, x, z, R * rng.uniform(0.06, 0.13))))
    for _ in range(4):                       # decay creeps in from the rim
        x, z = spot(0.72, 0.88)
        out["rot"].append(clamp(_blob(rng, x, z, R * rng.uniform(0.06, 0.12), wobble=0.5)))
    for _ in range(3):                       # a few branching veins
        a = rng.uniform(0, math.tau)
        x, z = 0.78 * head_r(a) * math.cos(a), 0.78 * head_r(a) * math.sin(a)
        ang = math.atan2(-z, -x) + rng.uniform(-0.5, 0.5)
        for _seg in range(4):
            ang += rng.uniform(-0.6, 0.6)
            ln = R * rng.uniform(0.08, 0.14)
            nx, nz = x + ln * math.cos(ang), z + ln * math.sin(ang)
            out["veins"].append(clamp(_bar((x, z), (nx, nz), R * 0.022)))
            x, z = nx, nz
    bruise_side = rng.choice((-1, 1))
    out["bruise"].append(clamp(_blob(rng, bruise_side * R * 0.5, -R * 0.3, R * 0.2, wobble=0.25)))
    wx, wz = -bruise_side * R * 0.70, R * 0.30            # torn-open temple on the other side
    out["wound_rim"].append(clamp(_blob(rng, wx, wz, R * 0.15, n=16, wobble=0.5)))
    out["wound_flesh"].append(clamp(_blob(rng, wx, wz, R * 0.09, n=14, wobble=0.45)))
    tilt = rng.uniform(-0.25, 0.25)                       # stitched scar across the forehead
    cx, cz = bruise_side * R * 0.1, R * 0.64
    half = R * 0.28
    a = (cx - half * math.cos(tilt), cz - half * math.sin(tilt))
    b = (cx + half * math.cos(tilt), cz + half * math.sin(tilt))
    out["scar"].append(clamp(_bar(a, b, R * 0.045)))
    nx, nz = -math.sin(tilt), math.cos(tilt)
    for i in range(5):
        t = (i + 0.5) / 5
        mx, mz = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        h = R * 0.075
        out["stitches"].append(clamp(_bar((mx - nx * h, mz - nz * h), (mx + nx * h, mz + nz * h), R * 0.02)))
    return out


def apply_zombie_skin(code: str, name: str, nodes: list, size: float) -> List[str]:
    """Replace the head disc by the zombie head: `face` becomes an empty with one object per layer."""
    face = next((n for n in nodes if n["part"] == "face" and n["kind"] == "gp"), None)
    if face is None:
        return ["zombie skin: no face part found"]
    radius = size / 2                       # every Twemoji head fills the canvas (even if the shape is cut off)
    cx, cz = -face["world"][0], -face["world"][2]                             # canvas centre, face-local
    head_colors = {st["color"] for st in face["strokes"]}
    tint = None if all(_is_twemoji_yellow(c) for c in head_colors) else sorted(head_colors)[0]   # e.g. red angry face
    # A hole is painted in the colour underneath (see "Holes" in the docs). Under a yellow
    # head that is yellow; it now has to be flesh, or the nerd glasses get yellow lenses.
    flesh = ZOMBIE_LAYERS["flesh_base"][0] if not tint else _mix_hex(ZOMBIE_LAYERS["flesh_base"][0], tint, 0.45)
    for n in nodes:
        for st in n.get("strokes", ()):
            if st.get("hole") and _is_twemoji_yellow(st["color"]):
                st["color"] = flesh
    face["kind"] = "empty"                      # the disc is gone; `face` is now just the head's origin
    for k in ("strokes", "bbox", "units", "data"):
        face.pop(k, None)
    names = list(ZOMBIE_LAYERS)
    gap = DEPTH_STEP * size                     # the room between this head and the next painted part
    for i, (part, polys) in enumerate(zombie_head_layers(code, radius).items()):
        color, alpha = ZOMBIE_LAYERS[part]
        if tint:
            color = _mix_hex(color, tint, 0.45)
        dy = -(i + 1) / (len(names) + 1) * gap
        xs = [x for p in polys for x, _ in p]
        zs = [z for p in polys for _, z in p]
        nodes.append({
            "name": f"{name}.{part}", "part": part, "kind": "gp", "parent": face["name"],
            "world": [face["world"][0], face["world"][1] + dy, face["world"][2]],
            "location": [0.0, dy, 0.0],
            "strokes": [{"points": [[x + cx, 0.0, z + cz] for x, z in poly], "color": color,
                         "alpha": alpha, "hole": False} for poly in polys],
            "bbox": [min(xs) + cx + face["world"][0], min(zs) + cz + face["world"][2],
                     max(xs) + cx + face["world"][0], max(zs) + cz + face["world"][2]],
            "skin": True,
        })
    return []


# ---------------------------------------------------------------------------
# Animation clips (plain keyframe data, so they can be tested without Blender)
# ---------------------------------------------------------------------------
#
# A clip builder returns (tracks, length_in_frames). A track is
#   {"node", "path": "location"|"scale"|"rotation_euler", "index", "keys": [[frame, value], ...]}
# Frames are relative to the clip start; values for "location" are offsets from the rest pose.

def _track(node, path, index, keys):
    rest = node["location"][index] if path == "location" else 0.0
    return {"node": node["name"], "path": path, "index": index, "keys": [[f, rest + v] for f, v in keys]}


def _clip_blink(P, size, p):
    targets = [k for k in (p.get("targets") or ("eye_left", "eye_right")) if k in P]
    sq = p.get("squash", 0.1)
    return [_track(P[k], "scale", 2, [(0, 1), (3, sq), (5, sq), (8, 1)]) for k in targets], 8


def _clip_talk(P, size, p):
    if "mouth" not in P:
        return [], 24
    gain = p.get("gain", 1.0)
    # Keep the jaw inside the face: scaling about the pivot should not push the
    # bottom of the mouth past the face edge. Mouths that already reach the
    # edge (face with tongue) still get a small movement.
    pz, z0 = P["mouth"]["world"][2], P["mouth"]["bbox"][1]
    if pz > z0:
        kmax = (pz + 0.97 * size / 2) / (pz - z0)
        gain = max(0.25, min(gain, (kmax - 1) / 0.6))
    frames = (0, 3, 6, 9, 12, 15, 18, 24)
    openness = (0, .5, -.3, .6, -.2, .4, -.1, 0)
    return [
        _track(P["mouth"], "scale", 2, [(f, max(0.25, 1 + o * gain)) for f, o in zip(frames, openness)]),
        _track(P["mouth"], "scale", 0, [(f, 1 - 0.08 * o * gain) for f, o in zip(frames, openness)]),
    ], 24


def _clip_brow_raise(P, size, p):
    if p.get("targets"):                         # e.g. a single raised brow
        nodes = [P[k] for k in p["targets"] if k in P]
    else:
        nodes = [P["brows"]] if "brows" in P else [P[k] for k in ("brow_left", "brow_right") if k in P]
    lift = p.get("lift", 0.06 * size)
    return [_track(n, "location", 2, [(0, 0), (4, lift), (12, lift), (16, 0)]) for n in nodes], 16


def _clip_look(P, size, p):
    pupils = [k for k in ("pupil_left", "pupil_right") if k in P]
    targets = pupils or [k for k in ("eye_left", "eye_right") if k in P]
    out = []
    for k in targets:
        node = P[k]
        if pupils:
            eye = P.get("eye_" + k.split("_")[1])
            width = (eye["bbox"][2] - eye["bbox"][0]) if eye else 0.1 * size
            d = p.get("dist", 0.18 * width)
        else:
            d = p.get("dist", 0.03 * size)
        out.append(_track(node, "location", 0, [(0, 0), (8, -d), (16, -d), (20, 0), (28, d), (36, 0)]))
        out.append(_track(node, "location", 2, [(0, 0), (20, 0), (24, d / 2), (32, d / 2), (36, 0)]))
    return out, 36


def _clip_pulse(P, size, p):
    amt = p.get("amount", 0.25)
    keys = [(0, 1), (4, 1 + amt), (8, 1), (12, 1 + amt), (16, 1)]
    return [_track(P[k], "scale", i, keys) for k in ("eye_left", "eye_right") if k in P for i in (0, 2)], 16


def _clip_tear_drip(P, size, p):
    tears = [n for k, n in P.items() if k.startswith("tear_") and k != "tear_pool"]
    out = [_track(n, "scale", 2, [(0, 1), (12, p.get("stretch", 1.4)), (24, 1)]) for n in tears]
    if "tear_pool" in P:
        out.append(_track(P["tear_pool"], "scale", 0, [(0, 1), (12, 1.06), (24, 1)]))
    return out, 24


def _clip_bounce(P, size, p):
    h = p.get("height", 0.05 * size)
    return [_track(P["root"], "location", 2, [(0, 0), (4, h), (8, 0), (12, h * 0.6), (16, 0)])], 16


def _eye_dist(P, side, size, frac):
    eye = P.get("eye_" + side)
    return frac * ((eye["bbox"][2] - eye["bbox"][0]) if eye else 0.1 * size)


def _gaze_nodes(P):
    """(nodes, is_pupil, side) that show where the face is looking: pupils, else the eyes themselves."""
    out = []
    for side in ("left", "right"):
        if "pupil_" + side in P:
            out.append((P["pupil_" + side], side, 0.2))
        elif "eye_" + side in P:
            out.append((P["eye_" + side], side, 0.08))
    return out


def _head_and_feature_nodes(P):
    """Head layers (the face empty, the explosion) vs features (everything else hanging from the root)."""
    head = [P[k] for k in ("face", "explosion") if k in P]
    skip = {"root", "face", "explosion"}
    feats = [n for k, n in P.items()
             if k not in skip and not k.startswith(("bone_", "skin_")) and n.get("parent") == P["root"]["name"]
             and not n.get("skin")]
    return head, feats


def _clip_look_around(P, size, p):
    """Eyes lead, then the head turns (features slide further than the skull: parallax) and tilts a touch."""
    gaze = _gaze_nodes(P)                        # faces with no visible eyes (sunglasses) still turn
    f, h = p.get("turn", 0.045 * size), p.get("head", 0.018 * size)
    tilt = p.get("tilt", 0.07)
    t = (0, 8, 16, 30, 40, 48, 56, 66, 72)
    eye_dir = (0, -1, -1, -1, 0, 1, 1, 1, 0)            # the eyes get there first...
    head_dir = (0, 0, -1, -1, 0, 0, 1, 1, 0)            # ...and the head follows
    out = []
    for node, side, frac in gaze:
        d = _eye_dist(P, side, size, frac)
        out.append(_track(node, "location", 0, [(a, d * b) for a, b in zip(t, eye_dir)]))
    head, feats = _head_and_feature_nodes(P)
    for n in head:
        out.append(_track(n, "location", 0, [(a, h * b) for a, b in zip(t, head_dir)]))
    for n in feats:
        out.append(_track(n, "location", 0, [(a, f * b) for a, b in zip(t, head_dir)]))
    out.append(_track(P["root"], "rotation_euler", 1, [(a, tilt * b) for a, b in zip(t, head_dir)]))
    return out, 72


def _clip_eye_dart(P, size, p):
    """Quick small glances: the eyes jump, hold, jump again."""
    gaze = _gaze_nodes(P)
    out = []
    for node, side, frac in gaze:
        d = _eye_dist(P, side, size, frac) * p.get("amount", 0.8)
        out.append(_track(node, "location", 0, [(0, 0), (3, 0.7 * d), (12, 0.7 * d), (14, -0.6 * d),
                                                 (23, -0.6 * d), (25, 0.25 * d), (33, 0.25 * d), (36, 0)]))
        out.append(_track(node, "location", 2, [(0, 0), (3, 0.3 * d), (12, 0.3 * d), (14, -0.2 * d),
                                                 (23, -0.2 * d), (25, 0), (33, 0), (36, 0)]))
    return out, 36


def _clip_tilt(P, size, p):
    a = p.get("angle", 0.09)
    return [_track(P["root"], "rotation_euler", 1, [(0, 0), (10, a), (20, 0), (30, -a), (40, 0)])], 40


def _clip_zzz(P, size, p):
    """The snore Zs bob up and down one after another."""
    up = p.get("lift", 0.07 * size)
    out = []
    for i, k in enumerate(("zzz_1", "zzz_2", "zzz_3")):
        if k not in P:
            continue
        s0 = i * 6
        out.append(_track(P[k], "location", 2, [(0, 0), (s0, 0), (s0 + 10, up), (s0 + 20, 0), (36, 0)]))
        out.append(_track(P[k], "scale", 0, [(0, 1), (s0, 1), (s0 + 10, 1.25), (s0 + 20, 1), (36, 1)]))
        out.append(_track(P[k], "scale", 2, [(0, 1), (s0, 1), (s0 + 10, 1.25), (s0 + 20, 1), (36, 1)]))
    return out, 36


def _clip_eye_spin(P, size, p):
    """Dizzy: the crossed-out eyes spin a full turn."""
    return [_track(P[k], "rotation_euler", 1, [(0, 0), (24, 2 * math.pi)])
            for k in ("eye_left", "eye_right") if k in P], 24


def _clip_chin_tap(P, size, p):
    if "hand" not in P:
        return [], 20
    a = p.get("angle", 0.12)
    return [_track(P["hand"], "rotation_euler", 1, [(0, 0), (4, a), (8, 0), (12, a), (16, 0), (20, 0)])], 20


def _clip_heartbeat(P, size, p):
    amt = p.get("amount", 0.25)
    out = []
    for i, k in enumerate(("heart_1", "heart_2", "heart_3")):
        if k not in P:
            continue
        s0 = i * 3
        keys = [(0, 1), (s0, 1), (s0 + 3, 1 + amt), (s0 + 6, 1), (s0 + 9, 1 + amt * 0.7), (s0 + 12, 1), (24, 1)]
        out += [_track(P[k], "scale", 0, keys), _track(P[k], "scale", 2, keys)]
    return out, 24


def _clip_shush(P, size, p):
    if "hand" not in P:
        return [], 24
    a = p.get("angle", 0.06)
    return [_track(P["hand"], "rotation_euler", 1, [(0, 0), (6, a), (12, -a), (18, a), (24, 0)]),
            _track(P["hand"], "location", 2, [(0, 0), (12, 0.015 * size), (24, 0)])], 24


def _clip_puff(P, size, p):
    amt = p.get("amount", 0.2)
    out = []
    for k, ph in (("cheek_left", 0), ("cheek_right", 8)):          # the cheeks swell out of step
        if k in P:
            keys = [(0, 1), (ph, 1), (ph + 8, 1 + amt), (ph + 16, 1), (32, 1)]
            out += [_track(P[k], "scale", 0, keys), _track(P[k], "scale", 2, keys)]
    return out, 32


def _clip_yawn(P, size, p):
    if "mouth" not in P:
        return [], 36
    big = p.get("open", 1.25)
    keys = [(0, 1), (10, big), (26, big), (36, 1)]
    out = [_track(P["mouth"], "scale", 0, keys), _track(P["mouth"], "scale", 2, keys)]
    for k in ("eye_left", "eye_right"):                              # the eyes squeeze shut
        if k in P:
            out.append(_track(P[k], "scale", 2, [(0, 1), (10, 0.45), (26, 0.45), (36, 1)]))
    if "hand" in P:
        out.append(_track(P["hand"], "location", 2, [(0, 0), (10, 0.03 * size), (26, 0.03 * size), (36, 0)]))
    return out, 36


def _clip_chatter(P, size, p):
    if "mouth" not in P:
        return [], 12
    a = p.get("amp", 0.012 * size)
    keys = [(0, 0)] + [(i, a if i % 2 else -a) for i in range(1, 12)] + [(12, 0)]
    return [_track(P["mouth"], "location", 0, keys)], 12


def _clip_breathe(P, size, p):
    amt = p.get("amount", 0.04)
    keys = [(0, 1), (10, 1 + amt), (20, 1)]
    return [_track(P[k], "scale", i, keys) for k in p.get("targets", ("mask",)) if k in P for i in (0, 2)], 20


def _clip_glasses_push(P, size, p):
    if "glasses" not in P:
        return [], 14
    up = p.get("lift", 0.04 * size)
    return [_track(P["glasses"], "location", 2, [(0, 0), (4, up), (10, up), (14, 0)]),
            _track(P["glasses"], "rotation_euler", 1, [(0, 0), (4, -0.08), (10, -0.08), (14, 0)])], 14


def _clip_tongue_wag(P, size, p):
    if "tongue" not in P:
        return [], 20
    a = p.get("angle", 0.3)
    return [_track(P["tongue"], "rotation_euler", 1, [(0, 0), (4, a), (8, -a), (12, a), (16, -a), (20, 0)])], 20


def _clip_crazy_eyes(P, size, p):
    out = []
    for sign, side in ((1, "left"), (-1, "right")):       # the pupils drift in opposite directions
        if "pupil_" + side not in P:
            continue
        eye = P.get("eye_" + side)
        d = p.get("dist", 0.2 * ((eye["bbox"][2] - eye["bbox"][0]) if eye else 0.1 * size))
        n = P["pupil_" + side]
        out.append(_track(n, "location", 0, [(0, 0), (6, sign * d), (12, 0), (18, -sign * d), (24, 0)]))
        out.append(_track(n, "location", 2, [(0, 0), (6, -d / 2), (12, 0), (18, d / 2), (24, 0)]))
    return out, 24


def _clip_shimmer(P, size, p):
    amt = p.get("amount", 0.25)
    keys = [(0, 1), (6, 1 + amt), (12, 1), (18, 1 + amt), (24, 1)]
    return [_track(P[k], "scale", i, keys) for k in ("highlight_left", "highlight_right") if k in P for i in (0, 2)], 24


def _clip_quiver(P, size, p):
    if "mouth" not in P:
        return [], 12
    keys = [(0, 1), (2, 1.12), (4, 0.92), (6, 1.1), (8, 0.93), (10, 1.08), (12, 1)]
    return [_track(P["mouth"], "scale", 0, keys)], 12


def _clip_tear_well(P, size, p):
    tears = [P[k] for k in ("tear_left", "tear_right") if k in P]
    return [_track(n, "scale", 2, [(0, 1), (12, p.get("stretch", 1.8)), (24, 1)]) for n in tears], 24


def _clip_explode(P, size, p):
    if "explosion" not in P:
        return [], 20
    amt, up = p.get("amount", 0.12), p.get("lift", 0.05 * size)
    keys = [(0, 1), (5, 1 + amt), (14, 1 + amt / 2), (20, 1)]
    return [_track(P["explosion"], "scale", 0, keys), _track(P["explosion"], "scale", 2, keys),
            _track(P["explosion"], "location", 2, [(0, 0), (5, up), (14, up / 2), (20, 0)])], 20


def _clip_shake(P, size, p):
    a = p.get("amp", 0.025 * size)
    keys = [(0, 0)] + [(i, a if i % 2 else -a) for i in range(1, 12)] + [(12, 0)]
    return [_track(P["root"], "location", 0, keys)], 12


def _clip_rattle(P, size, p):
    a = p.get("angle", 0.12)
    keys = [(0, 0), (2, a), (4, -a), (6, a), (8, -a), (10, a * 0.8), (12, -a * 0.8), (14, 0)]
    return [_track(P["root"], "rotation_euler", 1, keys)], 14


CLIPS = {"blink": _clip_blink, "talk": _clip_talk, "brow_raise": _clip_brow_raise, "look": _clip_look,
         "pulse": _clip_pulse, "tear_drip": _clip_tear_drip, "bounce": _clip_bounce,
         "chatter": _clip_chatter, "breathe": _clip_breathe, "glasses_push": _clip_glasses_push,
         "tongue_wag": _clip_tongue_wag, "crazy_eyes": _clip_crazy_eyes, "shimmer": _clip_shimmer,
         "quiver": _clip_quiver, "tear_well": _clip_tear_well, "explode": _clip_explode,
         "shake": _clip_shake, "rattle": _clip_rattle, "look_around": _clip_look_around,
         "eye_dart": _clip_eye_dart, "tilt": _clip_tilt, "zzz": _clip_zzz, "eye_spin": _clip_eye_spin,
         "chin_tap": _clip_chin_tap, "heartbeat": _clip_heartbeat, "shush": _clip_shush,
         "puff": _clip_puff, "yawn": _clip_yawn}


def build_clips(spec: FaceSpec, nodes, size: float):
    """Lay the spec's clips out one after another on a timeline."""
    P = {n["part"]: n for n in nodes}
    clips, warns, start = [], [], 1
    for cname in spec.animations:
        if cname not in CLIPS:
            warns.append(f"unknown animation '{cname}'")
            continue
        tracks, length = CLIPS[cname](P, size, spec.params.get(cname, {}))
        if not tracks:
            warns.append(f"animation '{cname}' skipped: the parts it needs were not found")
            continue
        for t in tracks:
            t["keys"] = [[start + f, v] for f, v in t["keys"]]
        clips.append({"name": cname, "start": start, "end": start + length, "tracks": tracks})
        start += length + CLIP_GAP
    return clips, warns


def _bbox_inside(a, b) -> bool:
    return a[0] >= b[0] and a[1] >= b[1] and a[2] <= b[2] and a[3] <= b[3]


def _lift_holed_shapes(units: List[Unit]) -> None:
    """Paint a shape with holes *before* the shapes that sit inside its holes.

    A hole is painted as a stroke in the colour underneath, so a shape that was
    drawn first and shows through the hole (the eyes behind the nerd glasses)
    would be covered. Those shapes never touch the solid part, so drawing the
    holed shape first looks identical.
    """
    for u in units:
        holes = [h for h in units if h.hole and h.parent is u]
        if not holes:
            continue
        inside = [v.order for v in units if not v.hole and v is not u and v.order < u.order
                  and any(_bbox_inside(v.bbox, h.bbox) and point_in_polygon(v.centroid, h.pts) for h in holes)]
        if inside:
            shift = min(inside) - 0.5 - u.order
            u.order += shift
            for h in holes:
                h.order += shift
    units.sort(key=lambda u: u.order)


def build_model(code: str, name: str, svg_path: Path, size: float, curve_segments: int,
                spec: Optional[FaceSpec] = None, skin: str = "zombie"):
    parsed = parse_svg(svg_path, curve_segments)
    summary = classify(parsed.units, parsed.vb)
    supported = spec is not None or code in FACES
    spec = spec or FACES.get(code)
    rule_warnings: List[str] = []
    if spec is not None:
        rule_warnings = apply_rules(parsed.units, spec.rules)
    labels = {u.label for u in parsed.units}
    if spec is None:
        spec = generic_spec(labels)
    _lift_holed_shapes(parsed.units)
    layer_list, order_warnings = build_layers(parsed.units)
    nodes = build_rig(name, layer_list, spec, parsed.vb, size)
    clips, clip_warnings = build_clips(spec, nodes, size)
    skin_warnings = apply_zombie_skin(code, name, nodes, size) if skin == "zombie" and spec.zombie_head else []

    s = size / max(parsed.vb[2], parsed.vb[3])
    facemap_parts: Dict[str, dict] = {}
    for n in nodes:
        if n["kind"] != "gp" or n["part"].startswith("other_"):
            continue
        if n.get("skin"):
            x0, z0, x1, z1 = n["bbox"]
            facemap_parts[n["part"]] = {
                "object": n["name"], "parent": n["parent"], "strokes": len(n["strokes"]),
                "pivot": [n["world"][0], n["world"][2]], "center": [(x0 + x1) / 2, (z0 + z1) / 2],
                "bbox": [x0, z0, x1, z1], "colors": [n["strokes"][0]["color"]],
                "rule": "zombie-head", "confidence": 1.0,
            }
            continue
        us = n["units"]
        x0, z0, x1, z1 = n["bbox"]
        facemap_parts[n["part"]] = {
            "object": n["name"],
            "parent": n["parent"],
            "strokes": len(us),
            "pivot": [n["world"][0], n["world"][2]],
            "center": [(x0 + x1) / 2, (z0 + z1) / 2],
            "bbox": [x0, z0, x1, z1],
            "svg_bbox": [min(u.bbox[0] for u in us), min(u.bbox[1] for u in us),
                         max(u.bbox[2] for u in us), max(u.bbox[3] for u in us)],
            "colors": sorted({u.color for u in us}),
            "rule": us[0].rule,
            "confidence": us[0].confidence,
        }
    groups = {
        "eyes": [p for p in ("eye_left", "eye_right") if p in facemap_parts],
        "pupils": [p for p in ("pupil_left", "pupil_right") if p in facemap_parts],
        "brows": [p for p in ("brow_left", "brow_right") if p in facemap_parts],
        "mouth": [p for p in ("mouth", "teeth", "tongue", "mouth_detail") if p in facemap_parts],
        "tears": [p for p in ("tear_left", "tear_right", "tear_pool") if p in facemap_parts],
        "head": [p for p in ZOMBIE_PARTS if p in facemap_parts],
    }
    facemap = {
        "code": code,
        "name": name,
        "title": spec.title,
        "supported": supported,
        "is_face": bool(summary["is_face"]) or supported,
        "complete": ({"eye_left", "eye_right"} <= labels or "glasses" in labels)
                    and (bool(labels & {"mouth", "mask", "nose"}) or spec.mouthless),   # a mask/skull has no visible mouth
        "note": "left/right are screen-side (as seen by the viewer), not the character's own left/right",
        "root": name,
        "parts": facemap_parts,
        "groups": {k: v for k, v in groups.items() if v},
        "animations": [{"name": c["name"], "start": c["start"], "end": c["end"]} for c in clips],
        "skin": "zombie" if any(n.get("skin") for n in nodes) else "none",
        "warnings": parsed.warnings + rule_warnings + order_warnings + clip_warnings + skin_warnings,
    }
    for n in nodes:
        n.pop("units", None)  # not JSON-serialisable and not needed Blender-side
    model = {"name": name, "code": code, "size": size, "fps": FPS, "nodes": nodes, "clips": clips,
             "facemap": facemap}
    return model, parsed


# ---------------------------------------------------------------------------
# GIF preview (host side, no Blender): evaluates the rig + clips and rasterises
# ---------------------------------------------------------------------------
#
# This replays the same node tree and keyframes that go into the .blend, so it
# is a quick way to look at the animation. It needs Pillow (pip install pillow).
# Keyframes are eased with a smoothstep, close to Blender's default Bezier
# interpolation, but it is a preview, not a Blender render.

def _curves(model: dict):
    """(node, path, index) -> sorted [(frame, value)] across all clips."""
    out: Dict[Tuple[str, str, int], List[Tuple[float, float]]] = {}
    for clip in model["clips"]:
        for t in clip["tracks"]:
            out.setdefault((t["node"], t["path"], t["index"]), []).extend((f, v) for f, v in t["keys"])
    for k in out:
        out[k].sort(key=lambda fv: fv[0])
    return out


def _sample(keys, frame: float) -> float:
    if frame <= keys[0][0]:
        return keys[0][1]
    if frame >= keys[-1][0]:
        return keys[-1][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f0 <= frame <= f1:
            if f1 == f0:
                return v1
            t = (frame - f0) / (f1 - f0)
            t = t * t * (3 - 2 * t)
            return v0 + (v1 - v0) * t
    return keys[-1][1]


def evaluate_pose(model: dict, frame: float, curves=None):
    """World transform of every node at `frame`: name -> (a, b, c, d, tx, ty, tz).

    X' = a*x + b*z + tx, Z' = c*x + d*z + tz, Y (depth) is just translated.
    Rotation is about the Y axis (the camera's view axis), as in Blender.
    """
    curves = curves if curves is not None else _curves(model)
    world: Dict[str, tuple] = {}
    for n in model["nodes"]:
        name = n["name"]
        loc = list(n["location"])
        sx = sy = sz = 1.0
        rot = 0.0
        for (cn, path, idx), keys in curves.items():
            if cn != name:
                continue
            v = _sample(keys, frame)
            if path == "location":
                loc[idx] = v
            elif path == "scale":
                if idx == 0:
                    sx = v
                elif idx == 2:
                    sz = v
            elif path == "rotation_euler" and idx == 1:
                rot = v
        c, s_ = math.cos(rot), math.sin(rot)
        a, b, cc, d = c * sx, s_ * sz, -s_ * sx, c * sz
        if n["parent"] is None:
            world[name] = (a, b, cc, d, loc[0], loc[1], loc[2])
        else:
            pa, pb, pc, pd, ptx, pty, ptz = world[n["parent"]]
            world[name] = (pa * a + pb * cc, pa * b + pb * d, pc * a + pd * cc, pc * b + pd * d,
                           pa * loc[0] + pb * loc[2] + ptx, pty + loc[1], pc * loc[0] + pd * loc[2] + ptz)
    return world


def render_frame(model: dict, world: dict, px: int, bg: Tuple[int, int, int], supersample: int = 2):
    """Rasterise one pose with Pillow, painter's algorithm by depth (larger Y = further away)."""
    from PIL import Image, ImageDraw
    W = px * supersample
    img = Image.new("RGB", (W, W), bg)
    scale = W / (model["size"] * 1.15)            # matches the orthographic camera in the .blend
    gps = [n for n in model["nodes"] if n["kind"] == "gp"]
    for n in sorted(gps, key=lambda n: -world[n["name"]][5]):   # stable: ties keep paint order
        a, b, c, d, tx, _, tz = world[n["name"]]
        for st in n["strokes"]:
            pts = [((a * x + b * z + tx) * scale + W / 2, W / 2 - (c * x + d * z + tz) * scale)
                   for x, _, z in st["points"]]
            x0, y0 = max(0, int(min(p[0] for p in pts)) - 1), max(0, int(min(p[1] for p in pts)) - 1)
            x1, y1 = min(W, int(max(p[0] for p in pts)) + 2), min(W, int(max(p[1] for p in pts)) + 2)
            if x1 <= x0 or y1 <= y0:
                continue
            mask = Image.new("L", (x1 - x0, y1 - y0), 0)
            ImageDraw.Draw(mask).polygon([(x - x0, y - y0) for x, y in pts], fill=round(255 * st["alpha"]))
            img.paste(hex_rgb(st["color"]), (x0, y0), mask)
    return img.resize((px, px), Image.LANCZOS) if supersample > 1 else img


def write_gif(model: dict, path: Path, px: int = 320, fps: int = 8, bg: str = "#ffffff") -> int:
    """Write the whole timeline as a looping GIF. Returns the number of frames."""
    curves = _curves(model)
    last = max([c["end"] for c in model["clips"]] + [1])
    step = max(1, round(model.get("fps", FPS) / fps))     # the timeline runs at 24 fps: sample it
    frames = [render_frame(model, evaluate_pose(model, f, curves), px, hex_rgb(bg))
              .convert("P", palette=1, colors=128)       # 1 == Image.ADAPTIVE
              for f in range(1, last + 1, step)]
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=round(1000 / fps), loop=0,
                   disposal=2)
    return len(frames)


# ---------------------------------------------------------------------------
# Debug SVG: shows what was labelled as what
# ---------------------------------------------------------------------------

_LABEL_COLORS = {
    "face": "#999999", "eye": "#00a0ff", "pupil": "#0040ff", "highlight": "#00d0c0",
    "brow": "#a000ff", "mouth": "#ff0060", "teeth": "#ff8000", "tongue": "#ff4040",
    "tear": "#0080c0", "blush": "#ff60a0",
}


def write_debug_svg(path: Path, parsed: ParsedSvg):
    minx, miny, vw, vh = parsed.vb
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{minx} {miny} {vw} {vh + 4}">',
           f'<rect x="{minx}" y="{miny}" width="{vw}" height="{vh + 4}" fill="#ffffff"/>']
    for u in parsed.units:
        pts = " ".join(f"{x:.3f},{y:.3f}" for x, y in u.pts)
        out.append(f'<polygon points="{pts}" fill="{u.color}" fill-opacity="{u.alpha:.2f}"/>')
    for u in parsed.units:
        if u.label in ("other", "face"):
            continue
        base = u.label.split("_")[0]
        col = _LABEL_COLORS.get(base, "#000000")
        pts = " ".join(f"{x:.3f},{y:.3f}" for x, y in u.pts)
        out.append(f'<polygon points="{pts}" fill="none" stroke="{col}" stroke-width="0.35"/>')
        out.append(f'<text x="{u.centroid[0]:.2f}" y="{u.centroid[1]:.2f}" font-size="1.6" '
                   f'fill="{col}" stroke="#fff" stroke-width="0.08" text-anchor="middle" '
                   f'font-family="monospace">{u.label}</text>')
    out.append("</svg>")
    path.write_text("\n".join(out), encoding="utf-8")


# ---------------------------------------------------------------------------
# Blender side (runs inside `blender --background --python blender.py -- ...`)
# ---------------------------------------------------------------------------

def _srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _build_emoji_in_blender(bpy, model: dict, out_path: str):
    import math as _m

    if tuple(bpy.app.version[:2]) < MIN_BLENDER:
        raise RuntimeError(
            f"Blender {bpy.app.version_string} is too old: Grease Pencil v3 needs >= "
            f"{MIN_BLENDER[0]}.{MIN_BLENDER[1]}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    name = model["name"]
    size = model["size"]
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)

    # 4.3-4.5 expose the new data model as bpy.data.grease_pencils_v3; from 5.0
    # on it is simply bpy.data.grease_pencils.
    gp_collection = getattr(bpy.data, "grease_pencils_v3", None) or bpy.data.grease_pencils

    # Materials are shared by every part: one per distinct colour+alpha.
    materials: Dict[Tuple[str, float], object] = {}

    def get_material(color: str, alpha: float):
        key = (color, round(alpha, 3))
        if key in materials:
            return materials[key]
        suffix = "" if alpha >= 0.999 else f"_a{int(round(alpha * 100))}"
        mat = bpy.data.materials.new(f"emoji_{color[1:]}{suffix}")
        bpy.data.materials.create_gpencil_data(mat)
        r, g, b = (_srgb_to_linear(v / 255) for v in hex_rgb(color))
        style = mat.grease_pencil
        style.fill_color = (r, g, b, alpha)
        style.color = (r, g, b, alpha)
        # Blender 4.3-4.5 switch fills on via these material flags. In 5.x they
        # are deprecated no-ops (fills come from the per-stroke `fill_id`
        # attribute set below), so silence the deprecation warning.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            style.show_fill = True
            style.show_stroke = False
        materials[key] = mat
        return mat

    def build_gp(node: dict):
        gp = gp_collection.new(node["name"])
        slots: Dict[int, int] = {}

        def slot_for(color: str, alpha: float) -> int:
            mat = get_material(color, alpha)
            if id(mat) not in slots:
                gp.materials.append(mat)
                slots[id(mat)] = len(gp.materials) - 1
            return slots[id(mat)]

        drawing = gp.layers.new("fill").frames.new(1).drawing
        strokes = node["strokes"]
        drawing.add_strokes([len(s["points"]) for s in strokes])
        for gp_stroke, sd in zip(drawing.strokes, strokes):
            gp_stroke.cyclic = True
            gp_stroke.material_index = slot_for(sd["color"], sd["alpha"])
            for pt, co in zip(gp_stroke.points, sd["points"]):
                pt.position = co
                pt.radius = 0.002
                pt.opacity = 1.0

        # Blender 5.x only fills a stroke that has a non-zero `fill_id`
        # (0 means "plain line"), and hides the outline via `hide_stroke`.
        # Every shape here is a pure fill, so give each stroke its own id.
        n = len(strokes)
        for attr_name, attr_type, values in (
            ("fill_id", "INT", list(range(1, n + 1))),
            ("hide_stroke", "BOOLEAN", [True] * n),
        ):
            try:
                attr = drawing.attributes.get(attr_name) or drawing.attributes.new(attr_name, attr_type, "CURVE")
                attr.data.foreach_set("value", values)
            except Exception as exc:  # older 4.x builds: the material flags above do the job
                print(f"[blender.py] note: could not set {attr_name}: {exc}", flush=True)
        return gp

    # One object per part, parented parents-first; `location` is relative to the parent.
    objs: Dict[str, object] = {}
    for node in model["nodes"]:
        if node["kind"] == "gp":
            ob = bpy.data.objects.new(node["name"], build_gp(node))
        else:
            ob = bpy.data.objects.new(node["name"], None)
            ob.empty_display_type = "PLAIN_AXES"
            ob.empty_display_size = size * 0.04
        ob.location = node["location"]
        ob["part"] = node["part"]
        collection.objects.link(ob)
        if node["parent"]:
            ob.parent = objs[node["parent"]]
        objs[node["name"]] = ob
    root = objs[name]

    # Animation: every clip is keyframed on one timeline, with a marker at its start.
    scene.render.fps = model.get("fps", 24)
    for clip in model["clips"]:
        for track in clip["tracks"]:
            ob = objs[track["node"]]
            for frame, value in track["keys"]:
                getattr(ob, track["path"])[track["index"]] = value
                ob.keyframe_insert(data_path=track["path"], index=track["index"], frame=frame)
        scene.timeline_markers.new(clip["name"], frame=clip["start"])
    scene.frame_start = 1
    scene.frame_end = max([c["end"] for c in model["clips"]] + [1])
    scene.frame_set(1)

    # Keep the face map with the data so animation scripts can find the parts.
    root["emoji_code"] = model["code"]
    root["face_map"] = json.dumps(model["facemap"])

    # Front-view orthographic camera + colours that match the SVG hex values.
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = size * 1.15
    cam = bpy.data.objects.new("Camera", cam_data)
    cam.location = (0.0, -10.0, 0.0)
    cam.rotation_euler = (_m.radians(90), 0.0, 0.0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"

    bpy.context.view_layer.objects.active = root
    root.select_set(True)

    bpy.ops.wm.save_as_mainfile(filepath=out_path, compress=True)


def blender_main(argv: List[str]):
    parser = argparse.ArgumentParser(prog="blender.py (blender side)")
    parser.add_argument("--blender-side", action="store_true")
    parser.add_argument("--job", required=True)
    parser.add_argument("--result", required=True)
    args = parser.parse_args(argv)

    import bpy  # only available inside Blender

    job = json.loads(Path(args.job).read_text(encoding="utf-8"))
    out_dir = Path(job["output"])
    results = []
    models = job["emojis"]
    for i, model in enumerate(models, 1):
        out_path = str(out_dir / f"{model['name']}.blend")
        try:
            _build_emoji_in_blender(bpy, model, out_path)
            results.append({"name": model["name"], "ok": True, "blend": out_path})
            print(f"[blender.py] {i}/{len(models)} {model['name']} ok", flush=True)
        except Exception as exc:  # keep going so one bad emoji doesn't sink the batch
            import traceback
            traceback.print_exc()
            results.append({"name": model["name"], "ok": False, "error": f"{type(exc).__name__}: {exc}"})
            print(f"[blender.py] {i}/{len(models)} {model['name']} FAILED", flush=True)
    Path(args.result).write_text(json.dumps(results), encoding="utf-8")


# ---------------------------------------------------------------------------
# Host side
# ---------------------------------------------------------------------------

def find_blender(explicit: Optional[str]) -> Optional[str]:
    candidates: List[str] = []
    if explicit:
        candidates.append(explicit)
    if os.environ.get("BLENDER"):
        candidates.append(os.environ["BLENDER"])
    which = shutil.which("blender")
    if which:
        candidates.append(which)
    candidates += ["/snap/bin/blender", "/usr/bin/blender", "/usr/local/bin/blender"]
    home = str(Path.home())
    for pattern in ("/opt/blender*/blender", f"{home}/blender*/blender",
                    f"{home}/Downloads/blender*/blender", f"{home}/Applications/blender*/blender"):
        candidates += sorted(glob.glob(pattern), reverse=True)
    for c in candidates:
        resolved = shutil.which(c) or (c if os.path.isfile(c) and os.access(c, os.X_OK) else None)
        if resolved:
            return resolved
    return None


def blender_version(exe: str) -> Optional[Tuple[int, int, int]]:
    try:
        out = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=120).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    m = re.search(r"Blender\s+(\d+)\.(\d+)(?:\.(\d+))?", out)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)


INSTALL_HINT = """\
Could not find Blender >= 4.3.

On Ubuntu you can install a current version with:
    sudo snap install blender --classic
or download the Linux tarball from https://www.blender.org/download/ and either
put `blender` on your PATH, set $BLENDER, or pass --blender /path/to/blender.

(The `blender` package in Ubuntu's apt repositories is usually too old: it
predates the new Grease Pencil data model this script needs.)"""


def load_emoji_tables():
    by_short: Dict[str, str] = {}
    short_of: Dict[str, str] = {}
    data = json.loads(EMOJI_JSON.read_text(encoding="utf-8"))
    for e in data["emojis"]:
        if not e.get("unicode"):
            continue
        code = "-".join(cp.lower() for cp in e["unicode"].split(" "))
        bare = (e.get("shortname") or "").replace(":", "").lower()
        if bare:
            by_short.setdefault(bare, code)
            short_of.setdefault(code, bare)
            short_of.setdefault(code.replace("-fe0f", ""), bare)
    return by_short, short_of


def resolve_codes(spec: str, by_short: Dict[str, str], experimental: bool = False) -> List[str]:
    """'faces' = every supported face; 'all' = every SVG with --experimental,
    otherwise the same as 'faces'."""
    keyword = spec.strip().lower()
    if keyword == "faces" or (keyword == "all" and not experimental):
        return list(FACES)
    if keyword == "all":
        return [p.stem for p in sorted(SVG_DIR.glob("*.svg"))]
    codes: List[str] = []
    for tok in (t.strip() for t in spec.split(",")):
        if not tok:
            continue
        if re.fullmatch(r"[0-9a-f]+(-[0-9a-f]+)*", tok, re.I):
            code = tok.lower()
        else:
            code = by_short.get(tok.replace(":", "").lower())
            if code is None:
                raise SystemExit(f'Unknown emoji shortname: "{tok}"')
        if not (SVG_DIR / f"{code}.svg").exists():
            stripped = code.replace("-fe0f", "")
            if (SVG_DIR / f"{stripped}.svg").exists():
                code = stripped
            else:
                raise SystemExit(f'No SVG for "{tok}" (looked for data/svg/{code}.svg)')
        if code not in codes:
            codes.append(code)
    return codes


def run_blender(exe: str, job_path: Path, result_path: Path, verbose: bool) -> int:
    cmd = [exe, "--background", "--factory-startup", "-noaudio",
           "--python-exit-code", "1",
           "--python", str(Path(__file__).resolve()),
           "--", "--blender-side", "--job", str(job_path), "--result", str(result_path)]
    tail: List[str] = []
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.rstrip("\n")
        tail.append(line)
        del tail[:-60]
        if verbose or line.startswith("[blender.py]"):
            print(line, flush=True)
    code = proc.wait()
    if code != 0 and not verbose:
        print("\n--- last Blender output ---", file=sys.stderr)
        print("\n".join(tail), file=sys.stderr)
    return code


def host_main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(
        description="Export Twemoji SVGs to Blender Grease Pencil with face-part tagging.")
    ap.add_argument("--emojis",
                    help="comma-separated shortnames (joy), unicode codes (1f602), a mix, or 'faces' "
                         "for every supported face")
    ap.add_argument("--list-faces", action="store_true", help="list the supported faces and their animations, then exit")
    ap.add_argument("--experimental", action="store_true",
                    help="also export emoji that have no entry in FACES, using auto-detection and generic "
                         "animations (non-faces are skipped; with this flag 'all' means every SVG)")
    ap.add_argument("--output", default="./output/blender", help="output directory (default: ./output/blender)")
    ap.add_argument("--naming", choices=["unicode", "shortname"], default="unicode")
    ap.add_argument("--blender", help="path to the Blender executable (default: $BLENDER, then PATH, then common locations)")
    ap.add_argument("--size", type=float, default=2.0, help="emoji size in Blender units (default: 2.0)")
    ap.add_argument("--skin", choices=SKIN_STYLES, default="zombie",
                    help="head skin: 'zombie' (default) replaces the yellow head with green zombie skin; "
                         "'none' keeps the original colours")
    ap.add_argument("--curve-segments", type=int, default=16,
                    help="line segments per curve (default: 16; the TS CLI uses 8)")
    ap.add_argument("--facemap-only", action="store_true",
                    help="only write the face-map JSON (and debug SVG); do not run Blender")
    ap.add_argument("--gif", action="store_true",
                    help="also write <name>.gif, a preview of every animation clip played in a row "
                         "(needs Pillow, no Blender)")
    ap.add_argument("--gif-size", type=int, default=320, help="GIF width/height in pixels (default: 320)")
    ap.add_argument("--gif-fps", type=int, default=8, help="GIF frame rate (default: 8; the timeline runs at 24 fps and is sampled)")
    ap.add_argument("--gif-background", default="#ffffff", help="GIF background colour (default: #ffffff)")
    ap.add_argument("--debug-svg", action="store_true", help="also write <name>.facemap.svg showing the labelled shapes")
    ap.add_argument("--verbose", action="store_true", help="show all Blender output")
    args = ap.parse_args(argv)

    by_short, short_of = load_emoji_tables()
    if args.list_faces:
        for code, spec in FACES.items():
            print(f"{code:<8} {short_of.get(code, ''):<28} {spec.title:<36} {', '.join(spec.animations)}")
        return 0
    if not args.emojis:
        ap.error("--emojis is required (or use --list-faces)")
    codes = resolve_codes(args.emojis, by_short, args.experimental)
    out_dir = Path(args.output).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    models, failures, unsupported, not_faces = [], [], [], []
    n_face = 0
    for code in codes:
        name = short_of.get(code, code) if args.naming == "shortname" else code
        if code not in FACES and not args.experimental:
            unsupported.append(code)
            continue
        try:
            model, parsed = build_model(code, name, SVG_DIR / f"{code}.svg", args.size, args.curve_segments,
                                         skin=args.skin)
        except Exception as exc:
            failures.append((code, f"{type(exc).__name__}: {exc}"))
            continue
        fm = model["facemap"]
        if not fm["supported"] and not fm["is_face"]:
            not_faces.append(code)
            continue
        n_face += fm["is_face"]
        (out_dir / f"{name}.facemap.json").write_text(json.dumps(fm, indent=2), encoding="utf-8")
        if args.debug_svg:
            write_debug_svg(out_dir / f"{name}.facemap.svg", parsed)
        models.append(model)
        if len(codes) <= 20:
            anims = ", ".join(a["name"] for a in fm["animations"]) or "none"
            print(f"{code:<8} {fm['title']:<34} parts: {', '.join(fm['parts'])}\n{'':<8} animations: {anims}")
            for w in fm["warnings"]:
                print(f"    warning: {w}")

    print(f"Parsed {len(models)}/{len(codes)} emoji.")
    if unsupported:
        shown = ", ".join(unsupported[:12]) + (" ..." if len(unsupported) > 12 else "")
        print(f"Skipped {len(unsupported)} emoji with no entry in FACES yet: {shown}\n"
              f"  (add one in blender.py, or pass --experimental to use auto-detection)", file=sys.stderr)
    if not_faces:
        print(f"Skipped {len(not_faces)} emoji that are not faces.")
    for code, err in failures:
        print(f"  FAILED {code}: {err}", file=sys.stderr)

    if args.gif and models:
        try:
            import PIL  # noqa: F401
        except ImportError:
            print("--gif needs Pillow: pip install pillow", file=sys.stderr)
            return 2
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", args.gif_background):
            ap.error("--gif-background must look like #rrggbb")
        for m in models:
            n = write_gif(m, out_dir / f"{m['name']}.gif", args.gif_size, args.gif_fps, args.gif_background)
            print(f"  {m['name']}.gif  ({n} frames)")
        print(f"Wrote {len(models)} GIF(s) to {out_dir}")

    if args.facemap_only or not models:
        print(f"Wrote face maps to {out_dir}")
        return 1 if failures or (unsupported and not models) else 0

    exe = find_blender(args.blender)
    if exe is None:
        print(INSTALL_HINT, file=sys.stderr)
        print(f"\nFace maps were still written to {out_dir}", file=sys.stderr)
        return 2
    ver = blender_version(exe)
    if ver is None:
        print(f"Could not read the version of {exe}; is it really Blender?", file=sys.stderr)
        return 2
    if ver[:2] < MIN_BLENDER:
        print(f"{exe} is Blender {ver[0]}.{ver[1]}.{ver[2]}, but >= {MIN_BLENDER[0]}.{MIN_BLENDER[1]} is required.\n\n"
              f"{INSTALL_HINT}", file=sys.stderr)
        return 2
    print(f"Using Blender {ver[0]}.{ver[1]}.{ver[2]} ({exe})")

    with tempfile.TemporaryDirectory(prefix="emoji-gp-") as tmp:
        job_path, result_path = Path(tmp) / "job.json", Path(tmp) / "result.json"
        job_path.write_text(json.dumps({"output": str(out_dir), "emojis": models}),
                            encoding="utf-8")
        code = run_blender(exe, job_path, result_path, args.verbose)
        results = json.loads(result_path.read_text()) if result_path.exists() else []

    ok = [r for r in results if r["ok"]]
    bad = [r for r in results if not r["ok"]]
    for r in bad:
        print(f"  FAILED {r['name']}: {r['error']}", file=sys.stderr)
    if code != 0 and not results:
        print("Blender exited with an error before producing any output.", file=sys.stderr)
    else:
        print(f"Wrote {len(ok)} .blend file(s) to {out_dir}")
    return 0 if code == 0 and not bad and not failures else 1


def main() -> int:
    if "--blender-side" in sys.argv:
        argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
        blender_main(argv)
        return 0
    return host_main()


if __name__ == "__main__":
    sys.exit(main())
