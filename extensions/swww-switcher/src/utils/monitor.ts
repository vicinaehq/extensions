import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface Monitor {
  id: number;
  name: string;
  description: string;
}

export async function getMonitors(): Promise<Monitor[]> {
  try {
    const { stdout } = await execAsync("hyprctl monitors -j");
    const monitors = JSON.parse(stdout);
    return monitors.map((m: any) => ({
      id: m.id,
      name: m.name,
      description: m.description || m.name,
    }));
  } catch (error) {
    console.error("Failed to get monitors:", error);
    return [];
  }
}
