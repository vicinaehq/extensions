/*!
MIT License

Copyright (c) 2026 Image Pin contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { closeMainWindow, getPreferenceValues, showToast, Toast, PopToRootType } from "@vicinae/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

type Preferences = { helperPath?: string; language?: "system" | "en" | "ko" };

export function resolveHelperPath(value: string): string {
  const path = value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
  if (!isAbsolute(path)) throw new Error("Helper executable must be an absolute path or start with ~/.");
  return path;
}

export async function run(command: string) {
  const preferences = getPreferenceValues<Preferences>();
  try {
    const helper = resolveHelperPath(preferences.helperPath?.trim() || "~/.local/bin/image-pin");
    await closeMainWindow({ popToRootType: PopToRootType.Suspended });
    await promisify(execFile)(helper, [command, "--language", preferences.language || "system"], { timeout: 15000 });
  } catch (error) {
    const cause = error as NodeJS.ErrnoException;
    const message = cause.code === "ENOENT"
      ? "Run install.sh in the Image Pin repository, then check Helper executable in extension preferences."
      : cause.message || String(error);
    await showToast({ style: Toast.Style.Failure, title: "Could not start Image Pin", message });
  }
}
