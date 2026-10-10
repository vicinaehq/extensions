// Long-lived fff index server for the BetterSearch Vicinae extension.
// Vicinae runs each command in a throwaway worker, so the index lives here
// instead and the commands talk to it over a Unix socket or, on Windows, a
// named pipe (one JSON line per request and per response).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import net from "node:net";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// Lets clients detect a daemon left running from an older build.
const BUILD = createHash("sha1").update(readFileSync(SCRIPT_PATH)).digest("hex");
const socketPath = process.argv[2];

if (!socketPath) {
	console.error("usage: daemon.mjs <socket-path>");
	process.exit(2);
}

const log = (...args) =>
	console.error(new Date().toISOString(), "[bettersearch]", ...args);

// Loaded lazily so a platform without prebuilt fff binaries still answers
// requests with a readable error instead of crashing on startup.
let FileFinder = null;
let loadError = null;
try {
	({ FileFinder } = await import("@ff-labs/fff-node"));
} catch (e) {
	loadError = `fff has no native library for ${process.platform}-${process.arch}: ${e instanceof Error ? e.message : String(e)}`;
	log(loadError);
}

/** @type {{ root: string, finder: import("@ff-labs/fff-node").FileFinder }[]} */
let roots = [];
let configKey = "";
let lastError = null;
// The Vicinae server and extension manager processes that last configured us.
// When either exits, so do we, so the index never outlives Vicinae.
let ownerPids = [];

function destroyAll() {
	for (const { finder } of roots) {
		try {
			finder.destroy();
		} catch (e) {
			log("destroy failed", e);
		}
	}
	roots = [];
}

function configure({ roots: wanted, followSymlinks = false, dataDir, owners = [] }) {
	if (loadError) throw new Error(loadError);
	if (owners.length) ownerPids = owners;

	const key = JSON.stringify({ wanted, followSymlinks, dataDir });
	if (key === configKey) return status();

	destroyAll();
	configKey = key;
	lastError = null;

	for (const root of wanted) {
		const dbDir = join(
			dataDir,
			"db",
			createHash("sha1").update(root).digest("hex").slice(0, 16),
		);
		mkdirSync(dbDir, { recursive: true });

		const created = FileFinder.create({
			basePath: root,
			frecencyDbPath: join(dbDir, "frecency"),
			historyDbPath: join(dbDir, "history"),
			enableHomeDirScanning: true,
			followSymlinks,
		});

		if (!created.ok) {
			lastError = `${root}: ${created.error}`;
			log("failed to index", lastError);
			continue;
		}

		roots.push({ root, finder: created.value });
		log("indexing", root);
	}

	return status();
}

function requireRoots() {
	if (!roots.length)
		throw new Error(loadError ?? lastError ?? "No directories are configured for indexing");
}

function isScanning() {
	return roots.some(({ finder }) => finder.isScanning());
}

function status() {
	return {
		build: BUILD,
		script: SCRIPT_PATH,
		pid: process.pid,
		platform: `${process.platform}-${process.arch}`,
		error: loadError ?? lastError,
		roots: roots.map(({ root, finder }) => {
			const progress = finder.getScanProgress();
			return {
				root,
				...(progress.ok ? progress.value : { error: progress.error }),
			};
		}),
	};
}

const abs = (root, relativePath) =>
	join(root, relativePath.replace(/\/$/, ""));

function toEntry(root, mixed, score) {
	if (mixed.type === "directory") {
		const d = mixed.item;
		return {
			kind: "directory",
			path: abs(root, d.relativePath),
			relativePath: d.relativePath.replace(/\/$/, ""),
			name: d.dirName.replace(/\/$/, ""),
			root,
			score: score?.total ?? 0,
		};
	}
	const f = mixed.item;
	return {
		kind: "file",
		path: abs(root, f.relativePath),
		relativePath: f.relativePath,
		name: f.fileName,
		root,
		size: f.size,
		modified: f.modified,
		gitStatus: f.gitStatus,
		score: score?.total ?? 0,
	};
}

function search({ query = "", page = 0, pageSize = 50 }) {
	requireRoots();
	const want = pageSize * (page + 1);
	let items = [];
	let totalMatched = 0;
	let totalFiles = 0;
	let location;

	for (const { root, finder } of roots) {
		const r = finder.mixedSearch(query, { pageSize: want });
		if (!r.ok) throw new Error(r.error);
		totalMatched += r.value.totalMatched;
		totalFiles += r.value.totalFiles;
		location ??= r.value.location;
		r.value.items.forEach((item, i) =>
			items.push(toEntry(root, item, r.value.scores[i])),
		);
	}

	// Single root: keep fff's ordering. Several roots: interleave by score and
	// drop duplicates from nested roots.
	if (roots.length > 1) {
		const seen = new Set();
		items = items
			.sort((a, b) => b.score - a.score)
			.filter((item) => !seen.has(item.path) && seen.add(item.path));
	}
	items = items.slice(page * pageSize, want);

	return {
		items,
		hasMore: totalMatched > want,
		totalMatched,
		totalFiles,
		location,
		scanning: isScanning(),
	};
}

const grepCursor = (offset) => ({ __brand: "GrepCursor", _offset: offset });

// Cursor is { root: index into roots, offset: fff cursor offset or null }.
function grep({
	query,
	mode = "plain",
	pageSize = 50,
	cursor = null,
	context = 6,
	maxMatchesPerFile = 20,
	timeBudgetMs = 150,
}) {
	requireRoots();
	const items = [];
	let rootIndex = cursor?.root ?? 0;
	let offset = cursor?.offset ?? null;
	let regexError;
	let filesSearched = 0;

	while (rootIndex < roots.length && items.length < pageSize) {
		const { root, finder } = roots[rootIndex];
		const r = finder.grep(query, {
			mode,
			pageSize: pageSize - items.length,
			cursor: offset === null ? null : grepCursor(offset),
			beforeContext: context,
			afterContext: context,
			maxMatchesPerFile,
			timeBudgetMs,
		});
		if (!r.ok) throw new Error(r.error);

		regexError ??= r.value.regexFallbackError;
		filesSearched += r.value.totalFilesSearched;

		for (const m of r.value.items) {
			items.push({
				path: join(root, m.relativePath),
				relativePath: m.relativePath,
				name: m.fileName,
				root,
				line: m.lineNumber,
				column: m.col,
				text: m.lineContent,
				ranges: m.matchRanges,
				before: m.contextBefore ?? [],
				after: m.contextAfter ?? [],
				gitStatus: m.gitStatus,
			});
		}

		if (r.value.nextCursor) {
			// Page full or time budget spent: resume from here next time.
			offset = r.value.nextCursor._offset;
			break;
		}
		rootIndex += 1;
		offset = null;
	}

	return {
		items,
		nextCursor:
			rootIndex < roots.length ? { root: rootIndex, offset } : null,
		regexError,
		filesSearched,
		scanning: isScanning(),
	};
}

function owningRoot(path) {
	return roots
		.filter(({ root }) => path === root || path.startsWith(root + sep))
		.sort((a, b) => b.root.length - a.root.length)[0];
}

function track({ query, path }) {
	if (!query) return false;
	const owner = owningRoot(path);
	if (!owner) return false;
	const r = owner.finder.trackQuery(query, path);
	return r.ok && r.value;
}

function rescan() {
	for (const { finder } of roots) finder.scanFiles();
	return status();
}

function shutdown() {
	setImmediate(() => {
		destroyAll();
		server.close();
		try {
			unlinkSync(socketPath);
		} catch {}
		process.exit(0);
	});
	return true;
}

const handlers = { ping: status, status, configure, search, grep, track, rescan, shutdown };

function handle(line) {
	let id = null;
	try {
		const req = JSON.parse(line);
		id = req.id ?? null;
		const fn = handlers[req.method];
		if (!fn) throw new Error(`unknown method ${req.method}`);
		return { id, ok: true, value: fn(req.params ?? {}) };
	} catch (e) {
		return { id, ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

const server = net.createServer((socket) => {
	let buffer = "";
	socket.setEncoding("utf8");
	socket.on("data", (chunk) => {
		buffer += chunk;
		let nl = buffer.indexOf("\n");
		while (nl !== -1) {
			const line = buffer.slice(0, nl);
			buffer = buffer.slice(nl + 1);
			if (line.trim()) socket.write(`${JSON.stringify(handle(line))}\n`);
			nl = buffer.indexOf("\n");
		}
	});
	socket.on("error", () => {});
});

function listen() {
	server.listen(socketPath, () => log("listening on", socketPath, "pid", process.pid));
}

server.on("error", (e) => {
	if (e.code !== "EADDRINUSE") {
		log("server error", e);
		process.exit(1);
	}
	// Another daemon may own the socket. If it answers, leave; if not, the
	// socket file is stale.
	const probe = net.connect(socketPath);
	probe.on("connect", () => {
		log("another daemon is already running");
		process.exit(0);
	});
	probe.on("error", () => {
		try {
			unlinkSync(socketPath);
		} catch {}
		listen();
	});
});

listen();

function isAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		return e.code === "EPERM";
	}
}

// Exit once Vicinae stops or the extension is removed.
setInterval(() => {
	if (ownerPids.some((pid) => !isAlive(pid))) {
		log("vicinae exited, shutting down");
		shutdown();
	} else if (!existsSync(SCRIPT_PATH)) {
		log("daemon script removed, exiting");
		shutdown();
	}
}, 10_000).unref();

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, shutdown);
