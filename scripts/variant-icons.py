"""Make the Dev and Beta app icons from assets/images/icon.png.

Each variant gets a band across the bottom with its name, so the three
Inverna apps (Inverna Dev, Inverna Beta, Inverna) can be told apart on the
home screen (Android and the web; iOS uses the .icon bundles).

    uv run --with pillow python scripts/variant-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/images/icon.png"
VARIANTS = {
    # label, band colour, text colour
    "dev": ("DEV", (59, 91, 140), (236, 240, 246)),
    "beta": ("BETA", (194, 161, 95), (18, 16, 11)),
}
FONTS = ["/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc"]


def font(size: int) -> ImageFont.FreeTypeFont:
    for f in FONTS:
        if Path(f).exists():
            try:
                return ImageFont.truetype(f, size, index=1) if f.endswith(".ttc") else ImageFont.truetype(f, size)
            except OSError:
                continue
    return ImageFont.load_default(size)


def main() -> None:
    base = Image.open(SRC).convert("RGB")
    w, h = base.size
    for name, (label, band, ink) in VARIANTS.items():
        img = base.copy()
        d = ImageDraw.Draw(img)
        # Below the round mark (it ends at ~80%), so the band never cuts it.
        top, bottom = int(h * 0.845), int(h * 0.965)
        d.rectangle([0, top, w, bottom], fill=band)
        f = font(int((bottom - top) * 0.62))
        try:
            f.set_variation_by_name("Bold")
        except Exception:
            pass
        box = d.textbbox((0, 0), label, font=f)
        tw, th = box[2] - box[0], box[3] - box[1]
        d.text(((w - tw) / 2 - box[0], top + (bottom - top - th) / 2 - box[1]), label, font=f, fill=ink)
        out = ROOT / f"assets/images/icon-{name}.png"
        img.save(out)
        print(out.relative_to(ROOT))


if __name__ == "__main__":
    main()
