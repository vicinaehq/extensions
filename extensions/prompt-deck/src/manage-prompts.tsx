import {
  Action,
  ActionPanel,
  Alert,
  Color,
  Icon,
  List,
  confirmAlert,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { PromptDetail } from "./components/PromptDetail";
import { ShortcutForm } from "./components/ShortcutForm";
import { ShortcutRunner } from "./components/ShortcutRunner";
import { SHORTCUT_COPY_DEEPLINK, SHORTCUT_NEW, SHORTCUT_REMOVE } from "./lib/constants";
import { CONTEXT_SOURCE_LABELS } from "./lib/context";
import { showFailureToast } from "./lib/feedback";
import { buildPromptQuicklink, buildShortcutDeeplink } from "./lib/quicklink";
import { ShortcutRepository } from "./lib/storage";
import { searchText as normalizeSearchText, trimText } from "./lib/string";
import type { ContextSource, LlmShortcut } from "./lib/types";

const repository = new ShortcutRepository();
const CONTEXT_SOURCE_ICONS: Record<ContextSource, Icon> = {
  selectedText: Icon.Highlight,
  clipboardText: Icon.CopyClipboard,
};

export default function ManagePrompts() {
  const { push } = useNavigation();
  const [shortcuts, setShortcuts] = useState<LlmShortcut[]>([]);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function reload() {
    setIsLoading(true);
    try {
      setShortcuts(await repository.listShortcuts());
    } catch (error) {
      await showFailureToast("Failed to load prompts", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const filteredShortcuts = useMemo(() => {
    const query = normalizeSearchText(searchText);
    if (!query) {
      return shortcuts;
    }

    return shortcuts.filter((shortcut) =>
      [shortcut.name, shortcut.alias, shortcut.description].some((value) => normalizeSearchText(value).includes(query)),
    );
  }, [shortcuts, searchText]);

  function pushCreateForm(initialName?: string) {
    push(<ShortcutForm {...(initialName ? { initialName } : {})} onSaved={reload} />);
  }

  async function deleteShortcut(shortcut: LlmShortcut) {
    const confirmed = await confirmAlert({
      title: "Delete Prompt",
      message: `"${trimText(shortcut.name)}" will be deleted. History is kept unless cleared separately. If you created a Quicklink for it, remove it yourself in Vicinae's Manage Shortcuts — extensions cannot delete Quicklinks.`,
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });

    if (!confirmed) {
      return;
    }

    try {
      await repository.deleteShortcut(shortcut.id);
    } catch (error) {
      await showFailureToast("Failed to delete prompt", error);
      return;
    }

    await showToast({ style: Toast.Style.Success, title: "Prompt deleted", message: trimText(shortcut.name) });
    await reload();
  }

  const createAction = <Action title="Create Prompt" icon={Icon.Plus} shortcut={SHORTCUT_NEW} onAction={() => pushCreateForm()} />;

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      isShowingDetail={filteredShortcuts.length > 0}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search prompts..."
      actions={<ActionPanel>{createAction}</ActionPanel>}
    >
      {filteredShortcuts.length === 0 && !isLoading ? (
        <List.EmptyView
          title={shortcuts.length === 0 ? "No Prompts" : "No Matches"}
          description={
            shortcuts.length === 0 ? "Create your first prompt." : "Press Enter to create a prompt with this name."
          }
          icon={Icon.Stars}
          actions={
            <ActionPanel>
              {trimText(searchText) ? (
                <Action
                  title={`Create Prompt "${trimText(searchText)}"`}
                  icon={Icon.Plus}
                  onAction={() => pushCreateForm(trimText(searchText))}
                />
              ) : (
                createAction
              )}
            </ActionPanel>
          }
        />
      ) : null}

      {filteredShortcuts.map((shortcut) => (
        <List.Item
          key={shortcut.id}
          id={shortcut.id}
          title={shortcut.name}
          icon={Icon.Stars}
          accessories={[
            ...shortcut.contextSources.map((source) => ({
              icon: CONTEXT_SOURCE_ICONS[source],
              tooltip: `Sends ${CONTEXT_SOURCE_LABELS[source].toLowerCase()}`,
            })),
            trimText(shortcut.defaultCommand)
              ? { tag: { value: "auto", color: Color.Green }, tooltip: "Runs its default command immediately" }
              : { tag: { value: "asks", color: Color.Orange }, tooltip: "Asks for a command each run" },
          ]}
          detail={<PromptDetail shortcut={shortcut} />}
          actions={
            <ActionPanel>
              <Action title="Run Prompt" icon={Icon.Play} onAction={() => push(<ShortcutRunner shortcutId={shortcut.id} />)} />
              <Action.CreateQuicklink
                title="Create Quicklink"
                quicklink={buildPromptQuicklink(shortcut)}
              />
              <Action.Push title="Edit Prompt" icon={Icon.Pencil} target={<ShortcutForm shortcut={shortcut} onSaved={reload} />} />
              <Action.CopyToClipboard
                title="Copy Deeplink"
                icon={Icon.Link}
                content={buildShortcutDeeplink(shortcut)}
                shortcut={SHORTCUT_COPY_DEEPLINK}
              />
              <Action
                title="Delete Prompt"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={SHORTCUT_REMOVE}
                onAction={() => deleteShortcut(shortcut)}
              />
              {createAction}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
