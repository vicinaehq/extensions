# Screen OCR for Vicinae

A Vicinae version of Raycast's Screen OCR extension, built for GNOME on Wayland (Ubuntu 26.04).

| Command | What it does |
|---|---|
| **Recognize Text** | Drag to select an area of the screen, runs OCR on it, and copies the text |
| **Recognize Text from Clipboard** | Press Print Screen, select an area with GNOME's screenshot tool (it copies the image), then run this to OCR the clipboard image |
| **Recognize Text Fullscreen** | Captures the whole screen, runs OCR, and copies the text |
| **Detect Barcode / QR Code** | Select an area and copy the decoded QR code or barcode |

## How it works

GNOME Wayland blocks direct screen capture, so the extension asks for a screenshot through the
**XDG desktop portal** (`org.freedesktop.portal.Screenshot`), using a small Python/GObject helper
(`assets/portal-screenshot.py`). In area mode this opens GNOME's own screenshot UI. If the portal
fails, it falls back to `gnome-screenshot`, whose area selection doesn't work on every GNOME version.
Text recognition is done locally by **Tesseract**. Nothing leaves your machine.

## Install

```bash
# OCR engine (add more languages as needed, e.g. tesseract-ocr-deu / -fra / -ita)
sudo apt install tesseract-ocr tesseract-ocr-eng python3-gi wl-clipboard
# optional: better accuracy (2x upscale) and QR / barcode support
sudo apt install imagemagick zbar-tools

cd vicinae-ocr
npm install
npm run build      # installs into ~/.local/share/vicinae/…, no restart needed
```

For development with hot reload, run `npm run dev` while Vicinae is running.

To bind a hotkey, open Vicinae settings → Extensions → Screen OCR → Recognize Text.

## Preferences

- **Languages**: Tesseract language codes, e.g. `eng+deu`. Each one needs its `tesseract-ocr-<lang>` package.
- **Line Breaks**: keep the image's line breaks, or join wrapped lines into paragraphs.
- **Capture Method**: Auto (portal, with `gnome-screenshot` as fallback), Portal only, or `gnome-screenshot` only.
- **Upscale**: enlarge area captures 2x before OCR. This needs ImageMagick and helps a lot with small UI text.
- **Screenshots**: the portal saves captures in `~/Pictures`. By default they're deleted after OCR.

## Notes

- To test capture outside Vicinae, run `python3 assets/portal-screenshot.py --interactive`. It prints the screenshot's file path on success.
- The first fullscreen capture through the portal shows a GNOME permission prompt; allow it once.
