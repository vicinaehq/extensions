export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hh > 0) return `${hh}:${pad(mm)}:${pad(ss)}`;
  return `${mm}:${pad(ss)}`;
}

export function basename(path: string): string {
  if (!path) return '';
  const i = path.lastIndexOf('/');
  return i < 0 ? path : path.slice(i + 1);
}

export function sectionTitle(
  state: 'play' | 'pause' | 'stop',
  count: number,
): string {
  const word =
    state === 'play' ? 'Playing' : state === 'pause' ? 'Paused' : 'Stopped';
  const suffix = count === 1 ? 'song' : 'songs';
  return `${word} \u2014 ${count} ${suffix}`;
}

// Formats a 1-based number with at least 2-digit padding (01, 02, … 99,
// then 100, 101, … naturally). Used for album track numbers in the queue
// view's number pill. The caller passes a 1-based number directly (e.g.
// the album's track index), not a 0-based position.
export function formatTrackNumber(n: number): string {
  if (!Number.isFinite(n) || n < 1) return '00';
  const i = Math.floor(n);
  return i < 10 ? `0${i}` : String(i);
}
