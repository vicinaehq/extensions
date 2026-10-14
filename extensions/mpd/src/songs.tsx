import SongSearchList from './components/SongSearchList.js';

// Standalone song-search command. Renders the same SongSearchList used by
// the combined Albums-or-Songs surface, but without the mode dropdown.
export default function Songs() {
  return <SongSearchList />;
}
