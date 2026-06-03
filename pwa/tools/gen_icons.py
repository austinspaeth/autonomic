#!/usr/bin/env python3
"""Generate PWA PNG icons from scratch (no external deps).

Design: full-bleed red background with a white ECG / heart-rate pulse line.
Fitting for an autonomic-nervous-system / HRV journal. Rendered with 3x
supersampling and box-downsampled for smooth, anti-aliased edges.
"""
import struct
import zlib
import os

RED = (224, 49, 39)      # background
RED_DK = (180, 33, 26)   # subtle lower band
WHITE = (255, 255, 255)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "icons"))


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def write_png(path, w, h, pixels):
    """pixels: flat list of (r,g,b) tuples length w*h."""
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter type 0
        row = pixels[y * w:(y + 1) * w]
        for (r, g, b) in row:
            raw += bytes((r, g, b))
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        c += struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
        return c

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # 8-bit, truecolor
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + \
        chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def ecg_points(size):
    """Return polyline points (0..1 space) for an ECG-style pulse."""
    # x, y pairs; y=0.5 is the baseline. Lower y = higher on screen.
    pts = [
        (0.08, 0.52), (0.30, 0.52), (0.35, 0.52), (0.39, 0.44),
        (0.43, 0.60), (0.48, 0.18), (0.53, 0.82), (0.58, 0.47),
        (0.62, 0.52), (0.66, 0.52), (0.92, 0.52),
    ]
    return [(x * size, y * size) for (x, y) in pts]


def dist_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * dx, ay + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def render(size, ss=3):
    S = size * ss
    segs = ecg_points(S)
    stroke = S * 0.032  # half-thickness handled via <= stroke
    pixels = []
    for y in range(S):
        for x in range(S):
            # background: subtle vertical gradient
            t = y / S
            col = lerp(RED, RED_DK, t * 0.35)
            # distance to the ECG polyline
            best = 1e9
            for i in range(len(segs) - 1):
                ax, ay = segs[i]
                bx, by = segs[i + 1]
                d = dist_to_segment(x + 0.5, y + 0.5, ax, ay, bx, by)
                if d < best:
                    best = d
                if best <= stroke - 1:
                    break
            if best <= stroke:
                col = WHITE
            pixels.append(col)
    # box downsample ss x ss
    out = []
    for y in range(size):
        for x in range(size):
            r = g = b = 0
            for dy in range(ss):
                for dx in range(ss):
                    px = pixels[(y * ss + dy) * S + (x * ss + dx)]
                    r += px[0]; g += px[1]; b += px[2]
            n = ss * ss
            out.append((r // n, g // n, b // n))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    for size in (192, 512, 180):
        print("rendering", size)
        px = render(size, ss=3)
        name = "apple-touch-icon.png" if size == 180 else f"icon-{size}.png"
        write_png(os.path.join(OUT, name), size, size, px)
    print("done ->", OUT)


if __name__ == "__main__":
    main()
