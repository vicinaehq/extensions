import type { Image } from '@vicinae/api';
import type { BwItem, ItemTypeValue } from './bitwarden-types';
import { ItemType } from './bitwarden-types';
import { extractHostname } from './favicons';
import type { FaviconMap } from './favicons';

const SVG_PATHS: Partial<Record<ItemTypeValue, string>> = {
  [ItemType.Login]:
    'M7.5 5.5a3 3 0 1 1 3 3h-.75a.75.75 0 0 0-.53.22L7.44 10.5H6.25a.75.75 0 0 0-.75.75v1.136L4.43 13.5H2.5v-.593c0-.862.342-1.689.952-2.298L7.28 6.78a.75.75 0 0 0 .22-.53zm3-4.5A4.5 4.5 0 0 0 6 5.5v.439L2.39 9.55A4.75 4.75 0 0 0 1 12.906v1.343c0 .414.336.75.75.75h3a.75.75 0 0 0 .541-.23l1.5-1.563a.75.75 0 0 0 .209-.52V12h.75a.75.75 0 0 0 .53-.22L10.06 10h.44a4.5 4.5 0 1 0 0-9m.5 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2',
  [ItemType.Card]:
    'M3.75 3.5c-.69 0-1.25.56-1.25 1.25V6h11V4.75c0-.69-.56-1.25-1.25-1.25zm9.75 4h-11v3.75c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25zM1 4.75A2.75 2.75 0 0 1 3.75 2h8.5A2.75 2.75 0 0 1 15 4.75v6.5A2.75 2.75 0 0 1 12.25 14h-8.5A2.75 2.75 0 0 1 1 11.25zm3 5A.75.75 0 0 1 4.75 9h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 4 9.75',
  [ItemType.Identity]:
    'M8 2.5A1.75 1.75 0 1 0 8 6a1.75 1.75 0 0 0 0-3.5M4.75 4.25a3.25 3.25 0 1 1 6.5 0 3.25 3.25 0 0 1-6.5 0M8 10c-2.034 0-3.771.948-4.44 2.58-.087.213-.046.402.11.576.173.194.479.344.83.344h7c.351 0 .657-.15.83-.344.156-.174.197-.363.11-.576C11.772 10.948 10.034 10 8 10m-5.828 2.012C3.135 9.662 5.544 8.5 8 8.5s4.865 1.161 5.828 3.512c.332.81.109 1.598-.38 2.144-.473.528-1.193.844-1.947.844H4.499c-.754 0-1.474-.316-1.947-.844-.489-.546-.712-1.334-.38-2.144',
  [ItemType.SecureNote]:
    'M4.75 2.5c-.69 0-1.25.56-1.25 1.25v8.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V7H9.75A1.75 1.75 0 0 1 8 5.25V2.5zm4.75.81v1.94c0 .138.112.25.25.25h1.94zM2 3.75A2.75 2.75 0 0 1 4.75 1h3.836c.464 0 .909.184 1.237.513l3.664 3.664c.329.328.513.773.513 1.237v5.836A2.75 2.75 0 0 1 11.25 15h-6.5A2.75 2.75 0 0 1 2 12.25z',
};

const TYPE_COLORS: Partial<Record<ItemTypeValue, { light: string; dark: string }>> = {
  [ItemType.Login]: { light: '#1F6FEB', dark: '#2F6FED' },
  [ItemType.Card]: { light: '#3A9C61', dark: '#3A9C61' },
  [ItemType.Identity]: { light: '#DA8A48', dark: '#F0883E' },
  [ItemType.SecureNote]: { light: '#A48ED6', dark: '#BC8CFF' },
};

export function buildIcon(path: string, color: { light: string; dark: string }): Image.ImageLike {
  const makeSvg = (bg: string) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect rx="4" ry="4" width="16" height="16" fill="${bg}"/><g transform="translate(2.4,2.4) scale(0.7)"><path fill="#fff" fill-rule="evenodd" d="${path}"/></g></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  };
  return { source: { light: makeSvg(color.light), dark: makeSvg(color.dark) } };
}

function buildPlaceholderIcon(type: ItemTypeValue): Image.ImageLike {
  const path = SVG_PATHS[type];
  const color = TYPE_COLORS[type];
  if (!path || !color) return 'circle';
  return buildIcon(path, color);
}

function isImageWithSource(
  value: Image.ImageLike,
): value is { source: { light: string; dark: string } } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'source' in value &&
    typeof value.source === 'object' &&
    value.source !== null
  );
}

export function itemIcon(item: BwItem, favicons?: FaviconMap): Image.ImageLike {
  if (item.type !== ItemType.Login) return buildPlaceholderIcon(item.type);

  const hostname = extractHostname(item.login?.uris);
  if (!hostname) return buildPlaceholderIcon(item.type);

  const cached = favicons?.[hostname];
  if (cached === undefined || cached === '') return buildPlaceholderIcon(item.type);

  const fallback = buildPlaceholderIcon(ItemType.Login);
  if (isImageWithSource(fallback)) {
    return {
      source: cached,
      fallback: fallback.source,
    };
  }
  return { source: cached };
}
