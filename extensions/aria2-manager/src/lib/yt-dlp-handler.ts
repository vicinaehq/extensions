import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import type { YtDlpResult } from '../types';

const execAsync = promisify(exec);

<<<<<<< HEAD
/**
 * Sanitize filename to be safe for all filesystems
 */
const sanitizeFilename = (name: string): string => {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
};

=======
>>>>>>> e01fe274f037e4d2b7436718258fa898f80dc4b2
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
<<<<<<< HEAD
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
=======
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
>>>>>>> e01fe274f037e4d2b7436718258fa898f80dc4b2
            url
        );
    }

<<<<<<< HEAD
    // args for dumping JSON
    const args: string[] = [
        '--dump-json',
=======
    // Build arguments
    const args: string[] = [
        '--get-url',
        '--get-filename',
        '-o', '%(title)s.%(ext)s',
>>>>>>> e01fe274f037e4d2b7436718258fa898f80dc4b2
        '--no-warnings',
        '--no-playlist',
    ];

<<<<<<< HEAD
=======
    // Format selection
    if (format) {
        args.push('-f', format);
    } else if (preferAudioOnly) {
        args.push('-f', 'bestaudio');
    } else {
        // Best quality with audio+video merged if possible
        args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
    }

>>>>>>> e01fe274f037e4d2b7436718258fa898f80dc4b2
    args.push(url);

    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        const process = spawn('yt-dlp', args);

<<<<<<< HEAD
=======
        // Set timeout
>>>>>>> e01fe274f037e4d2b7436718258fa898f80dc4b2
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

<<<<<<< HEAD
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
                        result.filename = `${sanitizeFilename(title)}.${bestAudio.ext}`;
                    } else {
                        throw new Error('No audio format found');
                    }

                } else if (quality === '720p') {
                    // Best muxed mp4 (usually up to 1080p if available, or 720p)
                    // Strict 720p limit: height <= 720
                    const muxedFormats = formats.filter((f: any) =>
                        f.vcodec !== 'none' && f.acodec !== 'none' && f.ext === 'mp4' && (f.height || 0) <= 720
                    );
                    const bestMuxed = muxedFormats.pop();

                    if (bestMuxed) {
                        result.url = bestMuxed.url;
                        result.filename = `${sanitizeFilename(title)}.mp4`;
                    } else {
                        // Fallback: any muxed <= 720p
                        const anyMuxed = formats.filter((f: any) =>
                            f.vcodec !== 'none' && f.acodec !== 'none' && (f.height || 0) <= 720
                        ).pop();

                        if (anyMuxed) {
                            result.url = anyMuxed.url;
                            result.filename = `${sanitizeFilename(title)}.${anyMuxed.ext}`;
                        } else {
                            throw new Error('No formats found <= 720p');
                        }
                    }

                } else if (quality === '1080p') {
                    // Split streams: Video <= 1080p + Best Audio
                    const videoFormats = formats.filter((f: any) =>
                        f.vcodec !== 'none' && f.acodec === 'none' && f.ext === 'mp4' && (f.height || 0) <= 1080
                    );
                    const audioFormats = formats.filter((f: any) =>
                        f.vcodec === 'none' && f.acodec !== 'none' && f.ext === 'm4a'
                    );

                    const bestVideo = videoFormats.pop();
                    const bestAudio = audioFormats.pop();

                    if (bestVideo && bestAudio) {
                        result.videoUrl = bestVideo.url;
                        result.audioUrl = bestAudio.url;
                        result.isSplit = true;
                        result.filename = sanitizeFilename(title);
                        result.url = bestVideo.url;
                    } else {
                        // Fallback to muxed <= 1080p
                        const muxed = formats.filter((f: any) =>
                            f.vcodec !== 'none' && f.acodec !== 'none' && f.ext === 'mp4' && (f.height || 0) <= 1080
                        ).pop();
                        if (muxed) {
                            result.url = muxed.url;
                            result.filename = `${sanitizeFilename(title)}.mp4`;
                            result.isSplit = false;
                        } else {
                            throw new Error('No formats found <= 1080p');
                        }
                    }
                } else {
                    // 'best' -> Attempt split for Max Resolution
                    const videoFormats = formats.filter((f: any) => f.vcodec !== 'none' && f.acodec === 'none' && f.ext === 'mp4');
                    const audioFormats = formats.filter((f: any) => f.vcodec === 'none' && f.acodec !== 'none' && f.ext === 'm4a');

                    const bestVideo = videoFormats.pop();
                    const bestAudio = audioFormats.pop();

                    if (bestVideo && bestAudio) {
                        result.videoUrl = bestVideo.url;
                        result.audioUrl = bestAudio.url;
                        result.isSplit = true;
                        result.filename = sanitizeFilename(title);
                        result.url = bestVideo.url;
                    } else {
                        // Fallback to best muxed
                        const muxed = formats.filter((f: any) => f.vcodec !== 'none' && f.acodec !== 'none').pop();
                        if (muxed) {
                            result.url = muxed.url;
                            result.filename = `${sanitizeFilename(title)}.${muxed.ext}`;
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
=======
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
>>>>>>> e01fe274f037e4d2b7436718258fa898f80dc4b2
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

<<<<<<< HEAD
    return new Promise((resolve, reject) => {
        const process = spawn('yt-dlp', ['-F', '--no-warnings', url]);
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (d) => stdout += d.toString());
        process.stderr.on('data', (d) => stderr += d.toString());

        process.on('close', (code) => {
            if (code === 0) resolve(stdout);
            else reject(new YtDlpError(`Failed to list formats: ${stderr}`, url));
        });

        // Timeout handling could be improved, but basic implementation here
        setTimeout(() => {
            process.kill();
            // Promise doesn't reject here automatically unless we handle it, but for brevity keeping similar to before
        }, 30000);
    });
=======
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
>>>>>>> e01fe274f037e4d2b7436718258fa898f80dc4b2
};

/**
 * Get video title without downloading
 */
export const getVideoTitle = async (url: string): Promise<string> => {
    if (!(await isYtDlpInstalled())) {
        throw new YtDlpError('yt-dlp is not installed', url);
    }

<<<<<<< HEAD
    return new Promise((resolve, reject) => {
        const process = spawn('yt-dlp', ['--get-title', '--no-warnings', '--no-playlist', url]);
        let stdout = '';

        process.stdout.on('data', (d) => stdout += d.toString());

        process.on('close', (code) => {
            if (code === 0) resolve(stdout.trim());
            else reject(new YtDlpError('Failed to get title', url));
        });

        setTimeout(() => process.kill(), 15000);
    });
=======
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
>>>>>>> e01fe274f037e4d2b7436718258fa898f80dc4b2
};

/**
 * Check if URL is supported by yt-dlp
 */
export const isUrlSupported = async (url: string): Promise<boolean> => {
    if (!(await isYtDlpInstalled())) {
        return false;
    }

<<<<<<< HEAD
    return new Promise((resolve) => {
        // use --simulate
        const process = spawn('yt-dlp', ['--simulate', '--no-warnings', '--no-playlist', url]);
        let stderr = '';

        process.stderr.on('data', (d) => stderr += d.toString());

        process.on('close', (code) => {
            // If code 0 and no error in stderr implies success?
            // Actually yt-dlp returns non-zero on error.
            if (code === 0 && !stderr.includes('ERROR')) resolve(true);
            else resolve(false);
        });

        setTimeout(() => {
            process.kill();
            resolve(false);
        }, 10000);
    });
=======
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
>>>>>>> e01fe274f037e4d2b7436718258fa898f80dc4b2
};
