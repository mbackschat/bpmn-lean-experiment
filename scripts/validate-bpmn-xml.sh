#!/bin/sh

# Validates BPMN XML for every verification entrypoint.
#
# This is the single owner of the `xmllint` dependency. It preflights that host
# tool, because an absent one otherwise surfaces as a bare exit 127 partway
# through a gate, and it names which validation it actually performed. The
# pinned BPMN20.xsd belongs to the Git-ignored OMG corpus, so a clean checkout
# and CI can establish well-formedness only; that reduction is announced rather
# than silent, because a green gate must not read as schema conformance nobody
# checked. `BPMN_XSD_PATH` overrides the schema location.
#
# Paths are resolved by the caller: verification scripts run from the project
# root or pass absolute paths.

set -eu

script_dir=${0%/*}
xsd_path=${BPMN_XSD_PATH:-"$script_dir/../docs/reference/bpmn-2.0.2/machine-readable/BPMN20.xsd"}

if ! command -v xmllint >/dev/null 2>&1; then
  echo "BPMN XML validation requires xmllint (Debian/Ubuntu: apt-get install libxml2-utils; Homebrew: brew install libxml2)" >&2
  exit 1
fi

# Several libxml2 builds commonly coexist on one host, so the announcement
# names the resolved binary: a schema claim belongs to the validator that
# established it, not to the tool name.
xmllint_path=$(command -v xmllint)

if test -f "$xsd_path"; then
  echo "BPMN XML validation: schema-validated against $xsd_path using $xmllint_path"
  for bpmn_path in "$@"; do
    xmllint --noout --schema "$xsd_path" "$bpmn_path"
  done
else
  echo "BPMN XML validation: $xsd_path is absent, so this run checks well-formedness only and makes no schema conformance claim"
  for bpmn_path in "$@"; do
    xmllint --noout "$bpmn_path"
  done
fi
