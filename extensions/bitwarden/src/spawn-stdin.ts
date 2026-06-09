import { spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';

export function spawnWait(
  bin: string,
  args: string[],
  data: string,
  opts?: Omit<SpawnOptions, 'stdio'>,
): Promise<void> {
  const proc = spawn(bin, args, {
    ...opts,
    stdio: ['pipe', 'ignore', 'ignore'],
  });

  return new Promise<void>((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited with code ${code}`));
    });

    if (!proc.stdin) {
      reject(new Error('stdin is not available'));
      return;
    }
    proc.stdin.on('error', reject);
    proc.stdin.write(data);
    proc.stdin.end();
  });
}
