import { JackettTorrent, JackettResponse, SearchParams } from '../types/torrent';

export async function searchTorrents(params: SearchParams): Promise<JackettTorrent[]> {
  const { query, url, apiKey, categories, trackers } = params;

  const searchParams = new URLSearchParams({
    Query: query,
    apikey: apiKey,
  });

  if (categories) {
    categories.split(',').forEach((cat) => {
      searchParams.append('Category[]', cat.trim());
    });
  }

  if (trackers) {
    trackers.split(',').forEach((tracker) => {
      searchParams.append('Tracker[]', tracker.trim());
    });
  }

  const jackettUrl = url.replace(/\/$/, '');
  const apiUrl = `${jackettUrl}/api/v2.0/indexers/all/results?${searchParams.toString()}`;

  try {
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as JackettResponse;
    return data.Results || [];
  } catch (error) {
    console.error('Error searching torrents:', error);
    throw error;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  } catch {
    return dateString;
  }
}

export function formatTrackers(trackers: string) {
  return trackers.split(",").includes("all") ? undefined : trackers
}

export function sortTorrents(torrents: JackettTorrent[], sortBy: 'seeders' | 'peers' | 'size' | 'date'): JackettTorrent[] {
  const sorted = [...torrents];

  switch (sortBy) {
    case 'seeders':
      return sorted.sort((a, b) => b.Seeders - a.Seeders);
    case 'peers':
      return sorted.sort((a, b) => b.Peers - a.Peers);
    case 'size':
      return sorted.sort((a, b) => b.Size - a.Size);
    case 'date':
      return sorted.sort((a, b) => new Date(b.PublishDate).getTime() - new Date(a.PublishDate).getTime());
    default:
      return sorted;
  }
}

export function filterTorrents(torrents: JackettTorrent[], minSeeders: number): JackettTorrent[] {
  return torrents.filter((t) => t.Seeders >= minSeeders);
}

export function generateTorrentMarkdown(torrent: JackettTorrent): string {
  let markdown = `# ${torrent.Title}\n\n`;

  if (torrent.Description) {
    markdown += `## Description\n${torrent.Description}\n\n`;
  }

  if (torrent.Languages && torrent.Languages.length > 0) {
    markdown += `## Languages\n${torrent.Languages.map((lang: string) => `- ${lang}`).join('\n')}\n\n`;
  }

  if (torrent.Subs && torrent.Subs.length > 0) {
    markdown += `## Subtitles\n${torrent.Subs.map((sub: string) => `- ${sub}`).join('\n')}\n\n`;
  }

  return markdown;
}
