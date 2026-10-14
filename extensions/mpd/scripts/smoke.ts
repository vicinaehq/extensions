// Quick smoke test that the MPD plumbing actually works against a live server.
// Not part of `npm test` — run manually: `npx tsx scripts/smoke.ts`
import { withClient } from '../src/mpd/client.js';
import { getQueue } from '../src/mpd/queue.js';
import { fetchAlbumArtViaMpc } from '../src/mpd/albumart.js';

async function main() {
  const queue = await withClient((mpc) => getQueue(mpc));
  console.log('state:', queue.state);
  console.log('currentSongId:', queue.currentSongId);
  console.log('items:', queue.items.length);
  for (const it of queue.items.slice(0, 5)) {
    console.log(`  - id=${it.id} pos=${it.pos} ${it.artist ?? '?'} - ${it.title ?? it.file} [${it.duration}s]`);
  }

  if (queue.items.length > 0) {
    const sample = queue.items[0]!;
    console.log(`\nFetching album art for: ${sample.file}`);
    const art = await fetchAlbumArtViaMpc(sample.file);
    console.log('art path:', art);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
