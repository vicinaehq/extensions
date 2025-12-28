import { Color, Icon, List } from "@vicinae/api";
import { appNameForStream, type PactlSinkInput } from "../pactl";
import { speakerIconForPercentAndMute } from "../ui/audioIcons";
import { prettyValue } from "../ui/format";

export function PlaybackDetail(props: {
  sinkInput: PactlSinkInput;
  volumePercent?: number;
  sinkName?: string;
}) {
  const { sinkInput, volumePercent, sinkName } = props;

  const propsMap = sinkInput.properties ?? {};
  const importantKeys = [
    "application.name",
    "application.process.binary",
    "media.name",
  ].filter((k) => !!propsMap[k]);

  const title = appNameForStream(sinkInput);

  return (
    <List.Item.Detail
      markdown={`# ${title}`}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Status"
            icon={speakerIconForPercentAndMute(volumePercent, sinkInput.mute)}
            text={`${sinkInput.mute ? "Muted" : "Unmuted"}${
              typeof volumePercent === "number" ? ` · ${volumePercent}%` : ""
            }`}
          />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.TagList title="Quick tags">
            <List.Item.Detail.Metadata.TagList.Item
              color={sinkInput.mute ? Color.Red : Color.SecondaryText}
              icon={sinkInput.mute ? Icon.SpeakerOff : Icon.SpeakerOn}
              text={sinkInput.mute ? "Muted" : "Unmuted"}
            />
          </List.Item.Detail.Metadata.TagList>
          {sinkName ? (
            <List.Item.Detail.Metadata.Label
              title="Output Device"
              text={sinkName}
            />
          ) : null}
          {importantKeys.length ? (
            <>
              <List.Item.Detail.Metadata.Separator />
              {importantKeys.map((k) => (
                <List.Item.Detail.Metadata.Label
                  key={k}
                  title={k}
                  text={prettyValue(propsMap[k])}
                />
              ))}
            </>
          ) : null}
        </List.Item.Detail.Metadata>
      }
    />
  );
}
