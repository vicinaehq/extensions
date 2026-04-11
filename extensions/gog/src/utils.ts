import { useState, useCallback, useEffect } from "react";
import { exec } from "child_process";
import { promisify } from "util";
import { showToast, Toast } from "@vicinae/api";
import type { ApiCallOptions } from "./types";

const execAsync = promisify(exec);

export interface Account {
  email: string;
  client: string;
  scopes: string[];
  lastUsed: string;
  authType: string;
}

/**
 * Parse gog auth list output into Account objects
 */
function parseAuthList(output: string): Account[] {
  return output
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const [email, client, scopesStr, lastUsed, authType] = line.split("\t");
      return {
        email: email || "",
        client: client || "",
        scopes: scopesStr?.split(",") || [],
        lastUsed: lastUsed || "",
        authType: authType || "",
      };
    })
    .filter((acc) => acc.email);
}

/**
 * Hook to load authenticated Google accounts
 */
export function useGogAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAccounts() {
      try {
        const { stdout } = await execAsync("gog auth list --plain");
        setAccounts(parseAuthList(stdout));
      } catch (error) {
        console.error("Failed to load accounts:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadAccounts();
  }, []);

  return { accounts, isLoading };
}

/**
 * Check if a CLI tool is installed
 */
export async function checkCliToolInstalled(
  toolName: string,
): Promise<boolean> {
  try {
    await execAsync(`which ${toolName}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if gog CLI is installed and show appropriate error if not
 */
export async function ensureGogInstalled(): Promise<boolean> {
  const isInstalled = await checkCliToolInstalled("gog");
  if (!isInstalled) {
    showToast({
      title: "gog CLI not found",
      message: "Please install gog CLI from https://github.com/steipete/gogcli",
      style: Toast.Style.Failure,
    });
    return false;
  }
  return true;
}

/**
 * Execute a gog command and parse JSON output
 */
export async function executeGogCommand<T>(command: string): Promise<T> {
  const { stdout } = await execAsync(command);
  return JSON.parse(stdout) as T;
}

/**
 * Generic API call hook with consistent error handling and loading state
 */
export function useGogData<T>(
  command: string,
  options: ApiCallOptions = {},
  deps: unknown[] = [],
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!(await ensureGogInstalled())) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await executeGogCommand<T>(command);
      setData(result);
      if (options.successMessage) {
        showToast({ title: options.successMessage });
      }
    } catch (err) {
      console.error(err);
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      if (options.errorMessage) {
        showToast({ title: options.errorMessage, style: Toast.Style.Failure });
      }
    } finally {
      setIsLoading(false);
    }
  }, [command, ...deps]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, isLoading, error, reload: load };
}

/**
 * Hook for executing gog commands (non-query operations)
 */
export function useGogCommand(options: ApiCallOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (command: string) => {
      if (!(await ensureGogInstalled())) return false;

      setIsLoading(true);
      setError(null);

      try {
        await execAsync(command);
        if (options.successMessage) {
          showToast({ title: options.successMessage });
        }
        return true;
      } catch (err) {
        console.error(err);
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        if (options.errorMessage) {
          showToast({
            title: options.errorMessage,
            style: Toast.Style.Failure,
          });
        }
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [options.successMessage, options.errorMessage],
  );

  return { isLoading, error, execute };
}
