import { Action, ActionPanel, Color, Icon, List, showToast, Toast } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import { getConfig, setMode } from "../lib/clash-api";
import { titleCase } from "../lib/format";
import { showError } from "../lib/toast";
import type { Mode as ModeValue } from "../types";

const MODES: ModeValue[] = ["rule", "global", "direct", "script"];

export default function Mode() {
  const [current, setCurrent] = useState<ModeValue>();
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setCurrent((await getConfig()).mode);
    } catch (error) {
      await showError("Could Not Load Clash Mode", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  async function choose(mode: ModeValue) {
    setIsLoading(true);
    try {
      await setMode(mode);
      setCurrent(mode);
      await showToast({ style: Toast.Style.Success, title: "Clash Mode Changed", message: titleCase(mode) });
    } catch (error) {
      await showError("Could Not Change Clash Mode", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search modes...">
      {MODES.map((mode) => (
        <List.Item
          key={mode}
          icon={{
            source: mode === current ? Icon.CheckCircle : Icon.Circle,
            tintColor: mode === current ? Color.Green : undefined,
          }}
          title={titleCase(mode)}
          actions={
            <ActionPanel>
              <Action title="Select Mode" icon={Icon.Check} onAction={() => void choose(mode)} />
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={() => void load()} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
