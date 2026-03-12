#!/usr/bin/env node

/**
 * Debug test to identify the actual source of inconsistency
 */

const Fuse = require('fuse.js');

// Load the pre-built index
const indexData = require('../assets/icon-index.json');
const tokenDictionary = indexData.dictionary;

// Decode search tokens
const decodedIndex = indexData.icons.map(icon => ({
  ...icon,
  searchTokens: icon.searchTokens.map(idx => tokenDictionary[idx])
}));

console.log('Testing for potential issues:\n');

// Test 1: Check if Fuse instance is truly reusable
console.log('='.repeat(60));
console.log('Test 1: Fuse Instance Reusability');
console.log('='.repeat(60));

const fuse1 = new Fuse(decodedIndex, {
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

const results1a = fuse1.search('cat').slice(0, 5);
const results1b = fuse1.search('cat').slice(0, 5);

console.log('Results 1a:', results1a.map(r => r.item.id).join(', '));
console.log('Results 1b:', results1b.map(r => r.item.id).join(', '));
console.log('Same instance, same results?', 
  JSON.stringify(results1a) === JSON.stringify(results1b) ? '?' : '?'
);

// Test 2: Check if multiple Fuse instances give same results
console.log('\n' + '='.repeat(60));
console.log('Test 2: Multiple Fuse Instances');
console.log('='.repeat(60));

const fuse2 = new Fuse(decodedIndex, {
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

const results2a = fuse1.search('cat').slice(0, 5);
const results2b = fuse2.search('cat').slice(0, 5);

console.log('Instance 1:', results2a.map(r => r.item.id).join(', '));
console.log('Instance 2:', results2b.map(r => r.item.id).join(', '));
console.log('Different instances, same results?', 
  JSON.stringify(results2a) === JSON.stringify(results2b) ? '?' : '?'
);

// Test 3: Check if object reference stability matters
console.log('\n' + '='.repeat(60));
console.log('Test 3: Array Reference Stability');
console.log('='.repeat(60));

const searchResults1 = fuse1.search('cat');
const filtered1 = searchResults1.slice(0, 5).map(r => r.item);
const key1 = filtered1.map(i => i.id).join(',');

const searchResults2 = fuse1.search('cat');
const filtered2 = searchResults2.slice(0, 5).map(r => r.item);
const key2 = filtered2.map(i => i.id).join(',');

console.log('Key 1:', key1);
console.log('Key 2:', key2);
console.log('Keys are identical?', key1 === key2 ? '?' : '?');
console.log('Arrays are same reference?', filtered1 === filtered2 ? 'YES (unexpected)' : 'NO (expected)');
console.log('Array items are same reference?', filtered1[0] === filtered2[0] ? 'YES' : 'NO');

// Test 4: Simulate React query key changes
console.log('\n' + '='.repeat(60));
console.log('Test 4: Simulating React Query Key Behavior');
console.log('='.repeat(60));

function simulateQuery(searchTerm) {
  const results = fuse1.search(searchTerm);
  const filtered = results.slice(0, 5).map(r => r.item);
  const queryKey = filtered.map(i => i.id).join(',');
  return { filtered, queryKey };
}

const q1 = simulateQuery('cat');
const q2 = simulateQuery('catt');
const q3 = simulateQuery('cat');

console.log('Query 1 (cat):', q1.queryKey);
console.log('Query 2 (catt):', q2.queryKey);
console.log('Query 3 (cat):', q3.queryKey);
console.log('Query 1 and 3 have same key?', q1.queryKey === q3.queryKey ? '?' : '?');

// Test 5: Check for any non-determinism in slice/map
console.log('\n' + '='.repeat(60));
console.log('Test 5: Array Operations Determinism');
console.log('='.repeat(60));

function testArrayOps() {
  const results = fuse1.search('cat');
  const top10_a = results.slice(0, 10).map(r => r.item.id);
  const top10_b = results.slice(0, 10).map(r => r.item.id);
  return top10_a.join(',') === top10_b.join(',');
}

let allDeterministic = true;
for (let i = 0; i < 10; i++) {
  if (!testArrayOps()) {
    allDeterministic = false;
    break;
  }
}

console.log('Array operations are deterministic?', allDeterministic ? '?' : '?');

// Test 6: Check if there are duplicate IDs with same score that could cause instability
console.log('\n' + '='.repeat(60));
console.log('Test 6: Checking for Potential Sorting Instabilities');
console.log('='.repeat(60));

const catResults = fuse1.search('cat').slice(0, 20);
const scoreGroups = new Map();

catResults.forEach(r => {
  const score = r.score?.toFixed(6) || 'N/A';
  if (!scoreGroups.has(score)) {
    scoreGroups.set(score, []);
  }
  scoreGroups.get(score).push(r.item.id);
});

console.log('Score groups (items with same score could sort inconsistently):');
let foundDuplicates = false;
scoreGroups.forEach((ids, score) => {
  if (ids.length > 1) {
    console.log(`  Score ${score}: ${ids.join(', ')} (${ids.length} items)`);
    foundDuplicates = true;
  }
});

if (!foundDuplicates) {
  console.log('  ? No duplicate scores found in top 20 results');
} else {
  console.log('  ??  Items with identical scores detected!');
  console.log('  These could sort differently if sort algorithm is unstable.');
}

console.log('\n' + '='.repeat(60));
console.log('Summary');
console.log('='.repeat(60));

console.log(`
If all tests passed (?), the issue is NOT in Fuse.js or core logic.
The inconsistency must be in React's rendering/state management layer.

Common React-specific issues:
1. useMemo dependencies not capturing all changes
2. Race conditions with async state updates
3. Multiple Fuse instances being created unintentionally
4. Array reference changes causing unnecessary re-renders
`);
