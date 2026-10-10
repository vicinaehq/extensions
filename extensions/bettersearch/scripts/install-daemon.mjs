// Installs the background daemon's runtime dependencies into assets/daemon,
// so the built extension is self-contained (`vici build` copies assets/ as is).
//
// By default npm installs only the native fff and ffi-rs binaries for the
// machine running the install. With --all-platforms, in CI, or with
// BETTERSEARCH_ALL_PLATFORMS=1, the binaries for every platform Vicinae
// supports are added too, producing one bundle that runs on Linux (x64/arm64,
// glibc/musl), macOS (x64/arm64) and Windows (x64/arm64).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DAEMON_DIR = join(ROOT, "assets", "daemon");

const TARGETS = [
	"linux-x64-gnu",
	"linux-arm64-gnu",
	"linux-x64-musl",
	"linux-arm64-musl",
	"darwin-x64",
	"darwin-arm64",
	"win32-x64",
	"win32-arm64",
];

// fff names Windows packages win32-x64, ffi-rs names them win32-x64-msvc.
const NATIVE_PACKAGES = TARGETS.flatMap((t) => [
	`@ff-labs/fff-bin-${t}`,
	`@yuuang/ffi-rs-${t.startsWith("win32") ? `${t}-msvc` : t}`,
]);

function npm(args, cwd) {
	// Inside an npm lifecycle script, reuse the npm that is running us.
	const cli = process.env.npm_execpath;
	const [cmd, argv] =
		cli && cli.endsWith(".js")
			? [process.execPath, [cli, ...args]]
			: ["npm", args];
	return execFileSync(cmd, argv, {
		cwd,
		stdio: ["ignore", "pipe", "inherit"],
		shell: cmd === "npm" && process.platform === "win32",
		encoding: "utf8",
	});
}

function installForThisMachine() {
	console.log("bettersearch: installing daemon dependencies");
	npm(["ci", "--omit=dev", "--no-audit", "--no-fund"], DAEMON_DIR);
}

function installAllPlatforms() {
	const lock = JSON.parse(readFileSync(join(DAEMON_DIR, "package-lock.json"), "utf8"));
	const scratch = mkdtempSync(join(tmpdir(), "bettersearch-native-"));

	try {
		for (const name of NATIVE_PACKAGES) {
			const entry = lock.packages[`node_modules/${name}`];
			if (!entry) throw new Error(`${name} is missing from assets/daemon/package-lock.json`);

			const dest = join(DAEMON_DIR, "node_modules", name);
			if (existsSync(join(dest, "package.json"))) continue;

			const out = JSON.parse(
				npm(["pack", `${name}@${entry.version}`, "--json", "--pack-destination", scratch], scratch),
			);
			// npm <= 11 prints an array, npm 12 an object keyed by package name.
			const packed = Array.isArray(out) ? out[0] : Object.values(out)[0];
			if (packed.integrity !== entry.integrity) {
				throw new Error(`${name}: integrity ${packed.integrity} does not match the lockfile`);
			}

			mkdirSync(dest, { recursive: true });
			execFileSync("tar", ["-xzf", join(scratch, packed.filename), "-C", dest, "--strip-components=1"]);
			console.log(`bettersearch: added ${name}@${entry.version}`);
		}
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

// A CI build, such as the Vicinae store's, produces one bundle that every user
// downloads, so it must contain every platform's binaries.
const allPlatforms =
	process.argv.includes("--all-platforms") ||
	process.env.CI === "true" ||
	process.env.BETTERSEARCH_ALL_PLATFORMS === "1";

installForThisMachine();
if (allPlatforms) installAllPlatforms();
