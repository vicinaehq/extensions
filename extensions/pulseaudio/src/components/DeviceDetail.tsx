import { Color, Icon, List } from "@vicinae/api";
import { displayNameForDevice, type PactlDevice } from "../pactl";
import { micIconForMute, speakerIconForPercentAndMute } from "../ui/audioIcons";
import { prettyValue } from "../ui/format";

function buildDeviceMarkdown(args: {
  kind: "sink" | "source";
  device: PactlDevice;
  isDefault: boolean;
  volumePercent?: number;
}): string {
  const { device } = args;
  const lines: string[] = [];
  lines.push(`# ${displayNameForDevice(device)}`);
  return lines.join("\n");
}

export function DeviceDetail(props: {
  kind: "sink" | "source";
  device: PactlDevice;
  isDefault: boolean;
  volumePercent?: number;
}) {
  const { kind, device, isDefault, volumePercent } = props;

  const propsMap = device.properties ?? {};
  const importantKeys = [
    "media.class",
    "node.name",
    "node.nick",
    "device.description",
    "device.bus",
    "device.vendor.name",
    "device.product.name",
    "alsa.card_name",
    "alsa.long_card_name",
  ].filter((k) => !!propsMap[k]);

  return (
    <List.Item.Detail
      markdown={buildDeviceMarkdown({ kind, device, isDefault, volumePercent })}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Status"
            icon={
              kind === "sink"
                ? speakerIconForPercentAndMute(volumePercent, device.mute)
                : micIconForMute(device.mute)
            }
            text={`${device.mute ? "Muted" : "Unmuted"}${typeof volumePercent === "number" ? ` · ${volumePercent}%` : ""}`}
          />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.TagList title="Quick tags">
            <List.Item.Detail.Metadata.TagList.Item
              color={isDefault ? Color.Green : Color.SecondaryText}
              icon={isDefault ? Icon.CheckCircle : Icon.Circle}
              text={isDefault ? "Default" : "Not default"}
            />
            <List.Item.Detail.Metadata.TagList.Item
              color={device.mute ? Color.Red : Color.SecondaryText}
              icon={device.mute ? Icon.SpeakerOff : Icon.SpeakerOn}
              text={device.mute ? "Muted" : "Unmuted"}
            />
          </List.Item.Detail.Metadata.TagList>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Index" text={String(device.index)} />
          <List.Item.Detail.Metadata.Label title="Name" text={device.name} />
          {device.description ? <List.Item.Detail.Metadata.Label title="Description" text={device.description} /> : null}
          {importantKeys.length ? (
            <>
              <List.Item.Detail.Metadata.Separator />
              {importantKeys.slice(0, 6).map((k) => (
                <List.Item.Detail.Metadata.Label key={k} title={k} text={prettyValue(propsMap[k])} />
              ))}
            </>
          ) : null}
        </List.Item.Detail.Metadata>
      }
    />
  );
}


