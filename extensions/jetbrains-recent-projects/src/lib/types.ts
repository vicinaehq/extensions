export type IdeId =
	| "idea"
	| "pycharm"
	| "webstorm"
	| "goland"
	| "clion"
	| "datagrip"
	| "phpstorm"
	| "rubymine"
	| "rider"
	| "rustrover"
	| "aqua"
	| "unknown";

export type ProjectEntry = {
	id: string;
	projectPath: string;
	title: string;
	ideId: IdeId;
	ideName: string;
	configDirName?: string;
	lastOpened?: number;
	toolboxScriptPath?: string;
	toolboxAppPath?: string;
};
