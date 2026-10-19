# Trace a gold-on-navy logo PNG into a single SVG path (the mark's silhouette, holes included).
# usage: python trace.py <in.png> <out.svg>
import sys
import numpy as np
from PIL import Image, ImageFilter
import potrace

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
# upscale and soften before thresholding, so curves trace smooth instead of stair-stepped
im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2))
a = np.asarray(im).astype(float)
# gold is bright and warm; the navy ground is dark: brightness alone separates them cleanly
lum = a[..., 0] * .3 + a[..., 1] * .59 + a[..., 2] * .11
mask = lum > 70
bmp = potrace.Bitmap(~mask)  # potracer traces the False pixels as ink
path = bmp.trace(turdsize=40, alphamax=1.1, opticurve=True, opttolerance=0.2)

def f(n): return f"{n:.1f}"
d = []
for curve in path:
    s = curve.start_point
    d.append(f"M{f(s.x)} {f(s.y)}")
    for seg in curve.segments:
        if seg.is_corner:
            d.append(f"L{f(seg.c.x)} {f(seg.c.y)}L{f(seg.end_point.x)} {f(seg.end_point.y)}")
        else:
            d.append(f"C{f(seg.c1.x)} {f(seg.c1.y)} {f(seg.c2.x)} {f(seg.c2.y)} {f(seg.end_point.x)} {f(seg.end_point.y)}")
    d.append("Z")
H, W = mask.shape
ys, xs = np.nonzero(mask)
pad = 40
box = (xs.min() - pad, ys.min() - pad, xs.max() - xs.min() + 2 * pad, ys.max() - ys.min() + 2 * pad)
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box[0]} {box[1]} {box[2]} {box[3]}">'
       f'<path fill-rule="evenodd" d="{"".join(d)}"/></svg>\n')
open(out, "w").write(svg)
print("curves", len(path), "bbox", box, "bytes", len(svg))
