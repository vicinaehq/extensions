# Screen Recorder Extension

A Vicinae extension for controlling `wf-recorder` with support for audio recording and webcam overlay.

## Features

- Start/stop screen recording
- Select audio device
- Select camera device

## Requirements

- `wf-recorder` - Main recording tool
- `ffplay` and `v4l-utils` - For webcam overlay functionality
- `pipewire` - For audio recording functionality

## Installation

### Arch Linux
```bash
sudo pacman -S wf-recorder ffmpeg v4l-utils pipewire
```

### Development
```bash
npm install
npm run dev
```

### Build
```bash
npm run build
```

## Usage

1. Open Vicinae and search for "Screen Record"
2. Configure recording options (audio, webcam)
3. Start recording
4. Stop recording when done

The extension will automatically save recordings to `~/Videos` (or `$XDG_VIDEOS_DIR` if set).
