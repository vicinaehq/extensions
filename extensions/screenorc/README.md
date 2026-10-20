# screenORC

A Vicinae extension for Linux that captures a region of your screen to extract text via OCR or decode QR codes, copying the result directly to your clipboard. It also supports customizable language selection for Tesseract.

## Commands

1. **Scan & copy text**: Captures a screen region and performs OCR to extract text.
2. **Scan QR code**: Captures a screen region and decodes any QR code or barcode.
3. **Select Recognition Languages**: Choose your preferred Tesseract OCR language preference.

## How it works

1. Run one of the scan commands from Vicinae. The launcher closes.
2. Spectacle shows its region selector. Drag over the target area (Pressing `Esc` cancels silently).
3. The tool processes the image (via Tesseract or ZBar), copies the decoded result to your clipboard, and confirms via a HUD toast.
4. *Missing Language Pack Helper*: If a Tesseract language pack is missing, it will automatically copy the required system package name (e.g., `tesseract-data-spa`) to your clipboard so you can install it for your given distro.
## Requirements

- `spectacle` (screen capture)
- `tesseract` (OCR engine, plus language data, e.g., `tesseract-data-eng`)
- `zbar` / `zbarimg` (QR code scanner)
- `wl-copy` (Wayland, from `wl-clipboard`) or `xclip` (X11)

## Layout
- src/capture.tsx: Text OCR command entry point 
- src/qr.tsx: QR code scanning command entry point 
- src/select-language.tsx: Language selection view command component
- src/tools.ts: Shared execution wrappers for spectacle, tesseract, zbar, and clipboard handling
- scripts/check-dependencies.js: Environment binary verification

## Development
1. clone repo and run following commands
```shell
npm install
npm run dev
```

