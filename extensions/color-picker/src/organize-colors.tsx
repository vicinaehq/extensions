import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  closeMainWindow,
  confirmAlert,
  getPreferenceValues,
  Grid,
  Icon,
  Keyboard,
  List,
  showHUD,
  showToast,
  Toast,
} from "@vicinae/api";
import { useCallback, useState } from "react";
import CopyAsSubmenu from "./components/CopyAsSubmenu";
import { EditTitle } from "./components/EditTitle";
import { useColorsSelection } from "./hooks/useColorsSelection";
import { addToHistory, useHistory } from "./lib/history";
import type { HistoryItem, OrganizeColorsPreferences, SelectMode, UseColorsSelectionObject } from "./lib/types";
import { COPY_FORMATS, copySelectedColors, getFormattedColor, getIcon, getPreviewColor } from "./lib/utils";
import { pickScreenColor } from "./native/picker";

const EMPTY_VIEW_TITLE = "No colors picked yet ¯\\_(ツ)_/¯";
const EMPTY_VIEW_DESCRIPTION = "Use the Pick Color command or button below to pick some";

function getPreferences(): OrganizeColorsPreferences {
  try {
    return getPreferenceValues<OrganizeColorsPreferences>();
  } catch {
    return { primaryAction: "copy" };
  }
}

const PickColorAction = ({ onPicked }: { onPicked?: () => void }) => (
  <Action
    icon={Icon.EyeDropper}
    title="Pick Color"
    onAction={async () => {
      try {
        await closeMainWindow();
        const color = await pickScreenColor();
        if (color) {
          addToHistory(color);
          const formatted = getFormattedColor(color);
          await Clipboard.copy(formatted);
          await showHUD(`Copied color ${formatted} to clipboard`);
          onPicked?.();
        }
      } catch (e: any) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed picking color",
          message: e?.message,
        });
      }
    }}
  />
);

export default function Command() {
  const { history } = useHistory();
  const [selectMode, setSelectMode] = useState<SelectMode>("single");

  const getItemKey = useCallback((item: HistoryItem) => `${item.date}-${getFormattedColor(item.color)}`, []);
  const { selection } = useColorsSelection<HistoryItem>(history ?? [], getItemKey);
  const favoriteHistory = history?.filter((item) => item.isFavorite) ?? [];
  const regularHistory = history?.filter((item) => !item.isFavorite) ?? [];

  if (selectMode === "multi") {
    return (
      <List
        searchBarAccessory={
          <List.Dropdown
            tooltip="Switch Select Mode"
            value={selectMode}
            onChange={(v) => setSelectMode(v as SelectMode)}
          >
            <List.Dropdown.Item title="Single-Select Mode" value="single" />
            <List.Dropdown.Item title="Multi-Select Mode" value="multi" />
          </List.Dropdown>
        }
      >
        <List.EmptyView
          icon={Icon.EyeDropper}
          title={EMPTY_VIEW_TITLE}
          description={EMPTY_VIEW_DESCRIPTION}
          actions={
            <ActionPanel>
              <PickColorAction />
            </ActionPanel>
          }
        />
        <ListHistorySection title="Favorites" history={favoriteHistory} selectMode={selectMode} selection={selection} />
        <ListHistorySection title="History" history={regularHistory} selectMode={selectMode} selection={selection} />
      </List>
    );
  }

  return (
    <Grid
      searchBarAccessory={
        <Grid.Dropdown tooltip="Switch Select Mode" value={selectMode} onChange={(v) => setSelectMode(v as SelectMode)}>
          <Grid.Dropdown.Item title="Single-Select Mode" value="single" />
          <Grid.Dropdown.Item title="Multi-Select Mode" value="multi" />
        </Grid.Dropdown>
      }
    >
      <Grid.EmptyView
        icon={Icon.EyeDropper}
        title={EMPTY_VIEW_TITLE}
        description={EMPTY_VIEW_DESCRIPTION}
        actions={
          <ActionPanel>
            <PickColorAction />
          </ActionPanel>
        }
      />
      <GridHistorySection title="Favorites" history={favoriteHistory} selectMode={selectMode} selection={selection} />
      <GridHistorySection title="History" history={regularHistory} selectMode={selectMode} selection={selection} />
    </Grid>
  );
}

type HistorySectionProps = {
  title: string;
  history: HistoryItem[];
  selectMode: SelectMode;
  selection: UseColorsSelectionObject<HistoryItem>;
};

function GridHistorySection({ title, history, selectMode, selection }: HistorySectionProps) {
  if (history.length === 0) {
    return null;
  }

  return (
    <Grid.Section title={title} subtitle={String(history.length)}>
      {history.map((historyItem) => {
        const formattedColor = getFormattedColor(historyItem.color);
        const previewColor = getPreviewColor(historyItem.color);
        const color = { light: previewColor, dark: previewColor, adjustContrast: false };

        return (
          <Grid.Item
            key={`${title}-${historyItem.date}-${formattedColor}`}
            content={historyItem.title ? { value: { color }, tooltip: historyItem.title } : { color }}
            title={`${formattedColor} ${historyItem.title ?? ""}`}
            subtitle={new Date(historyItem.date).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            actions={<Actions historyItem={historyItem} selectMode={selectMode} selection={selection} />}
          />
        );
      })}
    </Grid.Section>
  );
}

function ListHistorySection({ title, history, selectMode, selection }: HistorySectionProps) {
  if (history.length === 0) {
    return null;
  }

  return (
    <List.Section title={title} subtitle={String(history.length)}>
      {history.map((historyItem) => {
        const formattedColor = getFormattedColor(historyItem.color);
        const previewColor = getPreviewColor(historyItem.color);
        const isSelected = selection.helpers.getIsItemSelected(historyItem);

        return (
          <List.Item
            key={`${title}-${historyItem.date}-${formattedColor}`}
            icon={getIcon(previewColor)}
            title={`${isSelected ? "✓ " : ""}${formattedColor}${historyItem.title ? ` ${historyItem.title}` : ""}`}
            subtitle={new Date(historyItem.date).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            actions={<Actions historyItem={historyItem} selectMode={selectMode} selection={selection} />}
          />
        );
      })}
    </List.Section>
  );
}

type ActionsProps = {
  historyItem: HistoryItem;
  selectMode: SelectMode;
  selection: UseColorsSelectionObject<HistoryItem>;
};

function Actions({ historyItem, selectMode, selection }: ActionsProps) {
  const { history, remove, clear, edit, addToFavorites, removeFromFavorites, moveFavorite } = useHistory();
  const preferences = getPreferences();

  const { toggleSelection, selectAll, clearSelection } = selection.actions;
  const { anySelected, allSelected, selectedItems, countSelected } = selection.selected;
  const isSelected = selection.helpers.getIsItemSelected(historyItem);

  const color = historyItem.color;
  const formattedColor = getFormattedColor(color);
  const favoriteHistory = history?.filter((item) => item.isFavorite) ?? [];
  const favoriteIndex = favoriteHistory.findIndex((item) => getFormattedColor(item.color) === formattedColor);
  const canMoveFavoriteUp = favoriteIndex > 0;
  const canMoveFavoriteDown = favoriteIndex !== -1 && favoriteIndex < favoriteHistory.length - 1;

  return (
    <ActionPanel>
      <ActionPanel.Section>
        {preferences.primaryAction === "copy" ? (
          <>
            <Action.CopyToClipboard content={formattedColor} />
            <Action.Paste content={formattedColor} />
          </>
        ) : (
          <>
            <Action.Paste content={formattedColor} />
            <Action.CopyToClipboard content={formattedColor} />
          </>
        )}
        <PickColorAction />
      </ActionPanel.Section>

      <ActionPanel.Section>
        {selectMode === "multi" ? (
          <>
            <Action
              icon={isSelected ? Icon.Circle : Icon.CheckCircle}
              title={isSelected ? "Deselect" : "Select"}
              onAction={() => toggleSelection(historyItem)}
            />
            {allSelected ? (
              <Action
                icon={Icon.Circle}
                title="Deselect All"
                shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
                onAction={clearSelection}
              />
            ) : (
              <Action
                icon={Icon.CheckCircle}
                title="Select All"
                shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
                onAction={selectAll}
              />
            )}
            {anySelected && (
              <ActionPanel.Submenu
                icon={Icon.Clipboard}
                title={`Copy ${countSelected} Selected Colors`}
                shortcut={Keyboard.Shortcut.Common.Copy}
              >
                {COPY_FORMATS.map(({ format, title, icon }) => (
                  <Action.CopyToClipboard
                    key={format}
                    icon={icon}
                    title={title}
                    content={copySelectedColors(selectedItems, format)}
                  />
                ))}
              </ActionPanel.Submenu>
            )}
          </>
        ) : (
          <CopyAsSubmenu color={color} />
        )}
        <Action.Push
          icon={Icon.Pencil}
          title="Edit Title"
          shortcut={{ modifiers: ["cmd"], key: "e" }}
          target={<EditTitle item={historyItem} onEdit={edit} />}
        />
        {historyItem.isFavorite ? (
          <>
            <Action
              icon={Icon.StarDisabled}
              title="Remove from Favorites"
              shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
              onAction={() => removeFromFavorites(color)}
            />
            {canMoveFavoriteUp && (
              <Action
                icon={Icon.ArrowUp}
                title="Move Up in Favorites"
                shortcut={{ modifiers: ["cmd", "opt"], key: "arrowUp" }}
                onAction={() => moveFavorite(color, "up")}
              />
            )}
            {canMoveFavoriteDown && (
              <Action
                icon={Icon.ArrowDown}
                title="Move Down in Favorites"
                shortcut={{ modifiers: ["cmd", "opt"], key: "arrowDown" }}
                onAction={() => moveFavorite(color, "down")}
              />
            )}
          </>
        ) : (
          <Action
            icon={Icon.Star}
            title="Add to Favorites"
            shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
            onAction={() => addToFavorites(color)}
          />
        )}
      </ActionPanel.Section>

      <ActionPanel.Section>
        <Action
          icon={Icon.Trash}
          title="Delete Color"
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["ctrl"], key: "x" }}
          onAction={async () => {
            const confirmed = await confirmAlert({
              title: "Delete Color",
              message: "Do you want to delete this color from history?",
              primaryAction: {
                title: "Delete",
                style: Alert.ActionStyle.Destructive,
              },
            });

            if (confirmed) {
              remove(historyItem.color);
              await showToast({ title: "Deleted color" });
            }
          }}
        />
        <Action
          icon={Icon.Trash}
          title="Delete All Colors"
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }}
          onAction={async () => {
            const confirmed = await confirmAlert({
              title: "Delete All Colors",
              message: "Do you want to delete all colors from your history?",
              primaryAction: {
                title: "Delete All",
                style: Alert.ActionStyle.Destructive,
              },
            });

            if (confirmed) {
              clear();
              await showToast({ title: "Deleted all colors" });
            }
          }}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}
