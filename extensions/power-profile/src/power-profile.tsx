import React from "react";
import { Detail } from "@vicinae/api";
import { IfCliCommandSucceeds } from "./components/cli-check";
import { ProfileSelector } from "./components/profile-selector";

export default function Extension() {
	return (
		<IfCliCommandSucceeds
			command="powerprofilesctl"
			onSuccess={<ProfileSelector />}
			onFail={
				<Detail
					markdown={`
# Please install \`power-profiles-daemon\` to use this extension

- Upstream URL (with docs): [https://gitlab.freedesktop.org/upower/power-profiles-daemon](https://gitlab.freedesktop.org/upower/power-profiles-daemon)
- Arch package: [https://archlinux.org/packages/extra/x86_64/power-profiles-daemon/](https://archlinux.org/packages/extra/x86_64/power-profiles-daemon/)
- Nix package: [https://search.nixos.org/packages?channel=25.05&show=power-profiles-daemon&query=power-profiles-daemon](https://search.nixos.org/packages?channel=25.05&show=power-profiles-daemon&query=power-profiles-daemon)
- Debian package: [https://packages.debian.org/sid/power-profiles-daemon](https://packages.debian.org/sid/power-profiles-daemon)
`}
				/>
			}
		/>
	);
}
