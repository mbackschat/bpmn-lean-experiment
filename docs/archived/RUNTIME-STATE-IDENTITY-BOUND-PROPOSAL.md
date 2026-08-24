# Runtime-state identity bound proposal

## Status

Archived on graduation. The stable `RSI-BOUND-01` contract, its implemented three-family boundary, its called-root exclusion, its indirect reach, its evidence limits, and its reopen conditions folded into [the runtime-state invariant specification](../RUNTIME-STATE-INVARIANT-SPEC.md). This file retains the rejected non-reissue derivation, the corrected membership and exclusion arguments, the cost choice, same-change obligations, epistemic closure, and governed review chronology that do not belong in the current specification.

## Question and current boundary

[The runtime-state invariant](../RUNTIME-STATE-INVARIANT-SPEC.md#layer-3-monotonicity) records `RSI-MONO-04`, non-reissue of an identity after removal, as an explicit absence. Its Contract section gives the reason: a high-water or non-reissue fact belongs to a transition, and a state predicate asserting one would need an invented history field. That reason is correct and this proposal does not dispute it.

The question is what part of that absence a single state can carry. One part can: whether any live member of a counter family has an activation above its key's recorded count. That mentions only the state under check, so it needs no history field and no predecessor.

**What that part is worth, stated exactly.** The `fresh` hypothesis in [`ActivityBodyTurnover.lean`](../../BpmnSemantics/SemanticProcess/ActivityBodyTurnover.lean) becomes derivable wherever a caller already holds well-formedness. `waitIdentitiesUnique_replacedState` is *not* that site, and an earlier version of this proposal named it: that theorem assumes only `waitIdentitiesUnique state = true`, so the bound would have to be added there as a second hypothesis rather than projected out of an existing one. The discharge site is `replacedState_preserves_wellFormed`, which already assumes `runtimeStateWellFormed state = true`. `fresh` also feeds `activityRecordsOwnLiveWork_replacedState`, so both uses close together. The derivation is short: `turnoverWait` mints `activationCount state wait.task.id + 1` definitionally and `userTaskWaitKeyMatches` requires task-id equality, so the bound on any live candidate gives `candidate.activation ≤ activationCount state wait.task.id < activationCount state wait.task.id + 1`. Monotonicity is not needed.

**What it is not worth, and an earlier version of this proposal claimed otherwise.** It does **not** derive non-reissue. Non-reissue is a conjunction of three facts, not two: the bound above, `RSI-MONO-01`'s per-key non-decrease, and the fact that a newly issued identity is numbered strictly *above* its key's count. The third is `RSI-MONO-04`'s own proposition, and [`RuntimeStateWellFormed.lean`](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) already says so where `RuntimeStateMonotone` is defined. The bound is an upper bound on live identities; freshness needs a lower bound on new ones, and no combination of the two stated facts produces one. A three-state counterexample satisfies both while reissuing: a Timer wait at activation 1 with its counter at 1, then withdrawal, then arming a second wait at activation 1. Every bound holds, monotonicity holds, and the retired identity is back.

So the amendment **narrows the absence** from non-reissue to the issuing discipline. What remains absent is a per-arm obligation that each minting site numbers strictly above the pre-state count, which belongs in [the deliberately open lane](../RUNTIME-STATE-INVARIANT-SPEC.md#the-deliberately-open-lane) beside preservation rather than in this rule.

## The proposed rule

`RSI-BOUND-01`: in every counter-minted family, no live member's occurrence activation exceeds its key's recorded count, and an absent counter reads as zero so a live member whose key has no count violates the bound.

**Layer and identifier family.** The rule is Layer 1. It constrains one state and reads no `Program`, which is the criterion [the invariant's Contract](../RUNTIME-STATE-INVARIANT-SPEC.md#contract) already uses to place a conjunct, and it is decided beside the other Layer 1 conjuncts rather than in the Layer 3 relation. `RSI-BOUND-*` is a new family inside Layer 1 rather than an extension of an existing one, because every current Layer 1 family states a shape or a cardinality: `LIFE` a lifecycle emptiness, `OWN` an ownership link, `UNIQ` and `DISJ` cardinalities, `ORDER` a canonical order. This is the layer's first numeric relation between a live member and a counter. Filing it as `RSI-MONO-05` would be worse than a new family, because it would put a single-state fact in the two-state layer and invite a reader to look for a predecessor the predicate never sees.

**Membership criterion, not an enumeration.** The criterion has to be stated over what the bound asserts, which is a post-state inequality, rather than over the shape of a minting expression. A family is in the rule when both hold at every site that writes one of its live-member collections: the member's activation is at or below its key's count *in that site's post-state*, and no site lowers that count. Minting sites satisfy the first by numbering from the counter and writing the advanced count in the same step. Restore, retry, and re-insert sites satisfy it by preserving an activation that already satisfied it.

Wording the criterion over minting alone was wrong, and it would have excluded two families this proposal needs. An effect incident retry re-inserts the retained wait into `effectWaits` at its original activation and advances nothing, in [`Incident.lean`](../../BpmnSemantics/SemanticProcess/Incident.lean) and in [the core](../../packages/semantic-core/src/semantic-process-incident-runtime.ts). Body turnover re-inserts a task wait and renumbers the record's body from the *task* counter while deliberately leaving `activityActivations` untouched, which is `AOO-TURNOVER-04`. Both preserve the inequality; neither numbers from that family's counter at that site. A family with a site that leaves a live member above its key's post-state count is excluded, because a counter cannot bound an identity it did not issue.

[The `RSI-ORDER-01` membership paragraph](../RUNTIME-STATE-INVARIANT-SPEC.md#facts-the-rules-depend-on) records that this same account was written as a count and wrong three times before it was written as a criterion. This is the fourth instance and it is a new variant of it: the criterion existed, and its *predicate* was the enumeration's shape rather than the rule's proposition.

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

`enterScope` mints a child occurrence from `scopeActivations`. The hosting root is minted at the literal activation 1, and it satisfies the bound because the same site writes the counter: `runningProgramStartState?` in [`RuntimeState.lean`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) sets `scopeActivations` to a count of 1 in the same record update, and [triggered start](../../packages/semantic-core/src/semantic-process-triggered-start.ts) and [command admission](../../packages/semantic-core/src/semantic-command-admission.ts) each do the same independently.

`invokeProcess` is the single exception in each language. It mints a called root at the constant activation 1, takes uniqueness from the derived called instance identity, and writes `callActivations` while never writing `scopeActivations`. The executable arm, `InvokeProcessStep.permitted` in [`CallActivity.lean`](../../BpmnSemantics/SemanticProcess/CallActivity.lean), and [the core](../../packages/semantic-core/src/semantic-process-call-runtime.ts) agree. So every state holding a live called Process carries a scope occurrence whose key has no count, and [the preservation lane](../../packages/semantic-core/test/runtime-state-preservation.test.ts) drives exactly that state today with no defect reported.

**The earlier structural reason was refuted and is withdrawn.** It said `scopeActivations` is keyed by definition scope alone, so it is instance-agnostic and cannot express a bound for an instance-scoped occurrence, making the gap structural rather than a missing write. That is wrong twice over, and it contradicted the sentence that followed it. The hosting root is instance-scoped under the same keying and satisfies the bound. And the called root's activation is the constant 1, so `1 ≤ 1` holds for every called root of a given definition once a count exists. Instance-agnostic keying makes the bound *weak* there, not inexpressible: it would not deliver uniqueness, which is precisely why uniqueness comes from the derived instance identity instead. The gap is a missing write, and recording it as an impossibility would have asked the owner to approve a permanent exclusion on a false premise.

So the exclusion is the narrow one, over called roots rather than over the family. `RSI-BIND-03` already separates a called root from the hosting root by the parentless-plus-called-record test the rule reuses unchanged, so the narrow form costs no new machinery and admits every `enterScope` mint and the hosting root.

The exclusion avoids changing a shipped transition's state and exposes an existing parity gap. Repairing `invokeProcess` to write a scope counter would change a shipped transition family's committed state, which this proposal excludes. Lean already pins the called root to activation 1: `calledProcessAssociationsValid` requires `record.calledRoot.activation = 1`, and [the invariant module](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) records the path from `runtimeStateWellFormed` through `runtimePositionValid`, `lifecyclePositionValid`, and `runningPositionValid` to that predicate. The TypeScript [`runtimeStateDefects`](../../packages/semantic-core/src/runtime-state-well-formedness.ts) explicitly excludes called-process associations from its aggregate, so neither that predicate nor its command gate establishes the same constant. This proposal does not repair that existing parity gap and claims no cross-language called-root constraint; it leaves called roots outside `RSI-BOUND-01` in both languages.

The exclusion is recorded in the rule row rather than left implicit, in the form `RSI-BIND-04` and `RSI-BIND-05` already use for a rule implemented narrower than its general reading.

## What the rule reaches indirectly, and the two identities it does not reach

These collections carry an occurrence identity without being one of the families above, and each is bound to a member the rule covers, subject to the called-root exclusion:

- `sequentialMultiInstanceControllers` through `controllersOwnLiveActivity`, which requires exactly one live Activity occurrence record per controller and carries that record's identity triple;
- an event race's message and timer arms through `eventRaceAssociationsValid`, which requires exactly one live message wait and exactly one live timer wait per race;
- an Activity record's body and attached timers through `activityRecordsOwnLiveWork`, except that a child-scope body may name the excluded called root.

The bound still does not reach a called record's `calledRoot` or an Activity-local variable owner. An earlier version of this proposal claimed coverage for the former, omitted the latter, and asserted that the criterion leaves nothing unbounded.

A called record's `calledRoot` is not covered. `RSI-BIND-03` binds it to a live called-process record, not to a counter, so citing that rule as coverage restated the exclusion above as its own answer. Lean constrains that activation through the pinned constant and `RSI-BIND-02`'s positivity; the TypeScript runtime-state predicate does not decide the called-process association.

`variables.activities` is the fifth activation-bearing collection and was named in neither the table nor the list. Each `ActivityVariableScope.owner` is an `EffectOccurrenceId`, which is an `OccurrenceId` and so carries an activation. No conjunct of `runtimeStateWellFormed` binds it outside the incident case: `effectLocalScopesExact` lives in `flowNodeOccurrenceProgramValidity`, which this predicate does not consume, and `effectIncidentAssociationsValid` reaches it only while an incident is open. The effect row above therefore names it as a third live-member collection, for the same reason the row already names the incident-retained wait.

## Enforcement

The rule's defect class joins `GATED_DEFECTS` in [the TypeScript invariant](../../packages/semantic-core/src/runtime-state-well-formedness.ts). Naming that decision is required rather than optional: `isGateAdmissibleRuntimeState` refuses only the classes in that explicit set, so both live gates, [command admission](../../packages/semantic-core/src/semantic-command-admission.ts) and [Workflow continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts), would admit a violating carried state if the class stayed out of it. The claim below that a carried state violating the bound is refused at the continuation boundary is true only under that membership, and an earlier version of this proposal asserted the refusal without naming the set that decides it.

The bound qualifies on the set's own stated criterion, which is that a class is decidable from one state without the called definitions. For each included family it compares the live-member collection or collections with that family's counter collection and reads no `Program`.

[The invariant's Enforcement section](../RUNTIME-STATE-INVARIANT-SPEC.md#enforcement) says enforcement should follow preservation, and this proposal leaves preservation open. That tension is deliberate and is the one judgement the owner should weigh here: gating without preservation means a transition that violated the bound would be refused at the next boundary rather than proved impossible, which is the fail-closed direction, at the cost of a defect class that no preservation result yet rules out. The alternative, leaving it ungated until preservation closes, keeps the set honest and leaves the continuation boundary admitting the class the rule exists to name. The recommendation is to gate, because the bound is a property of committed state that a recovery path can violate without any transition being wrong, which is exactly the case a boundary check is for.

## What this establishes and what it does not

Established at the implementation checkpoint: the narrowed `RSI-BOUND-01` holds for every User Task, Timer, and Activity identity in every state the predicate admits, in both languages, and the turnover preservation law no longer carries an external wait-key freshness hypothesis.

Not established:

- **Non-reissue.** Absent still, narrowed to the issuing discipline as above.
- **Preservation.** That every transition preserves the bound is unproved and stays in the open lane. Preservation of the uniqueness conjunct alone reaches ninety-one wait-collection assignment sites across fifteen semantic modules.
- **The adapter's assumption.** Its durable deadline join needs non-reissue across a Continue-As-New boundary. This narrows what that rests on and discharges none of it.
- **Sequential Multi-Instance registration.** [That capsule](../capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) conditions registration on the obligation being *stated* or its projection narrowed, and a narrowed absence is not a statement. Registration therefore needs either the issuing discipline discharged for the activity family's minting sites, which is bounded and is the natural follow-on, or the public projection narrowed. This proposal does not unblock it, and an earlier version implied that it did.
- **Any BPMN meaning.** No profile, operation kind, admission capability, public observation, or transition family changes.

## Consumers, which fix the family set

Three consumers exist, and they decide which families matter rather than a measurement deciding it. The adapter's durable deadline join needs the **Timer** and **User Task** families. The turnover preservation law needs **User Task**. The Multi-Instance projection needs **Activity**. If cost forces a narrowing, the narrowed set is those three, and the remaining five counter-minted families are recorded as narrower than stated. Negative witnesses follow the same set: one decided negative per consuming family, three rather than two.

Three negatives against eight stated families leave five family branches of the conjunct unexercised: Message, Effect, Event race, Call, and ordinary Scope. [The invariant's evidence-lane row](../RUNTIME-STATE-INVARIANT-SPEC.md#evidence-lanes) and the routed detail map must name those families, so a later reader can tell which branches a green gate never reduced.

## Cost preflight

Every conjunct added to `runtimeStateWellFormed` is re-reduced by every kernel-decided fixture, and every new fixture re-reduces every conjunct, so cost grows multiplicatively. [The thread-pin rationale](../../CLAUDE.md#verification) records the only durable measurements this repository has for that effect.

The implementation built one narrow fixture module before and after the conjunct under the bound described in [the contributor setup guide](../CONTRIBUTOR-SETUP-GUIDE.md#memory-bounded-lean-measurements), and records both figures in [the capsule cost ledger](../CAPSULE-COST-LEDGER.md). The pre-existing aggregate fixture owner exhausted the 3 GiB bound before the rule was added; the post-change split owners pass independently but remain close to that maximum. The result selects the consumer-bound narrowing, not a different family set: User Task, Timer, and Activity land now, while the five consumer-free families remain explicitly absent.

## Versioning consequences

One additive conjunct in a pre-release predicate. No wire contract, schema, profile, scenario, or retained evidence projection changes shape. Under [the pre-release policy](../../CLAUDE.md#pre-release-evolution) no compatibility switch or migration branch is added.

Owners this implementation grows, with headroom before the 600-nonblank review target:

| Owner | Current headroom |
|---|---:|
| [Lean invariant predicate](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) | 172 |
| [Lean identity-bound owner](../../BpmnSemantics/SemanticProcess/RuntimeStateIdentityBound.lean) | 508 |
| [Lean remaining-state fixtures](../../BpmnSemantics/RuntimeStateWellFormedConformance.lean) | 422 |
| [Lean Activity fixtures](../../BpmnSemantics/RuntimeStateActivityConformance.lean) | 477 |
| [Lean identity-bound fixtures](../../BpmnSemantics/RuntimeStateIdentityBoundConformance.lean) | 563 |
| [TypeScript invariant](../../packages/semantic-core/src/runtime-state-well-formedness.ts) | 109 |
| [TypeScript identity-bound owner](../../packages/semantic-core/src/runtime-state-identity-bound.ts) | 569 |
| [runtime state contract](../../packages/semantic-core/src/semantic-process-state.ts) | 185 |

The bound is one cohesive responsibility across eight families and gets its own owner on each side for that reason, not for a size reason. The TypeScript aggregate was the only existing owner close enough to the reviewability ceiling to force separation on size alone, while the Lean aggregate had room. Each existing aggregate gains one conjunct reference.

Executable constraints that already bind this work: [the runtime-state invariant guard](../../packages/semantic-core/test/runtime-state-well-formedness.test.ts), [the preservation lane](../../packages/semantic-core/test/runtime-state-preservation.test.ts), [the collection-removal completeness guard](../../scripts/runtime-collection-removal-completeness.test.ts), [the Lean import boundaries guard](../../scripts/lean-import-boundaries.test.ts), [the source-hygiene gate](../../scripts/source-hygiene.test.ts), and [the reviewability guard](../../scripts/document-reviewability.test.ts), which enforces the owner ceiling. [The Lean source-contracts ratchet](../../scripts/lean-source-contracts.test.ts) records `native_decide` sites and modules only, so a new module carrying `decide +kernel` negatives is admissible without a registry edit.

## Same-change owners the amendment breaks

An earlier version of this proposal named one changed evidence claim. The implementation must preserve every exact-attribution fixture the new conjunct would otherwise make fail for a second reason, and it finds prose owners by the criterion below rather than by a retained count.

The kernel-decided negatives in [the invariant fixtures](../../BpmnSemantics/RuntimeStateWellFormedConformance.lean) leave a live member at activation 1 while its counter key is gone or renamed, so the new conjunct refuses the User Task, Timer, and Activity-dependent cases in addition to the conjunct each was written for. `unorderedActivationsState` replaces `activations` wholesale and drops `BoundedTask`'s count. `undeclaredTimerElementState` renames the live timer element, so `timerActivations` holds no key for it. `ambiguousAttachedTimerState` adds a record at `BoundedTask_Other`, for which `activityActivations` holds no key. `undeclaredEventRaceState` is unaffected and unchanged because Event race remains outside the implemented predicate.

Each fixture's siblings-intact theorem stays true, because none of them names the new conjunct. What breaks is the module's stated contract: its docstring says each state "perturbs a single field of a state its own conjunct can apply to" and that the pairing makes a refusal "attributable to the named conjunct rather than to something the aggregate already caught". That contract is the module's whole reason for existing, and the docstring records that it was earned by a fixture which had been refused by the wrong predicate.

The implementation therefore repairs each listed fixture rather than weakening the contract: each perturbation also writes the counter entry its live member needs, so the state still differs from a reachable one in exactly the one respect its conjunct names. For `unorderedActivationsState` that means three activation entries held out of canonical order rather than two, which keeps the order violation intact. Weakening the docstring instead would trade a checked attribution property for prose, and the module exists because that trade was already made once and cost a wrong witness.

The TypeScript exact-attribution fixtures have the same obligation. [`withUnconsultedRecords`](../../packages/semantic-core/test/activity-occurrence.test.ts) appends a synthetic Activity record whose key is absent from `activityActivations`; the implementation first gives the committing control the matching unrelated counter entry, so each case still differs from that control only in `activityOccurrences` and reports exactly its named defect. [`withSecondAttachedTimer`](../../packages/semantic-core/test/sequential-multi-instance-iteration.test.ts) adds Timer activation 2 while leaving that Timer key's count at 1; the helper advances the synthetic matching counter so both tests continue to establish that a record listing two live Timers is admitted.

`rewoundCounterSuccessor` needed no fixture repair. It withdraws its wait and Activity record before the rewind, so it stays admitted and its theorem stays green. Its docstring is narrowed to that withdrawn case, and the evidence-lane row for `RSI-MONO-01` records that the amendment absorbs part of that relation's discriminating power. The TypeScript [`runtimeStateRegressions`](../../packages/semantic-core/src/runtime-state-well-formedness.ts) docstring likewise distinguishes a two-state counter rewind from reissue, which requires a later mint of the retired identity.

The remaining same-change owners were decided by a criterion, not by this list. Before implementation, every maintained statement asserting that no conjunct of `runtimeStateWellFormed` bounds a live wait's activation by its counter, or that `RSI-MONO-04` is the residual gap for wait-key freshness, would become false. The search identified the following owners, and the implementation corrected each in the same change:

- [`RuntimeStateWellFormed.lean`](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean)'s module docstring now distinguishes the single-state bound from transition history;
- [the invariant's Contract paragraph](../RUNTIME-STATE-INVARIANT-SPEC.md#contract) and its `RSI-MONO-04` row now preserve the issuing-discipline gap;
- [the Activity occurrence specification](../ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md)'s preservation and assurance-lane account now records locally derived freshness without claiming general preservation;
- [`implementation-status-owner:ENGINE-SEMANTIC-FAMILY`](../ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md) now records the local discharge beside the measured reason for the open preservation lane;
- the docstrings of `waitIdentitiesUnique_replacedState` in [`ActivityBodyTurnover.lean`](../../BpmnSemantics/SemanticProcess/ActivityBodyTurnover.lean) and `replacedState_preserves_wellFormed` in [its extracted preservation owner](../../BpmnSemantics/SemanticProcess/ActivityBodyTurnoverPreservation.lean) now distinguish the locally derived freshness fact from the still-open `RSI-MONO-04` issuing discipline.

Two further statements were stale before implementation because they described a rejected version of this proposal. [The documentation registry](../README.md)'s row for this document said the bound would make non-reissue a derivation instead of an absence, which was corrected before owner approval. [The plan](../PLAN.md) said registration was blocked on this amendment alone and that stating it discharges an unstated adapter assumption; both were corrected in `551c8f4a`, before the approved review target was read.

## Implementation checkpoint

The implementation follows the cost-selected three-family boundary exactly. [`runtimeStateIdentityBound`](../../BpmnSemantics/SemanticProcess/RuntimeStateIdentityBound.lean) and its independently structured [TypeScript counterpart](../../packages/semantic-core/src/runtime-state-identity-bound.ts) treat an absent counter as zero and compare live User Task, Timer, and Activity activations with their matching counters. The aggregate Lean predicate composes the new conjunct, and the TypeScript validator reports `LiveIdentityAboveCounter` and includes it in `GATED_DEFECTS`.

The separating evidence has one negative per implemented family in both targets. The Lean negatives are isolated in [`RuntimeStateIdentityBoundConformance.lean`](../../BpmnSemantics/RuntimeStateIdentityBoundConformance.lean); the TypeScript test removes only the matching counter from an otherwise admitted User Task, Timer, or Activity state and observes the named defect and command refusal. Existing exact-attribution fixtures were repaired rather than weakened, and the original Lean fixture owner was split into [Activity](../../BpmnSemantics/RuntimeStateActivityConformance.lean) and [remaining-state](../../BpmnSemantics/RuntimeStateWellFormedConformance.lean) owners so each compiler process stays independently memory-bounded.

The body-turnover composition now derives wait-key freshness from the User Task bound and `turnoverWait`'s next-count definition inside [`replacedState_preserves_wellFormed`](../../BpmnSemantics/SemanticProcess/ActivityBodyTurnoverPreservation.lean). The conjunct-specific transition laws stay in [the mechanism owner](../../BpmnSemantics/SemanticProcess/ActivityBodyTurnover.lean), which keeps both owners below the reviewability ceiling.

The fail-closed continuation boundary has a direct recovery-path witness. A declared resumable User Task checkpoint is accepted with counter 1, and the same checkpoint is refused after only that counter entry is removed. This observes the new gated defect at the host recovery seam instead of inferring it from the semantic-core command path.

Nothing in this checkpoint implements Message, Effect, Event race, Call, or ordinary Scope branches, changes the called-root exclusion, establishes general preservation, states the issuing discipline, derives non-reissue, registers sequential Multi-Instance execution, or changes BPMN meaning, a profile, a wire shape, a public observation, or a Temporal primitive.

## Epistemic closure and reopen conditions

The claim is that one single-state fact, checkable in both languages, discharges one named proof hypothesis and narrows one documented absence. Nothing here entails non-reissue, and this proposal's first version asserted that it did.

The common-mode risk is that both languages take the family set from the same reading, so a family whose minting discipline is misread would be misread in both. The mitigation is the criterion rather than the table: implementation must check each family's write sites against the post-state inequality, and the called-root exclusion sits in the table precisely so a reader can see the criterion applied against a real counterexample rather than only stated.

The nearest realistic counterexample is a state built by a host recovery path rather than by a transition, since Continue-As-New carries committed state. Under the Enforcement decision above the conjunct refuses such a state at the continuation boundary, which is the fail-closed direction and should be observed there rather than argued.

Reopen if a family's write discipline changes, if the issuing discipline is discharged for any family and the derivation can be strengthened, if a consumer needs one of the five families a cost narrowing left unstated, or if `invokeProcess` gains a `scopeActivations` write for an independent reason, which would retire the called-root exclusion.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `d8c1091e90c7ff128376633764a6f593fcde8b54` | `fork-turns-none` | `approve-with-required-edits` | `056bd31d45677ec31576388d9fe679eff2538deb` |
| Semantic checkpoint | `07820fba191851920cd051880fb69fa08cac63a5` | `fork-turns-none` | `approve-with-required-edits` | `32a1fef88e91dea5669ada661edffceae054d0f0` |
| Closure | `e47fe38b15d4e1502e1500777cfc7fcb9f9c5422` | `checkpoint-reviewer-warm` | `approve-with-required-edits` | `0b435cc759532a7fbe29de150c0a3a71ed2e0349` |

The semantic-checkpoint review of `07820fba191851920cd051880fb69fa08cac63a5` returned `approve-with-required-edits`. The same reviewer audited `32a1fef88e91dea5669ada661edffceae054d0f0` and closed every required finding: the false Event-race same-change attribution, stale owner headroom, incomplete hard-bound cost provenance, missing TypeScript aggregate source-map inventory, and incomplete routed review packet. The audit found no change to the selected account, public contract, exclusions, or evidence strategy.

Cold proposal review is required because this changes which runtime states the account admits and narrows a named absence, so it changes both admission and the proof boundary. Owner approval is required after that review and before implementation.

The cold review of `d8c1091e90c7ff128376633764a6f593fcde8b54` returned `approve-with-required-edits`. The same reviewer audited `056bd31d45677ec31576388d9fe679eff2538deb` and closed every required finding: the false cross-language called-root enforcement and indirect-coverage claim; the inconsistent family, unexercised-branch, and cost account; missing exact-attribution and same-change obligations; and the omitted TypeScript `runtimeStateRegressions` docstring owner. The audit confirmed that the correction stayed within finding closure and did not require another cold review.

An earlier cold review of `3e89868` found the stale registry and plan claims, missing same-change owners, the false structural reason and coverage claims, the minting-shaped membership criterion, the unnamed enforcement decision, and the unstated layer and identifier family. Its corrections produced the `d8c1091e90c7ff128376633764a6f593fcde8b54` target; because they narrowed the exclusion from the scope family to a called root and the original reviewer thread was unavailable, that target received the new cold review recorded above.

One earlier target was rejected. `2321f058919f3ab1ea38c674a08cea383c137bb3` claimed the bound plus `RSI-MONO-01` derives non-reissue, which does not follow; stated a uniform eight-family rule that refuses every state holding a live called Process; enumerated families where a criterion was required, omitting the wait an effect incident retains; and proposed a narrowed family set that dropped the Timer family its own consumer inventory needs. Because those corrections changed the selected account, that target required a newly spawned cold reviewer rather than a warm audit.
