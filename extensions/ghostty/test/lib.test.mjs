import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const mod = await import(pathToFileURL(join(process.cwd(), 'dist', 'lib.js')));

test('expandHome expands a leading tilde only', () => {
  assert.equal(mod.expandHome('~/src'), join(homedir(), 'src'));
  assert.equal(mod.expandHome('/tmp/~x'), '/tmp/~x');
});

test('findGitRepos finds repo roots and does not descend into repos', () => {
  const root = join(tmpdir(), `ghostty-vicinae-${Date.now()}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'a', '.git'), { recursive: true });
  mkdirSync(join(root, 'a', 'nested', '.git'), { recursive: true });
  mkdirSync(join(root, 'b', 'c', '.git'), { recursive: true });
  assert.deepEqual(mod.findGitRepos(root, 3).map(p => p.replace(root + '/', '')), ['a', 'c'].map(x => x === 'c' ? 'b/c' : x).sort());
  rmSync(root, { recursive: true, force: true });
});

test('collectCommands flattens tab and nested pane commands', () => {
  assert.deepEqual(mod.collectCommands({ commands: ['a'], layout: { commands: ['b'], panes: [{ commands: ['c'] }] } }), ['a', 'b', 'c']);
});
