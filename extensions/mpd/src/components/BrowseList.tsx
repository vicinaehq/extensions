import { useCallback, useMemo, useState } from 'react';
import { List } from '@vicinae/api';
import AlbumList from './AlbumList.js';
import SongSearchList from './SongSearchList.js';

type Mode = 'albums' | 'songs';

// Combined surface used by the `Show Albums` command. Owns only the mode
// (Albums vs Songs); each child component owns its own search-text state
// internally.
//
// We deliberately do NOT lift the search text up here, even though it would
// preserve text across mode switches: a controlled search input round-trips
// every keystroke through React state + the extension-host IPC bridge, which
// made typing visibly sluggish and produced backspace races where deleted
// characters could reappear. Letting each child's <List> stay uncontrolled
// keeps the host in charge of the displayed input value and makes typing
// feel instant. The tradeoff (typed text resets when you flip the dropdown)
// is acceptable.
export default function BrowseList() {
  const [mode, setMode] = useState<Mode>('albums');

  const onModeChange = useCallback((v: string) => setMode(v as Mode), []);

  // Memo the accessory so its element identity is stable across re-renders.
  // The dropdown's own `value` only changes on actual mode flips.
  const accessory = useMemo(
    () => (
      <List.Dropdown tooltip="Browse" value={mode} onChange={onModeChange}>
        <List.Dropdown.Item title="Albums" value="albums" />
        <List.Dropdown.Item title="Songs" value="songs" />
      </List.Dropdown>
    ),
    [mode, onModeChange],
  );

  if (mode === 'songs') {
    return <SongSearchList searchBarAccessory={accessory} />;
  }
  return <AlbumList searchBarAccessory={accessory} />;
}
