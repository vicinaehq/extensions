export type OTPURL = {
  type: "totp" | "hotp";
  account: string;
  issuer: string;
  secret: string;
  digits: number;
  timeStep: number;
  counter: number;
  algorithm: string;
};

export function parseOtpUrl(raw: string): OTPURL | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "otpauth:") return null;
    const type = url.hostname.toLowerCase();
    if (type !== "totp" && type !== "hotp") return null;
    const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
    let issuer = url.searchParams.get("issuer") || "";
    let account = label;
    const colonIndex = label.indexOf(":");
    if (colonIndex !== -1) {
      issuer = label.slice(0, colonIndex);
      account = label.slice(colonIndex + 1);
    }
    const secret = url.searchParams.get("secret") ?? "";
    const digits = Number.parseInt(url.searchParams.get("digits") ?? "6", 10);
    const period = Number.parseInt(url.searchParams.get("period") ?? "30", 10);
    const counter = Number.parseInt(url.searchParams.get("counter") ?? "0", 10);
    const algorithm = (url.searchParams.get("algorithm") || "SHA1").replace(/-/g, "");
    if (!secret) return null;
    return { type, account, issuer, secret, digits, timeStep: period, counter, algorithm };
  } catch {
    return null;
  }
}
