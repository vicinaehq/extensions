import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);
const unlinkAsync = promisify(fs.unlink);

/**
 * Check if ffmpeg is installed
 */
export const isFfmpegInstalled = async (): Promise<boolean> => {
    try {
        await execAsync('which ffmpeg');
        return true;
    } catch {
        return false;
    }
};

/**
 * Merge video and audio files using ffmpeg copy (no re-encoding)
 * Deletes source files upon success
 */
export const mergeMedia = async (
    videoPath: string,
    audioPath: string,
    outputPath: string
): Promise<void> => {
    return new Promise((resolve, reject) => {
        // ffmpeg -i video -i audio -c copy -y output
        const args = [
            '-i', videoPath,
            '-i', audioPath,
            '-c', 'copy',
            '-y', // Overwrite output
            outputPath
        ];

        const process = spawn('ffmpeg', args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stderr = '';

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', async (code) => {
            if (code === 0) {
                try {
                    // Delete source files on success
                    await unlinkAsync(videoPath);
                    await unlinkAsync(audioPath);
                    resolve();
                } catch (err) {
                    console.error('Failed to delete source files:', err);
                    // Resolve anyway since merge was successful
                    resolve();
                }
            } else {
                reject(new Error(`FFmpeg merge failed: ${stderr}`));
            }
        });

        process.on('error', (err) => {
            reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
        });
    });
};
