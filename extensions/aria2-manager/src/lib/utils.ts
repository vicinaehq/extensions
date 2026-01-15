import * as fs from 'fs';
import type { Aria2Task, DownloadInfo, UrlType } from '../types';

/**
 * Format bytes to human-readable string (KB, MB, GB, etc.)
 */
export const formatBytes = (bytes: number, decimals = 2): string => {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
};

/**
 * Format speed in bytes/sec to human-readable string
 */
export const formatSpeed = (bytesPerSec: number): string => {
    return `${formatBytes(bytesPerSec)}/s`;
};

/**
 * Format seconds to time remaining string (e.g., "2h 30m", "45s")
 */
export const formatTimeRemaining = (seconds: number | null): string => {
    if (seconds === null || seconds === Infinity || seconds <= 0) return '∞';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
};

/**
 * Calculate progress percentage
 */
export const calculateProgress = (completed: number, total: number): number => {
    if (total === 0) return 0;
    return Math.min(100, (completed / total) * 100);
};

/**
 * Calculate ETA in seconds
 */
export const calculateEta = (remaining: number, speed: number): number | null => {
    if (speed <= 0) return null;
    return remaining / speed;
};

/**
 * Extract filename from Aria2 task
 */
export const getTaskFilename = (task: Aria2Task): string => {
    // For BitTorrent downloads
    if (task.bittorrent?.info?.name) {
        return task.bittorrent.info.name;
    }

    // From files array
    if (task.files && task.files.length > 0) {
        const file = task.files[0];
        if (file.path) {
            return file.path.split('/').pop() || 'Unknown';
        }
        // From URI
        if (file.uris && file.uris.length > 0) {
            const uri = file.uris[0].uri;
            try {
                const url = new URL(uri);
                const pathname = url.pathname;
                return decodeURIComponent(pathname.split('/').pop() || 'Unknown');
            } catch {
                return uri.split('/').pop() || 'Unknown';
            }
        }
    }

    return `Download ${task.gid.slice(-6)}`;
};

/**
 * Convert Aria2Task to DownloadInfo for UI display
 */
export const taskToDownloadInfo = (task: Aria2Task): DownloadInfo => {
    const totalSize = parseInt(task.totalLength, 10) || 0;
    const completedSize = parseInt(task.completedLength, 10) || 0;
    const downloadSpeed = parseInt(task.downloadSpeed, 10) || 0;
    const uploadSpeed = parseInt(task.uploadSpeed, 10) || 0;
    const remaining = totalSize - completedSize;

    // Get full file path if available
    let filePath: string | null = null;
    let name = getTaskFilename(task);

    if (task.files && task.files.length > 0 && task.files[0].path) {
        filePath = task.files[0].path;

        // Check if this is a split video file and if the merged version exists
        if (filePath.endsWith('.video.mp4')) {
            const mergedPath = filePath.replace('.video.mp4', '.mp4');
            if (fs.existsSync(mergedPath)) {
                // Point to the merged file instead
                filePath = mergedPath;
                // Update name to remove .video suffix
                name = name.replace('.video.mp4', '.mp4');
            }
        }
    }

    return {
        gid: task.gid,
        name,
        status: task.status,
        progress: calculateProgress(completedSize, totalSize),
        totalSize,
        completedSize,
        downloadSpeed,
        uploadSpeed,
        eta: calculateEta(remaining, downloadSpeed),
        dir: task.dir,
        filePath,
        isVideo: false, // Will be set by caller if needed
        isTorrent: !!task.bittorrent || !!task.infoHash,
        errorMessage: task.errorMessage,
    };
};

// URL Detection Patterns
const MAGNET_REGEX = /^magnet:\?xt=urn:[a-z0-9]+:[a-z0-9]{32,}/i;
const TORRENT_REGEX = /\.torrent(\?.*)?$/i;
const YOUTUBE_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)/i;
const VIDEO_SITE_REGEX = /^(https?:\/\/)?(www\.)?(vimeo\.com|dailymotion\.com|twitch\.tv|twitter\.com|x\.com|instagram\.com|tiktok\.com|facebook\.com\/.*\/videos)/i;

/**
 * Detect URL type for smart routing
 */
export const detectUrlType = (input: string): UrlType => {
    const trimmed = input.trim();

    if (MAGNET_REGEX.test(trimmed)) {
        return 'magnet';
    }

    if (TORRENT_REGEX.test(trimmed)) {
        return 'torrent';
    }

    if (YOUTUBE_REGEX.test(trimmed)) {
        return 'youtube';
    }

    if (VIDEO_SITE_REGEX.test(trimmed)) {
        return 'video';
    }

    return 'generic';
};

/**
 * Check if a string is a valid URL
 */
export const isValidUrl = (input: string): boolean => {
    const trimmed = input.trim();

    // Magnet links
    if (trimmed.startsWith('magnet:')) {
        return MAGNET_REGEX.test(trimmed);
    }

    // HTTP(S) URLs
    try {
        const url = new URL(trimmed);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

/**
 * Get status icon for download status
 */
export const getStatusIcon = (status: string): string => {
    switch (status) {
        case 'active':
            return '⬇️';
        case 'waiting':
            return '⏳';
        case 'paused':
            return '⏸️';
        case 'complete':
            return '✅';
        case 'error':
            return '❌';
        case 'removed':
            return '🗑️';
        default:
            return '❓';
    }
};

/**
 * Generate unique ID for RPC requests
 */
export const generateRpcId = (): string => {
    return `vicinae-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};
