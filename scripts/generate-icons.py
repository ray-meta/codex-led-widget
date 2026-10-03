"""Generate the widget's Windows and tray icons with Pillow."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


SIZE = 512
OUTPUT = Path(__file__).resolve().parents[1] / "src" / "assets"
OUTPUT.mkdir(parents=True, exist_ok=True)


def make_icon():
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    tile_mask = Image.new("L", (SIZE, SIZE))
    ImageDraw.Draw(tile_mask).rounded_rectangle((20, 20, 492, 492), radius=112, fill=255)
    tile = Image.new("RGBA", (SIZE, SIZE))
    pixels = tile.load()
    for y in range(SIZE):
        for x in range(SIZE):
            blend = (x + y) / (2 * SIZE)
            pixels[x, y] = (
                round(31 - 16 * blend),
                round(52 - 28 * blend),
                round(73 - 35 * blend),
                255,
            )
    tile.putalpha(tile_mask)
    image.alpha_composite(tile)

    frame = Image.new("RGBA", (SIZE, SIZE))
    draw = ImageDraw.Draw(frame)
    draw.rounded_rectangle((24, 24, 488, 488), radius=108, outline=(130, 211, 222, 120), width=9)
    draw.ellipse((68, 68, 444, 444), fill=(5, 22, 35, 210))
    draw.ellipse((85, 85, 427, 427), outline=(106, 223, 196, 200), width=15)
    image.alpha_composite(frame)

    glow = Image.new("RGBA", (SIZE, SIZE))
    ImageDraw.Draw(glow).ellipse((132, 132, 380, 380), fill=(31, 255, 133, 200))
    image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(40)))

    bulb = Image.new("RGBA", (SIZE, SIZE))
    draw = ImageDraw.Draw(bulb)
    draw.ellipse((137, 137, 375, 375), fill=(35, 207, 117, 255))
    draw.ellipse((151, 151, 361, 361), fill=(56, 239, 143, 255))
    draw.ellipse((170, 169, 343, 343), fill=(90, 252, 172, 255))
    draw.ellipse((184, 174, 273, 228), fill=(214, 255, 234, 190))
    image.alpha_composite(bulb)
    return image


icon = make_icon()
icon.resize((256, 256), Image.Resampling.LANCZOS).save(OUTPUT / "icon.png")
icon.resize((32, 32), Image.Resampling.LANCZOS).save(OUTPUT / "tray.png")
icon.save(OUTPUT / "icon.ico", format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
