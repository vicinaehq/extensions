import { withClient } from '../src/mpd/client.js';

async function main() {
  await withClient(async (mpc) => {
    const uri = 'Pale Saints - (1994) Slow Buildings/01 - King Fade.mp3';
    console.log('calling getPicture...');
    const p = await mpc.database.getPicture(uri).catch((e) => {
      console.log('getPicture threw:', e);
      return undefined;
    });
    console.log('getPicture result:', p ? { type: p.mimeType, bytes: p.binary.byteLength } : p);

    console.log('calling getAlbumArt...');
    const a = await mpc.database.getAlbumArt(uri).catch((e) => {
      console.log('getAlbumArt threw:', e);
      return undefined;
    });
    console.log('getAlbumArt result:', a ? { type: a.mimeType, bytes: a.binary.byteLength } : a);
  });
}
main().catch(console.error);
