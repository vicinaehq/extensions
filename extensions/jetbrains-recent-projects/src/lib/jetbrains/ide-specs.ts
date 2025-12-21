import type { IdeId } from "../types";

export type IdeSpec = {
	ideId: IdeId;
	ideName: string;
	configDirPrefixes: string[];
	toolboxScriptNames: string[];
	toolboxAppCodes: string[];
};

export const IDE_SPECS: IdeSpec[] = [
	{
		ideId: "idea",
		ideName: "IntelliJ IDEA",
		configDirPrefixes: ["IntelliJIdea"],
		toolboxScriptNames: [
			"idea",
			"idea-ultimate",
			"idea-community",
			"ideaIU",
			"ideaIC",
		],
		toolboxAppCodes: ["IDEA-U", "IDEA-C"],
	},
	{
		ideId: "pycharm",
		ideName: "PyCharm",
		configDirPrefixes: ["PyCharm"],
		toolboxScriptNames: [
			"pycharm",
			"pycharm-professional",
			"pycharm-community",
			"pycharmPC",
			"pycharmCE",
		],
		toolboxAppCodes: ["PCP", "PCC", "PY"],
	},
	{
		ideId: "webstorm",
		ideName: "WebStorm",
		configDirPrefixes: ["WebStorm"],
		toolboxScriptNames: ["webstorm", "webstormWS"],
		toolboxAppCodes: ["WS"],
	},
	{
		ideId: "goland",
		ideName: "GoLand",
		configDirPrefixes: ["GoLand"],
		toolboxScriptNames: ["goland", "golandGO"],
		toolboxAppCodes: ["GO"],
	},
	{
		ideId: "clion",
		ideName: "CLion",
		configDirPrefixes: ["CLion"],
		toolboxScriptNames: ["clion", "clionCL"],
		toolboxAppCodes: ["CL"],
	},
	{
		ideId: "datagrip",
		ideName: "DataGrip",
		configDirPrefixes: ["DataGrip"],
		toolboxScriptNames: ["datagrip", "datagripDG"],
		toolboxAppCodes: ["DG"],
	},
	{
		ideId: "phpstorm",
		ideName: "PhpStorm",
		configDirPrefixes: ["PhpStorm"],
		toolboxScriptNames: ["phpstorm", "phpstormPS"],
		toolboxAppCodes: ["PS"],
	},
	{
		ideId: "rubymine",
		ideName: "RubyMine",
		configDirPrefixes: ["RubyMine"],
		toolboxScriptNames: ["rubymine", "rubymineRM"],
		toolboxAppCodes: ["RM"],
	},
	{
		ideId: "rider",
		ideName: "Rider",
		configDirPrefixes: ["Rider"],
		toolboxScriptNames: ["rider", "riderRD"],
		toolboxAppCodes: ["RD"],
	},
	{
		ideId: "rustrover",
		ideName: "RustRover",
		configDirPrefixes: ["RustRover"],
		toolboxScriptNames: ["rustrover", "rustroverRR"],
		toolboxAppCodes: ["RR"],
	},
	{
		ideId: "aqua",
		ideName: "Aqua",
		configDirPrefixes: ["Aqua"],
		toolboxScriptNames: ["aqua", "aquaQA"],
		toolboxAppCodes: ["QA"],
	},
];

export function inferIdeFromConfigDirName(configDirName: string): {
	ideId: IdeId;
	ideName: string;
	spec?: IdeSpec;
} {
	for (const spec of IDE_SPECS) {
		if (spec.configDirPrefixes.some((p) => configDirName.startsWith(p))) {
			return { ideId: spec.ideId, ideName: spec.ideName, spec };
		}
	}
	return { ideId: "unknown", ideName: "JetBrains IDE" };
}
