export const GIT_VICINAE_EDITOR_SCRIPT = `#!/usr/bin/env bash
set -e

FILE="$1"

vicinae "vicinae://extensions/FredrikMWold/git-editor/git-commit?arguments={\\"gitFile\\":\\"$FILE\\"}"


# Wait until Vicinae writes to the file
inotifywait \\
  --quiet \\
  --event close_write,move,delete_self \\
  "$FILE"

# Grace period for final flush
sleep 0.1

exit 0
`;

export const GIT_VICINAE_SEQUENCE_EDITOR_SCRIPT = `#!/usr/bin/env bash
set -e

FILE="$1"

vicinae "vicinae://extensions/FredrikMWold/git-editor/git-sequence?arguments={\\"gitFile\\":\\"$FILE\\"}"


# Wait until Vicinae writes to the file
inotifywait \\
  --quiet \\
  --event close_write,move,delete_self \\
  "$FILE"

# Grace period for final flush
sleep 0.1

exit 0
`;

export const SCRIPT_NAMES = {
  editor: "git-vicinae-editor",
  sequenceEditor: "git-vicinae-sequence-editor",
} as const;
