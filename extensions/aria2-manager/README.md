# Aria2 Manager

Control your downloads directly from Vicinae using Aria2 and yt-dlp. This extension allows you to manage tasks without opening a terminal.

## Requirements

1. **Aria2** (Required):
   You must have aria2 installed on your system.
   `sudo pacman -S aria2` (or your distribution's equivalent)

2. **yt-dlp** (Optional):
   Required for downloading videos from YouTube and other streaming sites.
   `sudo pacman -S yt-dlp`

## Features

* **Quick Download:** Add downloads directly from your system clipboard.
* **Smart Input:** Paste URLs into the search bar to immediately start downloads. Supports standard URLs and Magnet links.
* **Task Control:** Pause, Resume, and Remove download tasks.
* **File Management:** Option to delete the actual file from the disk when removing a task.
* **Manual Refresh:** Refresh the download list manually using **Cmd+R** or **Ctrl+R**.

## Known Limitations

* **No Live Progress:** Due to current UI limitations in Vicinae, the download progress bar does not update in real-time. Please use the **Refresh** action or **Cmd+R** to view the latest status.

## Development

To run this extension locally:

```bash
npm install
npm run dev