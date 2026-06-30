import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
const mod = await import(pathToFileURL(join(process.cwd(), 'dist', 'lib.js')));
test('expandHome expands tilde', () => assert.equal(mod.expandHome('~/x'), join(homedir(), 'x')));
test('splitCommand handles quoted args', () => assert.deepEqual(mod.splitCommand('flatpak run "app.zen_browser.zen"'), ['flatpak','run','app.zen_browser.zen']));
test('normalizeUrlOrSearch recognizes urls and searches text', () => { assert.equal(mod.normalizeUrlOrSearch('example.com'), 'https://example.com'); assert.match(mod.normalizeUrlOrSearch('hello world','duckduckgo'), /duckduckgo/); });
