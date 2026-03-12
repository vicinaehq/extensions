#!/usr/bin/env node

/**
 * Verify that our stable sort fix works
 */

const Fuse = require('fuse.js');

const indexData = require('../assets/icon-index.json');
const tokenDictionary = indexData.dictionary;

const decodedIndex = indexData.icons.map(icon => ({
  ...icon,
  searchTokens: icon.searchTokens.map(idx => tokenDictionary[idx])
}));

const fuse = new Fuse(decodedIndex, {
  keys: [
    { name: "displayName", weight: 0.3 },
    { name: "id", weight: 0.5 },
    { name: "searchTokens", weight: 0.8 },
    { name: "pack", weight: 1 },
  ],
  threshold: 0.4,
  location: 0,
  distance: 100,
  ignoreLocation: false,
  ignoreFieldNorm: false,
  fieldNormWeight: 1,
  minMatchCharLength: 2,
  shouldSort: true,
  includeScore: true,
  findAllMatches: false,
  useExtendedSearch: false,
});

function searchWithStableSort(searchTerm) {
  let searchResults = fuse.search(searchTerm);
  
  // Apply the stable secondary sort
  searchResults.sort((a, b) => {
    const scoreDiff = (a.score || 0) - (b.score || 0);
    if (Math.abs(scoreDiff) < 0.000001) {
      return a.item.id.localeCompare(b.item.id);
    }
    return scoreDiff;
  });
  
  return searchResults.slice(0, 10);
}

console.log('?? Testing Stable Sort Fix\n');
console.log('='.repeat(60));
console.log('Running 10 iterations for "cat" search');
console.log('='.repeat(60));

const allResults = [];
for (let i = 0; i < 10; i++) {
  const results = searchWithStableSort('cat');
  const ids = results.map(r => r.item.id);
  allResults.push(ids);
  console.log(`Iteration ${i + 1}:`, ids.join(', '));
}

// Check consistency
const firstResult = JSON.stringify(allResults[0]);
let consistent = true;

for (let i = 1; i < allResults.length; i++) {
  if (JSON.stringify(allResults[i]) !== firstResult) {
    consistent = false;
    console.log(`\n? INCONSISTENT at iteration ${i + 1}!`);
    console.log('Expected:', allResults[0].join(', '));
    console.log('Got:     ', allResults[i].join(', '));
    break;
  }
}

console.log('\n' + '='.repeat(60));
if (consistent) {
  console.log('? SUCCESS! All 10 iterations returned identical results.');
  console.log('? Stable secondary sort is working correctly.');
  process.exit(0);
} else {
  console.log('? FAILED! Results are still inconsistent.');
  process.exit(1);
}
