#!/bin/sh

# Verifies the locally fetched, non-redistributed OMG BPMN 2.0.2 inputs against
# the tracked project manifest. The corpus lives beside the repository by
# default; BPMN_CORPUS_ROOT permits another local checkout location.

set -eu

script_dir=${0%/*}
project_root=$(CDPATH= cd "$script_dir/.." && pwd)
external_root=${BPMN_EXTERNAL_ROOT:-"$project_root/../oss"}
corpus_root=${BPMN_CORPUS_ROOT:-"$external_root/omg-bpmn-2.0.2"}
manifest_path="$project_root/docs/reference/bpmn-2.0.2/LOCAL-CORPUS.sha256"

if ! test -d "$corpus_root"; then
  echo "BPMN corpus is absent at $corpus_root; run scripts/fetch-bpmn-corpus.sh or set BPMN_CORPUS_ROOT" >&2
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  (CDPATH= cd "$corpus_root" && shasum -a 256 -c "$manifest_path")
elif command -v sha256sum >/dev/null 2>&1; then
  (CDPATH= cd "$corpus_root" && sha256sum -c "$manifest_path")
else
  echo "BPMN corpus verification requires shasum or sha256sum" >&2
  exit 1
fi

echo "BPMN corpus verified at $corpus_root"
