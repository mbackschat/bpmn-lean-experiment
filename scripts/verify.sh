#!/bin/sh

set -eu

project_root=$(git rev-parse --show-toplevel)
cd "$project_root"

representative_bpmn_path="scenarios/user-task-discovery-completion/process.bpmn"
timer_start_bpmn_path="packages/bpmn-source/test/fixtures/timer-start-event.bpmn"
configured_task_bpmn_path="packages/bpmn-source/test/fixtures/configured-task.bpmn"
activity_boundary_message_bpmn_path="scenarios/activity-boundary-message/process.bpmn"

verify_common() {
  ./scripts/doctor.sh verify
  ./scripts/pnpm.sh run test:infrastructure
  ./scripts/validate-bpmn-xml.sh \
    "$representative_bpmn_path" \
    "$timer_start_bpmn_path" \
    "$configured_task_bpmn_path" \
    "$activity_boundary_message_bpmn_path"
  # Every registered scenario model is XSD-valid; an open-row witness may probe an invalid document on purpose.
  find scenarios -name '*.bpmn' -not -path 'scenarios/open-rows/*' -print | sort | xargs ./scripts/validate-bpmn-xml.sh
}

verify_lean_library() {
  ./scripts/lake.sh build Kernel kernelRun
  # Guards 1 and 2 of the kernel rewrite proposal read the built kernel's environment.
  ./scripts/lake.sh run scripts/kernel-dispatch.lean
  # Guards 17, 18 and 19 read it too; the self-test first shows the scan rejects its seeded violations (guard 23).
  ./scripts/lake.sh run scripts/kernel-effects.lean --self-test
  ./scripts/lake.sh run scripts/kernel-effects.lean
}

# The integration lane restores this stage's output, so it builds every native driver a package test runs.
verify_lean_checks() {
  ./scripts/lake.sh build kernelRun
  # Guards 15 and 22: each builds a fresh clone of HEAD, so neither touches this checkout.
  node scripts/kernel-build-budget.ts lean
  node scripts/kernel-build-budget.ts growth
}

verify_runtime() {
  ./scripts/pnpm.sh run build:verification-typescript
  ./scripts/pnpm.sh run test:kernel
  ./scripts/pnpm.sh run test:temporal-host
  # Guard 15's TypeScript bounds need node_modules, which only this lane installs.
  node scripts/kernel-build-budget.ts typescript
  ./scripts/pnpm.sh run test:bpmn-source:built
  ./scripts/test-cibseven-oracle.sh
  ./scripts/pnpm.sh run test:differential:built
}

verify_temporal() {
  ./scripts/pnpm.sh run test:temporal-host:hosted:built
  ./scripts/pnpm.sh run test:differential:hosted:built
}

# The oracle runs as its own gate so the Lean lane guard sees it here, after the restored `.lake`; `test:pipeline` is
# the same oracle behind a local build, and running both would run it twice.
verify_pipeline() {
  ./scripts/pnpm.sh run test:kernel-behavior-oracle:built
  ./scripts/pnpm.sh run test:model-corpus:built
  git diff --check
}

case "${1:-all}" in
  all)
    verify_common
    verify_lean_library
    verify_lean_checks
    verify_runtime
    verify_temporal
    verify_pipeline
    ;;
  lean-library) verify_lean_library ;;
  lean-checks) verify_lean_checks ;;
  runtime) verify_common; verify_runtime ;;
  temporal) verify_temporal ;;
  pipeline) verify_pipeline ;;
  *) echo "usage: $0 [all|lean-library|lean-checks|runtime|temporal|pipeline]" >&2; exit 2 ;;
esac
