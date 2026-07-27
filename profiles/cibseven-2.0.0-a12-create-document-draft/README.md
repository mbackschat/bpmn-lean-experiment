# CIB Seven 2.0.0 A12 CreateDocument profile

The [immutable profile artifact](profile.json) selects the exact successful string-only `None Start Event → CreateDocument Service Task → None End Event` path from the A12 Workflows `release/2025.06` target.

The source supplies `{http://camunda.org/schema/1.0/bpmn}delegateExpression="${createDocumentDelegate}"`, one literal `documentModelName` input, and one `${newDocRef}` output mapped to Process variable `myDocumentReference`. The profile supplies protocol identity `urn:bpmn-lean:a12-delegate:v1`; it does not reinterpret the bean token as general JUEL.

CIB Seven executes the synchronous delegate and mappings atomically inside one engine transaction. The project effect wait, committed arguments, Activity result, and output-mapping boundary are therefore a Temporal-hosted refinement under `CIB-OP-0002`, not independently observed intermediate CIB states.

The profile makes no claim about non-string values, arbitrary variables or beans, Java binary compatibility, failures, rollback equivalence, BPMN Errors, scripts, listeners, incidents, or external tasks.
