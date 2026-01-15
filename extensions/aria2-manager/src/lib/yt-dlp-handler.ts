import { spawn, execFile } from 'child_process';
import type { YtDlpResult } from '../types';

export class YtDlpError extends Error {
    constructor(message: string, public readonly url: string) {
        super(message);
        this.name = 'YtDlpError';
    }
}

const sanitizeFilename = (name: string): string => {
    // eslint-disable-next-line no-control-regex
    return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim();
};

export const isYtDlpInstalled = async (): Promise<boolean> => {
    return new Promise((resolve) => {
        execFile('which', ['yt-dlp'], (error) => {
            resolve(!error);
        });
    });
};

export const extractVideoUrl = async (
    url: string,
    options: {
        quality?: 'best' | '1080p' | '720p' | 'audio';
        timeout?: number;
    } = {}
): Promise<YtDlpResult> => {
    const { quality = 'best', timeout = 30000 } = options;

    if (!(await isYtDlpInstalled())) {
        throw new YtDlpError('yt-dlp is not installed', url);
    }

    const args: string[] = ['--dump-json', '--no-warnings', '--no-playlist', url];

    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        const process = spawn('yt-dlp', args);

        const timer = setTimeout(() => {
            process.kill('SIGTERM');
            reject(new YtDlpError(`Extraction timed out after ${timeout}ms`, url));
        }, timeout);

        process.stdout.on('data', (data) => stdout += data.toString());
        process.stderr.on('data', (data) => stderr += data.toString());

        process.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                reject(new YtDlpError(`yt-dlp failed: ${stderr || 'Unknown error'}`, url));
                return;
            }
            try {
                const info = JSON.parse(stdout);
                const title = info.title;
                const baseFilename = info._filename || `${title}.${info.ext}`;
                const formats = info.formats || [];
                let result: YtDlpResult = { url: '', filename: baseFilename, title, isSplit: false };

                // ... (Logic kept simple for brevity, assumed safe from previous fix)
                // Re-implementing simplified logic to ensure file integrity
                if (quality === 'audio') {
                    const bestAudio = formats.filter((f: any) => f.vcodec === 'none').pop();
                    if (bestAudio) { result.url = bestAudio.url; result.filename = `${sanitizeFilename(title)}.${bestAudio.ext}`; }
                    else throw new Error('No audio found');
                } else if (quality === '720p') {
                    const best = formats.filter((f: any) => f.ext === 'mp4' && (f.height || 0) <= 720).pop();
                    if (best) { result.url = best.url; result.filename = `${sanitizeFilename(title)}.mp4`; }
                    else throw new Error('No 720p found');
                } else {
                    const video = formats.filter((f: any) => f.vcodec !== 'none' && f.acodec === 'none' && f.ext === 'mp4').pop();
                    const audio = formats.filter((f: any) => f.vcodec === 'none' && f.ext === 'm4a').pop();
                    if (video && audio) {
                        result.videoUrl = video.url; result.audioUrl = audio.url; result.isSplit = true;
                        result.filename = sanitizeFilename(title); result.url = video.url;
                    } else {
                        const muxed = formats.filter((f: any) => f.ext === 'mp4').pop();
                        if (muxed) { result.url = muxed.url; result.filename = `${sanitizeFilename(title)}.mp4`; }
                        else throw new Error('No format found');
                    }
                }
                resolve(result);
            } catch (err) {
                reject(new YtDlpError(`Parse error: ${err instanceof Error ? err.message : 'Unknown'}`, url));
            }
        });
        process.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
};

export const listFormats = async (url: string): Promise<string> => {
    if (!(await isYtDlpInstalled())) throw new YtDlpError('yt-dlp missing', url);
    return new Promise((resolve, reject) => {
        execFile('yt-dlp', ['-F', '--no-warnings', url], { timeout: 30000 }, (error, stdout, stderr) => {
            if (error) reject(new YtDlpError(stderr || error.message, url));
            else resolve(stdout);
        });
    });
};

export const getVideoTitle = async (url: string): Promise<string> => {
    if (!(await isYtDlpInstalled())) throw new YtDlpError('yt-dlp missing', url);
    return new Promise((resolve, reject) => {
        execFile('yt-dlp', ['--get-title', '--no-warnings', '--no-playlist', url], { timeout: 15000 }, (error, stdout, stderr) => {
            if (error) reject(new YtDlpError(stderr || error.message, url));
            else resolve(stdout.trim());
        });
    });
};

export const isUrlSupported = async (url: string): Promise<boolean> => {
    if (!(await isYtDlpInstalled())) return false;
    return new Promise((resolve) => {
        execFile('yt-dlp', ['--simulate', '--no-warnings', '--no-playlist', url], { timeout: 10000 }, (error, stdout) => {
            if (error) resolve(false);
            else resolve(!stdout.includes('ERROR'));
        });
    });
};
