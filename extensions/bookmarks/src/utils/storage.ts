import { LocalStorage } from "@vicinae/api";
import type { CustomLink, CreateLinkInput, UpdateLinkInput } from "../types";

const STORAGE_KEY = "bookmarks";

/**
 * Generate a unique ID for a new link
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Load all links from LocalStorage
 * @returns Array of CustomLink objects, or empty array if none exist
 */
export async function loadLinks(): Promise<CustomLink[]> {
  try {
    const data = await LocalStorage.getItem(STORAGE_KEY);
    if (!data) {
      return [];
    }
    const parsed = JSON.parse(String(data));
    // Validate that we got an array
    if (!Array.isArray(parsed)) {
      console.warn("Invalid storage data format, resetting to empty array");
      return [];
    }
    return parsed as CustomLink[];
  } catch (error) {
    console.error("Failed to load links from storage:", error);
    return [];
  }
}

/**
 * Save the entire links array to LocalStorage
 * @param links - Array of CustomLink objects to persist
 */
export async function saveLinks(links: CustomLink[]): Promise<void> {
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

/**
 * Add a new link to storage
 * @param input - The title and URL for the new link
 * @returns The newly created CustomLink with generated id and timestamp
 */
export async function addLink(input: CreateLinkInput): Promise<CustomLink> {
  const links = await loadLinks();

  const newLink: CustomLink = {
    id: generateId(),
    title: input.title,
    url: input.url,
    createdAt: new Date().toISOString(),
  };

  links.push(newLink);
  await saveLinks(links);

  return newLink;
}

/**
 * Update an existing link by ID
 * @param id - The ID of the link to update
 * @param updates - Partial link data to merge
 * @returns The updated CustomLink, or null if not found
 */
export async function updateLink(
  id: string,
  updates: UpdateLinkInput
): Promise<CustomLink | null> {
  const links = await loadLinks();
  const index = links.findIndex((link) => link.id === id);

  if (index === -1) {
    return null;
  }

  const updatedLink: CustomLink = {
    ...links[index],
    ...updates,
  };

  links[index] = updatedLink;
  await saveLinks(links);

  return updatedLink;
}

/**
 * Delete a link by ID
 * @param id - The ID of the link to delete
 * @returns true if the link was found and deleted, false otherwise
 */
export async function deleteLink(id: string): Promise<boolean> {
  const links = await loadLinks();
  const index = links.findIndex((link) => link.id === id);

  if (index === -1) {
    return false;
  }

  links.splice(index, 1);
  await saveLinks(links);

  return true;
}

/**
 * Get a single link by ID
 * @param id - The ID of the link to retrieve
 * @returns The CustomLink if found, or null
 */
export async function getLinkById(id: string): Promise<CustomLink | null> {
  const links = await loadLinks();
  return links.find((link) => link.id === id) ?? null;
}

