# Activity body turnover proposal

## Status

Lifecycle: draft
Review: pending

## Question and current boundary

[The Activity occurrence specification](ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md) gives every open Activity occurrence one record naming its owner, its current body, and the handler waits attached to it. It admits exactly one body per record for the life of that record, and it withdraws body turnover explicitly, on the stated ground that no registered family replaces a body. That ground no longer holds. [The sequential Multi-Instance capsule](capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md#public-contract) replaces the inner task on every iteration while the outer Activity and its lifetime Timer stay open, so its first inner completion is a body replacement and fires that specification's own reopen trigger.

This proposal answers one question: what does it mean for an Activity occurrence to keep its identity, its owner, and its attached handlers while the body it owns is replaced. It selects no BPMN construct, admits no source, and adds no Semantic Process IL operation; the replacement it requires is a state transition, not a new operation kind. It amends a representation so that a later capsule can define transitions over it.

The amendment is written here rather than inside the Multi-Instance capsule because the record is owned by the occurrence account. A capsule that consumes the record must not define a fact about it, or the shared representation acquires a second owner in the layer above it, which is the defect the occurrence account was written to remove.

## Why turnover is the first falsifier this account has had

The occurrence specification records that no admitted state distinguishes it from the ordinal agreement it retired: under every registered profile an Activity is armed once per body and once per attached handler, so a task occurrence and its boundary Timer occurrence share an activation and the retired join returned the same answer as the record. Its evidence is conservation plus a static guard, and it says so.

Turnover is exactly the state where those two ordinals diverge. One Activity occurrence owns, over its life, task occurrences at activations `1` through `k`, while its attached deadline keeps the activation it was armed with. Those are the two ordinals that diverge, the body's and its handler's, and they are the pair every retired join keyed on. A join keyed on ordinal equality therefore matches nothing from the second iteration onward. It does not mispair: a completed task's wait is removed, so there is nothing to mispair with. It returns no pair, the live deadline becomes unreachable, and the state is stuck with no diagnostic, which is exactly what the parent account records of the three joins it retired.

The difference is still visible at the approved public boundary, and that is what makes it a witness: a refused firing and a committed boundary route differ in canonical observation bytes. The pairing that breaks is task activation against Timer activation, not the Activity's own counter against its body's.

This is therefore the increment that makes the parent account's central claim *checkable*. It does not itself check it: this amendment adds no IL operation, admits no source, and registers no profile, so both the two-iteration public witness and the Event-History refinement witness are deliverable only by the consuming capsule, which owns them. The state transition this proposal requires is not a counterexample to that, for the reason given above: it is a transition over the representation, not a new operation kind, and nothing can drive it until a capsule admits a construct that does. What this increment owns is the representation that makes them constructible and the laws that constrain them. Recording that split is the point of taking it as a bounded amendment rather than folding it into a larger capsule where the witness would be one assertion among many.

## The exempt publication oracle, whose trigger this fires

[The occurrence-ownership join guard](../scripts/activity-occurrence-join.test.ts) exempts one owner from reading the record: [the publication completeness relation](../packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts), which reconstructs the pair independently so that it can serve as a separate evidence lane. That exemption carries a reopen trigger in its own words, and Multi-Instance is named in it: under any admitted repetition the record and the ordinal reconstruction would legitimately disagree, and the oracle would reject a correct publication.

Turnover is what makes the disagreement legitimate, so the decision belongs here rather than in the capsule that consumes it. The failure is not a soft one: that owner joins a boundary Timer to its host by activation equality inside a uniqueness requirement that throws, and its output feeds a public wire schema, so at the second iteration a correct timer-interruption publication becomes a hard failure.

**This proposal selects retaining an Activity occurrence anchor in the publication path, and records the demotion that follows.** The alternative was to leave the ordinal reconstruction in place and accept that it disagrees, which keeps the arithmetic honest and keeps the owner failing on correct publications until something else changes. The deciding reason is that a lane which hard-fails on a correct publication is not independent evidence, it is a latent outage, so the choice is between an anchor that costs independence and a lane that costs correctness. The cost is real and is named rather than absorbed: from this point the owner reads the record it was written to cross-check, so it is a second reader of that mechanism rather than an uncorrelated failure mode, and the capsule's evidence accounting must stop counting it as one.

Two executable consequences follow and are same-change obligations rather than discoveries for implementation. [The join guard](../scripts/activity-occurrence-join.test.ts) asserts that the exempt owner still holds the pattern it exempts, on the stated ground that a vacuous exemption should be deleted rather than left standing as a claim; the selection makes it vacuous, so the exempt owner moves into the enumerated producers and that assertion goes with it. And `AOO-JOIN-02` becomes false, because it reads that one independent oracle is exempt by construction and that this is therefore a producer rule rather than a whole-tree one. The parent retired `AOO-JOIN-01` for `AOO-JOIN-02` precisely because exempting one site falsified an approved proposition; removing the exemption is that move in reverse, so the successor is `AOO-JOIN-03`, stating the whole-tree rule with no exemption. It is minted in the parent's namespace because the parent owns that rule, and it is named here rather than left to implementation because an edit to `AOO-JOIN-02` in place would be the retitling of a materially different proposition.

This owner is therefore added to the owners this implementation grows.

## Required, optional, and excluded

Required:

- one replacement operation **on the state**, not on the record alone: it withdraws the outgoing wait, arms the incoming one, advances that body's counter family, and rewrites the record in a single step, as the existing arming and spawn transitions already do;
- preservation of the record's identity, its owner, and its attached-wait list across replacement;
- the well-formedness conjuncts continue to hold of the post-replacement state, with body liveness now witnessed by the new body;
- a separating witness at the public observation boundary distinguishing the record from the retired ordinal join.

Excluded, and each exclusion is a reopen trigger rather than a permanent boundary:

- concurrent bodies for one Activity occurrence, which parallel Multi-Instance needs and sequential does not. Broadening to them is a singleton-to-list widening that reinterprets nothing accepted here, because a state with one body means the same under both readings; the only retraction required is the exactly-one refusal, which this amendment inherits from the parent's body rule rather than creating;
- an effect body arm, still unreachable for the reason the parent account records;
- repeated outer activation of the Activity itself, which is a second record rather than a second body;
- public projection of the record's *contents*: no field of the record becomes an observation. The record's **identity** is a different matter and this exclusion previously overstated it. The consuming capsule's approved public contract already projects `ActivityOccurrenceId` as its controller's `id`, derives its active count from the record's body, and publishes the body's task identity, which is the parent account's own named reopen trigger reached by an amendment rather than by an admitted state. This amendment does not fold that projection in, so the second amendment it needs is identified here rather than left for implementation to discover;
- turnover of the attached handlers, which is the opposite direction and has no consumer.

## Stable semantic rules

| Rule ID | Proposition | Layer |
|---|---|---|
| `AOO-TURNOVER-02` | Replacing a body is one whole-state transition: the outgoing wait is withdrawn, the incoming wait is armed, the record names the incoming body, and every committed state is well-formed. This is a transition obligation, not a state predicate; no conjunct can express "no intermediate state exists". | Project semantics |
| `AOO-TURNOVER-03` | Replacement preserves the record's identity, its owner, its operation ID, and its attached-wait list exactly. A handler armed before a replacement is the same handler occurrence after it, with its deadline unchanged. The operation ID is named because the Multi-Instance controller stops restating it and reads it from here; Lean's record omits the field, so the law is stated over the fields each language carries. | Project representation |
| `AOO-TURNOVER-04` | The Activity occurrence's activation counter is not advanced by replacement, and a new body draws its own occurrence identity from its own counter family. The consequence that matters is downstream: the body's activation diverges from the *attached handler's*, which is the pair every retired join keyed on. | Project representation |

`AOO-TURNOVER-01` stays retired. It was the withdrawal of turnover as unreachable, and a materially different proposition takes a new identifier.

## Public contract

Unchanged **by this amendment**, which is a narrower claim than the parent's. The record's identity is already publicly projected: the consuming capsule's approved public contract carries `ActivityOccurrenceId` as its controller's `id`, so "the record is not publicly projected" is false as a present-tense statement and is not the ground this section stands on. The ground is that replacement adds no observation field and changes no existing one: the controller's identity is the outer Activity's and turnover does not touch it. What a consumer sees is the existing task-occurrence lifecycle, one occurrence closing and another opening, each with its own activation, exactly as a repeated task already appears.

`AOO-TURNOVER-03` is what makes that safe. Because the attached handler survives replacement with its identity and deadline intact, no public Timer observation changes at an iteration boundary, and a host holding a durable deadline across the replacement is holding the same deadline rather than a new one that happens to look alike.

## Lean assurance lane

Declared **proved**, scoped to two quantified results:

- **replacement preserves the frame:** for any record and any incoming body, the post-replacement record has the same identity, owner, and attached-wait list, and the collection's canonical order is preserved.
- **replacement preserves well-formedness, under a named freshness hypothesis:** if the pre-state is well-formed and the incoming wait's key is fresh, the post-state of the whole-state replacement is well-formed. The hypothesis is stated rather than assumed because the transition arms a wait, so the post-state must satisfy wait-identity uniqueness, and no conjunct bounds a live wait's activation by its counter. The arming step establishes freshness by construction, minting from the pre-state counter, so the hypothesis is dischargeable at every call site this amendment admits, given that no live wait exceeds its counter; the residual gap is exactly `RSI-MONO-04`, which no relation states, so discharge is by construction at the call site rather than by a law over arbitrary well-formed states. Declaring the lane proved without that hypothesis would contradict this document's own record of `RSI-MONO-04` as inherited and unresolved, and the parent account has the precedent for carrying such a premise in the open. The well-formedness antecedent must be the whole pre-state and the operation must be whole-state, because a record-only operation hypothesised on "the incoming body is live" is false: nothing would establish wait-identity uniqueness, canonical wait order, or counter monotonicity. Decomposing it into two steps is worse, because the intermediate state is the one `AOO-TURNOVER-02` forbids, so the law would go vacuous on its own hypothesis. This does not discharge the runtime-state invariant's deliberately open general preservation lane.

The nearest checked non-law is **not** the Activity counter against its body's. That disagreement is already admitted deliberately and already kernel-decided as `disagreeing_activity_counter_is_admitted`, so a negative there separates nothing new. The one to check is the body's activation against its attached handler's, because that is the pair the retired joins used and the pair turnover breaks.

## Temporal hosting and refinement preflight

Durable ingress is unchanged; replacement is an internal consequence of a completion the host already delivers. The mechanism this preflight must settle is the durable deadline across the boundary: the managed scheduler pairs a deadline to its Activity through the record, so `AOO-TURNOVER-03` is what stops task turnover from detaching a still-live Timer or rearming it. The refinement risk is that a host cancels and recreates the native Timer at an iteration boundary, which would preserve the semantic identity while changing the durable one, and no public fact would show it.

The smallest executable refinement witness is therefore a two-iteration schedule that arms one deadline, completes the first inner task, and asserts from Event History that no Timer was cancelled or started at the boundary. That assertion detects the real route: the durable key is instance, element, activation, and deadline, and arming no-ops on an equal key, so a preserved identity produces no history event; what would produce one is a committed state where the managed pair resolves to nothing, which cancels the scope and lets the next arming build a fresh Timer.

One host coupling is named rather than left implicit. The scheduler refuses unless the deadline's remaining time is exactly the armed duration, so "deadline unchanged" is enforced host-side as "no logical time elapsed across the replacement". That holds only because completion passes logical time through untouched and only Timer firing advances it, which makes it a constraint on the consuming capsule's completion transition rather than a property of this amendment.

## Evidence strategy

| Claim | Independent evidence |
|---|---|
| `AOO-TURNOVER-02` | The Lean preservation law below, because this is a transition obligation. A state naming a withdrawn body is already refused by the inherited body-liveness conjunct, and a state naming *two* bodies is unconstructible, since `body` is a single union value in both languages, so no predicate can refuse one and that negative is not claimed |
| `AOO-TURNOVER-03` | Quantified Lean frame preservation, plus an independently written core assertion over a replacement that leaves the attached list byte-identical |
| `AOO-TURNOVER-04` | The separating witness above, which is the first case where a record-based join and an ordinal join disagree at the public boundary. A seeded mutation restoring the ordinal join must fail it |

Meaningful mutations: advance the Activity counter on replacement; rearm the attached handler on replacement; permit an intermediate state between withdrawal and arrival; key the post-replacement join on ordinal equality again.

## Versioning consequences

No wire artifact changes. The record has no JSON Schema and appears in no retained scenario or evidence file, and the projection its identity does reach is unchanged by turnover, so canonical observation bytes, terminal receipts, publication bytes, and profile artifacts are unchanged. This is a consequence of what replacement touches, not of the record being internal, which it no longer entirely is.

Seven passages in [the parent specification](ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md) are falsified by approving this and are same-change obligations rather than consequences to notice later: it routes the turnover law to the Multi-Instance capsule, it lists body replacement and any law about it under Excluded, it says turnover stability is deliberately not a third result, it carries body replacement in its reopen list, and three further passages carry the exemption that the selection above removes in favour of `AOO-JOIN-03`: the `AOO-JOIN-02` rule row, which claims a producer rule with one oracle exempt by construction; its evidence row, which asserts the exempt oracle still holds the pattern so the exemption cannot go vacuous; and the epistemic-closure paragraph, which counts five producers against a sixth site that is the oracle. The count is stated exactly because the parent's own nearest realistic counterexample was a census that enumerated four derivation sites and missed the two in the publication path, and a short list is what produces mid-edit discovery. The plan already settles placement this way, so what changes is the parent's record of it, not the decision.

Existing executable constraints that already bind this work include [the runtime-state invariant negatives](../BpmnSemantics/RuntimeStateWellFormedConformance.lean), [the semantic-core well-formedness guard](../packages/semantic-core/test/runtime-state-well-formedness.test.ts), [the ownership join enumeration](../scripts/activity-occurrence-join.test.ts), [the removal-completeness guard](../scripts/runtime-collection-removal-completeness.test.ts), and [source hygiene](../scripts/source-hygiene.test.ts).

### Owners this implementation grows

| Owner | Current headroom before the 600-nonblank-line review target |
|---|---:|
| [runtime state contract](../packages/semantic-core/src/semantic-process-state.ts) | 213 |
| [Activity occurrence owner](../packages/semantic-core/src/activity-occurrence.ts) | 406 |
| [runtime-state well-formedness](../packages/semantic-core/src/runtime-state-well-formedness.ts) | 188 |
| [Lean runtime state](../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 189 |
| [Lean Activity occurrence](../BpmnSemantics/SemanticProcess/ActivityOccurrence.lean) | 359 |
| [Lean runtime-state well-formedness](../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) | 213 |
| [publication external completeness](../packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts) | 167 |

`RuntimeState.lean` was the binding constraint at 60 lines and its extraction has since landed: the five wait-arming transitions moved to `WaitActivation.lean`, which is a different responsibility from the representation they transition over, and the dependency runs one way. The tightest remaining owner is [runtime-state well-formedness](../packages/semantic-core/src/runtime-state-well-formedness.ts), which is where the replacement's conjunct work would land if any were needed; the review concluded none is.

## Epistemic closure and reopen conditions

Established by this proposal, if approved: that turnover is expressible without a new body arm, without a second record, and without changing any observation the public contract already carries. Withdrawn rather than inherited: the parent's claim that the record is unprojected, which was already false when this document opened; the second amendment that folds the existing identity projection into the parent's Excluded list is identified here and not performed here. A retracted claim is not an unsupported one, so the nearest-unsupported slot below keeps its single occupant. What turnover supplies the parent is a state where its retired ordinal join is checkably wrong rather than merely unwitnessed.

Inherited and unresolved: `RSI-MONO-04`, non-reissue of an identity after removal, which both the parent account and the consuming capsule make a precondition for registering that profile. Turnover widens rather than narrows the reliance on it, because a task identity is withdrawn once per iteration and the host separates "same handler" from "reissued" by key equality alone. This proposal does not discharge it and must not be read as having done so.

Nearest unsupported claim: that a *sequence* of replacements behaves, rather than one. The witness is two iterations because that is the smallest case where the ordinals diverge; nothing here establishes behaviour at the profile's sixteen-item bound, and the capacity question for that bound belongs to the Multi-Instance capsule.

Reopen before admitting concurrent bodies, an effect body arm, handler turnover, repeated outer activation, or any public projection of the record's *contents*. Projection of its identity is not a reopen trigger here because it is already the case; it is the subject of the separate amendment named above.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `4f346b2` | `fork-turns-none` | `approve-with-required-edits` | `2c74836, 23a9d57` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
