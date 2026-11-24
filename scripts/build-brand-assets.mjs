#!/usr/bin/env node
/**
 * Build StreakBooks brand PNGs from the master logo (dark backdrop → transparent).
 * Output: public/brand/*, public/favicon.png, public/og-image.png
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC =
  process.argv[2] ??
  join(
    process.env.HOME ?? "",
    ".cursor/projects/Users-m5-Projects-LinkBooks/assets/image-83652c6d-f877-4b73-b11b-dbb14b2e5496.png",
  );
const OUT_BRAND = join(ROOT, "public/brand");
const LIGHT_BG = [232, 234, 237]; // matches auth / marketing panels (#E8EAED)

mkdirSync(OUT_BRAND, { recursive: true });

const py = `from PIL import Image
import os

src = ${JSON.stringify(SRC)}
out_brand = ${JSON.stringify(OUT_BRAND)}
light = tuple(${JSON.stringify(LIGHT_BG)})

im = Image.open(src).convert("RGBA")
px = im.load()
w, h = im.size
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if r < 40 and g < 40 and b < 40:
            px[x, y] = (r, g, b, 0)

# Full wordmark (transparent) — use on sidebar / auth
im.save(os.path.join(out_brand, "streakbooks-logo.png"), optimize=True)

# Icon mark (~left 22% of master)
mark_w = int(w * 0.205)
mark = im.crop((0, 0, mark_w, h))
mark.save(os.path.join(out_brand, "streakbooks-mark.png"), optimize=True)

def on_light(canvas_size, logo, pad_ratio=0.12):
    cw, ch = canvas_size
    lw, lh = logo.size
    scale = min((cw * (1 - 2 * pad_ratio)) / lw, (ch * (1 - 2 * pad_ratio)) / lh)
    nw, nh = int(lw * scale), int(lh * scale)
    logo_r = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    base = Image.new("RGBA", canvas_size, light + (255,))
    ox, oy = (cw - nw) // 2, (ch - nh) // 2
    base.alpha_composite(logo_r, (ox, oy))
    return base.convert("RGB")

# Social / Open Graph card
og = on_light((1200, 630), im, 0.18)
og.save(os.path.join(${JSON.stringify(ROOT)}, "public/og-image.png"), optimize=True)

# Favicon + touch icon from mark
for size, name in [(32, "favicon.png"), (180, "apple-touch-icon.png")]:
    icon = mark.resize((size, max(1, int(h * size / mark_w))), Image.Resampling.LANCZOS)
    if name == "apple-touch-icon.png":
        bg = Image.new("RGBA", (size, size), light + (255,))
        iw, ih = icon.size
        if ih > size:
            icon = icon.resize((int(iw * size / ih), size), Image.Resampling.LANCZOS)
        iw, ih = icon.size
        bg.alpha_composite(icon, ((size - iw) // 2, (size - ih) // 2))
        bg.convert("RGB").save(os.path.join(out_brand, name), optimize=True)
    else:
        icon.thumbnail((size, size), Image.Resampling.LANCZOS)
        icon.save(os.path.join(${JSON.stringify(ROOT)}, "public", name), optimize=True)

print("brand assets ok:", out_brand)
`;

const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(r.status ?? 1);
}
console.log(r.stdout.trim());