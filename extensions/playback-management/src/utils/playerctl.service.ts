import { exec } from "child_process";
import * as util from "util";

const execAsync = util.promisify(exec);

export async function pause(): Promise<void> {
  await execAsync("playerctl pause");
}

export async function play(): Promise<void> {
  await execAsync("playerctl play");
}

export async function next(): Promise<void> {
  await execAsync("playerctl next");
}

export async function previous(): Promise<void> {
  await execAsync("playerctl previous");
}
