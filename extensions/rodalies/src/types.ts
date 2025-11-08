export interface TrainDeparture {
  departureDateHourSelectedStation: string;
  destinationStation: {
    id: number;
    name: string;
    accessible: boolean;
  };
  line: {
    id: string;
    name: string;
  };
  trainType: string;
  delay: number;
  platformSelectedStation: string | null;
  trainObservations: string;
  trainCancelled: boolean;
  trainAccessible: boolean;
}

export interface TrainSchedule {
  departsAtOrigin: string;
  arrivesAtDestination: string;
  duration: string;
  tipusTren?: string;
}

export interface RodaliesApiResponse {
  result?: {
    items: TrainSchedule[];
  };
  code?: string;
  args?: any[];
}

export interface StationConnection {
  id: string;
  description: {
    ca: string;
    es: string;
    en: string;
  };
  imageUrl: string;
  orderNumber: number;
  type: {
    id: string;
    description: {
      ca: string;
      es: string;
      en: string;
    };
  };
  line: {
    id: string;
    name: string;
  } | null;
}

export interface StationService {
  id: string;
  description: {
    ca: string;
    es: string;
    en: string;
  };
  imageUrl: string;
  orderNumber: number;
}

export interface ApiStation {
  id: string;
  name: string;
  accessible: boolean;
  latitude: number;
  longitude: number;
  position: string;
  connections: StationConnection[];
  services: StationService[];
}

export interface StationsApiResponse {
  total: number;
  limit: number;
  numberOfElements: number;
  offset: number;
  first: boolean;
  last: boolean;
  totalPages: number;
  page: number;
  included: ApiStation[];
}

export interface Station {
  id: number;
  nom: string;
}

export type PreferenceValues = {
  "refresh-interval": string;
  "api-language": string;
};
