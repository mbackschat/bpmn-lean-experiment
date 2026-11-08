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
  echo "A12_ADOPTION_EVIDENCE status=not-run command=./scripts/test-a12-adoption.sh"
  ./scripts/pnpm.sh run test:infrastructure
  ./scripts/validate-bpmn-xml.sh \
    "$representative_bpmn_path" \
    "$timer_start_bpmn_path" \
    "$configured_task_bpmn_path" \
    "$activity_boundary_message_bpmn_path"
}

verify_lean_library() {
  LEAN_FULL_GATE=verify-lean-library ./scripts/lake.sh test
  LEAN_FULL_GATE=verify-lean-conformance ./scripts/lake.sh build BpmnConformance
  ./scripts/lake.sh run scripts/lean-realized-leaks.lean BpmnSemantics.RealizedLeakFixtures scripts/lean-realized-leaks.tsv BpmnSemantics BpmnConformance
}

verify_lean_checks() {
  ./scripts/lake.sh build BpmnSemantics.Experiments.CheckedSourceRelationMain BpmnSemantics.CommittedExecutionPublicationJsonMain BpmnSemantics.FixtureBindingJsonMain
  ./scripts/lake.sh build emitSemanticProcessResults emitEnginePopulationResults emitCommittedExecutionPublication emitInternalChoiceSchedules emitDefinitionAdmissions emitParallelScopeAdmissions emitParallelScopeStartAdmissions emitParallelScopeReservations emitScenarioSupport checkCallFamilyFixtures checkConformanceFixtures
  ./scripts/lake.sh run BpmnSemantics/Experiments/CheckedSourceRelationMain.lean
  ./scripts/lake.sh run BpmnSemantics/CommittedExecutionPublicationJsonMain.lean
  # The executable checks run as the binary built above, because the wrapper's forbidden exe subcommand
  # re-checks the closure on every call (scripts/lean-native-driver.ts).
  .lake/build/bin/checkCallFamilyFixtures
  .lake/build/bin/checkConformanceFixtures
  # Guards 1 and 2 of the kernel rewrite proposal read the built kernel's environment.
  ./scripts/lake.sh build Kernel kernelRun
  ./scripts/lake.sh run scripts/kernel-dispatch.lean
}

verify_runtime() {
  ./scripts/pnpm.sh run build:verification-typescript
  ./scripts/pnpm.sh run test:semantic-core:built
  ./scripts/pnpm.sh run test:kernel
  ./scripts/pnpm.sh run test:bpmn-source:built
  ./scripts/test-cibseven-oracle.sh
  ./scripts/pnpm.sh run test:differential:built
}

# The Temporal suite runs as two hosted jobs after runtime: inside runtime it reached 16 of 20
# minutes, and as one job it needed about 14 of 15, the serial witnesses alone 5.3 minutes (hosted
# 2026-10-22). Together the two stages run every part of test:temporal:built.
verify_temporal() {
  ./scripts/pnpm.sh run test:temporal:built:components
  ./scripts/pnpm.sh run test:temporal:built:concurrent
  ./scripts/pnpm.sh run test:temporal:built:hosted
}

verify_temporal_serial() {
  ./scripts/pnpm.sh run test:temporal:built:hosted-serial
}

# The hosted job runs one leg per case partition (`pipelineCaseIdsFor`); the catalog-wide Lean integration suites run
# once, in the other-schedules leg, and a local run without a partition runs everything. A leg not named here runs none
# of them.
pipeline_leg_runs_lean_suites() {
  case "${BPMN_PIPELINE_PARTITION:-}" in
    "" | other-schedules) return 0 ;;
    *) return 1 ;;
  esac
}

verify_pipeline() {
  if pipeline_leg_runs_lean_suites; then
    ./scripts/pnpm.sh run test:lean-fixture-bindings:built
    ./scripts/pnpm.sh run test:committed-execution-publication-parity:built
    ./scripts/pnpm.sh run test:kernel-behavior-oracle:built
  fi
  env BPMN_PIPELINE_PREBUILT=1 ./scripts/pnpm.sh run test:pipeline
  git diff --check
}

case "${1:-all}" in
  all)
    verify_common
    verify_lean_library
    verify_lean_checks
    verify_runtime
    verify_temporal
    verify_temporal_serial
    verify_pipeline
    ;;
  lean-library) verify_lean_library ;;
  lean-checks) verify_lean_checks ;;
  runtime) verify_common; verify_runtime ;;
  temporal) verify_temporal ;;
  temporal-serial) verify_temporal_serial ;;
  pipeline) verify_pipeline ;;
  *) echo "usage: $0 [all|lean-library|lean-checks|runtime|temporal|temporal-serial|pipeline]" >&2; exit 2 ;;
esac
