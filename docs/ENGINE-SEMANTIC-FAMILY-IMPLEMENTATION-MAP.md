# Engine semantic family implementation map

This detail map owns the exact implemented and absent status of each closed or in-progress semantic family, one section per capsule delegation. The cross-cutting runtime, Lean, semantic-core, and conformance boundary is owned by [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), and root routing by [`implementation-status-router`](IMPLEMENTATION-MAP.md).

This map exists because the runtime-and-proof map's size scaled with families closed rather than with the engine boundary, and reached its reviewed word budget. Splitting on that axis returns both maps below the default budget, so neither carries a budget exception. A newly closed family adds a section here, not there.

## Current boundary

Each section below states the exact implemented and absent status of one semantic family, delegated to this map by that family's capsule or specification. A section asserts nothing about any other family. The cross-cutting runtime, Lean, semantic-core, and conformance boundary those families execute within is owned by [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), and this map repeats none of it.

The union of these sections is not a coverage figure. BPMN requirement coverage, CIB profile coverage, and platform milestone coverage are three separate denominators with their own owners, and adding family sections changes none of them.

## Implemented

The families with a section here are the runtime-state well-formedness predicate, Activity occurrence ownership, Activity body turnover, and the three boundary-Timer loci. Each section names its own rules, evidence lanes, and absences, and is the authority for that family rather than a summary of one.

## Explicitly absent

A family with no section here has no status in this map, which is an absence of routing rather than a claim that the family is unimplemented; [the requirement ledger](BPMN-REQUIREMENT-LEDGER.md) owns dispositions and the owning capsule owns meaning. No section here is a BPMN conformance or CIB compatibility claim, and none establishes that a mechanism one family proves holds for another.

## Evidence owners

The [capsule registry](capsules/README.md), the Lean modules under [`BpmnSemantics/`](../BpmnSemantics/), the pure core under [`packages/semantic-core/`](../packages/semantic-core/), the registered scenarios, and the differential pipeline bind every claim below. [TESTING-SPEC.md](TESTING-SPEC.md) owns the gate contract.

## Nearest unsupported claims

Reading these sections together supports no cross-family theorem. A mechanism two families share is established only where each section says so independently, and this map is where such a split becomes visible rather than where it is resolved.

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

- `ActivityOccurrence` in both languages, with an identity distinct from `OccurrenceId` by field name so no task identity is substitutable for it, a closed three-arm body union, and a listed attached-Timer collection
- all six enumerated TypeScript owner files pair through the record: the four transition owners across the three family runtimes, the open-set publication binding, and, since [the turnover amendment](archived/ACTIVITY-BODY-TURNOVER-PROPOSAL.md), the retained-pairing owner that derives a record's handler list plus the publication completeness relation, which pairs through that derived list rather than through the record itself. All three Lean family modules read it as well. Both declarative relations that carried an activation-ordinal hypothesis now take the shared `RecordJoins` premise
- regional cancellation withdraws every record whose owner or body lies in the region together with the waits those records list; the bounded-scope deadline arm's hand-written withdrawal is gone as redundant
- the adapter pairs a boundary deadline through the record instead of whole-state wait cardinality, and the Workflow continuation decoder admits and structurally validates both new fields
- Lean carries the representation, canonical order, lookups, region partition, and withdrawal-completeness laws
- the Activity-only issuing discipline classifies every production record writer, proves strict freshness at the two Lean issuer roots, proves exact-identity preservation or subset removal for every other Lean writer, and checks every independent TypeScript issuer through a pair oracle without changing `ActivityOccurrenceId`
- the first-green body-claim checkpoint rejects two distinct records claiming the same exact User Task or child scope, while preserving a repeated equal task inside one parallel body as one owner. Lean derives deterministic task/scope lookup and turnover preservation consequences; TypeScript reports the separate gated `DuplicateActivityBodyClaim` class
- the guarded writer census now classifies claim preservation independently of Activity identity issuance and requires explicit evidence for every disjoint insertion, body replacement, parallel-member removal, or claim-projection-preserving rewrite
- the well-formedness predicate gains body liveness, attached-wait unambiguity, identity uniqueness, owner agreement, canonical order, and lifecycle emptiness in both languages, each with a negative whose siblings are asserted intact

**Absent.**

- **superseded.** The sixth derivation site was deliberately exempt rather than migrated, on the ground that giving [the publication completeness relation](../packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts) the producer's records would make it share the mechanism it checks. The amendment migrated it and accepted exactly that cost
- **superseded.** That exemption's reopen trigger fired: under admitted repetition the record and the ordinal reconstruction would legitimately disagree, and the relation would reject a correct publication
- the effect body arm is unreachable and absent, since no registered family gives an Activity an effect body. Body turnover is no longer withdrawn; its status is the section below
- preservation of the new conjuncts across the registered transition arms inherits [the deliberately open lane](RUNTIME-STATE-INVARIANT-SPEC.md#the-deliberately-open-lane) and is not re-declared
- the stable `AOO-CLAIM-01` rule has not graduated from its [supporting proposal](ACTIVITY-BODY-CLAIM-UNIQUENESS-PROPOSAL.md), because the first green implementation still awaits governed checkpoint review and its Parallel Multi-Instance closing consumer remains open

**Absent in evidence.**

- both first reds are state-level negatives, because no public transition produces either state: every profile admitting a boundary deadline admits exactly one Activity armed exactly once
- the reachable schedule-level evidence is conservation, byte-identical retained results across the three families' six registered scenarios, which says nothing changed rather than that anything improved
- positive schedule-level evidence for the join reduced to the enumerated five-producer guard with its one exempt oracle. `AOO-JOIN-03` now enumerates six with none exempt, and the guard's exclusion names one safe operand rather than three identifiers, so restoring the ordinal join in the migrated owner is caught. That narrows the evasion rather than closing it: the safe line is still matched whole, so a real join written beside the safe comparison escapes, which is why the enumeration carries the rule
- no fixture rewinds `activityActivations`, so the new monotonicity family is asserted only positively by the five-schedule preservation lane. Both languages carry the family in their regression oracle; neither carries a negative that would fail if the family were dropped from it
- the body-claim checkpoint's negative states are constructed invariant witnesses rather than reachable schedules. Its first public transition consumer is still the active Parallel Multi-Instance closing proof, so no closure claim follows from the state-level refusal alone
- one defect label carries two rules: an owner disagreement under `AOO-OWN-01` is reported as the body-absence class, because the predicate pushes that label for both body liveness and listed-Timer liveness. The cross-owner test asserts only that the defect list is non-empty, so nothing pins the distinction
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
- the retained-pairing owner's empty result on ambiguous body lookup is now unreachable for a gate-admitted state because the first-green claim conjunct refuses the ambiguity. That consequence remains checkpoint-level until the supporting proposal closes
- turnover now derives the sole-claimant fact from the first-green body-claim conjunct rather than accepting it independently. General issuing disciplines for User Task, Timer, Message, Effect, Event race, Call, or Scope identities remain absent
- the general preservation lane for every other transition family, which stays open

**Absent in evidence.**

- the separating witness is over runtime state, not the public observation boundary. No admitted construct can drive a second iteration, so the public witness belongs to the consuming capsule
- no fixture exercises a *sequence* of replacements. One replacement is checked; the profile's sixteen-item bound is untouched
- the continuation decoder's recomputation of the retained handler list has no witness on its populated branch. Every continuation fixture carries an empty retained-open collection, so the refusal that makes a forged pairing unable to survive a restore is exercised by nothing, and the restore boundary is the only place that recomputation runs
- that recomputation is also not a second lane for the pairing itself. The accumulator and the decoder both call [one retained-pairing owner](../packages/semantic-core/src/flow-node-occurrence-retained-pairing.ts), which is what makes them agree by construction after the single-writer correction; a defect inside that derivation is invisible to both, so under [the evidence-lane rule](TESTING-SPEC.md#evidence-lanes) their failure modes are correlated and count once
- one clause of the transition rule, that the record names the incoming body, is pinned only in composition by the activation and well-formedness fixtures together rather than by a theorem of its own
- no executable guard names `AOO-TURNOVER-01` through `AOO-TURNOVER-04` or the `AOO-JOIN` retirement, so the identifiers and their retirements are carried by documents alone. The join guard enumerates owners and patterns rather than rule identifiers, which is what makes it useful and also what leaves the retirement itself unguarded
- the transition rule's atomicity clause has no oracle at all, and no mutation can supply one. Exposing an intermediate state between withdrawal and arrival breaks nothing, because callers compose the two halves and both quantified laws hold of the composite; the rule states this as a transition obligation precisely because no state predicate can express it

## Interrupting Activity boundary Timer

The [interrupting Activity boundary Timer specification](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) is **implemented and evidence-closed** for one interrupting exact-`PT1S` deadline on a User Task.

**Implemented.** Source, checked graph, `AwaitBoundedUserTask` lowering, Lean, the independent core, both registered victory routes, Worker-absence durability, shared-activation refusal, replay, and product examples are green.

**Absent.** In Lean, the quantified stale-identity account is conditional and stops at unfindability. `bounded_task_victory_withdrawals_are_final` states over every state and both victory arms that each victory withdraws a live task and a live deadline and that no remaining wait carries either withdrawn key, but it **assumes** key uniqueness rather than deriving it: the `waitIdentitiesUnique` conjunct names the fact and its preservation is unproved, so the law does not yet apply to a state reached by execution. It also does not state the refusal *outcome* of the later stimulus, because that outcome belongs to the dispatcher and one law spanning both accounts would depend on both; the rejected outcome and exact state preservation remain finite checked witnesses beside the core's independent refusal.

**Absent in evidence.** No target can present an off-deadline firing because the host derives the firing instant from committed state. The abandoned Activity's stale completion has no non-racing delivery mode after its task disappears. CIB observation is not selected. The shared-activation refusal identity reaches the Workflow result and Event History, but not a caller awaiting the completion Update.

## Non-interrupting boundary Timer

The [non-interrupting boundary Timer specification](capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md) is **implemented, evidence-closed, and graduated** for one exact-`PT1S` firing that preserves its User Task host.

**Implemented.** Source admission resolves `cancelActivity` into the closed `BoundaryInterruption` value, and the sibling profiles remain disjoint. The `awaitMonitoredUserTask` operation, Lean, the independent core, two registered schedules with mutations, Worker absence, shared-activation refusal, and replay are green. Firing keeps the monitored task live, spawns exactly one boundary task, and closes after both one-sided completions.

**Absent.** CIB observation is not selected. Repeated firing is outside the slice and would require an occurrence record before the one-sided join could remain unambiguous.

## Interrupting Sub-Process boundary Timer

[The interrupting Sub-Process boundary Timer specification](capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md) is **implemented, evidence-closed, and graduated**, for exactly one embedded Sub-Process with one child task and one interrupting `PT1S` boundary Timer. That capsule owns the full exclusion set and is not restated here.

**Implemented.** The source, checked graph, `enterBoundedScope` wire operation, independent Lean and core arming and victory transitions, two registered routes with mutations, distinct shared-activation refusal, Worker-absence durability, and replay are green. The host reuses the family-parameterized boundary deadline scheduler while retaining a distinct refusal identity.

**Absent.** In Lean, and owned only here, the quiescence bridge takes `running` and `bounded`, hypotheses its own transition does not establish. The deadline arm's `parentOwned` is **discharged**: it asserted that regional cancellation left the parent-owned deadline in `timerWaits`, which was true only because the deadline sat outside the cancelled subtree, and the Activity occurrence record now withdraws it there. `deadline_arm_bridge_premise_is_satisfiable` went with the premise it witnessed. With no non-evaluator premise left, that bridge is a dispatcher check and is not cited as a semantic lane; withdrawal on the arm rests on the quantified `cancelScopeSubtree_withdraws_listed_timers` instead.

**Absent in Lean soundness.** `BoundedScopeVictoryStep` is **not** wired into the global `ProgramStep` soundness; only `BoundedScopeArmingStep` is. The relation-level logical-time law is a joint bound over both arms rather than a law separating them.

**Absent in evidence.** CIB observation is not selected. Off-deadline and stale-child witnesses remain outside the registered schedules because no Temporal target can present them without replacing committed deadline derivation or racing task disappearance; Lean and the focused core test carry those refusals.

## Sequential Multi-Instance User Task

The [Sequential Multi-Instance specification](capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) is **implemented and evidence-closed** for one exact collection-driven sequential User Task with direct String input/output mediation and one interrupting outer-lifetime `PT1S` Timer.

**Implemented.** Source admission and lowering preserve the complete data role graph; Lean and the independently written TypeScript core own one outer controller, immutable ordered snapshot, dense indexed outputs, four transition families, exact bounds, public progress, and generated-inner occurrence accounting. Program-aware well-formedness binds each controller forward to one exact operation, record owner, live User Task, and attached lifetime Timer, then checks the reverse operation-local census so no open record or surplus task or Timer wait can escape before command admission, continuation restore, projection, or scheduling. Program admission owns malformed operation-scope structure while no matching runtime artifact exists, and both missing and duplicate owners fail the runtime binding once the Activity is live. Lean proves finite-snapshot conditional closure from target-indexed actual transition events and derives their close-or-decrease effect without claiming human or host fairness. The registered natural and interrupted scenarios agree across Lean, the core, and Temporal. The production Workflow chain preserves one managed lifetime Timer across task turnover, permits only pre-arming rollover, replaces the Worker, recovers a retained result, publishes exact E1/E2 and terminal receipts, proves exact-16 fit with count-only exact-17 refusal, and replays every Run.

**Absent.** Another Activity body, loop cardinality, completion conditions, partial output, non-direct mapping, expressions, another value type, repeated or nested controllers, parallel generation, another Boundary Event or Timer form, a CIB Multi-Instance semantic profile, quantified preservation of every well-formedness conjunct, and a JSON-escape-aware Lean byte measure remain outside this slice.
