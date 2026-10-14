#!/bin/sh

# The project's only entry point for Lean builds, tests, and executables.
#
# It exists to bound Lean's build parallelism, which is a memory bound rather than a speed
# preference. This repository decides finite fixtures in the kernel, and kernel reduction holds its
# terms in resident memory, so the peak multiplies across concurrently elaborated modules. Lake sizes
# its build thread pool from LEAN_NUM_THREADS, or from the logical processor count when unset, and
# exposes no --jobs option: measured on an 8-core host, an unpinned build ran four concurrent `lean`
# processes above 2 GB each and peaked at 7978 MB, against 2411 MB at one thread and 4699 MB at two.
# The pool is a target rather than a hard limit, because Lean may exceed it to avoid deadlock, so
# this bounds the peak without pretending to cap it.
#
# Wrapping every invocation is what makes the pin hold. Exporting it from the gates alone left the
# documented experiment commands, and any Lean build typed directly, running at the host's core
# count; `scripts/verification-entrypoint.test.ts` now rejects a bare `lake` in any instruction
# surface. `package.json`'s `config.leanBuildThreads` owns the value. The wrapper always replaces an
# inherited LEAN_NUM_THREADS value: an ambient or agent-supplied override must never turn an ordinary
# project command into an unbounded host build. The host-wide lock prevents two repository Lean
# process trees from multiplying that bounded peak.
#
# `run <source.lean> [args...]` deliberately uses Lean's interpreter after the owning gate has built
# that source module. Runtime witnesses need their `main`; they do not need Lake to regenerate and
# compile the same transitive closure as native C merely to execute it.

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
eval "$("$script_dir/pinned-toolchain.sh")"

if [ "${1:-}" = "run" ]; then
  shift
  if [ "$#" -eq 0 ]; then
    echo "LEAN_BUILD_REFUSED run requires one Lean source path" >&2
    exit 64
  fi
  set -- env lean --run "$@"
fi

if [ "${1:-}" = "build" ]; then
  for target in "$@"; do
    if [ "$target" = "BpmnSemantics" ]; then
      echo "LEAN_BUILD_REFUSED explicit BpmnSemantics umbrella target; use 'LEAN_FULL_GATE=<gate-or-batch-id> ./scripts/lake.sh build' only for the root-owned full gate" >&2
      exit 64
    fi
  done
fi

# A full-library build recompiles every module downstream of an edit, so it must name the gate or
# Lean batch that owns it; full builds started as consumer discovery or "still red?" probes are
# Finding 75 in docs/PROCESS-ASSESSMENT-LEDGER.md. Classification fails closed: only a
# `BpmnSemantics.` submodule or a declared `lean_exe` is narrow, so package, facet and umbrella
# spellings count as full. A permitted invocation prints nothing, because retained Lean memory
# receipts hash the build output.
full_gate_required=false
if [ "${1:-}" = "test" ]; then
  full_gate_required=true
elif [ "${1:-}" = "build" ]; then
  declared_executables=$(awk '/^\[\[lean_exe\]\]/ { executable = 1; next } /^\[/ { executable = 0 } executable && /^name = "/ { sub(/^name = "/, ""); sub(/".*/, ""); print }' "$script_dir/../lakefile.toml")
  narrow_targets=0
  shift_done=false
  for target in "$@"; do
    if [ "$shift_done" = false ]; then
      shift_done=true
      continue
    fi
    case "$target" in
      -*) continue ;;
      BpmnSemantics.?* | +BpmnSemantics.?*) ;;
      *)
        if ! printf '%s\n' "$declared_executables" | grep -Fqx -- "$target"; then
          full_gate_required=true
        fi
        ;;
    esac
    narrow_targets=$((narrow_targets + 1))
  done
  if [ "$narrow_targets" -eq 0 ]; then
    full_gate_required=true
  fi
fi
if [ "$full_gate_required" = true ] &&
  ! printf '%s' "${LEAN_FULL_GATE:-}" | grep -Eqx '[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}'; then
  echo "LEAN_BUILD_REFUSED a full-library build requires LEAN_FULL_GATE=<gate-or-batch-id>; during development build only the changed modules and their direct importers" >&2
  exit 64
fi

lean_build_lock="/tmp/bpmn-lean-experiment-$(id -u).lake-build.lock"
if ! mkdir "$lean_build_lock" 2>/dev/null; then
  echo "LEAN_BUILD_REFUSED another Lean build is active, or the fail-closed lock remains at $lean_build_lock" >&2
  exit 75
fi

cleanup_lean_build_lock() {
  rmdir "$lean_build_lock" 2>/dev/null || true
}
trap cleanup_lean_build_lock 0
trap 'exit 130' 1 2 15

LEAN_NUM_THREADS="$required_lean_build_threads"
export LEAN_NUM_THREADS

lake "$@"
