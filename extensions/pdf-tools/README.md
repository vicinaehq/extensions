# PDF Tools for Vicinae

An all-in-one PDF toolkit extension for **Vicinae**, ported and expanded from Raycast's PDF Tools. Works seamlessly across **Linux**, **macOS**, and **Windows**.

---

## Features & Commands

### `images-to-pdf` - Convert Images to PDF
Merge and convert multiple images of any format (`.png`, `.jpg`, `.jpeg`, `.tiff`, `.webp`, `.bmp`, `.gif`, `.avif`, etc.) into a single PDF document.
- Preserves original image quality and handles EXIF rotation.
- Blends transparent images cleanly over a solid white background.
- Sorts pages naturally according to image file names (e.g. `img1`, `img2`, `img10`).
- Saves the generated PDF directly in the source directory.

### `merge` - Merge PDF Files
Combines two or more PDF files into a single unified document.
- Retains source page order and saves the merged file in the same directory.

### `protect` - Protect PDF
Encrypts a PDF document with military-grade AES-256 password protection in place.

### `unlock` - Unlock PDF
Removes password encryption and decrypts the document in place.

### `split-by-file-size` - Split PDF by File Size
Intelligently splits a large PDF into multiple parts based on a maximum file size threshold (in MB) using an optimized binary search algorithm.

### `split-by-page-count` - Split PDF by Page Count
Divides a PDF document into smaller parts containing a specified number of pages each.

### `watermark` - Add Watermark
Applies a crisp vector text watermark across all pages of a PDF document with custom text, rotation angle (0° or 45°), and opacity.

---

## Universal File Selection

PDF Tools provides a frictionless file selection experience across all operating systems:
1. **Active Finder / Explorer Selection**: Directly picks files currently selected in macOS Finder.
2. **Clipboard Detection**: Automatically detects files copied to the clipboard (GNOME/Wayland clipboard, Windows Explorer clipboard, or copied file paths).
3. **Native File Picker Fallback**: If no files were previously selected or copied, an interactive native file dialog opens automatically (`zenity` / `kdialog` on Linux, AppleScript dialog on macOS, `OpenFileDialog` on Windows).

---

## Prerequisites & Installation

PDF Tools relies on lightweight system tools for cryptographic operations and image processing.

### 1. `qpdf` (Required for merge, protect, unlock, split)
- **Linux (Ubuntu/Debian)**: `sudo apt install qpdf`
- **Linux (Arch/Manjaro)**: `sudo pacman -S qpdf`
- **Linux (Fedora)**: `sudo dnf install qpdf`
- **macOS**: `brew install qpdf`
- **Windows**: `winget install qpdf` (or `choco install qpdf`)

### 2. Python & Pillow (Required for `images-to-pdf`)
- Ensure Python is installed on your system.
- Install Pillow:
  ```bash
  pip install Pillow
  ```

---

## Credits

- Ported, enhanced, and maintained for Vicinae by [manuelcontrera](https://github.com/manuelcontrera).
- Original Raycast extension created by [xilopaint](https://github.com/xilopaint).
