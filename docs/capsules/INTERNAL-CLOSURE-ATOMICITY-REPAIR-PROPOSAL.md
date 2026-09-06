# Internal closure atomicity repair proposal

## Status

Lifecycle: implementation-in-progress
Review: approved-with-required-edits

## Question and bounded outcome

What may a caller retain when external admission succeeds but internal closure exhausts fuel or encounters an unsupported observable choice?

This correction returns `rolledBack`, the exact pre-command RuntimeState, both explicit closure flags, and no transition or lifecycle publication. It also corrects the publication replay discriminator and makes the already selected final commutation obligations explicit. It admits no additional batch, topology, scheduling input, or profile and does not resume RC implementation.

## Existing contradiction

At the proposal baseline, the [TypeScript evaluator](../../packages/semantic-core/src/semantic-process-runtime.ts) and [Lean evaluator](../../BpmnSemantics/SemanticProcess/TransitionTrace.lean) returned a committed partially closed state when closure failed. The traced boundaries suppressed publication, but the result-only TypeScript contract omitted the ambiguity flag. The [selected scheduling account](../INTERNAL-COMMUTATION-PROPOSAL.md#selected-final-closure-account) explicitly preserved that fuel behavior, conflicting with the [atomic publication rule](COMMITTED-EXECUTION-PUBLICATION-SPEC.md#epub-commit-01-atomic-publication).

Two root probes on 2026-09-05 reproduce the mechanism through the public core API: starting the fork/join fixture with fuel two, and completing its final waiting task with fuel zero. Both return `committed` with no published transitions. The second case proves that rollback must undo external admission itself, including removal of the completed wait, rather than restoring only the last internal batch boundary.

The production Workflow routes through [scenario advancement](../../packages/semantic-core/src/scenario.ts). Bound failure already becomes a harness failure; an ambiguous result either lacks a stable snapshot or is refused by publication integration before Workflow state assignment. For a recovery-admitted command, the [Workflow loop](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) currently processes publication and recovery before its harness-failure switch, so `BpmnCommandOutcomeMissing` can preempt `BpmnSemanticClosureFailure`. This correction does not claim demonstrated persistence of a partial semantic state; it requires explicit failure classification before publication and recovery processing.

## Required, optional, and excluded functionality

Required: whole-command rollback for either closure flag in traced and result-only APIs; both flags in TypeScript `CommandResult`; the existing harness-failure classification before observation for both flags; exact result erasure and empty publication; independent start, completion, and late-ambiguity discriminators; and the account corrections below.

Optional functionality: none.

Excluded: new command-admission outcomes, new public engine or scenario wire arms, source/profile changes, new batchable families, scheduled-choice implementation, arbitrary-frontier proof closure, new Temporal policy, a BPMN preemption rule, and a general runtime-preservation theorem. Existing successful and admission-rejected command behavior remains exact.

## Command contract

`CLOSURE-ATOMIC-01`: after committed admission, if closure reports `internalStepBoundExceeded` or `ambiguousInternalChoice`, the command result is `rolledBack` with state exactly equal to the input before admission. Preserve the actual flags and erase speculative selected steps, batches, transition records, and lifecycle deltas. No rollback result may expose an admitted or partially closed successor through the public result or publication.

TypeScript keeps the command-admission union unchanged. Only the evaluator's result outcome gains the already defined `CommandOutcome.RolledBack` arm; its result always carries both Boolean flags, matching Lean. The internal evaluation and traced wrappers agree on those flags. A closure refusal classified as an admission rejection retains its existing rejected outcome and exact original state.

The [scenario harness](../../packages/semantic-core/src/scenario.ts) must check both flags before calling observation or creating command observations. Either failure remains `HarnessFailure` with no observation or publication; it does not become a semantic terminal outcome. The [Workflow loop](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) must classify that result as `BpmnSemanticClosureFailure` before publication integration, recovery outcome lookup/recording, or candidate assignment, including when recovery admission is present. Semantic state, publication, and semantic command results remain unchanged. This proposal adds no public retry or semantic rollback receipt.

The future scheduled evaluator inherits whole-command rollback for fuel and reject-mode ambiguity. Fuel still precedes the next batch or directive; exhausted fuel does not become a schedule defect or an unused-directive failure. Existing directive-validation order and whole-command rollback remain selected but unimplemented obligations of the owning commutation proposal.

## Publication and commutation account corrections

`CLOSURE-PUBLICATION-01`: production emits internal records in its canonical execution order. Semantic replay reconstructs state; it does not certify that every permutation changes state. Swapping two independently commuting records may replay successfully to the same result. The [publication specification](COMMITTED-EXECUTION-PUBLICATION-SPEC.md#epub-replay-01-trace-completeness) must distinguish that positive from a dependency-sensitive swap negative and from exact canonical publication-byte equality. Existing metadata and semantic-input corruption checks remain required.

Before any token-producing or region family joins production batches, the final commutation account must represent the owner census read of `onlyTokenOwner` as `tokenOwners(place)`, independent of the selected owner. Every insertion or removal that can change that census writes the corresponding atom, including regional removal. Owner-specific multiplicity atoms remain necessary; the census atom does not replace them. The ordinary-arm pair theorem is not refuted by a producer-family counterexample outside its footprint domain.

The final preparation/frame account quantifies over every admitted Program and every runtime-well-formed, canonical, open-set-projectable intermediate state. Relation soundness, preservation of those premises, equality of the complete prepared value including its publication template, and independent patch/publication commutation jointly support adjacent swaps. An executor must apply its classified prepared patch or require equality of the complete re-derived preparation before accepting it. Operation-ID equality alone is insufficient. These are conditions for the already selected future family integration, not claims that its arbitrary finite-batch theorem is implemented.

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

Evidence: the [evaluator and trace owner](../../BpmnSemantics/SemanticProcess/TransitionTrace.lean) must quantify the whole-command rollback and no-publication consequences over Program, input state, stimulus, and closure limit, while retaining traced-result erasure and emitted-trace replay. Compact kernel-decided witnesses separate fuel failure during start, fuel failure after accepted completion, late ambiguity after a successful prefix, and unchanged successful/rejected results. Existing negative fixtures that assert the former committed partial result must change explicitly under this reviewed contract; unrelated theorem statements and hypotheses remain unchanged.

The [Compensation-aware evaluator](../../BpmnSemantics/SemanticProcess/CompensationEventSubProcessSnapshotTransitionTrace.lean) independently constructs declaration-bearing results. Its public `applyStimulusWithCompensationSnapshots` and `applyStimulusTracedWithCompensationSnapshots` wrappers owe the same quantified rollback, empty-publication, and erasure laws. A declaration-bearing closure-failure discriminator must reach that producer; declaration-free delegation and existing Compensation refusal behavior remain exact positives. Base-evaluator proofs alone cannot discharge this lane.

The nearest non-law is that every structurally admitted Program reaches a stable state within the configured fuel. This repair makes failure atomic; it does not establish termination or erase the diagnostic. The principal common-mode risk is restoring the post-admission or pre-batch state in both languages and calling it rollback. The completion witness independently requires the exact original wait, counters, variables, and state.

The related [completion-equality law](../../BpmnSemantics/SemanticProcess/Execution.lean) now requires successful closure: equal admitted successors cannot equate rollback results that restore different inputs. The [atomicity witnesses](../../BpmnSemantics/InternalClosureAtomicityConformance.lean) separate that false stronger claim with two task labels erased by the same admitted completion. The [metadata completion theorem](../../BpmnSemantics/UserTaskMetadataConformance.lean) retains its statement for arbitrary admitted metadata and completion values; its proof discharges success for the fixed continuation. Cyclic reachability and gateway prefix fixtures now use admission and explicit internal steps, with successful-prefix controls, instead of retaining a failed public result as an intermediate state.

## Temporal hosting and refinement preflight

Ingress, waits, timers, effects, cancellation, lifecycle, deduplication, concurrency, retries, continuation, and replay retain their current mechanisms. The relation remains exact committed semantic state plus committed publication; closure failure must leave both unchanged. The correction moves Workflow failure classification before publication/recovery processing and checks both flags in the harness before observation. No host scheduling primitive supplies an internal choice.

The smallest host-boundary witness drives both closure flags through scenario advancement and a recovery-admitted Workflow command. It requires exact `BpmnSemanticClosureFailure`, unchanged semantic state, publication, and semantic command results, and no failed candidate assignment; `BpmnCommandOutcomeMissing` is the separating wrong result. Retain a successful recoverable command with exact publication as a positive. Existing admitted live histories must retain their results and replay. A required old history that depends on the former partial committed result is a reopen condition, not permission to silently reinterpret it.

## Versioning consequences

The [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy) permits this atomic pure-result correction. It changes the lower-layer failure outcome and adds the missing TypeScript flag; it changes no Program, RuntimeState, registered semantic result, or public transport schema. The [scheduling proposal](../INTERNAL-COMMUTATION-PROPOSAL.md), [publication specification](COMMITTED-EXECUTION-PUBLICATION-SPEC.md), [IL scheduling contract](../SEMANTIC-PROCESS-IL-SPEC.md#internal-scheduling), [core README](../../packages/semantic-core/README.md), [core source map](../../packages/semantic-core/SOURCE-MAP.md), and [PLAN](../PLAN.md) must change with implementation.

[`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md)

[`implementation-status-owner:TEMPORAL-HOSTING`](../TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md)

The [closure documentation guard](../../scripts/semantic-closure-documentation.test.ts), [commutation census](../../scripts/internal-commutation-census.test.ts), [publication coverage guard](../../scripts/execution-publication-contract-coverage.test.ts), [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [review policy](../../scripts/independent-review-policy.test.ts), and [Markdown links](../../scripts/markdown-links.test.ts) bind this change. Complete affected core and Lean gates precede semantic checkpoint review; full Product 1 verification, immutable consumer calibration, cost comparison with the [empty-state capacity repair](COMPENSATION-EMPTY-STATE-CAPACITY-REPAIR-PROPOSAL.md), and closure review remain required.

### Owners this implementation grows

| Owner | Current headroom | Growth condition |
|---|---:|---|
| [TypeScript evaluator](../../packages/semantic-core/src/semantic-process-runtime.ts) | 29 | Keep outcome/flag correction local; use a bounded test owner |
| [Scenario harness](../../packages/semantic-core/src/scenario.ts) | 150 | Check both flags before observation and handle the result union exhaustively |
| [Lean evaluator](../../BpmnSemantics/SemanticProcess/TransitionTrace.lean) | 136 | Preserve the evaluator/trace boundary and existing general laws |
| [Compensation-aware Lean evaluator](../../BpmnSemantics/SemanticProcess/CompensationEventSubProcessSnapshotTransitionTrace.lean) | 329 | Correct the independent declaration-bearing producer and prove both public wrappers |
| [Production Workflow loop](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 47 | Classify closure failure before publication/recovery processing; preserve successful recovery |

Rerun bindings for every concrete producer, consumer, and conformance owner before growth. New failure fixtures belong in bounded dedicated test owners rather than overflowing the existing commutation suites.

## Stage boundary and closure

Cold proposal approval precedes implementation of the changed result contract. The first green semantic checkpoint must contain cross-target rollback, trace erasure, paired publication discriminators, harness behavior, affected complete gates, and all same-change account corrections. It must be reviewed before dependent scheduling or host integration. Closure establishes atomic failure and accurate bounded commutation/publication claims only; RC families and the arbitrary-frontier theorem remain open in their existing owner.

## Closure evidence and reflection

The [host regression](../../packages/temporal-adapter/workflow/test/closure-failure-classification.test.ts) executes the production Workflow loop with real recovery, publication, and scenario evaluation. It injects fuel zero and a duplicate End operation only at the evaluator boundary after recovery admission; both reproduced `BpmnCommandOutcomeMissing` before the correction. Both now require nonretryable `BpmnSemanticClosureFailure`, exact retained RuntimeState and trace, unchanged recovery and paired publication, and no failed command outcome. The positive executes ordinary completion and compares its entire canonical publication with the semantic-core fold. This boundary probe uses Node's module mocks; live-host and replay evidence remain the complete Temporal and Product 1 gates.

The correction reuses the existing failure type and moves its classification before success-only processing. No new production abstraction, persistence state, or transport arm is introduced. The new typed probe exposed pre-existing discriminant widening in two shared test fixtures; contextual `satisfies` checks preserve their exact values. The semantic checkpoint preceded this host integration. The [resource measurements](../CAPSULE-COST-LEDGER.md#internal-closure-atomicity-correction) retain every changed owner and standing-watch consumer under the unchanged fixed ceiling; they do not infer memory cost from a module's unchanged source bytes.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `72a50a4cd8c76892bab7daff44a01b9b50050b2e` | `fork-turns-none` | `approve-with-required-edits` | `bb57973955b0948c17d7d3ea0f36238c21b21b25` |
| Semantic checkpoint | `b3b7e7a300c225079e749fc8d83ca45ed9704856` | `fork-turns-none` | `approve-with-required-edits` | `7aa1b25c722618ec414b62f3ed1caceacd284744` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
