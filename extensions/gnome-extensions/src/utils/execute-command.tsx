import { exec } from "child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function executeCommand(command: string): Promise<{ stdout: string; stderr: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { stdout: "", stderr: errorMessage, error: errorMessage };
  }
}
