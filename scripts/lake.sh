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
# surface. `package.json`'s `config.leanBuildThreads` owns the value, and an environment
# LEAN_NUM_THREADS overrides it for one run on a host with spare memory. Raise it by measuring the
# peak rather than by assuming it scales linearly, and keep the default the most conservative value,
# because the peak grows with the number of kernel-decided fixtures and that number grows with every
# capsule.

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
eval "$("$script_dir/pinned-toolchain.sh")"

LEAN_NUM_THREADS="${LEAN_NUM_THREADS:-$required_lean_build_threads}"
export LEAN_NUM_THREADS

exec lake "$@"
