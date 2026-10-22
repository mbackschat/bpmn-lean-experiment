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
}

verify_lean_checks() {
  ./scripts/lake.sh build BpmnSemantics.Experiments.CheckedSourceRelationMain BpmnSemantics.CommittedExecutionPublicationJsonMain BpmnSemantics.FixtureBindingJsonMain
  ./scripts/lake.sh build emitSemanticProcessResults emitEnginePopulationResults emitCommittedExecutionPublication emitInternalChoiceSchedules emitDefinitionAdmissions emitParallelScopeAdmissions emitParallelScopeStartAdmissions emitParallelScopeReservations emitScenarioSupport
  ./scripts/lake.sh run BpmnSemantics/Experiments/CheckedSourceRelationMain.lean
  ./scripts/lake.sh run BpmnSemantics/CommittedExecutionPublicationJsonMain.lean
}

verify_runtime() {
  ./scripts/pnpm.sh run build:verification-typescript
  ./scripts/pnpm.sh run test:semantic-core:built
  ./scripts/pnpm.sh run test:bpmn-source:built
  ./scripts/test-cibseven-oracle.sh
  ./scripts/pnpm.sh run test:differential:built
}

# The Temporal suite runs as its own hosted job after runtime: inside it, runtime reached 16 of its
# 20 minutes (hosted 2026-10-22).
verify_temporal() {
  ./scripts/pnpm.sh run test:temporal:built
}

verify_pipeline() {
  ./scripts/pnpm.sh run test:lean-fixture-bindings:built
  ./scripts/pnpm.sh run test:committed-execution-publication-parity:built
  ./scripts/pnpm.sh run test:message-key-correlation-population-lean-core:built
  ./scripts/pnpm.sh run test:message-payload-lean-core:built
  ./scripts/pnpm.sh run test:activity-boundary-message-lean-core:built
  ./scripts/pnpm.sh run test:internal-choice-schedule-lean-core:built
  node --test --test-concurrency=1 packages/differential/test/compensation-pipeline-lean-core.integration-test.ts
  node --test --test-concurrency=1 packages/differential/test/transaction-pipeline-lean-core.integration-test.ts
  node --test --test-concurrency=1 packages/differential/test/repeatable-subscriptions-lean-core.integration-test.ts
  node --test --test-concurrency=1 packages/differential/test/scenario-value-domain-lean-core.integration-test.ts
  env BPMN_PIPELINE_PREBUILT=1 ./scripts/pnpm.sh run test:pipeline
  git diff --check
}

# Scope and composition parity runs as its own hosted job: with the catalog half it exceeded one
# 10-minute runner job (hosted 2026-10-21: 9.4 minutes before the warm catalog pipeline started).
verify_composition_parity() {
  node --test --test-concurrency=1 packages/differential/test/structured-composition-lean-core.integration-test.ts
  node --test --test-concurrency=1 packages/differential/test/interrupting-message-event-subprocess-lean-core.integration-test.ts
  node --test --test-concurrency=1 packages/differential/test/serial-business-task-lean-core.integration-test.ts
  node --test --test-concurrency=1 packages/differential/test/mixed-task-control-flow-lean-core.integration-test.ts
  node --test --test-concurrency=1 packages/differential/test/mixed-task-business-error-lean-core.integration-test.ts
  node --test --test-concurrency=1 packages/differential/test/sequential-scope-lean-core.integration-test.ts
  node --test --test-concurrency=1 packages/differential/test/parallel-scope-admission-lean-core.integration-test.ts
}

case "${1:-all}" in
  all)
    verify_common
    verify_lean_library
    verify_lean_checks
    verify_runtime
    verify_temporal
    verify_pipeline
    verify_composition_parity
    ;;
  lean-library) verify_lean_library ;;
  lean-checks) verify_lean_checks ;;
  runtime) verify_common; verify_runtime ;;
  temporal) verify_temporal ;;
  pipeline) verify_pipeline ;;
  composition-parity) verify_composition_parity ;;
  *) echo "usage: $0 [all|lean-library|lean-checks|runtime|temporal|pipeline|composition-parity]" >&2; exit 2 ;;
esac
