import { closeMainWindow, open } from "@vicinae/api";

import { getRandomPageUrl } from "./utils/api";
import { getStoredLanguage } from "./utils/language";

export default async function randomPage() {
  const language = getStoredLanguage();
  const { url } = await getRandomPageUrl(language);
  await open(url);
  await closeMainWindow({ clearRootSearch: true });
}
