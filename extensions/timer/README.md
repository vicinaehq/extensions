# Vicinae Timer

Create and manage system-native timers directly from Vicinae.

## Requirements

This extension requires the following standard Linux utilities. If timers fail to start, ensure these are available on your system:

- `systemd` (Specifically `systemd-run` for user-level transient timers)
- `libnotify` (Provides the `notify-send` command for desktop alerts)

These are pre-installed on most modern Linux distributions (Ubuntu, Fedora, Arch Linux).

## Features

- Timers run natively in the background using `systemd-run`, ensuring accurate tracking even if the system suspends.
- Specify durations naturally (e.g., `5m`, `1h 30m Check oven`), supporting small notes visible in notification.
- Save frequently used timers in the extension preferences.

## Usage

Type a duration and an optional note into the search bar:

- `5` -> 5 minutes
- `45s` -> 45 seconds
- `1:30` -> 1 minute, 30 seconds
- `2h Deep work` -> 2 hours with the note "Deep work"
- `15m Check laundry` -> 15 minutes with the note "Check laundry"

Active timers are displayed in the main list, showing the remaining countdown and the absolute completion time. You can
cancel individual timers or use the `Ctrl + Shift + Backspace` shortcut to cancel all.

## Configuration

Configure the extension via Vicinae Preferences:

- **Timer Presets:** A comma-separated list of your favorite timers.  
  _Example:_ `5m Tea, 25m Pomodoro, 1h Focus`
