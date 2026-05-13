"""Rebuild source.png so the icon fills the whole frame as a rounded square.

The original source.png turned out to be:
    OPAQUE WHITE corners + black circle + white V/waves inside
(not transparent corners as initially assumed). When shown in the Windows
taskbar this reads as "white background behind a black circle". Modern voice
apps (Wispr Flow, Willow Voice) use solid-filled rounded squares instead.

Approach:
  1. Crop the original to a circular mask (keep only what's inside the black
     circle — that's the V + audio bars + their black background)
  2. Place that circle onto a black rounded-square canvas
  3. Since the circle is mostly black and the rounded square is black, the
     visible result is: white V/waves centered on a clean rounded black square

Run from anywhere:
    python voco-tauri/scripts/rebuild_logo.py
Then:
    pnpm tauri icon src-tauri/icons/source.png
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src-tauri" / "icons" / "source.png"
BACKUP = ROOT / "src-tauri" / "icons" / "source.original.png"
RADIUS_PCT = 22  # iOS "squircle" style — 22% of the side


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing: {SRC}")

    orig = Image.open(SRC).convert("RGBA")
    w, h = orig.size

    # Step 1: find the actual visible circle's bounding box by scanning the
    # horizontal midline for the first/last dark pixels. The original has
    # ~85px of white margin on all sides, so we can't assume the circle is
    # inscribed in the canvas.
    pixels = orig.load()
    cy = h // 2
    left = next((x for x in range(w) if pixels[x, cy][0] < 100), 0)
    right = next((x for x in range(w - 1, -1, -1) if pixels[x, cy][0] < 100), w - 1)
    # Shrink by a couple pixels to avoid catching anti-aliased edges.
    pad = 4
    cx_box = (left + right) // 2
    cy_box = cy
    radius = (right - left) // 2 - pad
    circle_mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(circle_mask).ellipse(
        (cx_box - radius, cy_box - radius, cx_box + radius, cy_box + radius),
        fill=255,
    )

    # Step 2: black rounded-square canvas.
    radius = min(w, h) * RADIUS_PCT // 100
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    rect_mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(rect_mask).rounded_rectangle(
        (0, 0, w, h), radius=radius, fill=255
    )
    out.paste((0, 0, 0, 255), (0, 0), rect_mask)

    # Step 3: paste the original's interior circle on top, using the circle
    # mask. Everything outside the circle is dropped — including the white
    # corners we want to get rid of.
    out.paste(orig, (0, 0), circle_mask)

    if not BACKUP.exists():
        Image.open(SRC).save(BACKUP)
        print(f"backup -> {BACKUP}")

    out.save(SRC)
    print(f"wrote   -> {SRC}  ({w}×{h}, rounded radius={radius}px)")


if __name__ == "__main__":
    main()
