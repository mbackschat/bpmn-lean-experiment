# Runtime-state identity bound proposal

## Status

Lifecycle: draft
Review: pending

## Question and current boundary

[The runtime-state invariant](RUNTIME-STATE-INVARIANT-SPEC.md#layer-3-monotonicity) records `RSI-MONO-04`, non-reissue of an identity after removal, as an explicit absence. Its Contract section gives the reason: a high-water or non-reissue fact belongs to a transition, and a state predicate asserting one would need an invented history field. That reason is correct and this proposal does not dispute it.

The question is what part of that absence a single state can carry. One part can: whether any live member of a counter family has an activation above its key's recorded count. That mentions only the state under check, so it needs no history field and no predecessor.

**What that part is worth, stated exactly.** The `fresh` hypothesis in [`ActivityBodyTurnover.lean`](../BpmnSemantics/SemanticProcess/ActivityBodyTurnover.lean) becomes derivable wherever a caller already holds well-formedness. `waitIdentitiesUnique_replacedState` is *not* that site, and an earlier version of this proposal named it: that theorem assumes only `waitIdentitiesUnique state = true`, so the bound would have to be added there as a second hypothesis rather than projected out of an existing one. The discharge site is `replacedState_preserves_wellFormed`, which already assumes `runtimeStateWellFormed state = true`. `fresh` also feeds `activityRecordsOwnLiveWork_replacedState`, so both uses close together. The derivation is short: `turnoverWait` mints `activationCount state wait.task.id + 1` definitionally and `userTaskWaitKeyMatches` requires task-id equality, so the bound on any live candidate gives `candidate.activation ≤ activationCount state wait.task.id < activationCount state wait.task.id + 1`. Monotonicity is not needed.

**What it is not worth, and an earlier version of this proposal claimed otherwise.** It does **not** derive non-reissue. Non-reissue is a conjunction of three facts, not two: the bound above, `RSI-MONO-01`'s per-key non-decrease, and the fact that a newly issued identity is numbered strictly *above* its key's count. The third is `RSI-MONO-04`'s own proposition, and [`RuntimeStateWellFormed.lean`](../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) already says so where `RuntimeStateMonotone` is defined. The bound is an upper bound on live identities; freshness needs a lower bound on new ones, and no combination of the two stated facts produces one. A three-state counterexample satisfies both while reissuing: a Timer wait at activation 1 with its counter at 1, then withdrawal, then arming a second wait at activation 1. Every bound holds, monotonicity holds, and the retired identity is back.

So the amendment **narrows the absence** from non-reissue to the issuing discipline. What remains absent is a per-arm obligation that each minting site numbers strictly above the pre-state count, which belongs in [the deliberately open lane](RUNTIME-STATE-INVARIANT-SPEC.md#the-deliberately-open-lane) beside preservation rather than in this rule.

## The proposed rule

`RSI-BOUND-01`: in every counter-minted family, no live member's occurrence activation exceeds its key's recorded count, and an absent counter reads as zero so a live member whose key has no count violates the bound.

**Layer and identifier family.** The rule is Layer 1. It constrains one state and reads no `Program`, which is the criterion [the invariant's Contract](RUNTIME-STATE-INVARIANT-SPEC.md#contract) already uses to place a conjunct, and it is decided beside the other Layer 1 conjuncts rather than in the Layer 3 relation. `RSI-BOUND-*` is a new family inside Layer 1 rather than an extension of an existing one, because every current Layer 1 family states a shape or a cardinality: `LIFE` a lifecycle emptiness, `OWN` an ownership link, `UNIQ` and `DISJ` cardinalities, `ORDER` a canonical order. This is the layer's first numeric relation between a live member and a counter. Filing it as `RSI-MONO-05` would be worse than a new family, because it would put a single-state fact in the two-state layer and invite a reader to look for a predecessor the predicate never sees.

**Membership criterion, not an enumeration.** The criterion has to be stated over what the bound asserts, which is a post-state inequality, rather than over the shape of a minting expression. A family is in the rule when both hold at every site that writes one of its live-member collections: the member's activation is at or below its key's count *in that site's post-state*, and no site lowers that count. Minting sites satisfy the first by numbering from the counter and writing the advanced count in the same step. Restore, retry, and re-insert sites satisfy it by preserving an activation that already satisfied it.

Wording the criterion over minting alone was wrong, and it would have excluded two families this proposal needs. An effect incident retry re-inserts the retained wait into `effectWaits` at its original activation and advances nothing, in [`Incident.lean`](../BpmnSemantics/SemanticProcess/Incident.lean) and in [the core](../packages/semantic-core/src/semantic-process-incident-runtime.ts). Body turnover re-inserts a task wait and renumbers the record's body from the *task* counter while deliberately leaving `activityActivations` untouched, which is `AOO-TURNOVER-04`. Both preserve the inequality; neither numbers from that family's counter at that site. A family with a site that leaves a live member above its key's post-state count is excluded, because a counter cannot bound an identity it did not issue.

[The `RSI-ORDER-01` membership paragraph](RUNTIME-STATE-INVARIANT-SPEC.md#facts-the-rules-depend-on) records that this same account was written as a count and wrong three times before it was written as a criterion. This is the fourth instance and it is a new variant of it: the criterion existed, and its *predicate* was the enumeration's shape rather than the rule's proposition.

Under that criterion:

| Family | Counter | Live members | In the rule |
|---|---|---|---|
| User Task | `activations` / `taskActivations` | `waits` / `userTaskWaits` | yes |
| Message | `messageActivations` | `messageWaits` | yes |
| Timer | `timerActivations` | `timerWaits` | yes |
| Effect | `effectActivations` | `effectWaits`, the wait each `effectIncidents` entry retains, and each `variables.activities` scope's owner | yes |
| Event race | `eventRaceActivations` | `eventRaces` | yes |
| Call | `callActivations` | `calledProcessOccurrences` | yes |
| Activity | `activityActivations` | `activityOccurrences` | yes |
| Scope | `scopeActivations` | `scopeOccurrences` | yes, **except a called root**, see below |

The effect row names three collections on purpose. An incident retains a complete suspended wait carrying its occurrence activation, `RSI-DISJ-01` keeps it out of `effectWaits`, and the account already treats it as live work. A `variables.activities` entry carries an `EffectOccurrenceId` owner, and no conjunct of `runtimeStateWellFormed` binds it outside the incident case. Bounding only `effectWaits` would let a live identity sit above its counter inside an incident or inside a private variable scope, which is exactly what the rule exists to refuse.

## Why a called root is excluded, and nothing wider

The scope family has two minting disciplines and only one writes the counter, but the split is not the one an earlier version of this proposal drew.

`enterScope` mints a child occurrence from `scopeActivations`. The hosting root is minted at the literal activation 1, and it satisfies the bound because the same site writes the counter: `runningProgramStartState?` in [`RuntimeState.lean`](../BpmnSemantics/SemanticProcess/RuntimeState.lean) sets `scopeActivations` to a count of 1 in the same record update, and [triggered start](../packages/semantic-core/src/semantic-process-triggered-start.ts) and [command admission](../packages/semantic-core/src/semantic-command-admission.ts) each do the same independently.

`invokeProcess` is the single exception in each language. It mints a called root at the constant activation 1, takes uniqueness from the derived called instance identity, and writes `callActivations` while never writing `scopeActivations`. The executable arm, `InvokeProcessStep.permitted` in [`CallActivity.lean`](../BpmnSemantics/SemanticProcess/CallActivity.lean), and [the core](../packages/semantic-core/src/semantic-process-call-runtime.ts) agree. So every state holding a live called Process carries a scope occurrence whose key has no count, and [the preservation lane](../packages/semantic-core/test/runtime-state-preservation.test.ts) drives exactly that state today with no defect reported.

**The earlier structural reason was refuted and is withdrawn.** It said `scopeActivations` is keyed by definition scope alone, so it is instance-agnostic and cannot express a bound for an instance-scoped occurrence, making the gap structural rather than a missing write. That is wrong twice over, and it contradicted the sentence that followed it. The hosting root is instance-scoped under the same keying and satisfies the bound. And the called root's activation is the constant 1, so `1 ≤ 1` holds for every called root of a given definition once a count exists. Instance-agnostic keying makes the bound *weak* there, not inexpressible: it would not deliver uniqueness, which is precisely why uniqueness comes from the derived instance identity instead. The gap is a missing write, and recording it as an impossibility would have asked the owner to approve a permanent exclusion on a false premise.

So the exclusion is the narrow one, over called roots rather than over the family. `RSI-BIND-03` already separates a called root from the hosting root by the parentless-plus-called-record test the rule reuses unchanged, so the narrow form costs no new machinery and admits every `enterScope` mint and the hosting root.

Two facts make that exclusion cheap rather than a concession. Repairing `invokeProcess` to write a scope counter would change a shipped transition family's committed state, which this proposal excludes. And the called root's activation is already pinned to a constant by an enforced conjunct: `calledProcessAssociationsValid` requires `record.calledRoot.activation = 1`, and although that predicate is deliberately not conjoined into `runtimeStateWellFormed`, [its module docstring](../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) records why, namely that `runtimePositionValid` decides it inside the running case. `runtimePositionValid` is the predicate's first conjunct. Every running state the predicate admits therefore already fixes that activation, so a counter bound over called roots would constrain nothing that is not constrained already.

The exclusion is recorded in the rule row rather than left implicit, in the form `RSI-BIND-04` and `RSI-BIND-05` already use for a rule implemented narrower than its general reading.

## What the rule reaches indirectly, and the two identities it does not reach

Three collections carry an occurrence identity without being one of the families above, and each is bound to a member the rule covers:

- `sequentialMultiInstanceControllers` through `controllersOwnLiveActivity`, which requires exactly one live Activity occurrence record per controller and carries that record's identity triple;
- an event race's message and timer arms through `eventRaceAssociationsValid`, which requires exactly one live message wait and exactly one live timer wait per race;
- an Activity record's body and attached timers through `activityRecordsOwnLiveWork`.

Two activation-bearing identities are genuinely unreached. An earlier version of this proposal claimed coverage for one of them and omitted the other entirely, and asserted that the criterion leaves nothing unbounded.

A called record's `calledRoot` is not covered. `RSI-BIND-03` binds it to a live called-process record, not to a counter, so citing that rule as coverage restated the exclusion above as its own answer. What constrains that activation is the pinned constant and `RSI-BIND-02`'s positivity, not this bound.

`variables.activities` is the fifth activation-bearing collection and was named in neither the table nor the list. Each `ActivityVariableScope.owner` is an `EffectOccurrenceId`, which is an `OccurrenceId` and so carries an activation. No conjunct of `runtimeStateWellFormed` binds it outside the incident case: `effectLocalScopesExact` lives in `flowNodeOccurrenceProgramValidity`, which this predicate does not consume, and `effectIncidentAssociationsValid` reaches it only while an incident is open. The effect row above therefore names it as a third live-member collection, for the same reason the row already names the incident-retained wait.

## Enforcement

The rule's defect class joins `GATED_DEFECTS` in [the TypeScript invariant](../packages/semantic-core/src/runtime-state-well-formedness.ts). Naming that decision is required rather than optional: `isGateAdmissibleRuntimeState` refuses only the classes in that explicit set, so both live gates, [command admission](../packages/semantic-core/src/semantic-command-admission.ts) and [Workflow continuation](../packages/temporal-adapter/protocol/src/workflow-continuation.ts), would admit a violating carried state if the class stayed out of it. The claim below that a carried state violating the bound is refused at the continuation boundary is true only under that membership, and an earlier version of this proposal asserted the refusal without naming the set that decides it.

The bound qualifies on the set's own stated criterion, which is that a class is decidable from one state without the called definitions. It reads two collections of the state under check and no `Program`.

[The invariant's Enforcement section](RUNTIME-STATE-INVARIANT-SPEC.md#enforcement) says enforcement should follow preservation, and this proposal leaves preservation open. That tension is deliberate and is the one judgement the owner should weigh here: gating without preservation means a transition that violated the bound would be refused at the next boundary rather than proved impossible, which is the fail-closed direction, at the cost of a defect class that no preservation result yet rules out. The alternative, leaving it ungated until preservation closes, keeps the set honest and leaves the continuation boundary admitting the class the rule exists to name. The recommendation is to gate, because the bound is a property of committed state that a recovery path can violate without any transition being wrong, which is exactly the case a boundary check is for.

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

Three negatives against seven stated families leaves four family branches of the conjunct unexercised. [The invariant's evidence-lane row](RUNTIME-STATE-INVARIANT-SPEC.md#evidence-lanes) records unexercised conjunct branches, and the routed detail map must name those four families rather than only a count, so a later reader can tell which branches a green gate never reduced.

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

## Same-change owners the amendment breaks

An earlier version of this proposal named one changed evidence claim. There are four fixtures and seven prose claims, and the fixtures are the ones that carry a contract.

Four kernel-decided negatives in [the invariant fixtures](../BpmnSemantics/RuntimeStateWellFormedConformance.lean) leave a live member at activation 1 while its counter key is gone or renamed, so the new conjunct refuses each of them in addition to the conjunct it was written for. `unorderedActivationsState` replaces `activations` wholesale and drops `BoundedTask`'s count. `undeclaredTimerElementState` renames the live timer element, so `timerActivations` holds no key for it. `undeclaredEventRaceState` renames the race element. `ambiguousAttachedTimerState` adds a record at `BoundedTask_Other`, for which `activityActivations` holds no key.

Each fixture's siblings-intact theorem stays true, because none of them names the new conjunct. What breaks is the module's stated contract: its docstring says each state "perturbs a single field of a state its own conjunct can apply to" and that the pairing makes a refusal "attributable to the named conjunct rather than to something the aggregate already caught". That contract is the module's whole reason for existing, and the docstring records that it was earned by a fixture which had been refused by the wrong predicate.

The implementation therefore repairs the four fixtures rather than weakening the contract: each perturbation also writes the counter entry its live member needs, so the state still differs from a reachable one in exactly the one respect its conjunct names. For `unorderedActivationsState` that means three activation entries held out of canonical order rather than two, which keeps the order violation intact. Weakening the docstring instead would trade a checked attribution property for prose, and the module exists because that trade was already made once and cost a wrong witness.

`rewoundCounterSuccessor` needs no repair. It withdraws its wait and Activity record before the rewind, so it stays admitted and its theorem stays green. Its docstring's claim that no predicate over one state can refuse such a rewind stops being true in general and must be narrowed to the withdrawn case, and the evidence-lane row for `RSI-MONO-01` should record that the amendment absorbs part of that relation's discriminating power.

Seven prose statements are true today and become false on implementation. Each is a same-change owner:

- [`RuntimeStateWellFormed.lean`](../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean)'s module docstring, where the two rule types are distinguished, needs the same carve-out this proposal makes;
- [the invariant's Contract paragraph](RUNTIME-STATE-INVARIANT-SPEC.md#contract) and its `RSI-MONO-04` row;
- [the Activity occurrence specification](ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md)'s preservation bullet and its Lean assurance-lane bullet, both of which say nothing bounds a live wait's activation by its counter;
- [`implementation-status-owner:ENGINE-SEMANTIC-FAMILY`](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md)'s measured reason for the open preservation lane;
- the docstrings of `waitIdentitiesUnique_replacedState` and `replacedState_preserves_wellFormed` in [`ActivityBodyTurnover.lean`](../BpmnSemantics/SemanticProcess/ActivityBodyTurnover.lean), which name `RSI-MONO-04` as the residual gap.

Two further statements are stale now rather than on implementation, because they describe this proposal rather than the implementation. [The documentation registry](README.md)'s row for this document said the bound would make non-reissue a derivation instead of an absence, which is the rejected target's thesis. [The plan](PLAN.md) said registration was blocked on this amendment alone and that stating it discharges an unstated adapter assumption; both were corrected in `551c8f4a`, before this review target was read.

## Epistemic closure and reopen conditions

The claim is that one single-state fact, checkable in both languages, discharges one named proof hypothesis and narrows one documented absence. Nothing here entails non-reissue, and this proposal's first version asserted that it did.

The common-mode risk is that both languages take the family set from the same reading, so a family whose minting discipline is misread would be misread in both. The mitigation is the criterion rather than the table: implementation must check each family's write sites against the post-state inequality, and the called-root exclusion sits in the table precisely so a reader can see the criterion applied against a real counterexample rather than only stated.

The nearest realistic counterexample is a state built by a host recovery path rather than by a transition, since Continue-As-New carries committed state. Under the Enforcement decision above the conjunct refuses such a state at the continuation boundary, which is the fail-closed direction and should be observed there rather than argued.

Reopen if a family's write discipline changes, if the issuing discipline is discharged for any family and the derivation can be strengthened, if a consumer needs one of the four families a cost narrowing left unstated, or if `invokeProcess` gains a `scopeActivations` write for an independent reason, which would retire the called-root exclusion.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `3e89868` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

Cold proposal review is required because this changes which runtime states the account admits and narrows a named absence, so it changes both admission and the proof boundary. Owner approval is required after that review and before implementation.

The cold review of `3e89868` returned `approve-with-required-edits` with eight required findings, and this document is the correction. The verdict and its correction-audit target are recorded above once the same reviewer has audited this correction in a warm follow-up. The findings were: a stale registry row and a stale plan claim, the second already corrected; four negative fixtures and seven prose claims missing from the same-change list; a self-contradicting structural reason for the scope exclusion; two false coverage claims, one of them citing the exclusion as its own coverage and one omitting `variables.activities`; a membership criterion phrased over minting where the rule asserts a post-state inequality; an unnamed enforcement decision; and an unstated layer and identifier family.

One earlier target was rejected. `2321f058919f3ab1ea38c674a08cea383c137bb3` claimed the bound plus `RSI-MONO-01` derives non-reissue, which does not follow; stated a uniform eight-family rule that refuses every state holding a live called Process; enumerated families where a criterion was required, omitting the wait an effect incident retains; and proposed a narrowed family set that dropped the Timer family its own consumer inventory needs. Because those corrections changed the selected account, that target required a newly spawned cold reviewer rather than a warm audit.
