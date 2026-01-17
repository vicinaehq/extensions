import { useEffect, useState } from "react";
import { LocalStorage, showToast, Toast, environment, getPreferenceValues } from "@raycast/api";
import { parseMarkdown } from "../utils/parser";
import { FMHYData, CATEGORY_CONFIG } from "../types";
import fs from "fs";
import path from "path";

const FMHY_API_URL = "https://api.fmhy.net/single-page";
const CACHE_KEY = "fmhy_data";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface Preferences {
  cacheTTL: string;
  showNSFW: boolean;
}

interface UseFMHYDataResult {
  data: FMHYData | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useFMHYData(): UseFMHYDataResult {
  const [data, setData] = useState<FMHYData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Read preferences
  const preferences = getPreferenceValues<Preferences>();
  const ttlHours = parseFloat(preferences.cacheTTL || "24");
  const useNSFW = preferences.showNSFW || false;

  // Load from static cache
  useEffect(() => {
    async function loadData() {
      try {
        const mergedData: FMHYData = {
          categories: [],
          allLinks: [],
          lastUpdated: new Date().toISOString(),
        };

        const cacheDir = path.join(environment.assetsPath, "cache");

        // Use Maps to deduplicate categories by slug and links by id
        const categoryMap = new Map<string, FMHYData["categories"][0]>();
        const linkMap = new Map<string, FMHYData["allLinks"][0]>();

        if (fs.existsSync(cacheDir)) {
          for (const config of CATEGORY_CONFIG) {
            try {
              const filePath = path.join(cacheDir, `${config.slug}.json`);
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, "utf-8");
                const json = JSON.parse(content) as FMHYData;

                // Merge categories, deduplicating by slug
                for (const cat of json.categories) {
                  if (categoryMap.has(cat.slug)) {
                    // Merge subcategories into existing category, deduplicating by anchor
                    const existing = categoryMap.get(cat.slug)!;

                    for (const sub of cat.subcategories) {
                      const existingSub = existing.subcategories.find((s) => s.anchor === sub.anchor);
                      if (existingSub) {
                        // Merge links into existing subcategory, deduplicate by link.id
                        const existingLinkIds = new Set(existingSub.links.map((l) => l.id));
                        for (const link of sub.links) {
                          if (!existingLinkIds.has(link.id)) {
                            existingSub.links.push(link);
                          }
                        }
                      } else {
                        existing.subcategories.push({ ...sub, links: [...sub.links] });
                      }
                    }

                    existing.linkCount += cat.linkCount;
                    existing.starredCount += cat.starredCount;
                  } else {
                    // Clone deeply to avoid mutation issues
                    categoryMap.set(cat.slug, {
                      ...cat,
                      subcategories: cat.subcategories.map((s) => ({ ...s, links: [...s.links] })),
                    });
                  }
                }

                // Deduplicate links by ID
                for (const link of json.allLinks) {
                  if (!linkMap.has(link.id)) {
                    linkMap.set(link.id, link);
                  }
                }
              }
            } catch (e) {
              console.warn(`Failed to load cache for ${config.slug}`, e);
            }
          }
        }

        // Convert maps back to arrays
        mergedData.categories = Array.from(categoryMap.values());
        mergedData.allLinks = Array.from(linkMap.values());

        // Filter NSFW if not enabled
        if (!useNSFW) {
          const nsfwSlugs = ["unsafe", "nsfw"];
          mergedData.categories = mergedData.categories.filter((c) => !nsfwSlugs.includes(c.slug));
          mergedData.allLinks = mergedData.allLinks.filter((l) => !nsfwSlugs.includes(l.categorySlug));
        }

        if (mergedData.categories.length > 0) {
          setData(mergedData);
        } else {
          // If static cache is missing/empty, maybe try network or show error
          // For now, allow empty state, assuming build process runs correctly.
        }
      } catch (e) {
        console.error("Error loading data:", e);
        setError(e instanceof Error ? e : new Error("Unknown error"));
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to load FMHY data",
          message: String(e),
        });
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [useNSFW]);

  const refresh = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(FMHY_API_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();

      // Parse monolithic data
      // Note: This won't use the specialized per-file grouping for Non-English unless we split it manually,
      // but for a quick live refresh it's better than nothing.
      // Ideally we'd replicate the split logic here or use the same `update-cache` logic.
      const freshData = parseMarkdown(text);

      if (freshData) {
        setData(freshData);
        showToast({ style: Toast.Style.Success, title: "Data updated from FMHY" });
      }
    } catch (e) {
      console.error("Refresh failed:", e);
      showToast({
        style: Toast.Style.Failure,
        title: "Update failed",
        message: "Could not fetch latest data from FMHY",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return { data, isLoading, error, refresh };
}
