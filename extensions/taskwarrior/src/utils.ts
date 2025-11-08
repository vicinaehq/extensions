import { Icon, Color } from "@vicinae/api";
import { Task } from "./types";

export async function runTaskCommand(command: string): Promise<string> {
  const { exec } = require("child_process");

  return new Promise((resolve, reject) => {
    exec(`task ${command}`, (error: any, stdout: string, stderr: string) => {
      if (error) {
        reject(
          new Error(`Taskwarrior command failed: ${stderr || error.message}`),
        );
      } else {
        resolve(stdout);
      }
    });
  });
}

export function parseTaskwarriorDate(dateString: string): Date | null {
  // Taskwarrior exports dates in format like "20251025T220000Z"
  // Convert to ISO format: "2025-10-25T22:00:00Z"
  if (!dateString || dateString.length !== 16) return null;

  const year = dateString.slice(0, 4);
  const month = dateString.slice(4, 6);
  const day = dateString.slice(6, 8);
  const hour = dateString.slice(9, 11);
  const minute = dateString.slice(11, 13);
  const second = dateString.slice(13, 15);
  const timezone = dateString.slice(15);

  const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}${timezone}`;
  const date = new Date(isoString);

  return isNaN(date.getTime()) ? null : date;
}

export function formatDate(dateString?: string): string {
  if (!dateString) return "";

  const date = parseTaskwarriorDate(dateString);
  if (!date) return "Invalid date";

  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 0) return `In ${diffDays} days`;
  return `${Math.abs(diffDays)} days ago`;
}

export function getPriorityIcon(
  priority?: string,
): Icon | { source: Icon; tintColor: Color } {
  switch (priority?.toUpperCase()) {
    case "H":
      return { source: Icon.Exclamationmark2, tintColor: Color.Red };
    case "M":
      return { source: Icon.ExclamationMark, tintColor: Color.Orange };
    case "L":
      return { source: Icon.Dot, tintColor: Color.Blue };
    default:
      return Icon.Circle;
  }
}
