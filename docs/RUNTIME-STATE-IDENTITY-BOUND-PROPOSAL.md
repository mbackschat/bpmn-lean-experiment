# Runtime-state identity bound proposal

## Status

Lifecycle: draft
Review: pending

## Question and current boundary

[The runtime-state invariant](RUNTIME-STATE-INVARIANT-SPEC.md#layer-3-monotonicity) records `RSI-MONO-04`, non-reissue of an identity after removal, as an explicit absence, and gives its reason in the Contract section: a high-water or non-reissue fact belongs to a transition, and a state predicate asserting one would need an invented history field. That reason is correct and this proposal does not dispute it.

The question is narrower. Non-reissue is a conjunction of two facts, and only one of them is about two states. Counters never decreasing is already `RSI-MONO-01`, a relation with an executable core counterpart in `runtimeStateRegressions`. The other half is that no live identity has already passed its counter, which mentions only the state under check. **Can the state carry that half, so that non-reissue becomes a derivation from an existing relation rather than an absence?**

The absence has three consumers today, which is what makes the question due rather than tidy. The adapter joins a durable deadline to committed state assuming a withdrawn Timer or task identity is never reused, and the invariant spec records that this rests on the evaluator's issuing discipline rather than on the account. The Activity body turnover preservation law states a `fresh` hypothesis it cannot discharge, and its Lean docstring names the reason exactly: no conjunct bounds a live wait's activation by its counter. And the sequential Multi-Instance capsule conditions registering its profile for execution on this obligation being stated or its public projection being narrowed, because once a controller's `ActivityOccurrenceId` is a public field a reissued identity is visible to an external consumer as the same open controller.

## The proposed rule

`RSI-BOUND-01`: for each of the eight counter families, every live member's activation is at most the recorded count for its key, and an absent counter is read as zero, so a live member whose key has no counter violates the bound.

The eight pairs are the ones `RSI-MONO-01` already enumerates: `activations` against `waits`, `messageActivations` against `messageWaits`, `timerActivations` against `timerWaits`, `effectActivations` against `effectWaits`, `scopeActivations` against `scopeOccurrences`, `eventRaceActivations` against `eventRaces`, `callActivations` against `calledProcessOccurrences`, and `activityActivations` against `activityOccurrences`.

The rule belongs in Layer 1, because it is a structural fact about one state rather than an agreement with the program or a fact about a transition.

## Why this is one state fact and not a disguised two-state one

The predicate reads only the state it is given: for each live member it compares one number against one counter in the same value. No history field, no predecessor, and no invented field. That is the whole of the Contract section's objection, and the bound does not meet it.

Non-reissue then moves from absent to derived, and belongs in the Derived rather than asserted table with its derivation stated: if every live identity is at or below its counter, and the counter never decreases across a committed transition, then an identity minted strictly above the pre-state counter cannot equal any identity live before it, so a removed identity is not reissued while `RSI-MONO-01` holds. This proposal does not move non-reissue into the conjunct, and the distinction matters: the conjunct is checkable on one state, the derivation needs the relation, and a reader must be able to see which of the two any later claim depends on.

## What this establishes and what it does not

Established, if implemented: `RSI-BOUND-01` holds of every state the predicate admits, in both languages, with the derivation of non-reissue recorded against `RSI-MONO-01`.

Not established, and each is a separate lane:

- **Preservation.** That every transition preserves `RSI-BOUND-01` is not proved. Preservation of the uniqueness conjunct alone reaches ninety-one wait-collection assignment sites across fifteen semantic modules, and this conjunct touches the same sites plus every counter write. It stays inside [the deliberately open lane](RUNTIME-STATE-INVARIANT-SPEC.md#the-deliberately-open-lane) rather than being smuggled in beside the statement.
- **The adapter's assumption.** Stating the bound narrows what that assumption rests on but does not discharge it, because the adapter needs non-reissue across a durable boundary and this account proves nothing about Continue-As-New carrying a state that satisfies the conjunct.
- **Any BPMN meaning.** No profile, operation kind, admission capability, public observation, or transition family changes. A state a registered scenario reaches today either already satisfies the bound or is a defect the predicate should always have refused.

The one behavioural consequence worth naming precisely: adding a conjunct narrows the admitted set, so a state that passes today and violates the bound stops being admitted. That is the intended effect and it is also the risk, which is why the evidence below requires the existing registered corpus to be shown unaffected rather than assumed to be.

## Cost preflight, and the measurement that decides the shape

This is the expensive class. Every conjunct added to `runtimeStateWellFormed` is re-reduced by every kernel-decided fixture, and every new fixture re-reduces every conjunct, so cost grows multiplicatively rather than additively. The current full Lean gate is 139 seconds incremental against a 5 GB lightweight-runner floor, and one fixture module already peaks at 2.16 GB after the sequential Multi-Instance capsule.

Eight sub-bounds is therefore a measurement question rather than a design one. The obligation on implementation is to build one narrow fixture module before and after the conjunct, under the memory bound, and record CPU and peak resident memory for both. If the delta is affordable, all eight families are stated. If it is not, the bound is stated for the families that have consumers today, the task and activity families, and the narrowing is recorded in the rule row as an implemented-narrower-than-stated fact in the form `RSI-BIND-04` and `RSI-BIND-05` already use. What is not permitted is discovering the cost mid-implementation and quietly stating fewer families than the rule claims.

Negative witnesses follow the same rule. Two decided negatives, one per consuming family, with the remaining six resting on the shared shape of the predicate; eight would re-reduce in every downstream fixture for evidence that does not separate anything the first two leave open.

## Versioning consequences

One additive conjunct in a pre-release predicate. No wire contract, schema, profile, scenario, or retained evidence projection changes shape, and no producer or consumer of a published contract is affected. Under [the pre-release policy](../CLAUDE.md#pre-release-evolution) no compatibility switch or migration branch is added.

Owners this implementation grows, with headroom before the 600-nonblank review target, measured rather than recalled:

| Owner | Current headroom |
|---|---:|
| [Lean invariant predicate](../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) | 175 |
| [Lean invariant fixtures](../BpmnSemantics/RuntimeStateWellFormedConformance.lean) | 287 |
| [TypeScript invariant](../packages/semantic-core/src/runtime-state-well-formedness.ts) | 117 |
| [runtime state contract](../packages/semantic-core/src/semantic-process-state.ts) | 185 |

The bound is one cohesive responsibility across eight families, so it gets its own owner on each side rather than eight additions to the two predicates above: the TypeScript predicate has 117 lines of headroom and would be written under a size squeeze, which this project's own rule forbids. Each existing predicate gains one conjunct reference. That extraction condition stops applying only if a measurement shows the complete bound fits in both predicates while each stays below 600.

Executable constraints that already bind this work: [the runtime-state invariant guard](../packages/semantic-core/test/runtime-state-well-formedness.test.ts), [the collection-removal completeness guard](../scripts/runtime-collection-removal-completeness.test.ts), [the Lean source contracts ratchet](../scripts/lean-source-contracts.test.ts), [the Lean import boundaries guard](../scripts/lean-import-boundaries.test.ts), [the source-hygiene gate](../scripts/source-hygiene.test.ts), and [the reviewability guard](../scripts/document-reviewability.test.ts), which recomputes every headroom figure in the table above.

## Epistemic closure and reopen conditions

The claim this proposal would establish is that one state fact, checkable in both languages, plus one existing relation, together entail a property three consumers currently assume. The nearest unsupported claim is that any transition preserves it.

The common-mode risk is that both languages get the bound from the same reading of `RSI-MONO-01`'s family list, so a family missing from that list would be missing from both. The mitigation is to derive the eight pairs from the counter families the runtime state declares rather than from the relation's prose, and to require the negative witnesses to name their family explicitly so a dropped family fails a test rather than passing silently.

The nearest realistic counterexample is a state built by a host recovery path rather than by a transition: Continue-As-New carries committed state, and if a carried state violated the bound the conjunct would refuse it at the continuation boundary rather than at an arming site. That is the fail-closed direction, and the continuation validator is where it should be observed rather than argued.

Reopen if a family joins the counter set, if a transition is proved to preserve the bound and the derivation can be strengthened, or if the measurement forces the narrowed form and a later consumer needs one of the six unstated families.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

Cold proposal review is required because this changes which runtime states the account admits and moves a named absence into a derivation, so it changes both admission and the proof boundary. Owner approval is required after that review and before implementation.
