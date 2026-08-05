#!/bin/sh

set -eu

project_root=$(git rev-parse --show-toplevel)
cd "$project_root"

bpmn_path="scenarios/user-task-discovery-completion/process.bpmn"

# Bound Lean's build parallelism, because this repository decides finite fixtures in the kernel and
# kernel reduction holds its terms in resident memory. Lake sizes its build thread pool from
# LEAN_NUM_THREADS, or from the logical processor count when unset, and it exposes no --jobs option;
# on an 8-core host the unpinned default ran four concurrent `lean` processes above 2 GB each and
# peaked at 7978 MB, against 2411 MB at one thread and 4699 MB at two. The pool is a target rather
# than a hard limit — Lean may exceed it to avoid deadlock — so this bounds the peak without
# pretending to cap it.
#
# The default is deliberately the most conservative value, because the peak grows with the number of
# kernel-decided fixtures and that number grows with every capsule. A GitHub-hosted runner for a
# private repository has 7 GB, and the lightweight tier has 5 GB, so an unpinned build already
# exceeds them on an 8-core host. Raising this is a per-machine decision for hosts with spare RAM:
# export LEAN_NUM_THREADS before the gate and measure the peak rather than assuming it scales
# linearly.
LEAN_NUM_THREADS="${LEAN_NUM_THREADS:-1}"
export LEAN_NUM_THREADS

./scripts/doctor.sh verify
echo "A12_ADOPTION_EVIDENCE status=not-run command=./scripts/test-a12-adoption.sh"
./scripts/pnpm.sh run test:contracts
./scripts/pnpm.sh run check:harness-types
./scripts/pnpm.sh run check:source-hygiene

./scripts/validate-bpmn-xml.sh "$bpmn_path"

lake build
lake test
lake build checkCheckedSourceRelationExperiment
lake exe checkCheckedSourceRelationExperiment
lake build emitSemanticProcessResults
./scripts/pnpm.sh run test:semantic-core
./scripts/pnpm.sh run test:bpmn-source
./scripts/test-cibseven-oracle.sh
./scripts/pnpm.sh run test:differential
./scripts/pnpm.sh run test:infrastructure:runtime
./scripts/pnpm.sh run test:temporal
env BPMN_PIPELINE_PREBUILT=1 ./scripts/pnpm.sh run test:pipeline
git diff --check
