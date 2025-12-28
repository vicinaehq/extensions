/**
 * Represents a bookmark saved by the user.
 */
export interface CustomLink {
  /** Unique identifier for the link */
  id: string;
  /** Display name for the link */
  title: string;
  /** The actual URL */
  url: string;
  /** ISO timestamp of when the link was created */
  createdAt: string;
}

/**
 * Partial link data for creating a new link (id and createdAt are auto-generated)
 */
export type CreateLinkInput = Pick<CustomLink, "title" | "url">;

/**
 * Partial link data for updating an existing link
 */
export type UpdateLinkInput = Partial<Pick<CustomLink, "title" | "url">>;

