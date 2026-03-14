import { PactlStream } from "../pactl";

export function appNameForStream(d: PactlStream): string {
  return (
    d.properties?.["application.name"] ||
    d.properties?.["application.process.binary"] ||
    d.properties?.["media.name"] ||
    d.properties?.["node.name"] ||
    d.description ||
    `Stream ${d.index}`
  );
}
