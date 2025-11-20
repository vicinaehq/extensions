import { execPromise } from "./exec";

export const getAllProfiles = async (): Promise<string[]> => {
	const { stdout } = await execPromise("powerprofilesctl list");

	/* the output from `list` is in not-so-usable format, so we need to parse it 
  example output:
```
  * performance:
    CpuDriver:  amd_pstate
    Degraded:   no

  balanced:
    CpuDriver:  amd_pstate
    PlatformDriver:     placeholder

  power-saver:
    CpuDriver:  amd_pstate
    PlatformDriver:     placeholder
```  
  */

	const uniq = new Set(
		stdout
			.split("\n\n")
			.map((chunk) =>
				chunk
					.split("\n")[0]
					.replace("*", "")
					.replace(":", "")
					.replace(" ", "")
					.trim(),
			)
			.filter((line) => line && line !== ""),
	);
	return Array.from(uniq);
};

export const changeProfile = async (
	profile: string,
	timeoutMs: number,
): Promise<"done" | "timeout"> => {
	return await Promise.race([
		execPromise(`powerprofilesctl set ${profile}`).then(() => "done" as const),
		new Promise((resolve) => setTimeout(resolve, timeoutMs)).then(
			() => "timeout" as const,
		),
	]);
};

export const getActiveProfile = async (): Promise<string> => {
	const { stdout } = await execPromise("powerprofilesctl get");
	return stdout.trim();
};
