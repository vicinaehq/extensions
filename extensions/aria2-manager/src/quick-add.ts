import { Clipboard, showToast, Toast, popToRoot } from '@vicinae/api';
import { getAria2Client } from './lib/aria2-client';
import { ensureDaemonRunning } from './lib/aria2-daemon';
import { extractVideoUrl, isYtDlpInstalled } from './lib/yt-dlp-handler';
import { detectUrlType, isValidUrl } from './lib/utils';

// Config
const RPC_URL = 'http://localhost:6800/jsonrpc';
const RPC_SECRET: string | null = null;
const DOWNLOAD_DIR = process.env.HOME ? `${process.env.HOME}/Downloads` : '/tmp';

/**
 * Quick Add Command (No-View)
 * Reads clipboard, detects URL type, and adds to aria2 queue
 * Does NOT close Vicinae after completion
 */
export default async function Command(): Promise<void> {
    try {
        // Read clipboard using Vicinae API
        const clipboardContent = await Clipboard.readText();

        if (!clipboardContent || !clipboardContent.trim()) {
            await showToast({
                style: Toast.Style.Failure,
                title: 'Clipboard Empty',
                message: 'No URL found in clipboard',
            });
            return;
        }

        const url = clipboardContent.trim();

        // Validate URL
        if (!isValidUrl(url)) {
            await showToast({
                style: Toast.Style.Failure,
                title: 'Invalid URL',
                message: 'Clipboard does not contain a valid URL',
            });
            return;
        }

        // Show loading toast
        const toast = await showToast({
            style: Toast.Style.Animated,
            title: 'Adding download...',
        });

        // Ensure daemon is running
        const daemonResult = await ensureDaemonRunning({
            downloadDir: DOWNLOAD_DIR,
        });

        if (!daemonResult.success) {
            toast.style = Toast.Style.Failure;
            toast.title = 'Failed to start aria2';
            toast.message = daemonResult.message;
            return;
        }

        const client = getAria2Client(RPC_URL, RPC_SECRET);
        const urlType = detectUrlType(url);

        let downloadUrl = url;
        let filename: string | undefined;
        let title = 'Download';

        // Handle YouTube/video URLs
        if (urlType === 'youtube' || urlType === 'video') {
            const ytdlpInstalled = await isYtDlpInstalled();

            if (ytdlpInstalled) {
                toast.title = 'Extracting video URL...';
                try {
                    const result = await extractVideoUrl(url);
                    downloadUrl = result.url;
                    filename = result.filename;
                    title = result.title;
                } catch (err) {
                    // Fall back to direct URL
                    console.error('yt-dlp extraction failed:', err);
                }
            }
        } else if (urlType === 'magnet' || urlType === 'torrent') {
            title = 'Torrent';
        }

        // Add to aria2
        const options: Record<string, string> = {
            dir: DOWNLOAD_DIR,
        };

        if (filename) {
            options.out = filename;
        }

        await client.addUri([downloadUrl], options);

        // Truncate title for display
        const displayTitle = title.length > 40 ? title.slice(0, 37) + '...' : title;

        toast.style = Toast.Style.Success;
        toast.title = 'Download Started!';
        toast.message = displayTitle;

        // Don't close Vicinae - just hide the toast after a delay
        // The user can continue using Vicinae or close it manually

    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await showToast({
            style: Toast.Style.Failure,
            title: 'Quick Add Failed',
            message: message,
        });
    }
}
