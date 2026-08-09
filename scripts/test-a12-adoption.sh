#!/bin/sh

# Explicit, fail-closed source-adoption evidence. This gate is outside default
# MIT engine verification and runs only when a contributor selects A12's
# external EUPL-1.2 checkout deliberately.

set -eu

script_dir=${0%/*}
project_root=$(CDPATH= cd "$script_dir/.." && pwd)
legacy_target=02330ad0f980a5fc282cc0aa93600a9632b86c3e
temporary_root=$(mktemp -d "${TMPDIR:-/tmp}/bpmn-a12-adoption.XXXXXX")
legacy_root="$temporary_root/legacy"

cleanup() {
  case "$temporary_root" in
    "${TMPDIR:-/tmp}"/bpmn-a12-adoption.*) rm -rf -- "$temporary_root" ;;
    *) echo "refusing to remove unexpected temporary path: $temporary_root" >&2 ;;
  esac
}
trap cleanup EXIT HUP INT TERM

"$project_root/scripts/check-external-sources.sh" adoption
"$project_root/scripts/pnpm.sh" run build:bpmn-source
mkdir -p "$legacy_root"
git -C "$project_root" archive "$legacy_target" | tar -x -C "$legacy_root"
ln -s "$project_root/node_modules" "$legacy_root/node_modules"
mkdir -p "$legacy_root/packages/bpmn-source/node_modules/@bpmn-lean"
ln -s "$(realpath "$project_root/packages/bpmn-source/node_modules/bpmn-moddle")" \
  "$legacy_root/packages/bpmn-source/node_modules/bpmn-moddle"
ln -s "$legacy_root/packages/semantic-core" \
  "$legacy_root/packages/bpmn-source/node_modules/@bpmn-lean/semantic-core"

"$project_root/node_modules/.bin/tsc" \
  -p "$legacy_root/packages/semantic-core/tsconfig.json"
"$project_root/node_modules/.bin/tsc" \
  -p "$legacy_root/packages/bpmn-source/tsconfig.json"
(
  cd "$legacy_root"
  node --test --test-concurrency=1 \
    scripts/capsule-roundtrip.test.ts \
    scripts/contract-artifacts.test.ts \
    scripts/contract-artifact-projections.test.ts \
    scripts/contract-message-projection.test.ts \
    scripts/contract-definition-artifacts.test.ts \
    scripts/contract-schema-coverage.test.ts \
    scripts/cib-observation-fidelity.test.ts
)

node "$project_root/scripts/a12-adoption-evidence.ts" "$legacy_root"
node "$project_root/packages/bpmn-source/calibration/a12-adoption-source.ts"
