import type { Layout } from './types';

export const AVAILABLE_LAYOUTS = [
  'master',
  'dwindle',
  'scrolling',
  'monocle',
] as const;

export const LAYOUT_SUBTITLES: Record<Layout, string> = {
  dwindle: 'BSPWM-like binary tree',
  master: 'dwm-like master and stack',
  scrolling: 'Niri-like infinite scrolling',
  monocle: 'One window at a time, fullscreen',
} as const;

export const LAYOUT_DOC_LINKS: Record<Layout, string> = {
  dwindle: 'https://wiki.hypr.land/Configuring/Layouts/Dwindle-Layout/',
  master: 'https://wiki.hypr.land/Configuring/Layouts/Master-Layout/',
  scrolling: 'https://wiki.hypr.land/Configuring/Layouts/Scrolling-Layout/',
  monocle: 'https://wiki.hypr.land/Configuring/Layouts/Monocle-Layout/',
} as const;
