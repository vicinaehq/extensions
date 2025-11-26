import React from "react";
import { Detail } from "@vicinae/api";
import { IfCliCommandSucceeds } from "./components/cli-check";
import { RecordingControl } from "./components/recording-control";

export default function Extension() {
	return (
		<IfCliCommandSucceeds
			command="wf-recorder --help"
			onSuccess={<RecordingControl />}
			onFail={
				<Detail
					markdown={`
# Please install \`wf-recorder\` to use this extension

\`wf-recorder\` is a Wayland screen recorder that works with wlroots-based compositors.

Upstream repository: https://github.com/ammen99/wf-recorder
Arch package: https://archlinux.org/packages/extra/x86_64/wf-recorder/
NixOS package: https://search.nixos.org/packages?channel=25.05&show=wf-recorder&query=wf-recorder
Debian package: https://packages.debian.org/sid/wf-recorder
`}
				/>
			}
		/>
	);
}
