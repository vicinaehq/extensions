import { clearInboxCache } from "../inbox/inbox-cache";
import { clearMessageImageCache } from "../messages/image-cache";

export async function clearEmailCaches(): Promise<void> {
  clearInboxCache();
  await clearMessageImageCache();
}
