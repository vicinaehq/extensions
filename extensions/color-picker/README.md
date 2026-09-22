# Color Picker for Vicinae

A powerful cross-platform color picker, manager, and converter extension for **Vicinae**, ported and adapted from Raycast's popular Color Picker.

Supported on **Linux** (GNOME, KDE, Wayland, X11), **macOS**, and **Windows**.

---

## Commands

### `pick-color` - Pick Color
Activates a screen loupe/eyedropper across your monitors, allowing you to sample any pixel.
- Copies the sampled color directly to the clipboard in your preferred format.
- Adds the color to your color history.
- Shows a HUD confirmation with the copied color.

### `organize-colors` - Organize Colors
Manage, search, and export your picked color history.
- View in grid mode (with live color swatches) or list mode.
- Pin your favorite colors to the top.
- Rename colors with custom titles.
- Copy colors in 12 different formats (HEX, RGB, RGBA, HSL, HSV, OKLCH, LCH, Display P3, etc.).
- Export colors as CSS variables, CSS classes, or JSON.
- Trigger color sampling directly with a single click.

### `favorite-colors` - Favorite Colors
Quick access to all colors pinned as favorites in Organize Colors.

### `convert-color` - Convert Color
Universal color conversion tool. Pass any color format (or enter one in the search bar) to immediately get conversions in all major formats with one-click copy.

### `color-names` - Color Names
Search and identify colors by their descriptive names using the `color-namer` palette.

### `color-wheel` - Color Wheel
Interactive visual spectrum wheel to pick colors directly from a color disc.

---

## Screen Picker Architecture

- **Linux**: Uses D-Bus portal (`org.gnome.Shell.Screenshot.PickColor` and `org.freedesktop.portal.Screenshot.PickColor`) for seamless desktop integration under Wayland and X11.
- **macOS**: Native `NSColorSampler` API providing pixel-accurate magnification and system integration without requiring special accessibility permissions.
- **Windows**: Lightweight standalone Win32 magnifier with anti-aliasing and scroll-wheel zoom support.

---

## Preferences

- **Color Format**: Default format when copying picked colors (`HEX`, `HEX Lower Case`, `HEX No Prefix`, `RGB`, `RGB %`, `RGBA`, `RGBA %`, `HSLA`, `HSVA`, `OKLCH`, `LCH`, `P3`).
- **Show color name after picking**: Optionally show the matched color name in the notification after sampling.
- **Primary Action**: Configure whether selecting a color copies it to the clipboard or pastes it directly to the frontmost application.

---

## Credits

- Ported and maintained for Vicinae by [manuelcontrera](https://github.com/manuelcontrera).
- Original Raycast extension created by [thomas](https://github.com/thomas).
