#!/bin/sh

set -eu

script_dir=${0%/*}
project_root=$(CDPATH= cd "$script_dir/.." && pwd)
cd "$project_root"

existing_hooks_path=$(git config --local --get core.hooksPath || true)
if test -n "$existing_hooks_path" && test "$existing_hooks_path" != ".githooks"; then
  echo "Refusing to replace existing local core.hooksPath=$existing_hooks_path" >&2
  exit 1
fi

git config --local core.hooksPath .githooks
echo "Git hooks installed from .githooks"
