/**
 * TypeScript interfaces for Aria2 JSON-RPC communication
 */

/** Status of an Aria2 download task */
export type Aria2Status = 'active' | 'waiting' | 'paused' | 'error' | 'complete' | 'removed';

/** File information within a download task */
export interface Aria2File {
  index: string;
  path: string;
  length: string;
  completedLength: string;
  selected: string;
  uris: Array<{ uri: string; status: string }>;
}

/** BitTorrent specific information */
export interface Aria2BtInfo {
  announceList?: string[][];
  comment?: string;
  creationDate?: number;
  mode?: 'single' | 'multi';
  info?: {
    name: string;
  };
}

/** Main Aria2 task/download interface */
export interface Aria2Task {
  gid: string;
  status: Aria2Status;
  totalLength: string;
  completedLength: string;
  uploadLength: string;
  downloadSpeed: string;
  uploadSpeed: string;
  connections: string;
  numSeeders?: string;
  seeder?: string;
  dir: string;
  files: Aria2File[];
  bittorrent?: Aria2BtInfo;
  infoHash?: string;
  errorCode?: string;
  errorMessage?: string;
  followedBy?: string[];
  following?: string;
  belongsTo?: string;
}

/** Aria2 global statistics */
export interface Aria2GlobalStat {
  downloadSpeed: string;
  uploadSpeed: string;
  numActive: string;
  numWaiting: string;
  numStopped: string;
  numStoppedTotal: string;
}

/** JSON-RPC request payload */
export interface Aria2RpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: unknown[];
}

/** JSON-RPC response payload */
export interface Aria2RpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

/** Options for adding a download */
export interface Aria2AddOptions {
  dir?: string;
  out?: string;
  'max-download-limit'?: string;
  'max-upload-limit'?: string;
  'bt-tracker'?: string;
  header?: string[];
  referer?: string;
  'user-agent'?: string;
}

/** Parsed download info for UI display */
export interface DownloadInfo {
  gid: string;
  name: string;
  status: Aria2Status;
  progress: number;
  totalSize: number;
  completedSize: number;
  downloadSpeed: number;
  uploadSpeed: number;
  eta: number | null;
  dir: string;
  filePath: string | null; // Full path to the downloaded file
  isVideo: boolean;
  isTorrent: boolean;
  errorMessage?: string;
}

/** Result from yt-dlp extraction */
export interface YtDlpResult {
  url: string;
  filename: string;
  title: string;
<<<<<<< HEAD
  videoUrl?: string; // High quality video stream
  audioUrl?: string; // Separate audio stream
  isSplit?: boolean; // Whether it requires merging
=======
>>>>>>> e01fe274f037e4d2b7436718258fa898f80dc4b2
}

/** URL type detection result */
export type UrlType = 'magnet' | 'torrent' | 'youtube' | 'video' | 'generic';
