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
/**
 * Extract direct download URL(s) and metadata from a video URL
 * Supports split video/audio streams for high quality
 */
export const extractVideoUrl = async (
    url: string,
    options: {
        quality?: 'best' | '1080p' | '720p' | 'audio';
        timeout?: number;
    } = {}
): Promise<YtDlpResult> => {
    const { quality = 'best', timeout = 30000 } = options;

    if (!(await isYtDlpInstalled())) {
        throw new YtDlpError(
            'yt-dlp is not installed. Please install "yt-dlp" using your package manager.',
            url
        );
    }

    // args for dumping JSON
    const args: string[] = [
        '--dump-json',
        '--no-warnings',
        '--no-playlist',
    ];

    args.push(url);

    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        const process = spawn('yt-dlp', args);

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

            try {
                const info = JSON.parse(stdout);
                const title = info.title;
                const baseFilename = info._filename || `${title}.${info.ext}`;
                const formats = info.formats || [];

                let result: YtDlpResult = {
                    url: '',
                    filename: baseFilename,
                    title,
                    isSplit: false
                };

                if (quality === 'audio') {
                    // Audio only
                    // Find best audio (m4a preferred)
                    // We can rely on yt-dlp to give us the url if we filter correctly, 
                    // but since we dumped json, we have to find it in 'formats'.
                    // Or easier: actually standard 'bestaudio' usually works fine with -f but since we want the URL..
                    // Parsing formats manually is hard. 
                    // Better strategy: Use -f argument WITH -g (get-url) like before? 
                    // No, the prompt specifically asked to use --dump-json.
                    // "Logic: Instead of asking for a single URL, fetch JSON (--dump-json)."

                    // Actually, getting URLs from JSON is safer.
                    // Find format with vcodec='none' and acodec!='none'
                    const audioFormats = formats.filter((f: any) => f.vcodec === 'none' && f.acodec !== 'none');
                    // Sort by preference: m4a > webm
                    const bestAudio = audioFormats.filter((f: any) => f.ext === 'm4a').pop() || audioFormats.pop();

                    if (bestAudio) {
                        result.url = bestAudio.url;
                        result.filename = `${title}.${bestAudio.ext}`;
                    } else {
                        throw new Error('No audio format found');
                    }

                } else if (quality === '720p') {
                    // Best muxed mp4 (usually up to 1080p if available, or 720p)
                    // "return the single best muxed format (best[ext=mp4])"

                    // Filter for muxed (both codecs present) and mp4
                    const muxedFormats = formats.filter((f: any) => f.vcodec !== 'none' && f.acodec !== 'none' && f.ext === 'mp4');
                    // Sort by height/resolution? Usually the formats are already sorted? 
                    // yt-dlp sorts worst to best.
                    const bestMuxed = muxedFormats.pop();

                    if (bestMuxed) {
                        result.url = bestMuxed.url;
                        result.filename = `${title}.mp4`;
                    } else {
                        // Fallback to any muxed
                        const anyMuxed = formats.filter((f: any) => f.vcodec !== 'none' && f.acodec !== 'none').pop();
                        if (anyMuxed) {
                            result.url = anyMuxed.url;
                            result.filename = `${title}.${anyMuxed.ext}`;
                        } else {
                            throw new Error('No muxed format found');
                        }
                    }

                } else {
                    // 'best' / '1080p' -> Attempt split
                    // Look for best video (mp4) and best audio (m4a)

                    // Video only formats
                    const videoFormats = formats.filter((f: any) => f.vcodec !== 'none' && f.acodec === 'none' && f.ext === 'mp4');
                    // Audio only formats
                    const audioFormats = formats.filter((f: any) => f.vcodec === 'none' && f.acodec !== 'none' && f.ext === 'm4a');

                    const bestVideo = videoFormats.pop();
                    const bestAudio = audioFormats.pop();

                    if (bestVideo && bestAudio) {
                        // Split streams available
                        result.videoUrl = bestVideo.url;
                        result.audioUrl = bestAudio.url;
                        result.isSplit = true;
                        // Use special filenames for lazy merging
                        // Naming Convention: Filename.video.mp4 / Filename.audio.m4a
                        // We return the base filename here, index.tsx will append extensions
                        result.filename = title; // Base title
                        result.url = bestVideo.url; // Primary url? 
                    } else {
                        // Fallback to best muxed
                        const muxed = formats.filter((f: any) => f.vcodec !== 'none' && f.acodec !== 'none').pop();
                        if (muxed) {
                            result.url = muxed.url;
                            result.filename = `${title}.${muxed.ext}`;
                            result.isSplit = false;
                        } else {
                            throw new Error('No suitable formats found');
                        }
                    }
                }

                resolve(result);

            } catch (err) {
                reject(new YtDlpError(
                    `Failed to parse yt-dlp output: ${err instanceof Error ? err.message : 'Unknown error'}`,
                    url
                ));
            }
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
