import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const mod = await import(pathToFileURL(join(process.cwd(), 'dist', 'lib.js')));
test('expandHome expands tilde', () => assert.equal(mod.expandHome('~/x'), join(homedir(), 'x')));
test('splitCommand handles quoted args', () => assert.deepEqual(mod.splitCommand('flatpak run "app.zen_browser.zen"'), ['flatpak','run','app.zen_browser.zen']));
test('normalizeUrlOrSearch recognizes urls and searches text', () => { assert.equal(mod.normalizeUrlOrSearch('example.com'), 'https://example.com'); assert.match(mod.normalizeUrlOrSearch('hello world','duckduckgo'), /duckduckgo/); });

test('listPinnedTabs reads pinned tabs from session backups', () => {
  const root = mkdtempSync(join(tmpdir(), 'zen-profile-root-'));
  try {
    const profile = join(root, 'abc.Default (release)');
    const backups = join(profile, 'sessionstore-backups');
    mkdirSync(backups, { recursive: true });
    writeFileSync(join(profile, 'places.sqlite'), '');
    writeFileSync(join(backups, 'recovery.json'), JSON.stringify({
      windows: [{
        tabs: [
          { pinned: true, zenEssential: true, entries: [{ title: 'Mail Inbox', url: 'https://mail.example/inbox' }], index: 1 },
          { pinned: false, entries: [{ title: 'Search', url: 'https://search.example' }], index: 1 },
          { pinned: true, zenEssential: false, entries: [{ title: 'Old', url: 'https://old.example' }, { title: 'Calendar', url: 'https://calendar.example' }], index: 2 }
        ]
      }]
    }));

    assert.deepEqual(mod.listPinnedTabs({ profilesDirectory: root, profileDirectorySuffix: 'Default (release)' }), [
      { title: 'Mail Inbox', url: 'https://mail.example/inbox', subtitle: 'https://mail.example/inbox', essential: true, tabIndex: 1 },
      { title: 'Calendar', url: 'https://calendar.example', subtitle: 'https://calendar.example', essential: false, tabIndex: 3 }
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
