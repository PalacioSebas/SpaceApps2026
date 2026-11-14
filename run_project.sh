#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if [[ -n "${PAPASTRONOMY_PYTHON:-}" ]]; then
  exec "$PAPASTRONOMY_PYTHON" start_project.py "$@"
fi
if [[ -x ".venv/bin/python" ]]; then
  exec .venv/bin/python start_project.py "$@"
fi
for candidate in python3.12 python3.13 python3.14 python3.11 python3.10 python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; sys.exit(not ((3, 10) <= sys.version_info[:2] < (3, 15)))' >/dev/null 2>&1; then
    exec "$candidate" start_project.py "$@"
  fi
done
printf '%s\n' 'No se encontro Python 3.10-3.14. Se recomienda 3.12.' >&2
printf '%s\n' 'Podes indicar su ejecutable con PAPASTRONOMY_PYTHON.' >&2
exit 1
