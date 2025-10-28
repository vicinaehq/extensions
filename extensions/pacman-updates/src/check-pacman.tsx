import {
  Action,
  ActionPanel,
  Color,
  List,
  Toast,
  showToast,
  popToRoot,
  Icon,
  getPreferenceValues,
} from "@vicinae/api";
import React, { useEffect, useState, useMemo } from "react";
import { exec } from "child_process";
import util from "util";
import {
  Pkg,
  fetchCheckupdates,
  scriptIsExecutable,
  toggleVicinae,
} from "./utils/pacman";

const execp = util.promisify(exec);

function pad(str: string, len: number) {
  if (str.length >= len) return str;
  return str + " ".repeat(len - str.length);
}

export default function Command() {
  const [pkgs, setPkgs] = useState<Pkg[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scriptIsPresent, setScriptIsPresent] = useState(false);
  const scriptPath: string = getPreferenceValues().scriptPath;
  const bashTerminal: string = getPreferenceValues().bashTerminal;

  useEffect(() => {
    scriptIsExecutable(scriptPath).then((ok) => {
      console.log("script result:", ok);
      setScriptIsPresent(ok);
    });

    fetchCheckupdates()
      .then(setPkgs)
      .catch((e) => setError(String(e)));
  }, []);

  const isLoading = pkgs === null && !error;
  const count = pkgs?.length ?? 0;

  const { nameW, curW, curA } = useMemo(() => {
    const items = pkgs ?? [];
    const nameW = Math.min(40, Math.max(4, ...items.map((p) => p.name.length)));
    const curW = Math.min(
      24,
      Math.max(3, ...items.map((p) => p.current.length)),
    );
    const curA = Math.min(
      24,
      Math.max(3, ...items.map((p) => p.available.length)),
    );
    return { nameW, curW, curA };
  }, [pkgs]);

  return (
    <List searchBarPlaceholder="Search packages..." isLoading={isLoading}>
      {error ? (
        <List.EmptyView
          title="Error running checkupdates"
          description={
            error.includes("command not found")
              ? "Install pacman-contrib (checkupdates) first."
              : error
          }
        />
      ) : pkgs && pkgs.length === 0 ? (
        <List.EmptyView title="All packages are up to date" />
      ) : (
        <List.Section
          title={`Updates: ${count} packages`}
          subtitle={pkgs ? `${pkgs.length}` : undefined}
        >
          {(pkgs ?? []).map((p) => {
            const aligned = `${pad(p.name, nameW)}`;
            return (
              <List.Item
                key={p.name}
                title={p.name}
                accessories={[
                  { tag: { value: pad(p.current, curW), color: Color.Blue } },
                  { tag: { value: "=>" } },
                  {
                    tag: { value: pad(p.available, curA), color: Color.Green },
                  },
                ]}
                actions={
                  <ActionPanel>
                    <Action.CopyToClipboard
                      title={`Copy Cmd to update ${p.name}`}
                      content={`sudo pacman -S ${p.name}`}
                    />
                    {scriptIsPresent && bashTerminal && (
                      <Action
                        title={`Call script with ${bashTerminal}`}
                        icon={Icon.Terminal}
                        onAction={async () => {
                          try {
                            exec(
                              `bash -lc "${bashTerminal} -e '${scriptPath}'"`,
                            );
                            toggleVicinae();
                          } catch (e: any) {
                            showToast({
                              style: Toast.Style.Failure,
                              title: "ERROR: Check script",
                              message:
                                "Make sure your script is executable and in your PATH.",
                            });
                          }
                        }}
                      />
                    )}
                    <Action.CopyToClipboard
                      title="Copy Cmd to update all packages"
                      content={`sudo pacman -Syu`}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
