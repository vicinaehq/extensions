import { Action, ActionPanel, Icon, List, Toast, showToast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { type Status, cities, connect, countries, disconnect, errorText, flag, pretty, status } from "./lib";

async function run(title: string, task: () => Promise<unknown>, done: (result: unknown) => string, after: () => void) {
  const toast = await showToast({ style: Toast.Style.Animated, title });
  try {
    toast.title = done(await task());
    toast.style = Toast.Style.Success;
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "NordVPN failed";
    toast.message = errorText(e);
  }
  after();
}

const connectTo = (target: string[], after: () => void) =>
  run(`Connecting${target.length ? ` to ${pretty(target[target.length - 1])}` : ""}…`, () => connect(...target), (s) => `Connected to ${s}`, after);

function Cities({ country, onChange }: { country: string; onChange: () => void }) {
  const [list, setList] = useState<string[]>();
  useEffect(() => {
    cities(country).then(setList, (e) => {
      setList([]);
      showToast({ style: Toast.Style.Failure, title: `Couldn't list cities in ${pretty(country)}`, message: errorText(e) });
    });
  }, [country]);

  const fastest = <Action title={`Connect to ${pretty(country)} (fastest)`} icon={Icon.Bolt} onAction={() => connectTo([country], onChange)} />;
  return (
    <List isLoading={!list} navigationTitle={`${flag(country)} ${pretty(country)}`} searchBarPlaceholder={`Search cities in ${pretty(country)}…`}>
      <List.Section title={pretty(country)}>
        <List.Item
          title={`Fastest server in ${pretty(country)}`}
          subtitle={list?.length === 0 ? "NordVPN lists no cities here" : "NordVPN picks the city"}
          icon={Icon.Bolt}
          actions={<ActionPanel>{fastest}</ActionPanel>}
        />
      </List.Section>
      <List.Section title={list ? `Cities (${list.length})` : "Cities"}>
        {list?.map((city) => (
          <List.Item
            key={city}
            title={pretty(city)}
            icon={Icon.Pin}
            actions={
              <ActionPanel>
                <Action title={`Connect to ${pretty(city)}`} icon={Icon.Plug} onAction={() => connectTo([country, city], onChange)} />
                {fastest}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

export default function Command() {
  const [st, setSt] = useState<Status | null>(); // undefined: loading, null: daemon unreachable
  const [list, setList] = useState<string[]>([]);
  const refresh = () => status().then(setSt, () => setSt(null));

  useEffect(() => {
    refresh();
    countries().then(setList, (e) =>
      showToast({ style: Toast.Style.Failure, title: "Couldn't list NordVPN countries", message: errorText(e) }),
    );
  }, []);

  return (
    <List isLoading={st === undefined} searchBarPlaceholder="Search countries…">
      <List.Section title="Status">
        {st?.connected ? (
          <List.Item
            title={`Connected · ${[st.city, st.country].filter(Boolean).join(", ")}`}
            subtitle={[st.server, st.ip].filter(Boolean).join("  ·  ")}
            icon={Icon.Lock}
            accessories={st.uptime ? [{ text: `up ${st.uptime}` }] : []}
            actions={
              <ActionPanel>
                <Action title="Disconnect" icon={Icon.XMarkCircle} onAction={() => run("Disconnecting…", disconnect, () => "Disconnected", refresh)} />
                <Action title="Reconnect (fastest server)" icon={Icon.ArrowClockwise} onAction={() => connectTo([], refresh)} />
              </ActionPanel>
            }
          />
        ) : (
          <List.Item
            title={st === null ? "NordVPN not reachable" : "Disconnected"}
            subtitle={st === null ? "Install the NordVPN app and start nordvpnd (systemctl enable --now nordvpnd)" : "Enter: connect to the fastest server"}
            icon={Icon.LockUnlocked}
            actions={
              <ActionPanel>
                <Action title="Connect (fastest server)" icon={Icon.Bolt} onAction={() => connectTo([], refresh)} />
              </ActionPanel>
            }
          />
        )}
      </List.Section>
      <List.Section title="Countries">
        {list.map((c) => (
          <List.Item
            key={c}
            title={`${flag(c)}  ${pretty(c)}`}
            keywords={[pretty(c)]}
            accessories={st?.connected && pretty(c) === st.country ? [{ text: "connected" }] : []}
            actions={
              <ActionPanel>
                <Action.Push title="Show Cities" icon={Icon.Pin} target={<Cities country={c} onChange={refresh} />} />
                <Action title={`Connect to ${pretty(c)} (fastest)`} icon={Icon.Bolt} onAction={() => connectTo([c], refresh)} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
