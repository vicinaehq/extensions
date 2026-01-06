export interface PreferenceValues {
  'jackett-url': string;
  'api-key': string;
  'sort-by': 'seeders' | 'size' | 'date';
  'min-seeders': string;
  'categories': string;
  'trackers': string;
  'default-action': 'magnet' | 'torrent';
}
