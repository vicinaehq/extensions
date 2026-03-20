import { closeMainWindow, open } from "@vicinae/api";

import { getTodayFeaturedPageUrl } from "./utils/api";
import { getStoredLanguage } from "./utils/language";

export default async function featuredPage() {
  const language = getStoredLanguage();
  const { url } = await getTodayFeaturedPageUrl(language);
  await open(url);
  await closeMainWindow({ clearRootSearch: true });
}
