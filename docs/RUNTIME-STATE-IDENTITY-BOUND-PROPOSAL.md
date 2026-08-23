# Runtime-state identity bound proposal

## Status

Lifecycle: draft
Review: pending

## Question and current boundary

[The runtime-state invariant](RUNTIME-STATE-INVARIANT-SPEC.md#layer-3-monotonicity) records `RSI-MONO-04`, non-reissue of an identity after removal, as an explicit absence. Its Contract section gives the reason: a high-water or non-reissue fact belongs to a transition, and a state predicate asserting one would need an invented history field. That reason is correct and this proposal does not dispute it.

The question is what part of that absence a single state can carry. One part can: whether any live member of a counter family has an activation above its key's recorded count. That mentions only the state under check, so it needs no history field and no predecessor.

**What that part is worth, stated exactly.** It discharges the `fresh` hypothesis of `waitIdentitiesUnique_replacedState` in [`ActivityBodyTurnover.lean`](../BpmnSemantics/SemanticProcess/ActivityBodyTurnover.lean), whose own docstring names this conjunct as the residual gap: no conjunct of `runtimeStateWellFormed` bounds a live wait's activation by its counter. In that proof the arming step's minting equation is available in context, so the bound alone closes it and monotonicity is not needed.

**What it is not worth, and an earlier version of this proposal claimed otherwise.** It does **not** derive non-reissue. Non-reissue is a conjunction of three facts, not two: the bound above, `RSI-MONO-01`'s per-key non-decrease, and the fact that a newly issued identity is numbered strictly *above* its key's count. The third is `RSI-MONO-04`'s own proposition, and [`RuntimeStateWellFormed.lean`](../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) already says so where `RuntimeStateMonotone` is defined. The bound is an upper bound on live identities; freshness needs a lower bound on new ones, and no combination of the two stated facts produces one. A three-state counterexample satisfies both while reissuing: a Timer wait at activation 1 with its counter at 1, then withdrawal, then arming a second wait at activation 1. Every bound holds, monotonicity holds, and the retired identity is back.

So the amendment **narrows the absence** from non-reissue to the issuing discipline. What remains absent is a per-arm obligation that each minting site numbers strictly above the pre-state count, which belongs in [the deliberately open lane](RUNTIME-STATE-INVARIANT-SPEC.md#the-deliberately-open-lane) beside preservation rather than in this rule.

## The proposed rule

`RSI-BOUND-01`: in every counter-minted family, no live member's occurrence activation exceeds its key's recorded count, and an absent counter reads as zero so a live member whose key has no count violates the bound.

**Membership criterion, not an enumeration.** A family is counter-minted when *every* site that creates one of its live members numbers it from that family's counter. A family with any site that derives its identity another way is excluded, because a counter cannot bound an identity it did not issue. The criterion decides whether a future family joins; a census does not, and [the `RSI-ORDER-01` membership paragraph](RUNTIME-STATE-INVARIANT-SPEC.md#facts-the-rules-depend-on) records that this same account was written as a count and wrong three times before it was written as a criterion.

Under that criterion:

| Family | Counter | Live members | In the rule |
|---|---|---|---|
| User Task | `activations` / `taskActivations` | `waits` / `userTaskWaits` | yes |
| Message | `messageActivations` | `messageWaits` | yes |
| Timer | `timerActivations` | `timerWaits` | yes |
| Effect | `effectActivations` | `effectWaits` **and** the wait each `effectIncidents` entry retains | yes |
| Event race | `eventRaceActivations` | `eventRaces` | yes |
| Call | `callActivations` | `calledProcessOccurrences` | yes |
| Activity | `activityActivations` | `activityOccurrences` | yes |
| Scope | `scopeActivations` | `scopeOccurrences` | **no**, see below |

The effect row names two collections on purpose. An incident retains a complete suspended wait carrying its occurrence activation, `RSI-DISJ-01` keeps it out of `effectWaits`, and the account already treats it as live work. Bounding only `effectWaits` would let a live identity sit above its counter inside an incident, which is exactly what the rule exists to refuse.

## Why the scope family is excluded

The scope family has two minting disciplines and only one uses the counter. `enterScope` mints a child occurrence from `scopeActivations`. `invokeProcess` mints a called root at the constant activation 1 and takes uniqueness from the derived called instance identity instead, writing `callActivations` and never `scopeActivations`; both the executable arm and `InvokeProcessStep.permitted` in [`CallActivity.lean`](../BpmnSemantics/SemanticProcess/CallActivity.lean) do this, and so does [the core](../packages/semantic-core/src/semantic-process-call-runtime.ts) independently.

So every state holding a live called Process carries a scope occurrence whose key has no count. Under a uniform bound that state is refused, and it is not a defect: [the preservation lane](../packages/semantic-core/test/runtime-state-preservation.test.ts) drives it today and the invariant reports no defect for it. `scopeActivations` is keyed by definition scope alone, so it is instance-agnostic and cannot express a bound for an occurrence whose identity is instance-scoped; the gap is structural rather than a missing write. Repairing it by writing a scope counter at invoke would change a shipped transition family's committed state, which this proposal excludes.

The exclusion is recorded in the rule row rather than left implicit, in the form `RSI-BIND-04` and `RSI-BIND-05` already use for a rule implemented narrower than its general reading.

## The remaining activation-bearing collections are covered rather than omitted

Four collections carry an occurrence identity without being one of the families above, and each is already bound to a member the rule covers, so the criterion leaves nothing unbounded:

- `sequentialMultiInstanceControllers` through `controllersOwnLiveActivity`, which ties each controller to a live Activity occurrence record;
- an event race's message and timer arms through `eventRaceAssociationsValid`;
- a called record's `calledRoot` through `RSI-BIND-03`;
- an Activity record's body and attached timers through `activityRecordsOwnLiveWork`.

## What this establishes and what it does not

Established, if implemented: `RSI-BOUND-01` holds of every state the predicate admits, in both languages, and the turnover preservation law loses a hypothesis it currently cannot discharge.

Not established:

- **Non-reissue.** Absent still, narrowed to the issuing discipline as above.
- **Preservation.** That every transition preserves the bound is unproved and stays in the open lane. Preservation of the uniqueness conjunct alone reaches ninety-one wait-collection assignment sites across fifteen semantic modules.
- **The adapter's assumption.** Its durable deadline join needs non-reissue across a Continue-As-New boundary. This narrows what that rests on and discharges none of it.
- **Sequential Multi-Instance registration.** [That capsule](capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md) conditions registration on the obligation being *stated* or its projection narrowed, and a narrowed absence is not a statement. Registration therefore needs either the issuing discipline discharged for the activity family's minting sites, which is bounded and is the natural follow-on, or the public projection narrowed. This proposal does not unblock it, and an earlier version implied that it did.
- **Any BPMN meaning.** No profile, operation kind, admission capability, public observation, or transition family changes.

## Consumers, which fix the family set

Three consumers exist, and they decide which families matter rather than a measurement deciding it. The adapter's durable deadline join needs the **Timer** and **User Task** families. The turnover preservation law needs **User Task**. The Multi-Instance projection needs **Activity**. If cost forces a narrowing, the narrowed set is those three, and the remaining four counter-minted families are recorded as narrower than stated. Negative witnesses follow the same set: one decided negative per consuming family, three rather than two.

## Cost preflight

Every conjunct added to `runtimeStateWellFormed` is re-reduced by every kernel-decided fixture, and every new fixture re-reduces every conjunct, so cost grows multiplicatively. [The thread-pin rationale](../CLAUDE.md#verification) records the only durable measurements this repository has for that effect.

The obligation on implementation is to build one narrow fixture module before and after the conjunct under the bound described in [the contributor setup guide](CONTRIBUTOR-SETUP-GUIDE.md#memory-bounded-lean-measurements), and to record both figures where cost lives, in [the capsule cost ledger](CAPSULE-COST-LEDGER.md). The measurement decides only whether the four consumer-free families land now or are recorded as narrower than stated. It does not decide *which* families, because the criterion and the consumers already do.

## Versioning consequences

One additive conjunct in a pre-release predicate. No wire contract, schema, profile, scenario, or retained evidence projection changes shape. Under [the pre-release policy](../CLAUDE.md#pre-release-evolution) no compatibility switch or migration branch is added.

Owners this implementation grows, with headroom before the 600-nonblank review target:

| Owner | Current headroom |
|---|---:|
| [Lean invariant predicate](../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) | 175 |
| [Lean invariant fixtures](../BpmnSemantics/RuntimeStateWellFormedConformance.lean) | 287 |
| [TypeScript invariant](../packages/semantic-core/src/runtime-state-well-formedness.ts) | 117 |
| [runtime state contract](../packages/semantic-core/src/semantic-process-state.ts) | 185 |

The bound is one cohesive responsibility across seven families and gets its own owner on each side for that reason, not for a size reason: only the TypeScript predicate at 117 lines would be written under a squeeze, while the Lean predicate has room. Each existing predicate gains one conjunct reference.

Executable constraints that already bind this work: [the runtime-state invariant guard](../packages/semantic-core/test/runtime-state-well-formedness.test.ts), [the preservation lane](../packages/semantic-core/test/runtime-state-preservation.test.ts), [the collection-removal completeness guard](../scripts/runtime-collection-removal-completeness.test.ts), [the Lean import boundaries guard](../scripts/lean-import-boundaries.test.ts), [the source-hygiene gate](../scripts/source-hygiene.test.ts), and [the reviewability guard](../scripts/document-reviewability.test.ts), which recomputes every headroom figure above. [The Lean source-contracts ratchet](../scripts/lean-source-contracts.test.ts) records `native_decide` sites and modules only, so a new module carrying `decide +kernel` negatives is admissible without a registry edit.

One existing evidence claim changes meaning and must be corrected in the same change. `rewoundCounterSuccessor` in [the invariant fixtures](../BpmnSemantics/RuntimeStateWellFormedConformance.lean) survives a counter rewind only because it withdraws the wait and the Activity record first, and its docstring's claim that no predicate over one state can refuse such a rewind stops being true in general. The amendment absorbs part of `RSI-MONO-01`'s discriminating power, and the evidence-lane row for that relation should say so.

## Epistemic closure and reopen conditions

The claim is that one single-state fact, checkable in both languages, discharges one named proof hypothesis and narrows one documented absence. Nothing here entails non-reissue, and this proposal's first version asserted that it did.

The common-mode risk is that both languages take the family set from the same reading, so a family whose minting discipline is misread would be misread in both. The mitigation is the criterion rather than the table: implementation must check each family's create sites, and the scope family sits in the table as an exclusion precisely so a reader can see the criterion applied against a real counterexample rather than only stated.

The nearest realistic counterexample is a state built by a host recovery path rather than by a transition, since Continue-As-New carries committed state. The conjunct would refuse a carried state that violates the bound at the continuation boundary, which is the fail-closed direction and should be observed there rather than argued.

Reopen if a family's minting discipline changes, if the issuing discipline is discharged for any family and the derivation can be strengthened, or if a consumer needs one of the four families a cost narrowing left unstated.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

Cold proposal review is required because this changes which runtime states the account admits and narrows a named absence, so it changes both admission and the proof boundary. Owner approval is required after that review and before implementation.

One earlier target was rejected. `2321f058919f3ab1ea38c674a08cea383c137bb3` claimed the bound plus `RSI-MONO-01` derives non-reissue, which does not follow; stated a uniform eight-family rule that refuses every state holding a live called Process; enumerated families where a criterion was required, omitting the wait an effect incident retains; and proposed a narrowed family set that dropped the Timer family its own consumer inventory needs. Because those corrections change the selected account, this target requires a newly spawned cold reviewer rather than a warm audit of the rejected one.
