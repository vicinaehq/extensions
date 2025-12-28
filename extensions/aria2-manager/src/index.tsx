import { useState, useEffect, useCallback, useRef } from 'react';
import { List, ActionPanel, Action, showToast, Toast, Icon, Color, confirmAlert, Alert } from '@vicinae/api';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import type { Aria2Task, DownloadInfo } from './types';
import { Aria2Client, getAria2Client } from './lib/aria2-client';
import { ensureDaemonRunning, getDaemonStatus } from './lib/aria2-daemon';
import { extractVideoUrl, isYtDlpInstalled, YtDlpError } from './lib/yt-dlp-handler';
import { detectUrlType, isValidUrl, taskToDownloadInfo, formatBytes, formatSpeed, formatTimeRemaining, getStatusIcon } from './lib/utils';

const execAsync = promisify(exec);

// Config
const RPC_URL = 'http://localhost:6800/jsonrpc';
const RPC_SECRET: string | null = null;
const DOWNLOAD_DIR = process.env.HOME ? `${process.env.HOME}/Downloads` : '/tmp';

/**
 * Get status icon for download
 */
function getDownloadIcon(status: DownloadInfo['status']): { source: Icon; tintColor?: Color } {
    switch (status) {
        case 'active':
            return { source: Icon.ArrowDown, tintColor: Color.Blue };
        case 'waiting':
            return { source: Icon.Clock, tintColor: Color.Orange };
        case 'paused':
            return { source: Icon.Pause, tintColor: Color.Yellow };
        case 'complete':
            return { source: Icon.Checkmark, tintColor: Color.Green };
        case 'error':
            return { source: Icon.XMarkCircle, tintColor: Color.Red };
        case 'removed':
            return { source: Icon.Trash, tintColor: Color.SecondaryText };
        default:
            return { source: Icon.Document };
    }
}

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
    const loadDownloads = async () => {
        if (!clientRef.current) return;

        setIsLoading(true);

        try {
            const { active, waiting, stopped } = await clientRef.current.getAllTasks();

            const allTasks: Aria2Task[] = [...active, ...waiting, ...stopped];
            const downloadInfos = allTasks.map(taskToDownloadInfo);

            setDownloads(downloadInfos);
            setError(null);
        } catch (err) {
            console.error('[aria2] Fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch downloads on connect (no continuous polling - Vicinae doesn't support live updates)
    // Use Cmd+R to manually refresh
    useEffect(() => {
        if (!isConnected) return;
        loadDownloads();
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
                    const result = await extractVideoUrl(trimmedInput);
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

            // Refresh list
            await loadDownloads();
        } catch (err) {
            await showToast({ style: Toast.Style.Failure, title: 'Failed to add download', message: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setIsProcessing(false);
        }
    }, [ytDlpAvailable, loadDownloads]);

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

    // Remove download - handles both active and completed downloads
    const handleRemove = useCallback(async (gid: string, status: DownloadInfo['status'], filePath: string | null, dir: string, name: string, deleteFile: boolean = false) => {
        if (!clientRef.current) return;

        console.log('[aria2] handleRemove:', { gid, status, filePath, dir, name, deleteFile });

        try {
            // Delete file from disk FIRST if requested (before removing from aria2)
            if (deleteFile) {
                // Construct full path - prefer filePath, fallback to dir + name
                const actualPath = filePath || (dir && name ? `${dir}/${name}` : null);
                console.log('[aria2] actualPath:', actualPath);

                if (actualPath) {
                    try {
                        // Delete main file
                        console.log('[aria2] Checking if file exists...');
                        if (fs.existsSync(actualPath)) {
                            console.log('[aria2] File exists, getting stats...');
                            const stat = fs.statSync(actualPath);
                            if (stat.isDirectory()) {
                                console.log('[aria2] Deleting directory...');
                                await execAsync(`rm -rf "${actualPath}"`);
                            } else {
                                console.log('[aria2] Deleting file...');
                                fs.unlinkSync(actualPath);
                            }
                            console.log('[aria2] File deleted successfully');
                        } else {
                            console.log('[aria2] File does not exist');
                        }
                        // Also delete .aria2 control file if exists
                        const aria2ControlFile = `${actualPath}.aria2`;
                        if (fs.existsSync(aria2ControlFile)) {
                            console.log('[aria2] Deleting .aria2 control file...');
                            fs.unlinkSync(aria2ControlFile);
                        }
                    } catch (err) {
                        console.error('[aria2] Failed to delete file:', err);
                        await showToast({ style: Toast.Style.Failure, title: 'File deletion failed', message: err instanceof Error ? err.message : 'Unknown error' });
                    }
                }
            }

            // For active/waiting/paused downloads, use forceRemove first
            if (status === 'active' || status === 'waiting' || status === 'paused') {
                try {
                    console.log('[aria2] Calling remove(gid, true)...');
                    await clientRef.current.remove(gid, true);
                    console.log('[aria2] remove() succeeded');
                } catch (err) {
                    console.log('[aria2] remove() failed, continuing:', err);
                }
            }

            // Remove from result list
            try {
                console.log('[aria2] Calling removeDownloadResult...');
                await clientRef.current.removeDownloadResult(gid);
                console.log('[aria2] removeDownloadResult succeeded');
            } catch (err) {
                console.log('[aria2] removeDownloadResult failed:', err);
                // This is expected if the download was never completed
            }

            await showToast({ style: Toast.Style.Success, title: deleteFile ? 'Download and file removed' : 'Download removed' });
            await loadDownloads();
        } catch (err) {
            console.error('[aria2] handleRemove error:', err);
            await showToast({ style: Toast.Style.Failure, title: 'Failed to remove download', message: err instanceof Error ? err.message : 'Unknown error' });
        }
    }, [loadDownloads]);

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
    const handleOpenLocation = useCallback(async (dir: string) => {
        try {
            await execAsync(`xdg-open "${dir}"`);
        } catch (err) {
            await showToast({ style: Toast.Style.Failure, title: 'Failed to open folder' });
        }
    }, []);

    // Group downloads by status
    const activeDownloads = downloads.filter(d => d.status === 'active');
    const waitingDownloads = downloads.filter(d => d.status === 'waiting' || d.status === 'paused');
    const completedDownloads = downloads.filter(d => d.status === 'complete');
    const errorDownloads = downloads.filter(d => d.status === 'error' || d.status === 'removed');

    // Build subtitle for a download
    const getSubtitle = (download: DownloadInfo): string => {
        const { status, completedSize, totalSize, downloadSpeed, eta, errorMessage } = download;
        const sizeText = `${formatBytes(completedSize)} / ${formatBytes(totalSize)}`;

        if (status === 'active') {
            let result = `${sizeText} • ${formatSpeed(downloadSpeed)}`;
            if (eta !== null) {
                result += ` • ETA: ${formatTimeRemaining(eta)}`;
            }
            return result;
        } else if (status === 'error' && errorMessage) {
            return errorMessage;
        }
        return sizeText;
    };

    // Build accessories for a download
    const getAccessories = (download: DownloadInfo): List.Item.Accessory[] => {
        const accessories: List.Item.Accessory[] = [];

        if (download.isTorrent) {
            accessories.push({ tag: { value: 'Torrent', color: Color.Purple } });
        }

        if (download.status === 'active' || download.status === 'paused') {
            accessories.push({ text: `${download.progress.toFixed(1)}%` });
        }

        accessories.push({ icon: getDownloadIcon(download.status) });

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
                        <Action
                            title="Open Location"
                            icon={Icon.Folder}
                            onAction={() => handleOpenLocation(dir)}
                            shortcut={{ modifiers: ["cmd"], key: "o" }}
                        />
                    )}
                </ActionPanel.Section>
                <ActionPanel.Section title="Remove">
                    <Action
                        title="Remove (Keep File)"
                        icon={Icon.Trash}
                        onAction={() => handleRemove(download.gid, download.status, download.filePath, download.dir, download.name, false)}
                        shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                    />
                    <Action
                        title="Remove & Delete File"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        onAction={() => handleRemove(download.gid, download.status, download.filePath, download.dir, download.name, true)}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "backspace" }}
                    />
                </ActionPanel.Section>
                <ActionPanel.Section>
                    <Action
                        title="Refresh"
                        icon={Icon.ArrowClockwise}
                        onAction={loadDownloads}
                        shortcut={{ modifiers: ["ctrl"], key: "r" }}
                    />
                </ActionPanel.Section>
            </ActionPanel>
        );
    };

    // Render download item - key includes progress and timestamp to force re-renders
    const renderDownloadItem = (download: DownloadInfo) => (
        <List.Item
            key={`${download.gid}-${download.progress.toFixed(0)}-${lastUpdate}`}
            id={download.gid}
            title={download.name}
            subtitle={getSubtitle(download)}
            icon={getDownloadIcon(download.status)}
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
            searchBarPlaceholder="Enter URL, magnet link, or YouTube video to download..."
            actions={
                <ActionPanel>
                    <Action
                        title="Add Download"
                        icon={Icon.Plus}
                        onAction={handleSearchSubmit}
                    />
                    <Action
                        title="Refresh"
                        icon={Icon.ArrowClockwise}
                        onAction={loadDownloads}
                        shortcut={{ modifiers: ["ctrl"], key: "r" }}
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
