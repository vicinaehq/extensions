import {
  Action,
  ActionPanel,
  Icon,
  List,
  Color,
  showToast,
  Toast,
} from "@vicinae/api";
import {
  getCountries,
  getCities,
  connect,
  type Country,
  type City,
  ProtonVPNError,
} from "@/lib/protonvpn";
import { useProtonGuard, ProtonGuard } from "@/lib/guard";
import { useState, useEffect, useRef } from "react";

type ViewState = "countries" | "cities" | "features";

export default function ConnectToServer() {
  const guard = useProtonGuard();
  const [view, setView] = useState<ViewState>("countries");
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (guard.state !== "ready") return;
    let cancelled = false;
    setLoading(true);
    getCountries()
      .then((c) => {
        if (!cancelled) {
          setCountries(c);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ProtonVPNError
              ? err.message
              : "Failed to load countries",
          );
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [guard.state]);

  const loadCities = async (country: Country) => {
    setSelectedCountry(country);
    setLoading(true);
    try {
      const c = await getCities(country.code);
      setCities(c);
      setView("cities");
    } catch (err) {
      const msg =
        err instanceof ProtonVPNError ? err.message : "Failed to load cities";
      await showToast({ style: Toast.Style.Failure, title: msg });
    } finally {
      setLoading(false);
    }
  };

  const doConnect = async (opts: {
    country?: string;
    city?: string;
    p2p?: boolean;
    securecore?: boolean;
    tor?: boolean;
    random?: boolean;
  }) => {
    await showToast({ style: Toast.Style.Animated, title: "Connecting..." });
    try {
      const output = await connect(opts);

      // Parse "Connected to US-FREE#110 in Seattle, United States."
      const match = output.match(/Connected to (.+?) in (.+?)\./);
      const server = match ? match[1] : "VPN";
      const location = match ? match[2] : "";
      await showToast({
        style: Toast.Style.Success,
        title: `Connected to ${server}`,
        message: location || undefined,
      });
    } catch (err) {
      const msg =
        err instanceof ProtonVPNError ? err.message : "Connection failed";
      await showToast({ style: Toast.Style.Failure, title: msg });
    }
  };

  if (view === "features") {
    return (
      <List searchBarPlaceholder="Search connection type...">
        <List.Section title="Quick Connect">
          <List.Item
            title="Fastest Server"
            subtitle="Connect to the fastest available server"
            icon={Icon.Bolt}
            actions={
              <ActionPanel>
                <Action
                  title="Connect"
                  icon={Icon.Plug}
                  onAction={() => doConnect({})}
                />
                <Action
                  title="Back"
                  icon={Icon.ArrowLeft}
                  onAction={() => setView("countries")}
                  shortcut={{ modifiers: ["cmd"], key: "[" }}
                />
              </ActionPanel>
            }
          />
          <List.Item
            title="Random Server"
            subtitle="Connect to a random available server"
            icon={Icon.Shuffle}
            actions={
              <ActionPanel>
                <Action
                  title="Connect"
                  icon={Icon.Plug}
                  onAction={() => doConnect({ random: true })}
                />
                <Action
                  title="Back"
                  icon={Icon.ArrowLeft}
                  onAction={() => setView("countries")}
                  shortcut={{ modifiers: ["cmd"], key: "[" }}
                />
              </ActionPanel>
            }
          />
        </List.Section>
        <List.Section title="Specialty Servers">
          <List.Item
            title="P2P"
            subtitle="Best server for peer-to-peer"
            icon={Icon.TwoPeople}
            actions={
              <ActionPanel>
                <Action
                  title="Connect"
                  icon={Icon.Plug}
                  onAction={() => doConnect({ p2p: true })}
                />
                <Action
                  title="Back"
                  icon={Icon.ArrowLeft}
                  onAction={() => setView("countries")}
                  shortcut={{ modifiers: ["cmd"], key: "[" }}
                />
              </ActionPanel>
            }
          />
          <List.Item
            title="Secure Core"
            subtitle="Extra-secure multi-hop connection"
            icon={Icon.Shield01}
            actions={
              <ActionPanel>
                <Action
                  title="Connect"
                  icon={Icon.Plug}
                  onAction={() => doConnect({ securecore: true })}
                />
                <Action
                  title="Back"
                  icon={Icon.ArrowLeft}
                  onAction={() => setView("countries")}
                  shortcut={{ modifiers: ["cmd"], key: "[" }}
                />
              </ActionPanel>
            }
          />
          <List.Item
            title="Tor"
            subtitle="Route through the Tor network"
            icon={Icon.Lock}
            actions={
              <ActionPanel>
                <Action
                  title="Connect"
                  icon={Icon.Plug}
                  onAction={() => doConnect({ tor: true })}
                />
                <Action
                  title="Back"
                  icon={Icon.ArrowLeft}
                  onAction={() => setView("countries")}
                  shortcut={{ modifiers: ["cmd"], key: "[" }}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      </List>
    );
  }

  if (view === "cities") {
    return (
      <List
        isLoading={loading}
        searchBarPlaceholder={`Cities in ${selectedCountry?.name ?? ""}...`}
      >
        <List.Section title={`Cities in ${selectedCountry?.name}`}>
          {cities.map((city) => (
            <List.Item
              key={city.name}
              title={city.name}
              icon={Icon.Pin}
              actions={
                <ActionPanel>
                  <Action
                    title="Connect"
                    icon={Icon.Plug}
                    onAction={() => doConnect({ city: city.name })}
                  />
                  <Action
                    title="Back to Countries"
                    icon={Icon.ArrowLeft}
                    onAction={() => {
                      setView("countries");
                      setCities([]);
                    }}
                    shortcut={{ modifiers: ["cmd"], key: "[" }}
                  />
                </ActionPanel>
              }
            />
          ))}
          {cities.length === 0 && !loading && (
            <List.EmptyView
              title="No cities found"
              description="Try selecting a different country"
              icon={Icon.Globe01}
            />
          )}
        </List.Section>
      </List>
    );
  }

  return (
    <ProtonGuard state={guard.state} errorMsg={guard.errorMsg} onRefresh={guard.refresh}>
    <List isLoading={loading} searchBarPlaceholder="Search countries...">
      {error && (
        <List.Section title="Error">
          <List.Item
            title={error}
            icon={{ source: Icon.Warning, tintColor: Color.Yellow }}
          />
        </List.Section>
      )}

      <List.Section title="Quick Connect">
        <List.Item
          title="Fastest Server"
          subtitle="Connect to the fastest available server"
          icon={Icon.Bolt}
          actions={
            <ActionPanel>
              <Action
                title="Connect"
                icon={Icon.Plug}
                onAction={() => doConnect({})}
              />
              <Action
                title="Specialty Servers"
                icon={Icon.Cog}
                onAction={() => setView("features")}
                shortcut={{ modifiers: ["cmd"], key: "s" }}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Random Server"
          subtitle="Connect to a random available server"
          icon={Icon.Shuffle}
          actions={
            <ActionPanel>
              <Action
                title="Connect"
                icon={Icon.Plug}
                onAction={() => doConnect({ random: true })}
              />
              <Action
                title="Specialty Servers"
                icon={Icon.Cog}
                onAction={() => setView("features")}
                shortcut={{ modifiers: ["cmd"], key: "s" }}
              />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Browse by Country">
        {countries.map((country) => (
          <List.Item
            key={country.code}
            title={country.name}
            subtitle={country.code}
            icon={Icon.Globe01}
            actions={
              <ActionPanel>
                <Action
                  title="Browse Cities"
                  icon={Icon.ArrowRight}
                  onAction={() => loadCities(country)}
                />
                <Action
                  title="Connect to Country"
                  icon={Icon.Plug}
                  onAction={() => doConnect({ country: country.code })}
                  shortcut={{ modifiers: ["cmd"], key: "enter" }}
                />
                <Action
                  title="Specialty Servers"
                  icon={Icon.Cog}
                  onAction={() => setView("features")}
                  shortcut={{ modifiers: ["cmd"], key: "s" }}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
    </ProtonGuard>
  );
}
