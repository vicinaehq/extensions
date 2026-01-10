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
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }

        const data: Aria2RpcResponse<T> = await response.json();

        if (data.error) {
            throw new Error(`Aria2 RPC error: ${data.error.message} (code: ${data.error.code})`);
        }

        return data.result as T;
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
let defaultClient: Aria2Client | null = null;

export const getAria2Client = (rpcUrl?: string, secret?: string | null): Aria2Client => {
    if (!defaultClient || rpcUrl) {
        defaultClient = new Aria2Client(rpcUrl, secret);
    }
    return defaultClient;
};

export default Aria2Client;
