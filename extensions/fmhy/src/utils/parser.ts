/**
 * Parser for FMHY single-page markdown
 * Implements a state machine to parse the hierarchical structure
 */

import {
  type FMHYLink,
  type FMHYData,
  type FMHYCategory,
  type ParserState,
  type CategoryConfig,
  CATEGORY_CONFIG,
} from "../types";
import crypto from "crypto";

/**
 * Regex patterns for line classification
 */
const PATTERNS = {
  // Category: "# ► Title", "# ▷ Title", or "# Title" (Must start with single # and space)
  category: /^#\s+[►▷]?\s*(.+)$/,

  // Subcategory: "## ▷ Title" or "## Title"
  subcategory: /^##\s*▷?\s*(.+)$/,

  // Sub-subcategory: "### Title"
  subSubcategory: /^###\s+(.+)$/,

  // Link entry with optional star: * [Title](url) - Description
  linkEntry: /^\*\s*(⭐)?\s*\[([^\]]+)\]\(([^)]+)\)\s*[-–—]?\s*(.*)$/,

  // Alternative link format (inline URL): * Title - https://url - Description
  inlineLink: /^\*\s*(⭐)?\s*([^[]+?)\s*[-–—]\s*(https?:\/\/\S+)\s*[-–—]?\s*(.*)$/,
};

/**
 * Remove markdown links and other formatting from title
 */
function cleanTitle(text: string): string {
  // Remove markdown links: [Title](url) -> Title
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
}

/**
 * Convert heading text to URL anchor
 */
export function toAnchor(heading: string): string {
  return cleanTitle(heading)
    .toLowerCase()
    .replace(/ \/ /g, "-")
    .replace(/ /g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Build FMHY website URL for a specific section
 */
export function buildFmhyUrl(slug: string, anchor: string): string {
  return `https://fmhy.net/${slug}#${anchor}`;
}

/**
 * Generate unique ID from URL
 */
function generateId(url: string): string {
  return crypto.createHash("md5").update(url).digest("hex").substring(0, 12);
}

/**
 * Helper to find category config by name
 */
function findCategoryConfig(name: string) {
  const normalized = name.toLowerCase().trim();
  // Try exact match first
  let match = CATEGORY_CONFIG.find((c) => c.name.toLowerCase() === normalized);

  // Try simple fuzzy matches or aliases if needed in future
  // For now, if no match, return a generic config
  if (!match) {
    // Fallback: try to find by checking if one is a substring of the other
    // e.g. "Adblocking" vs "Adblock/VPN/Privacy"
    match = CATEGORY_CONFIG.find(
      (c) => c.name.toLowerCase().includes(normalized) || normalized.includes(c.name.toLowerCase()),
    );
  }

  return (
    match || {
      name: name,
      slug: toAnchor(name),
      icon: "📂", // Default icon
      file: "",
    }
  );
}

/**
 * Parse the FMHY single-page markdown into structured data
 */
export function parseMarkdown(markdown: string, forceCategory?: CategoryConfig): FMHYData {
  const lines = markdown.split("\n");
  const state: ParserState = {
    currentCategory: forceCategory || null,
    currentSubcategory: "",
    currentSubSubcategory: "",
    currentAnchor: "",
    links: [],
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 1. Category detection (# ► Title)
    const catMatch = trimmed.match(PATTERNS.category);
    if (catMatch) {
      const name = cleanTitle(catMatch[1]);

      // If forcing category, treat Level 1 headers as Subcategories
      if (forceCategory) {
        state.currentSubcategory = name;
        state.currentSubSubcategory = "";
        state.currentAnchor = toAnchor(name);
      } else {
        state.currentCategory = findCategoryConfig(name);
        state.currentSubcategory = "";
        state.currentSubSubcategory = "";
      }
      continue;
    }

    // 2. Subcategory detection (## ▷ Title)
    const subMatch = trimmed.match(PATTERNS.subcategory);
    if (subMatch) {
      const name = cleanTitle(subMatch[1]);

      // If forcing category, treat Level 2 headers as Sub-subcategories
      if (forceCategory) {
        state.currentSubSubcategory = name;
        state.currentAnchor = toAnchor(name);
      } else {
        state.currentSubcategory = name;
        state.currentSubSubcategory = "";
        state.currentAnchor = toAnchor(name);
      }
      continue;
    }

    // 3. Sub-subcategory detection (### Title)
    const subSubMatch = trimmed.match(PATTERNS.subSubcategory);
    if (subSubMatch) {
      const name = cleanTitle(subSubMatch[1]);

      // If forcing category, treat Level 3 headers also as Sub-subcategories (overwrite)
      // or we could ignore them if depth is too much. For now, treat as sub-sub.
      state.currentSubSubcategory = name;
      state.currentAnchor = toAnchor(name);
      continue;
    }

    // Skip if no category context yet
    if (!state.currentCategory) continue;

    // 4. Link entry parsing
    const linkMatch = trimmed.match(PATTERNS.linkEntry);
    if (linkMatch) {
      const [, star, title, url, description] = linkMatch;
      state.links.push({
        id: generateId(url),
        title: title.trim(),
        url: url.trim(),
        description: description?.trim() || "",
        isStarred: !!star,
        category: state.currentCategory.name,
        categorySlug: state.currentCategory.slug,
        subcategory: state.currentSubcategory,
        subSubcategory: state.currentSubSubcategory,
        icon: state.currentCategory.icon,
        fmhyUrl: buildFmhyUrl(state.currentCategory.slug, state.currentAnchor),
      });
      continue;
    }

    // 5. Try alternative inline link format
    const inlineMatch = trimmed.match(PATTERNS.inlineLink);
    if (inlineMatch) {
      const [, star, title, url, description] = inlineMatch;
      state.links.push({
        id: generateId(url),
        title: title.trim(),
        url: url.trim(),
        description: description?.trim() || "",
        isStarred: !!star,
        category: state.currentCategory.name,
        categorySlug: state.currentCategory.slug,
        subcategory: state.currentSubcategory,
        subSubcategory: state.currentSubSubcategory,
        icon: state.currentCategory.icon,
        fmhyUrl: buildFmhyUrl(state.currentCategory.slug, state.currentAnchor),
      });
    }
  }

  return organizeByCategory(state.links);
}

/**
 * Organize flat link list into hierarchical category structure
 */
/**
 * Organize flat link list into hierarchical category structure
 */
function organizeByCategory(links: FMHYLink[]): FMHYData {
  const categories: FMHYCategory[] = [];
  const usedSlugs = new Set<string>();

  // 1. Process known categories from config
  for (const config of CATEGORY_CONFIG) {
    usedSlugs.add(config.slug);

    // Get all links for this category
    const categoryLinks = links.filter((link) => link.categorySlug === config.slug);

    // Group by subcategory
    const subcategoryMap = new Map<string, FMHYLink[]>();
    for (const link of categoryLinks) {
      const key = link.subSubcategory || link.subcategory || "General";
      if (!subcategoryMap.has(key)) {
        subcategoryMap.set(key, []);
      }
      subcategoryMap.get(key)!.push(link);
    }

    // Convert to subcategory array
    const subcategories = Array.from(subcategoryMap.entries()).map(([name, subLinks]) => ({
      name,
      anchor: toAnchor(name),
      links: subLinks,
    }));

    categories.push({
      name: config.name,
      slug: config.slug,
      icon: config.icon,
      linkCount: categoryLinks.length,
      starredCount: categoryLinks.filter((link) => link.isStarred).length,
      subcategories,
    });
  }

  // 2. Process dynamic/unknown categories found during parsing
  const allLinkSlugs = new Set(links.map((l) => l.categorySlug));
  const unknownSlugs = Array.from(allLinkSlugs).filter((s) => !usedSlugs.has(s));

  for (const slug of unknownSlugs) {
    const categoryLinks = links.filter((link) => link.categorySlug === slug);
    if (categoryLinks.length === 0) continue;

    // Try to infer name/icon from the first link's data
    const firstLink = categoryLinks[0];

    const subcategoryMap = new Map<string, FMHYLink[]>();
    for (const link of categoryLinks) {
      const key = link.subSubcategory || link.subcategory || "General";
      if (!subcategoryMap.has(key)) {
        subcategoryMap.set(key, []);
      }
      subcategoryMap.get(key)!.push(link);
    }

    const subcategories = Array.from(subcategoryMap.entries()).map(([name, subLinks]) => ({
      name,
      anchor: toAnchor(name),
      links: subLinks,
    }));

    categories.push({
      name: firstLink.category, // Use the detected name
      slug: slug,
      icon: firstLink.icon || "📂",
      linkCount: categoryLinks.length,
      starredCount: categoryLinks.filter((link) => link.isStarred).length,
      subcategories,
    });
  }

  return {
    categories,
    allLinks: links,
    lastUpdated: new Date().toISOString(),
  };
}
