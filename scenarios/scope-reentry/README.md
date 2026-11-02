# Scope re-entry scenarios

The [scope re-entry proposal](../../docs/capsules/SCOPE-REENTRY-PROPOSAL.md#separating-witnesses) owns the bounded account; both models grow the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [claim rework](claim-rework.bpmn) with its [handler](claim-rework-overlay.json) assesses an insurance claim in a Sub-Process that declares its own `decision` and `notes`, prices the repair through a mapped Service Task and copies the decision to the Process `assessment`; a rework decision returns to the assessment, which starts again with locals read afresh from the claim summary.
- The [contract revision](contract-revision.bpmn) with its [handler](contract-revision-overlay.json) edits a draft in a Sub-Process, sends it to a reusable legal review Process through a mapped Call and repeats both on a revision verdict; every revision invokes a new called instance with its own copy of the text.

The [source test](../../packages/bpmn-source/test/scope-reentry-source.test.ts) compiles both models and locks the refused one-fact edits; the [runtime test](../../packages/bpmn-source/test/scope-reentry-runtime.test.ts) reads frames and ordinals in committed state, including the late effect result a Temporal schedule cannot carry, because the ordered Activity execution delivers each result exactly once.

Four answer-free schedules are registered as standards-only pipeline cases by the [pipeline cases](../../packages/differential/test/scope-reentry-pipeline-cases.ts), each with one seeded mutation:

- [Claim, rework then approve](claim-rework-then-approve.scenario.json) reworks once with new notes, refuses the first *Inspect damage* completion after the rework, and approves in the second iteration, whose *Price repair* reads the summary again. Its mutation hands that second *Price repair* the first iteration's notes, as a completion that kept the frame would.
- [Claim, rework then reject](claim-rework-then-reject.scenario.json) reworks once and rejects in the second iteration, notifying the claimant. Its mutation reopens the second *Inspect damage* under ordinal one, as identity by element alone would.
- [Contract, revise then sign](contract-revise-then-sign.scenario.json) revises once, refuses the first review's late verdict, signs and files the contract. Its mutation commits that late verdict.
- [Contract, revise then withdraw](contract-revise-then-withdraw.scenario.json) revises once and withdraws in the second review. Its mutation addresses the second review to the first called instance, as identity by element alone would.
