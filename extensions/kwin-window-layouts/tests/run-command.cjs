// Integration helper: only the Vicinae host API is substituted. Processes,
// temporary files and KWin D-Bus calls use the real system.
const { join } = require("node:path");
const childProcess = require("node:child_process");
const { root, loadSource } = require("./helpers.cjs");
const [layout, targetId, mode] = process.argv.slice(2);
const messages = [];
const controller = loadSource(join(root, "src/apply-layout.ts"), {
	"@vicinae/api": {
		environment: { assetsPath: join(root, "assets") },
		closeMainWindow: async () => {},
		showHUD: async (message) => messages.push(message),
		WindowManagement: {
			getActiveWindow: async () => {
				if (mode === "fallback") throw new Error("Test: tracker unavailable");
				return { id: targetId };
			},
		},
	},
	"node:child_process": {
		execFile(command, args, options, callback) {
			childProcess.execFile(command, args, options, (error, stdout, stderr) => {
				if (command === "kdotool" && stdout.trim() !== targetId) {
					callback(
						new Error(
							"Test window lost focus; refusing to resize another window",
						),
						"",
						"",
					);
					return;
				}
				callback(error, stdout, stderr);
			});
		},
	},
});
controller
	.applyLayout(layout)
	.then(() => console.log(JSON.stringify({ messages })));
