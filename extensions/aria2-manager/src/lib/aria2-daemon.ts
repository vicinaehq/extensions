import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import { getAria2Client } from './aria2-client';

const execAsync = promisify(exec);

export interface DaemonConfig {
    rpcPort?: number;
    rpcSecret?: string;
    downloadDir?: string;
    maxConcurrentDownloads?: number;
    enableDht?: boolean;
    enablePeerExchange?: boolean;
    seedRatio?: number;
    checkCertificate?: boolean;
    rpcAllowOriginAll?: boolean;
}

export interface DaemonSpawnResult {
    success: boolean;
    message: string;
    pid?: number;
}

let daemonProcess: ChildProcess | null = null;

export const isAria2Installed = async (): Promise<boolean> => {
    try {
        await execAsync('which aria2c');
        return true;
    } catch {
        return false;
    }
};

export const isDaemonRunning = async (rpcUrl?: string): Promise<boolean> => {
    const client = getAria2Client(rpcUrl);
    return client.isConnected();
};

export const findExistingDaemon = async (): Promise<number | null> => {
    try {
        const { stdout } = await execAsync('pgrep -x aria2c');
        const pid = parseInt(stdout.trim().split('\n')[0], 10);
        return isNaN(pid) ? null : pid;
    } catch {
        return null;
    }
};

export const spawnDaemon = async (config: DaemonConfig = {}): Promise<DaemonSpawnResult> => {
    if (!(await isAria2Installed())) {
        return {
            success: false,
            message: 'Aria2 executable not found. Please install "aria2" using your package manager.',
        };
    }

    if (await isDaemonRunning()) {
        const pid = await findExistingDaemon();
        return {
            success: true,
            message: 'aria2c daemon is already running',
            pid: pid || undefined,
        };
    }

    // Build command arguments - REMOVED DUPLICATE FLAG HERE
    const args: string[] = [
        '--enable-rpc',
        '--rpc-listen-all=false',
        `--rpc-listen-port=${config.rpcPort || 6800}`,
        '--daemon=false',
        '--continue=true',
        '--auto-file-renaming=true',
        '--allow-overwrite=false',
        '--max-connection-per-server=16',
        '--min-split-size=1M',
        '--split=16',
        '--max-concurrent-downloads=' + (config.maxConcurrentDownloads || 5),
        '--file-allocation=none',
        config.checkCertificate === true ? '--check-certificate=true' : '--check-certificate=false',
        config.rpcAllowOriginAll === false ? '--rpc-allow-origin-all=false' : '--rpc-allow-origin-all=true',
    ];

    if (config.rpcSecret) {
        args.push(`--rpc-secret=${config.rpcSecret}`);
    }

    if (config.downloadDir) {
        args.push(`--dir=${config.downloadDir}`);
    }

    if (config.enableDht !== false) {
        args.push('--enable-dht=true');
    }

    if (config.enablePeerExchange !== false) {
        args.push('--enable-peer-exchange=true');
    }

    if (config.seedRatio !== undefined) {
        args.push(`--seed-ratio=${config.seedRatio}`);
    }

    return new Promise((resolve) => {
        try {
            daemonProcess = spawn('aria2c', args, {
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            setTimeout(async () => {
                if (await isDaemonRunning()) {
                    resolve({
                        success: true,
                        message: 'aria2c daemon started successfully',
                        pid: daemonProcess?.pid,
                    });
                } else {
                    resolve({
                        success: false,
                        message: 'Failed to connect to aria2c after starting',
                    });
                }
            }, 1500);

            daemonProcess.on('error', (error) => {
                resolve({
                    success: false,
                    message: `Failed to spawn aria2c: ${error.message}`,
                });
            });

            daemonProcess.unref();
        } catch (error) {
            resolve({
                success: false,
                message: `Error spawning aria2c: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    });
};

export const stopDaemon = async (rpcUrl?: string): Promise<boolean> => {
    try {
        const client = getAria2Client(rpcUrl);
        try {
            await client.shutdown();
            return true;
        } catch {
            await client.shutdown(true);
            return true;
        }
    } catch {
        const pid = await findExistingDaemon();
        if (pid) {
            try {
                process.kill(pid, 'SIGTERM');
                return true;
            } catch {
                try {
                    process.kill(pid, 'SIGKILL');
                    return true;
                } catch {
                    return false;
                }
            }
        }
        return false;
    } finally {
        daemonProcess = null;
    }
};

export const ensureDaemonRunning = async (config: DaemonConfig = {}): Promise<DaemonSpawnResult> => {
    const running = await isDaemonRunning();
    if (running) {
        const pid = await findExistingDaemon();
        return {
            success: true,
            message: 'aria2c daemon is already running',
            pid: pid || undefined,
        };
    }
    return spawnDaemon(config);
};

export const getDaemonStatus = async (rpcUrl?: string): Promise<{
    installed: boolean;
    running: boolean;
    pid: number | null;
    version?: string;
}> => {
    const installed = await isAria2Installed();
    const running = await isDaemonRunning(rpcUrl);
    const pid = await findExistingDaemon();

    let version: string | undefined;
    if (running) {
        try {
            const client = getAria2Client(rpcUrl);
            const info = await client.getVersion();
            version = info.version;
        } catch {
            // Ignore errors
        }
    }
    return { installed, running, pid, version };
};
