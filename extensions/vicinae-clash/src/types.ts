export type Backend = {
  id: string;
  name: string;
  url: string;
  secret: string;
};

export type Traffic = { up: number; down: number };

export type ConnectionMetadata = {
  network?: string;
  type?: string;
  sourceIP?: string;
  destinationIP?: string;
  sourcePort?: string;
  destinationPort?: string;
  host?: string;
  dnsMode?: string;
};

export type Connection = {
  id: string;
  metadata: ConnectionMetadata;
  upload: number;
  download: number;
  start: string;
  chains: string[];
  rule: string;
  rulePayload: string;
};

export type Connections = {
  downloadTotal: number;
  uploadTotal: number;
  memory?: number;
  connections: Connection[];
};

export type LogLevel = "debug" | "info" | "warning" | "error";
export type LogEntry = { type: LogLevel; payload: string; time: string };

export type ClashProxy = {
  name: string;
  history?: Array<{ time: string; delay: number }>;
  all?: string[];
  now?: string;
  type: string;
  alive?: boolean;
  udp?: boolean;
  "provider-name"?: string;
};

export type RuleStats = {
  disabled: boolean;
  hitCount: number;
  hitAt: string;
  missCount: number;
  missAt: string;
};

export type Rule = {
  index: number;
  type: string;
  payload: string;
  proxy: string;
  size: number;
  extra?: RuleStats;
};
export type Mode = "rule" | "global" | "direct" | "script";
export type Config = {
  mode: Mode;
  "allow-lan"?: boolean;
  ipv6?: boolean;
  tun?: { enable?: boolean };
  port?: number;
  "socks-port"?: number;
  "mixed-port"?: number;
  "redir-port"?: number;
  "tproxy-port"?: number;
  [key: string]: unknown;
};

export type Version = { meta: boolean; version: string };
