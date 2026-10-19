"""Dhow Telecom backdrops (Pulse palette), quiet version (the Rafeeq lesson: quiet backdrops for client apps).

Light: a clean near-white page (#F7F9FB) with a barely-there wash of QIB light
blue lower-right and three hairline arcs in QIB blue at very low alpha.
Dark: soft navy-charcoal (#0F1A24) with the same arcs in light blue.
Target: greyscale spread under ~20 overall and under ~12 mid-frame. Deterministic.
Run from scripts/:  python3 make-backdrops.py
"""
import numpy as np
from PIL import Image, ImageFilter

W, H = 2560, 1440
PAPER = np.array([253, 251, 247], float)     # paper #FDFBF7
MIST = np.array([238, 240, 245], float)      # soft #EEF0F5
BLUE = np.array([118, 89, 223], float)       # violet #7659DF
NAVY = np.array([16, 41, 87], float)         # ink #102957
SKY = np.array([236, 232, 250], float)       # violet tint
ORANGE = np.array([255, 119, 93], float)     # coral #FF775D
CHAR = np.array([7, 25, 54], float)          # deep #071936
CHAR_HI = np.array([11, 34, 70], float)      # deep-2 #0B2246
BLUE_DK = np.array([219, 80, 158], float)    # pink #DB509E

YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
NX, NY = XX / W, YY / H
AX = XX / H
CX, CY = 1.92, 1.25


def blur(a, r):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8), "L")
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255.0


def hairline(R, width=0.0022):
    d = np.abs(np.sqrt((AX - CX) ** 2 + (NY - CY) ** 2) - R)
    return np.exp(-(d / width) ** 2).astype(np.float32)


def soft(cx, cy, sx, sy):
    return np.exp(-(((NX - cx) / sx) ** 2 + ((NY - cy) / sy) ** 2)).astype(np.float32)


def mix(rgb, col, a):
    a = a[..., None]
    return rgb * (1 - a) + col * a


def save(rgb, path):
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB").save(path, "WEBP", quality=90, method=6)
    g = np.asarray(Image.open(path).convert("L"), float)
    mid = g[H // 3: 2 * H // 3, W // 4: 3 * W // 4]
    print(f"{path}: spread {np.percentile(g,99.5)-np.percentile(g,0.5):.0f}  mid-frame {np.percentile(mid,99.5)-np.percentile(mid,0.5):.0f}  mean {g.mean():.0f}")


# ---- light
light = np.broadcast_to(PAPER, (H, W, 3)).copy()
light = mix(light, MIST, blur(soft(0.92, 0.95, 0.5, 0.5), 60) * 0.9)
light = mix(light, SKY, blur(soft(0.85, 1.0, 0.35, 0.3), 40) * 0.55)
for r, a, col in ((0.95, 0.10, BLUE), (1.12, 0.07, NAVY), (1.30, 0.05, ORANGE)):
    light = mix(light, col, blur(hairline(r), 1.5) * a)
save(light, "../public/brand/light-backdrop.webp")

# ---- dark
dark = np.broadcast_to(CHAR, (H, W, 3)).copy()
dark = mix(dark, CHAR_HI, blur(soft(0.9, 0.95, 0.5, 0.5), 60) * 0.9)
dark = mix(dark, NAVY, blur(soft(0.85, 1.0, 0.35, 0.3), 40) * 0.35)
for r, a, col in ((0.95, 0.16, BLUE_DK), (1.12, 0.10, BLUE), (1.30, 0.07, ORANGE)):
    dark = mix(dark, col, blur(hairline(r), 1.5) * a)
save(dark, "../public/brand/dark-backdrop.webp")
