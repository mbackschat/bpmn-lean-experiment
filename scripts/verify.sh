#!/bin/sh

set -eu

project_root=$(git rev-parse --show-toplevel)
cd "$project_root"

bpmn_path="scenarios/m0-sequential-user-task/process.bpmn"
xsd_path="docs/reference/bpmn-2.0.2/machine-readable/BPMN20.xsd"

verify_scenario_artifacts() {
  artifact_profile_path=$1
  artifact_scenario_path=$2

  jq empty "$artifact_profile_path" "$artifact_scenario_path"
  jq -e '.status == "draft"' "$artifact_profile_path" >/dev/null
  jq -e '
    .calibration.status == "calibrated" and
    (.calibration.expectedOutcome.kind == "semantic") and
    (.calibration.expectedOutcome.outcome | type == "string") and
    (.calibration.expectedTrace | type == "array") and
    (.traceSchemaVersion | type == "string")
  ' "$artifact_scenario_path" >/dev/null

  artifact_profile_id=$(jq -r '.id' "$artifact_profile_path")
  artifact_scenario_profile=$(jq -r '.profile' "$artifact_scenario_path")
  test "$artifact_profile_id" = "$artifact_scenario_profile"

  artifact_profile_observations=$(jq -c '.observations' "$artifact_profile_path")
  artifact_scenario_observations=$(jq -c '.observations' "$artifact_scenario_path")
  test "$artifact_profile_observations" = "$artifact_scenario_observations"

  artifact_scenario_bpmn_path=$(jq -r '.bpmn.relativePath' "$artifact_scenario_path")
  test "$artifact_scenario_bpmn_path" = "$bpmn_path"

  artifact_expected_hash=$(jq -r '.bpmn.sha256' "$artifact_scenario_path")
  artifact_actual_hash=$(shasum -a 256 "$bpmn_path" | awk '{print $1}')
  test "$artifact_expected_hash" = "$artifact_actual_hash"
}

verify_scenario_artifacts \
  "profiles/cibseven-2.2.0-spike.1/profile.json" \
  "scenarios/m0-sequential-user-task/scenario.json"
verify_scenario_artifacts \
  "profiles/cibseven-2.2.0-spike.2/profile.json" \
  "scenarios/m1-user-task-discovery-completion/scenario.json"
verify_scenario_artifacts \
  "profiles/cibseven-2.2.0-spike.2/profile.json" \
  "scenarios/m1-user-task-discovery-completion/wrong-activation.scenario.json"
verify_scenario_artifacts \
  "profiles/cibseven-2.2.0-spike.2/profile.json" \
  "scenarios/m1-user-task-discovery-completion/stale-completion.scenario.json"

jq empty contracts/schemas/*.json

if test -f "$xsd_path"; then
  xmllint --noout --schema "$xsd_path" "$bpmn_path"
else
  xmllint --noout "$bpmn_path"
fi

lake build
lake test
lake build emitSequentialUserTaskResult
./scripts/pnpm.sh run test:semantic-core
./scripts/pnpm.sh run test:bpmn-source
./scripts/test-cibseven-oracle.sh
./scripts/pnpm.sh run test:differential
./scripts/pnpm.sh run test:infrastructure
./scripts/pnpm.sh run build:temporal-adapter
env BPMN_PIPELINE_PREBUILT=1 ./scripts/pnpm.sh run test:pipeline
git diff --check
