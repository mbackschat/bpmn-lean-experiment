# Internal closure atomicity repair specification

## Status

Lifecycle: implemented
Review: closure-approved

## Question and bounded outcome

What may a caller retain when external admission succeeds but internal closure exhausts fuel or encounters an unsupported observable choice?

Closure failure returns `rolledBack`, the exact pre-command RuntimeState, both explicit closure flags, and no transition or lifecycle publication. This contract distinguishes canonical publication from semantic replay and records the already selected final commutation obligations. It admits no additional batch, topology, scheduling input, or profile.

## Rollback boundary

Rollback undoes external admission itself, including removal of a completed wait. Restoring only the last internal batch boundary can retain an admitted or partially closed successor that the [atomic publication rule](COMMITTED-EXECUTION-PUBLICATION-SPEC.md#epub-commit-01-atomic-publication) forbids exposing. Host failure classification precedes success-only publication and recovery processing so that a missing command outcome cannot mask the closure failure.

## Required, optional, and excluded functionality

Required: whole-command rollback for either closure flag in traced and result-only APIs; both flags in TypeScript `CommandResult`; the existing harness-failure classification before observation for both flags; exact result erasure and empty publication; independent start, completion, and late-ambiguity discriminators; and the account corrections below.

Optional functionality: none.

Excluded: new command-admission outcomes, new public engine or scenario wire arms, source/profile changes, new batchable families, scheduled-choice implementation, arbitrary-frontier proof closure, new Temporal policy, a BPMN preemption rule, and a general runtime-preservation theorem. Existing successful and admission-rejected command behavior remains exact.

## Command contract

`CLOSURE-ATOMIC-01`: after committed admission, if closure reports `internalStepBoundExceeded` or `ambiguousInternalChoice`, the command result is `rolledBack` with state exactly equal to the input before admission. Preserve the actual flags and erase speculative selected steps, batches, transition records, and lifecycle deltas. No rollback result may expose an admitted or partially closed successor through the public result or publication.

TypeScript keeps the command-admission union unchanged. Only the evaluator's result outcome gains the already defined `CommandOutcome.RolledBack` arm; its result always carries both Boolean flags, matching Lean. The internal evaluation and traced wrappers agree on those flags. A closure refusal classified as an admission rejection retains its existing rejected outcome and exact original state.

The [scenario harness](../../packages/semantic-core/src/scenario.ts) must check both flags before calling observation or creating command observations. Either failure remains `HarnessFailure` with no observation or publication; it does not become a semantic terminal outcome. The [Workflow loop](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) must classify that result as `BpmnSemanticClosureFailure` before publication integration, recovery outcome lookup/recording, or candidate assignment, including when recovery admission is present. Semantic state, publication, and semantic command results remain unchanged. This contract adds no public retry or semantic rollback receipt.

Private scheduled evaluation inherits whole-command rollback for fuel, reject-mode ambiguity, and directive failure. Fuel precedes the next batch or directive; exhausted fuel does not become a schedule defect or an unused-directive failure. The [exact Merge outcome](../INTERNAL-COMMUTATION-PROPOSAL.md#exact-merge-frontier-outcome) owns implemented directive validation and consumption; this repair adds no public scheduled profile or Temporal admission.

## Publication and commutation account corrections

`CLOSURE-PUBLICATION-01`: production emits internal records in its canonical execution order. Semantic replay reconstructs state; it does not certify that every permutation changes state. Swapping two independently commuting records may replay successfully to the same result. The [publication specification](COMMITTED-EXECUTION-PUBLICATION-SPEC.md#epub-replay-01-trace-completeness) must distinguish that positive from a dependency-sensitive swap negative and from exact canonical publication-byte equality. Existing metadata and semantic-input corruption checks remain required.

Before any token-producing or region family joins production batches, the final commutation account must represent the owner census read of `onlyTokenOwner` as `tokenOwners(place)`, independent of the selected owner. Every insertion or removal that can change that census writes the corresponding atom, including regional removal. Owner-specific multiplicity atoms remain necessary; the census atom does not replace them. The ordinary-arm pair theorem is not refuted by a producer-family counterexample outside its footprint domain.

The final preparation/frame account quantifies over every admitted Program and every runtime-well-formed, canonical, open-set-projectable intermediate state. Relation soundness, preservation of those premises, equality of the complete prepared value including its publication template, and independent patch/publication commutation jointly support adjacent swaps. An executor must apply its classified prepared patch or require equality of the complete re-derived preparation before accepting it. Operation-ID equality alone is insufficient. These obligations constrain family integration; this repair's closure itself established no arbitrary finite-batch theorem. Subsequent implementation and proof status belongs to [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md#current-boundary).

A future admitted topology that exposes an interrupting transition beside an unarmed sibling can create an observable choice under reject mode. Record that reopen condition without claiming that current admitted Error/Terminate fixtures exhibit it or selecting preemption. The Lean region module is included by the maintained library root; its inclusion does not establish production family integration or a general region-commutation proof.

## Cross-target invariant matrix

| Fact | TypeScript | Lean | Harness and Temporal |
|---|---|---|---|
| Closure failure | Rolled back; both flags explicit | Same outcome and flags | Existing infrastructure failure before observation |
| State identity | Exact input before external admission | Same quantified equality | No candidate assignment or publication append |
| Trace | Empty selected/public transition and lifecycle material | Empty transition and lifecycle publication; erasure law | No semantic command or terminal receipt for the failure |
| Stable success | Existing result and canonical publication | Existing result and canonical publication | Existing recovery and replay remain exact |
| Independent replay swap | May reconstruct the same state | Same positive witness | Canonical published bytes remain unchanged |
| Non-requirement | No widened admission or production batch domain | No new arbitrary-frontier or preservation claim | No new schedule or deployment contract |

## Lean assurance lane

Lane shape: proved

Evidence: the [evaluator and trace owner](../../BpmnSemantics/SemanticProcess/TransitionTrace.lean) proves the whole-command rollback and no-publication consequences over Program, input state, stimulus, and closure limit, while retaining traced-result erasure and emitted-trace replay. Compact kernel-decided witnesses separate fuel failure during start, fuel failure after accepted completion, late ambiguity after a successful prefix, and unchanged successful/rejected results.

The [Compensation-aware evaluator](../../BpmnSemantics/SemanticProcess/CompensationEventSubProcessSnapshotTransitionTrace.lean) independently constructs declaration-bearing results. Its public `applyStimulusWithCompensationSnapshots` and `applyStimulusTracedWithCompensationSnapshots` wrappers prove the same quantified rollback, empty-publication, and erasure laws. A declaration-bearing closure-failure discriminator reaches that producer; declaration-free delegation and existing Compensation refusal behavior remain exact positives. Base-evaluator proofs alone cannot discharge this lane.

The nearest non-law is that every structurally admitted Program reaches a stable state within the configured fuel. This repair makes failure atomic; it does not establish termination or erase the diagnostic. The principal common-mode risk is restoring the post-admission or pre-batch state in both languages and calling it rollback. The completion witness independently requires the exact original wait, counters, variables, and state.

The related [completion-equality law](../../BpmnSemantics/SemanticProcess/Execution.lean) now requires successful closure: equal admitted successors cannot equate rollback results that restore different inputs. The [atomicity witnesses](../../BpmnSemantics/InternalClosureAtomicityConformance.lean) separate that false stronger claim with two task labels erased by the same admitted completion. The [metadata completion theorem](../../BpmnSemantics/UserTaskMetadataConformance.lean) retains its statement for arbitrary admitted metadata and completion values; its proof discharges success for the fixed continuation. Cyclic reachability and gateway prefix fixtures now use admission and explicit internal steps, with successful-prefix controls, instead of retaining a failed public result as an intermediate state.

## Temporal hosting and refinement preflight

Ingress, waits, timers, effects, cancellation, lifecycle, deduplication, concurrency, retries, continuation, and replay retain their current mechanisms. The relation remains exact committed semantic state plus committed publication; closure failure must leave both unchanged. The correction moves Workflow failure classification before publication/recovery processing and checks both flags in the harness before observation. No host scheduling primitive supplies an internal choice.

The smallest host-boundary witness drives both closure flags through scenario advancement and a recovery-admitted Workflow command. It requires exact `BpmnSemanticClosureFailure`, unchanged semantic state, publication, and semantic command results, and no failed candidate assignment; `BpmnCommandOutcomeMissing` is the separating wrong result. Retain a successful recoverable command with exact publication as a positive. Existing admitted live histories must retain their results and replay. A required old history that depends on the former partial committed result is a reopen condition, not permission to silently reinterpret it.

## Versioning consequences

The [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy) permits this atomic pure-result correction. It changes the lower-layer failure outcome and adds the missing TypeScript flag; it changes no Program, RuntimeState, registered semantic result, or public transport schema. The [scheduling proposal](../INTERNAL-COMMUTATION-PROPOSAL.md), [publication specification](COMMITTED-EXECUTION-PUBLICATION-SPEC.md), and [IL scheduling contract](../SEMANTIC-PROCESS-IL-SPEC.md#internal-scheduling) consume this failure contract.

[`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md)

[`implementation-status-owner:TEMPORAL-HOSTING`](../TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md)

The [closure documentation guard](../../scripts/semantic-closure-documentation.test.ts), [commutation census](../../scripts/internal-commutation-census.test.ts), [publication coverage guard](../../scripts/execution-publication-contract-coverage.test.ts), [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [review policy](../../scripts/independent-review-policy.test.ts), and [Markdown links](../../scripts/markdown-links.test.ts) bind this contract. Closure establishes atomic failure and accurate bounded commutation/publication claims only; RC families and the arbitrary-frontier theorem remain open in their existing owner.

## Closure evidence and reflection

The [host regression](../../packages/temporal-adapter/workflow/test/closure-failure-classification.test.ts) executes the production Workflow loop with real recovery, publication, and scenario evaluation. It injects fuel zero and a duplicate End operation only at the evaluator boundary after recovery admission; both reproduced `BpmnCommandOutcomeMissing` before the correction. Both now require nonretryable `BpmnSemanticClosureFailure`, exact retained RuntimeState and trace, unchanged recovery and paired publication, and no failed command outcome. The positive executes ordinary completion and compares its entire canonical publication with the semantic-core fold. This boundary probe uses Node's module mocks; live-host and replay evidence remain the complete Temporal and Product 1 gates.

The correction reuses the existing failure type and moves its classification before success-only processing. No new production abstraction, persistence state, or transport arm is introduced. The new typed probe exposed pre-existing discriminant widening in two shared test fixtures; contextual `satisfies` checks preserve their exact values. The semantic checkpoint preceded this host integration. The [resource measurements](../CAPSULE-COST-LEDGER.md#internal-closure-atomicity-correction) retain every changed owner and standing-watch consumer under the unchanged fixed ceiling; they do not infer memory cost from a module's unchanged source bytes.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `72a50a4cd8c76892bab7daff44a01b9b50050b2e` | `fork-turns-none` | `approve-with-required-edits` | `bb57973955b0948c17d7d3ea0f36238c21b21b25` |
| Semantic checkpoint | `b3b7e7a300c225079e749fc8d83ca45ed9704856` | `fork-turns-none` | `approve-with-required-edits` | `7aa1b25c722618ec414b62f3ed1caceacd284744` |
| Closure | `37cfbfb957bdb6e57e8dec805b07cea44c648713` | `checkpoint-reviewer-warm` | `approve` | `not-required` |
