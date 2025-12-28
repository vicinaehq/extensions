<p align="center">
  <img src="assets/extension_icon.png" alt="PulseAudio extension icon" width="96" />
</p>

# PulseAudio (Vicinae Extension)

Sound settings & controls for [Vicinae](https://github.com/vicinaehq/vicinae), powered by the `pactl` CLI (works with PulseAudio and PipeWire-Pulse).

## Features

- **List audio devices**: Shows output (sinks) and input (sources) devices with a searchable list.
- **Default device switching**: Set the default output or input device.
- **Mute controls**: Mute/unmute inputs and outputs.
- **Volume controls**:
  - Increase/decrease volume in **5%** steps
  - Set an exact value via a form with presets
  - Supports **0–150%** (values above 100% amplify)
- **Device details**: Shows useful device metadata (index, name, and select PipeWire/PulseAudio properties).
- **Quality-of-life**: Copy the raw device name and refresh the device list.

## Commands

| Command (Vicinae) | Description |
| --- | --- |
| **Sound Settings** (`pulseaudio`) | Manage PulseAudio/PipeWire audio devices |

## Requirements

- Linux
- A running audio server:
  - **PipeWire** with **pipewire-pulse**, or
  - **PulseAudio**
- `pactl` available in `PATH`

### Installing `pactl`

`pactl` is usually provided by a “pulseaudio utils” package:

- Fedora: `sudo dnf install pulseaudio-utils`
- Debian/Ubuntu: `sudo apt install pulseaudio-utils`
- Arch: `sudo pacman -S libpulse`

## Troubleshooting

### “Required CLI tool `pactl` was not found in PATH.”

Install `pactl` (see [Installing `pactl`](#installing-pactl)) and make sure it’s available in your environment’s `PATH`.

### “Cannot connect to the audio server via `pactl`.”

- If you’re on PipeWire, ensure `pipewire-pulse` is running (usually a user service).
- If you’re on PulseAudio, ensure the PulseAudio daemon is running.
- Then return to Vicinae and hit **Refresh**.

### Timeouts / empty device list

- Confirm `pactl info` works in a terminal.
- Make sure you’re not running Vicinae inside an environment that can’t access your user session audio socket.

## Development

From `extensions/pulseaudio`:

```bash
npm install
npm run dev
```

## Build (production)

```bash
npm run build
```

## License

MIT License

Copyright (c) 2025 Rastsislau Lipski

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
