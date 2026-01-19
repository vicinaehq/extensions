import { vi } from 'vitest';

export const closeMainWindow = vi.fn();
export const showToast = vi.fn();
export const open = vi.fn();
export const environment = { sudo: false };
export const List = vi.fn(({ children }: { children: React.ReactNode }) => children);
export const Detail = vi.fn(({ markdown }: { markdown: string }) => markdown);
export const Form = vi.fn(({ children }: { children: React.ReactNode }) => children);
export const Action = vi.fn(({ title }: { title: string }) => title);
export const ActionPanel = vi.fn(({ children }: { children: React.ReactNode }) => children);
export const Icon = {
  CheckCircle: 'check-circle',
  Warning: 'warning',
  Document: 'document',
  Pencil: 'pencil',
  Clock: 'clock',
  ArrowUp: 'arrow-up',
  Gear: 'gear',
  Clipboard: 'clipboard',
  Folder: 'folder',
  Dot: 'dot',
  Trash: 'trash',
  Refresh: 'refresh',
  Book: 'book',
  Branch: 'branch',
  Cloud: 'cloud',
  Command: 'command',
  Cross: 'cross',
  DocumentText: 'document-text',
  Download: 'download',
  Edit: 'edit',
  Envelope: 'envelope',
  Eye: 'eye',
  Globe: 'globe',
  Graph: 'graph',
  Image: 'image',
  Link: 'link',
  Lock: 'lock',
  MagLeft: 'mag-left',
  Music: 'music',
  Play: 'play',
  Plus: 'plus',
  Search: 'search',
  Share: 'share',
  Sidebar: 'sidebar',
  Star: 'star',
  Tag: 'tag',
  Terminal: 'terminal',
  Text: 'text',
  ThreeBars: 'three-bars',
  Unlocked: 'unlocked',
  Upload: 'upload',
  Video: 'video',
  Wrench: 'wrench',
};
export const Color = {
  Primary: '#007AFF',
  Secondary: '#5856D6',
  Tertiary: '#AF52DE',
  Quaternary: '#FF2D55',
  Orange: '#FF9500',
  Yellow: '#FFCC00',
  Green: '#34C759',
  Red: '#FF3B30',
  Blue: '#007AFF',
  Purple: '#AF52DE',
  Pink: '#FF2D55',
  Gray: '#8E8E93',
  Grey: '#8E8E93',
};
export const LaunchType = {
  UserInitiated: 'user-initiated',
  Background: 'background',
  URLScheme: 'url-scheme',
  Doc: 'doc',
};
export const useNavigation = () => ({
  push: vi.fn(),
  pop: vi.fn(),
  replace: vi.fn(),
});
export const useForm = vi.fn();
export const Clipboard = {
  copy: vi.fn(),
  paste: vi.fn(),
};
export const showHUD = vi.fn();
export const showFailureToast = vi.fn();
