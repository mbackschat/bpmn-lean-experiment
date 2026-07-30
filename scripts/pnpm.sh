#!/bin/sh

set -eu

required_node_version="24.18.0"
required_pnpm_version="11.18.0"
homebrew_node_bin="/opt/homebrew/opt/node@24/bin"
homebrew_pnpm_bin="/opt/homebrew/opt/pnpm/bin"

active_node_version=""
if command -v node >/dev/null 2>&1; then
  active_node_version=$(node --version | sed 's/^v//')
fi

if test "$active_node_version" != "$required_node_version"; then
  if test -x "$homebrew_node_bin/node" &&
      test "$("$homebrew_node_bin/node" --version | sed 's/^v//')" = "$required_node_version"; then
    PATH="$homebrew_node_bin:$PATH"
    export PATH
  else
    echo "Node $required_node_version is required." >&2
    echo "Use 'nvm install && nvm use' or install Homebrew node@24." >&2
    exit 1
  fi
fi

pnpm_executable=""
active_pnpm_version=""
if command -v pnpm >/dev/null 2>&1; then
  pnpm_executable=$(command -v pnpm)
  active_pnpm_version=$("$pnpm_executable" --pm-on-fail=ignore --version)
fi

if test "$active_pnpm_version" != "$required_pnpm_version"; then
  if test -x "$homebrew_pnpm_bin/pnpm" &&
      test "$("$homebrew_pnpm_bin/pnpm" --pm-on-fail=ignore --version)" = "$required_pnpm_version"; then
    pnpm_executable="$homebrew_pnpm_bin/pnpm"
  else
    echo "pnpm $required_pnpm_version is required." >&2
    exit 1
  fi
fi

# The wrapper owns exact CLI selection. Letting pnpm honor packageManager again
# here can recursively download the already-validated version and hang offline.
exec "$pnpm_executable" --pm-on-fail=ignore "$@"
