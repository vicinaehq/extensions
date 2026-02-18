export interface JackettTorrent {
  FirstSeen: string;
  Tracker: string;
  TrackerId: string;
  Category: number[];
  CategoryDesc: string;
  Description: string;
  Details: string;
  DownloadVolumeFactor: number;
  Gain: number;
  Grabs: number;
  Guid: string;
  Languages: string[];
  MinimumRatio: number;
  MinimumSeedTime: number;
  Peers: number;
  PublishDate: string;
  Seeders: number;
  Size: number;
  Subs: string[];
  Title: string;
  TrackerType: string;
  UploadVolumeFactor: number;
  Link?: string;
  MagnetUri?: string;
}

export interface JackettResponse {
  Results: JackettTorrent[];
}

export interface PreferenceValues {
  'jackett-url': string;
  'api-key': string;
  'min-seeders': string;
  'categories': string;
  'trackers': string;
}

export interface SearchParams {
  query: string;
  url: string;
  apiKey: string;
  categories?: string;
  trackers?: string;
}
