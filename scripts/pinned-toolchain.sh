#!/bin/sh

# Prints the toolchain pins owned by package.json as shell assignments, for
# `eval "$("$script_dir/pinned-toolchain.sh")"`.
#
# `package.json` is their single owner: `packageManager` pins pnpm and
# `engines.node` pins Node. Every consumer derives the pin from here instead of
# repeating a literal, so a version bump edits one manifest field and cannot leave
# a wrapper, doctor message, or CI setup step behind on the previous version.
#
# The manifest is read with sed rather than Node so the wrapper can still report
# the required Node version on a machine whose Node is missing or wrong.

set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
manifest="$project_root/package.json"

required_node_version=$(
  sed -n 's/^[[:space:]]*"node"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest"
)
required_pnpm_version=$(
  sed -n 's/^[[:space:]]*"packageManager"[[:space:]]*:[[:space:]]*"pnpm@\([^"]*\)".*/\1/p' "$manifest"
)

# Lean build parallelism shares the toolchain pins' single-owner problem: the gate and the pnpm
# wrapper both need it, so a restated literal could leave one of them unpinned.
required_lean_build_threads=$(
  sed -n 's/^[[:space:]]*"leanBuildThreads"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest"
)

if test -z "$required_node_version" || test -z "$required_pnpm_version" ||
    test -z "$required_lean_build_threads"; then
  echo "pinned-toolchain.sh read no Node or pnpm pin from $manifest" >&2
  exit 1
fi

printf 'required_node_version=%s\n' "$required_node_version"
printf 'required_pnpm_version=%s\n' "$required_pnpm_version"
printf 'required_lean_build_threads=%s\n' "$required_lean_build_threads"
