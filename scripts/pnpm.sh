#!/bin/sh

set -eu

required_node_version="24.18.0"
required_pnpm_version="11.17.0"
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

active_pnpm_version=""
if command -v pnpm >/dev/null 2>&1; then
  active_pnpm_version=$(pnpm --version)
fi

if test "$active_pnpm_version" != "$required_pnpm_version"; then
  if test -x "$homebrew_pnpm_bin/pnpm" &&
      test "$("$homebrew_pnpm_bin/pnpm" --version)" = "$required_pnpm_version"; then
    PATH="$homebrew_pnpm_bin:$PATH"
    export PATH
  else
    echo "pnpm $required_pnpm_version is required." >&2
    exit 1
  fi
fi

exec pnpm "$@"
