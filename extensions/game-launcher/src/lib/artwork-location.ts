import { environment } from "@vicinae/api";
import { join } from "node:path";
import { ArtworkCache } from "./artwork-cache";

export type ArtworkSource = "hires" | "local";

/** The artwork cache lives in this extension's Vicinae support directory. */
export function artworkCacheDir(): string {
  return join(environment.supportPath, "artwork");
}

export function openArtworkCache(source: ArtworkSource): ArtworkCache {
  return new ArtworkCache(artworkCacheDir(), { allowNetwork: source === "hires" });
}
