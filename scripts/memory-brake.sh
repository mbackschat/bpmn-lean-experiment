#!/bin/sh

# Memory brake for the process tree of one wrapper: memory-brake.sh <wrapper-pid> <limit-kib> <marker>
#
# `scripts/lake.sh` and `scripts/pnpm.sh` each start it on their own pid, so every local Lean and
# every local Node process tree runs under it. macOS has no hard process-tree memory ceiling and
# ignores `ulimit -v`, and a V8 heap cap misses Buffers, native memory and child processes. Two
# incidents set the rule:
# - 2026-10-14: a kernel-reduced conformance module reached a 13 GB footprint in a Lean build and
#   filled the host's swap (Finding 78 of the retired process assessment ledger).
# - 2026-11-13: a Node population test under an uncommitted host change drove a 16 GB host to 145 GB.
# This is an emergency brake, not a measurement; the resource bounds live in the wrappers' manifest
# values (`package.json` `config`) and in docs/kernel/ENGINEERING-POLICY.md#local-loop.
#
# It sums the physical footprint of the wrapper's descendants every two seconds and, above the limit,
# records the total in the marker and terminates them. macOS reads `phys_footprint`, which includes
# compressed pages; resident size alone reported 0.8 GB for that 13 GB process. Linux reads resident
# plus swapped pages. The loop ends with the wrapper, so it cannot outlive the command it guards.

set -u

wrapper_pid=$1
limit_kib=$2
marker=$3
brake_pid=$$

# Linux reads `/proc` because minimal images such as the measurement container ship no `ps`; an empty
# process table would sum to zero and silently disarm the brake (Finding 78).
process_table() {
  if [ -d /proc/self ]; then
    for stat in /proc/[0-9]*/stat; do
      read -r line 2>/dev/null < "$stat" || continue
      rest=${line##*) }
      # shellcheck disable=SC2086
      set -- $rest
      printf '%s %s\n' "${line%% *}" "$2"
    done
  else
    ps -A -o pid= -o ppid=
  fi
}

descendants() {
  process_table | awk -v root="$wrapper_pid" -v brake="$brake_pid" '
    { children[$2] = children[$2] " " $1 }
    END {
      queue = root
      while (queue != "") {
        split(queue, current, " "); queue = ""
        for (index_ in current) {
          count = split(children[current[index_]], next_, " ")
          for (i = 1; i <= count; i++) {
            if (next_[i] == brake) continue
            print next_[i]; queue = queue " " next_[i]
          }
        }
      }
    }'
}

footprint_kib() {
  case $(uname -s) in
    Darwin)
      footprint -p "$1" 2>/dev/null | awk '
        $1 == "phys_footprint:" {
          scale = ($3 == "GB") ? 1048576 : ($3 == "MB") ? 1024 : ($3 == "KB") ? 1 : 1 / 1024
          printf "%d\n", $2 * scale; exit
        }'
      ;;
    *)
      awk '$1 == "VmRSS:" || $1 == "VmSwap:" { total += $2 } END { printf "%d\n", total }' \
        "/proc/$1/status" 2>/dev/null
      ;;
  esac
}

# The tree is walked once, before the first signal: a descendant whose parent dies is re-parented out of
# the wrapper's tree, so a later walk misses exactly the process that outlived TERM, and that orphan
# then keeps running and holds the wrapper's output open. The doomed set is gone before the brake
# exits, and the wrappers wait for the brake, so no braked process outlives its wrapper. Reusing a
# doomed pid within the two-second grace would take a wrap of the whole pid space.
terminate() {
  doomed=$(descendants)
  for pid in $doomed; do kill -TERM "$pid" 2>/dev/null; done
  sleep 2
  for pid in $doomed $(descendants); do kill -KILL "$pid" 2>/dev/null; done
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    alive=
    for pid in $doomed; do kill -0 "$pid" 2>/dev/null && alive=1; done
    [ -z "$alive" ] && return
    sleep 1
  done
}

peak_kib=0
while kill -0 "$wrapper_pid" 2>/dev/null; do
  total_kib=0
  for pid in $(descendants); do
    sample=$(footprint_kib "$pid")
    total_kib=$((total_kib + ${sample:-0}))
  done
  # The wrapper reads the largest sampled total from "$marker.peak" for an optional peak report.
  if [ "$total_kib" -gt "$peak_kib" ]; then
    peak_kib=$total_kib
    printf '%s\n' "$peak_kib" > "$marker.peak"
  fi
  if [ "$total_kib" -gt "$limit_kib" ]; then
    printf '%s\n' "$total_kib" > "$marker"
    terminate
    exit 0
  fi
  sleep 2
done
