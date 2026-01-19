import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync, writeFileSync as writeFile, mkdirSync, statSync, readdirSync } from "fs";
import { spawn } from "child_process";
import { dirname, join, basename } from "path";
import { homedir } from "os";
import { closeMainWindow } from "@vicinae/api";

export const getPidFile = () => join(homedir(), ".cache", "vicinae", "recording.pid");
export const getOutputFilePath = () => join(homedir(), ".cache", "vicinae", "recording.path");

export interface Recording {
  id: string;
  path: string;
  timestamp: Date;
  duration?: number;
  size?: number;
}

function isProcessRunning(pid: number): boolean {
  // Use ps to check if process exists
  execSync(`ps -p ${pid} -o pid=`, { stdio: "ignore" });
  return true;
}

function cleanupFiles(pidFile: string, outputFilePath: string) {
  if (existsSync(pidFile)) unlinkSync(pidFile);
  if (existsSync(outputFilePath)) unlinkSync(outputFilePath);
}

export async function getRecordings(): Promise<Recording[]> {
  const outputDir = join(homedir(), "Videos", "Screen Recordings");
  try {
    const files = readdirSync(outputDir).filter(file => file.endsWith('.mp4'));
    const recordings: Recording[] = files.map(file => {
      const path = join(outputDir, file);
      const stats = statSync(path);
      return {
        id: path,
        path,
        timestamp: new Date(stats.birthtime),
        size: stats.size,
      };
    }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // Sort by timestamp descending
    return recordings;
  } catch (error) {
    return [];
  }
}

export async function removeRecording(path: string): Promise<void> {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

export function getRecordingStatus(): { isRecording: boolean; outputPath?: string } {
  const pidFile = getPidFile();
  if (existsSync(pidFile)) {
    try {
      const pid = parseInt(readFileSync(pidFile, "utf-8").trim());
      if (isProcessRunning(pid)) {
        const pathFile = getOutputFilePath();
        if (existsSync(pathFile)) {
          const data = JSON.parse(readFileSync(pathFile, "utf-8"));
          return { 
            isRecording: true, 
            outputPath: data.path 
          };
        }
      }
    } catch (error) {
      // Process not running or other error, clean up
      cleanupFiles(pidFile, getOutputFilePath());
    }
  }

  return { isRecording: false };
}

export async function toggleRecording(type: string, withAudio: boolean) {
  const pidFile = getPidFile();
  const pathFile = getOutputFilePath();

  if (existsSync(pidFile)) {
    // Stop recording
    const pid = parseInt(readFileSync(pidFile, "utf-8").trim());
    let processKilled = false;
    let savedPath = "";

    // Try to kill the process
    try {
      if (isProcessRunning(pid)) {
        execSync(`kill ${pid}`);
        processKilled = true;
      }
    } catch (error) {
      // Kill failed, but check if file was still saved
    }

    // Read saved metadata before cleanup
    try {
      if (existsSync(pathFile)) {
        const data = JSON.parse(readFileSync(pathFile, "utf-8"));
        savedPath = data.path;
        withAudio = data.withAudio;
      }
    } catch (error) {
      // Can't read metadata file
    }

    // Clean up files (ignore errors)
    try {
      if (existsSync(pidFile)) unlinkSync(pidFile);
    } catch (error) {
      // Ignore cleanup errors
    }
    try {
      if (existsSync(pathFile)) unlinkSync(pathFile);
    } catch (error) {
      // Ignore cleanup errors
    }

    // If we have a saved file, consider it successful
    if (savedPath && existsSync(savedPath)) {
      return savedPath;
    }

    // If process was killed but no file, something went wrong
    if (processKilled) {
      throw new Error("Recording stopped but file not found");
    }

    // Process was already stopped
    return "";
  } else {
    // Start recording
    const result = execSync("wf-recorder --list-output", { encoding: "utf-8" });
    const lines = result.trim().split("\n");
    const outputs: { id: string; name: string; description: string }[] = lines.map(line => {
      const match = line.match(/^(\d+)\.\s+Name:\s+(.+)\s+Description:\s+(.+)$/);
      if (match) {
        return { id: match[1], name: match[2], description: match[3] };
      }
      return null;
    }).filter(Boolean) as { id: string; name: string; description: string }[];

    let output: { id: string; name: string; description: string };
    if (outputs.length === 0) {
      throw new Error("No outputs found");
    } else {
      output = outputs[0]; // Use first output
    }

    // Create output directory
    const outputDir = join(homedir(), "Videos", "Screen Recordings");
    mkdirSync(outputDir, { recursive: true });

    // Generate timestamped filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const outputFile = join(outputDir, `${timestamp}.mp4`);

    const args = ["-o", output.name];
    if (withAudio) args.push("-a");
    args.push("-f", outputFile);

    const child = spawn("wf-recorder", args, {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    const pid = child.pid!;
    mkdirSync(dirname(pidFile), { recursive: true });
    writeFileSync(pidFile, pid.toString());
    writeFileSync(pathFile, JSON.stringify({ path: outputFile, withAudio }));

    return outputFile;
  }
}