// @ts-nocheck

const assert = require("node:assert/strict");
const test = require("node:test");
const Fuse = require("fuse.js");
const fuseOptions = require("../src/fuse-options.json");

const { sortFuseResultsByScoreThenId } = require("../src/search/filtering");

const indexData = require("../assets/icon-index.json");

function decodeIconIndex() {
	return indexData.icons.map((icon) => ({
		...icon,
		searchTokens: icon.searchTokens.map((idx) => indexData.dictionary[idx]),
	}));
}

function createFuse() {
	return new Fuse(decodeIconIndex(), fuseOptions);
}

function topIds(searchResults, count = 5) {
	return searchResults.slice(0, count).map((result) => result.item.id);
}

test("same Fuse instance is deterministic for identical queries", () => {
	const fuse = createFuse();
	const first = topIds(fuse.search("cat"));
	const second = topIds(fuse.search("cat"));

	assert.deepEqual(second, first);
});

test("different Fuse instances produce identical ordering", () => {
	const first = topIds(createFuse().search("cat"));
	const second = topIds(createFuse().search("cat"));

	assert.deepEqual(second, first);
});

test("query key derived from top IDs is stable for same input", () => {
	const fuse = createFuse();
	const keyA = topIds(fuse.search("cat")).join(",");
	const keyB = topIds(fuse.search("cat")).join(",");

	assert.equal(keyB, keyA);
});

test("stable score tie-break produces deterministic ordering", () => {
	const fuse = createFuse();
	const first = topIds(sortFuseResultsByScoreThenId(fuse.search("cat")), 10);
	const second = topIds(sortFuseResultsByScoreThenId(fuse.search("cat")), 10);

	assert.deepEqual(second, first);
});
