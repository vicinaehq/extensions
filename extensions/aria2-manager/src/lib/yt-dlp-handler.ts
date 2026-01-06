import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import type { YtDlpResult } from '../types';

const execAsync = promisify(exec);

/** Error thrown when yt-dlp operations fail */
export class YtDlpError extends Error {
    constructor(message: string, public readonly url: string) {
        super(message);
        this.name = 'YtDlpError';
    }
}

/**
 * Check if yt-dlp is installed
 */
export const isYtDlpInstalled = async (): Promise<boolean> => {
    try {
        await execAsync('which yt-dlp');
        return true;
    } catch {
        return false;
    }
};

/**
 * Get yt-dlp version
 */
export const getYtDlpVersion = async (): Promise<string | null> => {
    try {
        const { stdout } = await execAsync('yt-dlp --version');
        return stdout.trim();
    } catch {
        return null;
    }
};

/**
 * Extract direct download URL and metadata from a video URL
 * Works with YouTube, Vimeo, Twitter, TikTok, and 1000+ other sites
 */
export const extractVideoUrl = async (
    url: string,
    options: {
        format?: string;
        preferAudioOnly?: boolean;
        timeout?: number;
    } = {}
): Promise<YtDlpResult> => {
    const { format, preferAudioOnly = false, timeout = 30000 } = options;

    // Check if yt-dlp is installed
    if (!(await isYtDlpInstalled())) {
        throw new YtDlpError(
            'yt-dlp is not installed. Install with: pip install yt-dlp',
            url
        );
    }

    // Build arguments
    const args: string[] = [
        '--get-url',
        '--get-filename',
        '-o', '%(title)s.%(ext)s',
        '--no-warnings',
        '--no-playlist',
    ];

    // Format selection
    if (format) {
        args.push('-f', format);
    } else if (preferAudioOnly) {
        args.push('-f', 'bestaudio');
    } else {
        // Best quality with audio+video merged if possible
        args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
    }

    args.push(url);

    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        const process = spawn('yt-dlp', args);

        // Set timeout
        const timer = setTimeout(() => {
            process.kill('SIGTERM');
            reject(new YtDlpError(`Extraction timed out after ${timeout}ms`, url));
        }, timeout);

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            clearTimeout(timer);

            if (code !== 0) {
                reject(new YtDlpError(
                    `yt-dlp failed: ${stderr || 'Unknown error'}`,
                    url
                ));
                return;
            }

            const lines = stdout.trim().split('\n').filter(line => line.length > 0);

            if (lines.length < 2) {
                reject(new YtDlpError(
                    `Unexpected yt-dlp output: ${stdout}`,
                    url
                ));
                return;
            }

            // Last line is filename, previous lines are URLs (may be multiple for audio+video)
            const filename = lines[lines.length - 1];
            // Use the first URL (video), or combine them
            const extractedUrl = lines[0];

            // Extract title from filename (remove extension)
            const title = filename.replace(/\.[^.]+$/, '');

            resolve({
                url: extractedUrl,
                filename,
                title,
            });
        });

        process.on('error', (error) => {
            clearTimeout(timer);
            reject(new YtDlpError(`Failed to run yt-dlp: ${error.message}`, url));
        });
    });
};

/**
 * Get available formats for a video URL
 */
export const listFormats = async (url: string): Promise<string> => {
    if (!(await isYtDlpInstalled())) {
        throw new YtDlpError('yt-dlp is not installed', url);
    }

    try {
        const { stdout } = await execAsync(`yt-dlp -F --no-warnings "${url}"`, {
            timeout: 30000,
        });
        return stdout;
    } catch (error) {
        throw new YtDlpError(
            `Failed to list formats: ${error instanceof Error ? error.message : 'Unknown error'}`,
            url
        );
    }
};

/**
 * Get video title without downloading
 */
export const getVideoTitle = async (url: string): Promise<string> => {
    if (!(await isYtDlpInstalled())) {
        throw new YtDlpError('yt-dlp is not installed', url);
    }

    try {
        const { stdout } = await execAsync(
            `yt-dlp --get-title --no-warnings --no-playlist "${url}"`,
            { timeout: 15000 }
        );
        return stdout.trim();
    } catch (error) {
        throw new YtDlpError(
            `Failed to get title: ${error instanceof Error ? error.message : 'Unknown error'}`,
            url
        );
    }
};

/**
 * Check if URL is supported by yt-dlp
 */
export const isUrlSupported = async (url: string): Promise<boolean> => {
    if (!(await isYtDlpInstalled())) {
        return false;
    }

    try {
        const { stdout } = await execAsync(
            `yt-dlp --simulate --no-warnings --no-playlist "${url}" 2>&1`,
            { timeout: 10000 }
        );
        // If no error output, it's likely supported
        return !stdout.includes('ERROR');
    } catch {
        return false;
    }
};
