import { PactlDevice } from "../pactl";

export function isAudioSource(d: PactlDevice): boolean {
  return d.properties?.["media.class"] === "Audio/Source";
}
