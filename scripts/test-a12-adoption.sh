#!/bin/sh

# Explicit, fail-closed source-adoption evidence. This gate is outside default
# MIT engine verification and runs only when a contributor selects A12's
# external EUPL-1.2 checkout deliberately.

set -eu

script_dir=${0%/*}
project_root=$(CDPATH= cd "$script_dir/.." && pwd)

"$project_root/scripts/check-external-sources.sh" adoption
"$project_root/scripts/pnpm.sh" run build:bpmn-source
exec node "$project_root/packages/bpmn-source/calibration/a12-adoption-source.ts"
