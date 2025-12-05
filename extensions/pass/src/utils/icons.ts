import { Icon } from "@vicinae/api";

const ENTRY_ICON_MAP: Record<string, Icon> = {
  "Cards/": Icon.CreditCard,
  "Dev/": Icon.Terminal,
  "Finance/": Icon.Coins,
  "Games/": Icon.GameController,
  "Mails/": Icon.Envelope,
  "Personal/": Icon.Person,
  "Security/": Icon.Fingerprint,
  "Shops/": Icon.Gift,
  "Social/": Icon.TwoPeople,
  "SSH/": Icon.Terminal,
  "VPN/": Icon.Network,
};

const OPTION_ICON_MAP: Record<string, Icon> = {
  Password: Icon.Key,
  OTP: Icon.Hourglass,
  email: Icon.Envelope,
  Email: Icon.Envelope,
  username: Icon.Person,
  Username: Icon.Person,
  user: Icon.Person,
  login: Icon.Person,
  url: Icon.Link,
  URL: Icon.Link,
  Number: Icon.CreditCard,
  Brand: Icon.CreditCard,
  "Cardholder Name": Icon.Person,
  Expiration: Icon.Calendar,
  "Security Code": Icon.Code,
};

export function getEntryIcon(text: string): Icon {
  const prefix = Object.keys(ENTRY_ICON_MAP).find((key) => text.startsWith(key));
  return prefix ? ENTRY_ICON_MAP[prefix] : Icon.Lock;
}

export function getOptionIcon(text: string): Icon {
  return OPTION_ICON_MAP[text] || Icon.Minus;
}
