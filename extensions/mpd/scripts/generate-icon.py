#!/usr/bin/env python3
"""Generate the extension icon: 512x512 rounded blue square with a white
speaker glyph centered inside.

The speaker is drawn as a filled woofer + tweeter pair plus two sound-wave
arcs on the right. The design uses bold filled shapes (not thin outlines)
so it reads clearly at the small size Vicinae renders launcher icons.

Tweak the constants near the top and re-run:

    python3 scripts/generate-icon.py

Writes to assets/extension_icon.png.
"""

from pathlib import Path
from PIL import Image, ImageDraw

SIZE = 512
CORNER_RADIUS = 112          # ~22% of side - modern app-icon proportion
BACKGROUND = (30, 144, 255)  # Dodger Blue (#1E90FF)
FOREGROUND = (255, 255, 255)

# Speaker layout. The driver pair sits left-of-center, leaving room on the
# right for sound-wave arcs that read clearly even at 40 px.
DRIVER_CX = 200         # shared X for both driver circles
WOOFER_CY = 320
WOOFER_R = 100          # large filled circle (the cone)
WOOFER_INNER_R = 36     # inset blue circle inside the woofer -> visual depth
DUSTCAP_R = 18          # tiny filled dot in the very center of the woofer

TWEETER_CY = 175
TWEETER_R = 50          # smaller filled circle, upper driver
TWEETER_INNER_R = 18

# Sound waves: three concentric arcs to the right of the woofer, suggesting
# emitted sound.
WAVE_CENTER = (DRIVER_CX, WOOFER_CY)
WAVE_RADII = (170, 215, 260)
WAVE_WIDTH = 22
WAVE_ARC_DEG = (-35, 35)  # arc sweep, centered on positive X axis

OUTPUT = Path(__file__).resolve().parent.parent / "assets" / "extension_icon.png"


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded-square background.
    draw.rounded_rectangle(
        [(0, 0), (SIZE - 1, SIZE - 1)],
        radius=CORNER_RADIUS,
        fill=BACKGROUND,
    )

    # --- Woofer (lower driver) -------------------------------------------
    # Filled outer disc.
    draw.ellipse(
        [
            (DRIVER_CX - WOOFER_R, WOOFER_CY - WOOFER_R),
            (DRIVER_CX + WOOFER_R, WOOFER_CY + WOOFER_R),
        ],
        fill=FOREGROUND,
    )
    # Blue inset ring -> creates the "cone surround" look.
    draw.ellipse(
        [
            (DRIVER_CX - WOOFER_INNER_R, WOOFER_CY - WOOFER_INNER_R),
            (DRIVER_CX + WOOFER_INNER_R, WOOFER_CY + WOOFER_INNER_R),
        ],
        fill=BACKGROUND,
    )
    # Dust cap (small white center dot).
    draw.ellipse(
        [
            (DRIVER_CX - DUSTCAP_R, WOOFER_CY - DUSTCAP_R),
            (DRIVER_CX + DUSTCAP_R, WOOFER_CY + DUSTCAP_R),
        ],
        fill=FOREGROUND,
    )

    # --- Tweeter (upper driver) -----------------------------------------
    draw.ellipse(
        [
            (DRIVER_CX - TWEETER_R, TWEETER_CY - TWEETER_R),
            (DRIVER_CX + TWEETER_R, TWEETER_CY + TWEETER_R),
        ],
        fill=FOREGROUND,
    )
    draw.ellipse(
        [
            (DRIVER_CX - TWEETER_INNER_R, TWEETER_CY - TWEETER_INNER_R),
            (DRIVER_CX + TWEETER_INNER_R, TWEETER_CY + TWEETER_INNER_R),
        ],
        fill=BACKGROUND,
    )

    # --- Sound-wave arcs ------------------------------------------------
    wx, wy = WAVE_CENTER
    start, end = WAVE_ARC_DEG
    for r in WAVE_RADII:
        draw.arc(
            [(wx - r, wy - r), (wx + r, wy + r)],
            start=start,
            end=end,
            fill=FOREGROUND,
            width=WAVE_WIDTH,
        )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUTPUT, format="PNG")
    print(f"Wrote {OUTPUT} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    main()
