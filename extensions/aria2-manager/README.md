# Aria2 Manager

Control your downloads directly from Vicinae using Aria2 and yt-dlp. This extension allows you to manage tasks without opening a terminal.

## Requirements

1. **Aria2** (Required):
   You must have aria2 installed on your system.
   `sudo pacman -S aria2` (or your distribution's equivalent)

2. **yt-dlp** (Optional):
   Required for downloading videos from YouTube and other streaming sites.
   `sudo pacman -S yt-dlp`

3. **FFmpeg** (Optional):
   Required for high-quality (1080p/4K) video downloads that use split streams.
   `sudo pacman -S ffmpeg`

## Features

* **Quick Download:** Fast way to add a download. You can pass a URL as an argument, or if left empty, it will automatically read from your clipboard.
* **Smart Input:** Paste URLs into the search bar to immediately start downloads. Supports standard URLs and Magnet links.
* **Task Control:** Pause, Resume, and Remove download tasks.
* **File Management:** Option to delete the actual file from the disk when removing a task.
* **Manual Refresh:** Refresh the download list manually using **Cmd+R** or **Ctrl+R**.

## Known Limitations

* **Minimal UI:** The interface displays task names and status categories. Download speeds and progress percentages are not shown to avoid misleading static indicators.
* **Status Polling:** Task statuses update automatically every 5 seconds. There may be a brief delay before seeing status changes (e.g., Active → Complete).

## Development

To run this extension locally:

```bash
npm install
npm run dev
```