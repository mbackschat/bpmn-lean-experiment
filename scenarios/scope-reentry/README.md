# Scope re-entry scenarios

The [scope re-entry proposal](../../docs/capsules/SCOPE-REENTRY-PROPOSAL.md#separating-witnesses) owns the bounded account; both models grow the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [claim rework](claim-rework.bpmn) with its [handler](claim-rework-overlay.json) assesses an insurance claim in a Sub-Process that declares its own `decision` and `notes`, prices the repair through a mapped Service Task and copies the decision to the Process `assessment`; a rework decision returns to the assessment, which starts again with locals read afresh from the claim summary.
- The [contract revision](contract-revision.bpmn) with its [handler](contract-revision-overlay.json) edits a draft in a Sub-Process, sends it to a reusable legal review Process through a mapped Call and repeats both on a revision verdict; every revision invokes a new called instance with its own copy of the text.
