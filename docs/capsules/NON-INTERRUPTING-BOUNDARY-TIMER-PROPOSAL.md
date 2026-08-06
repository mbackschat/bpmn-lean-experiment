# Non-interrupting Activity boundary Timer proposal

## Status

**Draft, pending independent cold proposal review and owner approval.** Nothing here is implemented, and nothing here is a coverage, conformance, or CIB compatibility claim. The selection this capsule rests on is a recorded *scheduling* decision owned by [the breadth research](../research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#priority-decision-after-the-interrupting-sub-process-boundary-timer), which states in the same section that it approves no semantic account; approving the selection as a semantic commitment is decision 1 below and has not happened. The exact implemented and absent boundary stays in [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md) and is deliberately not restated here.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `818c661` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

## Question

What is the smallest bounded slice in which a boundary Event fires **without** interrupting its host: one non-interrupting `PT1S` Timer Boundary Event on one User Task, where firing spawns a concurrent handler branch, the host Activity stays active and independently completable, and the enclosing scope completes only after both branches finish?

## Selection basis

The [breadth refresh](../research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#boundary-event-candidate-split) decomposes Boundary Event along three independent dimensions and reports a non-interrupting Timer attached to a User Task at 10 files and 11 occurrences. That is the smallest own count among the candidates weighed *there*, not the smallest combination the corpus contains, and the selection is explicitly not a prevalence argument.

Two of the three dimensions are already closed at one cell — interrupting, Timer, on a User Task and on an embedded Sub-Process — and the host axis generalized when the Sub-Process capsule replaced both `UserTask`-only attachment predicates with a fail-closed enumerated host allowlist. The interruption axis has no coverage at all. It carries 53 files and 57 occurrences across every trigger and host, every remaining trigger family would otherwise settle non-interruption for itself, and 62 of the 157 Event Sub-Process files start non-interrupting, which is the same mechanism in a different position.

Fixture prevalence is a scheduling signal only. It is not evidence that this profile executes, and this capsule selects no CIB relationship on lexical grounds.

## Normative basis

BPMN 2.0.2 is the sole semantic authority for this capsule.

- Clause 10.5.6 owns the behavior directly and unusually explicitly: “For non-interrupting boundary Events, the cancelActivity attribute is set to *false*. Whenever the Event occurs, the associated Activity continues to be active. As a *token* is generated for the Sequence Flow from the boundary Event in parallel to the continuing execution of the Activity, care MUST be taken when this flow is merged into the main flow of the Process – typically it should be ended with its own End Event.”
- Clause 13.5.3 owns the boundary handling order and its non-interrupting arm: handling first consumes the Event occurrence; the attached Activity is cancelled only “if the cancelActivity attribute is set”, and otherwise “the Activity continues execution (only possible for Message, Signal, Timer, and Conditional Events, not for Error Events)”; execution then follows the Sequence Flow connected to the boundary Event.
- Clause 10.5 Table 10.91 owns the Boundary Event attributes and Table 10.92 owns the legal `cancelActivity` values per trigger, whose Timer row reads `True/false`. This capsule cites the table numbers rather than a `10.5.x` sub-clause because the local Markdown conversion lost intermediate headings, so the nearest numbered heading it can resolve is not evidence of the owning sub-clause.
- Clause 10.5.5 Table 10.101, *TimerEventDefinition model associations*, owns `timeDuration`, already admitted at exactly `PT1S` by the [Intermediate Catch Timer specification](INTERMEDIATE-CATCH-TIMER-SPEC.md). It makes the three Timer attributes mutually exclusive when `isExecutable` is `true`, which this profile satisfies, and requires `timeCycle` to conform to the ISO-8601 recurring-interval format. Clause 10.5.8 Table 10.122 owns the corresponding XML schema.
- Clause 13.2 owns Process completion, which requires that no token remains within the Process instance and that no Activity of the Process is still active.
- Clause 13.3.2 owns the Activity lifecycle whose continued active state is the observable difference from interruption.

Three consequences are recorded rather than left implicit.

**Clause 13.5.3's “if the attribute is not set” is read as “not set to `true`”, and this capsule notes that reading without depending on it.** Read literally as *absent*, the sentence would contradict the machine-readable `cancelActivity` default of `true` that the [interrupting Activity boundary Timer specification](ACTIVITY-BOUNDARY-TIMER-SPEC.md#normative-basis) had to establish for the opposite arm. That capsule needs the reading; this one does not, because Clause 10.5.6 grants lexical `false` the continuing-Activity behavior directly and unconditionally. The dependency runs one way, so a refuted reading reopens the sibling's admission of an omitted attribute rather than this capsule's account.

**The two End Events are load-bearing here, where the sibling capsule records them as inert.** Clause 10.5.6 states that the boundary token is generated in parallel with the continuing Activity and that the boundary flow “typically it should be ended with its own End Event”. This profile follows that recommendation, so the second End Event is normatively motivated rather than structural symmetry. It remains a *modelling* fact and not a discriminator: the canonical observation exposes no terminal element identity, so the published follow-on task identities still carry the separating witness.

**Repetition is a scope decision about a legal shape.** Clause 10.5.6's “Whenever the Event occurs” contemplates repeated occurrence of a non-interrupting boundary Event while its Activity remains active, and Table 10.101 supplies `timeCycle` as the recurring Timer form. This profile admits only `timeDuration` at exactly `PT1S`, which defines one relative interval, so exactly one occurrence is reachable. That is an exclusion, not a claim that a non-interrupting Timer never repeats, and admitting `timeCycle` is a stop condition below.

The ledger requirement is new: `BPMN-NON-INTERRUPTING-BOUNDARY-TIMER-01`. It enters [the requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) as `unsupported` with this proposal and advances only at closure, which is what that disposition means for a requirement inside the conformance target with no complete executable disposition yet.

## Selected account and the competing accounts it rejects

The distinct new proposition is a **boundary deadline that ends its own occurrence without ending its host's**. Three accounts can express it.

1. **Add a `nonInterrupting` flag to `awaitBoundedUserTask`.** Rejected. It is an optional-boolean mode bag over two families whose *state invariants differ*, not two configurations of one family. `ABTIMER-ARM-01` makes a state holding the task without its deadline invalid; here that state is the normal post-firing state. One operation carrying both would make `boundedPair`'s both-waits-required join wrong for one arm and right for the other, decided by a field rather than by the operation kind.
2. **Lower the boundary Timer to a standalone `awaitTimer` beside `awaitUserTask`.** Rejected for the same reason the sibling capsule rejected it, and one more. Nothing in the program would state that the Timer is withdrawn when the Activity completes, and the pair would present the token-split-plus-timer shape that the Temporal host capability predicate rejects as `concurrentHostDrivenWaits`. The additional reason is that the withdrawal rule is the *only* coupling left once interruption is removed, so an account that drops it keeps nothing of the boundary relation.
3. **Add one operation that owns the Activity and a non-interrupting deadline together.** Selected.

The selected contract reuses the existing arm shape, because a boundary Timer's identity, duration, output control place, and Flow provenance mean exactly the same thing in both families:

```ts
type AwaitMonitoredUserTaskOperation = OperationBase & DeepReadonly<{
  kind: SemanticOperationKind.AwaitMonitoredUserTask;
  input: string;
  task: {
    elementId: string;
    name: string | null;
    output: string;
  };
  boundaryTimer: BoundaryTimerArm;
}>;
```

`BoundaryTimerArm` stays byte-identical and shared with `awaitBoundedUserTask` and `enterBoundedScope`. What differs is the operation kind, and that difference is the whole semantic content: the kind is what selects a transition family whose firing preserves its host.

Sharing the shape carries a documentation obligation the implementation must discharge rather than inherit. `BoundaryTimerArm`'s own contract currently reads “the interrupting deadline every bounded-wait operation owns”, the bounded-wait admission module document says the same, and both boundary-attachment predicates in checked-process admission are documented as interrupting-only. All four become false the moment a third family shares the shape, and a comment broader than its evidence is a defect under [the comment rules](../../CLAUDE.md#comments--document-semantic-surplus).

The name is chosen against the existing vocabulary rather than after BPMN's. `awaitBoundedUserTask` says the deadline *bounds* the Activity; `awaitMonitoredUserTask` says it observes one and spawns a handler without bounding it. Neither name mirrors a BPMN surface class, so neither triggers the stop condition on operations that mirror a class without a reusable mechanism.

`awaitBoundedUserTask`, `enterBoundedScope`, and `awaitTimer` remain unchanged and must not acquire non-interrupting behavior.

## Exact source profile

One new immutable standards-only profile, registered identity `bpmn-2.0.2-non-interrupting-boundary-timer-draft`. It admits the following shape:

```text
None Start → Monitored User Task ──normal──→ Normal User Task → None End A
                    │
        (boundary Timer PT1S, cancelActivity="false")
                    │
                    └──boundary──→ Handler User Task → None End B
```

**The profile pins a shape class, not this one diagram**, on the same admission mechanism the sibling profiles use: an exact checked-node multiset, an exact operation multiset, generic graph reachability, and the deadline-owning host allowlist requiring a unique same-scope User Task host. The sibling capsule records that this leaves two composing residual freedoms — which of the two chained User Tasks hosts the deadline, and which None End Event each route reaches — and the same limit applies here rather than being claimed away. It is an exactness limit of multiset-plus-graph admission, not an unsound program.

- one private executable Process with `isExecutable="true"`;
- exactly one None Start Event with no Event Definition and exactly one outgoing Sequence Flow;
- exactly five Sequence Flows and exactly seven Flow Nodes: the None Start Event, the monitored User Task, the Boundary Event, the two follow-on User Tasks, and the two None End Events;
- no parser warning of any kind, which remains admission-blocking;
- one monitored User Task with exactly one incoming and one outgoing Sequence Flow;
- one Boundary Event whose `attachedToRef` resolves to that monitored User Task;
- `cancelActivity` lexically `false`. An omitted attribute and lexical `true` are both **rejected** as the retained hostile controls, because the machine-readable default resolves omission to `true` and interrupting behavior is the sibling capsule's proposition;
- exactly one Timer Event Definition containing exactly one `timeDuration` whose exact lexical value is `PT1S`; `timeCycle` and `timeDate` are rejected;
- exactly one outgoing boundary Sequence Flow and no incoming boundary Flow;
- two distinct follow-on User Tasks, one on each route, each with exactly one incoming and one outgoing Sequence Flow;
- two distinct None End Events;
- no other executable extension content.

**The admission inversion against the sibling profile is deliberate and is itself evidence.** That profile admits an omitted attribute and lexical `true` while rejecting `false`; this one admits only `false`. The two admitted sets are disjoint, so a source cannot silently acquire the wrong interruption semantics by matching a shape.

The resulting program inventory is one `initiate`, one `awaitMonitoredUserTask`, two `awaitUserTask`, two `reachNoneEnd`, and one root `completeScope`. No standalone `awaitTimer` appears.

The source compiler manifest needs **no new CMOF fact**. `BoundaryEvent`, `attachedToRef`, `cancelActivity`, `TimerEventDefinition`, and `timeDuration` are all already present from the boundary-error and Intermediate Catch Timer capsules; implementation must confirm that against `bpmn-2.0.2-semantic-process-metamodel.json` before relying on it, and a fact that turns out to be missing is a finding to record rather than a silent manifest addition.

## Checked graph and lowering

The checked graph's Timer Boundary Event node variant must carry the interruption disposition as a closed value rather than a boolean, so the two families are distinguished in checked source and not only after lowering. Lean independently lowers the checked graph and requires exact equality with the received program, which is what makes that distinction checkable rather than asserted; retaining the exact `PT1S` literal is what lets Lean normalize it to `1000` independently.

The boundary Sequence Flow is a token-carrying control place in the ordinary `ControlPlace.origin` arm, exactly as in the sibling capsule and unlike the Event-Based Gateway's configuration Flows.

## Runtime state

No new runtime collection is proposed, and the recovery argument differs from the sibling capsule's in one load-bearing way that implementation must not paper over.

The sibling recovers its pair by requiring **both** waits live, which is sound there because arming and removal are atomic and a half-populated state is invalid. Here the deadline is consumed while the task wait remains, so a monitored task with no live deadline is the normal post-firing state and the join must be *one-sided*: the task wait plus the committed operation identify the family, and the deadline is looked up as an optional live wait rather than as a required one.

That one-sided join is what makes the state machine expressible without a hidden record, and it rests on one falsifiable claim: for an admitted program, a live monitored task wait and an optional live deadline wait sharing its activation ordinal determine the family unambiguously, because the profile admits exactly one such Activity with exactly one boundary Timer. A repeated or Multi-Instance Activity refutes it and forces an explicit occurrence record; this profile excludes both, and a later capsule admitting repetition must revisit it.

Both waits belong to one live scope occurrence. Monotonic activation counters are preserved across firing, and firing must leave the task wait byte-identical rather than removing and re-adding it, because the caller holds that occurrence identity.

## Proposed semantic rules

### `NBTIMER-ARM-01` — arm the Activity and its deadline atomically

Reaching the operation atomically activates the User Task occurrence and creates the boundary Timer occurrence with deadline `1000` logical milliseconds from the arming instant. Neither exists without the other at arming; a state with one and not the other at that point is invalid, not a resumption surface.

Arming on Activity activation is the same recorded project interpretation the sibling capsule carries: BPMN 2.0.2 starts a catch Event's wait when a token *reaches* it, and a Boundary Event is never reached.

### `NBTIMER-SPAWN-01` — the deadline fires without ending its host

Firing the exact boundary Timer occurrence at its exact deadline consumes that Timer occurrence, produces one token on `boundaryTimer.output`, and advances logical time to that exact deadline. Nothing else changes: the task occurrence, its activation ordinal, every other wait, every variable binding, and every activation counter are preserved exactly. It produces no token on `task.output` and cancels no Activity-local state.

Logical time is part of the public observation, so its advance is stated here rather than left to the schedule table; the sibling family advances it identically on its deadline arm.

The consumed occurrence does not re-arm, so the deadline fires at most once per activation. Under this profile that is a consequence of the admitted `timeDuration` form rather than a general claim about non-interrupting Timers.

### `NBTIMER-COMPLETE-01` — the Activity completes independently, before or after firing

Completing the exact active monitored task occurrence removes that task occurrence, produces one token on `task.output`, and removes the boundary Timer occurrence **if it is still live**. Both cases are ordinary: completion before firing withdraws a live deadline, and completion after firing finds none and is not a refusal.

This is the case the interrupting family cannot reach, and it is the reason the join is one-sided.

The monitored task is completed by the ordinary completion command, whose stimulus carries `submittedValues`. This profile requires that list to be **empty** for the monitored task and admits no completion patch there, exactly as the sibling capsule does. The rule binds this transition only: the two follow-on tasks complete through the ordinary `awaitUserTask` path, which merges `submittedValues` into Process variables, so their empty submissions are a property of the registered schedules rather than of the profile. A non-empty submission to the monitored task is rejected rather than silently ignored.

### `NBTIMER-QUIESCE-01` — the enclosing scope completes only after both branches

The root scope completes only when no token and no active Activity remains in it, which is Clause 13.2's condition verbatim, so neither branch reaching its None End Event completes the Process while the other is live. This rule adds no mechanism: it is the quiescent completion the [ordinary embedded Sub-Process completion specification](EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md) established, now reached by a scope whose concurrency came from an Event rather than from a Gateway.

It is stated as a rule because it is the proposition an interrupting implementation would silently satisfy for the wrong reason, and because the branch that ends first differs between the two registered schedules.

### `NBTIMER-REFUSE-01` — losers and wrong identities preserve state exactly

A second firing of the consumed Timer occurrence, a firing after the task completed, a wrong task occurrence, a wrong timer occurrence, a pre-due firing, and a wrong deadline are each rejected with exact state preservation, reusing the existing full-identity and exact-time refusal rules rather than restating them.

### `NBTIMER-OBSERVE-01` — project only the existing wait surfaces

The armed state publishes exactly one open User Task and one open Timer through the existing four-kind canonical ordering, with exactly one enabled completion interaction. After firing it publishes **two** open User Tasks and no Timer, with two enabled completion interactions. The capsule adds no observation field, no wait kind, and no stimulus kind.

## Laws, non-laws, and separating witnesses

Required Lean content, all with exact hypotheses. This list is the single owner of the Lean obligation; the rule-to-evidence matrix below carries evidence pointers only, and no other section restates it.

- a declarative arming relation and a declarative spawn relation, both distinct from the evaluator, plus a declarative completion relation with both the deadline-live and deadline-consumed constructors;
- soundness from every evaluator-produced arming, spawn, and completion transition to its relation;
- a quantified **host-preservation** law: every spawn transition leaves the monitored task wait, its activation ordinal, and every activation counter exactly as they were. This is the law that separates this family from its sibling, whose corresponding transition removes the task;
- a quantified routing law: the spawn produces the boundary token and no normal token, and completion produces the normal token and no boundary token;
- a quantified withdrawal law: completion while the deadline is live removes it, so no later firing of that occurrence can commit;
- a quantified off-deadline refusal and a quantified wrong-identity state-preservation law, matching the sibling capsule's forms;
- the nearest **checked non-law**: it is *not* a law that the boundary branch reaching its None End Event completes the Process, because the monitored task may still be active and the scope is therefore not quiescent. This is the proposition an interrupting implementation satisfies vacuously, so the witness must exhibit the two-branch state rather than assert the non-law in prose. A second checked non-law records that reaching logical time `1000` does not always spawn, because an earlier committed completion has already withdrawn the deadline.

Two registered schedules over one definition:

| Case | Stimulus order | Required stable states | Required follow-up check |
|---|---|---|---|
| Deadline then both branches | exact Timer firing at deadline `1000`, then the handler task, then the monitored task | after firing: **two** open User Tasks, no Timer, logical time `1000`; after the handler task completes: still `running` with the monitored task open | a stale exact firing of the consumed Timer rejects and preserves that state |
| Completion before the deadline | exact monitored-task completion before `1000`, then the normal follow-on task | after completion: exactly one open User Task and no Timer, logical time `0` | a stale exact Timer firing rejects and preserves that state |

**Only the first schedule separates this family from its sibling, and the pairing must not be read as if both did.** Schedule 2's public trace — one open User Task, no Timer, logical time `0` — is identical under both interruption dispositions, because a completion before the deadline withdraws it either way. Its discriminating power is against the retained-deadline mutation, not against interruption.

The first schedule deliberately completes the **handler** branch first. That is the order in which an implementation completing the Process at the first End Event is publicly wrong, and it is the state `NBTIMER-QUIESCE-01` exists for. The reverse order is covered in the focused semantic-core test rather than as a third registered scenario, because quiescent completion over two concurrent branches in both orders is already closed evidence in the ordinary Sub-Process capsule and a third pipeline case would re-run that mechanism rather than this family's proposition.

The pre-due firing is required as a **witness** and cannot be a registered scenario, for the structural reason the sibling capsule records: the Temporal host derives its firing instant from the wait's own committed deadline, so no scenario can drive that target to an off-deadline instant. It lives in the quantified Lean refusal law plus the focused semantic-core test, checked against both seeded defect directions.

Start closure is exactly two internal steps, `initiate` and `awaitMonitoredUserTask`. The armed state is resumable through its published task interaction. Firing closes through exactly one `awaitUserTask`; each task completion closes through one `reachNoneEnd`; the second completion additionally closes through root `completeScope`. Every newly reachable stable state publishes at least one User Task or Timer, so none is stranded, and the capsule must executable-check that every newly reachable closure stays inside `semanticProcessClosureLimit`.

Required negative content. Each entry names the form its witness takes and the boundary it is detected at, because those boundaries differ: the first three reach the public observation, the lowering lock is an IL-level fact whose collapsed output is separately rejected by bounded-wait admission, and the source-admission negatives are rejected before any program exists.

- a seeded mutation for an implementation that **cancels the monitored task on firing**, which is the interrupting defect and is detected immediately after firing by the open-task count;
- a seeded mutation for an implementation that **retains the withdrawn deadline** after completion;
- a checked non-law plus a focused core case for an implementation that **completes the Process at the first End Event** while the sibling branch is live;
- a positive lowering lock against erasure of the boundary Sequence Flow identity;
- a quantified Lean law plus an independent core test for a firing before the deadline;
- a source-admission negative for `cancelActivity` omitted and for lexical `true`, both of which must be rejected by this profile.

## Temporal hosting and refinement preflight

This preflight is a feasibility and information-preservation review, not evidence that the adapter refines the core.

**Durable mechanisms needed.** Task completion remains the existing Update; Timer firing remains the existing deterministic `fireTimer` stimulus derived from one durable Temporal timer; all semantic mutation remains in the single Workflow loop. No Activity, Child Workflow, Signal, Continue-As-New, or public cancellation command is added.

**The state relation.** The immutable admitted program plus complete core state pairs with one Workflow-local durable Timer handle derived only from the committed boundary Timer occurrence, plus the existing accepted-stimulus and result ledgers. Only the core decides whether a ready stimulus wins, rejects, or leaves state unchanged.

**The deadline must reach the parameterized scheduler, and registering the scenarios is what will expose it if it does not.** [The bounded deadline scheduler](../../packages/temporal-adapter/src/bounded-deadline-scheduler.ts) selects its family through `ownsDeadline`, which enumerates committed operation kinds. A deadline whose operation kind no family claims falls through to the generic bare-durable-timer path that [the Workflow](../../packages/temporal-adapter/src/workflow-implementation.ts) documents as unsound for a boundary deadline, and every gate that runs without a host port stays green while that is true. That escape is recorded in [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md) and as a durable lane rule in [PLAN.md](../PLAN.md#exact-resume-point), where registering the scenario is what turned an absent host into a red gate. A third `BoundedDeadlineFamily` is therefore required work, not a discovery.

**Its refusal identity must be distinct.** The family descriptor carries `schedulerUnavailableFailureType`, and this family needs its own rather than reusing `BpmnBoundedActivitySchedulerUnavailable` or `BpmnBoundedScopeSchedulerUnavailable`, because the outcome an operator loses here is a *handler branch that never starts beside a task that keeps running* rather than a task or a region that never ends. Sharing an identity would make the three families' host failures indistinguishable in the one place an operator reads them.

**The coalescing hazard transfers, and it is not weaker for being non-interrupting.** If a monitored-task completion Update and the deadline firing become ready in one activation, the two orders give materially different final states: firing then completing yields both branches, while completing then firing withdraws the deadline and yields only the normal branch. The profile defines no portable winner, so the existing two-phase activation-tag and job-drain barrier must fail closed with this family's typed identity before either callback reaches the core. The `hasSignals === false` premise that licenses the barrier for an Update-plus-timer activation is the sibling capsule's, and its direct-VM witness and `hasSignals` source lock already exist; this capsule reuses that premise rather than re-establishing it, and must say so rather than presenting a fourth witness as independent.

**Host capability.** `awaitMonitoredUserTask` is neither passive, an ordinary token split, nor an uncoordinated host-driven wait. [The exhaustive operation-kind classifier](../../packages/temporal-adapter/src/host-admission.ts) gains one managed class whose `never` check forces the new kind to be handled, admitting exactly one such operation with no token split, no other host-driven wait, and no other managed class.

**One host-capability subtlety must be stated rather than discovered.** `canSplitTokens` is a syntactic property of the committed operations, and this family creates a second live branch with no `duplicate` operation to declare it. The predicate will therefore admit this program, and that is correct rather than a gap: before firing the reachable wait set is one deadline beside one task, which is the sibling family's shape, and after firing it is two passive User Task waits, which parallel fork/join already hosts. What the implementation may not do is take the predicate's silence as evidence — it is silent because no syntactic split exists, not because it examined the post-firing state.

**Smallest executable refinement witness.** The two schedules below, replayed in the same gate.

| Witness | Establishes | Required negative content |
|---|---|---|
| Spawn history | the Worker is stopped across the deadline, a replacement Worker commits the firing from committed state alone, the monitored task remains completable afterwards, and both branches then complete | Timer started plus fired and no cancellation; no Activity, Child Workflow, effect, or Workflow-cancellation event |
| Withdrawal history | the monitored task Update commits before the deadline and the durable Timer is cancelled | Timer started plus cancelled, and no Timer fired |

The Worker-absence run belongs on the spawn arm specifically, because the fact at risk is that a replacement Worker reconstructs a state in which one wait was consumed and another was preserved.

## Planned rule-to-evidence matrix

The table states the **planned** lanes per rule. Two lanes count as two only when their failure modes are uncorrelated, which is why the shared refusal predicate is marked once.

| Rule | BPMN/profile | Lean | Independent TypeScript | Temporal refinement | Negative witness or mutation |
|---|---|---|---|---|---|
| `NBTIMER-ARM-01` | Clause 13.3.2 for the Activity reaching Active; the arming instant is the sibling capsule's recorded project interpretation | declarative arming relation and evaluator soundness | atomic task-plus-timer creation | armed Query with one durable Timer started | partial-arm non-law in both directions |
| `NBTIMER-SPAWN-01` | Clause 10.5.6's continuing Activity and parallel boundary token; Clause 13.5.3's skipped cancel step | quantified host-preservation law | boundary token only, task wait byte-identical | spawn history across Worker absence | mutation cancelling the monitored task on firing, detected by the open-task count |
| `NBTIMER-COMPLETE-01` | Clause 13.5.3 normal continuation | quantified withdrawal law over both the live and consumed deadline | one-sided join accepts completion after firing | withdrawal history: Timer cancelled, never fired | mutation retaining the withdrawn deadline |
| `NBTIMER-QUIESCE-01` | Clause 10.5.6's own-End-Event recommendation; Clause 13.2's no-token-and-no-active-Activity completion condition | checked non-law that the first End does not complete the Process | quiescent completion over two branches | terminal receipt only after both branches | focused core case completing at the first End Event |
| `NBTIMER-REFUSE-01` | exact-occurrence and exact-time refusal | quantified off-deadline and wrong-identity refusal | independent core refusal with both seeded defect directions | no registered schedule can present an off-deadline firing | pre-due firing at `999` and its `1001` mirror; stale firing after either branch |
| `NBTIMER-OBSERVE-01` | four-kind canonical ordering | projection agreement | two published tasks after firing, one before | canonical Query projects core state only | boundary-Flow identity erasure collapsing both routes to one output |

CIB Seven is deliberately absent from every row; see the CIB relationship section.

## Runtime-only and synthetic constructs

This capsule introduces none. The boundary Timer occurrence, the task occurrence, and the boundary control place are all derived from admitted source through the checked graph, and the operation supplies the ownership relation that the Event-Based Gateway needed a hidden record for. No construct is created, owned, or removed outside the transitions above, and no public projection exposes anything the existing four wait families do not already carry.

## Layer ownership

Every rule above belongs to the vendor-neutral BPMN account. No rule belongs to a CIB Seven compatibility overlay or to a downstream adoption fixture, and no fixture in this capsule is target-shaped, so the vertical-slice limit does not apply.

## Required, optional, and excluded

**Required.** The source profile, checked graph and lowering with the interruption disposition as a closed value, the one new operation, the six rules with their evidence rows, [the Lean content](#laws-non-laws-and-separating-witnesses) and [the negative content](#laws-non-laws-and-separating-witnesses) exactly as those two lists state them, the independent TypeScript core with its own focused test, the new managed host class with its own typed adapter failure code, the third bounded-deadline family, one registered answer-free scenario per schedule with seeded mutations, the pre-due witness in Lean and the semantic core, and the two histories with replay.

**Optional.** Time-skipping calibration, as for the Intermediate Catch Timer; the full local-server witness remains the mandatory refinement gate.

**Excluded.** Repeated firing and `timeCycle`; non-interrupting boundaries on Service Task, Sub-Process, Call Activity, Transaction, or Receive Task hosts; Message, Error, Escalation, Signal, Conditional, Cancel, and Compensation boundary triggers; date timer forms; any duration other than `PT1S`; multiple Boundary Events on one Activity; a boundary flow that merges back into the main flow rather than reaching its own End Event; repeated or Multi-Instance Activities; Event Sub-Processes; completion data on either route; general Activity cancellation or a public cancel command; incidents; CIB Seven compatibility evidence; and A12 adoption.

## CIB relationship

**None selected.** BPMN 2.0.2 resolves this account explicitly — Clause 10.5.6 states the continuing Activity and the parallel boundary token directly — no admitted source needs a `camunda:*` extension, the Temporal mapping needs no engine observation, and no downstream blocker remains after the standard mechanism exists. Under the [CIB on-demand gate](../PLAN.md#cib-on-demand-gate) all five questions answer no, so this capsule adds no CIB profile surface and registers no relationship.

If implementation discovers a public observation this profile cannot produce without an engine-specific choice, that is a stop condition and a phase-zero probe obligation, not a silent overlay.

## Product-surface consequence

This capsule reaches the product command through example configuration and the existing driver, adding no product code, as the [runnable Temporal MVP specification](../RUNNABLE-TEMPORAL-MVP-SPEC.md) requires. [The oracle](../../packages/temporal-adapter/test/product-example-configs.test.ts) requires at least one example per registered profile with no upper bound, so one suffices and a second is admissible: a single declared plan can answer the handler task and then the monitored task, exercising the spawn arm and both completions, and a second plan answering the monitored task before the deadline would exercise the withdrawal arm.

## Common-mode risks

- **The recovery join is unfalsifiable inside this profile, which is the sharpest exposure here.** All four targets recover the family by joining element identity to activation ordinal with no explicit occurrence record, and the profile's own uniqueness admission is what makes that join safe. Nothing this profile admits can falsify it, so the claim is carried rather than checked: the falsifying state is a repeated or Multi-Instance Activity, and both are excluded. A capsule admitting either must add the occurrence record rather than inherit this argument.
- **The sibling's reading of Clause 13.5.3 does not carry this capsule.** The reading of “if the attribute is not set” as “not set to `true`” is what makes omission interrupting in the sibling profile. Clause 10.5.6 states this capsule's behavior for lexical `false` directly, so a refuted reading reopens that capsule's admission rather than this account.
- **One assumption shared by all four targets.** Every target derives the deadline from the same committed `durationMs: 1000` and the same arming instant, and the arming instant is a project interpretation rather than a transcribed clause. The pre-due witness and a seeded deadline mutation discriminate it; no normative citation can substitute for them.
- **Reused refusal rules.** `NBTIMER-REFUSE-01` reuses the existing full-identity refusal implementation, so Lean and TypeScript refusal are one lane and not two wherever both call the same reused predicate.
- **The barrier premise is inherited, not re-established.** This capsule reuses the sibling's `hasSignals === false` witness and source lock. A defect there fails both capsules together, and this capsule adds no independent separation beyond its distinct typed failure identity.

## Versioning consequences

Pre-release policy applies: the new operation kind is added atomically across the checked-graph compiler, Semantic Process contract, JSON Schemas, Lean decoder and lowering, semantic core, the adapter's typed contract module and host-capability classifier, differential catalog, and every fixture, with no compatibility reader, format counter, or migration branch. No retained Event History is kept beyond the disposable gate.

### Owners this implementation grows

Measured with `node scripts/what-binds.ts`; [the reviewability guard](../../scripts/document-reviewability.test.ts) recomputes every figure, so a row whose owner changes size fails the gate rather than reading as permanent.

| Owner | Headroom before the review target |
|---|---:|
| [Temporal Workflow implementation](../../packages/temporal-adapter/src/workflow-implementation.ts) | 9 |
| [semantic-core runtime dispatcher](../../packages/semantic-core/src/semantic-process-runtime.ts) | 22 |
| [Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 23 |
| [checked-process admission](../../packages/bpmn-source/src/checked-process-admission.ts) | 61 |
| [checked-graph lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 83 |
| [checked-process compiler](../../packages/bpmn-source/src/checked-process-compiler.ts) | 81 |
| [semantic-core operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts) | 180 |
| [semantic-core graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 155 |
| [semantic profile registry](../../packages/semantic-core/src/semantic-process-profile.ts) | 161 |
| [bounded deadline scheduler](../../packages/temporal-adapter/src/bounded-deadline-scheduler.ts) | 386 |
| [Temporal host admission](../../packages/temporal-adapter/src/host-admission.ts) | 422 |
| [bounded wait admission](../../packages/semantic-core/src/bounded-wait-admission.ts) | 453 |
| [Timer Boundary Event source admission](../../packages/bpmn-source/src/timer-boundary-event-source.ts) | 515 |

**One of those owners is the change site without which this profile cannot be admitted at all.** [The Timer Boundary Event source reader](../../packages/bpmn-source/src/timer-boundary-event-source.ts) today accepts `cancelActivity` only when it is absent or `true` and returns no checked node otherwise, so the inverted admission this profile requires is a change to that predicate rather than a new one beside it. [Checked-process admission](../../packages/bpmn-source/src/checked-process-admission.ts) owns `ownsBoundaryTimerDeadline` and `boundaryTimersAttachToDeadlineOwners`, both currently documented as interrupting-only, and it is the tightest listed owner after the three below.

Three of those owners are close enough that the order of work is constrained, and each condition states when it stops applying rather than being a bare instruction.

- **The Workflow implementation must be extracted before this family's clause is added if that clause exceeds 9 nonblank lines.** Selecting a third deadline family is plausibly one arm of an existing selector, which may fit; adding a branch that does not is what forces the extraction. Measure the intended clause, do not estimate it.
- **The runtime dispatcher and the Semantic Process contract each take one clause and one type.** The new operation type is roughly the sibling's 11 lines plus two union members, against 23; the dispatcher takes one `case` plus its delegation, against 22. Both fit only if the family's transitions live in their own module, which they must anyway.
- **The family's three transitions belong in a new `semantic-process-monitored-task-runtime.ts` owner**, not in the sibling's file. The two families share an arm shape and no transition, and the sibling's `boundedPair` requires both waits while this family requires a one-sided join, so merging them would put two invariants behind one helper.

If a measured clause exceeds its owner's headroom, land the extraction as its own behavior-preserving commit before the semantic change, so the new work is not written under a size squeeze.

### Guards and oracles this implementation must change or satisfy

These oracles already constrain the planned artifacts; none is new work invented by this capsule. Enumerate them again with `node scripts/what-binds.ts` before the first edit, and again if the change grows to include paths outside this plan.

| Guard | Requirement it already places on this capsule |
|---|---|
| [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts) | Every added profile, scenario, and retained-evidence artifact is registered in the same change, with no unreferenced profile and no unregistered artifact. |
| [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | Every registered scenario needs exactly one pipeline case carrying a meaningful seeded semantic mutation, and every registered scenario runs through Temporal. |
| [product example configs](../../packages/temporal-adapter/test/product-example-configs.test.ts) | Every registered profile has a live example and every example names a registered profile. |
| [host admission](../../packages/temporal-adapter/test/host-admission.test.ts) | The new managed class must be classified against concurrent host-driven waits and against the other managed classes, which must stay mutually exclusive. |
| [contract schema coverage](../../scripts/contract-schema-coverage.test.ts) | Every operation and checked-node kind must reach a schema branch. This guard exists because the sibling capsule's operation and node kinds were absent from both schemas while every other gate passed, so it is the oracle for the atomic wire-contract obligation. |
| [contract artifact projections](../../scripts/contract-artifact-projections.test.ts) | Canonical observation projections and profile registration must stay consistent with the registered artifacts. |
| [BPMN XML validation](../../scripts/bpmn-xml-validation.test.ts) | The new fixture must validate against the pinned normative schema, with `cancelActivity` lexically `false`. |
| [normative reference resolution](../../scripts/normative-reference-resolution.test.ts) | Every clause and table this capsule's profile and scenarios declare must resolve in the tracked corpus label digest. |
| [requirement ledger consistency](../../scripts/requirement-ledger-consistency.test.ts) | `BPMN-NON-INTERRUPTING-BOUNDARY-TIMER-01` must exist as a ledger row because this capsule cites it, and may be cited as a closed reviewed slice only once its disposition is decided. |
| [Lean source contracts](../../scripts/lean-source-contracts.test.ts) | Every new Lean module needs its module document, its conformance facts need descriptive public theorem names, and a tactic-position `decide` needs `+kernel`. |
| [source hygiene](../../scripts/source-hygiene.test.ts) | No owner above the hard ceiling and none above the review target without a recorded narrow justification. |
| [document reviewability](../../scripts/document-reviewability.test.ts) | A new scenario family directory must be linked from its registry README and each scenario document from its family README, and this section must keep naming resolvable guards and owners with recomputed headroom. |

**One Lean cost constraint applies before any full build**, and it is stated without a figure because no measurement of it exists in this repository. Every kernel-decided fixture downstream of a dispatcher re-reduces the branch this capsule adds to `fire?`, which is the mechanism [PLAN.md](../PLAN.md#exact-resume-point) records with its literal commands. Build one narrow target and measure it before any full `./scripts/lake.sh build` or `./scripts/lake.sh test`, and measure resident memory alongside CPU rather than concluding affordability from CPU alone.

## Stop conditions

Stop for owner direction if:

- the profile would need a wait-set shape the host capability predicate rejects;
- the one-sided join turns out to be ambiguous in an admitted state, which forces an explicit occurrence record;
- the coalesced fail-closed path cannot durably resolve its in-flight Update and would strand the caller;
- the `hasSignals === false` premise does not hold for a `doUpdate`-plus-timer activation in the pinned SDK;
- a corpus fixture would require admitting `timeCycle`, repeated firing, or a boundary flow merging back into the main flow;
- a new CMOF fact or CIB observation is required;
- Clause 10.5.6's direct grant of the continuing-Activity behavior to lexical `false` is refuted, which would remove this capsule's normative basis rather than only the sibling's shared reading.

## Owner decisions required

1. **Approve the selection** of a non-interrupting boundary Timer on a User Task as the next capsule, against the recorded alternatives.
2. **Approve the one new operation** `awaitMonitoredUserTask` rather than a flag on `awaitBoundedUserTask` or sibling waits, accepting a third boundary-timer operation kind sharing one arm shape.
3. **Approve the one-sided join** and the no-runtime-record decision, accepting that a later repetition capsule may have to add an explicit occurrence record.
4. **Approve the inverted admission** that rejects an omitted `cancelActivity` and lexical `true`, so neither sibling profile's source is admissible to the other.
5. **Approve the two-schedule evidence set**, with the reverse completion order covered in the focused core test rather than as a third registered scenario.
6. **Approve the standards-only boundary** with no CIB relationship and no phase-zero probe unless a stop condition fires.
