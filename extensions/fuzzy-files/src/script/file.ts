import { platform as os } from 'node:process';
import { execFileSync } from 'node:child_process';

const OS_CMD: Record<string, { cmd: string, args: string[] }> = Object.freeze({
  darwin: { cmd: "file", args: ["--mime-type", "-b"] },
  linux: { cmd: "file", args: ["--mime-type", "-b"] },
})

/** Get MIME type using file command */
export function getMimeTypeSync(filePath: string): string {
  if (!Object.keys(OS_CMD).includes(os)) throw new Error(`unsupported os: ${os}`)
  try {
    const output = execFileSync(OS_CMD[os].cmd,
      [...OS_CMD[os].args, filePath],
      // "piped",
      { encoding: 'utf8' }
    )
    return output.trim();
  } catch (err) {
    return 'unknown';
  }
}

