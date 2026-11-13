#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
eval "$("$script_dir/pinned-toolchain.sh")"

node_major=${required_node_version%%.*}
homebrew_node_bin="/opt/homebrew/opt/node@$node_major/bin"
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
    echo "Use 'nvm install && nvm use' or install Homebrew node@$node_major." >&2
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

# The development limit protects a contributor's machine; a GitHub-hosted Linux runner is a disposable
# host and takes the manifest's CI value, chosen exactly as scripts/lake.sh chooses its own. A
# self-hosted runner, or a local shell that merely sets GITHUB_ACTIONS, keeps the development limit.
if [ "${GITHUB_ACTIONS:-}" = true ] && [ "${RUNNER_ENVIRONMENT:-}" = github-hosted ] &&
  [ "$(uname -s)" = Linux ]; then
  required_node_memory_brake_mib=$required_node_ci_memory_brake_mib
fi

node_memory_brake_mib=$required_node_memory_brake_mib
if [ "${NODE_MEMORY_BRAKE_MIB+set}" = set ]; then
  case "$NODE_MEMORY_BRAKE_MIB" in
    '' | *[!0-9]* | 0*)
      echo "PNPM_REFUSED NODE_MEMORY_BRAKE_MIB must be a positive whole number of MiB" >&2
      exit 64
      ;;
  esac
  if [ "$NODE_MEMORY_BRAKE_MIB" -lt "$required_node_memory_brake_mib" ]; then
    node_memory_brake_mib=$NODE_MEMORY_BRAKE_MIB
  fi
fi
if [ "$(uname -s)" = Darwin ] && ! command -v footprint >/dev/null 2>&1; then
  echo "PNPM_REFUSED the memory brake needs macOS footprint(1)" >&2
  exit 69
fi
if [ "$(uname -s)" != Darwin ] && [ ! -r /proc/self/stat ]; then
  echo "PNPM_REFUSED the memory brake needs a readable /proc" >&2
  exit 69
fi

node_memory_brake_marker="/tmp/bpmn-lean-experiment-$(id -u).node-memory-brake.$$"
node_memory_brake_pid=
pnpm_pid=

cleanup_node_memory_brake() {
  if [ -n "$node_memory_brake_pid" ]; then
    kill "$node_memory_brake_pid" 2>/dev/null || true
  fi
  rm -f "$node_memory_brake_marker" "$node_memory_brake_marker.peak"
}
trap cleanup_node_memory_brake 0
# A signal for the wrapper belongs to pnpm; the wait below then returns pnpm's own status.
trap 'kill -HUP "$pnpm_pid" 2>/dev/null || true' 1
trap 'kill -INT "$pnpm_pid" 2>/dev/null || true' 2
trap 'kill -TERM "$pnpm_pid" 2>/dev/null || true' 15

# Every Node process tree runs under the memory brake: a V8 heap cap misses Buffers, native memory
# and child processes, and on 2026-11-13 one population test drove a 16 GB host to 145 GB;
# see scripts/memory-brake.sh. The brake's output goes nowhere: its orphaned `sleep` would otherwise
# hold a piped or captured stdout open for up to two seconds after pnpm exits.
"$script_dir/memory-brake.sh" "$$" "$((node_memory_brake_mib * 1024))" "$node_memory_brake_marker" \
  >/dev/null 2>&1 </dev/null &
node_memory_brake_pid=$!

# The wrapper owns exact CLI selection. Letting pnpm honor packageManager again
# here can recursively download the already-validated version and hang offline.
# A background command reads /dev/null in a shell without job control, so stdin travels on fd 3.
exec 3<&0
"$pnpm_executable" --pm-on-fail=ignore "$@" <&3 3<&- &
pnpm_pid=$!
exec 3<&-
# A trapped signal ends `wait` early while pnpm is still shutting down, so wait until it is reaped.
while :; do
  if wait "$pnpm_pid"; then pnpm_status=0; else pnpm_status=$?; fi
  kill -0 "$pnpm_pid" 2>/dev/null || break
done
# The peak goes to a caller-named file, never to output; the larger value wins so that one job's
# several invocations report their maximum.
if [ -n "${PNPM_MEMORY_PEAK_FILE:-}" ] && [ -s "$node_memory_brake_marker.peak" ]; then
  run_peak_kib=$(cat "$node_memory_brake_marker.peak")
  previous_peak_kib=$(cat "$PNPM_MEMORY_PEAK_FILE" 2>/dev/null) || previous_peak_kib=0
  case $previous_peak_kib in '' | *[!0-9]*) previous_peak_kib=0 ;; esac
  if [ "$run_peak_kib" -gt "$previous_peak_kib" ]; then
    printf '%s\n' "$run_peak_kib" > "$PNPM_MEMORY_PEAK_FILE"
  fi
fi
if [ -s "$node_memory_brake_marker" ]; then
  # The brake ends the whole tree before it exits; returning earlier would leave an orphan running.
  wait "$node_memory_brake_pid" 2>/dev/null || true
  echo "NODE_MEMORY_BRAKE terminated the pnpm process tree at $(($(cat "$node_memory_brake_marker") / 1024)) MiB, above the ${node_memory_brake_mib} MiB brake; record the breach and diagnose its mechanism before rerunning" >&2
  exit 70
fi
exit "$pnpm_status"
