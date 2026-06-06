import { runInTerminal } from "@vicinae/api";
import { brewBin, type Preferences } from "./lib";

export async function spawnInTerminal(args: string[], preferences?: Preferences): Promise<void> {
  await runInTerminal([brewBin(preferences), ...args], { hold: true });
}
