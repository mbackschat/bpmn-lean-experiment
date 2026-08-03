# Interrupting Activity boundary Timer proposal

## Status

**Proposed; not owner-approved and not implemented.** No implementation may begin before the owner records approval in this section and the independent cold proposal review below is approved. Nothing in this document is a coverage, conformance, or CIB compatibility claim.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `f241234` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The semantic checkpoint is `not-reached` rather than `not-required`: this capsule changes a wire contract, the checked graph and Semantic Process IL, a transition family, and adapter host-capability admission, so the conditional checkpoint is mandatory once a first green implementation exists. The immutable proposal target is `f241234`, which contains the complete proposed contract. This receipt-recording commit adds no substantive content and is therefore outside the reviewed range.

## Question

What is the smallest bounded slice that gives an Activity occurrence a deadline: one interrupting Timer Boundary Event attached to one User Task, where the Timer firing abandons the Activity and follows the boundary route, and the Activity's own completion withdraws the Timer?

## Selection basis

Boundary Event is the largest structural family in the pinned CIB Seven `2.2.0` corpus with no closed reviewed slice of its own, at 298 files and 394 occurrences. The [breadth refresh](../research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#boundary-event-candidate-split) decomposes it and reports an interrupting Timer attached to a User Task at 25 files and 29 occurrences, with interruption the dominant corpus shape at 337 of 394 occurrences.

The selection reason is mechanism leverage, not prevalence. Compensation carries the single largest combination at 39 files but requires completed-work registration, context snapshots, and reverse-order invocation. Error boundaries are already closed on Service Task and Sub-Process hosts. This candidate is the largest boundary combination whose every host mechanism already exists.

Fixture prevalence is a scheduling signal only. It is not evidence that this profile executes, and this capsule selects no CIB relationship on lexical grounds.

## Normative basis

BPMN 2.0.2 is the sole semantic authority for this capsule.

- Clause 10.5.6 and Table 10.91 own `BoundaryEvent`, its `attachedToRef`, and `cancelActivity`, whose metamodel default is `true`.
- Clause 13.5.4 owns catching intermediate Boundary Event behavior: while the Activity is active the Event may occur, an interrupting Event ends the Activity, and the flow continues from the Boundary Event.
- Clause 10.5.5 and Tables 10.101 and 10.122 own `TimerEventDefinition.timeDuration`, already admitted at exactly `PT1S` by the [Intermediate Catch Timer specification](INTERMEDIATE-CATCH-TIMER-SPEC.md).
- Clause 13.3.2 owns the Activity lifecycle whose active state the deadline observes.

The ledger requirement is new: `BPMN-BOUNDARY-TIMER-01`. It must be added to [the requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) together with this capsule, and `BPMN-MECH-EVENT-01` must cite it as a closed reviewed slice only at graduation, because the [closed-slice guard](../TESTING-SPEC.md#default-verification) then requires a decided disposition.

## Selected account and the competing accounts it rejects

The distinct new proposition is a **wait whose lifetime is bound to an Activity occurrence rather than to a token on normal flow**. Three accounts can express it.

1. **Reuse `awaitEventRace` by widening its arms.** Rejected. Its two arms are catch Events reached over non-token-carrying configuration Flows, and its `message`/`timer` field names are load-bearing. A User Task arm is an Activity on a real token-carrying Flow with its own normal outgoing Flow. Widening the arms into a union would weaken exact field information for the existing profile and would make an Event-Based Gateway representable with an Activity candidate, which no reviewed account admits.
2. **Lower the boundary Timer to a separate `awaitTimer` beside `awaitUserTask` and let the token split express concurrency.** Rejected. It makes the two waits siblings with no owner, so nothing in the program states that Timer firing must cancel the task or that task completion must withdraw the Timer. It also produces exactly the token-split-plus-Timer shape the Temporal host capability predicate rejects as `concurrentHostDrivenWaits`, and that rejection would be correct: the deadline would not be a semantic relation, only two independent waits.
3. **Add one operation that owns the Activity and its boundary deadline together.** Selected.

The selected contract mirrors the Event-Based Gateway's named-arm discipline so candidate order stays unrepresentable, while keeping the asymmetry explicit:

```ts
type AwaitBoundedUserTaskOperation = DeepReadonly<
  OperationBase & {
    kind: "awaitBoundedUserTask";
    input: string;
    task: {
      elementId: string;
      name: string | null;
      output: string;
    };
    boundaryTimer: {
      elementId: string;
      durationMs: 1000;
      output: string;
      origin: {
        kind: "bpmnElement";
        boundaryEventId: string;
        sequenceFlowId: string;
      };
    };
  }
>;
```

`input` is the Activity's incoming Flow. `task.output` is the Activity's normal outgoing Flow and `boundaryTimer.output` is the boundary Sequence Flow; the two must be distinct. The asymmetry is in the field names, not in a mode flag: this operation is not symmetric between its arms, because only the Timer arm interrupts.

`awaitUserTask` and `awaitTimer` remain unchanged and must not acquire boundary behavior. A boundary-attached Timer is never represented as a standalone `awaitTimer`.

## Exact source profile

One new immutable standards-only profile, proposed identity `standards-activity-boundary-timer-draft`. It admits exactly:

```text
None Start → User Task ──normal──→ None End A
                 │
        (boundary Timer PT1S, interrupting)
                 │
                 └──boundary──→ None End B
```

- one private executable Process with `isExecutable="true"`;
- one User Task with exactly one incoming and one outgoing Sequence Flow;
- one Boundary Event whose `attachedToRef` resolves to that User Task;
- `cancelActivity` omitted or lexically `true`; lexical `false` is **rejected** as the retained hostile control, because non-interrupting behavior is a separate proposition;
- exactly one Timer Event Definition containing exactly one `timeDuration` whose exact lexical value is `PT1S`;
- exactly one outgoing boundary Sequence Flow and no incoming boundary Flow;
- two distinct None End Events, so the two routes are distinguishable at the public observation boundary;
- no other executable extension content.

Two distinct End Events are load-bearing. A shared End Event would make the interrupting and completing traces agree on every public observation, and the capsule would then have no separating witness at its approved boundary.

Admission rejects a missing or unresolvable `attachedToRef`, an `attachedToRef` naming a non-Activity, `cancelActivity="false"`, a second Boundary Event, a non-Timer Event Definition, a second Timer Event Definition, any duration other than `PT1S`, an incoming boundary Flow, and a shared End Event.

The source compiler manifest adds only the CMOF facts this profile consumes. `BoundaryEvent.attachedToRef`, `BoundaryEvent.cancelActivity`, and the `BoundaryEvent` class are already admitted by the [boundary-error specification](BOUNDARY-ERROR-SPEC.md); `TimerEventDefinition.timeDuration` is already admitted by the Intermediate Catch Timer specification. The proposal expects **no new CMOF fact**, and a discovered new fact is a finding to record rather than a silent manifest addition.

## Checked graph and lowering

The checked graph gains one closed Timer Boundary Event node variant carrying the boundary event identity, the resolved attachment target identity, the exact retained `PT1S` literal, and the boundary Sequence Flow identity. The existing checked User Task, Timer Event, End Event, and Sequence Flow variants remain unchanged.

The boundary Sequence Flow **is** a token-carrying control place, unlike the Event-Based Gateway's configuration Flows: a token appears on it when the Timer wins. The disjoint Flow classification that capsule introduced therefore keeps every Flow of this profile in the ordinary `ControlPlace.origin` arm, and the proposal adds no second exception. This must be stated as an explicit lowering fact rather than left implicit, because the nearby Event-Based Gateway precedent is the opposite.

Lean independently lowers the checked graph and requires exact equality with the received program. Retaining the exact `PT1S` literal in checked source is what lets Lean normalize it to `1000` independently rather than trusting the TypeScript compiler's arithmetic.

## Runtime state

No new runtime collection is proposed. The existing task and timer wait families already carry complete occurrence identity, and the operation supplies the ownership relation that the Event-Based Gateway needed a hidden record for.

This is a deliberate difference from `EventRace` and the reviewer must test it. The claim is that a boundary Timer occurrence and its host task occurrence are recoverable from the committed program plus the two waits, because the profile admits exactly one Activity with exactly one boundary Timer, so `boundaryEventId` plus the owning scope determines the pair. **If the reviewer can construct an admitted state where two live waits are ambiguous about ownership, that refutes this decision and the capsule must add an explicit occurrence record.** The nearest such state is a repeated or Multi-Instance Activity, which this profile excludes; a later capsule that admits repetition must revisit this.

Both waits belong to one live scope occurrence, and either arm's victory removes both. Monotonic activation counters are preserved on interruption, exactly as the Sub-Process Error propagation capsule established.

## Proposed semantic rules

### `ABTIMER-ARM-01` — arm the Activity and its deadline atomically

Reaching the operation atomically activates the User Task occurrence and creates the boundary Timer occurrence with deadline `1000` logical milliseconds from the arming instant. Neither exists without the other; a state with one and not the other is invalid, not a resumption surface.

### `ABTIMER-COMPLETE-01` — Activity victory withdraws the deadline

Completing the exact active task occurrence removes both the task occurrence and the boundary Timer occurrence, produces one token on `task.output`, and never produces a boundary token.

### `ABTIMER-INTERRUPT-01` — deadline victory abandons the Activity

Firing the exact boundary Timer occurrence at its exact deadline removes both the task occurrence and the Timer occurrence, produces one token on `boundaryTimer.output`, produces no token on `task.output`, and cancels the Activity's live runtime state while preserving monotonic activation counters.

### `ABTIMER-REFUSE-01` — losers and wrong identities preserve state exactly

After either victory, the sibling stimulus is ineligible and rejected with exact state preservation. A wrong task occurrence, wrong timer occurrence, pre-due firing, or wrong deadline is rejected with exact state preservation, reusing the existing full-identity and exact-time refusal rules rather than restating them.

### `ABTIMER-OBSERVE-01` — project only the existing wait surfaces

The armed state publishes exactly one open User Task and one open Timer through the existing four-kind canonical ordering and exactly one enabled completion interaction. The capsule adds no observation field, no wait kind, and no stimulus kind.

## Laws, non-laws, and separating witnesses

Required Lean content, all with exact hypotheses:

- a declarative arming relation and a two-constructor victory relation, both distinct from the evaluator;
- soundness from every evaluator-produced arming and victory transition to that relation;
- a quantified exclusivity law: one victory removes both waits and makes the sibling stimulus ineligible;
- a quantified interruption law: the interrupting arm produces the boundary token and no normal token;
- exact state-preservation laws for wrong and stale identities;
- the nearest **checked non-law**: it is *not* a law that the boundary token is produced whenever the deadline is reached, because task completion committed at the same logical instant removes the Timer first under the capsule's explicit victory order. The finite witness must exhibit that state rather than assert the non-law in prose.

Two schedules over one definition:

| Case | Stimulus | Required outcome | Required loser check |
|---|---|---|---|
| Activity wins | exact task completion before deadline `1000` | token reaches End A; logical time `0`; no timer remains | stale exact Timer firing rejects and preserves that state |
| Deadline wins | exact Timer firing at deadline `1000` | token reaches End B; logical time `1000`; no task remains | stale exact task completion rejects and preserves that state |

Both schedules must terminate at distinct End Events, so the traces differ at the approved public observation boundary rather than only in hidden order.

Required mutations, each of which must be detected: an implementation that leaves the loser wait; one that produces both tokens; one that routes interruption to `task.output`; one that fires before the deadline; and one that erases the boundary Sequence Flow identity so both routes lower to the same output.

## Temporal hosting and refinement preflight

This preflight is a feasibility and information-preservation review, not evidence that the adapter refines the core.

**Durable mechanisms needed.** Task completion remains the existing Update; Timer firing remains the existing deterministic `fireTimer` stimulus derived from one durable Temporal timer; all semantic mutation remains in the single Workflow loop. No Activity, Child Workflow, Signal, Continue-As-New, or public cancellation command is added.

**The state relation.** The immutable admitted program plus complete core state pairs with one Workflow-local durable Timer handle derived only from the committed boundary Timer occurrence, plus the existing accepted-stimulus and result ledgers. Only the core decides whether a ready stimulus wins, rejects, or leaves state unchanged. Canonical Query projects only the core observation.

**The load-bearing risk, named exactly.** The Event-Based Gateway capsule established that pinned Temporal Core sorts Signal **and Update** activation jobs before ordinary jobs such as Timer firing. A User Task completion Update and this boundary Timer's firing are therefore exactly the same coalescing hazard, with Update in place of Signal: if both become ready in one activation, raw job order is not a safe proxy for first physical occurrence, and this profile defines no portable winner. The proposal reuses the existing two-phase activation-tag and job-drain-barrier detector and fails closed with a typed adapter `ApplicationFailure` before calling the core with either callback. **It must not reuse the `BpmnEventRaceOrderingUnavailable` failure identity**, because that identity names the Event-Based Gateway race; a distinct typed identity keeps the two host classes separately falsifiable.

Reusing that detector is the single largest reuse claim in this proposal and the reviewer should attack it directly. The detector was written for a Signal arm; the Update arm additionally carries a *reply* to a waiting caller, so an Update that loses the race must resolve to a semantic rejection rather than an infrastructure failure, and the fail-closed path must not leave an Update handler unresolved. If that cannot be preserved, the correct outcome is to route it back to profile review rather than to let the adapter invent a winner.

**Host capability.** `awaitBoundedUserTask` is neither passive, an ordinary token split, nor an uncoordinated host-driven wait. The exhaustive operation-kind classifier in [`host-admission.ts`](../../packages/temporal-adapter/src/host-admission.ts) adds one class, admits exactly one such operation with no token split, no other host-driven wait, and no managed event race, and continues rejecting every other composition before Workflow start. A mutation omitting the new operation from the classifier must fail that guard, and the classifier's `never` check must force the new kind to be handled.

**Smallest executable refinement witness.** Three disposable histories, all replayed in the same gate: a completion history where the task Update commits before the deadline and the durable Timer is *canceled* with no firing; an interruption history where the Worker is stopped across the deadline, a replacement Worker commits Timer victory, and a later completion Update is durably resolved as rejected; and a coalesced history where the Worker is stopped until both callbacks are ready and replacement processing fails closed before semantic advancement. The completion history must contain Timer started plus canceled and no Timer fired; the interruption history must contain Timer started plus fired and no cancellation. No history may contain Activity, Child Workflow, effect, or Workflow-cancellation events.

## Required, optional, and excluded

**Required.** The source profile, checked graph and lowering, the one new operation, the five rules, the Lean relation/evaluator/soundness/laws/non-law, the independent TypeScript core, the new host capability class, one registered answer-free scenario per schedule with seeded mutations, and the three Temporal histories.

**Optional.** Time-skipping calibration, as for the Intermediate Catch Timer; the full local-server witness remains the mandatory refinement gate.

**Excluded.** Non-interrupting boundary Timers; boundary Timers on Service Task, Sub-Process, Call Activity, Transaction, or Receive Task hosts; cycle and date timer forms; any duration other than `PT1S`; multiple Boundary Events on one Activity; Message, Error, Escalation, Signal, Conditional, Cancel, and Compensation boundary triggers; repeated or Multi-Instance Activities; boundary Events on a Sub-Process boundary reached by propagation; general Activity cancellation or a public cancel command; incidents; CIB Seven compatibility evidence; and A12 adoption.

## CIB relationship

**None selected.** BPMN 2.0.2 resolves this account without ambiguity, no admitted source needs a `camunda:*` extension, the Temporal mapping needs no engine observation, and no downstream blocker remains after the standard mechanism exists. Under the [CIB on-demand gate](../PLAN.md#cib-on-demand-gate) all five questions answer no, so this capsule adds no CIB profile surface and registers no relationship. The pinned corpus supplied only the scheduling signal above.

If implementation discovers a public observation this profile cannot produce without an engine-specific choice, that is a stop condition and a phase-zero probe obligation, not a silent overlay.

## Common-mode risks

- **One assumption shared by all four targets.** Every target derives the deadline from the same committed `durationMs: 1000` and the same arming instant. If the arming instant is wrong, all four agree and are all wrong. The mitigation is the existing pre-due firing refusal plus a seeded deadline mutation, both of which discriminate the arming instant rather than the arithmetic.
- **Reused refusal rules.** `ABTIMER-REFUSE-01` reuses the existing full-identity refusal implementation. Two lanes that share that implementation are one lane, not two, so the capsule may not count Lean and TypeScript refusal as uncorrelated evidence where both call the same reused predicate.
- **The detector reuse.** If the coalescing detector is reused unchanged, a defect in it fails both capsules together; the distinct typed failure identity above is the minimum separation.

## Versioning consequences

Pre-release policy applies: the new operation kind is added atomically across the checked-graph compiler, Semantic Process contract, JSON Schemas, Lean decoder and lowering, semantic core, adapter classifier, differential catalog, and every fixture, with no compatibility reader, format counter, or migration branch. No retained Event History is kept beyond the disposable gate.

## Stop conditions

Stop for owner direction if the profile would need a wait-set shape the host capability predicate rejects; if the Update-arm coalescing behavior cannot preserve a semantic rejection for a losing Update; if ownership of the two waits turns out to be ambiguous in an admitted state; if a new CMOF fact or CIB observation is required; or if `cancelActivity="false"` would have to be admitted to obtain a corpus fixture.

## Owner decisions required

1. **Approve the selection** of interrupting boundary Timer on a User Task as the next capsule, against the recorded alternatives.
2. **Approve the one new operation** rather than widening `awaitEventRace` or lowering to sibling waits.
3. **Approve the no-runtime-record decision**, accepting that a later repetition capsule may have to add one.
4. **Approve the standards-only boundary** with no CIB relationship and no phase-zero probe unless a stop condition fires.
