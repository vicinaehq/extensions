import { useState, useEffect, useCallback, useRef } from 'react';
import { List, ActionPanel, Action, showToast, Toast, Icon, Color, confirmAlert, Alert, open } from '@vicinae/api';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Aria2Task, DownloadInfo } from './types';
import { Aria2Client, getAria2Client } from './lib/aria2-client';
import { ensureDaemonRunning, getDaemonStatus } from './lib/aria2-daemon';
import { extractVideoUrl, isYtDlpInstalled, YtDlpError } from './lib/yt-dlp-handler';
import { isFfmpegInstalled, mergeMedia } from './lib/ffmpeg-utils';
import { detectUrlType, isValidUrl, taskToDownloadInfo, formatBytes, formatSpeed, formatTimeRemaining, getStatusIcon } from './lib/utils';

const execAsync = promisify(exec);

// Config
const RPC_URL = 'http://localhost:6800/jsonrpc';
const RPC_SECRET: string | null = null;
// Use user's Downloads directory, fallback to home/Downloads, or error if no home
const DOWNLOAD_DIR = process.env.HOME ? path.join(process.env.HOME, 'Downloads') : '/tmp';

/**
 * Main Download Manager Command
 * Entry point for the Vicinae extension
 */
export default function Command() {
    // State
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [downloads, setDownloads] = useState<DownloadInfo[]>([]);
    const [searchText, setSearchText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [ytDlpAvailable, setYtDlpAvailable] = useState<boolean | null>(null);
    const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null);
    const [quality, setQuality] = useState<'best' | '1080p' | '720p' | 'audio'>('best');
    const [lastUpdate, setLastUpdate] = useState<number>(Date.now()); // For forcing re-renders

    // Aria2 client ref
    const clientRef = useRef<Aria2Client | null>(null);

    // Initialize client
    useEffect(() => {
        clientRef.current = getAria2Client(RPC_URL, RPC_SECRET);
    }, []);

    // Check daemon and connect
    const initializeDaemon = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Check yt-dlp availability
            const ytdlp = await isYtDlpInstalled();
            setYtDlpAvailable(ytdlp);

            // Check ffmpeg availability
            const ffmpeg = await isFfmpegInstalled();
            setFfmpegAvailable(ffmpeg);

            // Check daemon status
            const status = await getDaemonStatus(RPC_URL);

            if (!status.installed) {
                setError('aria2c is not installed. Install with: sudo apt install aria2');
                setIsLoading(false);
                return;
            }

            if (!status.running) {
                // Start daemon
                const result = await ensureDaemonRunning({
                    rpcPort: 6800,
                    rpcSecret: RPC_SECRET || undefined,
                    downloadDir: DOWNLOAD_DIR,
                });

                if (!result.success) {
                    setError(result.message);
                    setIsLoading(false);
                    return;
                }
            }

            setIsConnected(true);
            setIsLoading(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to connect to aria2');
            setIsLoading(false);
        }
    }, []);

    // Initialize on mount
    useEffect(() => {
        initializeDaemon();
    }, [initializeDaemon]);

    // Fetch all downloads
    const loadDownloads = useCallback(async () => {
        if (!clientRef.current) return;

        setIsLoading(true);

        try {
            const { active, waiting, stopped } = await clientRef.current.getAllTasks();

            const allTasks: Aria2Task[] = [...active, ...waiting, ...stopped];
            const downloadInfos = allTasks.map(taskToDownloadInfo);

            setDownloads(downloadInfos);
            setLastUpdate(Date.now());
            setError(null);
        } catch (err) {
            console.error('[aria2] Fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);


    // Fetch downloads on connect and poll every 5 seconds for status updates
    useEffect(() => {
        if (!isConnected) return;

        loadDownloads();

        // Poll every 5 seconds to update status (Active → Complete transitions)
        const interval = setInterval(() => {
            loadDownloads();
        }, 5000);

        return () => clearInterval(interval);
    }, [isConnected]);

    // Smart add download handler
    const handleAddDownload = useCallback(async (input: string) => {
        if (!clientRef.current || !input.trim()) return;

        const trimmedInput = input.trim();

        if (!isValidUrl(trimmedInput)) {
            await showToast({ style: Toast.Style.Failure, title: 'Invalid URL or magnet link' });
            return;
        }

        setIsProcessing(true);
        setSearchText('');

        try {
            const urlType = detectUrlType(trimmedInput);
            let downloadUrl = trimmedInput;
            let filename: string | undefined;

            // Handle YouTube/video URLs via yt-dlp
            if ((urlType === 'youtube' || urlType === 'video') && ytDlpAvailable) {
                await showToast({ style: Toast.Style.Animated, title: 'Extracting video URL...' });

                try {
                    // Start extraction with selected quality
                    let result = await extractVideoUrl(trimmedInput, { quality });

                    if (result.isSplit && result.videoUrl && result.audioUrl) {
                        // Split download mode (High Quality) requires FFmpeg
                        if (!ffmpegAvailable) {
                            await showToast({
                                style: Toast.Style.Failure,
                                title: 'FFmpeg missing',
                                message: 'Cannot handle HQ download. Falling back to 720p...'
                            });

                            // Fallback to 720p (Single File)
                            try {
                                result = await extractVideoUrl(trimmedInput, { quality: '720p' });
                                // Proceed to standard single file download logic below
                            } catch (fallbackErr) {
                                throw new Error('FFmpeg missing and 720p fallback failed');
                            }
                        } else {
                            // FFmpeg available: Proceed with Split Download
                            const options: Record<string, string> = { dir: DOWNLOAD_DIR };

                            // Add Video
                            const videoName = `${result.filename}.video.mp4`;
                            await clientRef.current.addUri([result.videoUrl], { ...options, out: videoName });

                            // Add Audio
                            const audioName = `${result.filename}.audio.m4a`;
                            await clientRef.current.addUri([result.audioUrl], { ...options, out: audioName });

                            await showToast({ style: Toast.Style.Success, title: 'High Quality Download Started', message: 'Downloading video and audio content separately' });

                            // Refresh and return
                            await loadDownloads();
                            setTimeout(() => loadDownloads(), 1500);
                            return; // Exit here as we handled adding
                        }
                    }

                    // Standard single file download
                    downloadUrl = result.url;
                    filename = result.filename;
                    await showToast({ style: Toast.Style.Success, title: 'Found video', message: result.title });
                } catch (err) {
                    if (err instanceof YtDlpError) {
                        await showToast({ style: Toast.Style.Failure, title: 'yt-dlp error', message: err.message });
                        setIsProcessing(false);
                        return;
                    }
                    throw err;
                }
            }

            // Add to Aria2
            const options: Record<string, string> = {
                dir: DOWNLOAD_DIR,
            };

            if (filename) {
                options.out = filename;
            }

            const gid = await clientRef.current.addUri([downloadUrl], options);
            await showToast({ style: Toast.Style.Success, title: 'Download started!', message: `GID: ${gid.slice(-6)}` });

            // Refresh list immediately
            await loadDownloads();

            // Refresh again after 1.5s to get metadata (file size, etc.)
            setTimeout(() => loadDownloads(), 1500);
        } catch (err) {
            await showToast({ style: Toast.Style.Failure, title: 'Failed to add download', message: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setIsProcessing(false);
        }
    }, [ytDlpAvailable, ffmpegAvailable, loadDownloads, quality]);

    // Lazy Merge Watcher
    useEffect(() => {
        if (!ffmpegAvailable || !isConnected) return;

        const scanAndMerge = async () => {
            try {
                // Read download dir
                if (!fs.existsSync(DOWNLOAD_DIR)) return;
                const files = await fs.promises.readdir(DOWNLOAD_DIR);

                // Find candidate video files (.video.mp4)
                const videoFiles = files.filter(f => f.endsWith('.video.mp4'));

                for (const videoFile of videoFiles) {
                    const baseName = videoFile.replace('.video.mp4', '');
                    const audioFile = `${baseName}.audio.m4a`;

                    // Check if matching audio exists
                    if (files.includes(audioFile)) {
                        const videoPath = `${DOWNLOAD_DIR}/${videoFile}`;
                        const audioPath = `${DOWNLOAD_DIR}/${audioFile}`;
                        const outputPath = `${DOWNLOAD_DIR}/${baseName}.mp4`;

                        // Check for .aria2 control files (this implies download is still active)
                        const videoAria = `${videoPath}.aria2`;
                        const audioAria = `${audioPath}.aria2`;

                        if (!fs.existsSync(videoAria) && !fs.existsSync(audioAria)) {
                            // Check if output file already exists to avoid re-merging/race conditions
                            if (fs.existsSync(outputPath)) {
                                // Maybe already merged? Or manual file?
                                // Skip to avoid overwriting or infinite merge loops if source files aren't deleted quickly enough
                                continue;
                            }

                            // Both downloads finished!
                            await showToast({ style: Toast.Style.Animated, title: 'Merging streams...', message: baseName });
                            await mergeMedia(videoPath, audioPath, outputPath);
                            await showToast({ style: Toast.Style.Success, title: 'Merge Complete', message: `${baseName}.mp4` });
                            loadDownloads();
                        }
                    }
                }
            } catch (err) {
                console.error('Lazy merge scan error:', err);
            }
        };

        const interval = setInterval(scanAndMerge, 5000);
        return () => clearInterval(interval);
    }, [ffmpegAvailable, isConnected]);

    // Handle search submit (Enter key)
    const handleSearchSubmit = useCallback(() => {
        if (searchText.trim()) {
            handleAddDownload(searchText);
        }
    }, [searchText, handleAddDownload]);

    // Pause download
    const handlePause = useCallback(async (gid: string) => {
        if (!clientRef.current) return;
        try {
            await clientRef.current.pause(gid);
            await showToast({ style: Toast.Style.Success, title: 'Download paused' });
            await loadDownloads();
        } catch (err) {
            await showToast({ style: Toast.Style.Failure, title: 'Failed to pause download' });
        }
    }, [loadDownloads]);

    // Resume download
    const handleResume = useCallback(async (gid: string) => {
        if (!clientRef.current) return;
        try {
            await clientRef.current.unpause(gid);
            await showToast({ style: Toast.Style.Success, title: 'Download resumed' });
            await loadDownloads();
        } catch (err) {
            await showToast({ style: Toast.Style.Failure, title: 'Failed to resume download' });
        }
    }, [loadDownloads]);

    // Remove download - handles both active, completed AND split (audio/video) downloads
    const handleRemove = useCallback(async (gid: string, status: DownloadInfo['status'], filePath: string | null, dir: string, name: string, deleteFile: boolean = false) => {
        if (!clientRef.current) return;

        try {
            // Step 1: Identify Sibling File (Split Download Cleanup)
            // If deleting a .video.mp4, check for a corresponding .audio.m4a
            let siblingGid: string | null = null;
            let siblingPath: string | null = null;

            if (name.endsWith('.video.mp4')) {
                const audioName = name.replace('.video.mp4', '.audio.m4a');
                const siblingTask = downloads.find(d => d.name === audioName);
                if (siblingTask) siblingGid = siblingTask.gid;
                if (dir) siblingPath = `${dir}/${audioName}`;
            }

            // Step 2: Stop/Remove Tasks
            // Force remove active tasks to release file locks
            if (status === 'active' || status === 'waiting' || status === 'paused') {
                try {
                    await clientRef.current.remove(gid, true);
                } catch { /* Ignore if task is already gone */ }
            }

            if (siblingGid) {
                try {
                    await clientRef.current.remove(siblingGid, true);
                } catch { /* Ignore sibling errors */ }
            }

            // Step 3: Wait for File Lock Release & Status Update
            // Critical: Wait for OS to release file handle and Aria2 to update internal state
            await new Promise(resolve => setTimeout(resolve, 500));

            // Step 4: Clean Session Memory
            // Remove the "Stopped/Error" result from Aria2 memory so it doesn't reappear in the UI
            try {
                await clientRef.current.removeDownloadResult(gid);
            } catch { /* Ignore if already cleared */ }

            if (siblingGid) {
                try {
                    await clientRef.current.removeDownloadResult(siblingGid);
                } catch { /* Ignore */ }
            }

            // Step 5: Delete Files from Disk
            if (deleteFile) {
                const deletePath = async (pathToDelete: string) => {
                    if (!pathToDelete) return;
                    try {
                        if (fs.existsSync(pathToDelete)) {
                            const stat = fs.statSync(pathToDelete);
                            if (stat.isDirectory()) {
                                fs.rmSync(pathToDelete, { recursive: true, force: true });
                            } else {
                                fs.unlinkSync(pathToDelete);
                            }
                        }
                        // Clean up control file
                        const ariaControl = `${pathToDelete}.aria2`;
                        if (fs.existsSync(ariaControl)) {
                            fs.unlinkSync(ariaControl);
                        }
                    } catch (err) {
                        console.error('File deletion error:', pathToDelete, err);
                    }
                };

                const mainPath = filePath || (dir && name ? `${dir}/${name}` : null);
                if (mainPath) await deletePath(mainPath);

                if (siblingPath) await deletePath(siblingPath);

                await showToast({ style: Toast.Style.Success, title: 'Download and files removed' });
            } else {
                await showToast({ style: Toast.Style.Success, title: 'Download removed' });
            }

            // Step 6: Refresh List
            await loadDownloads();

        } catch (err) {
            console.error('[aria2] handleRemove fatal:', err);
            await showToast({ style: Toast.Style.Failure, title: 'Error removing download', message: String(err) });
        }
    }, [downloads, loadDownloads]);

    // Remove with confirmation for deleting file
    const handleRemoveWithConfirm = useCallback(async (download: DownloadInfo) => {
        const { gid, status, filePath, dir, name } = download;

        // Construct actual path to check if file exists
        const actualPath = filePath || (dir && name ? `${dir}/${name}` : null);

        // If file exists, ask if user wants to delete it too
        if (actualPath && fs.existsSync(actualPath)) {
            const confirmed = await confirmAlert({
                title: 'Remove Download',
                message: `Do you also want to delete the file "${name}" from disk?`,
                primaryAction: {
                    title: 'Delete File',
                    style: Alert.ActionStyle.Destructive,
                },
                dismissAction: {
                    title: 'Keep File',
                },
            });
            await handleRemove(gid, status, filePath, dir, name, confirmed);
        } else {
            await handleRemove(gid, status, filePath, dir, name, false);
        }
    }, [handleRemove]);

    // Open file location
    // Open file location - Safe spawn
    const handleOpenLocation = useCallback(async (dir?: string) => {
        if (!dir) return; // Guard against undefined
        try {
            // Use spawn to avoid shell injection
            // Helper function to handle spawn promise
            await new Promise<void>((resolve, reject) => {
                const process = spawn('xdg-open', [dir], { stdio: 'ignore' });
                process.on('error', reject);
                process.on('exit', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`xdg-open exited with code ${code}`));
                });
                process.unref(); // Don't block parent
            });
        } catch (err) {
            console.error('Failed to open location:', err);
            await showToast({ style: Toast.Style.Failure, title: 'Failed to open folder' });
        }
    }, []);

    // Group downloads by status (filtering out hidden audio helper files)
    const shouldShow = (d: DownloadInfo) => !d.name.endsWith('.audio.m4a');

    const activeDownloads = downloads.filter(d => d.status === 'active' && shouldShow(d));
    const waitingDownloads = downloads.filter(d => (d.status === 'waiting' || d.status === 'paused') && shouldShow(d));
    const completedDownloads = downloads.filter(d => d.status === 'complete' && shouldShow(d));
    const errorDownloads = downloads.filter(d => (d.status === 'error' || d.status === 'removed') && shouldShow(d));

    // Build subtitle - minimal, only show errors if present
    const getSubtitle = (download: DownloadInfo): string => {
        const { status, errorMessage } = download;

        if (status === 'error' && errorMessage) {
            return `Error: ${errorMessage}`;
        }

        // No subtitle for normal downloads - keep it clean
        return '';
    };

    // Build accessories - minimal, static only
    const getAccessories = (download: DownloadInfo): List.Item.Accessory[] => {
        const accessories: List.Item.Accessory[] = [];

        // Only show Torrent tag (static metadata)
        if (download.isTorrent) {
            accessories.push({ tag: { value: 'Torrent', color: Color.Purple } });
        }

        return accessories;
    };

    // Check if search text looks like a valid URL
    const hasValidUrlInput = searchText.trim() && isValidUrl(searchText.trim());

    // Render item actions - now includes Add Download as first action when URL is in search bar
    const renderItemActions = (download: DownloadInfo) => {
        const { gid, status, dir, filePath } = download;
        const isActive = status === 'active';
        const isPaused = status === 'paused';
        const isComplete = status === 'complete';

        return (
            <ActionPanel>
                {/* Add Download action - appears first when valid URL in search bar */}
                {hasValidUrlInput && (
                    <ActionPanel.Section>
                        <Action
                            title="Add Download"
                            icon={Icon.Plus}
                            onAction={handleSearchSubmit}
                        />
                    </ActionPanel.Section>
                )}
                <ActionPanel.Section>
                    {isActive && (
                        <Action
                            title="Pause Download"
                            icon={Icon.Pause}
                            onAction={() => handlePause(gid)}
                            shortcut={{ modifiers: ["cmd"], key: "p" }}
                        />
                    )}
                    {isPaused && (
                        <Action
                            title="Resume Download"
                            icon={Icon.Play}
                            onAction={() => handleResume(gid)}
                            shortcut={{ modifiers: ["cmd"], key: "u" }}
                        />
                    )}
                    {isComplete && (
                        <>
                            {filePath && (
                                <Action
                                    title="Open File"
                                    icon={Icon.Document}
                                    onAction={() => open(filePath)}
                                    shortcut={{ modifiers: ["cmd"], key: "o" }}
                                />
                            )}
                            <Action
                                title="Open Location"
                                icon={Icon.Folder}
                                onAction={() => handleOpenLocation(dir)}
                                shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                            />
                        </>
                    )}
                </ActionPanel.Section>
                <ActionPanel.Section>
                    <Action
                        title="Remove Download"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        onAction={() => handleRemoveWithConfirm(download)}
                        shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                    />
                </ActionPanel.Section>
            </ActionPanel>
        );
    };

    // Render download item - text-only status display
    const renderDownloadItem = (download: DownloadInfo) => (
        <List.Item
            key={`${download.gid}-${download.progress.toFixed(0)}-${lastUpdate}`}
            id={download.gid}
            title={download.name}
            subtitle={getSubtitle(download)}
            accessories={getAccessories(download)}
            actions={renderItemActions(download)}
        />
    );

    // Error view
    if (error && !isConnected) {
        return (
            <List>
                <List.EmptyView
                    icon={Icon.XMarkCircle}
                    title="Connection Error"
                    description={error}
                    actions={
                        <ActionPanel>
                            <Action title="Retry" icon={Icon.ArrowClockwise} onAction={initializeDaemon} />
                        </ActionPanel>
                    }
                />
            </List>
        );
    }

    return (
        <List
            isLoading={isLoading || isProcessing}
            filtering={false}
            searchText={searchText}
            onSearchTextChange={setSearchText}
            navigationTitle={`Downloads ${activeDownloads.length > 0 ? `(${activeDownloads.length} active)` : ''}`}
            searchBarPlaceholder="Enter URL, magnet link, or YouTube video link..."
            searchBarAccessory={
                <List.Dropdown
                    tooltip="Select Download Quality"
                    value={quality}
                    onChange={(newValue) => setQuality(newValue as any)}
                >
                    <List.Dropdown.Item title="Best" value="best" icon={Icon.Star} />
                    <List.Dropdown.Item title="1080p" value="1080p" icon={Icon.Monitor} />
                    <List.Dropdown.Item title="720p" value="720p" icon={Icon.Mobile} />
                    <List.Dropdown.Item title="Audio" value="audio" icon={Icon.Music} />
                </List.Dropdown>
            }
            actions={
                <ActionPanel>
                    <Action
                        title="Add Download"
                        icon={Icon.Plus}
                        onAction={handleSearchSubmit}
                    />
                </ActionPanel>
            }
        >
            {downloads.length === 0 ? (
                <List.EmptyView
                    icon={Icon.Download}
                    title="No Downloads"
                    description="Enter a URL, magnet link, or YouTube video in the search bar to start downloading"
                />
            ) : (
                <>
                    {activeDownloads.length > 0 && (
                        <List.Section title="Active" subtitle={`${activeDownloads.length} • Updated: ${new Date(lastUpdate).toLocaleTimeString()}`}>
                            {activeDownloads.map(renderDownloadItem)}
                        </List.Section>
                    )}
                    {waitingDownloads.length > 0 && (
                        <List.Section title="Waiting / Paused" subtitle={`${waitingDownloads.length} downloads`}>
                            {waitingDownloads.map(renderDownloadItem)}
                        </List.Section>
                    )}
                    {completedDownloads.length > 0 && (
                        <List.Section title="Completed" subtitle={`${completedDownloads.length} downloads`}>
                            {completedDownloads.map(renderDownloadItem)}
                        </List.Section>
                    )}
                    {errorDownloads.length > 0 && (
                        <List.Section title="Errors" subtitle={`${errorDownloads.length} downloads`}>
                            {errorDownloads.map(renderDownloadItem)}
                        </List.Section>
                    )}
                </>
            )}
        </List>
    );
}
