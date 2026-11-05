import { MPC } from 'mpc-js';

export type MpdConfig =
  | { kind: 'tcp'; host: string; port: number }
  | { kind: 'unix'; path: string };

export function resolveConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): MpdConfig {
  const host = env.MPD_HOST;
  if (host && (host.startsWith('/') || host.startsWith('~'))) {
    return { kind: 'unix', path: host };
  }
  const portRaw = env.MPD_PORT;
  const port = portRaw && /^\d+$/.test(portRaw) ? Number(portRaw) : 6600;
  return {
    kind: 'tcp',
    host: host && host.length > 0 ? host : 'localhost',
    port,
  };
}

export async function withClient<T>(fn: (mpc: MPC) => Promise<T>): Promise<T> {
  const cfg = resolveConfig(process.env);
  const mpc = new MPC();
  if (cfg.kind === 'tcp') {
    await mpc.connectTCP(cfg.host, cfg.port);
  } else {
    const expanded = cfg.path.startsWith('~/')
      ? `${process.env.HOME ?? ''}${cfg.path.slice(1)}`
      : cfg.path;
    await mpc.connectUnixSocket(expanded);
  }
  try {
    return await fn(mpc);
  } finally {
    try {
      mpc.disconnect();
    } catch {
      /* ignore */
    }
  }
}
