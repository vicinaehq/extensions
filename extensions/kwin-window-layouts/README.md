# KWin Window Layouts

A Vicinae extension that resizes the focused KDE Plasma window using precise
fractional layouts. The commands are available directly from Vicinae root
search and respect the active monitor's usable area, including panels and
docks.

## Requirements

- Linux
- KDE Plasma 6 with KWin
- A Wayland session
- Vicinae 0.27.3 or newer
- `gdbus` (provided by GLib on common distributions)
- `kdotool` (fallback for identifying the focused window if Vicinae's tracker
  is unavailable, for example after restarting Vicinae)

The extension closes Vicinae to restore focus, then identifies the window using
Vicinae's public API or, if its window tracker is unavailable, `kdotool` querying
KWin directly. It uses KWin's scripting D-Bus interface for resizing because
Vicinae does not currently expose window resizing through its public
TypeScript API on Linux.

## Development

```bash
npm install
npm run dev
```

Vicinae must be running while development mode is active.

## Testing

```bash
npm ci
npm test
npm run build -- --out /tmp/kwin-window-layouts-build
```

`npm test` checks TypeScript, the manifest, command entry points, layout geometry,
focus detection, error reporting, and temporary-script cleanup. The build above
uses a separate output directory and does not replace your installed extension.

For an opt-in integration test in a KDE Plasma Wayland session:

```bash
/usr/bin/python3 tests/integration-kwin.py
```

This requires `gdbus`, `kdotool`, and system Python packages providing `PySide6`,
`dbus-python`, and `PyGObject`. It opens a disposable window, tests all layouts,
then closes it and restores the previously focused window. KWin and D-Bus are
real; the Vicinae host API is substituted. To check the complete launcher flow,
also launch commands from Vicinae with a test application focused beforehand.
Avoid switching applications during the integration run: focus changes can
interrupt its assertions, and the fallback check refuses to resize another window.

## Local installation

```bash
npm install
npm run build
```

The build command installs the compiled extension under
`$XDG_DATA_HOME/vicinae/extensions/kwin-window-layouts`, defaulting to
`~/.local/share/vicinae/extensions/kwin-window-layouts`.

## Commands

Every size supports left, center, and right placement, plus top, middle, and
bottom placement on the vertical axis. All existing command names and layouts
are preserved.

### Full-height columns

| Width | Left | Center | Right |
| --- | --- | --- | --- |
| 1/2 | Left Half | Center Half | Right Half |
| 1/3 | First Third | Center Third | Last Third |
| 2/3 | First Two Thirds | Center Two Thirds | Last Two Thirds |
| 1/4 | First Fourth | Center Fourth | Last Fourth |
| 3/4 | First Three Fourths | Center Three Fourths | Last Three Fourths |

`Left` and `First` are search aliases, as are `Right` and `Last`, including
phrases such as `first half`, `right third`, and `last three quarters`.
`Second Fourth` and `Third Fourth` select the inner quarter-width columns;
they also accept `left second fourth` / `right third fourth` and
`left third fourth` / `right second fourth`, respectively.

### Full-width rows

| Height | Top | Middle (vertical center) | Bottom |
| --- | --- | --- | --- |
| 1/2 | Top Half | Middle Half | Bottom Half |
| 1/3 | Top Third | Middle Third | Bottom Third |
| 2/3 | Top Two Thirds | Middle Two Thirds | Bottom Two Thirds |
| 1/4 | Top First Fourth | Middle Fourth | Bottom First Fourth |
| 3/4 | Top Three Fourths | Middle Three Fourths | Bottom Three Fourths |

Middle rows also accept `vertical center` aliases, such as `vertical center
half`. `Top First Fourth` and `Bottom First Fourth` accept the shorter
`top fourth` / `bottom fourth` and `top quarter` / `bottom quarter` aliases.

Quarter rows can be counted from either edge without duplicating commands:

| Row from top | Command | Equivalent search from bottom |
| --- | --- | --- |
| 1st | Top First Fourth | Bottom Last Fourth |
| 2nd | Top Second Fourth | Bottom Third Fourth |
| 3rd | Top Third Fourth | Bottom Second Fourth |
| 4th | Bottom First Fourth (also Top Last Fourth) | Bottom First Fourth |

### Layouts using both axes

Corner quarters occupy half the width and half the height of the usable area:

| Position | Left | Right |
| --- | --- | --- |
| Top | Top Left Quarter | Top Right Quarter |
| Bottom | Bottom Left Quarter | Bottom Right Quarter |

Search using `quarter` or `fourth`, for example `bottom left quarter` or
`top right fourth`. `Upper` / `Lower` aliases work too.

Both families below support all nine combinations of `Top` / `Middle` /
`Bottom` and `Left` / `Center` / `Right`:

| Family | Width | Height | Example |
| --- | --- | --- | --- |
| Sixth | 1/3 | 1/2 | Bottom Right Sixth |
| Two Thirds | 2/3 | 2/3 | Top Center Two Thirds |

Directional aliases work here too: `top first sixth`, `bottom last two thirds`,
and `center left sixth` find the corresponding commands. `Center Sixth` finds
`Middle Center Sixth`; `centered two thirds` finds `Middle Center Two Thirds`.
The existing `Center Two Thirds` command remains a full-height column.

Every `Fourth` / `Fourths` command also accepts `Quarter` / `Quarters`.

## Notes

Layouts use the target window's monitor and its usable area. Commands leave
fullscreen, maximized, and custom tiled states before applying the new geometry.
Applications with minimum or fixed window sizes, and KWin window rules, may
constrain the resulting size or position. Fractional display scaling can produce
subpixel differences in logical coordinates.

Layout names follow common window-management terminology also used by Raycast,
but this project is independent and is not affiliated with Raycast.
