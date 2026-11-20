# Image Pin for Vicinae

> **GNOME only for now** (tested on Ubuntu 24.04 / GNOME 46). Requires the
> separately installed Image Pin helper.

Keep screenshot regions, clipboard images and image files above your Linux apps.
Drag to move, scroll to zoom at the cursor, Shift+scroll for fine zoom and
Alt+scroll to adjust opacity. You can zoom while holding and dragging an image.

This extension launches the **separately installed Linux helper**. Install it from
the [Image Pin repository](https://github.com/jinkim0823/image-pin):

```bash
git clone https://github.com/jinkim0823/image-pin.git
cd image-pin
./install.sh --helper-only
```

The default executable
is `~/.local/bin/image-pin`; change **Helper executable** in extension preferences
if needed. Missing-helper errors include setup instructions.

The helper requires Ubuntu GNOME, GNOME Screenshot, XWayland and X11 SHAPE 1.1.
The tested platform is Ubuntu 24.04 / GNOME 46 / Vicinae 0.27.3. No Raycast,
macOS, Windows, KDE or native Wayland-only support is claimed.

Commands: Capture & Pin, Pin Clipboard Image, Pin Image File, Close All Pins,
and Bring Pins into View. A persistent local helper owns the pins after Vicinae
closes. Images stay local; the wrapper makes no network requests.

The wrapper is MIT-licensed. The separate Python helper is GPL-3.0-only.
