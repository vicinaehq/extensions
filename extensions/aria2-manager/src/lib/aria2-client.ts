import type {
    Aria2Task,
    Aria2GlobalStat,
    Aria2RpcRequest,
    Aria2RpcResponse,
    Aria2AddOptions,
} from '../types';
import { generateRpcId } from './utils';

/**
 * Aria2 JSON-RPC Client
 * Communicates with aria2c daemon over HTTP
 */
export class Aria2Client {
    private rpcUrl: string;
    private secret: string | null;

    constructor(rpcUrl = 'http://localhost:6800/jsonrpc', secret: string | null = null) {
        this.rpcUrl = rpcUrl;
        this.secret = secret;
    }

    /**
     * Send a JSON-RPC request to aria2c
     */
    private async call<T>(method: string, params: unknown[] = []): Promise<T> {
        // Prepend secret token if configured
        const finalParams = this.secret ? [`token:${this.secret}`, ...params] : params;

        const request: Aria2RpcRequest = {
            jsonrpc: '2.0',
            id: generateRpcId(),
            method: `aria2.${method}`,
            params: finalParams,
        };

        const response = await fetch(this.rpcUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
<<<<<<< HEAD
            signal: AbortSignal.timeout(5000), // Add 5s timeout
=======
>>>>>>> e01fe274f037e4d2b7436718258fa898f80dc4b2
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }

        const data: Aria2RpcResponse<T> = await response.json();

        if (data.error) {
            throw new Error(`Aria2 RPC error: ${data.error.message} (code: ${data.error.code})`);
        }

<<<<<<< HEAD
        if (data.result === undefined) {
            // It's possible for result to be null/undefined for some void methods, 
            // but we shouldn't blindly cast.
            // If T is void or unknown, this might be fine.
            // If T is expected to be an object, this is bad.
            // For now, let's allow it but maybe warn? 
            // Or better: construct assumes T handles it.
            // But strict null check:
            return data.result as T;
        }

        return data.result;
=======
        return data.result as T;
>>>>>>> e01fe274f037e4d2b7436718258fa898f80dc4b2
    }

    /**
     * Check if aria2c is reachable
     */
    async isConnected(): Promise<boolean> {
        try {
            await this.getVersion();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get aria2c version info
     */
    async getVersion(): Promise<{ version: string; enabledFeatures: string[] }> {
        return this.call('getVersion');
    }

    /**
     * Add a download by URI (supports HTTP, HTTPS, FTP, Magnet, Torrent URL)
     */
    async addUri(uris: string[], options: Aria2AddOptions = {}): Promise<string> {
        return this.call<string>('addUri', [[...uris], options]);
    }

    /**
     * Add a torrent file by base64-encoded content
     */
    async addTorrent(
        torrentBase64: string,
        uris: string[] = [],
        options: Aria2AddOptions = {}
    ): Promise<string> {
        return this.call<string>('addTorrent', [torrentBase64, uris, options]);
    }

    /**
     * Remove a download
     * @param forceRemove - If true, removes even if complete/error
     */
    async remove(gid: string, forceRemove = false): Promise<string> {
        const method = forceRemove ? 'forceRemove' : 'remove';
        return this.call<string>(method, [gid]);
    }

    /**
     * Pause a download
     */
    async pause(gid: string, force = false): Promise<string> {
        const method = force ? 'forcePause' : 'pause';
        return this.call<string>(method, [gid]);
    }

    /**
     * Pause all downloads
     */
    async pauseAll(): Promise<string> {
        return this.call<string>('pauseAll');
    }

    /**
     * Resume/unpause a download
     */
    async unpause(gid: string): Promise<string> {
        return this.call<string>('unpause', [gid]);
    }

    /**
     * Resume all paused downloads
     */
    async unpauseAll(): Promise<string> {
        return this.call<string>('unpauseAll');
    }

    /**
     * Get status of a specific download
     */
    async tellStatus(gid: string, keys?: string[]): Promise<Aria2Task> {
        const params: unknown[] = [gid];
        if (keys) params.push(keys);
        return this.call<Aria2Task>('tellStatus', params);
    }

    /**
     * Get list of active downloads
     */
    async tellActive(keys?: string[]): Promise<Aria2Task[]> {
        const params: unknown[] = keys ? [keys] : [];
        return this.call<Aria2Task[]>('tellActive', params);
    }

    /**
     * Get list of waiting downloads
     */
    async tellWaiting(offset = 0, num = 100, keys?: string[]): Promise<Aria2Task[]> {
        const params: unknown[] = [offset, num];
        if (keys) params.push(keys);
        return this.call<Aria2Task[]>('tellWaiting', params);
    }

    /**
     * Get list of stopped/completed downloads
     */
    async tellStopped(offset = 0, num = 100, keys?: string[]): Promise<Aria2Task[]> {
        const params: unknown[] = [offset, num];
        if (keys) params.push(keys);
        return this.call<Aria2Task[]>('tellStopped', params);
    }

    /**
     * Get all downloads (active + waiting + stopped)
     */
    async getAllTasks(): Promise<{
        active: Aria2Task[];
        waiting: Aria2Task[];
        stopped: Aria2Task[];
    }> {
        const [active, waiting, stopped] = await Promise.all([
            this.tellActive(),
            this.tellWaiting(),
            this.tellStopped(),
        ]);

        return { active, waiting, stopped };
    }

    /**
     * Get global download/upload statistics
     */
    async getGlobalStat(): Promise<Aria2GlobalStat> {
        return this.call<Aria2GlobalStat>('getGlobalStat');
    }

    /**
     * Purge completed/error/removed downloads from memory
     */
    async purgeDownloadResult(): Promise<string> {
        return this.call<string>('purgeDownloadResult');
    }

    /**
     * Remove a specific download result
     */
    async removeDownloadResult(gid: string): Promise<string> {
        return this.call<string>('removeDownloadResult', [gid]);
    }

    /**
     * Change download position in queue
     */
    async changePosition(gid: string, pos: number, how: 'POS_SET' | 'POS_CUR' | 'POS_END'): Promise<number> {
        return this.call<number>('changePosition', [gid, pos, how]);
    }

    /**
     * Shutdown aria2c daemon
     */
    async shutdown(force = false): Promise<string> {
        const method = force ? 'forceShutdown' : 'shutdown';
        return this.call<string>(method);
    }

    /**
     * Save current session to file
     */
    async saveSession(): Promise<string> {
        return this.call<string>('saveSession');
    }
}

/**
 * Create a singleton client instance
 */
<<<<<<< HEAD
// Basic map to store clients by key to support multiple configs if needed, 
// though typically we only use one.
const clientCache = new Map<string, Aria2Client>();

export const getAria2Client = (rpcUrl = 'http://localhost:6800/jsonrpc', secret: string | null = null): Aria2Client => {
    // Create a unique key for the config
    const key = `${rpcUrl}|${secret || ''}`;

    if (!clientCache.has(key)) {
        clientCache.set(key, new Aria2Client(rpcUrl, secret));
    }

    return clientCache.get(key)!;
=======
let defaultClient: Aria2Client | null = null;

export const getAria2Client = (rpcUrl?: string, secret?: string | null): Aria2Client => {
    if (!defaultClient || rpcUrl) {
        defaultClient = new Aria2Client(rpcUrl, secret);
    }
    return defaultClient;
>>>>>>> e01fe274f037e4d2b7436718258fa898f80dc4b2
};

export default Aria2Client;
