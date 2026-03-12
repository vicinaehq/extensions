#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const searchConfig = require('../src/search-config.json');

const ACRONYMS = new Set(searchConfig.acronyms);
const TOKEN_SYNONYMS = searchConfig.tokenSynonyms;
const PACK_LABELS = searchConfig.packLabels;

const NERD_FONTS_VERSION = '3.4.0';
const GLYPHNAMES_URL = `https://raw.githubusercontent.com/ryanoasis/nerd-fonts/v${NERD_FONTS_VERSION}/glyphnames.json`;
const assetsDir = path.join(__dirname, '../assets');
const glyphnamesPath = path.join(assetsDir, 'glyphnames.json');
const iconIndexPath = path.join(assetsDir, 'icon-index.json');

function addSynonyms(token) {
  const synonyms = TOKEN_SYNONYMS[token] || [];
  const extras = [];

  if (token === "plus") {
    extras.push("+", "add");
  }
  if (token === "minus") {
    extras.push("-", "subtract");
  }
  if (token === "times") {
    extras.push("x");
  }
  if (token === "close") {
    extras.push("quit");
  }

  return [...synonyms, ...extras].map(entry => entry.toLowerCase());
}

function splitNameIntoWords(value) {
  if (!value) return [];
  
  return value
    .split(/[_-]/g)
    .map(part => part.trim())
    .filter(Boolean);
}

function simpleTitleCase(word) {
  const lower = word.toLowerCase();
  
  if (ACRONYMS.has(lower)) {
    return lower.toUpperCase();
  }
  
  if (/^\d+$/.test(word)) {
    return word;
  }
  
  if (word.length <= 2) {
    return word.toUpperCase();
  }
  
  return word.charAt(0).toUpperCase() + word.slice(1);
}

async function fetchGlyphnames() {
  console.log(`Downloading glyphnames from ${GLYPHNAMES_URL}`);

  const response = await fetch(GLYPHNAMES_URL);
  if (!response.ok) {
    throw new Error(`Failed to download glyphnames.json: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const parsed = JSON.parse(text);

  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(glyphnamesPath, text);

  return parsed;
}

function buildIconIndex(glyphnames) {
  const { METADATA, ...rawGlyphs } = glyphnames;
  
  // Build token dictionary for compression
  const tokenDictionary = new Set();
  const tempIndex = [];

  // First pass: collect all unique tokens
  Object.entries(rawGlyphs)
    .filter(([id]) => id !== "METADATA")
    .forEach(([id, glyph]) => {
      const [pack, ...rest] = id.split("-");
      const rawName = rest.join("-");
      const words = splitNameIntoWords(rawName);
      const packLabel = PACK_LABELS[pack] || pack.toUpperCase();
      const displayName = words.length > 0 
        ? words.map(w => simpleTitleCase(w)).join(" ") 
        : simpleTitleCase(pack);
      
      const searchTokens = new Set();
      searchTokens.add(id.toLowerCase());
      searchTokens.add(pack.toLowerCase());
      searchTokens.add(packLabel.toLowerCase());
      searchTokens.add(displayName.toLowerCase());
      searchTokens.add(rawName.toLowerCase().replace(/_/g, " "));
      
      words.forEach(word => {
        const normalized = word.toLowerCase();
        searchTokens.add(normalized);
        addSynonyms(normalized).forEach(s => {
          searchTokens.add(s);
        });
      });
      
      // Add to dictionary
      searchTokens.forEach(token => {
        tokenDictionary.add(token);
      });
      
      tempIndex.push({
        id,
        pack,
        char: glyph.char,
        code: glyph.code,
        displayName,
        packLabel,
        searchTokens: Array.from(searchTokens)
      });
    });

  // Convert dictionary to array for indexing
  const dictionary = Array.from(tokenDictionary);
  const tokenToIndex = new Map(dictionary.map((token, idx) => [token, idx]));
  
  console.log(`  Token dictionary size: ${dictionary.length} unique tokens`);
  
  // Second pass: replace tokens with indices
  const optimizedIndex = tempIndex.map(entry => ({
    ...entry,
    searchTokens: entry.searchTokens.map(token => tokenToIndex.get(token))
  }));

  return {
    dictionary,
    icons: optimizedIndex
  };
}

async function main() {
  console.log('Building icon search index...');

  const glyphnames = await fetchGlyphnames();
  const indexData = buildIconIndex(glyphnames);
  console.log(`Generated index with ${indexData.icons.length} icons`);

  fs.writeFileSync(iconIndexPath, JSON.stringify(indexData));

  const glyphStats = fs.statSync(glyphnamesPath);
  const glyphSizeMB = (glyphStats.size / (1024 * 1024)).toFixed(2);
  console.log(`Glyphnames saved to ${glyphnamesPath} (${glyphSizeMB} MB)`);

  const indexStats = fs.statSync(iconIndexPath);
  const indexSizeMB = (indexStats.size / (1024 * 1024)).toFixed(2);
  console.log(`Index saved to ${iconIndexPath} (${indexSizeMB} MB)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
