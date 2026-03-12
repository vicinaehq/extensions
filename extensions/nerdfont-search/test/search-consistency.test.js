#!/usr/bin/env node

/**
 * Test script to validate search consistency
 * Usage: node test/search-consistency.test.js
 */

const Fuse = require('fuse.js');
function simpleTitleCase(word) {
  const lower = word.toLowerCase();
  
  if (/^\d+$/.test(word)) {
    return word;
  }
  
  if (word.length <= 2) {
    return word.toUpperCase();
  }
  
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function splitNameIntoWords(value) {
  if (!value) return [];
  return value.split(/[_-]/g).map(part => part.trim()).filter(Boolean);
}

// Load the pre-built index
const indexData = require('../assets/icon-index.json');
const tokenDictionary = indexData.dictionary;

// Decode search tokens
const decodedIndex = indexData.icons.map(icon => ({
  ...icon,
  searchTokens: icon.searchTokens.map(idx => tokenDictionary[idx])
}));

console.log(`Loaded ${decodedIndex.length} icons`);
console.log(`Token dictionary: ${tokenDictionary.length} tokens\n`);

// Create Fuse instance with EXACT same config as production
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

function testSearch(searchTerm, iterations = 3) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: "${searchTerm}"`);
  console.log('='.repeat(60));
  
  const allResults = [];
  
  for (let i = 0; i < iterations; i++) {
    const results = fuse.search(searchTerm);
    const top10 = results.slice(0, 10).map(r => ({
      displayName: r.item.displayName,
      id: r.item.id,
      score: r.score?.toFixed(6) || 'N/A'
    }));
    
    allResults.push(top10);
    
    console.log(`\nIteration ${i + 1}:`);
    top10.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.displayName.padEnd(30)} (${item.id}) [score: ${item.score}]`);
    });
  }
  
  // Verify consistency
  const consistent = allResults.every((result, idx) => {
    if (idx === 0) return true;
    return JSON.stringify(result) === JSON.stringify(allResults[0]);
  });
  
  if (consistent) {
    console.log(`\n? PASS: Results are CONSISTENT across ${iterations} iterations`);
  } else {
    console.log(`\n? FAIL: Results are INCONSISTENT!`);
    console.log('\nDifferences detected:');
    allResults.forEach((result, idx) => {
      console.log(`\nIteration ${idx + 1} IDs:`);
      console.log(result.map(r => r.id).join(', '));
    });
  }
  
  return consistent;
}

// Run tests
console.log('\n?? Search Consistency Tests\n');

const tests = [
  'cat',
  'arrow',
  'home',
  'search',
  'file',
];

let passed = 0;
let failed = 0;

tests.forEach(term => {
  const result = testSearch(term, 5);
  if (result) {
    passed++;
  } else {
    failed++;
  }
});

console.log('\n' + '='.repeat(60));
console.log('?? Test Summary');
console.log('='.repeat(60));
console.log(`? Passed: ${passed}/${tests.length}`);
console.log(`? Failed: ${failed}/${tests.length}`);

if (failed === 0) {
  console.log('\n?? All tests passed! Search is deterministic.\n');
  process.exit(0);
} else {
  console.log('\n??  Some tests failed. Search is NOT deterministic.\n');
  process.exit(1);
}
