# Scope re-entry scenarios

The [scope re-entry specification](../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md) owns the bounded account; both models are witnesses for the [`cibseven-2.2.0-scope-chain` profile](../../profiles/cibseven-2.2.0-scope-chain/profile.json), each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [claim rework](claim-rework.bpmn) with its [handler](claim-rework-overlay.json) assesses an insurance claim in a Sub-Process that declares its own `decision` and `notes`, prices the repair through a mapped Service Task and copies the decision to the Process `assessment`; a rework decision returns to the assessment, which starts again with locals read afresh from the claim summary.
- The [contract revision](contract-revision.bpmn) with its [handler](contract-revision-overlay.json) edits a draft in a Sub-Process, sends it to a reusable legal review Process through a mapped Call and repeats both on a revision verdict; every revision invokes a new called instance with its own copy of the text.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Claim, rework then approve](claim-rework-then-approve.scenario.json) reworks once with new notes, refuses the first *Inspect damage* completion after the rework, and approves in the second iteration, whose *Price repair* reads the summary again.
- [Claim, rework then reject](claim-rework-then-reject.scenario.json) reworks once and rejects in the second iteration, notifying the claimant.
- [Contract, revise then sign](contract-revise-then-sign.scenario.json) revises once, refuses the first review's late verdict, signs and files the contract.
- [Contract, revise then withdraw](contract-revise-then-withdraw.scenario.json) revises once and withdraws in the second review.
