import { Color, Icon, List } from "@vicinae/api";
import { prettyValue } from "../ui/format";
import { PactlStream } from "../pactl";
import { appNameForStream } from "../utils/appNameForStream";
import { micIconForMute, speakerIconForPercentAndMute } from "../ui/audioIcons";

export function StreamDetail(props: {
  stream: PactlStream;
  volumePercent?: number;
  sinkName?: string;
  kind: "sink" | "source";
}) {
  const { stream, volumePercent, sinkName, kind } = props;

  const title = appNameForStream(stream);

  const icon =
    kind === "sink"
      ? speakerIconForPercentAndMute(volumePercent, stream.mute)
      : micIconForMute(stream.mute);

  const typeLabel = kind === "sink" ? "Output" : "Input";

  return (
    <List.Item.Detail
      markdown={`# ${title}`}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Status"
            icon={icon}
            text={`${stream.mute ? "Muted" : "Unmuted"}${
              typeof volumePercent === "number" ? ` · ${volumePercent}%` : ""
            }`}
          />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.TagList title="Quick tags">
            <List.Item.Detail.Metadata.TagList.Item
              color={stream.mute ? Color.Red : Color.SecondaryText}
              icon={icon}
              text={stream.mute ? "Muted" : "Unmuted"}
            />
          </List.Item.Detail.Metadata.TagList>
          {sinkName ? (
            <List.Item.Detail.Metadata.Label
              title={`${typeLabel} Device`}
              text={sinkName}
            />
          ) : null}

          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label
            title="Application Name"
            text={prettyValue(stream.properties?.["application.name"])}
          />
          <List.Item.Detail.Metadata.Label
            title="Application Process Binary"
            text={prettyValue(
              stream.properties?.["application.process.binary"],
            )}
          />
          <List.Item.Detail.Metadata.Label
            title="Media Name"
            text={prettyValue(stream.properties?.["media.name"])}
          />
        </List.Item.Detail.Metadata>
      }
    />
  );
}
