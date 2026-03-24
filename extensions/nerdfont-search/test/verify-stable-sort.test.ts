// @ts-nocheck

const assert = require("node:assert/strict");
const test = require("node:test");
const Fuse = require("fuse.js");
const fuseOptions = require("../src/fuse-options.json");
const { sortFuseResultsByScoreThenId } = require("../src/filtering");

const indexData = require("./fixtures/icon-index.fixture.json");

const decodedIndex = indexData.icons.map((icon) => ({
	...icon,
	searchTokens: icon.searchTokens.map((idx) => indexData.dictionary[idx]),
}));

const fuse = new Fuse(decodedIndex, fuseOptions);

function searchWithStableSort(searchTerm) {
	const searchResults = sortFuseResultsByScoreThenId(fuse.search(searchTerm));

	return searchResults.slice(0, 10).map((result) => result.item.id);
}

test("stable secondary sort keeps identical ordering across runs", () => {
	const baseline = searchWithStableSort("cat");

	for (let i = 0; i < 9; i += 1) {
		assert.deepEqual(searchWithStableSort("cat"), baseline);
	}
});
