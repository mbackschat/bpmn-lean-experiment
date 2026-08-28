# Activity body-claim uniqueness proposal

## Status

Lifecycle: archived
Review: approved

## First green implementation checkpoint

Committed source target `7e01fb0c` implements the selected pairwise rule in Lean and TypeScript without changing `ActivityBody`, `ActivityOccurrence`, `RuntimeState`, or any public observation. Lean owns the task and child-scope claim projections, pairwise predicate, lookup consequences, insertion/filter/rewrite laws, writer preservation, and kernel-decided task/scope negatives. TypeScript reports the distinct gated `DuplicateActivityBodyClaim` defect, retains the repeated-task single-record positive, and exercises every current Activity writer through the guarded claim-preservation axis.

The Temporal continuation lane now refuses both a duplicated exact task claim and a duplicated exact child-scope claim before a resumed Workflow may select an owner. The corrected Lean checkpoint binds bounded-scope preservation to the successful atomic arming path and exercises the scope collision against a live non-root child. Its conformance module passed under the pinned 3 GiB, one-CPU, no-additional-swap harness at `1,662,532` KiB peak RSS and `7.64` seconds, bound to the exact source bytes at `95b011b1`.

This was the implemented closure target. Parallel Multi-Instance entry, progress, final, early, and Timer preservation consume the new conjunct without a family-specific premise, while command and continuation admission fail closed on either alias domain. Governed closure graduated the stable rule into the [Activity occurrence ownership specification](../ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md#stable-semantic-rules); this archived proposal retains its rationale and review chronology without owning the current contract.

## Decision question and boundary

What is the smallest cross-family runtime-state invariant that makes an Activity body have one owning Activity occurrence record, so a transition may withdraw or replace that body without stranding another record that claims it?

This proposal selects one structural rule over the existing `ActivityOccurrence.body` representation. It adds no BPMN element, source shape, profile capability, Semantic Process operation, runtime field, public observation, CIB relationship, Temporal primitive, platform contract, MUE content ID, or PLAN item. It supports the active `PARALLEL-MULTI-INSTANCE` item because that family's closing-preservation proof is the first current consumer to make the missing rule falsify a required theorem.

The selected rule is broader than a Parallel Multi-Instance guard and narrower than a general ownership redesign. It covers every current User Task and child-scope body arm because the same aliasing mechanism exists in both domains. It does not require every live wait or scope occurrence to be an Activity body, does not make Activity occurrence records universal, and does not change what one record may own.

## Root defect and second instance

The production `runtimeStateWellFormed` predicate currently proves that every Activity record's body is live, that every attached Timer it lists is live under the record's owner, that no Timer wait is listed by two records, and that Activity occurrence identities are unique. None of those conjuncts prevents two records with different Activity identities from naming the same body occurrence.

That admitted shape makes the required Parallel Multi-Instance closing-preservation theorem false. Add an unrelated Activity record with a distinct Activity identity and a singular User Task body naming one live parallel child. The state still satisfies the current generic and program-indexed predicates because the unrelated record has a live body and is outside the selected parallel operation's binding. A `.progresses` successor removes the completed child wait and rewrites only the selected parallel record; `.final`, `.early`, and Timer `.interrupts` successors remove the selected record and its remaining regional child waits. In every route the unrelated record remains and its body is gone, so `activityRecordsOwnLiveWork` fails.

The same mechanism has a second independent carrier. Two distinct Activity records may name one live child-scope occurrence. A scope-completion or regional-removal transition can remove that scope and its selected owner while stranding the other record. A User-Task-only correction would therefore patch the reported proof and leave the class intact.

The earlier Activity body-turnover preservation theorem already exposes the first carrier as its explicit `soleBody` premise: an untouched record may otherwise name the outgoing wait that turnover removes. Body-side lookup determinism carries the same premise because both lookup implementations return no owner when two records match. These are not three local obligations. They are consequences of one missing state invariant.

## Selected rule

`AOO-CLAIM-01`: two Activity occurrence records at distinct positions in `RuntimeState.activityOccurrences` claim disjoint body occurrences.

One record claims:

- the exact User Task occurrence in a singular User Task body;
- every exact User Task occurrence in a parallel User Task body;
- the exact scope occurrence in a child-scope body.

Two User Task claims are equal only when their complete semantic occurrence identities agree. Two child-scope claims are equal only when their complete semantic scope occurrence identities agree. User Task and child-scope claims occupy separate domains and never collide across kinds.

In typed pseudocode:

```text
for every two distinct positions i and j in state.activityOccurrences:
  userTaskClaims(state.activityOccurrences[i].body)
    is disjoint from
  userTaskClaims(state.activityOccurrences[j].body)

  childScopeClaims(state.activityOccurrences[i].body)
    is disjoint from
  childScopeClaims(state.activityOccurrences[j].body)
```

The criterion is about distinct records, not list-member multiplicity inside one record. A parallel body that repeats one child identity still has one owner; the Parallel Multi-Instance program-indexed binding rejects that malformed member list under its own cardinality and slot agreement. Folding that profile-specific rule into `AOO-CLAIM-01` would make the generic invariant depend on one consumer.

The rule is structural over Activity records. It does not inspect `userTaskWaits` or `scopeOccurrences`. `activityRecordsOwnLiveWork` separately establishes that each claim resolves to live work. Keeping existence and ownership uniqueness separate makes each failure attributable and lets deletion of an unclaimed ordinary wait or scope remain outside this rule.

## Consequences for the existing ownership account

`AOO-CLAIM-01` supplies the premise the existing body-side lookup theorem states explicitly. If one record names a User Task body and the state satisfies the new conjunct, filtering the records by that task has exactly that record, so lookup cannot degrade to no result through ambiguity. The child-scope lookup receives the analogous result.

The Activity body-turnover preservation theorem no longer takes an independent `soleBody` premise after the new conjunct is available. It derives that fact from pre-state well-formedness. The transition's existing freshness argument remains responsible for showing the incoming User Task body collides with no other record.

The Parallel Multi-Instance closing proofs use the same rule in the opposite direction. When the selected record owns every child that the transition removes, uniqueness proves every untouched record excludes those children. Final, early, and Timer closure may then delete the selected record and its complete body region without stranding an alias; progress may remove one member and rewrite the selected body while preserving every untouched record's liveness.

The child-scope consequence is retained even though Parallel Multi-Instance does not consume it. Omitting it would knowingly leave the reproduced second instance in every generic scope-removal proof and would make the new rule's name broader than its criterion.

## Lean and TypeScript contract

Lean adds a dedicated Activity-body-claim owner rather than growing `RuntimeStateWellFormed.lean` beyond its source-owner bound. That owner defines the claim-overlap relation, the decidable `activityBodyClaimsUnique` predicate, lookup consequences, structural frame laws, and the reusable facts needed by insertion, deletion, body replacement, and parallel-member removal. `RuntimeStateWellFormed.lean` imports the owner and adds only the top-level conjunct and bounded projection lemmas.

The independently structured TypeScript account adds the same criterion beside the Activity occurrence representation and wires one distinct `RuntimeStateDefect` arm, `DuplicateActivityBodyClaim`, into `runtimeStateDefects`. It is not reported as `ActivityOccurrenceBodyAbsent`, because a duplicated live claim and a missing body are different malformed-state classes, and it is not `DuplicateActivityOccurrence`, because the two claimants may have valid distinct Activity identities.

After current-writer preservation is established, `DuplicateActivityBodyClaim` joins the fail-closed gated defect set. A continuation or injected committed state with an aliased body is refused before evaluation or Workflow scheduling. No evaluator repairs the state by choosing the first claimant or deleting one record.

The Lean and TypeScript representations may decompose the predicate differently, but both decide the pairwise record criterion above. Neither implementation may infer uniqueness from Activity identity uniqueness, body liveness, controller binding, collection order, or the absence of an observed schedule.

## Preservation and writer criterion

Every production write to `activityOccurrences` is in scope. The existing guarded Activity-occurrence writer census remains the membership owner and must grow a claim-preservation axis on every existing writer record rather than acquiring a second prose census.

The evidence obligation follows the write shape:

- initialization is vacuous;
- insertion proves every incoming body claim is absent from all pre-state records; repeated equal members inside the inserted record do not add another owner and require no generic distinctness premise;
- deletion or filtering preserves uniqueness structurally;
- an identity-preserving body rewrite proves its incoming claims exclude every untouched record;
- removal of one or more members from a parallel body preserves uniqueness structurally;
- a claim-projection-preserving record rewrite proves that every record keeps the same body claims even when non-body fields change; `spawnFromMonitoredUserTask` is the current witness because it clears `attachedTimers` while leaving every body unchanged;
- a write that copies `activityOccurrences` unchanged uses a frame law;
- any new write shape fails the census until it receives an explicit preservation account.

This criterion covers operation-specific evaluators, generic scope and called-instance removal, initialization, and continuation reconstruction without enumerating them here as the rule's membership. The guard owns the current set; the criterion owns why each member needs evidence.

The existing Activity-body turnover `soleBody` proof input is replaced by a theorem derived from `activityBodyClaimsUnique`. The Parallel Multi-Instance entry and closing preservation owners consume the new rule. Existing Activity-family preservation theorems that already carry full `runtimeStateWellFormed` must either discharge the new conjunct or make their missing preservation boundary explicit before the gate can claim the invariant generally.

## Required separating evidence

The first Red in each semantic implementation is a state with two distinct Activity occurrence identities where one singular User Task body and one parallel User Task body claim the same live task. Every existing ownership sibling remains satisfied, while only `AOO-CLAIM-01` or `DuplicateActivityBodyClaim` rejects it.

The independent second Red is a state with two distinct Activity occurrence identities claiming the same live child scope. It must fail the same rule without relying on a User Task wait or a Parallel Multi-Instance controller.

Positive structural witnesses retain two records with distinct task bodies, two records with distinct child scopes, and, outside Parallel Multi-Instance controller validation, one record whose parallel body repeats the same exact live task identity. Every existing sibling predicate remains satisfied. The first two prove the rule is not a one-record restriction; the repeated-member witness proves neither body cardinality nor intra-record member equality is rejected by `AOO-CLAIM-01`.

Transition evidence covers the writer criterion rather than only the two hand-built negatives. At minimum it includes the shared User Task and bounded-scope issuer roots, Activity body turnover, sequential Multi-Instance turnover and closure, parallel Multi-Instance entry, progress, final completion, early completion, Timer interruption, scope cancellation, called-instance removal, and every other write found by the guarded census. Shared root writers are proved once and reused by their consumers.

The TypeScript preservation lane asserts that every visited committed successor remains free of `DuplicateActivityBodyClaim`, but it is supplementary evidence and not a substitute for the guarded writer criterion. The Lean lane proves the applicable writer laws and retains kernel-decided negatives for both body domains.

## Temporal hosting and refinement preflight

The rule adds no durable ingress, wait, timer, effect, cancellation route, lifecycle field, public projection, or Workflow command. Temporal carries the same Activity records and body identities it carries today. Replay and Continue-As-New may not repair an alias by host identity or event order.

The host consequence is fail-closed continuation admission. A focused continuation mutation duplicates one existing task-body claim under a distinct Activity identity, and a second mutation duplicates one child-scope claim. Both are refused before a readiness descriptor or scheduler can choose a claimant. Existing valid continuation, Worker-replacement, recovery, and replay witnesses remain byte-identical.

The smallest executable refinement consumer is the active Parallel Multi-Instance route: a committed child completion or Timer interruption removes exactly the body region the selected Activity record owns, and the post-state remains admissible because no other record can claim that region. This proposal establishes the information premise; the consuming capsule still owns real-service replacement, recovery, Timer, accepted-update, publication, and replay evidence.

## Required and excluded implementation

Required:

- one pairwise structural claim-uniqueness predicate in Lean and TypeScript covering singular User Task, parallel User Task, and child-scope bodies;
- composition into production runtime-state well-formedness with a separate TypeScript defect class and fail-closed admission after preservation evidence;
- the task-domain and scope-domain negatives with existing sibling predicates asserted intact;
- positive multi-record witnesses and one repeated-same-task single-record witness outside Parallel Multi-Instance binding;
- one guarded writer classification and preservation evidence for every production `activityOccurrences` write shape;
- derivation of body-side lookup determinism and the Activity-turnover sole-claimant fact from the new conjunct;
- consumption by Parallel Multi-Instance entry and closing preservation;
- continuation refusal mutations and unchanged valid recovery/replay evidence;
- exact implementation-map, ownership-specification, active-capsule, PLAN, and review-status updates with each changed claim.

Excluded:

- changing `ActivityBody`, `ActivityOccurrence`, `RuntimeState`, any wire schema, or any public observation;
- requiring every live User Task or child scope to have an Activity record;
- unifying Activity occurrence, Called Process, or event-race ownership records;
- changing Activity identity, issuing, attached-Timer, or body-liveness rules;
- adding a BPMN profile, source admission, semantic operation, CIB relationship, or platform behavior;
- deciding duplicate members inside one parallel body outside the owning profile's binding rule;
- repairing malformed state, selecting a first claimant, or deriving ownership from Temporal Event History;
- closing general quantified preservation of every runtime-state conjunct beyond the writer class this proposal changes.

## Evidence boundary and lifecycle

This proposal changed runtime-state admission and the Lean proof boundary, so it required an independent cold proposal review before owner approval or implementation. The first green implementation changed a top-level invariant, a gated defect class, and multiple transition-preservation obligations, so it required the governed semantic-checkpoint review. Closure moved the stable rule into the [Activity occurrence ownership specification](../ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md#stable-semantic-rules), while this archived copy retains the residual rationale and review chronology.

Focused proposal verification was the documentation control plane, link and map routing, source hygiene, independent-review policy, and `git diff --check`. Focused implementation verification was the narrow Lean claim owner and affected transition owners, semantic-core well-formedness and Activity-family suites, the guarded Activity writer census, continuation validation, preservation lane, and `git diff --check`. The root ran the complete applicable gate and every path-selected clean-HEAD pre-push entry point at governed targets.

## Same-change owners and reopen conditions

The [Activity occurrence ownership specification](../ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md#stable-semantic-rules) owns the graduated rule, [`implementation-status-owner:ENGINE-SEMANTIC-FAMILY`](../ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md#activity-occurrence-ownership) owns exact current status, and the [Parallel Multi-Instance specification](../capsules/PARALLEL-MULTI-INSTANCE-SPEC.md) consumes the result in its unconditional closing-preservation theorem.

Implementation changed the runtime/proof map, semantic-family map, Activity occurrence ownership specification, Parallel Multi-Instance proof account, TypeScript defect inventory, guarded writer census, the continuation-decoder body-union comment, and PLAN evidence. The stable `AOO-CLAIM-01` rule is owned only by the active specification; this archived proposal is not a second authority.

Reopen before adding another Activity body arm, allowing one body occurrence to have joint semantic owners, making ownership time-sliced rather than state-local, adding a body domain whose identity equality is not exact structural equality, reconstructing Activity bodies from host state, or changing a writer so its body claims cannot be classified by insertion, deletion, body replacement, member removal, claim-projection-preserving record rewrite, or unchanged framing.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `9bc675a82a69e30f591c842243ef6648b9fd87d1` | `fork-turns-none` | `approve-with-required-edits` | `2d39af67b280f3af38ff0beb4ecc045df368e2b5` |
| Semantic checkpoint | `957272ee90f2f843be58dc17c76b0f3a49c33853` | `fork-turns-none` | `approve-with-required-edits` | `95b011b13cdfd29a47bf6c29cf96bebff74ca569` |
| Closure | `a45ee3842c7457980abdbdca078f71249370597d` | `fork-turns-none` | `approve-with-required-edits` | `10a013ab38fbe01962b2fc13eb184b9f03d62f38, 0b060ab8f1d01d5a35f2bc8af569d4d859574adb` |
