import { PactlDevice } from "../pactl";

export function displayNameForDevice(d: PactlDevice): string {
  return (
    d.description ||
    d.properties?.["node.nick"] ||
    d.properties?.["device.description"] ||
    d.properties?.["node.name"] ||
    d.name
  ).toString();
}
