// @ts-nocheck

const assert = require("node:assert/strict");
const test = require("node:test");
const Fuse = require("fuse.js");
const fuseOptions = require("../src/fuse-options.json");
const { filterIconIndex } = require("../src/filtering");

const indexData = require("./fixtures/icon-index.fixture.json");

const decodedIndex = indexData.icons.map((icon) => ({
	...icon,
	searchTokens: icon.searchTokens.map((idx) => indexData.dictionary[idx]),
}));

const fuse = new Fuse(decodedIndex, fuseOptions);
const PACK_FILTER_ALL = "all";

test("pack filter behavior for short and full search terms", () => {
	const packCounts = decodedIndex.reduce((acc, icon) => {
		acc[icon.pack] = (acc[icon.pack] || 0) + 1;
		return acc;
	}, {});

	const testPack = Object.keys(packCounts).find((pack) => packCounts[pack] > 1);
	assert.ok(testPack, "expected at least one pack with enough items to test");

	const noSearchAll = filterIconIndex({
		iconIndex: decodedIndex,
		fuseInstance: fuse,
		searchText: "",
		selectedPack: PACK_FILTER_ALL,
	});
	assert.equal(noSearchAll.length, 0, "all-pack short search should return []");

	const noSearchPack = filterIconIndex({
		iconIndex: decodedIndex,
		fuseInstance: fuse,
		searchText: "",
		selectedPack: testPack,
	});
	assert.ok(noSearchPack.length > 0, "pack-only short search should return icons");
	assert.ok(
		noSearchPack.every((icon) => icon.pack === testPack),
		"pack-only short search should contain only selected pack",
	);

	const searchedPack = filterIconIndex({
		iconIndex: decodedIndex,
		fuseInstance: fuse,
		searchText: "file",
		selectedPack: testPack,
	});
	assert.ok(
		searchedPack.every((icon) => icon.pack === testPack),
		"searched results should honor selected pack filter",
	);
});
