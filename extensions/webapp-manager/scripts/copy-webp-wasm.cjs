const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

async function main() {
	const packageJson = require("../package.json");
	const sourcePath = require.resolve("@cwasm/webp/webp.wasm");
	const extensionDirectory = path.join(
		os.homedir(),
		".local/share/vicinae/extensions",
		packageJson.name,
	);
	const targetPath = path.join(extensionDirectory, "webp.wasm");

	await fs.mkdir(extensionDirectory, { recursive: true });
	await fs.copyFile(sourcePath, targetPath);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});