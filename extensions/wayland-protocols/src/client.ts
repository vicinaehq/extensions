import { environment } from "@vicinae/api";
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';

type ProtocolInterface = {
	name: string;
	version: string;
};

export type Stability = 'stable' | 'staging' | 'unstable';
export type Source = "core" | "cosmic-protocols"|"external" | "hyprland-protocols" | "kde-protocols"|"river-protocols" | "treeland-protocols" | "wayland-protocols"|"weston-protocols" | "wlr-protocols"


export type ProtocolData = {
	id: string;
	name: string;
	source: Source;
	stability: Stability;
};

async function storeFile(filename: string, content: string) {
	const filepath = path.join(environment.supportPath, filename);
	await fsp.writeFile(filepath, content, 'utf8');
}

async function retrieveFile(filename: string): Promise<any | null> {
	const filepath = path.join(environment.supportPath, filename);
	try {
		const data = await fsp.readFile(filepath);
		return data;
	} catch(error) {
		return null;
	}
}

export async function fetchProtocols(): Promise<ProtocolData[]> {
	const fileData = await retrieveFile('protocols.json')

	if (fileData) return JSON.parse(fileData);

	const res = await fetch('https://wayland.app/protocols/data/protocols.json')
	const data = await res.json();

	await storeFile('protocols.json', JSON.stringify(data));
	return data;
}
