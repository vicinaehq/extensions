import { MD5, SHA512 } from "crypto-js";
import * as CryptoJS from "crypto-js";

// SuperGenPass algorithm implementation using crypto-js

// TLD list for domain processing (simplified version)
const TLD_LIST = [
  "com",
  "org",
  "net",
  "edu",
  "gov",
  "mil",
  "int",
  "ac",
  "ad",
  "ae",
  "af",
  "ag",
  "ai",
  "al",
  "am",
  "an",
  "ao",
  "aq",
  "ar",
  "as",
  "at",
  "au",
  "aw",
  "ax",
  "az",
  "ba",
  "bb",
  "bd",
  "be",
  "bf",
  "bg",
  "bh",
  "bi",
  "bj",
  "bm",
  "bn",
  "bo",
  "br",
  "bs",
  "bt",
  "bv",
  "bw",
  "by",
  "bz",
  "ca",
  "cc",
  "cd",
  "cf",
  "cg",
  "ch",
  "ci",
  "ck",
  "cl",
  "cm",
  "cn",
  "co",
  "cr",
  "cu",
  "cv",
  "cx",
  "cy",
  "cz",
  "de",
  "dj",
  "dk",
  "dm",
  "do",
  "dz",
  "ec",
  "ee",
  "eg",
  "eh",
  "er",
  "es",
  "et",
  "eu",
  "fi",
  "fj",
  "fk",
  "fm",
  "fo",
  "fr",
  "ga",
  "gb",
  "gd",
  "ge",
  "gf",
  "gg",
  "gh",
  "gi",
  "gl",
  "gm",
  "gn",
  "gp",
  "gq",
  "gr",
  "gs",
  "gt",
  "gu",
  "gw",
  "gy",
  "hk",
  "hm",
  "hn",
  "hr",
  "ht",
  "hu",
  "id",
  "ie",
  "il",
  "im",
  "in",
  "io",
  "iq",
  "ir",
  "is",
  "it",
  "je",
  "jm",
  "jo",
  "jp",
  "ke",
  "kg",
  "kh",
  "ki",
  "km",
  "kn",
  "kp",
  "kr",
  "kw",
  "ky",
  "kz",
  "la",
  "lb",
  "lc",
  "li",
  "lk",
  "lr",
  "ls",
  "lt",
  "lu",
  "lv",
  "ly",
  "ma",
  "mc",
  "md",
  "me",
  "mg",
  "mh",
  "mk",
  "ml",
  "mm",
  "mn",
  "mo",
  "mp",
  "mq",
  "mr",
  "ms",
  "mt",
  "mu",
  "mv",
  "mw",
  "mx",
  "my",
  "mz",
  "na",
  "nc",
  "ne",
  "nf",
  "ng",
  "ni",
  "nl",
  "no",
  "np",
  "nr",
  "nu",
  "nz",
  "om",
  "pa",
  "pe",
  "pf",
  "pg",
  "ph",
  "pk",
  "pl",
  "pm",
  "pn",
  "pr",
  "ps",
  "pt",
  "pw",
  "py",
  "qa",
  "re",
  "ro",
  "rs",
  "ru",
  "rw",
  "sa",
  "sb",
  "sc",
  "sd",
  "se",
  "sg",
  "sh",
  "si",
  "sj",
  "sk",
  "sl",
  "sm",
  "sn",
  "so",
  "sr",
  "st",
  "su",
  "sv",
  "sy",
  "sz",
  "tc",
  "td",
  "tf",
  "tg",
  "th",
  "tj",
  "tk",
  "tl",
  "tm",
  "tn",
  "to",
  "tp",
  "tr",
  "tt",
  "tv",
  "tw",
  "tz",
  "ua",
  "ug",
  "uk",
  "um",
  "us",
  "uy",
  "uz",
  "va",
  "vc",
  "ve",
  "vg",
  "vi",
  "vn",
  "vu",
  "wf",
  "ws",
  "ye",
  "yt",
  "yu",
  "za",
  "zm",
  "zw",
];

// Compute hash (returns modified base64 string)
function hashFunction(str: string, method: string): string {
  let hash;
  switch (method) {
    case "md5":
      hash = MD5(str);
      break;
    case "sha512":
      hash = SHA512(str);
      break;
    default:
      throw new Error(`Unsupported hash method: ${method}`);
  }
  // Convert to base64 and replace + / = with 9 8 A
  const base64 = hash.toString(CryptoJS.enc.Base64);
  return base64.replace(/\+/g, "9").replace(/\//g, "8").replace(/=/g, "A");
}

// Validate password meets SuperGenPass criteria
function validatePassword(password: string): boolean {
  // Must start with lowercase letter
  if (!/^[a-z]/.test(password)) return false;
  // Must contain at least one uppercase letter
  if (!/[A-Z]/.test(password)) return false;
  // Must contain at least one number
  if (!/[0-9]/.test(password)) return false;
  return true;
}

// Remove subdomains from hostname
function removeSubdomains(hostname: string): string {
  const parts = hostname.split(".");

  if (parts.length < 2) return hostname;

  // Check for country-code TLDs
  for (const tld of TLD_LIST) {
    if (hostname.endsWith(`.${tld}`)) {
      const tldParts = tld.split(".").length + 1;
      return parts.slice(-tldParts).join(".");
    }
  }

  // Default: return last two parts
  return parts.slice(-2).join(".");
}

// Extract hostname from URL
function extractHostname(
  url: string,
  removeSubdomainsFlag: boolean = true,
): string {
  const domainRegex = /^(?:[a-z]+:\/\/)?(?:[^/@]+@)?([^/:]+)/i;
  const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

  const match = url.match(domainRegex);
  if (!match) throw new Error(`Invalid URL: ${url}`);

  const hostname = match[1];

  // If IP address, return as-is
  if (ipRegex.test(hostname)) return hostname;

  // Remove subdomains if requested
  return removeSubdomainsFlag ? removeSubdomains(hostname) : hostname;
}

// Generate SuperGenPass password using the recursive method matching the mobile version
export function generateSuperGenPass(
  masterPassword: string,
  url: string,
  options: {
    length?: number;
    method?: string;
    removeSubdomains?: boolean;
    secret?: string;
  } = {},
): string {
  const {
    length = 10,
    method = "md5",
    removeSubdomains: removeSubdomainsFlag = true,
    secret = "",
  } = options;

  if (length < 4 || length > 24) {
    throw new Error("Password length must be between 4 and 24");
  }

  const domain = extractHostname(url, removeSubdomainsFlag);
  const input = `${masterPassword}${secret}:${domain}`;

  let hash = hashFunction(input, method);

  // Hash at least 10 times, then continue until password meets criteria
  for (let i = 0; i < 10 || !validatePassword(hash.substring(0, length)); i++) {
    hash = hashFunction(hash, method);
  }

  return hash.substring(0, length);
}
