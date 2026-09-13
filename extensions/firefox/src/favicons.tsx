import { openProfileDatabase } from "./utils";

const PREFERRED_SIZE = 64;

type IconCandidate = { id: number; width: number; pages: number };

/**
 * Best icon per host: the one shared by the most pages of that host, sizes
 * closest to what the list renders winning ties.
 */
function selectIcons(rows: [string, number, number][], hosts: Set<string>) {
  const candidates = new Map<string, Map<number, IconCandidate>>();

  for (const [pageUrl, id, width] of rows) {
    let host = "";
    try {
      host = new URL(pageUrl).hostname;
    } catch {
      continue;
    }
    if (!hosts.has(host)) continue;

    let byId = candidates.get(host);
    if (!byId) candidates.set(host, (byId = new Map()));

    const candidate = byId.get(id);
    if (candidate) candidate.pages += 1;
    else byId.set(id, { id, width, pages: 1 });
  }

  const selected = new Map<string, number>();

  for (const [host, byId] of candidates) {
    const best = [...byId.values()].sort((a, b) => {
      if (a.pages !== b.pages) return b.pages - a.pages;
      return (
        Math.abs(a.width - PREFERRED_SIZE) - Math.abs(b.width - PREFERRED_SIZE)
      );
    })[0];
    selected.set(host, best.id);
  }

  return selected;
}

/**
 * Returns a host -> data URL map built from the favicons Firefox already
 * downloaded. Reusing them keeps intranet bookmarks iconed and avoids sending
 * every bookmarked domain to a third-party favicon service.
 */
export async function getFavicons(
  profilePath: string,
  hosts: Iterable<string>,
): Promise<Map<string, string>> {
  const wanted = new Set([...hosts].filter(Boolean));
  const favicons = new Map<string, string>();

  if (wanted.size === 0) return favicons;

  const db = await openProfileDatabase(profilePath, "favicons.sqlite");
  if (!db) return favicons;

  try {
    const patterns = [...wanted].flatMap((host) => [
      `http://${host}%`,
      `https://${host}%`,
    ]);
    const placeholders = patterns.map(() => "p.page_url LIKE ?").join(" OR ");
    const statement = db.prepare(
      `SELECT p.page_url, i.id, i.width FROM moz_pages_w_icons p JOIN moz_icons_to_pages ip ON ip.page_id = p.id JOIN moz_icons i ON i.id = ip.icon_id WHERE ${placeholders};`,
    );
    statement.bind(patterns);

    const rows: [string, number, number][] = [];
    while (statement.step()) {
      const [pageUrl, id, width] = statement.get();
      rows.push([String(pageUrl), Number(id), Number(width)]);
    }
    statement.free();

    const blobs = db.prepare(`SELECT data FROM moz_icons WHERE id = ?;`);

    for (const [host, id] of selectIcons(rows, wanted)) {
      blobs.bind([id]);
      if (!blobs.step()) {
        blobs.reset();
        continue;
      }
      const data = blobs.get()[0] as Uint8Array;
      blobs.reset();

      favicons.set(
        host,
        `data:;base64,${Buffer.from(data).toString("base64")}`,
      );
    }

    blobs.free();
  } finally {
    db.close();
  }

  return favicons;
}
