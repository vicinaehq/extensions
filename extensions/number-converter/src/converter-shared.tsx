import React, { useMemo, useState } from "react";
import { Action, ActionPanel, List } from "@vicinae/api";

type Base = 2 | 8 | 10 | 16;

type Target = {
	base: Base;
	label: string;
	icon: string;
	padBinaryToEight: boolean;
};

type SourceMode = {
	base: Base;
	label: string;
	menuTitle: string;
	targets: Target[];
	validate: (value: string) => boolean;
};

const sourceModes: SourceMode[] = [
	{
		base: 2,
		label: "Binary",
		menuTitle: "Convert from Binary",
		validate: (value) => /^(?:0b)?[01]+$/i.test(value),
		targets: [
			{ base: 8, label: "Octal", icon: "oc.png", padBinaryToEight: false },
			{ base: 10, label: "Decimal", icon: "de.png", padBinaryToEight: false },
			{ base: 16, label: "Hex", icon: "he.png", padBinaryToEight: false },
		],
	},
	{
		base: 8,
		label: "Octal",
		menuTitle: "Convert from Octal",
		validate: (value) => /^(?:0o)?[0-7]+$/i.test(value),
		targets: [
			{ base: 2, label: "Binary", icon: "bi.png", padBinaryToEight: true },
			{ base: 10, label: "Decimal", icon: "de.png", padBinaryToEight: false },
			{ base: 16, label: "Hex", icon: "he.png", padBinaryToEight: false },
		],
	},
	{
		base: 10,
		label: "Decimal",
		menuTitle: "Convert from Decimal",
		validate: (value) => /^\d+$/.test(value),
		targets: [
			{ base: 2, label: "Binary", icon: "bi.png", padBinaryToEight: true },
			{ base: 8, label: "Octal", icon: "oc.png", padBinaryToEight: false },
			{ base: 16, label: "Hex", icon: "he.png", padBinaryToEight: false },
		],
	},
	{
		base: 16,
		label: "Hexadecimal",
		menuTitle: "Convert from Hex",
		validate: (value) => /^(?:0x)?[0-9a-f]+$/i.test(value),
		targets: [
			{ base: 2, label: "Binary", icon: "bi.png", padBinaryToEight: true },
			{ base: 8, label: "Octal", icon: "oc.png", padBinaryToEight: false },
			{ base: 10, label: "Decimal", icon: "de.png", padBinaryToEight: false },
		],
	},
];

function toBigInt(value: string, base: Base): bigint {
	let cleaned = value.trim();
	if (base === 2 && cleaned.toLowerCase().startsWith("0b")) cleaned = cleaned.slice(2);
	if (base === 8 && cleaned.toLowerCase().startsWith("0o")) cleaned = cleaned.slice(2);
	if (base === 16 && cleaned.toLowerCase().startsWith("0x")) cleaned = cleaned.slice(2);
	if (base === 10) return BigInt(cleaned);

	const prefix = base === 2 ? "0b" : base === 8 ? "0o" : "0x";
	return BigInt(`${prefix}${cleaned}`);
}

function formatBase(value: bigint, base: Base, padBinaryToEight = false): string {
	if (base === 16) return value.toString(16).toUpperCase();
	const rendered = value.toString(base);
	if (base === 2 && padBinaryToEight && rendered.length < 8) return rendered.padStart(8, "0");
	return rendered;
}

export function ConvertFromCommand({ sourceBase }: { sourceBase: Base }) {
	const sourceMode = sourceModes.find((mode) => mode.base === sourceBase);
	if (!sourceMode) {
		return <List />;
	}

	const [searchText, setSearchText] = useState("");
	const query = searchText.trim();
	const isValid = query.length === 0 ? true : sourceMode.validate(query);

	const results = useMemo(() => {
		if (!query || !isValid) return [];
		const numericValue = toBigInt(query, sourceMode.base);
		return sourceMode.targets.map((target) => ({
			id: `${sourceMode.base}-${target.base}`,
			title: formatBase(numericValue, target.base, target.padBinaryToEight),
			subtitle: `To ${target.label}`,
			icon: target.icon,
		}));
	}, [query, isValid, sourceMode]);

	return (
		<List
			searchText={searchText}
			onSearchTextChange={setSearchText}
			searchBarPlaceholder={`Enter ${sourceMode.label} value`}
			navigationTitle={sourceMode.menuTitle}
		>
			{query.length === 0 ? <List.EmptyView title={`Type ${sourceMode.label} number`} /> : null}

			{query.length > 0 && !isValid ? (
				<List.EmptyView
					title="Invalid format"
					description={`The entered value is not a valid ${sourceMode.label} number.`}
				/>
			) : null}

			{results.length > 0 ? (
				<List.Section title={`From ${sourceMode.label}`}>
					{results.map((item) => (
						<List.Item
							key={item.id}
							title={item.title}
							subtitle={item.subtitle}
							icon={item.icon}
							actions={
								<ActionPanel>
									<Action.CopyToClipboard content={item.title} />
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			) : null}
		</List>
	);
}
