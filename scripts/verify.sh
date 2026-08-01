#!/bin/sh

set -eu

project_root=$(git rev-parse --show-toplevel)
cd "$project_root"

bpmn_path="scenarios/user-task-discovery-completion/process.bpmn"

./scripts/doctor.sh verify
./scripts/pnpm.sh run test:contracts
./scripts/pnpm.sh run check:harness-types
./scripts/pnpm.sh run check:source-hygiene
./scripts/pnpm.sh run check:doc-fragments

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
./scripts/pnpm.sh run test:infrastructure
./scripts/pnpm.sh run test:temporal
env BPMN_PIPELINE_PREBUILT=1 ./scripts/pnpm.sh run test:pipeline
git diff --check
