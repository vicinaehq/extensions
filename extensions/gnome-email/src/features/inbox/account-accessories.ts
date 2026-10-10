import { Icon } from "@vicinae/api";
import type { GoaMailAccount } from "../../types";

function builtInAccountIcon(account: GoaMailAccount, domain: string): Icon {
  if (account.backend === "microsoft-graph") return Icon.Cloud;
  if (domain === "proton.me" || domain === "protonmail.com" || domain.endsWith(".protonmail.com")) return Icon.Lock;
  return Icon.Envelope;
}

export function accountAccessories(account: GoaMailAccount, showFavicons: boolean) {
  if (!showFavicons) return [{ text: account.email }];

  const separator = account.email.lastIndexOf("@");
  if (separator < 1 || separator === account.email.length - 1) return [{ text: account.email }];

  const localPart = account.email.slice(0, separator);
  const domain = account.email.slice(separator + 1).toLowerCase();
  const fallback = builtInAccountIcon(account, domain);
  return [
    { text: `${localPart} @`, tooltip: account.email },
    {
      icon: { source: `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(domain)}`, fallback },
      tooltip: domain,
    },
  ];
}
