import { createHash } from 'node:crypto';
import { join } from 'node:path';

export function cacheDir(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string {
  if (env.XDG_CACHE_HOME) return join(env.XDG_CACHE_HOME, 'vicinae-mpd', 'art');
  if (env.HOME) return join(env.HOME, '.cache', 'vicinae-mpd', 'art');
  return '/tmp/vicinae-mpd/art';
}

export function mimeToExt(mime: string | undefined): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    default:
      return 'jpg';
  }
}

// The complete set of extensions mimeToExt can produce. Cache probes
// (findCachedArt, findStreamArt) iterate this to locate a cached file
// without a readdir scan. Keep in sync with mimeToExt's codomain.
export const CACHE_EXTS = ['jpg', 'png', 'webp', 'gif'] as const;

export function cachePathFor(
  dir: string,
  uri: string,
  mime: string | undefined,
): string {
  const hash = createHash('sha1').update(uri).digest('hex');
  return join(dir, `${hash}.${mimeToExt(mime)}`);
}
