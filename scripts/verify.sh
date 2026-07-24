#!/bin/sh

set -eu

project_root=$(git rev-parse --show-toplevel)
cd "$project_root"

xsd_path="docs/reference/bpmn-2.0.2/machine-readable/BPMN20.xsd"
bpmn_path="scenarios/m0-sequential-user-task/process.bpmn"

./scripts/pnpm.sh run test:contracts

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
