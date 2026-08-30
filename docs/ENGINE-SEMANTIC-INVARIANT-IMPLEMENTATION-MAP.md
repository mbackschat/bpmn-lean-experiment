# Engine semantic invariant implementation map

This detail map owns the exact implemented and absent status of each cross-cutting semantic invariant and ownership mechanism, one section per capsule or specification delegation. Per-BPMN-element family status is owned by [`implementation-status-owner:ENGINE-SEMANTIC-FAMILY`](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), the cross-cutting runtime, Lean, semantic-core, and conformance boundary by [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), and root routing by [`implementation-status-router`](IMPLEMENTATION-MAP.md).

This map exists because the family map's size scaled with BPMN element families closed while it also carried mechanisms that add no BPMN capability at all, and it reached its reviewed word budget while a review correction was landing. The stated axis is what a section is about: a section belongs here when its subject adds no BPMN capability, operation kind, profile, scenario, or public observation field, and in the family map when it closes one BPMN element family. Each map's size then grows with the thing it describes.

## Current boundary

Each section below states the exact implemented and absent status of one cross-cutting invariant or ownership mechanism. A section asserts nothing about any BPMN element family, and a family's use of a mechanism recorded here is established only where that family's own section says so.

These mechanisms constrain how runtime state is admitted, who owns an Activity occurrence, and how a body is replaced. None of them adds a BPMN capability, so none of them is a conformance or CIB compatibility claim.

## Implemented

The mechanisms with a section here are the runtime-state well-formedness predicate, Activity occurrence ownership, and Activity body turnover. Each section names its own rules, evidence lanes, and absences, and is the authority for that mechanism rather than a summary of one.

## Explicitly absent

A mechanism with no section here has no status in this map, which is an absence of routing rather than a claim that it is unimplemented. Quantified preservation of the global runtime-state predicate across every transition is the open lane this map does not close; a family that needs a bound proves it family-locally and says so in its own section.

## Evidence owners

The [capsule registry](capsules/README.md), the Lean modules under [`BpmnSemantics/`](../BpmnSemantics/), the pure core under [`packages/semantic-core/`](../packages/semantic-core/), and the executable well-formedness and census guards bind every claim below. [TESTING-SPEC.md](TESTING-SPEC.md) owns the gate contract.

## Nearest unsupported claims

One split is currently open and named rather than closed. Withdrawing every wait an Activity occurrence record listed when that record is removed holds in the Activity body turnover and bounded-scope families and not in the bounded-task and monitored-task families, which withdraw a single resolved wait in both languages on states the runtime-state predicate admits. The rule belongs in [the Activity occurrence specification](ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md), with each family either migrated or recorded as an exception; until then no section here may be read as asserting it generally.

## Runtime-state well-formedness

The runtime-state invariant states which `RuntimeState` values the account admits as one executable predicate rather than prose, adding no BPMN capability or observation.

**Implemented.** `runtimeStateWellFormed`, indexed by program and expected instance identity. It names sub-predicates for lifecycle emptiness, owner liveness across every wait and hidden-record collection, per-family wait-identity uniqueness, hosted wait declaration, the `selectMany` and `awaitEventRace` halves of hidden-record declaration, canonical collection order, and the narrowed `RSI-BOUND-01` identity bound over User Task, Timer, and Activity. The separate two-state layer now adds the independently checkpoint-approved Activity-only `RSI-ISSUE-01` criterion to `RuntimeStateMonotone`, with an independent TypeScript regression arm and a guarded production-writer classification.

It consumes lifecycle agreement, occurrence uniqueness, scope and token binding, the hosting-root count, and the event-race and incident associations from predicates that already owned them. `RuntimeStateMonotone` and `RuntimeStateTimeMonotone` are separate relations. `RSI-OBL-01` and `RSI-OBL-02`, both under an assumed `runtimePositionValid` of the state each concludes about. Quantified withdrawal finality and its boundary-Timer consequence. Kernel-decided negatives per added conjunct, including one per implemented identity-bound family, carried cross-language. An independent TypeScript validator on the fail-closed `admit` path with a five-schedule preservation lane, plus Workflow-continuation witnesses for recovered time and a User Task identity above its absent counter.

**Absent.** Quantified Lean preservation and monotonicity, `RSI-OBL-03` through `RSI-OBL-06`: a **deliberately open** lane under [the assurance-lane rule](PROJECT-DESIGN.md#lean-assurance-lane). Reason, measured: preservation of the uniqueness conjunct alone reaches ninety-one wait-collection assignment sites across fifteen semantic modules. Activity issuing is the bounded exception, discharged over its guarded current writers; every other identity family still owes an issuing discipline above the pre-state count. Body turnover also derives its local User Task freshness consequence from the identity bound and its next-count definition, without establishing general non-reissue. For arms beyond the standing consumers, proving without a consumer buys no falsifiability. Reopen trigger: a consumer needing a stated conjunct discharged, which both boundary-Timer deferrals already are and which is therefore unmet demand rather than a future event; a capsule needing a fact the list lacks; or a new operation kind or stimulus.

General Lean laws consuming `waitIdentitiesUnique` still assume it; the Activity body-turnover preservation theorem is the bounded exception that derives its freshness premise from `RSI-BOUND-01`. Execution witnesses for pre-existing conjuncts remain absent for the effect wait and effect incident branches, which no schedule reaches, and for instance scoping on declaration, whose only witness is a hand-built incident state. The Message, Timer, event-race, selected-branch, and called-record branches are reached by the registered schedules. `RSI-BOUND-01` is itself implemented narrower than stated: User Task, Timer, and Activity are decided, while Message, Effect, Event race, Call, and ordinary Scope remain absent and called roots remain excluded. `RSI-BIND-04` still filters to hosting-instance waits, `RSI-BIND-05`'s called-record clause is decided nowhere, and the issuing discipline remains unstated outside Activity.

## Activity occurrence ownership

One runtime record per Activity occurrence that owns runtime state beyond its body, replacing the activation-ordinal agreements three boundary-Timer families used to recover their pair. [The specification](ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md) owns the account. It adds no BPMN capability, operation kind, profile, scenario, or public observation field.

**Implemented.**

- `ActivityOccurrence` in both languages, with an identity distinct from `OccurrenceId` by field name so no task identity is substitutable for it, a closed three-arm body union, and a closed tagged Timer-or-Message attached-handler collection
- all seven enumerated TypeScript owner files pair through the record: the five transition owners across four family runtimes, the open-set publication binding, and, since [the turnover amendment](archived/ACTIVITY-BODY-TURNOVER-PROPOSAL.md), the retained-pairing owner plus the publication completeness relation, which pair through the derived handler list rather than through an activation ordinal. All four Lean family modules read it as well. The existing Timer relations retain the shared `RecordJoins` premise, while the Message-bounded family adds its distinct tagged pairing relation
- regional cancellation withdraws every record whose owner or body lies in the region together with the waits those records list; the bounded-scope deadline arm's hand-written withdrawal is gone as redundant
- the adapter pairs a boundary deadline through the record instead of whole-state wait cardinality, and Workflow continuation carries and structurally validates the closed tagged handler collection without assigning publication meaning to the Message arm
- Lean carries the representation, canonical order, lookups, region partition, and withdrawal-completeness laws
- the Activity-only issuing discipline classifies every production record writer, proves strict freshness at every Lean writer the census classifies as an issuer, proves exact-identity preservation or subset removal for every other Lean writer, and checks every independent TypeScript issuer through a pair oracle without changing `ActivityOccurrenceId`. The membership criterion is the census classification rather than a count, so [the guard](../scripts/activity-occurrence-writer-census.test.ts) rather than this prose decides which writers the claim covers
- the stable `AOO-CLAIM-01` rule rejects two distinct records claiming the same exact User Task or child scope, while preserving a repeated equal task inside one parallel body as one owner. Lean derives deterministic task/scope lookup and turnover preservation consequences; TypeScript reports the separate gated `DuplicateActivityBodyClaim` class
- the guarded writer census now classifies claim preservation independently of Activity identity issuance and requires explicit evidence for every disjoint insertion, body replacement, parallel-member removal, or claim-projection-preserving rewrite
- the direct Activity data-output arming writer is classified as an issuer with disjoint claim insertion, and its removal counterpart as identity-removing, on the same evidence shape the data-input pair uses: strict freshness above the predecessor Activity mark, body-claim uniqueness from the live-task counter bound, and subset removal at completion
- the well-formedness predicate carries body liveness, family-tagged attached-wait liveness and unambiguity, identity uniqueness, owner agreement, canonical order, and lifecycle emptiness in both languages; the Message checkpoint adds the same-shaped Message-retagged-as-Timer adversary

**Absent.**

- **superseded.** The sixth derivation site was deliberately exempt rather than migrated, on the ground that giving [the publication completeness relation](../packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts) the producer's records would make it share the mechanism it checks. The amendment migrated it and accepted exactly that cost
- **superseded.** That exemption's reopen trigger fired: under admitted repetition the record and the ordinal reconstruction would legitimately disagree, and the relation would reject a correct publication
- the effect body arm is unreachable and absent, since no registered family gives an Activity an effect body. Body turnover is no longer withdrawn; its status is the section below
- preservation of the new conjuncts across the registered transition arms inherits [the deliberately open lane](RUNTIME-STATE-INVARIANT-SPEC.md#the-deliberately-open-lane) and is not re-declared

**Absent in evidence.**

- both first reds are state-level negatives, because no public transition produces either state: every profile admitting a boundary deadline admits exactly one Activity armed exactly once
- the reachable schedule-level evidence is conservation, byte-identical retained results across the three families' six registered scenarios, which says nothing changed rather than that anything improved
- positive schedule-level evidence for the join remains the enumerated seven-owner guard with no exemption. Its same-family exclusion recognizes only the tagged Timer or Message occurrence comparison, so a cross-family activation join in any listed owner is caught. That narrows the evasion rather than closing it: the safe line is still matched whole, so a real join written beside the safe comparison escapes, which is why the enumeration carries the rule
- no fixture rewinds `activityActivations`, so the new monotonicity family is asserted only positively by the five-schedule preservation lane. Both languages carry the family in their regression oracle; neither carries a negative that would fail if the family were dropped from it
- the stable body-claim rule's negative states are constructed invariant witnesses rather than reachable schedules. Its first public transition consumer proves every Parallel Multi-Instance closing route preserves the complete invariant
- one defect label carries two rules: an owner disagreement under `AOO-OWN-01` is reported as the body-absence class, because the predicate pushes that label for both body liveness and listed-handler liveness. The cross-owner test asserts only that the defect list is non-empty, so nothing pins the distinction
- the two languages' stranding negatives are not negatives of the same state. Lean's is built over the bounded User Task fixture, whose owner and body share a scope, which is the arm where the stranding class cannot arise; the child-scope arm that actually strands a parent-owned deadline is covered only on the TypeScript side
- the continuation decoder's populated parallel-body branch and duplicate task-claim and child-scope-claim refusal mutations are exercised. General valid recovery and replay remain shared host evidence rather than a second independently authored claim predicate
- the called-instance removal route has no executable schedule, because no registered program composes regional cancellation with a Call Activity. Its record filter is held by [a source-derived completeness guard](../scripts/runtime-collection-removal-completeness.test.ts) that derives the required collections from `RuntimeState`, and by Lean's quantified `cancelScopeSubtree_retains_no_withdrawn_record`, whose region predicate unions the subtree with the called-instance closure
- three cancellation routes reach a bounded region without being composable with one today: Error interruption, incident-gated cancellation, and `terminateScope`

## Activity body turnover

One Activity occurrence keeps its identity, owner, operation, and attached handlers while the body it owns is replaced. [The amendment](archived/ACTIVITY-BODY-TURNOVER-PROPOSAL.md) owns the account. It adds no BPMN capability, operation kind, profile, scenario, or public observation field, and no registered construct can drive it: the operation exists so a later repetition capsule can define transitions over it.

**Implemented.**

- a whole-state replacement in both languages that withdraws the outgoing body wait, arms the incoming one from the body element's own counter family, advances that counter, and rewrites the record in one step. Both refuse a record this state does not hold, over the same identity comparison in each language, and a record whose body does not resolve to exactly one live wait, so an unowned replacement and an ambiguous body are both undefined rather than repaired
- the Activity's own counter is deliberately not advanced, which is the whole source of the divergence the record exists to survive
- Lean carries two quantified results: frame preservation, generalised so any body-blind projection of the record collection is unchanged, and preservation of the complete current well-formedness conjunction, including the identity bound. The composed preservation theorem now lives in [its own proof owner](../BpmnSemantics/SemanticProcess/ActivityBodyTurnoverPreservation.lean), while the transition and conjunct-specific laws remain in [the mechanism owner](../BpmnSemantics/SemanticProcess/ActivityBodyTurnover.lean)
- [the collection laws](../BpmnSemantics/SemanticProcess/CollectionOrder.lean) that made the second possible: order preservation under filtering and canonical insertion for both affected families, the lexicographic step both comparators are built from, and the key-factoring laws that carry a frame equation into a conjunct. This is the account's first transition-level preservation law; every earlier well-formedness fact was decided of a concrete state, where empty collections needed no order argument
- [kernel-decided fixtures](../BpmnSemantics/ActivityBodyTurnoverConformance.lean) pinning the pre-state at `([1], [1], [1])` and the post-state at `([2], [1], [1])` for the body, handler, and Activity activation families. They exist because both quantified laws remain provable of an operation that returns its argument unchanged, so neither witnesses the transition's content
- the publication anchor. The completeness relation pairs a firing deadline to its host through the handler list the Workflow accumulator derives from the record after every command, for every retained entry, rather than by activation equality. The continuation decoder recomputes that list from state instead of trusting the payload, so a forged pairing is refused, and the join guard exempts nothing: `AOO-JOIN-03` replaces `AOO-JOIN-02`
- the focused witness that path had never had. A mutation to the pairing predicate passed the entire port-free suite, because every other oracle for it is in the differential pipeline or the Temporal gate

**Absent.**

- the durable retained shape change is unversioned. It is permitted pre-release, but the Temporal preflight must name it before a history baseline is approved
- the retained-pairing owner's empty result on ambiguous body lookup is unreachable for a gate-admitted state because `AOO-CLAIM-01` refuses the ambiguity
- turnover derives the sole-claimant fact from `AOO-CLAIM-01` rather than accepting it independently. General issuing disciplines for User Task, Timer, Message, Effect, Event race, Call, or Scope identities remain absent
- the general preservation lane for every other transition family, which stays open

**Absent in evidence.**

- the separating witness is over runtime state, not the public observation boundary. No admitted construct can drive a second iteration, so the public witness belongs to the consuming capsule
- no fixture exercises a *sequence* of replacements. One replacement is checked; the profile's sixteen-item bound is untouched
- the continuation decoder's recomputation of the retained handler list has no witness on its populated branch. Every continuation fixture carries an empty retained-open collection, so the refusal that makes a forged pairing unable to survive a restore is exercised by nothing, and the restore boundary is the only place that recomputation runs
- that recomputation is also not a second lane for the pairing itself. The accumulator and the decoder both call [one retained-pairing owner](../packages/semantic-core/src/flow-node-occurrence-retained-pairing.ts), which is what makes them agree by construction after the single-writer correction; a defect inside that derivation is invisible to both, so under [the evidence-lane rule](TESTING-SPEC.md#evidence-lanes) their failure modes are correlated and count once
- one clause of the transition rule, that the record names the incoming body, is pinned only in composition by the activation and well-formedness fixtures together rather than by a theorem of its own
- no executable guard names `AOO-TURNOVER-01` through `AOO-TURNOVER-04` or the `AOO-JOIN` retirement, so the identifiers and their retirements are carried by documents alone. The join guard enumerates owners and patterns rather than rule identifiers, which is what makes it useful and also what leaves the retirement itself unguarded
- the transition rule's atomicity clause has no oracle at all, and no mutation can supply one. Exposing an intermediate state between withdrawal and arrival breaks nothing, because callers compose the two halves and both quantified laws hold of the composite; the rule states this as a transition obligation precisely because no state predicate can express it
