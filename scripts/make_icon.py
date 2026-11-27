#!/usr/bin/env python3
"""Generate the Amolkhata launcher icons into an Android res directory.

Draws the icon programmatically (no image assets needed): a golden
crescent and star above an open golden book on a deep-green background
(#0B3D2E — the same green the app uses for its notification colour).

Usage: python3 scripts/make_icon.py [res_dir]
Default res_dir: android/app/src/main/res

Writes, for every mipmap density folder that exists:
  ic_launcher.png           (legacy icon, green background baked in)
  ic_launcher_round.png     (same art, circular mask)
  ic_launcher_foreground.png(adaptive-icon foreground, transparent,
                             art inside the safe zone)
and sets values/ic_launcher_background.xml to the deep green so the
adaptive icon's background matches.
"""

import os
import sys

from PIL import Image, ImageDraw

GREEN = (11, 61, 46, 255)
GREEN_LIGHT = (18, 84, 63, 255)
GOLD = (233, 185, 73, 255)
GOLD_DARK = (196, 138, 36, 255)
GOLD_PALE = (246, 205, 106, 255)
CREAM = (255, 244, 214, 255)
PAGE_LINE = (206, 172, 105, 255)

SS = 4  # supersampling factor for smooth edges


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


def gold_gradient(size):
    """Vertical gold gradient image (pale at top -> deep gold at bottom)."""
    grad = Image.new("RGBA", (1, size))
    for y in range(size):
        grad.putpixel((0, y), _lerp(GOLD_PALE, GOLD_DARK, y / max(size - 1, 1)))
    return grad.resize((size, size))


def draw_art(size, with_background):
    """Draw the crescent + star + open book centred in a square canvas.

    The art group occupies the middle ~62% so the same drawing works for
    the adaptive-icon foreground (safe zone) and, scaled up by the caller,
    for the legacy icons.
    """
    s = size * SS
    img = Image.new("RGBA", (s, s), GREEN if with_background else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if with_background:
        # very subtle radial glow behind the crescent
        glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        r = 0.34 * s
        gd.ellipse([0.5 * s - r, 0.40 * s - r, 0.5 * s + r, 0.40 * s + r],
                   fill=(255, 215, 120, 26))
        img.alpha_composite(glow)

    gold = gold_gradient(s)

    # --- crescent: gold disc minus an offset disc, via mask ---
    mask = Image.new("L", (s, s), 0)
    md = ImageDraw.Draw(mask)
    cx, cy, r = 0.485 * s, 0.385 * s, 0.150 * s
    md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    cx2, cy2, r2 = 0.545 * s, 0.345 * s, 0.128 * s
    md.ellipse([cx2 - r2, cy2 - r2, cx2 + r2, cy2 + r2], fill=0)
    img.paste(gold, (0, 0), mask)

    d = ImageDraw.Draw(img)

    # --- four-point star beside the crescent ---
    sx, sy, sr = 0.660 * s, 0.255 * s, 0.048 * s
    star = [(sx, sy - sr), (sx + sr * 0.22, sy - sr * 0.22), (sx + sr, sy),
            (sx + sr * 0.22, sy + sr * 0.22), (sx, sy + sr),
            (sx - sr * 0.22, sy + sr * 0.22), (sx - sr, sy),
            (sx - sr * 0.22, sy - sr * 0.22)]
    d.polygon(star, fill=GOLD_PALE)

    # --- open book (the "khata") ---
    bx = 0.5 * s            # centre spine x
    top = 0.585 * s         # top of pages at spine
    bottom = 0.760 * s      # bottom of pages at spine
    half_w = 0.205 * s      # half width of the open book
    lift = 0.018 * s        # outer edges sit a little lower than the spine top
    drop = 0.016 * s

    # cover (slightly larger, dark gold, behind the pages)
    cover = [(bx - half_w - 0.014 * s, top + lift + 0.006 * s),
             (bx, top - 0.020 * s),
             (bx + half_w + 0.014 * s, top + lift + 0.006 * s),
             (bx + half_w + 0.014 * s, bottom + drop + 0.012 * s),
             (bx, bottom + 0.014 * s),
             (bx - half_w - 0.014 * s, bottom + drop + 0.012 * s)]
    d.polygon(cover, fill=GOLD_DARK)

    # pages (cream)
    left_page = [(bx - half_w, top + lift), (bx, top),
                 (bx, bottom), (bx - half_w, bottom + drop)]
    right_page = [(bx + half_w, top + lift), (bx, top),
                  (bx, bottom), (bx + half_w, bottom + drop)]
    d.polygon(left_page, fill=CREAM)
    d.polygon(right_page, fill=CREAM)

    # page text lines (faint)
    lw = max(2, int(0.006 * s))
    for i, t in enumerate((0.30, 0.48, 0.66)):
        y = top + (bottom - top) * t
        inset = half_w * (0.18 + 0.10 * i)
        d.line([(bx - half_w + inset * 0.4, y + lift * (1 - t) + drop * t * 0.3),
                (bx - 0.035 * s, y)], fill=PAGE_LINE, width=lw)
        d.line([(bx + 0.035 * s, y),
                (bx + half_w - inset * 0.4, y + lift * (1 - t) + drop * t * 0.3)],
               fill=PAGE_LINE, width=lw)

    # spine line
    d.line([(bx, top), (bx, bottom)], fill=GOLD_DARK, width=max(2, int(0.007 * s)))

    return img.resize((size, size), Image.LANCZOS)


def make_density_icons(res_dir, density, legacy_px, fg_px):
    folder = os.path.join(res_dir, "mipmap-" + density)
    if not os.path.isdir(folder):
        return
    # legacy: art drawn at safe-zone scale on transparent, pasted over green
    base = Image.new("RGBA", (legacy_px, legacy_px), GREEN)
    art = draw_art(legacy_px, with_background=False)
    base.alpha_composite(art)
    base.save(os.path.join(folder, "ic_launcher.png"))

    round_img = base.copy()
    m = Image.new("L", (legacy_px, legacy_px), 0)
    ImageDraw.Draw(m).ellipse([0, 0, legacy_px, legacy_px], fill=255)
    round_img.putalpha(m)
    round_img.save(os.path.join(folder, "ic_launcher_round.png"))

    fg = draw_art(fg_px, with_background=False)
    fg.save(os.path.join(folder, "ic_launcher_foreground.png"))
    print("icons ->", folder)


def main():
    res_dir = sys.argv[1] if len(sys.argv) > 1 else "android/app/src/main/res"
    densities = [("mdpi", 48, 108), ("hdpi", 72, 162), ("xhdpi", 96, 216),
                 ("xxhdpi", 144, 324), ("xxxhdpi", 432 // 3 * 3 // 3, 432)]
    densities[-1] = ("xxxhdpi", 192, 432)
    for density, legacy_px, fg_px in densities:
        make_density_icons(res_dir, density, legacy_px, fg_px)

    values = os.path.join(res_dir, "values", "ic_launcher_background.xml")
    if os.path.isdir(os.path.dirname(values)):
        with open(values, "w", encoding="utf-8") as f:
            f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                    '    <color name="ic_launcher_background">#0B3D2E</color>\n'
                    '</resources>\n')
        print("background colour ->", values)


if __name__ == "__main__":
    main()
