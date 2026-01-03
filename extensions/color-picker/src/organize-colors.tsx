import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  getFrontmostApplication,
  getPreferenceValues,
  Grid,
  Icon,
  Keyboard,
  launchCommand,
  LaunchType,
  showToast,
  Toast,
  Application,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import CopyAsSubmenu from "@/components/CopyAsSubmenu";
import { EditTitle } from "@/components/EditTitle";
import { useHistory } from "@/hooks/useHistory";
import { HistoryItem } from "@/types";
import { getFormattedColor, getPreviewColor } from "@/utils/color-formatter";

const preferences: Preferences.OrganizeColors = getPreferenceValues();

export default function Command() {
  const { history, remove, clear, edit } = useHistory();

  return (
    <Grid columns={5} aspectRatio="1">
      <Grid.EmptyView
        icon={Icon.EyeDropper}
        title="No colors picked yet"
        description="Use the Pick Color command to pick some"
        actions={
          <ActionPanel>
            <Action
              icon={Icon.EyeDropper}
              title="Pick Color"
              onAction={async () => {
                try {
                  await launchCommand({
                    name: "pick-color",
                    type: LaunchType.Background,
                  });
                } catch (e) {
                  await showToast({
                    style: Toast.Style.Failure,
                    title: "Failed to launch Pick Color",
                    message: String(e),
                  });
                }
              }}
            />
          </ActionPanel>
        }
      />
      {history?.map((historyItem) => {
        const formattedColor = getFormattedColor(historyItem.color);
        const previewColor = getPreviewColor(historyItem.color);
        const color = { light: previewColor, dark: previewColor, adjustContrast: false };

        return (
          <Grid.Item
            key={formattedColor}
            content={historyItem.title ? { value: { color }, tooltip: historyItem.title } : { color }}
            title={`${formattedColor} ${historyItem.title ?? ""}`}
            subtitle={new Date(historyItem.date).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            actions={<Actions historyItem={historyItem} remove={remove} clear={clear} edit={edit} />}
          />
        );
      })}
    </Grid>
  );
}

function Actions({
  historyItem,
  remove,
  clear,
  edit,
}: {
  historyItem: HistoryItem;
  remove: (color: any) => Promise<void>;
  clear: () => Promise<void>;
  edit: (item: HistoryItem) => Promise<void>;
}) {
  const [frontmostApp, setFrontmostApp] = useState<Application | undefined>(undefined);

  useEffect(() => {
    getFrontmostApplication()
      .then(setFrontmostApp)
      .catch(() => {
        // Silently ignore if window management is unavailable
      });
  }, []);

  const color = historyItem.color;
  const formattedColor = getFormattedColor(color);
  return (
    <ActionPanel>
      <ActionPanel.Section>
        {preferences.primaryAction === "copy" ? (
          <>
            <Action.CopyToClipboard content={formattedColor} />
            <Action.Paste
              title={`Paste to ${frontmostApp?.name || "Active App"}`}
              content={formattedColor}
              icon={frontmostApp ? { fileIcon: frontmostApp.path } : Icon.Clipboard}
            />
          </>
        ) : (
          <>
            <Action.Paste
              title={`Paste to ${frontmostApp?.name || "Active App"}`}
              content={formattedColor}
              icon={frontmostApp ? { fileIcon: frontmostApp.path } : Icon.Clipboard}
            />
            <Action.CopyToClipboard content={formattedColor} />
          </>
        )}
        <CopyAsSubmenu color={color} />
        <Action.Push
          target={<EditTitle item={historyItem} onEdit={edit} />}
          title="Edit Title"
          icon={Icon.Pencil}
          shortcut={Keyboard.Shortcut.Common.Edit}
        />
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
              message: "Do you want to delete the color from your history?",
              rememberUserChoice: true,
              primaryAction: {
                title: "Delete",
                style: Alert.ActionStyle.Destructive,
              },
            });

            if (confirmed) {
              await remove(historyItem.color);
              await showToast({ title: "Deleted color", style: Toast.Style.Success });
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
              await clear();
              await showToast({ title: "Deleted all colors", style: Toast.Style.Success });
            }
          }}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}
