// Manual smoke test for albums I/O. Run: `npx tsx scripts/smoke-albums.ts`
import { withClient } from '../src/mpd/client.js';
import { getAlbums, playAlbum, addAlbumToQueue } from '../src/mpd/albums.js';

async function main() {
  const albums = await withClient((mpc) => getAlbums(mpc));
  console.log(`Total albums: ${albums.length}`);
  console.log('Top 5 newest:');
  for (const a of albums.slice(0, 5)) {
    console.log(
      `  ${a.lastModified.toISOString()}  ${a.artist} — ${a.name}` +
        (a.year ? ` (${a.year})` : '') +
        ` [${a.songCount} songs]`,
    );
  }

  const sub = process.argv[2];
  if (sub === 'play' && albums[0]) {
    console.log(`\nReplacing queue and playing: ${albums[0].name}`);
    await withClient((mpc) => playAlbum(mpc, albums[0]!.name));
    console.log('done');
  } else if (sub === 'add' && albums[0]) {
    console.log(`\nAppending to queue: ${albums[0].name}`);
    await withClient((mpc) => addAlbumToQueue(mpc, albums[0]!.name));
    console.log('done');
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
