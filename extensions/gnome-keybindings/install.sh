#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm no está instalado o no está en PATH." >&2
  echo "Instalá Node.js/npm y vuelve a ejecutar este script." >&2
  exit 1
fi

if ! command -v gsettings >/dev/null 2>&1; then
  echo "ERROR: gsettings no está instalado o no está en PATH." >&2
  echo "En Fedora GNOME normalmente viene instalado con glib2." >&2
  exit 1
fi

npm install
npm run build

echo
printf '%s\n' "Listo. Abre Vicinae y busca: GNOME Keybindings"
