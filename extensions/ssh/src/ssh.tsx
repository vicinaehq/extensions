import React, { useState, useMemo, useEffect } from "react";
import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  getPreferenceValues,
  runInTerminal,
  Cache,
  closeMainWindow,
} from "@vicinae/api";

import Fuse from "fuse.js";

const cache = new Cache();

export default function ControlledList() {
  const { terminal } = getPreferenceValues();
  const cached = cache.get("visited");
  const hostsVisited = cached ? JSON.parse(cached) : [];

  // search is explicitly controlled by state
  const [searchText, setSearchText] = useState("");
  const [hosts, setHosts] = useState<{ host: string; subtitle: string }[]>([]);

  useEffect(() => {
    getSshHostsFromConfig().then((configHosts) => {
      // hostsVisited is a list of strings
      const historyHosts = hostsVisited.map((h) => ({
        host: h,
        subtitle: "from history",
      }));
      // Avoid duplicates: filter out history hosts that are already in configHosts
      const configHostNames = new Set(configHosts.map((h) => h.host));
      const uniqueHistoryHosts = historyHosts.filter(
        (h) => !configHostNames.has(h.host),
      );
      setHosts([...uniqueHistoryHosts, ...configHosts]);
    });
  }, []);

  // Fuzzy search using Fuse.js
  const filteredList = useMemo(() => {
    const trimmedQuery = searchText.trim();
    if (!trimmedQuery) {
      // If search is empty, show all hosts
      return hosts.map((item) => ({ item }));
    }
    const fuse = new Fuse(hosts, {
      keys: ["host"],
      includeScore: true,
      threshold: 0.4,
    });
    return fuse.search(trimmedQuery);
  }, [hosts, searchText]);

  const filteredHosts = useMemo(() => {
    const filtered = filteredList.map((it) => {
      // Fuse returns {item, ...}, direct mapping for empty search, otherwise item is inside result
      const hostObj = it.item;
      return {
        title: `ssh \"${hostObj.host}\"`,
        host: hostObj.host,
        subtitle: hostObj.subtitle,
      };
    });
    const trimmedQuery = searchText.trim();
    if (trimmedQuery !== "") {
      filtered.push({
        title: `ssh ${trimmedQuery}`,
        host: trimmedQuery,
        subtitle: "fallback",
      });
    }
    return filtered;
  }, [filteredList, searchText]);

  return (
    <List
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder={"Search hosts..."}
    >
      <List.Section title={"Hosts"}>
        {filteredHosts.map((host) => (
          <List.Item
            key={host.host}
            title={host.title}
            subtitle={host.subtitle}
            icon={Icon.Terminal}
            actions={
              <ActionPanel>
                <Action
                  title="Open"
                  icon={Icon.Cog}
                  onAction={() => {
                    showToast({ title: `Running ssh ${host.host}` });
                    // Add to cache if not already present
                    if (!hostsVisited.includes(host.host)) {
                      const updated = [host.host, ...hostsVisited];
                      cache.set("visited", JSON.stringify(updated));
                    }
                    if (terminal != "") {
                      executeCommand(`${terminal} ${host.host}`);
                    } else {
                      runInTerminal(["ssh", host.host]);
                    }
                    closeMainWindow();
                  }}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

import fs from "fs";
import os from "os";

/**
 * Reads ~/.ssh/config and returns a Promise of host names defined there.
 */
export async function getSshHostsFromConfig(): Promise<string[]> {
  const sshConfigPath = `${os.homedir()}/.ssh/config`;
  try {
    const content = await fs.promises.readFile(sshConfigPath, "utf8");
    const lines = content.split("\n");
    const hosts: { host: string; subtitle: string }[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("Host ")) {
        const hostnames = trimmed.slice(5).trim().split(/\s+/);
        for (const h of hostnames) {
          if (h !== "*" && h.length > 0) {
            hosts.push({ host: h, subtitle: "from .ssh/config" });
          }
        }
      }
    }
    return hosts;
  } catch (err) {
    // File not found or unreadable
    return [];
  }
}

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { showToast } from "@vicinae/api";

const execAsync = promisify(exec);

export interface ExecOptions {
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

/**
 * Execute a shell command with proper error handling
 */
export async function executeCommand(
  command: string,
  options: ExecOptions = {},
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: options.timeout || 30000, // 30 second default timeout
      cwd: options.cwd,
      env: options.env,
    });

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown command error";

    return {
      success: false,
      stdout: "",
      stderr: errorMessage,
      error: errorMessage,
    };
  }
}
