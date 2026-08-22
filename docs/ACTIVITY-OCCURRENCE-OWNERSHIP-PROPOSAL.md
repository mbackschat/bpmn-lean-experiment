# Activity occurrence ownership proposal

## Status

Lifecycle: draft
Review: pending

## Question and current boundary

Three closure-reviewed capsules join an Activity to the handler attached to it without any runtime record of that relationship. [The interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md#runtime-state), [the non-interrupting boundary Timer](capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md#runtime-state), and [the interrupting Sub-Process boundary Timer](capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md#runtime-state) each recover the pair by reading the committed operation and then matching two live entries on **equal activation ordinals plus the same scope owner**. All three record the same carried premise in the same words: a repeated or Multi-Instance Activity refutes the join and forces an explicit occurrence record.

This proposal adds that record. It selects one closed Activity occurrence identity, states what one Activity occurrence owns, and migrates the three families onto it. It adds no BPMN capability, no source shape, no checked-graph node, no Semantic Process operation, no profile, no scenario, and no public observation field. No admitted model, accepted stimulus, or canonical projection changes.

It is a prerequisite rather than a feature. [`SEQUENTIAL-MULTI-INSTANCE`](capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md) requires it by name, because its inner task turns over while its one lifetime deadline stays armed; repeated non-interrupting firing requires it for the same reason in the other direction. Neither can be built on an ordinal coincidence.

## Root mechanism

The three joins are not three defects. They are three consequences of one absence: **`RuntimeState` records what each wait owns, and never what owns each wait.**

Ownership today points one way. Every token and wait names one `ScopeOccurrenceId` owner, and [`RSI-OWN-01`](RUNTIME-STATE-INVARIANT-SPEC.md#layer-1-lifecycle-and-structure) checks that the named owner is live. Nothing names the Activity occurrence between the scope and the wait, so an Activity's handler and its body are siblings under one scope rather than parts of one thing. Two consequences follow, and only the first is documented.

**Consequence 1: the pair must be derived, and every derivation rests on a coincidence between two independent counters.** `taskActivations` is keyed by task element, `scopeActivations` by definition scope, and `timerActivations` by Timer element. Two such counters agree only while each of their elements is armed exactly once per arming of the other. Six sites spend three different keys on that one coincidence.

Four are transition owners. [`semantic-process-bounded-task-runtime.ts`](../packages/semantic-core/src/semantic-process-bounded-task-runtime.ts) and [`semantic-process-monitored-task-runtime.ts`](../packages/semantic-core/src/semantic-process-monitored-task-runtime.ts) require a task ordinal to equal a Timer ordinal under the same scope owner. The deadline arm of [`semantic-process-bounded-scope-runtime.ts`](../packages/semantic-core/src/semantic-process-bounded-scope-runtime.ts) requires a child *scope* ordinal to equal a Timer ordinal. Its quiescence arm, `withdrawBoundedScopeDeadline`, compares no ordinal at all: it takes the first Timer of the right element owned by the parent, so under repetition it would withdraw whichever activation's deadline the collection happens to hold first.

Two more are in the **publication** path, and they matter most because that is the layer whose byte-identity is this capsule's only schedule-level oracle. `resolveBoundaryTimerBinding` in [`flow-node-occurrence-open-set.ts`](../packages/semantic-core/src/flow-node-occurrence-open-set.ts) resolves a deadline to its host by the same ordinal equality, over the same three operation kinds, and is reached from three call sites in [`flow-node-occurrence-lifecycle.ts`](../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts). [`flow-node-occurrence-publication-external-completeness.ts`](../packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts) repeats it for both the task and scope arms, and its output feeds [the publication schema](../contracts/schemas/flow-node-occurrence-publication.schema.json), a public wire contract.

None of the six reports an ambiguity when the rates diverge; each silently finds a different sibling or none. That the publication layer carries the same derivation is why migrating only the transition owners would be worse than useless: `AOO-MIGRATE-01` would then pass *because* the coincidence still held downstream, which is exactly the redundant-second-check counterexample recorded under [epistemic closure](#epistemic-closure-and-reopen-conditions), realized in a layer an earlier draft of this capsule did not enumerate.

**Consequence 2: cancelling an Activity's region cannot withdraw the handlers attached to it.** [`removeScopeOccurrenceSubtree`](../packages/semantic-core/src/semantic-process-scope-cancellation.ts) filters every collection by *owner inside the subtree*. A bounded Sub-Process's deadline is owned by the **parent** occurrence, so it is outside the removed subtree by construction and survives the removal of the child it guards. The bounded-scope family avoids that today only because its own two victory arms withdraw the deadline by hand. Three other routes reach the same region without doing so: Error interruption in [`semantic-process-error-runtime.ts`](../packages/semantic-core/src/semantic-process-error-runtime.ts), incident-gated cancellation in [`semantic-process-incident-cancellation.ts`](../packages/semantic-core/src/semantic-process-incident-cancellation.ts), and `terminateScope` in [`semantic-process-termination-runtime.ts`](../packages/semantic-core/src/semantic-process-termination-runtime.ts). No registered profile composes any of the three with a bounded Sub-Process, so none is reachable today; the class is three routes wide rather than hypothetical, and each would strand the deadline the moment such a composition is admitted. `runtimeStateWellFormed` cannot see the stranded state, because the deadline still names a live owner and `RSI-OWN-01` is satisfied.

Consequence 2 is the second instance that confirms the mechanism, and it was not part of the reported problem. It is also the falsifiable one: a stranded parent-owned deadline is a state that exists today and that the invariant admits today, so it can be exhibited before the correction without adding any capability.

The single root fix is to record the ownership edge the state is missing, and to make both the sibling join and regional cancellation read it instead of reconstructing it.

## Selected account

One runtime record per Activity occurrence that owns something. Its identity is distinct from every existing occurrence identity, its body is a closed two-arm union, and the waits attached to it are listed rather than inferred.

```ts
/** One activation of one admitted BPMN Activity. */
export type ActivityOccurrenceId = DeepReadonly<{
  processInstanceId: string;
  activityElementId: string;
  activation: number;
}>;

export enum ActivityBodyKind {
  UserTask = "userTask",
  ChildScope = "childScope",
}

export type ActivityBody =
  | DeepReadonly<{ kind: ActivityBodyKind.UserTask; task: UserTaskInstanceId }>
  | DeepReadonly<{ kind: ActivityBodyKind.ChildScope; scope: ScopeOccurrenceId }>;

export type ActivityOccurrence = DeepReadonly<{
  id: ActivityOccurrenceId;
  owner: ScopeOccurrenceId;
  operationId: string;
  body: ActivityBody;
  attachedTimers: TimerOccurrenceId[];
}>;
```

`RuntimeState` gains `activityOccurrences: ActivityOccurrence[]`, canonically ordered by Process instance, Activity element, and activation, plus one `activityActivations` counter family keyed by Activity element.

That eighth counter agrees with an existing one under every registered profile: with `taskActivations` for both task families, because the Activity element *is* the task element there, and with `scopeActivations` for the Sub-Process family. The agreement is stated here because leaving it unmentioned would leave a reader unable to tell it from the defect being removed. It is not the same thing, and the difference is what is *read*: the two counters measure different quantities that coincide today, an Activity's activations against the occurrences its body has produced, and no transition, projection, or conjunct reads the agreement. Multi-Instance is where they separate, one Activity activation against many inner task occurrences. Because the argument is that nothing depends on the agreement, it gets an anti-coincidence negative rather than prose: a state whose Activity and task counters disagree, with every record and wait otherwise consistent, must remain well-formed. Asserting the agreement instead would install exactly the coincidence this capsule removes, one counter-pair deep.

Four properties of that shape are load-bearing.

**The identity is not an `OccurrenceId`.** `UserTaskInstanceId`, `MessageSubscriptionId`, `TimerOccurrenceId`, and `EffectOccurrenceId` are all aliases of one `{ processInstanceId, elementId, activation }` shape, so a new alias would be substitutable for a task identity both in TypeScript and on the wire. That substitution is exactly the hazard here: for a bounded User Task the Activity element *is* the task element, so an aliased identity would be an equal triple, and under Multi-Instance it would equal the first inner iteration's task identity. Naming the field `activityElementId` makes the two shapes incompatible at compile time and distinguishable when serialized, at no runtime cost. It is the identity [the sequential Multi-Instance proposal](capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md#public-contract) already specified as `MultiInstanceActivityInstanceId`; that capsule then reuses this type instead of minting a second one.

**The owner is the scope occurrence containing the Activity node, and every wait the record lists shares it.** This *derives* the bounded-scope family's parent-ownership rule, which is currently justified only by its mechanical consequence: a child-owned deadline would make the child permanently non-quiescent, and [that capsule records](capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md#selected-account-and-the-competing-accounts-it-rejects) that the failure has no separating witness under its profile. Under this account the deadline is owned by the parent because the Activity is, which is a reason rather than a workaround.

**The body is a union, not a flag.** Interrupting and non-interrupting remain distinct operation kinds, and a body change is a new arm rather than a new boolean. Nothing in the record says whether a handler interrupts; that is an immutable program fact on the operation and stays there.

**The existence condition is a property of the program, not of the state.** A record exists for exactly those Activity occurrences whose Activity carries a wait-producing attached handler in the admitted program, which under the registered profiles is exactly the three boundary-Timer families. Stating it over the state would be self-contradictory: `spawnFromMonitoredUserTask` withdraws the Timer and preserves its host, so a monitored record legitimately owns no attached wait while its body is still live, and a state-level condition would require the record to vanish exactly when it is still needed to identify the host. See [the first owner question](#owner-questions) for the alternative of recording every Activity occurrence and why it is rejected.

### What this account deliberately does not add

An attached BPMN Error handler creates no record. `awaitEffect` carries its `bpmnErrorRoute` as an immutable program fact and the route is taken on effect completion, so there is no stable handler wait to own. Adding an entry for it would be a record with no referent.

There is therefore no effect body arm in this slice. An effect arm would be unreachable: no admitted program attaches a wait-producing handler to an effect, so the arm would exist for no state. The plan item names "current task/effect execution", and this proposal narrows that to the two reachable arms rather than shipping a speculative third. The arm arrives with the first handler attached to an effect that produces a wait, and the union admits it without reinterpreting any model accepted here.

## Required, optional, and excluded

Required:

- one distinct Activity occurrence identity, its counter family, and its canonical collection order;
- the closed two-arm body union and the listed attached-Timer collection;
- new well-formedness conjuncts for identity uniqueness, body liveness, attached-wait reachability, owner agreement, and program agreement;
- `activityOccurrences` added to the `RSI-ORDER-01` canonical-order conjunct, which its add sites satisfy because every insertion is canonical, and to `RSI-LIFE-01`'s and `RSI-LIFE-02`'s explicit collection enumerations, so a `notStarted` or terminal state holding a record is refused;
- `activityActivations` added to the `RSI-MONO-01` counter families in both the Lean relation and its executable core counterpart, which today enumerate exactly seven families plus `endOccurrences`;
- migration of all three registered boundary-Timer families to read the record instead of comparing ordinals;
- regional cancellation that withdraws a record and every wait it lists, including a wait owned outside the cancelled region;
- byte-identical canonical observations, publications, and retained differential results for all three registered profiles;
- the adapter's boundary-deadline pairing read from the record instead of from whole-state wait cardinality;
- quantified Lean laws for cancellation completeness and join determinism.

Optional:

- none in this slice.

Excluded:

- any BPMN capability, operation kind, checked-source shape, profile, scenario, public observation field, or requirement-ledger disposition;
- an effect body arm, a non-Timer attached handler, and a record for an Activity that owns nothing;
- loop-controller payload: snapshots, counters, output slots, and progress projection stay in [the sequential Multi-Instance capsule](capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md), which references this identity rather than duplicating it;
- repeated boundary firing, repeated outer activation, and concurrent occurrences of one Activity element, all of which this record makes expressible but none of which this slice admits;
- body replacement and any law about it, because no registered family replaces a body; it is the motivation for the record's shape, not a proposition this slice can state over a reachable state;
- preservation of the new conjuncts across the registered transition arms, which belongs to [the deliberately open lane](RUNTIME-STATE-INVARIANT-SPEC.md#the-deliberately-open-lane) and is reduced but not discharged here;
- `RSI-MONO-04` non-reissue, still unstated, on which the adapter's durable deadline join still rests;
- CIB observation, Product 2 behavior, and any Temporal identity or Event History fact.

## Runtime and synthetic construct inventory

| Runtime or synthetic fact | Derivation and owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| Activity occurrence record | Created atomically with its body from the committed operation and the next Activity-element activation | Never; no field, no projection, no publication. It replaces a derivation inside the publication path without becoming publishable itself | Exists exactly while its body is live, for exactly those Activities the program gives a wait-producing attached handler; removed atomically with its body |
| Activity occurrence identity | Process instance, Activity element, and the new per-element counter | Never | Strictly increasing per element; never reissued after removal, on the same issuing discipline `RSI-MONO-04` still leaves unstated |
| Body association | The task occurrence or child scope occurrence the arming transition created | The existing `openUserTasks` entry only | Exactly one live body per record; a record with none or two is invalid before evaluation |
| Attached-Timer list | The Timer occurrences armed with the Activity | The existing `openTimers` entries only | Every listed Timer is live and shares the record's owner. Empty is legal, and is the ordinary state after a non-interrupting firing, which is why record existence is a program-level condition rather than a state-level one |
| `activityActivations` counter | Monotonic per Activity element | Never | Never rewound by removal or cancellation, like every existing counter family. Its incidental agreement with `taskActivations` and `scopeActivations` is asserted nowhere and read nowhere |

No record is a BPMN FlowNode occurrence. E1/E2 occurrence accounting is unchanged: the body task remains the one FlowNode occurrence it already is, and the record adds none.

## Stable semantic rules

| Rule ID | Proposition | Layer |
|---|---|---|
| `AOO-ID-01` | An Activity occurrence identity is `(processInstanceId, activityElementId, activation)`, minted from its own counter family, and shares neither type nor serialized shape with any task, Message, Timer, effect, race, or call identity. | Project representation |
| `AOO-OWN-01` | A record names exactly one live scope occurrence, the one owning the Activity node, and every wait the record lists names that same scope occurrence as its owner. | Project ownership |
| `AOO-BODY-01` | A record has exactly one live body: one live User Task wait or one live child scope occurrence. None and two are both invalid before evaluation. | Project ownership |
| `AOO-ATTACH-01` | Every attached-handler Timer wait of an admitted program is listed by exactly one live record, and every listed Timer is live. | Project ownership |
| `AOO-JOIN-01` | The body-to-handler pair is read from the record at every site that needs it, transition and publication alike. No module compares activation ordinals across counter families to decide it, and no site is exempted. | Project representation |
| `AOO-CANCEL-01` | Cancelling a region withdraws every record whose owner or body lies in it, together with every wait those records list, including a wait owned by a scope outside the region. | Project ownership |
| `AOO-MIGRATE-01` | For each of the three registered boundary-Timer profiles, the migrated transitions accept exactly the same stimuli, refuse exactly the same stimuli, and produce byte-identical canonical observations, publications, and terminal receipts. | Project migration closure |
| `AOO-REFUSE-01` | A stimulus naming a body or attached wait whose record is absent, or a state whose record disagrees with its body or attached waits, commits nothing and preserves the complete state. | Project command closure |

Every rule here is a project representation or ownership rule, and none is presented as a BPMN proposition. `AOO-CANCEL-01` is the one with normative neighbours, and neither settles it. Clause 13.5.3 governs the boundary Event's *own* handling, consuming the occurrence, cancelling the attached Activity, then following the boundary Flow; it does not address withdrawing a handler attached to an Activity whose region is cancelled by another route, which is the case `AOO-CANCEL-01` exists for. Clause 13.3.2's Failing and Terminating paragraph is nearer, requiring that "All nested **Activities** that are not in _Ready_, _Active_ or a final state ... and non-interrupting **Event Sub-Processes** are terminated", but it speaks of the region's contents rather than the handlers attached to its owner. Clause 13.5.4's parenthetical, "possibly canceling the **Sub-Process** (including running handlers)", is the only text that reaches handlers, and it is scoped to a re-triggering Event Sub-Process. The rule is therefore labelled project ownership, with those three as the nearest normative support rather than as its basis.

An earlier draft also carried `AOO-TURNOVER-01`, a law that replacing a record's body preserves its identity, owner, operation, and attached list. It is withdrawn from this slice, because applying this capsule's own unreachability test symmetrically removes it: no registered family replaces a body. Each of the three creates its body once and removes it once, and `spawnFromMonitoredUserTask` preserves rather than replaces. A body-replacement transition and its law would therefore exist for no admitted state, which is the same reason the effect body arm is excluded, and the fact that turnover is what motivates the record's shape does not make the law reachable here. It belongs to [the sequential Multi-Instance capsule](capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md), whose iteration is the first admitted replacement, and where Clauses 10.3.8 and 13.3.7 own the repetition that Clause 13.3.2 alone does not.

## Checked source and Semantic Process IL

Unchanged. Each affected operation already names its Activity element and its boundary Timer element, so the record is derivable from committed program plus committed state at arming time and needs no new immutable fact. There is no schema change, no `$id` change, no profile artifact change, and no scenario change.

This is the property that makes `AOO-MIGRATE-01` a strong oracle rather than a restatement: with the wire contracts fixed, the retained canonical results for the three registered profiles must reproduce byte for byte, and any behavior the migration alters shows up there.

## Lean assurance lane

The lane is **proved**, scoped exactly to two quantified results that no finite fixture set can cover:

- **cancellation completeness:** for every state and every region, the cancelled state holds no record whose owner or body was in the region and no wait such a record listed. This is the [assurance-lane rule's](PROJECT-DESIGN.md#lean-assurance-lane) named proved case, cancellation removing exactly the owned subtree, extended to the waits the region owns indirectly;
- **join determinism:** under the new uniqueness conjuncts as explicit hypotheses, at most one record carries a given body or a given attached Timer, so the pair any site reads is unique.

Turnover stability is deliberately not a third result here, for the reason given with the withdrawn `AOO-TURNOVER-01` above: no registered family replaces a body, so the law would quantify over an empty set of admitted transitions.

Two things this lane deliberately does not claim. It does not prove that a state reached by execution satisfies those hypotheses: that is preservation, and it stays in the runtime-state invariant's [deliberately open lane](RUNTIME-STATE-INVARIANT-SPEC.md#the-deliberately-open-lane). What changes is the shape of what is assumed. Today each of the three families assumes an ordinal coincidence between two counter families, stated only in its own module comment, with no owner and no executable form. After migration they assume one conjunct over one collection, with one owner and a decided negative. Reducing three unowned premises to one owned premise is the claim; discharging it is not.

It also does not re-derive the evaluator. Per [the bridge classification](RUNTIME-STATE-INVARIANT-SPEC.md#bridge-classification), an arm whose premise is the evaluator's own result is a dispatcher check and is not cited as a semantic lane. The three results above state premises the evaluator does not supply, which is why they earn a lane.

Kernel cost is scheduled, not discovered. Adding conjuncts to `runtimeStateWellFormed` re-reduces every existing kernel-decided well-formedness fact, and adding an arm to a dispatcher is re-reduced by every downstream decided fixture. Implementation builds one narrow target under the memory bound before any full `./scripts/lake.sh build`, and the shared representation lands in its own `ActivityOccurrence.lean` module rather than in [`BoundedScope.lean`](../BpmnSemantics/SemanticProcess/BoundedScope.lean), which has 68 nonblank lines of headroom and cannot absorb a relation arm plus laws.

## CIB Seven relationship boundary

None selected, and none needed. This changes no admitted source, no executed behavior, and no observable projection, so there is nothing for an oracle to disagree with. The three migrated capsules select no CIB observation today and this proposal does not add one. No relationship ID is created, cited, or advanced.

## Temporal hosting and refinement preflight

Durable ingress, waits, timers, effects, cancellation, lifecycle, and projection mechanisms are all unchanged. The record is committed semantic state and crosses Continue-As-New with the rest of `RuntimeState`; the continuation validator must accept the two new fields and reject a continuation that loses, duplicates, or substitutes a record, exactly as it does for the existing hidden-record collections.

The adapter is a named consumer, not a bystander. [`bounded-deadline-scheduler.ts`](../packages/temporal-adapter/workflow/src/bounded-deadline-scheduler.ts) currently pairs a deadline with its host by **whole-state wait cardinality**: `managedDeadline` requires `state.timerWaits.length === 1` and `requireManagedDeadline` requires `state.userTaskWaits.length === 1`. That is weaker than the core's join, which at least compares ordinals, and it is a global assumption about the entire runtime state rather than a statement about one Activity. It holds only because every profile admitting a boundary deadline admits nothing else concurrent with it. Reading the pair from the record replaces a whole-state coincidence with a per-Activity fact and removes the assumption before a profile invalidates it.

The three distinct scheduler-unavailable failure identities stay distinct, and the coalesced-activation barrier is unchanged: a completion and its deadline arriving in one activation still has no portable winner and still fails closed with its own family's identity.

The state relation preserved is the existing one plus one component: the committed record set. The smallest executable refinement witness is the existing three boundary-Timer live-Temporal schedules replayed unchanged, plus one continuation witness whose successor Run reconstructs the record and pairs the deadline from it.

Two risks are named rather than resolved. Continue-As-New must not be able to carry a record whose body did not survive with it, which is why the continuation validator gets the conjunct rather than only the command path. And the host's durable deadline join still assumes an identity is never reissued after withdrawal, which is `RSI-MONO-04` and still unstated; this proposal narrows what that assumption is *used* for but does not discharge it.

## Evidence strategy

The first red is not a missing feature. It is a state the current account admits and should not:

1. **Stranded attached wait.** Build the state `removeScopeOccurrenceSubtree` leaves when a bounded Sub-Process's child region is removed while its parent-owned deadline is not. `runtimeStateWellFormed` returns true today, in both languages. `AOO-ATTACH-01` must refuse it. This is the executable form of Consequence 2 and it needs no new capability.
2. **Ordinal-divergent join.** Build a state in which the body's activation ordinal and the attached Timer's ordinal differ while both are live and both belong to the profile's single Activity. Today every one of the three joins returns no pair, so a live deadline becomes unreachable and the state is stuck with no diagnostic. After migration the pair is found by identity and the transition commits. This is the executable form of Consequence 1.

Both first reds are **state-level negatives, not schedules**, and that limit must be stated rather than glossed. No registered schedule reaches either, because every profile admitting a boundary deadline admits exactly one Activity armed exactly once — which is precisely the unfalsifiability [the non-interrupting capsule already recorded](capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md#common-mode-risks) as its sharpest exposure. What is reachable and schedule-level is `AOO-MIGRATE-01`.

| Claim | Independent evidence |
|---|---|
| `AOO-ID-01` substitution refusal | Compile-time negative checks that a task identity is not assignable to an Activity occurrence identity and vice versa, beside a positive construction |
| `AOO-OWN-01`, `AOO-BODY-01`, `AOO-ATTACH-01` | One kernel-decided Lean negative per conjunct with its siblings asserted intact, plus the independently written TypeScript validator's own defect label, plus the publication-parity channel |
| `AOO-JOIN-01` | A static guard over all six enumerated sites, transition and publication owners alike, that none compares an activation ordinal across two counter families, seeded by reintroducing one such comparison in a publication owner rather than a transition one |
| `AOO-CANCEL-01` | Quantified Lean law plus the stranded-wait negative above; the seeded mutation removes only owner-matching records and must be caught by the body-matching case |
| `AOO-MIGRATE-01` | Byte-identical retained differential results, canonical observations, publications, and terminal receipts for all three registered profiles across their six registered scenarios and three dedicated pipeline-case modules, plus the three live Temporal schedules and their replays. This oracle is only as good as the completeness of the six-site census above, because an unmigrated derivation would keep it green for the wrong reason |
| `AOO-REFUSE-01` | Core refusal tests with exact state preservation for an absent record, a disagreeing body, and a disagreeing attached list |
| Adapter pairing | The scheduler reads the record; the seeded mutation restores whole-state cardinality pairing and must fail against a state holding a second concurrent wait |

Meaningful mutations: pair by ordinal equality again; drop the body-matching case from regional cancellation; keep a record after its body is withdrawn; withdraw a listed Timer without updating the list; mint the Activity identity from `taskActivations` instead of its own counter; alias the identity to `OccurrenceId`; carry a record across Continue-As-New without its body. Each must be caught by an oracle that does not share the mutated mechanism.

## Versioning consequences

One additive runtime collection and one additive counter family, both internal. `RuntimeState` is not a wire artifact: it has no JSON Schema under [`contracts/schemas`](../contracts/README.md), appears in no retained scenario or evidence file, and reaches no public projection. Canonical observation bytes, terminal receipts, publication bytes, profile artifacts, checked graphs, and Semantic Process programs are unchanged by construction, which is what `AOO-MIGRATE-01` asserts and the retained differential results measure.

Under [the pre-release policy](../CLAUDE.md#pre-release-evolution) the shape change replaces all current producers, consumers, fixtures, and tests atomically. There is no compatibility switch, no parallel reader, and no format counter. Lean's `RuntimeState` fields take `:= []` defaults, matching every collection added since `effectIncidents`, so existing fixture terms stay valid while the new conjuncts apply to them. No Temporal history is retained pre-release, so no history migration exists.

Implementation must update, as one change: the runtime-state contract and its Lean counterpart; one new shared owner in each language; the three family runtimes and their Lean modules; the two publication-path derivations in [`flow-node-occurrence-open-set.ts`](../packages/semantic-core/src/flow-node-occurrence-open-set.ts) and [`flow-node-occurrence-publication-external-completeness.ts`](../packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts), plus the three call sites in [`flow-node-occurrence-lifecycle.ts`](../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts); regional cancellation in both languages; the quiescence predicate; the well-formedness predicate and its independent TypeScript validator; both monotonicity oracles, `RuntimeStateMonotone` in [`RuntimeStateWellFormed.lean`](../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) and `runtimeStateRegressions` in [`runtime-state-well-formedness.ts`](../packages/semantic-core/src/runtime-state-well-formedness.ts); the Workflow continuation validator; the bounded-deadline scheduler; and the status sections of the two routed detail maps plus [PLAN.md](PLAN.md).

One approved capsule's declared public contract is also affected and is named rather than left to be discovered. [The sequential Multi-Instance proposal](capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md#public-contract) is `implementation-in-progress` with an approved review, and its controller record declares the owning `ScopeOccurrenceId`, the immutable operation ID, and the one Timer occurrence identity, alongside its own `MultiInstanceActivityInstanceId`. All four are subsumed by `ActivityOccurrence`, so that capsule's controller retains only its loop payload, the snapshot, counters, and output slots, and references this record rather than restating its fields. That is required by that capsule's own rule against a second disagreeing fact, and the amendment lands with this implementation instead of being deferred to it.

Existing executable constraints include [the runtime-state invariant's negatives](../BpmnSemantics/RuntimeStateWellFormedConformance.lean), [the semantic-core well-formedness guard](../packages/semantic-core/test/runtime-state-well-formedness.test.ts), [the three family semantic tests](../packages/semantic-core/test/subprocess-boundary-timer.test.ts), [the FlowNode occurrence publication coverage guard](../scripts/execution-publication-contract-coverage.test.ts), [the Workflow occurrence authority guard](../scripts/workflow-occurrence-semantic-authority.test.ts), [the Lean import-boundary guard](../scripts/lean-import-boundaries.test.ts), [the Lean source-contracts guard](../scripts/lean-source-contracts.test.ts), [source hygiene](../scripts/source-hygiene.test.ts), [semantic type contracts](../scripts/contract-schema-coverage.test.ts), and [this proposal's reviewability guard](../scripts/document-reviewability.test.ts).

### Owners this implementation grows

| Owner | Current headroom before the 600-nonblank-line review target |
|---|---:|
| [runtime state contract](../packages/semantic-core/src/semantic-process-state.ts) | 234 |
| [runtime-state well-formedness](../packages/semantic-core/src/runtime-state-well-formedness.ts) | 261 |
| [bounded task runtime](../packages/semantic-core/src/semantic-process-bounded-task-runtime.ts) | 333 |
| [monitored task runtime](../packages/semantic-core/src/semantic-process-monitored-task-runtime.ts) | 306 |
| [bounded scope runtime](../packages/semantic-core/src/semantic-process-bounded-scope-runtime.ts) | 360 |
| [scope cancellation](../packages/semantic-core/src/semantic-process-scope-cancellation.ts) | 476 |
| [scope runtime](../packages/semantic-core/src/semantic-process-scope-runtime.ts) | 415 |
| [FlowNode occurrence open set](../packages/semantic-core/src/flow-node-occurrence-open-set.ts) | 43 |
| [FlowNode occurrence lifecycle](../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts) | 44 |
| [publication external completeness](../packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts) | 167 |
| [bounded deadline scheduler](../packages/temporal-adapter/workflow/src/bounded-deadline-scheduler.ts) | 359 |
| [Lean runtime state](../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 147 |
| [Lean runtime-state well-formedness](../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) | 316 |
| [Lean bounded task](../BpmnSemantics/SemanticProcess/BoundedTask.lean) | 186 |
| [Lean monitored task](../BpmnSemantics/SemanticProcess/MonitoredTask.lean) | 126 |
| [Lean bounded scope](../BpmnSemantics/SemanticProcess/BoundedScope.lean) | 68 |
| [Lean scope cancellation](../BpmnSemantics/SemanticProcess/ScopeCancellation.lean) | 498 |

Five owners cannot absorb the shared mechanism and must receive only bounded wiring, and the two tightest are the publication owners an earlier draft of this table omitted: `flow-node-occurrence-open-set.ts` at 43 lines, `flow-node-occurrence-lifecycle.ts` at 44, `BoundedScope.lean` at 68, `MonitoredTask.lean` at 126, and `RuntimeState.lean` at 147. Replacing a derivation with a record lookup should not grow the publication owners at all, and must not be allowed to; if it does, the lookup belongs in the shared owner. The representation, its canonical order, its lookups, and its laws therefore land in dedicated `ActivityOccurrence.lean` and `activity-occurrence.ts` owners, built as narrow targets before the umbrella gate. That extraction condition stops applying only if these measurements change enough that the cohesive mechanism fits while every owner stays below 600; the table is recomputed by the reviewability guard rather than treated as permanent prose.

## Epistemic closure and reopen conditions

Established by this proposal: the three joins share one root absence, that absence has a second consequence nobody reported, the missing edge is expressible without any new BPMN capability or wire change, and the shape that expresses it is the one two queued capsules already require.

Nearest unsupported claim, and it is sharper than preservation: that the record's value is testable at all inside this slice. Both new-conjunct reds are hand-built state negatives, body turnover is withdrawn as unreachable, and `AOO-MIGRATE-01` is a conservation oracle that says nothing changed rather than that anything improved. What remains as positive schedule-level evidence for `AOO-JOIN-01` is the static six-site guard alone. That is a thin lane and is recorded as thin; closure must state it that way rather than counting the migration oracle as evidence for the join. Behind it sits the older unsupported claim, that a state reached by execution satisfies the new conjuncts: this proposal reduces three unowned per-family premises to one owned conjunct with a decided negative, and does not prove preservation, which stays open.

Principal common-mode risk: one author would write the record, the conjuncts, the migration, and the negatives, so a wrong ownership account could be consistently wrong everywhere. Three things constrain it. `AOO-MIGRATE-01` is judged by retained results the migration does not author. The Lean and TypeScript negatives are separately written and reach the parity channel by defect label, not by shared code. And the adapter's pairing is judged against a state holding a second concurrent wait, which no core test constructs.

Nearest realistic counterexample, and it has already happened once on paper: a migration that records the edge correctly and *also* leaves an ordinal comparison somewhere as a redundant second check, so the two agree under every registered profile and the record's value is untested. An earlier draft of this capsule enumerated four derivation sites and missed the two in the publication path, which is that counterexample as a census error rather than an implementation one. The six-site static guard exists for exactly this, and it is seeded by reintroducing one comparison in a publication owner, because that is the half a transition-focused census loses.

Reopen before admitting a non-Timer attached handler, an effect body arm, body replacement, repeated boundary firing, repeated outer activation, concurrent occurrences of one Activity element, a public projection of any record field, a loop controller that stores its payload in this record rather than referencing its identity, or a representation that cannot broaden body cardinality without reinterpreting a model accepted here.

One further reopen trigger is structural rather than about admission. `EventRace` and `CalledProcessOccurrence` are the two existing records of this kind, and [`CalledProcessOccurrence`](../packages/semantic-core/src/semantic-process-call-runtime.ts) is already an Activity occurrence ownership record in all but name: its `id` is the Call Activity element plus a `callActivations` ordinal, its `caller` is the owning scope, its `calledRoot` is the body, and its `returnOperationId` is the operation. Three shapes are kept rather than unified because what they own and the invariants over it differ, and an event race has no body at all, so a forced single owner would need a bodyless arm and would break `AOO-BODY-01`. Under the repository rule that a shared owner is extracted only once two completed users need the same invariant and result domain, no pair qualifies yet. The trigger is the first boundary handler attached to a Call Activity: at that point one Activity occurrence would carry two ownership records with identities minted from two counter families, which is this capsule's own defect at a new locus, and one owner must replace two.

## Owner questions

**1. Record every Activity occurrence, or only those that own something?** *Recommendation: only those that own something.* The universal reading gives a stronger invariant, because "every task wait, effect wait, and child scope occurrence names exactly one Activity occurrence" is total and reaches every profile. It also makes the effect body arm reachable today, which matches the plan item's wording. It costs a reinterpretation of every existing kernel-decided Lean fixture holding an ordinary User Task wait: each becomes malformed under the new conjuncts and must gain a record, in a repository that has already reverted two large Lean conversions for exhausting host memory. The opt-in reading buys the whole falsifiable content of this capsule for the four consumers that exist, and broadening to universal later adds records to states rather than reinterpreting accepted models, so it is not foreclosed. The narrowing is real and worth your decision rather than mine.

**2. `attachedTimers`, or a closed union of attached-handler waits?** *Recommendation: `attachedTimers`.* Timer is the only attached-handler family that produces a wait today, so a one-arm union would be ceremony with no second consumer. `EVENT-SUBSCRIPTIONS` is queued at item 7 and will bring a boundary Message Event; converting a named field to a union at that point is a representation change that reinterprets no model. If you would rather pay the ceremony now than touch three families twice, that is a defensible different answer and the only cost is readability today.

**3. Does the effect body arm belong in this slice?** *Recommendation: no.* The plan item says "current task/effect execution", and I am narrowing it, so it is flagged rather than quietly dropped. Under answer 1 the arm is unreachable and would be code for no state. Under a universal record it becomes reachable and should be included. The two questions are therefore linked, and answering 1 answers 3.

**4. Standalone capsule, or fold the mechanism into `SEQUENTIAL-MULTI-INSTANCE`?** *Recommendation: standalone, as PLAN already orders it.* Folding it in would give the mechanism a schedule-level red for free, because Multi-Instance admits the turnover that falsifies the ordinal join, and it would avoid this capsule repeating the exact unfalsifiability it exists to remove. Against that: three closure-reviewed capsules get their carried premise discharged now rather than after a much larger capsule lands, and a migration judged by byte-identical retained results is attributable in a way the same migration inside a new-capability capsule is not. `AOO-MIGRATE-01` is reachable and schedule-level, which is what makes standalone defensible; the new conjuncts' negatives being state-level is the price.

## Review and implementation boundary

Context-cold proposal review is required before owner approval and before any production implementation. The content is material under [the review rule](../CLAUDE.md#independent-cold-review): it changes runtime representation, ownership semantics, a proof boundary, regional cancellation behavior, and a Temporal refinement argument, even though it changes no BPMN meaning, profile, admission, or public observation.

A semantic checkpoint review is required after the first green checkpoint covering the shared representation, the new conjuncts, and one migrated family, because runtime representation and a transition family both change. Closure review is required after all three families are migrated and the adapter, Lean, differential, live Temporal, replay, full-gate, reflection, and cost evidence exist. No combined checkpoint and closure is assumed: the migration crosses three families and the checkpoint boundary sits inside it.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
