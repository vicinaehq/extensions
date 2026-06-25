# GNOME Keybindings for Vicinae

A Vicinae extension for browsing GNOME keyboard shortcuts from a searchable command palette.

This extension reads keybindings directly from GNOME settings using `gsettings`, so it does not require maintaining a separate shortcuts file manually.

## Features

* Search GNOME keyboard shortcuts from Vicinae
* Read shortcuts dynamically from `gsettings`
* Show custom GNOME keyboard shortcuts
* Filter by action, shortcut, command, section, or internal key
* Copy shortcut, action, command, or the full generated cheatsheet
* Works well on Fedora GNOME and other GNOME-based Linux desktops

## Requirements

* Linux with GNOME
* Vicinae
* Node.js and npm
* `gsettings` available in the system path

## Installation

Clone the repository:

```bash
git clone https://github.com/rodrigoGA/vicinae-gnome-keybindings.git
cd vicinae-gnome-keybindings
```

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

After the build completes, open Vicinae and search for:

```text
GNOME Keybindings
```

## Keyboard Shortcut

You can open this extension directly using a Vicinae deeplink.

First, copy the exact deeplink from Vicinae:

1. Open Vicinae.
2. Search for `GNOME Keybindings`.
3. Open the action menu.
4. Choose `Copy Deeplink`.

Then create a GNOME custom keyboard shortcut using a command like this:

```bash
systemd-run --user --quiet --collect --slice=app.slice vicinae 'vicinae://launch/@rodrigoGA/gnome-keybindings/index?toggle=true'
```

Example:

```bash
systemd-run --user --quiet --collect --slice=app.slice vicinae 'vicinae://launch/@rodrigoGA/gnome-keybindings/index?toggle=true'
```

If GNOME cannot find `vicinae`, use the full path:

```bash
command -v vicinae
```

Then replace `vicinae` with the full path, for example:

```bash
systemd-run --user --quiet --collect --slice=app.slice /usr/bin/vicinae 'vicinae://launch/@rodrigoGA/gnome-keybindings/index?toggle=true'
```

## How It Works

The extension reads keyboard shortcuts from GNOME schemas such as:

* `org.gnome.desktop.wm.keybindings`
* `org.gnome.shell.keybindings`
* `org.gnome.mutter.keybindings`
* `org.gnome.settings-daemon.plugins.media-keys`
* GNOME custom keybindings

The data is parsed and displayed as a searchable Vicinae list.

## Development

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

During development, rebuild after making changes:

```bash
npm run build
```

## Troubleshooting

### The extension does not show any shortcuts

Check that `gsettings` works:

```bash
gsettings list-recursively org.gnome.desktop.wm.keybindings
```

If this command does not return results, the current desktop session may not be GNOME or the GNOME settings schemas may not be available.

### A shortcut does not appear

Some applications manage their own shortcuts internally. This extension reads shortcuts stored in GNOME settings, not application-specific shortcuts.

### The deeplink does not open the extension

Use Vicinae’s `Copy Deeplink` action to get the exact provider and entrypoint for your local installation.

The provider may include your extension author scope, for example:

```text
vicinae://launch/@rodrigoGA/gnome-keybindings/index
```

## License

MIT
