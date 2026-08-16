#!/usr/bin/env bash
# Create the Python environment the end-to-end scenarios run Home Assistant in.
#
# Idempotent: re-running with an unchanged versions.json is a no-op, so it is
# safe to call from CI behind a cache.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
venv="$here/.venv-ha"
stamp="$venv/.versions"
versions_file="$here/versions.json"

read_version() {
  python3 -c "import json,sys; print(json.load(open('$versions_file'))['$1'])"
}

want="$(cat "$versions_file")"
if [[ -x "$venv/bin/hass" && -f "$stamp" && "$(cat "$stamp")" == "$want" ]]; then
  echo "Home Assistant environment is up to date ($("$venv/bin/hass" --version 2>/dev/null || echo unknown))"
  exit 0
fi

# Home Assistant needs a recent Python; the repo's own toolchain does not, so
# look for one rather than assuming `python3` is new enough.
python_bin=""
for candidate in python3.13 python3.14 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    if "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 13) else 1)'; then
      python_bin="$candidate"
      break
    fi
  fi
done
if [[ -z "$python_bin" ]]; then
  echo "error: Python 3.13 or newer is required to run Home Assistant." >&2
  exit 1
fi

rm -rf "$venv"
if command -v uv >/dev/null 2>&1; then
  uv venv --python "$python_bin" "$venv"
  VIRTUAL_ENV="$venv" uv pip install \
    "homeassistant==$(read_version homeassistant)" \
    "home-assistant-frontend==$(read_version home-assistant-frontend)" \
    "numpy==$(read_version numpy)" \
    "paho-mqtt==$(read_version paho-mqtt)"
else
  "$python_bin" -m venv "$venv"
  "$venv/bin/pip" install --quiet --upgrade pip
  "$venv/bin/pip" install --quiet \
    "homeassistant==$(read_version homeassistant)" \
    "home-assistant-frontend==$(read_version home-assistant-frontend)" \
    "numpy==$(read_version numpy)" \
    "paho-mqtt==$(read_version paho-mqtt)"
fi

printf '%s' "$want" > "$stamp"
echo "Installed $("$venv/bin/hass" --version)"
