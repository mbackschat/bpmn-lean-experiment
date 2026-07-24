#!/bin/sh

set -eu

project_root=$(git rev-parse --show-toplevel)
cd "$project_root"

profile_path="profiles/cibseven-2.2.0-spike.1/profile.json"
scenario_path="scenarios/m0-sequential-user-task/scenario.json"
bpmn_path="scenarios/m0-sequential-user-task/process.bpmn"
xsd_path="docs/reference/bpmn-2.0.2/machine-readable/BPMN20.xsd"

jq empty "$profile_path" "$scenario_path"
jq -e '.status == "draft"' "$profile_path" >/dev/null
jq -e '.calibration.status == "calibrated" and (.calibration.expectedTrace | type == "array")' "$scenario_path" >/dev/null

profile_id=$(jq -r '.id' "$profile_path")
scenario_profile=$(jq -r '.profile' "$scenario_path")
test "$profile_id" = "$scenario_profile"

profile_observations=$(jq -c '.observations' "$profile_path")
scenario_observations=$(jq -c '.observations' "$scenario_path")
test "$profile_observations" = "$scenario_observations"

scenario_bpmn_path=$(jq -r '.bpmn.relativePath' "$scenario_path")
test "$scenario_bpmn_path" = "$bpmn_path"

expected_hash=$(jq -r '.bpmn.sha256' "$scenario_path")
actual_hash=$(shasum -a 256 "$bpmn_path" | awk '{print $1}')
test "$expected_hash" = "$actual_hash"

if test -f "$xsd_path"; then
  xmllint --noout --schema "$xsd_path" "$bpmn_path"
else
  xmllint --noout "$bpmn_path"
fi

lake build
lake test
./scripts/pnpm.sh run test:semantic-core
./scripts/test-cibseven-oracle.sh
./scripts/pnpm.sh run test:temporal
git diff --check
