import React, { useEffect, useState } from "react";
import { List, ActionPanel, Action, showToast, Icon, Color } from "@vicinae/api";
import { MessageBus, sessionBus, sessionBus, systemBus } from "dbus-next";

const listWellKnownNames = async (bus: MessageBus) => {
	const obj = await bus.getProxyObject(
		"org.freedesktop.DBus",
		"/org/freedesktop/DBus",
	);
	const dbusInterface = obj.getInterface("org.freedesktop.DBus");

	const names = (await dbusInterface.ListNames()) as string[];

	console.log({ names });

	return names.filter((n) => !n.startsWith(":"));
};

const useServiceNames = (bus: MessageBus) => {
	const [names, setNames] = useState<string[]>([]);

	const refresh = () => {
		listWellKnownNames(bus).then(setNames);
	}

	useEffect(() => {
		listWellKnownNames(bus).then(setNames);
	}, [bus]);

	return { names, refresh };
};

type BusOption = {
	name: string,
	bus: MessageBus
};

const busList: BusOption[] = [
	{ name: 'Session', bus: sessionBus() },
	{ name: 'System', bus: systemBus() },
];

type BusSelectorProps = {
	onChange?: (bus: BusOption) => void;
};

const BusSelector = (props: BusSelectorProps) => {
	const handleChange = (id: string) => {
		const option = busList.find((o) => o.name === id);
		props.onChange?.(option!);
	}

	return (
		<List.Dropdown onChange={handleChange}>
			{busList.map((bus) => (
				<List.Dropdown.Item title={bus.name} value={bus.name} />
			))}
		</List.Dropdown>
	);
}

export default function SimpleList() {
	const [bus, setBus] = useState<BusOption>(busList[0]);
	const { names, refresh } = useServiceNames(bus.bus);
	const [xml, setXml] = useState<string | null>(null);

	const handleSelected = async (service: string) => {
		console.log('selected', service);
		try {
			const obj = await bus.bus.getProxyObject(service, '/');
			const introspectable = obj.getInterface('org.freedesktop.DBus.Introspectable');
			const xml = await introspectable.Introspect();
			setXml(xml);
		} catch (error) {
			setXml(null);
		}
	}

	const makeMd = (xml: string) => {
		return `\`\`\`xml
${xml}
\`\`\``
	}

	return (
		<List
			searchBarPlaceholder="Search services..."
			isShowingDetail={!!xml}
			onSelectionChange={(id) => {
				handleSelected(id);
			}}
			searchBarAccessory={
				<BusSelector onChange={setBus} />
			}
		>
			<List.Section title={"Services"}>
				{names.map((name) => (
					<List.Item
						key={name}
						id={name}
						title={name}
						icon={{ source: Icon.Box, tintColor: Color.Orange }}
						detail={xml && <List.Item.Detail markdown={makeMd(xml)} />}
					/>
				))}
			</List.Section>
		</List>
	);
}
