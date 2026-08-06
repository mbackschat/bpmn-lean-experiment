#!/bin/sh

# Fetches the official BPMN 2.0.2 normative inputs and informative examples
# directly from OMG, verifies every byte against the tracked digest manifest,
# and only then installs the corpus beside the repository. It never fetches or
# creates the optional Markdown/image conversion cache.

set -eu

script_dir=${0%/*}
project_root=$(CDPATH= cd "$script_dir/.." && pwd)
external_root=${BPMN_EXTERNAL_ROOT:-"$project_root/../oss"}
corpus_root=${BPMN_CORPUS_ROOT:-"$external_root/omg-bpmn-2.0.2"}

if test -e "$corpus_root"; then
  echo "BPMN corpus target already exists at $corpus_root; verify it with scripts/verify-bpmn-corpus.sh" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "BPMN corpus fetch requires curl" >&2
  exit 1
fi

corpus_parent=${corpus_root%/*}
mkdir -p "$corpus_parent"
download_root=$(mktemp -d "$corpus_parent/.bpmn-corpus-fetch.XXXXXX")

cleanup() {
  case "$download_root" in
    */.bpmn-corpus-fetch.*) rm -rf "$download_root" ;;
    *) echo "refusing to clean unexpected temporary path: $download_root" >&2 ;;
  esac
}
trap cleanup 0 1 2 3 15

# Retries because a single transient stream error otherwise fails the whole
# provisioning step before any gate runs: on 2026-08-06 a hosted run died on
# `curl: (92) HTTP/2 stream 1 was not closed cleanly` fetching one archive.
# `--retry-all-errors` is required for that class, since `--retry` alone covers
# transient HTTP status codes and timeouts rather than a broken stream. Retrying
# cannot mask corruption: every file is checked against the tracked manifest
# before installation.
fetch_file() {
  relative_path=$1
  source_url=$2
  destination="$download_root/$relative_path"
  mkdir -p "${destination%/*}"
  echo "Fetching $relative_path"
  curl --fail --location --silent --show-error \
    --retry 3 --retry-delay 2 --retry-all-errors \
    --output "$destination" "$source_url"
}

fetch_file "BPMN-2.0.2.pdf" "https://www.omg.org/spec/BPMN/2.0.2/PDF"
fetch_file "machine-readable/BPMN20-FromXMI.xslt" "https://www.omg.org/spec/BPMN/20100501/BPMN20-FromXMI.xslt"
fetch_file "machine-readable/BPMN20.cmof" "https://www.omg.org/spec/BPMN/20100501/BPMN20.cmof"
fetch_file "machine-readable/BPMN20.xsd" "https://www.omg.org/spec/BPMN/20100501/BPMN20.xsd"
fetch_file "machine-readable/BPMNDI.cmof" "https://www.omg.org/spec/BPMN/20100501/BPMNDI.cmof"
fetch_file "machine-readable/BPMNDI.xsd" "https://www.omg.org/spec/BPMN/20100501/BPMNDI.xsd"
fetch_file "machine-readable/DC.cmof" "https://www.omg.org/spec/BPMN/20100501/DC.cmof"
fetch_file "machine-readable/DC.xsd" "https://www.omg.org/spec/BPMN/20100501/DC.xsd"
fetch_file "machine-readable/DI.cmof" "https://www.omg.org/spec/BPMN/20100501/DI.cmof"
fetch_file "machine-readable/DI.xsd" "https://www.omg.org/spec/BPMN/20100501/DI.xsd"
fetch_file "machine-readable/Infrastructure.cmof" "https://www.omg.org/spec/BPMN/20100502/Infrastructure.cmof"
fetch_file "machine-readable/Semantic.xsd" "https://www.omg.org/spec/BPMN/20100501/Semantic.xsd"
fetch_file "examples/BPMN-2.0-by-Example.pdf" "https://www.omg.org/cgi-bin/doc?dtc/10-06-02.pdf"
fetch_file "examples/BPMN-2.0-by-Example.zip" "https://www.omg.org/cgi-bin/doc?dtc/10-06-02.zip"
fetch_file "examples/BPMN-2.0-machine-readable-examples.zip" "https://www.omg.org/cgi-bin/doc?dtc/10-06-03.zip"

BPMN_CORPUS_ROOT="$download_root" "$script_dir/verify-bpmn-corpus.sh"
mv "$download_root" "$corpus_root"
trap - 0 1 2 3 15
echo "BPMN corpus installed at $corpus_root"
