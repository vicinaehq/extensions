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
  getConfig,
  setConfig,
  type ConfigSetting,
  ProtonVPNError,
} from "@/lib/protonvpn";
import { useState, useEffect } from "react";

function prettifyName(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const SETTINGS_INFO: Record<
  string,
  { label: string; options: { label: string; value: string }[] }
> = {
  netshield: {
    label: "NetShield",
    options: [
      { label: "Off", value: "off" },
      { label: "Block Malware", value: "malware" },
      { label: "Block Malware + Ads", value: "malware-ads" },
      {
        label: "Block Malware + Ads + Trackers",
        value: "malware-ads-trackers",
      },
    ],
  },
  "kill-switch": {
    label: "Kill Switch",
    options: [
      { label: "Off", value: "off" },
      { label: "Standard", value: "standard" },
    ],
  },
  ipv6: {
    label: "IPv6",
    options: [
      { label: "Off", value: "off" },
      { label: "On", value: "on" },
    ],
  },
  "port-forwarding": {
    label: "Port Forwarding",
    options: [
      { label: "Off", value: "off" },
      { label: "On", value: "on" },
    ],
  },
  "custom-dns": {
    label: "Custom DNS",
    options: [
      { label: "Off", value: "off" },
      { label: "On", value: "on" },
    ],
  },
  "vpn-accelerator": {
    label: "VPN Accelerator",
    options: [
      { label: "Off", value: "off" },
      { label: "On", value: "on" },
    ],
  },
  "moderate-nat": {
    label: "Moderate NAT",
    options: [
      { label: "Off", value: "off" },
      { label: "On", value: "on" },
    ],
  },
  "anonymous-crash-reports": {
    label: "Anonymous Crash Reports",
    options: [
      { label: "Off", value: "off" },
      { label: "On", value: "on" },
    ],
  },
};

export default function Settings() {
  const [settings, setSettings] = useState<ConfigSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = () => {
    setLoading(true);
    getConfig()
      .then((s) => {
        setSettings(s);
        setLoading(false);
      })
      .catch((err) => {
        setError(
          err instanceof ProtonVPNError
            ? err.message
            : "Failed to load settings",
        );
        setLoading(false);
      });
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const updateSetting = async (
    settingName: string,
    value: string,
    label: string,
  ) => {
    await showToast({
      style: Toast.Style.Animated,
      title: `Setting ${label}...`,
    });
    try {
      await setConfig(settingName, value);
      await showToast({
        style: Toast.Style.Success,
        title: `${label} set to ${value}`,
      });
      loadSettings();
    } catch (err) {
      const msg =
        err instanceof ProtonVPNError
          ? err.message
          : "Failed to update setting";
      await showToast({ style: Toast.Style.Failure, title: msg });
    }
  };

  if (loading) {
    return <List isLoading />;
  }

  return (
    <List searchBarPlaceholder="Search settings...">
      {error && (
        <List.Section title="Error">
          <List.Item
            title={error}
            icon={{ source: Icon.Warning, tintColor: Color.Yellow }}
            actions={
              <ActionPanel>
                <Action
                  title="Retry"
                  icon={Icon.ArrowClockwise}
                  onAction={loadSettings}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      <List.Section title="Current Settings">
        {settings.map((setting) => {
          const info = SETTINGS_INFO[setting.name];
          return (
            <List.Item
              key={setting.name}
              title={info?.label ?? prettifyName(setting.name)}
              subtitle={
                setting.available ? setting.value : "Requires paid plan"
              }
              icon={setting.available ? Icon.Cog : Icon.Lock}
              accessories={[
                { text: setting.available ? setting.value : "Paid" },
                ...(setting.available
                  ? []
                  : [{ icon: { source: Icon.Lock, tintColor: Color.Yellow } }]),
              ]}
              actions={
                <ActionPanel>
                  {setting.available && info ? (
                    <>
                      {info.options.length === 2 && (
                        <Action
                          title={`Toggle to ${info.options.find((o) => o.value !== setting.value)?.label ?? info.options[0].label}`}
                          icon={Icon.Switch}
                          onAction={() => {
                            const next = info.options.find(
                              (o) => o.value !== setting.value,
                            );
                            if (next)
                              updateSetting(
                                setting.name,
                                next.value,
                                info?.label ?? setting.name,
                              );
                          }}
                          shortcut={{ modifiers: ["cmd"], key: "t" }}
                        />
                      )}
                      {info.options.map((opt) => (
                        <Action
                          key={opt.value}
                          title={`Set to ${opt.label}`}
                          icon={
                            setting.value === opt.value
                              ? Icon.Checkmark
                              : Icon.Circle
                          }
                          onAction={() =>
                            updateSetting(
                              setting.name,
                              opt.value,
                              info?.label ?? setting.name,
                            )
                          }
                        />
                      ))}
                    </>
                  ) : (
                    <Action
                      title="Upgrade to Enable"
                      icon={Icon.Lock}
                      onAction={() => {}}
                    />
                  )}
                  <Action
                    title="Refresh"
                    icon={Icon.ArrowClockwise}
                    onAction={loadSettings}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
