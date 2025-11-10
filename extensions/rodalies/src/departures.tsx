import { useState, useEffect, useCallback } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  getPreferenceValues,
  LocalStorage,
} from "@vicinae/api";
import type {
  PreferenceValues,
  Station,
  TrainDeparture,
  ApiStation,
  StationsApiResponse,
} from "./types";

const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

export default function TrainSchedules() {
  // State
  const [departures, setDepartures] = useState<TrainDeparture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(
    null
  );
  const [stations, setStations] = useState<Station[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [stationsError, setStationsError] = useState<string | null>(null);

  const preferences = getPreferenceValues<PreferenceValues>();

  // Helper functions
  const getStationName = useCallback(
    (id: number) => {
      return stations.find((s) => s.id === id)?.nom || `Station ${id}`;
    },
    [stations]
  );

  const formatTime = useCallback((dateTime: string) => {
    return new Date(dateTime).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }, []);

  const formatDelay = useCallback((delay: number) => {
    if (delay === 0) return "";
    return delay > 0 ? `+${delay}min` : `${delay}min`;
  }, []);

  const loadLastStationFromStorage = useCallback(async () => {
    try {
      const lastStation = await LocalStorage.getItem(
        "renfe-rodalies-last-station"
      );
      if (lastStation && typeof lastStation === "string") {
        return parseInt(lastStation);
      }
    } catch (error) {
      console.error("Failed to load last station from LocalStorage:", error);
    }
    return null;
  }, []);

  const setSelectedStation = useCallback(
    async (stations: Station[]) => {
      const lastStationId = await loadLastStationFromStorage();
      if (lastStationId && stations.find((s) => s.id === lastStationId)) {
        setSelectedStationId(lastStationId);
      } else if (stations.length > 0) {
        setSelectedStationId(stations[0].id);
      }
    },
    [loadLastStationFromStorage]
  );

  const switchToStation = useCallback(async (stationId: number) => {
    setSelectedStationId(stationId);
    try {
      await LocalStorage.setItem(
        "renfe-rodalies-last-station",
        stationId.toString()
      );
    } catch (error) {
      console.error("Failed to save last station to LocalStorage:", error);
    }
  }, []);

  const fetchStationsFromAPI = useCallback(async (): Promise<Station[]> => {
    const allStations: ApiStation[] = [];
    let page = 0;
    const pageSize = 50;

    while (true) {
      const url = `https://serveisgrs.rodalies.gencat.cat/api/stations?lang=${preferences["api-language"]}&page=${page}&size=${pageSize}`;
      const response = await fetch(url);
      const data = (await response.json()) as StationsApiResponse;

      allStations.push(...data.included);
      if (data.last) break;
      page++;
    }

    return allStations
      .filter((station) =>
        station.connections.some(
          (connection) =>
            connection.type.id === "TRAIN" &&
            (connection.line?.id.startsWith("R") ||
              connection.line?.id.startsWith("RG"))
        )
      )
      .map((station) => ({
        id: parseInt(station.id),
        nom: station.name,
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [preferences]);

  const loadStations = useCallback(async () => {
    try {
      setStationsLoading(true);
      setStationsError(null);

      // Check cache
      const cachedStations = await LocalStorage.getItem(
        "renfe-rodalies-stations"
      );
      const cachedTimestamp = await LocalStorage.getItem(
        "renfe-rodalies-stations-timestamp"
      );
      const now = Date.now();

      if (
        cachedStations &&
        cachedTimestamp &&
        now - parseInt(cachedTimestamp as string) < CACHE_EXPIRY
      ) {
        try {
          const parsedStations = JSON.parse(cachedStations as string);
          setStations(parsedStations);
          await setSelectedStation(parsedStations);
          setStationsLoading(false);
          return;
        } catch (parseError) {
          console.error("Failed to parse cached stations:", parseError);
        }
      }

      // Fetch fresh data
      const rodaliesStations = await fetchStationsFromAPI();

      // Cache the stations
      await LocalStorage.setItem(
        "renfe-rodalies-stations",
        JSON.stringify(rodaliesStations)
      );
      await LocalStorage.setItem(
        "renfe-rodalies-stations-timestamp",
        now.toString()
      );

      setStations(rodaliesStations);
      await setSelectedStation(rodaliesStations);
    } catch (err) {
      setStationsError("Failed to fetch stations");
      console.error("Error fetching stations:", err);
      setStations([]);
    } finally {
      setStationsLoading(false);
    }
  }, [fetchStationsFromAPI, setSelectedStation]);

  const fetchDepartures = useCallback(async () => {
    if (!selectedStationId) return;

    try {
      setIsLoading(true);
      setError(null);

      const url = `https://serveisgrs.rodalies.gencat.cat/api/departures?stationId=${selectedStationId}&minute=60&fullResponse=true&lang=${preferences["api-language"]}`;
      const response = await fetch(url);
      const data: any = await response.json();

      if (data.trains && Array.isArray(data.trains)) {
        const sortedDepartures = data.trains
          .sort(
            (a: TrainDeparture, b: TrainDeparture) =>
              new Date(a.departureDateHourSelectedStation).getTime() -
              new Date(b.departureDateHourSelectedStation).getTime()
          )
          .slice(0, 10);

        setDepartures(sortedDepartures);
      } else {
        setDepartures([]);
        setError("No departures found for this station.");
      }
    } catch (err) {
      setError("Failed to fetch train departures");
      console.error("Error fetching departures:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStationId, preferences]);

  const refreshData = useCallback(() => {
    fetchDepartures();
  }, [fetchDepartures]);

  // Effects
  useEffect(() => {
    loadStations();
  }, [loadStations]);

  useEffect(() => {
    if (!selectedStationId) return;

    fetchDepartures();

    const refreshMinutes = parseInt(preferences["refresh-interval"]) || 5;
    const interval = setInterval(fetchDepartures, refreshMinutes * 60 * 1000);

    return () => clearInterval(interval);
  }, [selectedStationId, preferences, fetchDepartures]);

  return (
    <List
      isLoading={isLoading || stationsLoading}
      searchBarPlaceholder="Filter trains..."
      searchBarAccessory={
        !stationsLoading && stations.length > 0 ? (
          <List.Dropdown
            tooltip="Change Station"
            value={selectedStationId?.toString() || ""}
            onChange={(newValue) => switchToStation(parseInt(newValue))}
          >
            <List.Dropdown.Section title="Departure Station">
              {stations.map((station) => (
                <List.Dropdown.Item
                  key={station.id}
                  title={station.nom}
                  value={station.id.toString()}
                />
              ))}
            </List.Dropdown.Section>
          </List.Dropdown>
        ) : null
      }
    >
      {error ? (
        <List.EmptyView
          title="No Departures"
          description={error}
          icon={Icon.Train}
        />
      ) : departures.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No trains departing"
          description={`No trains departing from ${
            selectedStationId
              ? getStationName(selectedStationId)
              : "selected station"
          } in the next hour`}
          icon={Icon.Train}
        />
      ) : (
        <>
          <List.Section
            title={`Departures from ${
              selectedStationId
                ? getStationName(selectedStationId)
                : "Loading..."
            }`}
            subtitle={`Next ${departures.length} trains`}
          >
            {departures.map((departure, index) => (
              <List.Item
                key={index}
                title={`${formatTime(
                  departure.departureDateHourSelectedStation
                )} → ${departure.destinationStation.name}`}
                subtitle={`${departure.line.name} • ${departure.trainType}`}
                icon={Icon.Clock}
                accessories={[
                  {
                    text: formatDelay(departure.delay),
                    icon: departure.delay > 0 ? Icon.Warning : undefined,
                  },
                  {
                    text: departure.platformSelectedStation || "--",
                    icon: Icon.Train,
                  },
                ]}
              />
            ))}
          </List.Section>
        </>
      )}
    </List>
  );
}
