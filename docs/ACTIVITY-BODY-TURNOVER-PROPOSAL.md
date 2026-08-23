# Activity body turnover proposal

## Status

Lifecycle: draft
Review: pending

## Question and current boundary

[The Activity occurrence specification](ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md) gives every open Activity occurrence one record naming its owner, its current body, and the handler waits attached to it. It admits exactly one body per record for the life of that record, and it withdraws body turnover explicitly, on the stated ground that no registered family replaces a body. That ground no longer holds. [The sequential Multi-Instance capsule](capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md#public-contract) replaces the inner task on every iteration while the outer Activity and its lifetime Timer stay open, so its first inner completion is a body replacement and fires that specification's own reopen trigger.

This proposal answers one question: what does it mean for an Activity occurrence to keep its identity, its owner, and its attached handlers while the body it owns is replaced. It selects no BPMN construct, admits no source, and adds no operation. It amends a representation so that a later capsule can define transitions over it.

The amendment is written here rather than inside the Multi-Instance capsule because the record is owned by the occurrence account. A capsule that consumes the record must not define a fact about it, or the shared representation acquires a second owner in the layer above it, which is the defect the occurrence account was written to remove.

## Why turnover is the first falsifier this account has had

The occurrence specification records that no admitted state distinguishes it from the ordinal agreement it retired: under every registered profile an Activity is armed once per body, so the Activity's activation and its body's activation coincide and the retired join returned the same answer. Its evidence is conservation plus a static guard, and it says so.

Turnover is exactly the state where those two ordinals diverge. One Activity occurrence at activation `n` owns, over its life, task occurrences at activations `1` through `k`. Any join keyed on ordinal equality answers wrongly for every iteration after the first, while the record answers correctly throughout, and the difference is visible at the public observation boundary because the wrong answer pairs a live deadline with a task that has already completed.

This is therefore the increment that converts the parent account's central claim from carried to checked. That is the reason to take it as a bounded amendment rather than to fold it into a larger capsule where the witness would be one assertion among many.

## Required, optional, and excluded

Required:

- one replacement operation on the record, atomic in the sense that no admitted intermediate state has the record naming a withdrawn body or naming two;
- preservation of the record's identity, its owner, and its attached-wait list across replacement;
- the well-formedness conjuncts continue to hold of the post-replacement state, with body liveness now witnessed by the new body;
- a separating witness at the public observation boundary distinguishing the record from the retired ordinal join.

Excluded, and each exclusion is a reopen trigger rather than a permanent boundary:

- concurrent bodies for one Activity occurrence, which parallel Multi-Instance needs and sequential does not;
- an effect body arm, still unreachable for the reason the parent account records;
- repeated outer activation of the Activity itself, which is a second record rather than a second body;
- any public projection of the record, unchanged from the parent account;
- turnover of the attached handlers, which is the opposite direction and has no consumer.

## Stable semantic rules

| Rule ID | Proposition | Layer |
|---|---|---|
| `AOO-TURNOVER-02` | Replacing an Activity occurrence's body is one transition: the outgoing body is withdrawn and the incoming body is live in the same committed state, and no admitted state holds the record between them. | Project representation |
| `AOO-TURNOVER-03` | Replacement preserves the record's identity, its owner, and its attached-wait list exactly. A handler armed before a replacement is the same handler occurrence after it, with its deadline unchanged. | Project representation |
| `AOO-TURNOVER-04` | The Activity occurrence's activation counter is not advanced by replacement. A new body draws its own occurrence identity from its own counter family, so the two ordinals diverge by construction after the first replacement. | Project representation |

`AOO-TURNOVER-01` stays retired. It was the withdrawal of turnover as unreachable, and a materially different proposition takes a new identifier.

## Public contract

Unchanged. The record is not publicly projected, and replacement adds no observation field. What a consumer sees is the existing task-occurrence lifecycle: one occurrence closes and another opens, each with its own activation, exactly as a repeated task already appears.

`AOO-TURNOVER-03` is what makes that safe. Because the attached handler survives replacement with its identity and deadline intact, no public Timer observation changes at an iteration boundary, and a host holding a durable deadline across the replacement is holding the same deadline rather than a new one that happens to look alike.

## Lean assurance lane

Declared **proved**, scoped to two quantified results:

- **replacement preserves the frame:** for any record and any incoming body, the post-replacement record has the same identity, owner, and attached-wait list, and the collection's canonical order is preserved.
- **replacement preserves well-formedness given a live incoming body:** if the pre-state is well-formed and the incoming body is live in the post-state, the post-state is well-formed. This is a preservation result over one transition and does not discharge the runtime-state invariant's deliberately open general preservation lane.

The nearest checked non-law to record: replacement does *not* preserve the agreement between the Activity's activation and its body's activation, and a checked negative should exhibit the divergence rather than leaving it as prose.

## Temporal hosting and refinement preflight

Durable ingress is unchanged; replacement is an internal consequence of a completion the host already delivers. The mechanism this preflight must settle is the durable deadline across the boundary: the managed scheduler pairs a deadline to its Activity through the record, so `AOO-TURNOVER-03` is what stops task turnover from detaching a still-live Timer or rearming it. The refinement risk is that a host cancels and recreates the native Timer at an iteration boundary, which would preserve the semantic identity while changing the durable one, and no public fact would show it.

The smallest executable refinement witness is therefore a two-iteration schedule that arms one deadline, completes the first inner task, and asserts from Event History that no Timer was cancelled or started at the boundary.

## Evidence strategy

| Claim | Independent evidence |
|---|---|
| `AOO-TURNOVER-02` | A negative for each half: a state whose record names a withdrawn body, and a state whose record names two, both refused by the well-formedness predicate in each language |
| `AOO-TURNOVER-03` | Quantified Lean frame preservation, plus an independently written core assertion over a replacement that leaves the attached list byte-identical |
| `AOO-TURNOVER-04` | The separating witness above, which is the first case where a record-based join and an ordinal join disagree at the public boundary. A seeded mutation restoring the ordinal join must fail it |

Meaningful mutations: advance the Activity counter on replacement; rearm the attached handler on replacement; permit an intermediate state between withdrawal and arrival; key the post-replacement join on ordinal equality again.

## Versioning consequences

No wire artifact changes. The record is internal, has no JSON Schema, appears in no retained scenario or evidence file, and reaches no public projection, so canonical observation bytes, terminal receipts, publication bytes, and profile artifacts are unchanged by construction.

Existing executable constraints that already bind this work include [the runtime-state invariant negatives](../BpmnSemantics/RuntimeStateWellFormedConformance.lean), [the semantic-core well-formedness guard](../packages/semantic-core/test/runtime-state-well-formedness.test.ts), [the ownership join enumeration](../scripts/activity-occurrence-join.test.ts), [the removal-completeness guard](../scripts/runtime-collection-removal-completeness.test.ts), and [source hygiene](../scripts/source-hygiene.test.ts).

### Owners this implementation grows

| Owner | Current headroom before the 600-nonblank-line review target |
|---|---:|
| [runtime state contract](../packages/semantic-core/src/semantic-process-state.ts) | 213 |
| [Activity occurrence owner](../packages/semantic-core/src/activity-occurrence.ts) | 406 |
| [runtime-state well-formedness](../packages/semantic-core/src/runtime-state-well-formedness.ts) | 188 |
| [Lean runtime state](../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 60 |
| [Lean Activity occurrence](../BpmnSemantics/SemanticProcess/ActivityOccurrence.lean) | 359 |
| [Lean runtime-state well-formedness](../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) | 213 |

`RuntimeState.lean` at 60 lines is the binding constraint and it is the owner most likely to need the replacement helper. Land its extraction as a behaviour-preserving commit before adding the transition, rather than writing the amendment under a size squeeze.

## Epistemic closure and reopen conditions

Established by this proposal, if approved: that turnover is expressible without a new body arm, without a second record, and without touching the public contract, and that it supplies the falsifier the parent account lacked.

Nearest unsupported claim: that a *sequence* of replacements behaves, rather than one. The witness is two iterations because that is the smallest case where the ordinals diverge; nothing here establishes behaviour at the profile's sixteen-item bound, and the capacity question for that bound belongs to the Multi-Instance capsule.

Reopen before admitting concurrent bodies, an effect body arm, handler turnover, repeated outer activation, or any public projection of the record.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
