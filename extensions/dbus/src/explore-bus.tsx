import { useEffect, useMemo, useRef, useState } from "react";
import {
	List,
	ActionPanel,
	Action,
	Icon,
	Color,
	ImageLike,
	Detail,
	clearSearchBar,
	showToast,
	Toast,
	getPreferenceValues,
	Preferences,
} from "@vicinae/api";
import {
	type MessageBus,
	type ProxyObject,
	systemBus,
	sessionBus,
} from "dbus-next";
import { XMLParser } from "fast-xml-parser";

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

type IntrospectionMethodArgument = {
	name: string;
	type: string;
};

type IntrospectionMethod = {
	name: string;
	in: IntrospectionMethodArgument[];
	out: IntrospectionMethodArgument[];
};

type IntrospectionInterface = {
	name: string;
	methods: IntrospectionMethod[];
	signals: IntrospectionSignal[];
};

type IntrospectionSignal = {
	name: string;
	args: { name: string; type: string }[];
};

type Introspection = {
	interfaces: IntrospectionInterface[];
	nodes: DBusNode[];
	xml: string;
};

type DBusNode = {
	object: ProxyObject;
	name: string;
	path: string;
	introspection?: Introspection;
};

const parseXMLNode = (xml: string): any => {
	const tags = ["interface", "method", "arg", "node", "signal"];
	const parser = new XMLParser({
		allowBooleanAttributes: true,
		ignoreAttributes: false,
		isArray: (tagName) => tags.includes(tagName),
	});
	return parser.parse(xml);
};

const introspect = async (
	object: ProxyObject,
	{
		recursive = false,
		ignoreStandardInterfaces = true,
		ignoreEmptyInterfaces = true,
	}: {
		recursive?: boolean;
		ignoreEmptyInterfaces?: boolean;
		ignoreStandardInterfaces?: boolean;
	},
): Promise<DBusNode> => {
	const introface = "org.freedesktop.DBus.Introspectable";
	const stdPrefix = "org.freedesktop.DBus";
	const dbusNode: DBusNode = { name: object.name, path: object.path, object };

	if (!object.interfaces[introface]) {
		return dbusNode;
	}

	const intro = object.getInterface(introface);
	const xml = await intro.Introspect();

	const obj = parseXMLNode(xml);
	const node = obj.node[0];
	const ifaces = node.interface;

	let interfaces = (ifaces?.map((iface: any) => ({
		name: iface["@_name"],
		signals: (iface.signal ?? []).map((signal: any) => ({
			name: signal["@_name"],
			args:
				signal.arg?.map((arg: any) => ({
					type: arg["@_type"],
					name: arg["@_name"],
				})) ?? [],
		})),
		methods:
			iface.method?.map((method: any) => ({
				name: method["@_name"],
				in:
					method.arg
						?.filter((arg: any) => arg["@_direction"] === "in")
						?.map((arg: any) => ({
							type: arg["@_type"],
							name: arg["@_name"],
						})) ?? [],
				out:
					method.arg
						?.filter((arg: any) => arg["@_direction"] === "out")
						?.map((arg: any) => ({
							type: arg["@_type"],
							name: arg["@_name"],
						})) ?? [],
			})) ?? [],
	})) ?? []) as IntrospectionInterface[];

	interfaces = interfaces.filter((iface) => {
		if (ignoreEmptyInterfaces && iface.methods.length === 0) return false;
		if (ignoreStandardInterfaces && iface.name.startsWith(stdPrefix))
			return false;
		return true;
	});

	const nodes: DBusNode[] = [];
	const introspection: Introspection = {
		interfaces,
		nodes,
		xml,
	};

	for (const n of node.node ?? []) {
		const name = n["@_name"];
		const path = `${object.path === "/" ? "" : object.path}/${name}`;
		const obj = await object.bus.getProxyObject(object.name, path);

		if (!recursive) {
			nodes.push({ name, path, object });
			continue;
		}

		const newNode = await introspect(obj, {
			recursive,
			ignoreStandardInterfaces,
		});

		if (newNode.introspection) {
			if (newNode.introspection.interfaces.length === 0) {
				introspection.nodes.push(...newNode.introspection.nodes);
				continue;
			}
		}

		nodes.push(newNode);
	}

	dbusNode.introspection = introspection;

	return dbusNode;
};

const useServices = (bus: MessageBus) => {
	const [services, setServices] = useState<DBusNode[]>([]);
	const [loading, setLoading] = useState(true);

	const refresh = () => {
		setLoading(true);
		fetchServices()
			.then(setServices)
			.finally(() => setLoading(false));
	};

	const fetchServices = async () => {
		const names = await listWellKnownNames(bus);
		const pp = names.map<Promise<DBusNode>>(async (name) => {
			const object = await bus.getProxyObject(name, "/");
			return introspect(object, {
				recursive: false,
			});
		});

		return Promise.all(pp);
	};

	useEffect(() => {
		refresh();
	}, [bus]);

	return { services, loading, refresh };
};

type BusOption = {
	name: string;
	bus: MessageBus;
};

const busList: BusOption[] = [
	{ name: "Session Bus", bus: sessionBus() },
	{ name: "System Bus", bus: systemBus() },
];

type BusSelectorProps = {
	onChange?: (bus: BusOption) => void;
};

const BusSelector = (props: BusSelectorProps) => {
	const handleChange = (id: string) => {
		const option = busList.find((o) => o.name === id);
		props.onChange?.(option!);
	};

	return (
		<List.Dropdown onChange={handleChange}>
			{busList.map((bus) => (
				<List.Dropdown.Item key={bus.name} title={bus.name} value={bus.name} />
			))}
		</List.Dropdown>
	);
};

const INTERFACE_ICON: ImageLike = { source: Icon.Info, tintColor: Color.Blue };

const MethodItem = ({
	method,
}: {
	method: IntrospectionMethod;
	path: string;
}) => {
	const buildSignature = (method: IntrospectionMethod) => {
		const params = method.in
			.map((arg) => (arg.name ? `${arg.name}: ${arg.type}` : arg.type))
			.join(", ");
		const ret = method.out.map((arg) => arg.type);
		let base = `${method.name}(${params})`;
		if (ret.length > 0) base += ` => ${ret}`;
		return base;
	};

	const sig = buildSignature(method);

	return (
		<List.Item
			title={buildSignature(method)}
			icon={{ source: Icon.Box, tintColor: Color.Magenta }}
			actions={
				<ActionPanel>
					<Action.CopyToClipboard title="Copy signature" content={sig} />
					<Action.CopyToClipboard
						title="Copy input type chain"
						content={method.in.map((s) => s.type).join("")}
					/>
					<Action.CopyToClipboard
						title="Copy output type chain"
						content={method.out.map((s) => s.type).join("")}
					/>
				</ActionPanel>
			}
		/>
	);
};

const SignalItem = ({ signal }: { signal: IntrospectionSignal }) => {
	const buildSignature = (signal: IntrospectionSignal) => {
		const params = signal.args
			.map((arg) => (arg.name ? `${arg.name}: ${arg.type}` : arg.type))
			.join(", ");
		return `${signal.name}(${params})`;
	};

	const sig = buildSignature(signal);

	return (
		<List.Item
			title={buildSignature(signal)}
			icon={{ source: Icon.Signal3, tintColor: Color.Green }}
			actions={
				<ActionPanel>
					<Action.CopyToClipboard title="Copy signature" content={sig} />
				</ActionPanel>
			}
		/>
	);
};

const InterfaceBrowser = ({
	iface,
	path,
}: {
	iface: IntrospectionInterface;
	path: string;
	name: string;
}) => {
	return (
		<List navigationTitle={path} searchBarPlaceholder={"Browse methods..."}>
			<List.EmptyView
				icon={Icon.Box}
				title="No match"
				description="Try refining your search"
			/>
			<List.Section title={`${iface.signals.length} signals`}>
				{iface.signals.map((signal) => (
					<SignalItem signal={signal} />
				))}
			</List.Section>
			<List.Section title={`${iface.methods.length} methods`}>
				{iface.methods.map((method) => (
					<MethodItem path={path} method={method} />
				))}
			</List.Section>
		</List>
	);
};

const useIntrospection = (object: ProxyObject) => {
	const [node, setNode] = useState<DBusNode | null>(null);
	const [loading, setLoading] = useState(true);
	const preferences = getPreferenceValues<Preferences.ExploreBus>();
	const ignoreStandardInterfaces =
		preferences["ignore-standard-interfaces"] ?? true;

	const refresh = () => {
		setLoading(true);
		introspect(object, { recursive: true, ignoreStandardInterfaces })
			.then(setNode)
			.finally(() => setLoading(false));
	};

	useEffect(() => {
		refresh();
	}, [object]);

	return { node, loading };
};

/**
 * Recursively parse the top level node.
 * We don't do it from the get go on loading the command to minimize startup time.
 */
const TopLevelNodeBrowser = (props: { node: DBusNode }) => {
	const { node, loading } = useIntrospection(props.node.object);

	if (loading) {
		return (
			<List isLoading={loading} searchBarPlaceholder={"Introspecting..."} />
		);
	}

	if (!node) {
		return (
			<List>
				<List.EmptyView
					title="Loading..."
					icon={"💣"}
					description={`Failed to retrieve node data`}
				/>
			</List>
		);
	}

	return <NodeBrowser node={node} />;
};

const NodeBrowser = ({ node }: { node: DBusNode }) => {
	if (!node.introspection) {
		return (
			<List>
				<List.EmptyView
					title="No introspection"
					icon={Icon.XMarkCircle}
					description={`No introspection data is available for this service at "${node.path}"`}
				/>
			</List>
		);
	}

	if (
		node.introspection.interfaces.length === 0 &&
		node.introspection.nodes.length === 0
	) {
		return (
			<List>
				<List.EmptyView
					title="Empty node"
					icon={Icon.XMarkCircle}
					description={`This node as no interfaces or no child node.`}
				/>
			</List>
		);
	}

	return (
		<List
			navigationTitle={node.path}
			searchBarPlaceholder={"Browse interfaces and nodes..."}
		>
			<List.Section title="Interfaces">
				{node.introspection?.interfaces.map((iface) => (
					<List.Item
						title={iface.name}
						icon={{ source: Icon.Info, tintColor: Color.Blue }}
						accessories={[
							{
								tag: {
									value: `${iface.methods.length} Methods`,
									color: Color.Magenta,
								},
								icon: Icon.Box,
							},
							{
								tag: {
									value: `${iface.signals.length} Signals`,
									color: Color.Green,
								},
								icon: Icon.Signal1,
							},
						]}
						actions={
							<ActionPanel>
								<Action.Push
									title={`Browse methods`}
									target={
										<InterfaceBrowser
											name={node.name}
											path={node.path}
											iface={iface}
										/>
									}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
			<List.Section title="Nodes">
				{node.introspection.nodes.map((node) => (
					<List.Item
						title={node.path}
						icon={{
							source: Icon.Box,
							tintColor: node.introspection ? Color.Orange : Color.PrimaryText,
						}}
						accessories={
							node.introspection && [
								{
									tag: {
										value: `${node.introspection?.interfaces.length} Interfaces`,
										color: Color.Blue,
									},
									icon: Icon.Info,
								},
							]
						}
						actions={
							<ActionPanel>
								<Action.Push
									title={`Browse interfaces`}
									target={<NodeBrowser node={node} />}
								/>
								{node.introspection && (
									<Action.Push
										title={"Show Introspection XML"}
										target={
											<IntrospectionXmlView xml={node.introspection.xml} />
										}
									/>
								)}
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
};

const IntrospectionXmlView = ({ xml }: { xml: string }) => {
	const [text, setText] = useState(xml);
	const wrapCode = (s: string) => `\`\`\`\n${s}\n\`\`\``;

	return (
		<Detail
			markdown={wrapCode(text)}
			actions={
				<ActionPanel>
					<Action
						title="Toggle as JSON"
						onAction={() => setText(JSON.stringify(parseXMLNode(xml), null, 2))}
					/>
				</ActionPanel>
			}
		/>
	);
};

const ServiceItem = ({ node }: { node: DBusNode }) => {
	return (
		<List.Item
			key={node.name}
			id={node.name}
			title={node.name}
			icon={{
				source: Icon.Box,
				tintColor: node.introspection ? Color.Orange : Color.PrimaryText,
			}}
			actions={
				<ActionPanel>
					<Action.Push
						title={`Browse interfaces`}
						icon={INTERFACE_ICON}
						target={<TopLevelNodeBrowser node={node} />}
					/>
					<Action.CopyToClipboard title="Copy name" content={node.name} />
				</ActionPanel>
			}
			accessories={[]}
		/>
	);
};

const ServiceSection = ({
	title,
	services,
}: {
	title: string;
	services: DBusNode[];
}) => {
	return (
		<List.Section title={`${title}`}>
			{services.map((service) => (
				<ServiceItem node={service} />
			))}
		</List.Section>
	);
};

const groupServices = (services: DBusNode[]) => {
	const introspectables = [];
	const nonIntrospectables = [];
	for (const service of services) {
		if (service.introspection) introspectables.push(service);
		else nonIntrospectables.push(service);
	}
	return { introspectables, nonIntrospectables };
};

const useGroupedServices = (nodes: DBusNode[]) =>
	useMemo(() => groupServices(nodes), [nodes]);

export default function SimpleList() {
	const [bus, setBus] = useState<BusOption>(busList[0]);
	const { services, loading } = useServices(bus.bus);
	const { introspectables, nonIntrospectables } = useGroupedServices(services);

	return (
		<List
			searchBarPlaceholder="Search services..."
			searchBarAccessory={
				<BusSelector
					onChange={(bus) => {
						setBus(bus);
						clearSearchBar();
					}}
				/>
			}
			isLoading={loading}
		>
			{!loading && (
				<List.EmptyView
					title={"No match"}
					description="No service on the bus matches this query. You can change the current bus using the selector."
				/>
			)}
			<ServiceSection title="Introspectable" services={introspectables} />
			<ServiceSection
				title="Non Introspectable"
				services={nonIntrospectables}
			/>
		</List>
	);
}
