"""Make the Dev and Beta app icon ribbons & PNGs so Inverna, Inverna Beta
(TestFlight), and Inverna Dev are unmistakably distinct on the Home Screen.

Outputs both:
- iOS 26 Icon Composer layers (`ribbon-bg.png` + `ribbon-text.png`) inside
  `assets/images/Inverna-Dev.icon/Assets/` and `assets/images/Inverna-Beta.icon/Assets/`
- Matching flat PNG icons (`assets/images/icon-dev.png`, `assets/images/icon-beta.png`)
  for pre-iOS-26, Android, and web.

    node scripts/brand-assets.cjs
    uv run --with pillow python scripts/variant-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SIZE = 1024

VARIANTS = {
    "dev": {
        "bundle": "Inverna-Dev.icon",
        "label": "DEV",
        "bg": (14, 34, 58),        # Deep Cobalt Steel (#0E223A)
        "band": (45, 106, 196),    # Bright Cobalt (#2D6AC4)
        "line": (122, 174, 245, 165),
        "ink": (255, 255, 255),
    },
    "beta": {
        "bundle": "Inverna-Beta.icon",
        "label": "BETA",
        "bg": (40, 27, 15),        # Deep Espresso Amber (#281B0F)
        "band": (214, 169, 79),    # Warm Antique Gold (#D6A94F)
        "line": (255, 236, 190, 185),
        "ink": (22, 16, 9),
    },
}

FONTS = ["/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc"]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for f in FONTS:
        if Path(f).exists():
            try:
                loaded = ImageFont.truetype(f, size, index=1) if f.endswith(".ttc") else ImageFont.truetype(f, size)
                try:
                    loaded.set_variation_by_name("Bold")
                except Exception:
                    pass
                return loaded
            except OSError:
                continue
    return ImageFont.load_default(size)


def draw_tracked_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, center_x: float, center_y: float, fill: tuple[int, int, int, int], tracking: float) -> None:
    widths = [draw.textbbox((0, 0), ch, font=font)[2] - draw.textbbox((0, 0), ch, font=font)[0] for ch in text]
    total_w = sum(widths) + tracking * (len(text) - 1)
    full_box = draw.textbbox((0, 0), text, font=font)
    th = full_box[3] - full_box[1]
    x = center_x - total_w / 2
    y = center_y - th / 2 - full_box[1]
    for ch, cw in zip(text, widths):
        cbox = draw.textbbox((0, 0), ch, font=font)
        draw.text((x - cbox[0], y), ch, font=font, fill=fill)
        x += cw + tracking


def main() -> None:
    # Ribbon sits comfortably above the iOS squircle bottom curve (77%..92%),
    # with the lifted 540px mark cleanly centered above it.
    top = int(SIZE * 0.775)
    bottom = int(SIZE * 0.925)
    band_h = bottom - top

    for name, cfg in VARIANTS.items():
        assets_dir = ROOT / "assets/images" / cfg["bundle"] / "Assets"
        mark_path = assets_dir / "mark.png"
        if not mark_path.exists():
            raise FileNotFoundError(f"Run `node scripts/brand-assets.cjs` first ({mark_path} missing)")

        # 1. Transparent ribbon band layer (full-bleed bar + crisp top hairline)
        ribbon_bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        d_bg = ImageDraw.Draw(ribbon_bg)
        d_bg.rectangle([0, top, SIZE, bottom], fill=(*cfg["band"], 255))
        d_bg.rectangle([0, top, SIZE, top + 3], fill=cfg["line"])
        bg_out = assets_dir / "ribbon-bg.png"
        ribbon_bg.save(bg_out)
        print(bg_out.relative_to(ROOT))

        # 2. Transparent ribbon text layer (separate layer so iOS 26 tinted/clear mode stays legible)
        ribbon_text = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        d_tx = ImageDraw.Draw(ribbon_text)
        font = load_font(int(band_h * 0.60))
        draw_tracked_text(
            d_tx,
            cfg["label"],
            font,
            center_x=SIZE / 2,
            center_y=top + band_h / 2,
            fill=(*cfg["ink"], 255),
            tracking=14,
        )
        tx_out = assets_dir / "ribbon-text.png"
        ribbon_text.save(tx_out)
        print(tx_out.relative_to(ROOT))

        # 3. Matching flat PNG icon for pre-iOS-26, Android & web
        flat = Image.new("RGBA", (SIZE, SIZE), (*cfg["bg"], 255))
        mark = Image.open(mark_path).convert("RGBA")
        flat.alpha_composite(mark)
        flat.alpha_composite(ribbon_bg)
        flat.alpha_composite(ribbon_text)
        flat_out = ROOT / f"assets/images/icon-{name}.png"
        flat.convert("RGB").save(flat_out)
        print(flat_out.relative_to(ROOT))


if __name__ == "__main__":
    main()
