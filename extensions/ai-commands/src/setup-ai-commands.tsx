import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  Toast,
  showToast,
} from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import { configureLauncher, inspectLauncherSetup } from "./core/launcher-setup";
import { canRestartLauncher, restartLauncher } from "./core/launcher-restart";
import { plainTextMarkdown } from "./core/template";
import { errorMessage } from "./core/types";
import { prepareMainSearchEntries, repository } from "./vicinae";

type Setup = Awaited<ReturnType<typeof inspectLauncherSetup>>;

export default function SetupAICommands() {
  const [setup, setSetup] = useState<Setup>();
  const [entryError, setEntryError] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [restartable, setRestartable] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    setLoading(true);
    setError(undefined);
    setEntryError(undefined);
    void (async () => {
      try {
        const next = await inspectLauncherSetup();
        if (!active) return;
        setSetup(next);
        if (next.status === "restart" || next.status === "enabled") {
          try {
            await prepareMainSearchEntries(await repository.commands());
          } catch (failure) {
            if (active) setEntryError(errorMessage(failure));
          }
        }
        const restart =
          next.status === "restart" &&
          (await canRestartLauncher(next.launcher));
        if (active) setRestartable(restart);
      } catch (failure) {
        if (active) setError(errorMessage(failure));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [refresh]);

  async function enable() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(undefined);
    setEntryError(undefined);
    try {
      const next = await configureLauncher();
      if (mounted.current) setSetup(next);
      try {
        await prepareMainSearchEntries(await repository.commands());
      } catch (failure) {
        if (mounted.current) setEntryError(errorMessage(failure));
      }
      const restart =
        next.status === "restart" && (await canRestartLauncher(next.launcher));
      if (mounted.current) setRestartable(restart);
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }

  async function restart() {
    if (!setup || busy.current) return;
    busy.current = true;
    try {
      const current = await inspectLauncherSetup();
      if (current.status === "available" || current.status === "incomplete")
        throw new Error("Enable root search before restarting.");
      await showToast({
        style: Toast.Style.Animated,
        title: "Restarting Vicinae",
      });
      await restartLauncher(current.launcher);
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      busy.current = false;
    }
  }

  const message = error
    ? `Setup needs attention\n\n${error}\n\nYour commands remain available in AI Commands.`
    : loading
      ? "Checking root search setup…"
      : setup?.status === "incomplete"
        ? "Setup was interrupted\n\nSelect Resume Setup to finish using the saved backups. Your original launcher and settings are retained."
        : setup?.status === "enabled"
          ? "Root search is enabled\n\nFind your saved commands by name in Vicinae. New commands appear there automatically. Open Actions on a command to edit it."
          : setup?.status === "restart"
            ? `Restart Vicinae to finish\n\nYour saved commands are ready. ${restartable ? "Use Restart Vicinae below, then reopen the launcher." : "Quit and reopen Vicinae through your usual launcher, then open Setup AI Commands to verify."}`
            : "Add your commands to root search\n\nEach saved AI command will appear as a separate result in Vicinae, with an Edit action.\n\nEnable Root Search updates your user-owned Vicinae launcher and its application launch setting. Original files are backed up. Commands stay in a private directory outside normal application menus.\n\nVicinae needs one restart afterward. No terminal or source download is required.";

  return (
    <Detail
      navigationTitle="Setup AI Commands"
      markdown={plainTextMarkdown(
        message +
          (entryError
            ? `\n\nSome command entries need attention\n${entryError}\n\nYou can still restart Vicinae. Fix the affected entries, then use Check Again.`
            : ""),
      )}
      actions={
        <ActionPanel>
          {!loading &&
            !error &&
            (setup?.status === "available" ||
              setup?.status === "incomplete") && (
              <Action
                title={
                  setup?.status === "incomplete"
                    ? "Resume Setup"
                    : "Enable Root Search"
                }
                icon={Icon.Check}
                onAction={enable}
              />
            )}
          {!loading && !error && setup?.status === "restart" && restartable && (
            <Action
              title="Restart Vicinae"
              icon={Icon.ArrowClockwise}
              onAction={restart}
            />
          )}
          {!loading && (
            <Action
              title="Check Again"
              icon={Icon.ArrowClockwise}
              onAction={() => setRefresh((value) => value + 1)}
            />
          )}
          <Action.OpenInBrowser
            title="Setup Help"
            url="https://github.com/vdmkotai/vicinae-ai-commands/blob/main/docs/desktop-integration.md"
          />
        </ActionPanel>
      }
    />
  );
}
