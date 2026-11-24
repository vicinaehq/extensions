import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  List,
  Toast,
  environment,
  getPreferenceValues,
  openExtensionPreferences,
  showToast,
  Form,
  LocalStorage,
} from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import * as fs from "node:fs";
import * as path from "node:path";
import * as https from "node:https";
import * as http from "node:http";
import * as url from "node:url";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Preferences {
  provider?: "klipy" | "giphy";
  klipyApiKey?: string;
  giphyApiKey?: string;
  previewQuality?: "low" | "medium" | "high";
}

interface UnifiedGif {
  id: string; // e.g. "klipy_123" or "giphy_abc"
  title: string;
  previewStillUrl?: string;
  previewAnimatedUrl?: string;
  copyUrl?: string;
}

// ─── Klipy Specific Types ─────────────────────────────────────────────────────

interface KlipyMediaFormat {
  url: string;
  width: number;
  height: number;
  size?: number;
}

interface KlipyMediaTier {
  gif?: KlipyMediaFormat;
  webp?: KlipyMediaFormat;
  jpg?: KlipyMediaFormat;
  mp4?: KlipyMediaFormat;
  webm?: KlipyMediaFormat;
}

interface KlipyGif {
  id: number | string;
  title: string;
  slug?: string;
  type?: string;
  blur_preview?: string;
  file: {
    hd?: KlipyMediaTier;
    md?: KlipyMediaTier;
    sm?: KlipyMediaTier;
    xs?: KlipyMediaTier;
  };
}

// ─── Giphy Specific Types ─────────────────────────────────────────────────────

interface GiphyMediaFormat {
  url?: string;
  width?: string;
  height?: string;
  size?: string;
}

interface GiphyGif {
  id: string;
  title: string;
  slug?: string;
  type?: string;
  images: {
    original?: GiphyMediaFormat;
    downsized?: GiphyMediaFormat;
    fixed_width?: GiphyMediaFormat;
    fixed_width_still?: GiphyMediaFormat;
    preview_gif?: GiphyMediaFormat;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadFile(fileUrl: string, dest: string, redirects = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error("Too many redirects"));
      return;
    }

    const parsedUrl = url.parse(fileUrl);
    const protocol = parsedUrl.protocol === "https:" ? https : http;
    const file = fs.createWriteStream(dest);

    const request = protocol.get(fileUrl, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        file.close();
        fs.unlink(dest, () => {});
        downloadFile(response.headers.location, dest, redirects + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    });

    request.on("error", (err) => { file.close(); fs.unlink(dest, () => {}); reject(err); });
    file.on("error", (err) => { file.close(); fs.unlink(dest, () => {}); reject(err); });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function klipyFetch(apiKey: string, endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams({ limit: "24", ...params }).toString();
  const fullUrl = `https://api.klipy.com/api/v1/${encodeURIComponent(apiKey)}/${endpoint}?${qs}`;

  return new Promise((resolve, reject) => {
    https.get(fullUrl, (res) => {
      let raw = "";
      res.on("data", (chunk: string) => (raw += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse Klipy response (HTTP ${res.statusCode}): ${raw.slice(0, 300)}`));
        }
      });
    }).on("error", reject);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGifArray(response: any): KlipyGif[] {
  // Try every plausible shape the Klipy API might return
  const candidates = [
    response?.data,                 // { data: [...] }
    response?.data?.data,           // { data: { data: [...] } }
    response?.data?.list,           // { data: { list: [...] } }
    response?.data?.gifs,           // { data: { gifs: [...] } }
    response?.data?.items,          // { data: { items: [...] } }
    response?.results,              // { results: [...] }
    response?.gifs,                 // { gifs: [...] }
    response?.list,                 // { list: [...] }
    response?.items,                // { items: [...] }
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length >= 0) {
      return candidate as KlipyGif[];
    }
  }
  return [];
}

async function fetchKlipy(query: string, apiKey: string): Promise<KlipyGif[]> {
  const endpoint = query.trim() ? "gifs/search" : "gifs/trending";
  const params: Record<string, string> = query.trim() ? { q: query } : {};
  const response = await klipyFetch(apiKey, endpoint, params);
  return extractGifArray(response);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function giphyFetch(apiKey: string, endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams({ limit: "24", ...params }).toString();
  const fullUrl = `https://api.giphy.com/v1/gifs/${endpoint}?api_key=${encodeURIComponent(apiKey)}&${qs}`;

  return new Promise((resolve, reject) => {
    https.get(fullUrl, (res) => {
      let raw = "";
      res.on("data", (chunk: string) => (raw += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse Giphy response (HTTP ${res.statusCode}): ${raw.slice(0, 300)}`));
        }
      });
    }).on("error", reject);
  });
}

async function fetchGiphy(query: string, apiKey: string): Promise<GiphyGif[]> {
  const endpoint = query.trim() ? "search" : "trending";
  const params: Record<string, string> = query.trim() ? { q: query } : {};
  const response = await giphyFetch(apiKey, endpoint, params);
  return Array.isArray(response?.data) ? response.data : [];
}

async function fetchGifs(
  query: string,
  provider: "klipy" | "giphy",
  apiKey: string,
  quality: "low" | "medium" | "high"
): Promise<UnifiedGif[]> {
  if (provider === "giphy") {
    const rawGifs = await fetchGiphy(query, apiKey);
    return rawGifs.map((gif) => {
      const previewStillUrl = gif.images.fixed_width_still?.url ?? gif.images.preview_gif?.url;

      let previewAnimatedUrl = gif.images.fixed_width?.url;
      if (quality === "low") {
        previewAnimatedUrl = gif.images.preview_gif?.url ?? gif.images.fixed_width?.url;
      } else if (quality === "high") {
        previewAnimatedUrl = gif.images.original?.url ?? gif.images.downsized?.url;
      }
      previewAnimatedUrl = previewAnimatedUrl ?? gif.images.downsized?.url ?? gif.images.original?.url;

      const copyUrl = gif.images.downsized?.url ?? gif.images.fixed_width?.url ?? gif.images.original?.url;

      return {
        id: `giphy_${gif.id}`,
        title: gif.title || "(untitled)",
        previewStillUrl,
        previewAnimatedUrl,
        copyUrl,
      };
    });
  } else {
    const rawGifs = await fetchKlipy(query, apiKey);
    return rawGifs.map((gif) => {
      const previewStillUrl = quality === "low"
        ? (gif.blur_preview ?? gif.file.xs?.jpg?.url)
        : (gif.file.xs?.jpg?.url ?? gif.file.sm?.jpg?.url ?? gif.blur_preview);

      let previewAnimatedUrl = gif.file.md?.gif?.url;
      if (quality === "low") {
        previewAnimatedUrl = gif.file.sm?.gif?.url ?? gif.file.md?.gif?.url;
      } else if (quality === "high") {
        previewAnimatedUrl = gif.file.hd?.gif?.url ?? gif.file.md?.gif?.url;
      }
      previewAnimatedUrl = previewAnimatedUrl ?? gif.file.hd?.gif?.url ?? gif.file.md?.gif?.url ?? gif.file.sm?.gif?.url;

      const copyUrl = gif.file.md?.gif?.url ?? gif.file.hd?.gif?.url ?? gif.file.sm?.gif?.url;

      return {
        id: `klipy_${gif.id}`,
        title: gif.title || "(untitled)",
        previewStillUrl,
        previewAnimatedUrl,
        copyUrl,
      };
    });
  }
}

// ─── Copy GIF to clipboard ────────────────────────────────────────────────────

async function copyGifToClipboard(gif: UnifiedGif): Promise<void> {
  if (!gif.copyUrl) throw new Error("No GIF URL available");

  const supportDir = environment.supportPath;
  if (!fs.existsSync(supportDir)) {
    fs.mkdirSync(supportDir, { recursive: true });
  }

  const destPath = path.join(supportDir, `${gif.id}.gif`);
  if (!fs.existsSync(destPath)) {
    await downloadFile(gif.copyUrl, destPath);
  }

  await Clipboard.copy({ file: destPath });
}

// ─── Main Command ─────────────────────────────────────────────────────────────

export default function GifSelector() {
  const preferences = getPreferenceValues<Preferences>();

  const [storedKlipyKey, setStoredKlipyKey] = useState<string | null>(null);
  const [storedGiphyKey, setStoredGiphyKey] = useState<string | null>(null);
  const [storedProvider, setStoredProvider] = useState<"klipy" | "giphy" | null>(null);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);

  useEffect(() => {
    async function loadStorage() {
      try {
        const kKey = await LocalStorage.getItem<string>("klipyApiKey");
        const gKey = await LocalStorage.getItem<string>("giphyApiKey");
        const prov = await LocalStorage.getItem<string>("provider");
        if (kKey) setStoredKlipyKey(kKey);
        if (gKey) setStoredGiphyKey(gKey);
        if (prov === "klipy" || prov === "giphy") setStoredProvider(prov);
      } catch (err) {
        console.error("Failed to load local storage", err);
      } finally {
        setIsStorageLoaded(true);
      }
    }
    loadStorage();
  }, []);

  // Determine provider dynamically based on settings, falling back to storage
  let provider = preferences.provider || storedProvider || "klipy";
  
  // Resolve active API key
  let apiKey = (provider === "giphy"
    ? (preferences.giphyApiKey || storedGiphyKey)
    : (preferences.klipyApiKey || storedKlipyKey))?.trim();

  // Auto fallback if key is missing for selected but present for the other (checking both prefs and storage)
  const effectiveGiphyKey = (preferences.giphyApiKey || storedGiphyKey)?.trim();
  const effectiveKlipyKey = (preferences.klipyApiKey || storedKlipyKey)?.trim();

  if (!apiKey) {
    if (provider === "klipy" && effectiveGiphyKey) {
      provider = "giphy";
      apiKey = effectiveGiphyKey;
    } else if (provider === "giphy" && effectiveKlipyKey) {
      provider = "klipy";
      apiKey = effectiveKlipyKey;
    }
  }

  const quality = preferences.previewQuality || "medium";

  const [searchText, setSearchText] = useState("");
  const [gifs, setGifs] = useState<UnifiedGif[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const searchRef = useRef(searchText);
  searchRef.current = searchText;

  const load = useCallback(async (query: string) => {
    if (!apiKey) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const results = await fetchGifs(query, provider, apiKey, quality);
      if (searchRef.current === query) setGifs(results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await showToast({ style: Toast.Style.Failure, title: "Failed to fetch GIFs", message: msg });
    } finally {
      if (searchRef.current === query) setIsLoading(false);
    }
  }, [apiKey, provider, quality]);

  useEffect(() => {
    if (isStorageLoaded) {
      load("");
    }
  }, [load, isStorageLoaded]);

  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);
    load(text);
  }, [load]);

  const handleCopy = useCallback(async (gif: UnifiedGif) => {
    setCopyingId(gif.id);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Copying GIF…",
      message: gif.title || gif.id,
    });
    try {
      await copyGifToClipboard(gif);
      toast.style = Toast.Style.Success;
      toast.title = "GIF Copied!";
      toast.message = gif.title || gif.id;
      setTimeout(() => toast.hide(), 1500);
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "Copy Failed";
      toast.message = err instanceof Error ? err.message : String(err);
    } finally {
      setCopyingId(null);
    }
  }, []);

  // ── Show loading list if storage is still reading ──────────────────────────
  if (!isStorageLoaded) {
    return <List isLoading={true} searchBarPlaceholder="Loading configurations…" />;
  }

  // ── Setup View (if no API keys are configured anywhere) ────────────────────
  if (!apiKey) {
    return (
      <Form
        actions={
          <ActionPanel>
            <Action.SubmitForm
              title="Save Configuration"
              onSubmit={async (values) => {
                const kKey = (values.klipyApiKey as string || "").trim();
                const gKey = (values.giphyApiKey as string || "").trim();
                const prov = values.provider as "klipy" | "giphy";

                if (!kKey && !gKey) {
                  await showToast({
                    style: Toast.Style.Failure,
                    title: "API Key Required",
                    message: "Please enter at least one API key.",
                  });
                  return false;
                }

                try {
                  if (kKey) await LocalStorage.setItem("klipyApiKey", kKey);
                  if (gKey) await LocalStorage.setItem("giphyApiKey", gKey);
                  await LocalStorage.setItem("provider", prov);

                  setStoredKlipyKey(kKey || null);
                  setStoredGiphyKey(gKey || null);
                  setStoredProvider(prov);

                  await showToast({
                    style: Toast.Style.Success,
                    title: "Configuration Saved",
                    message: "GIF Selector is ready to use!",
                  });
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  await showToast({
                    style: Toast.Style.Failure,
                    title: "Save Failed",
                    message: msg,
                  });
                }
              }}
            />
            <Action title="Open Extension Preferences" icon={Icon.Cog} onAction={openExtensionPreferences} />
          </ActionPanel>
        }
      >
        <Form.Description
          title="GIF Selector Setup"
          text="Configure Giphy and/or Klipy to search and copy GIFs directly to your clipboard. Enter your API key(s) below."
        />
        <Form.Dropdown id="provider" title="Default Provider" defaultValue={provider}>
          <Form.Dropdown.Item title="Klipy" value="klipy" />
          <Form.Dropdown.Item title="Giphy" value="giphy" />
        </Form.Dropdown>
        <Form.PasswordField
          id="klipyApiKey"
          title="Klipy API Key"
          placeholder="Paste your Klipy API key (optional)"
          defaultValue={effectiveKlipyKey}
        />
        <Form.PasswordField
          id="giphyApiKey"
          title="Giphy API Key"
          placeholder="Paste your Giphy API key (optional)"
          defaultValue={effectiveGiphyKey}
        />
      </Form>
    );
  }

  // ── Main list view ─────────────────────────────────────────────────────────
  const providerLabel = provider === "giphy" ? "Giphy" : "Klipy";
  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={`Search GIFs on ${providerLabel}…`}
      onSearchTextChange={handleSearchChange}
      throttle
      isShowingDetail
    >
      {!isLoading && gifs.length === 0 ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title={searchText ? `No GIFs found for "${searchText}"` : `No trending GIFs`}
          description="Try a different search term"
        />
      ) : (
        <List.Section
          title={searchText ? `Results on ${providerLabel}` : `Trending on ${providerLabel}`}
          subtitle={`${gifs.length} GIFs`}
        >
          {gifs.map((gif) => {
            const isCopying = copyingId === gif.id;
            const animatedUrl = gif.previewAnimatedUrl;
            const previewUrl = gif.previewStillUrl;

            return (
              <List.Item
                key={gif.id}
                id={gif.id}
                title={gif.title}
                icon={previewUrl ? { value: previewUrl, tooltip: gif.title } : Icon.Image}
                accessories={[
                  isCopying
                    ? { icon: Icon.CircleProgress, tooltip: "Copying…" }
                    : { icon: Icon.CopyClipboard, tooltip: "Press ↵ to copy" },
                ]}
                detail={
                  <List.Item.Detail
                    markdown={animatedUrl ? `![${gif.title}](${animatedUrl})` : "_No preview available_"}
                  />
                }
                actions={
                  <ActionPanel>
                    <ActionPanel.Section title="GIF Actions">
                      <Action
                        title={isCopying ? "Copying…" : "Copy GIF to Clipboard"}
                        icon={isCopying ? Icon.CircleProgress : Icon.CopyClipboard}
                        onAction={() => handleCopy(gif)}
                      />
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
