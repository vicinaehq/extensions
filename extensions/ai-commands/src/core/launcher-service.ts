import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { serviceUsesLauncher, type ServiceRunner } from "./launcher-restart";

const execute = promisify(execFile);
export const runSystemctl: ServiceRunner = async (args) =>
  (await execute("systemctl", args, { timeout: 5000, maxBuffer: 64_000 }))
    .stdout;

// Deliberately do not replace ExecStart. The package continues to own the
// executable, arguments and unit. Unknown service commands need manual setup.
export async function packagedService(run = runSystemctl): Promise<string> {
  let output: string;
  try {
    output = await run([
      "--user",
      "show",
      "vicinae.service",
      "--property=ActiveState",
      "--property=ExecStart",
      "--property=EnvironmentFiles",
      "--property=UnsetEnvironment",
    ]);
  } catch {
    throw new Error(
      "Root search needs a supported user launcher or an active vicinae.service. Start Vicinae through its user service, then try again. AI Commands still works without root search.",
    );
  }
  if (
    /^EnvironmentFiles=.+/m.test(output) ||
    /^UnsetEnvironment=.*\bXDG_DATA_DIRS(?:=|\s|$)/m.test(output) ||
    (output.match(/\{ path=/g) ?? []).length !== 1
  )
    throw new Error(
      "The Vicinae service uses custom environment files or commands. Configure root search manually; existing service settings were not changed.",
    );
  const executable = output.match(/^ExecStart=\{ path=(.*?) ;/m)?.[1];
  if (
    !executable ||
    !/^(?:vicinae|\/(?:usr\/bin|usr\/local\/bin)\/vicinae)$/.test(executable) ||
    !serviceUsesLauncher(output, executable)
  ) {
    throw new Error(
      "No supported launcher or packaged Vicinae user service was found. Automatic service setup supports vicinae, /usr/bin/vicinae or /usr/local/bin/vicinae with 'server' or 'server --replace'. Custom services are left unchanged; use AI Commands without root search.",
    );
  }
  return executable;
}

export function serviceEnvironment(
  privateData: string,
  dataDirs: string | undefined,
): string {
  const dirs = (dataDirs || "/usr/local/share:/usr/share")
    .split(":")
    .filter((part) => part && part.replace(/\/$/, "") !== privateData);
  if (dirs.some((part) => !part.startsWith("/") || /[\r\n\0]/.test(part)))
    throw new Error(
      "XDG_DATA_DIRS contains an unsupported path; configure root search manually.",
    );
  return [privateData, ...dirs].join(":");
}

export function serviceDropIn(environment: string): string {
  // systemd expands % specifiers, but not shell $ substitutions in Environment.
  const escaped = environment
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/%/g, "%%");
  return `# Vicinae AI Commands managed service environment v1\n[Service]\nEnvironment="XDG_DATA_DIRS=${escaped}"\n`;
}
