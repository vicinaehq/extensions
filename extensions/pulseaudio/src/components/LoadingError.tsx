import { Icon, List } from "@vicinae/api";

export const LoadingError = () => {
  return (
    <List.EmptyView
    actions
      title="Unable to load audio devices"
      description={[
        "This command requires the `pactl` CLI tool and a running PulseAudio/PipeWire-Pulse server.",
        "",
        "1) Install `pactl`:",
        "- Fedora: sudo dnf install pulseaudio-utils",
        "- Debian/Ubuntu: sudo apt install pulseaudio-utils",
        "- Arch: sudo pacman -S libpulse",
        "",
        "2) If `pactl` is installed but still fails, ensure your audio server is running (PipeWire/PulseAudio), then press Refresh.",
      ].join("\n")}
      icon={Icon.Warning}
    />
  );
};
