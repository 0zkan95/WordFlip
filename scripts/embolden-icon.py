"""
Makes the WordFlip icon's W/F letters and the flip-axis line/arrow bolder
(thicker strokes) and shifts them higher in the 1024x1024 canvas.

Reads:  assets/icon-concepts/wordflip_icon.png
Writes: assets/icon-concepts/wordflip_icon_preview.png  (review before promoting)

Run with: python scripts/embolden-icon.py
"""

import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

BASE = os.path.join(os.path.dirname(__file__), "..", "assets", "icon-concepts")
SRC = os.path.join(BASE, "wordflip_icon.png")
PREVIEW = os.path.join(BASE, "wordflip_icon_preview.png")

LEFT_BG  = np.array([31, 29, 43],  dtype=np.float32)
RIGHT_BG = np.array([26, 24, 38],  dtype=np.float32)
W_COLOR  = np.array([240, 236, 255], dtype=np.float32)
F_COLOR  = np.array([155, 127, 212], dtype=np.float32)
ARROW_COLOR = (107, 90, 158, 255)

SHIFT_Y = 55     # move letters/line/arrow up by this many px
BOLD_GROW = 5    # dilation radius (px) applied to letter strokes
DILATE = 2 * BOLD_GROW + 1

src = Image.open(SRC).convert("RGBA")
W, H = src.size
orig_alpha = src.split()[3]

# 1. Clean two-tone background (matches original #1a1826 + 2.5% white left tint)
canvas = Image.new("RGB", (W, H), tuple(int(c) for c in RIGHT_BG))
left_half = Image.new("RGB", (512, H), tuple(int(c) for c in LEFT_BG))
canvas.paste(left_half, (0, 0))


def embolden_glyph(box, glyph_color, bg_color, grow):
    crop = src.crop(box).convert("RGB")
    arr = np.asarray(crop, dtype=np.float32)
    denom = glyph_color - bg_color
    ratio = (arr - bg_color) / denom
    coverage = np.clip(ratio.mean(axis=2), 0, 1)
    cov_img = Image.fromarray((coverage * 255).astype(np.uint8), mode="L")
    cov_dilated = cov_img.filter(ImageFilter.MaxFilter(grow))
    cov_arr = np.asarray(cov_dilated, dtype=np.float32)[..., None] / 255.0
    recombined = bg_color * (1 - cov_arr) + glyph_color * cov_arr
    return Image.fromarray(np.clip(recombined, 0, 255).astype(np.uint8), mode="RGB")


# 2. W glyph — embolden, paste shifted up
W_BOX = (43, 423, 469, 738)
w_crop = embolden_glyph(W_BOX, W_COLOR, LEFT_BG, DILATE)
canvas.paste(w_crop, (W_BOX[0], W_BOX[1] - SHIFT_Y))

# 3. F glyph — embolden, paste shifted up
F_BOX = (635, 423, 900, 739)
f_crop = embolden_glyph(F_BOX, F_COLOR, RIGHT_BG, DILATE)
canvas.paste(f_crop, (F_BOX[0], F_BOX[1] - SHIFT_Y))

canvas_rgba = canvas.convert("RGBA")
draw = ImageDraw.Draw(canvas_rgba)

# 4. Dashed flip-axis line — thicker, shifted up
LINE_WIDTH = 9
y1 = 80 - SHIFT_Y
y2 = 944 - SHIFT_Y
dash, gap = 18, 12
LEFT_LINE_COLOR = (84, 71, 123, 255)
RIGHT_LINE_COLOR = (83, 70, 122, 255)
half = LINE_WIDTH / 2
y = float(y1)
while y < y2:
    seg_end = min(y + dash, y2)
    draw.rectangle([512 - half, y, 512, seg_end], fill=LEFT_LINE_COLOR)
    draw.rectangle([512, y, 512 + half, seg_end], fill=RIGHT_LINE_COLOR)
    y += dash + gap


# 5. Flip arrow — thicker bezier curve + larger arrowheads, shifted up
def bezier_points(p0, p1, p2, n=100):
    pts = []
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 2 * p0[0] + 2 * t * (1 - t) * p1[0] + t ** 2 * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * t * (1 - t) * p1[1] + t ** 2 * p2[1]
        pts.append((x, y))
    return pts


ARROW_WIDTH = 11
P0 = (360, 900 - SHIFT_Y)
P1 = (512, 960 - SHIFT_Y)
P2 = (664, 900 - SHIFT_Y)
pts = bezier_points(P0, P1, P2)
draw.line(pts, fill=ARROW_COLOR, width=ARROW_WIDTH, joint="curve")

r = ARROW_WIDTH / 2
for (cx, cy) in (P0, P2):
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ARROW_COLOR)

ARROW_SCALE = 1.4
left_offsets = [(-8, -14), (-16, 10), (8, 4)]
right_offsets = [(8, -14), (16, 10), (-8, 4)]
draw.polygon([(P0[0] + ox * ARROW_SCALE, P0[1] + oy * ARROW_SCALE) for ox, oy in left_offsets], fill=ARROW_COLOR)
draw.polygon([(P2[0] + ox * ARROW_SCALE, P2[1] + oy * ARROW_SCALE) for ox, oy in right_offsets], fill=ARROW_COLOR)

# 6. Re-apply the original rounded-rect alpha mask
canvas_rgba.putalpha(orig_alpha)
canvas_rgba.save(PREVIEW)
print("Saved", PREVIEW)
