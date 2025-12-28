import { Icon } from "@vicinae/api";

export function speakerIconForPercentAndMute(percent: number | undefined, muted: boolean): Icon {
  if (muted) return Icon.SpeakerOff;
  if (percent === undefined) return Icon.SpeakerOn;
  if (percent <= 0) return Icon.SpeakerOff;
  if (percent < 45) return Icon.SpeakerLow;
  return Icon.SpeakerHigh;
}

export function micIconForMute(muted: boolean): Icon {
  return muted ? Icon.MicrophoneDisabled : Icon.Microphone;
}


