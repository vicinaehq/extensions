import { Clipboard, showHUD } from "@vicinae/api";
import { decodeJwt, formatClaimTime, tokenStatus } from "./jwt.ts";

const identify = (payload: Record<string, unknown>) =>
  [payload.azp ?? payload.client_id, payload.sub]
    .filter((value): value is string => typeof value === "string")
    .join(" · ");

export default async function Command() {
  const decoded = decodeJwt((await Clipboard.readText()) ?? "");

  if (!decoded.ok) {
    await showHUD(`No JWT in the clipboard: ${decoded.error}`);
    return;
  }

  const status = tokenStatus(decoded.payload);
  const when = "exp" in decoded.payload ? formatClaimTime(decoded.payload.exp) : null;
  const who = identify(decoded.payload);

  await showHUD([status.label, when, who].filter(Boolean).join(" · "));
}
