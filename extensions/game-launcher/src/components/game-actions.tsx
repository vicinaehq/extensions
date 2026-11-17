import {
  Action,
  ActionPanel,
  closeMainWindow,
  Icon,
  open,
  openCommandPreferences,
  showHUD,
  showToast,
  Toast,
} from "@vicinae/api";
import { type Game, LAUNCHER_NAMES } from "../lib/games";

async function launch(game: Game): Promise<void> {
  try {
    await open(game.launchUri);
    await showHUD(`Launching ${game.title}`, { clearRootSearch: true });
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: `Couldn't launch ${game.title}`,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

async function openSteamUri(uri: string): Promise<void> {
  try {
    await open(uri);
    await closeMainWindow({ clearRootSearch: true });
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Couldn't open Steam",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Opens the settings page. Vicinae currently shows extension-wide (Steam) and
 * command (display) preferences on the same page for either API call.
 */
export function SettingsAction() {
  return (
    <Action title="Settings" icon={Icon.Cog} shortcut={{ modifiers: ["ctrl"], key: "," }} onAction={openCommandPreferences} />
  );
}

/** Opens the Launcher Priority view (only offered when several launchers are enabled). */
export function LauncherPriorityAction(props: { view?: React.ReactNode }) {
  return props.view ? <Action.Push title="Launcher Priority…" icon={Icon.AppWindowList} target={props.view} /> : null;
}

export function SettingsActions(props: { onClearCache: () => void; priorityView?: React.ReactNode }) {
  return (
    <>
      <SettingsAction />
      <LauncherPriorityAction view={props.priorityView} />
      <Action title="Clear Artwork Cache…" icon={Icon.Trash} style={Action.Style.Destructive} onAction={props.onClearCache} />
    </>
  );
}

export function GameActions(props: {
  game: Game;
  isHidden: boolean;
  onToggleHidden: (game: Game) => void;
  /** Settings section (Settings, Launcher Priority, Clear Artwork Cache), rendered by the command. */
  settingsActions: React.ReactNode;
  /** Extra actions for the current layout (e.g. toggling the detail pane). */
  layoutActions?: React.ReactNode;
}) {
  const { game, isHidden, onToggleHidden, settingsActions, layoutActions } = props;
  const appid = game.steam?.appid;
  const alternates = game.alternates ?? [];
  return (
    <ActionPanel title={game.title}>
      <ActionPanel.Section>
        <Action
          title={alternates.length ? `Launch with ${LAUNCHER_NAMES[game.source]}` : "Launch Game"}
          icon={Icon.Play}
          onAction={() => launch(game)}
        />
        {alternates.map((copy, i) => (
          <Action
            key={copy.id}
            title={`Launch with ${LAUNCHER_NAMES[copy.source]}`}
            icon={Icon.Play}
            shortcut={i === 0 ? { modifiers: ["ctrl"], key: "return" } : undefined}
            onAction={() => launch(copy)}
          />
        ))}
        {appid !== undefined && (
          <Action
            title="Show in Steam Library"
            icon={Icon.GameController}
            shortcut={{ modifiers: ["ctrl"], key: "l" }}
            onAction={() => openSteamUri(`steam://nav/games/details/${appid}`)}
          />
        )}
        {game.installDir && (
          <Action.ShowInFinder title="Open Install Folder" path={game.installDir} shortcut={{ modifiers: ["ctrl"], key: "o" }} />
        )}
      </ActionPanel.Section>
      {appid !== undefined && (
        <ActionPanel.Section title="Steam">
          <Action
            title="Open Store Page"
            icon={Icon.Store}
            shortcut={{ modifiers: ["ctrl"], key: "s" }}
            onAction={() => openSteamUri(`steam://store/${appid}`)}
          />
          <Action.OpenInBrowser
            title="View on ProtonDB"
            icon={Icon.Gauge}
            url={`https://www.protondb.com/app/${appid}`}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "d" }}
          />
          <Action.CopyToClipboard
            title="Copy App ID"
            content={String(appid)}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "c" }}
          />
        </ActionPanel.Section>
      )}
      <ActionPanel.Section>
        {layoutActions}
        <Action
          title={isHidden ? "Unhide Game" : "Hide Game"}
          icon={isHidden ? Icon.Eye : Icon.EyeDisabled}
          shortcut={{ modifiers: ["ctrl"], key: "h" }}
          onAction={() => onToggleHidden(game)}
        />
        {settingsActions}
      </ActionPanel.Section>
    </ActionPanel>
  );
}
