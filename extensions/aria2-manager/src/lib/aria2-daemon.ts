import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import { getAria2Client } from './aria2-client';

const execAsync = promisify(exec);

/** Aria2 daemon configuration */
export interface DaemonConfig {
    rpcPort?: number;
    rpcSecret?: string;
    downloadDir?: string;
    maxConcurrentDownloads?: number;
    enableDht?: boolean;
    enablePeerExchange?: boolean;
    seedRatio?: number;
}

/** Daemon spawn result */
export interface DaemonSpawnResult {
    success: boolean;
    message: string;
    pid?: number;
}

// Track spawned process
let daemonProcess: ChildProcess | null = null;

/**
 * Check if aria2c binary is installed
 */
export const isAria2Installed = async (): Promise<boolean> => {
    try {
        await execAsync('which aria2c');
        return true;
    } catch {
        return false;
    }
};

/**
 * Check if aria2c daemon is running and reachable
 */
export const isDaemonRunning = async (rpcUrl?: string): Promise<boolean> => {
    const client = getAria2Client(rpcUrl);
    return client.isConnected();
};

/**
 * Find existing aria2c process PID
 */
export const findExistingDaemon = async (): Promise<number | null> => {
    try {
        const { stdout } = await execAsync('pgrep -x aria2c');
        const pid = parseInt(stdout.trim().split('\n')[0], 10);
        return isNaN(pid) ? null : pid;
    } catch {
        return null;
    }
};

/**
 * Spawn aria2c daemon with RPC enabled
 */
export const spawnDaemon = async (config: DaemonConfig = {}): Promise<DaemonSpawnResult> => {
    // Check if aria2c is installed
    if (!(await isAria2Installed())) {
        return {
            success: false,
            message: 'aria2c is not installed. Please install it with: sudo apt install aria2',
        };
    }

    // Check if already running
    if (await isDaemonRunning()) {
        const pid = await findExistingDaemon();
        return {
            success: true,
            message: 'aria2c daemon is already running',
            pid: pid || undefined,
        };
    }

    // Build command arguments
    const args: string[] = [
        '--enable-rpc',
        '--rpc-listen-all=false',
        '--rpc-allow-origin-all',
        `--rpc-listen-port=${config.rpcPort || 6800}`,
        '--daemon=false', // We manage the process ourselves
        '--continue=true',
        '--auto-file-renaming=true',
        '--allow-overwrite=false',
        '--max-connection-per-server=16',
        '--min-split-size=1M',
        '--split=16',
        '--max-concurrent-downloads=' + (config.maxConcurrentDownloads || 5),
        '--file-allocation=none',
        '--check-certificate=false',
    ];

    // Add secret if provided
    if (config.rpcSecret) {
        args.push(`--rpc-secret=${config.rpcSecret}`);
    }

    // Add download directory
    if (config.downloadDir) {
        args.push(`--dir=${config.downloadDir}`);
    }

    // BitTorrent settings
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

            // Give it a moment to start
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

            // Handle process errors
            daemonProcess.on('error', (error) => {
                resolve({
                    success: false,
                    message: `Failed to spawn aria2c: ${error.message}`,
                });
            });

            // Unref to allow parent to exit independently
            daemonProcess.unref();
        } catch (error) {
            resolve({
                success: false,
                message: `Error spawning aria2c: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    });
};

/**
 * Stop the daemon gracefully
 */
export const stopDaemon = async (rpcUrl?: string): Promise<boolean> => {
    try {
        const client = getAria2Client(rpcUrl);

        // Try graceful shutdown first
        try {
            await client.shutdown();
            return true;
        } catch {
            // If graceful fails, try force shutdown
            await client.shutdown(true);
            return true;
        }
    } catch {
        // If RPC fails, try to kill by PID
        const pid = await findExistingDaemon();
        if (pid) {
            try {
                await execAsync(`kill ${pid}`);
                return true;
            } catch {
                // Try SIGKILL
                try {
                    await execAsync(`kill -9 ${pid}`);
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

/**
 * Ensure daemon is running, starting it if necessary
 */
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

/**
 * Get daemon status info
 */
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
            // Ignore version fetch errors
        }
    }

    return { installed, running, pid, version };
};
