# Aria2 Manager

<<<<<<< HEAD
Control your downloads directly from Vicinae using Aria2 and yt-dlp. This extension acts as a powerful GUI wrapper, allowing you to manage downloads without opening a terminal.

## Features (v1.1)

*   **Download Manager:** View Active, Waiting, and Completed tasks with real-time status updates.
*   **Smart Add:** Paste any URL or Magnet link into the search bar.
*   **Video Downloader:** Automatically detects YouTube/Video URLs and uses `yt-dlp` to extract media.
*   **High Quality Support:**
    *   **Best Quality:** Downloads separate video (1080p/4K) and audio streams and merges them automatically (Requires FFmpeg).
    *   **Quality Selection:** Choose between Best, 1080p, 720p, or Audio Only directly from the UI.
    *   **Lazy Merge:** Merging happens in the background so you can continue using the app.
*   **Task Control:** Pause, Resume, and Remove tasks. "Open File" action for completed downloads.
*   **Security:** Sandboxed execution with strict filename sanitization to prevent command injection.

## Requirements

### 1. Aria2 (Required)
The core download engine.

*   **Ubuntu/Debian:** `sudo apt install aria2`
*   **Arch Linux:** `sudo pacman -S aria2`
*   **macOS:** `brew install aria2`

### 2. yt-dlp (Recommended)
Required for downloading videos from YouTube, Vimeo, Twitch, and 1000+ other sites.

*   **Linux:** `sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp`
*   **macOS:** `brew install yt-dlp`

### 3. FFmpeg (Recommended)
Required for **High Quality** (1080p+) downloads. High-quality streams are often split into separate video/audio files; FFmpeg is used to merge them.
Without FFmpeg, downloads will fallback to 720p (single file) to ensure playability.

*   **Ubuntu/Debian:** `sudo apt install ffmpeg`
*   **Arch Linux:** `sudo pacman -S ffmpeg`
*   **macOS:** `brew install ffmpeg`

## Configuration

The extension uses sensible defaults but respects the standard Aria2 environment variables if set globally:

*   **Download Directory:** Defaults to `~/Downloads`.
*   **RPC Port:** Internal daemon runs on port `6800`.
*   **Security:** Internal daemon enforces strict security settings (custom tokens, cross-origin checks) by default.

## Troubleshooting

*   **"Video downloaded as two files (.video.mp4 / .audio.m4a)":** This happens if FFmpeg is missing or the merge process was interrupted. Ensure FFmpeg is installed. The extension periodically scans to attempt re-merging valid pairs.
*   **"Download Failed":** Check if the URL is accessible. For YouTube, ensure `yt-dlp` is up to date (`sudo yt-dlp -U`).
=======
Control your downloads directly from Vicinae using Aria2 and yt-dlp. This extension allows you to manage tasks without opening a terminal.

## Requirements

1. **Aria2** (Required):
   You must have aria2 installed on your system.
   `sudo pacman -S aria2` (or your distribution's equivalent)

2. **yt-dlp** (Optional):
   Required for downloading videos from YouTube and other streaming sites.
   `sudo pacman -S yt-dlp`

## Features

* **Quick Download:** Fast way to add a download. You can pass a URL as an argument, or if left empty, it will automatically read from your clipboard.
* **Smart Input:** Paste URLs into the search bar to immediately start downloads. Supports standard URLs and Magnet links.
* **Task Control:** Pause, Resume, and Remove download tasks.
* **File Management:** Option to delete the actual file from the disk when removing a task.
* **Manual Refresh:** Refresh the download list manually using **Cmd+R** or **Ctrl+R**.

## Known Limitations

* **Minimal UI:** The interface displays task names and status categories. Download speeds and progress percentages are not shown to avoid misleading static indicators.
* **Status Polling:** Task statuses update automatically every 5 seconds. There may be a brief delay before seeing status changes (e.g., Active → Complete).
>>>>>>> e01fe274f037e4d2b7436718258fa898f80dc4b2

## Development

To run this extension locally:

```bash
npm install
npm run dev
```