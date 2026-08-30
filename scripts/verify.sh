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

verify_lean() {
  ./scripts/lake.sh build
  ./scripts/lake.sh test
  ./scripts/lake.sh exe checkCheckedSourceRelationExperiment
  ./scripts/lake.sh build emitSemanticProcessResults
}

verify_runtime() {
  ./scripts/pnpm.sh run build:verification-typescript
  ./scripts/pnpm.sh run test:semantic-core:built
  ./scripts/pnpm.sh run test:bpmn-source:built
  ./scripts/test-cibseven-oracle.sh
  ./scripts/pnpm.sh run test:differential:built
  ./scripts/pnpm.sh run test:message-payload-lean-core:built
  ./scripts/pnpm.sh run test:temporal:built
}

verify_pipeline() {
  ./scripts/pnpm.sh run test:committed-execution-publication-parity:built
  env BPMN_PIPELINE_PREBUILT=1 ./scripts/pnpm.sh run test:pipeline
  git diff --check
}

case "${1:-all}" in
  all)
    verify_common
    verify_lean
    verify_runtime
    verify_pipeline
    ;;
  lean) verify_lean ;;
  runtime) verify_common; verify_runtime ;;
  pipeline) verify_pipeline ;;
  *) echo "usage: $0 [all|lean|runtime|pipeline]" >&2; exit 2 ;;
esac
