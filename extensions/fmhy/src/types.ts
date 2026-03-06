/**
 * Type definitions for FMHY Raycast Extension
 */

/**
 * Represents a single link entry in the FMHY database
 */
export interface FMHYLink {
  /** Unique identifier (hash of URL) */
  id: string;

  /** Link text/name */
  title: string;

  /** Target URL */
  url: string;

  /** Full description */
  description: string;

  /** Whether this link is recommended (⭐) */
  isStarred: boolean;

  /** Top-level category name (e.g., "Video Piracy") */
  category: string;

  /** Category slug for URL (e.g., "video") */
  categorySlug: string;

  /** Subcategory heading (# ►) */
  subcategory: string;

  /** Sub-subcategory heading (## ▷), optional */
  subSubcategory: string;

  /** Category emoji icon */
  icon: string;

  /** Direct link to FMHY website section */
  fmhyUrl: string;
}

/**
 * Represents a subcategory grouping
 */
export interface FMHYSubcategory {
  /** Subcategory name */
  name: string;

  /** URL anchor for this subcategory */
  anchor: string;

  /** Links within this subcategory */
  links: FMHYLink[];
}

/**
 * Represents a top-level category
 */
export interface FMHYCategory {
  /** Category name */
  name: string;

  /** Category slug for URLs */
  slug: string;

  /** Category emoji icon */
  icon: string;

  /** Total number of links in this category */
  linkCount: number;

  /** Number of starred/recommended links */
  starredCount: number;

  /** Subcategories within this category */
  subcategories: FMHYSubcategory[];
}

/**
 * Complete parsed FMHY data
 */
export interface FMHYData {
  /** All categories with their hierarchical structure */
  categories: FMHYCategory[];

  /** Flattened list of all links for search */
  allLinks: FMHYLink[];

  /** Timestamp of last data update */
  lastUpdated: string;
}

/**
 * Category configuration (static metadata)
 */
export interface CategoryConfig {
  /** Category slug */
  slug: string;

  /** Display name */
  name: string;

  /** Emoji icon */
  icon: string;

  /** Source markdown filename */
  file: string;

  /** Common headers that map to this category */
  aliases?: string[];

  /** Optional external URL to open instead of parsing links */
  externalUrl?: string;
}

/**
 * All 24 FMHY categories with their metadata
 */
export const CATEGORY_CONFIG: CategoryConfig[] = [
  {
    slug: "adblock-vpn-privacy",
    name: "Adblock/VPN/Privacy",
    icon: "📛",
    file: "privacy.md",
    aliases: ["Adblocking", "Privacy", "VPN"],
  },
  { slug: "ai", name: "AI", icon: "🤖", file: "ai.md", aliases: ["Artificial Intelligence"] },
  { slug: "android", name: "Android/iOS", icon: "📱", file: "mobile.md", aliases: ["Android", "iOS", "Mobile"] },
  { slug: "audio", name: "Audio Piracy", icon: "🎵", file: "audio.md", aliases: ["Audio", "Music"] },
  { slug: "download", name: "Download Piracy", icon: "💾", file: "downloading.md", aliases: ["Downloading"] },
  { slug: "edu", name: "EDU Piracy", icon: "🧠", file: "educational.md", aliases: ["Educational", "Education"] },
  { slug: "games", name: "Gaming Piracy", icon: "🎮", file: "gaming.md", aliases: ["Gaming", "Games"] },
  {
    slug: "system-tools",
    name: "System Tools",
    icon: "💻",
    file: "system-tools.md",
    aliases: ["System", "Antivirus", "Anti-Malware", "Antivirus / Anti-Malware"],
  },
  { slug: "file-tools", name: "File Tools", icon: "🗃️", file: "file-tools.md", aliases: ["File"] },
  { slug: "internet-tools", name: "Internet Tools", icon: "🔗", file: "internet-tools.md", aliases: ["Internet"] },
  {
    slug: "social-media",
    name: "Social Media Tools",
    icon: "💬",
    file: "social-media-tools.md",
    aliases: ["Social Media"],
  },
  { slug: "text-tools", name: "Text Tools", icon: "📝", file: "text-tools.md", aliases: ["Text"] },
  {
    slug: "video-tools",
    name: "Video Tools",
    icon: "📼",
    file: "video-tools.md",
    aliases: ["Video Editing", "Encoding"],
  },
  { slug: "misc", name: "Misc", icon: "📂", file: "misc.md", aliases: ["Miscellaneous"] },
  { slug: "reading", name: "Reading Piracy", icon: "📗", file: "reading.md", aliases: ["Reading", "Books", "Comics"] },
  { slug: "torrent", name: "Torrent Piracy", icon: "🌀", file: "torrenting.md", aliases: ["Torrenting", "Torrents"] },
  { slug: "img-tools", name: "Image Tools", icon: "📷", file: "image-tools.md", aliases: ["Image", "Photos"] },
  { slug: "gaming-tools", name: "Gaming Tools", icon: "👾", file: "gaming-tools.md", aliases: ["Emulation", "Gaming"] },
  { slug: "linux", name: "Linux/Mac", icon: "🐧🍏", file: "linux-macos.md", aliases: ["Linux", "MacOS", "Mac"] },
  {
    slug: "dev-tools",
    name: "Dev Tools",
    icon: "🖥️",
    file: "developer-tools.md",
    aliases: ["Developer Tools", "Development"],
  },
  { slug: "non-eng", name: "Non-English", icon: "🌏", file: "non-english.md", aliases: ["Foreign", "International"] },
  {
    slug: "storage",
    name: "Storage",
    icon: "🗄️",
    file: "storage.md",
    aliases: ["Hosting"],
    externalUrl: "https://fmhy.net/storage",
  },
  { slug: "video", name: "Video Piracy", icon: "📺", file: "video.md", aliases: ["Video"] },
  {
    slug: "unsafe",
    name: "Unsafe Sites",
    icon: "⚠️",
    file: "unsafe.md",
    aliases: ["Unsafe"],
    externalUrl: "https://fmhy.net/unsafe",
  }, // Added missed category
  { slug: "base64", name: "Base64", icon: "🔑", file: "base64.md", aliases: ["Base64 Encoded"] }, // Keeping if base64.md exists or handle separately if not in list
];

/**
 * Line type classification for parser state machine
 */
export enum LineType {
  CATEGORY_MARKER = "CATEGORY_MARKER",
  SUBCATEGORY = "SUBCATEGORY",
  SUB_SUBCATEGORY = "SUB_SUBCATEGORY",
  LINK_ENTRY = "LINK_ENTRY",
  EMPTY = "EMPTY",
  OTHER = "OTHER",
}

/**
 * Parser state for markdown processing
 */
export interface ParserState {
  currentCategory: CategoryConfig | null;
  currentSubcategory: string;
  currentSubSubcategory: string;
  currentAnchor: string;
  links: FMHYLink[];
}
