# Interrupting Activity boundary Timer proposal

## Status

**Owner-approved on 2026-08-03; partially implemented.** The implemented and absent scope is recorded in [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md#current-claim); no Temporal lane exists. The owner approved all four decisions below as recommended, after the independent cold proposal review returned `approve-with-required-edits` and both correction rounds passed the same reviewer's audit. Nothing in this document is a coverage, conformance, or CIB compatibility claim, and approval authorizes exactly the scope recorded here.

Implementation must pause for the conditional semantic-checkpoint review at its first green Lean and semantic-core checkpoint, because this capsule changes a wire contract, the checked graph and Semantic Process IL, a transition family, and adapter host-capability admission. This document remains a `-PROPOSAL` until the implemented contract graduates.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `fcdd7fb` | `fork-turns-none` | `approve-with-required-edits` | `e37c018` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The semantic checkpoint is `not-reached` rather than `not-required`: this capsule changes a wire contract, the checked graph and Semantic Process IL, a transition family, and adapter host-capability admission, so the conditional checkpoint is mandatory once a first green implementation exists. The immutable proposal target is `fcdd7fb`. Three earlier commits are deliberately **not** the target: `f241234` carried two wrong normative clause numbers; `661b0ce` still claimed two distinct End Events as the separating witness even though the canonical observation exposes no terminal element; and `d63be53` still stated the non-law in terms of a victory order this capsule does not define for host simultaneity. All three were corrected before review rather than after it.

The review returned ten required findings. Corrections ran in two same-reviewer rounds: `109c212` closed all ten and introduced four new defects, and `e37c018` closed those four. The audit column names `e37c018` as the final audited correction. One mechanical follow-up the second audit raised is applied here — the `ABTIMER-ARM-01` evidence row no longer attributes boundary registration to a handling-only clause, and the arming instant is recorded as a project interpretation because Clause 13.5.2 starts waiting when an Intermediate Event is reached and a Boundary Event never is.


## Question

What is the smallest bounded slice that gives an Activity occurrence a deadline: one interrupting Timer Boundary Event attached to one User Task, where the Timer firing abandons the Activity and follows the boundary route, and the Activity's own completion withdraws the Timer?

## Selection basis

Boundary Event is the largest structural family in the pinned CIB Seven `2.2.0` corpus with no closed reviewed slice of its own, at 298 files and 394 occurrences. The [breadth refresh](../research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#boundary-event-candidate-split) decomposes it and reports an interrupting Timer attached to a User Task at 25 files and 29 occurrences, with interruption the dominant corpus shape at 337 of 394 occurrences.

The selection reason is mechanism leverage, not prevalence. Compensation carries the single largest combination at 39 files but requires completed-work registration, context snapshots, and reverse-order invocation. Error boundaries are already closed on Service Task and Sub-Process hosts. This candidate is the largest boundary combination whose every host mechanism already exists.

Fixture prevalence is a scheduling signal only. It is not evidence that this profile executes, and this capsule selects no CIB relationship on lexical grounds.

## Normative basis

BPMN 2.0.2 is the sole semantic authority for this capsule.

- Clause 10.5 Table 10.91 owns the Boundary Event attributes, and Table 10.92 owns the legal `cancelActivity` values per trigger. The same two tables are already cited by the [boundary-error specification](BOUNDARY-ERROR-SPEC.md), which is why this capsule cites tables rather than a `10.5.x` sub-clause number.
- Clause 10.5.6 fixes what interrupting means: “An interrupting boundary Event is defined by a *true* value of its cancelActivity attribute.”
- The machine-readable artifacts fix the default. `Semantic.xsd` declares `<xsd:attribute name="cancelActivity" type="xsd:boolean" default="true"/>`, and `BPMN20.cmof` declares `BoundaryEvent-cancelActivity` with `default="true"`.
- Clause 13.5.3, *Intermediate Boundary Events*, owns the behavior and fixes an exact three-step order: handling first consumes the Event occurrence, then cancels the attached Activity when `cancelActivity` is set, and then follows the Sequence Flow connected to the Boundary Event.
- Clause 10.5.5 and Table 10.101 own `TimerEventDefinition.timeDuration`, with Table 10.122 as its XML Schema, already admitted at exactly `PT1S` by the [Intermediate Catch Timer specification](INTERMEDIATE-CATCH-TIMER-SPEC.md).
- Clause 13.3.2 owns the Activity lifecycle whose active state the deadline observes.

The omitted `cancelActivity` form is admitted **because it resolves to `true`** under the machine-readable default, not as a tolerated variant. This distinction is load-bearing and must not be inherited from the boundary-error precedent: Table 10.92 makes `true` the only legal value for an Error trigger, so that capsule's admission of an omitted attribute needs no default, whereas Table 10.92 lists `true`/`false` for a Timer and the default is the only fact that settles omission.

Clause 13.5.3's phrase “if the attribute is not set, the Activity continues execution (only possible for Message, Signal, Timer, and Conditional Events)” must therefore be read as *not set to `true`*. Read literally as *absent*, it would make an omitted attribute non-interrupting for a Timer and would contradict both the schema default and Clause 10.5.6. The capsule records that reading explicitly rather than relying on it silently.

Table 10.92 listing `true`/`false` for a Timer also means excluding non-interrupting behavior below is a deliberate scope decision about a legal BPMN shape, not the rejection of an invalid one. Table 10.91 names the association `attachedTo` in prose while the CMOF and XSD name is `attachedToRef`; the profile admits the machine-readable name, which the boundary-error capsule already consumes.

The ledger requirement is new: `BPMN-BOUNDARY-TIMER-01`. It is deliberately **not** added by this proposal; it is added to [the requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) together with the implementation, and `BPMN-MECH-EVENT-01` cites it as a closed reviewed slice only at graduation, because the [closed-slice guard](../TESTING-SPEC.md#default-verification) then requires a decided disposition. That guard is one-directional, so nothing currently fails from the identifier's absence.

## Selected account and the competing accounts it rejects

The distinct new proposition is a **wait whose lifetime is bound to an Activity occurrence rather than to a token on normal flow**. Three accounts can express it.

1. **Reuse `awaitEventRace` by widening its arms.** Rejected. Its two arms are catch Events reached over non-token-carrying configuration Flows, and its `message`/`timer` field names are load-bearing. A User Task arm is an Activity on a real token-carrying Flow with its own normal outgoing Flow. Widening the arms into a union would weaken exact field information for the existing profile and would make an Event-Based Gateway representable with an Activity candidate, which no reviewed account admits.
2. **Lower the boundary Timer to a separate `awaitTimer` beside `awaitUserTask` and let the token split express concurrency.** Rejected. It makes the two waits siblings with no owner, so nothing in the program states that Timer firing must cancel the task or that task completion must withdraw the Timer. It also produces exactly the token-split-plus-Timer shape the Temporal host capability predicate rejects as `concurrentHostDrivenWaits`, and that rejection would be correct: the deadline would not be a semantic relation, only two independent waits.
3. **Add one operation that owns the Activity and its boundary deadline together.** Selected.

The selected contract mirrors the Event-Based Gateway's named-arm discipline so candidate order stays unrepresentable, while keeping the asymmetry explicit:

```ts
type AwaitBoundedUserTaskOperation = OperationBase & DeepReadonly<{
  kind: SemanticOperationKind.AwaitBoundedUserTask;
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
    origin: BpmnSequenceFlowOrigin;
  };
}>;
```

`input` is the Activity's incoming control place. `task.output` is the control place for the Activity's normal outgoing Sequence Flow and `boundaryTimer.output` is the control place for the boundary Sequence Flow; the two must be distinct. `boundaryTimer.origin` records that boundary Flow's BPMN provenance in the same shape `awaitEventRace` uses, because control-place identity and BPMN element identity are separate namespaces.

`boundaryTimer.elementId` **is** the Boundary Event identity, and it is the element published as the timer occurrence's `elementId` in `openTimers`. The arm carries no second `boundaryEventId`: two fields that both denote the Boundary Event would make a disagreeing pair representable, and no existing operation does that — `BpmnErrorRoute` carries only `origin.boundaryEventId`, while `awaitEventRace`'s `timer.elementId` and `configurationOrigin` deliberately denote *different* elements. Because this identity is publicly observable, it is a profile decision rather than an internal choice.

The asymmetry is in the field names, not in a mode flag: this operation is not symmetric between its arms, because only the Timer arm interrupts.

`awaitUserTask` and `awaitTimer` remain unchanged and must not acquire boundary behavior. A boundary-attached Timer is never represented as a standalone `awaitTimer`.

## Exact source profile

One new immutable standards-only profile, registered identity `bpmn-2.0.2-activity-boundary-timer-draft`. It admits the following shape:

```text
None Start → Bounded User Task ──normal──→ Normal User Task → None End A
                    │
           (boundary Timer PT1S, interrupting)
                    │
                    └──boundary──→ Boundary User Task → None End B
```

**The profile pins a shape class, not this one diagram.** Admission compares an exact checked-node multiset, an exact operation multiset, and generic graph reachability, and none of those can pin an attachment *reference*. A source that attaches the deadline to the follow-on User Task instead of the diagrammed one therefore satisfies every admission gate and yields a well-formed bounded process in which that task is the bounded one. This is an exactness limit of multiset-plus-graph admission rather than an unsound program, and it is recorded here instead of claimed away; constraining the attachment structurally is excluded from this capsule.

- one private executable Process with `isExecutable="true"`;
- exactly one None Start Event with no Event Definition and exactly one outgoing Sequence Flow;
- exactly five Sequence Flows and exactly seven Flow Nodes: the None Start Event, the bounded User Task, the Boundary Event, the two follow-on User Tasks, and the two None End Events. The Boundary Event is counted because CMOF derives `BoundaryEvent` from `CatchEvent` and `Event`, whose superclasses include `FlowNode`;
- no parser warning of any kind, which remains admission-blocking;
- one bounded User Task with exactly one incoming and one outgoing Sequence Flow;
- one Boundary Event whose `attachedToRef` resolves to that bounded User Task;
- `cancelActivity` omitted or lexically `true`; lexical `false` is **rejected** as the retained hostile control, because non-interrupting behavior is a separate proposition;
- exactly one Timer Event Definition containing exactly one `timeDuration` whose exact lexical value is `PT1S`;
- exactly one outgoing boundary Sequence Flow and no incoming boundary Flow;
- two distinct follow-on User Tasks, one on each route, each with exactly one incoming and one outgoing Sequence Flow;
- two distinct None End Events;
- no other executable extension content.

**The distinct follow-on User Tasks are load-bearing, and the distinct End Events are not.** `StateObservation` exposes status, the four wait families, Process variables, enabled interactions, and logical time; it exposes no terminal element identity. Two routes that differ only in which None End Event they reach therefore produce the same public terminal observation, and an implementation that wrongly routed interruption to the Activity's normal output would still complete at logical time `1000` and be publicly indistinguishable. Publishing a distinct User Task on each route is what makes the route choice observable at the approved boundary, which is the same reason the [Event-Based Gateway profile](EVENT-BASED-GATEWAY-SPEC.md#exact-source-profile) gives each of its arms a distinct User Task. The two End Events are retained only for structural symmetry and are deliberately not claimed as a discriminator.

The resulting program inventory is one `initiate`, one `awaitBoundedUserTask`, two `awaitUserTask`, two `reachNoneEnd`, and one root `completeScope`. No standalone `awaitTimer` appears, because the boundary Timer is owned by the bounded operation.

Admission rejects a missing or unresolvable `attachedToRef`, an `attachedToRef` naming a non-Activity, `cancelActivity="false"`, a second Boundary Event, a non-Timer Event Definition, a second Timer Event Definition, any duration other than `PT1S`, an incoming boundary Flow, a missing follow-on task on either route, any additional Flow Node such as a third User Task or Gateway, any Sequence Flow count other than five, and any parser warning.

A shared End Event is also outside this exact profile and is rejected, but for exactness rather than for semantic reasons: it would not weaken the separating witness, which the follow-on tasks now carry. That rejection must not be defended in evidence as a discrimination requirement.

The source compiler manifest needs **no new CMOF fact**. `BoundaryEvent`, `attachedToRef`, and `cancelActivity` are already present from the [boundary-error specification](BOUNDARY-ERROR-SPEC.md), and `TimerEventDefinition` with `timeDuration` from the Intermediate Catch Timer specification; all five were confirmed present in `bpmn-2.0.2-semantic-process-metamodel.json` before this proposal was written. A fact that nevertheless turns out to be missing is a finding to record, not a silent manifest addition.

## Checked graph and lowering

The checked graph gains one closed Timer Boundary Event node variant carrying the boundary event identity, the resolved attachment target identity, the exact retained `PT1S` literal, and the boundary Sequence Flow identity. The existing checked User Task, Timer Event, End Event, and Sequence Flow variants remain unchanged.

The boundary Sequence Flow **is** a token-carrying control place, unlike the Event-Based Gateway's configuration Flows: a token appears on it when the Timer wins. The disjoint Flow classification that capsule introduced therefore keeps every Flow of this profile in the ordinary `ControlPlace.origin` arm, and the proposal adds no second exception. This must be stated as an explicit lowering fact rather than left implicit, because the nearby Event-Based Gateway precedent is the opposite.

Lean independently lowers the checked graph and requires exact equality with the received program. Retaining the exact `PT1S` literal in checked source is what lets Lean normalize it to `1000` independently rather than trusting the TypeScript compiler's arithmetic.

## Runtime state

No new runtime collection is proposed. The existing task and timer wait families already carry complete occurrence identity, and the operation supplies the ownership relation that the Event-Based Gateway needed a hidden record for.

This is a deliberate difference from `EventRace`, and it rests on one falsifiable claim: a boundary Timer occurrence and its host task occurrence are recoverable from the committed program plus the two waits, because the profile admits exactly one Activity with exactly one boundary Timer, so the Boundary Event identity plus the owning scope determines the pair. Atomic arming and atomic removal additionally keep the two occurrences' `activation` counters equal, so the recovery key is the complete occurrence pair rather than an element identity alone. An admitted state in which two live waits are ambiguous about ownership refutes the claim and forces an explicit occurrence record. The nearest such state is a repeated or Multi-Instance Activity, which this profile excludes; a later capsule that admits repetition must revisit this.

Both waits belong to one live scope occurrence, and either arm's victory removes both. Monotonic activation counters are preserved on interruption, exactly as the Sub-Process Error propagation capsule established.

Omitting the record has an adapter consequence that this capsule owns rather than inherits. The existing event-race scheduler keys on `state.eventRaces` to recognize a managed wait and to derive its durable timer identity, so with no record the adapter must instead join the committed `awaitBoundedUserTask` operation to the two live waits to know that a timer wait is a boundary deadline rather than an ordinary `awaitTimer`. That join is new derivation work, not detector reuse, and the implementation must not describe it as reuse.

## Proposed semantic rules

### `ABTIMER-ARM-01` — arm the Activity and its deadline atomically

Reaching the operation atomically activates the User Task occurrence and creates the boundary Timer occurrence with deadline `1000` logical milliseconds from the arming instant. Neither exists without the other; a state with one and not the other is invalid, not a resumption surface.

### `ABTIMER-COMPLETE-01` — Activity victory withdraws the deadline

Completing the exact active task occurrence removes both the task occurrence and the boundary Timer occurrence, produces one token on `task.output`, and never produces a boundary token.

The bounded task is completed by the ordinary completion command, whose stimulus carries `submittedValues`. This profile requires that list to be **empty** and admits no completion patch: variable submission is the separately reviewed [User Task completion-data specification](USER-TASK-COMPLETION-DATA-SPEC.md), and admitting it here would add a data proposition to a timing capsule. Both victory arms therefore leave the Process-variable surface empty, which is what the witness table asserts. A non-empty submission is rejected rather than silently ignored.

### `ABTIMER-INTERRUPT-01` — deadline victory abandons the Activity

Firing the exact boundary Timer occurrence at its exact deadline follows Clause 13.5.3's order: consume the Timer occurrence, cancel the attached Activity occurrence and its live runtime state while preserving monotonic activation counters, then produce one token on `boundaryTimer.output`. It produces no token on `task.output`.

Cancelling the Activity's live runtime state means removing the task occurrence and any Activity-local scope keyed to it. Under this profile a User Task owns no Activity-local scope, so the disposal obligation is stated for completeness and has no observable effect here; a later capsule that gives a bounded Activity local scope inherits the obligation rather than discovering it.

The three steps are one atomic transition with no observable intermediate state, as in the boundary-error capsule. The normative order is recorded because it is the reviewable claim, not because the implementation may expose it.

### `ABTIMER-REFUSE-01` — losers and wrong identities preserve state exactly

After either victory, the sibling stimulus is ineligible and rejected with exact state preservation. A wrong task occurrence, wrong timer occurrence, pre-due firing, or wrong deadline is rejected with exact state preservation, reusing the existing full-identity and exact-time refusal rules rather than restating them.

### `ABTIMER-OBSERVE-01` — project only the existing wait surfaces

The armed state publishes exactly one open User Task and one open Timer through the existing four-kind canonical ordering, and exactly one enabled completion interaction for the bounded task. After either victory the published follow-on task identity distinguishes the route. The capsule adds no observation field, no wait kind, and no stimulus kind.

## Laws, non-laws, and separating witnesses

Required Lean content, all with exact hypotheses:

- a declarative arming relation and a two-constructor victory relation, both distinct from the evaluator;
- soundness from every evaluator-produced arming and victory transition to that relation;
- a quantified exclusivity law: one victory removes both waits and makes the sibling stimulus ineligible;
- a quantified interruption law: the interrupting arm produces the boundary token and no normal token;
- exact state-preservation laws for wrong and stale identities;
- the nearest **checked non-law**: it is *not* a law that reaching logical time `1000` produces the boundary token, because an earlier committed completion stimulus has already withdrawn the Timer. Stimulus order is an explicit semantic input, so this is a statement about the core's sequential inputs and not about host simultaneity, which the preflight handles separately by failing closed. The finite witness must exhibit that state rather than assert the non-law in prose.

Three schedules over one definition:

| Case | Stimulus | Required stable state after the stimulus | Required follow-up check |
|---|---|---|---|
| Activity wins | exact bounded-task completion before deadline `1000` | only the normal follow-on User Task is published; no bounded task and no Timer remain; logical time `0` | stale exact Timer firing rejects and preserves that state |
| Deadline wins | exact Timer firing at deadline `1000` | only the boundary follow-on User Task is published; no bounded task and no Timer remain; logical time `1000` | stale exact bounded-task completion rejects and preserves that state |
| Pre-due firing | exact bounded Timer occurrence fired at `logicalTimeMs` `999` | rejected with exact state preservation; the armed state keeps both the bounded task and the Timer, and the deadline does not drift | the subsequent exact firing at `1000` still wins normally |

The pre-due row is not optional bookkeeping. Without it no registered schedule submits a pre-due firing, so an implementation mutated to accept an early firing would produce identical public observations on both victory schedules and its seeded mutation could never disagree. It is also the only witness that discriminates the *arming instant*, which is this capsule's largest common-mode exposure, and it cannot be inherited from the [Intermediate Catch Timer specification](INTERMEDIATE-CATCH-TIMER-SPEC.md): that capsule's identically shaped `999` witness arms its timer when a token reaches a catch Event, whereas this one arms on Activity activation.

The published follow-on task identity is the discriminator, and it differs at the approved observation boundary rather than in hidden order. Both schedules then complete their published follow-on task and reach the same empty wait, task, subscription, Timer, effect, variable, and interaction surfaces, differing only in logical time. A declaration-order-permuted source must preserve each schedule's complete trace.

Start closure is exactly two internal steps, `initiate` and `awaitBoundedUserTask`. The armed state has no internal transition and is resumable through its published task interaction, so it is stable and not stranded. Each victory enables exactly one follow-on `awaitUserTask`, and completing it closes through one `reachNoneEnd` and root `completeScope`. No newly reachable multiple-enabled internal state exists, and the capsule must executable-check that every newly reachable closure stays inside `semanticProcessClosureLimit`.

Required mutations, each of which must be detected at the public boundary: an implementation that leaves the loser wait; one that produces both tokens; one that routes interruption to `task.output`, which now publishes the wrong follow-on task; one that fires before the deadline; and one that erases the boundary Sequence Flow identity so both routes lower to the same output.

## Temporal hosting and refinement preflight

This preflight is a feasibility and information-preservation review, not evidence that the adapter refines the core.

**Durable mechanisms needed.** Task completion remains the existing Update; Timer firing remains the existing deterministic `fireTimer` stimulus derived from one durable Temporal timer; all semantic mutation remains in the single Workflow loop. No Activity, Child Workflow, Signal, Continue-As-New, or public cancellation command is added.

**The state relation.** The immutable admitted program plus complete core state pairs with one Workflow-local durable Timer handle derived only from the committed boundary Timer occurrence, plus the existing accepted-stimulus and result ledgers. Only the core decides whether a ready stimulus wins, rejects, or leaves state unchanged. Canonical Query projects only the core observation.

**The load-bearing risk, named exactly.** Pinned Temporal Core sorts Signal and Update activation jobs before ordinary jobs such as Timer firing, so a User Task completion Update and this boundary Timer's firing form the same coalescing *hazard* the Event-Based Gateway capsule addressed: if both become ready in one activation, raw job order is not a safe proxy for first physical occurrence, and this profile defines no portable winner. The proposal reuses that capsule's two-phase activation-tag and job-drain-barrier detector and fails closed with a typed adapter `ApplicationFailure` before calling the core with either callback. **It must not reuse the `BpmnEventRaceOrderingUnavailable` failure identity**, because that identity names the Event-Based Gateway race; a distinct typed identity keeps the two host classes separately falsifiable, and the adapter's typed failure-code contract must gain that member rather than overload an existing one.

**The premise differs, and inheriting it would be unsound.** The hazard transfers; the fact that licenses the barrier does not. The Event-Based Gateway capsule's premise is SDK flag `ProcessWorkflowActivationJobsAsSingleBatch`, backed by a direct-VM witness and a source lock. That flag is not the licensing fact for an Update arm. The installed pinned Worker computes single-batch processing as `hasSignals === false || activator.hasFlag(ProcessWorkflowActivationJobsAsSingleBatch)`, and `hasSignals` counts only `signalWorkflow` jobs. An Update arrives as a `doUpdate` job, so for an Update-plus-Timer activation `hasSignals` is `false` and single-batch processing holds **unconditionally, independent of the flag**.

That is a stronger premise than the Event-Based Gateway's, but it is a *different* one, and it is the specific thing this capsule may not assume. A fourth focused witness is therefore required: a direct-VM activation seeding one `doUpdate` job and one timer-fire job into one non-replay activation of the production Workflow, proving both callbacks accumulate before any core advancement, together with a source lock over the `hasSignals` predicate itself so a pinned-SDK change that begins counting `doUpdate` fails the lock rather than silently invalidating the barrier.

The distinct typed failure identity separates the two capsules' *failures*; only this witness separates their *premises*. Without it, a defect in the shared barrier would be invisible in both capsules at once, which is this capsule's real common-mode exposure.

**Two distinct Update obligations.** The Update arm additionally carries a reply to a waiting caller, and the coalescing design splits that into two obligations that must not share one name:

1. a **sequential** losing Update, delivered in its own activation after the Timer already won, must resolve as a semantic rejection rather than an infrastructure failure;
2. the **coalesced** fail-closed path adjudicates neither arm, so no Update loses there; its obligation is that the in-flight Update is durably resolved rather than left stranded while the Workflow fails.

Conflating them would make it undecidable whether the coalesced history is evidence of correct behavior or of a stop condition firing, so each obligation is attached to its own history below. If obligation 2 cannot be met, the correct outcome is to route it back to profile review rather than to let the adapter invent a winner.

**Host capability.** `awaitBoundedUserTask` is neither passive, an ordinary token split, nor an uncoordinated host-driven wait. The exhaustive operation-kind classifier in [`host-admission.ts`](../../packages/temporal-adapter/src/host-admission.ts) adds one class, admits exactly one such operation with no token split, no other host-driven wait, and no managed event race, and continues rejecting every other composition before Workflow start. A mutation omitting the new operation from the classifier must fail that guard, and the classifier's `never` check must force the new kind to be handled.

**Smallest executable refinement witness.** One direct-VM activation premise witness plus three disposable histories, all replayed in the same gate:

| Witness | Establishes | Required negative content |
|---|---|---|
| Direct-VM `doUpdate` + timer-fire activation | both callbacks accumulate before core advancement under the `hasSignals === false` premise; the `hasSignals` source lock holds | no core advancement from either callback alone |
| Completion history | the task Update commits before the deadline and the durable Timer is canceled | Timer started plus canceled, and no Timer fired |
| Interruption history | the Worker is stopped across the deadline, a replacement Worker commits Timer victory, and the later sequential completion Update resolves as a **semantic rejection** (obligation 1) | Timer started plus fired, and no cancellation |
| Coalesced history | the Worker is stopped until both callbacks are ready, replacement processing fails closed before semantic advancement, and the in-flight Update is **durably resolved rather than stranded** (obligation 2) | the typed failure is retained, and neither arm is adjudicated |

No history may contain Activity, Child Workflow, effect, or Workflow-cancellation events.

## Planned rule-to-evidence matrix

These are planned lanes, not results: no lane exists until implementation. Two lanes count as two only when their failure modes are uncorrelated, which is why the shared refusal predicate is marked once.

| Rule | BPMN/profile | Lean | Independent TypeScript | Temporal refinement | Negative witness or mutation |
|---|---|---|---|---|---|
| `ABTIMER-ARM-01` | Clause 13.3.2 for the Activity reaching Active; the arming instant itself is a project interpretation, since no clause fixes when a boundary Event's waiting begins (13.5.2's “reached” cannot apply to a Boundary Event) | declarative arming relation and evaluator soundness | atomic task-plus-timer creation | armed Query with one durable Timer started | partial-arm mutation creating one member without the other |
| `ABTIMER-COMPLETE-01` | Clause 13.5.3 normal continuation | quantified exclusivity law | victory removes both waits | completion history: Timer canceled, never fired | mutation that leaves the Timer wait live |
| `ABTIMER-INTERRUPT-01` | Clause 13.5.3 three-step order | quantified interruption law with counter preservation | boundary token only, no normal token | interruption history: Timer fired, no cancellation | mutation routing interruption to `task.output`, detected by the wrong published follow-on task |
| `ABTIMER-REFUSE-01` | exact-occurrence and exact-time refusal | state-preservation laws for wrong and stale identities | shared refusal predicate — **one lane, not two**, because Lean and the core call the same reused check | pre-due firing rejected with no deadline drift | pre-due firing at `999`; stale sibling after either victory |
| `ABTIMER-OBSERVE-01` | four-kind canonical ordering | projection agreement | published follow-on task identity distinguishes the route | canonical Query projects core state only | boundary-Flow identity erasure collapsing both routes to one output |

CIB Seven is deliberately absent from every row; see the CIB relationship section.

## Required, optional, and excluded

**Required.** The source profile, checked graph and lowering, the one new operation, the five rules with their evidence rows, the Lean relation/evaluator/soundness/laws/non-law, the independent TypeScript core, the new host capability class with its own typed adapter failure code, one registered answer-free scenario per schedule including the pre-due-firing case with seeded mutations, and the direct-VM premise witness plus the three Temporal histories.

**Optional.** Time-skipping calibration, as for the Intermediate Catch Timer; the full local-server witness remains the mandatory refinement gate.

**Excluded.** Non-interrupting boundary Timers; boundary Timers on Service Task, Sub-Process, Call Activity, Transaction, or Receive Task hosts; cycle and date timer forms; any duration other than `PT1S`; multiple Boundary Events on one Activity; Message, Error, Escalation, Signal, Conditional, Cancel, and Compensation boundary triggers; repeated or Multi-Instance Activities; boundary Events on a Sub-Process boundary reached by propagation; general Activity cancellation or a public cancel command; incidents; CIB Seven compatibility evidence; and A12 adoption.

## CIB relationship

**None selected.** BPMN 2.0.2 resolves this account without ambiguity, no admitted source needs a `camunda:*` extension, the Temporal mapping needs no engine observation, and no downstream blocker remains after the standard mechanism exists. Under the [CIB on-demand gate](../PLAN.md#cib-on-demand-gate) all five questions answer no, so this capsule adds no CIB profile surface and registers no relationship. The pinned corpus supplied only the scheduling signal above.

If implementation discovers a public observation this profile cannot produce without an engine-specific choice, that is a stop condition and a phase-zero probe obligation, not a silent overlay.

## Product-surface consequence

This capsule reaches the product command through example configuration and the existing driver, adding no product code, as the [runnable Temporal MVP specification](../RUNNABLE-TEMPORAL-MVP-SPEC.md) requires.

It also closes a recorded product-evidence gap rather than only adding a profile. The driver's precedence rule keeps waiting while a timer wait is open precisely so a host-resolved wait can withdraw an enabled interaction, but no current example declines an enabled interaction to let a timer win, so that arm is not product-reachable today. This profile makes both arms reachable from declared configuration alone: a plan answering the bounded task exercises Activity victory, and a plan that answers only the boundary follow-on task exercises deadline victory. Two example configurations over one definition therefore close the gap.

Both plans must still answer their follow-on task, so neither example ends in an observation-limit refusal.

## Common-mode risks

- **One assumption shared by all four targets.** Every target derives the deadline from the same committed `durationMs: 1000` and the same arming instant. If the arming instant is wrong, all four agree and are all wrong. This exposure is sharper than it first appears, because BPMN 2.0.2 does not fix the arming instant for a boundary Event at all: Clause 13.5.2 starts waiting when an Intermediate Event is *reached*, and a Boundary Event is never reached by a token, so arming on Activity activation is a project interpretation rather than a transcribed clause. The mitigation is therefore the capsule's own pre-due firing witness plus a seeded deadline mutation, which discriminate the arming instant rather than the arithmetic; no normative citation can substitute for them.
- **Reused refusal rules.** `ABTIMER-REFUSE-01` reuses the existing full-identity refusal implementation. Two lanes that share that implementation are one lane, not two, so the capsule may not count Lean and TypeScript refusal as uncorrelated evidence where both call the same reused predicate.
- **The detector reuse.** If the coalescing detector is reused unchanged, a defect in it fails both capsules together; the distinct typed failure identity above is the minimum separation.

## Versioning consequences

Pre-release policy applies: the new operation kind is added atomically across the checked-graph compiler, Semantic Process contract, JSON Schemas, Lean decoder and lowering, semantic core, the adapter's typed contract module and host-capability classifier, differential catalog, and every fixture, with no compatibility reader, format counter, or migration branch. No retained Event History is kept beyond the disposable gate.

### Owners this implementation grows

Nonblank headroom from `node scripts/what-binds.ts <path>...`. Every figure below is recomputed by [the reviewability guard](../../scripts/document-reviewability.test.ts) on each run and must equal the measured value, so changing an owner's size fails the gate and forces this inventory to be revisited. That is deliberate: a structural claim such as "this owner is full, extract first" holds only under a measurement, and recording the conclusion without re-deriving the measurement is what lets it outlive its own premise.

Each row therefore states the condition under which its consequence stops applying, rather than a bare instruction.

| Owner | Headroom | Consequence, and when it expires |
|---|---:|---|
| [adapter runner](../../packages/temporal-adapter/src/runner.ts) | 8 | Extract before adding any line here **while headroom stays under 40**. Not yet a confirmed change site: the generic `runRegisteredScenario` path already handles completion and timer stimuli, so this row expires unrequired if the adapter lane never grows this file. |
| [checked-graph lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 25 | **Expired.** The bounded-task lowering landed here and dropped headroom under 40, so the next family extracts this owner first. |
| [semantic core runtime](../../packages/semantic-core/src/semantic-process-runtime.ts) | 47 | Cleared from 5 by extracting [control-flow token transitions](../../packages/semantic-core/src/semantic-process-control-flow-runtime.ts) into their own owner. Re-expires under 40. |
| [Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 51 | Sufficient; already carries the new operation kind and checked node variant. Expires under 40. |
| [graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 179 | Sufficient. |
| [Lean program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 215 | Cleared from 12 by splitting the former combined definition decoder into [shared element decoders](../../BpmnSemantics/SemanticProcessJson/Elements.lean), [checked-process decoding](../../BpmnSemantics/SemanticProcessJson/CheckedProcess.lean), and this program owner. |
| [adapter typed contracts](../../packages/temporal-adapter/src/contracts.ts) | 354 | Sufficient. |
| [host capability classifier](../../packages/temporal-adapter/src/host-admission.ts) | 448 | Sufficient; already carries the bounded-wait class and its shared single-managed-operation check. |

Three owners were at or near the review target when this inventory was first derived, so this capsule crosses three extraction boundaries rather than one. Each extraction is a separate behavior-preserving commit, never work done under a size squeeze inside a semantic change; two have landed and the adapter runner remains.

The Lean split supersedes the boundary recorded in [the archived Lean comment-discipline proposal](../archived/LEAN-COMMENT-DISCIPLINE-PROPOSAL.md), which deliberately kept checked-process and program decoding in one owner and retained the shared element decoders there. That choice was sound at its size, and its substantive constraint is preserved: the shared decoders are still neither duplicated nor pushed into the wire-primitive support module. What changed is that the combined owner reached the review target while every future operation needs a clause in its program half, and the file already exposed exactly two public entry points, so the representation boundary was the split the code was already asking for.

### Guards and oracles this implementation must change or satisfy

These oracles already constrain the planned artifacts; none of them is new work invented by this capsule. Enumerate them again with `node scripts/what-binds.ts` before the first edit rather than from recall.

| Guard | Requirement it already places on this capsule |
|---|---|
| [product example configs](../../packages/temporal-adapter/test/product-example-configs.test.ts) | Every registered profile has a live example and every example names a registered profile. Two examples over one definition are admissible; a profile with none is not. |
| [document reviewability](../../scripts/document-reviewability.test.ts) | A new scenario family directory must be linked from its registry README, each scenario document from its family README, and this section must keep naming resolvable guards and owners. |
| [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts) | Every added profile, scenario, and retained-evidence artifact must be registered in the same change, with no unreferenced profile and no unregistered artifact. |
| [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | Every registered scenario needs exactly one pipeline case carrying a meaningful seeded semantic mutation. |
| [host admission](../../packages/temporal-adapter/test/host-admission.test.ts) | The bounded Activity wait must be classified against concurrent host-driven waits, including the race-plus-bounded shape that must stay rejected. |
| [BPMN XML validation](../../scripts/bpmn-xml-validation.test.ts) | The new fixture must validate against the pinned normative schema, with `cancelActivity` omitted rather than asserted. |
| [contract artifact projections](../../scripts/contract-artifact-projections.test.ts) | The new operation must project into the shared wire contracts and their JSON Schemas atomically. |
| [source hygiene](../../scripts/source-hygiene.test.ts) | No owner above the hard ceiling and none above the review target without a recorded narrow justification. |

## Stop conditions

Stop for owner direction if:

- the profile would need a wait-set shape the host capability predicate rejects;
- a **sequential** losing Update cannot resolve as a semantic rejection (obligation 1);
- the **coalesced** fail-closed path cannot durably resolve its in-flight Update and would strand the caller (obligation 2);
- the `hasSignals === false` premise does not hold for a `doUpdate`-plus-timer activation in the pinned SDK;
- ownership of the two waits turns out to be ambiguous in an admitted state;
- a new CMOF fact or CIB observation is required;
- `cancelActivity="false"` would have to be admitted to obtain a corpus fixture.

Structural stop conditions count as stop conditions. Every owner row above expires under its stated threshold, and an extraction this capsule asserted but never needed is a finding to record rather than work to perform: a full owner justifies extracting *before* growing it, never a conclusion that this capsule must grow it at all.

## Owner decisions required

1. **Approve the selection** of interrupting boundary Timer on a User Task as the next capsule, against the recorded alternatives.
2. **Approve the one new operation** rather than widening `awaitEventRace` or lowering to sibling waits.
3. **Approve the no-runtime-record decision**, accepting that a later repetition capsule may have to add one.
4. **Approve the standards-only boundary** with no CIB relationship and no phase-zero probe unless a stop condition fires.
