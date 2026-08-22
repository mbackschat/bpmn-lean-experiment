# Interrupting Activity boundary Timer specification

## Status

**Owner-approved on 2026-08-03; implemented and evidence-closed on 2026-08-04.** The implemented and absent scope is recorded in [`implementation-status-delegation:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md#interrupting-activity-boundary-timer) and deliberately not restated here, because a copied absence list goes stale as its lanes land and two earlier copies in this document did exactly that. Two closure reviews rejected earlier targets before the third approved; every verdict and its reason is in the receipt below. The owner approved all four decisions below as recommended, after the independent cold proposal review returned `approve-with-required-edits` and both correction rounds passed the same reviewer's audit. Nothing in this document is a coverage, conformance, or CIB compatibility claim, and approval authorizes exactly the scope recorded here.

The conditional semantic-checkpoint review that this capsule required at its first green Lean and semantic-core checkpoint has been performed and its corrections audited, and the closure review is complete; the receipt below records every stage. This document graduated from `-PROPOSAL` to `-SPEC` on the approved closure, so it is now the implemented current contract for this family rather than approved intent.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `fcdd7fb` | `fork-turns-none` | `approve-with-required-edits` | `e37c018` |
| Semantic checkpoint | `a176edb` | `fork-turns-none` | `approve-with-required-edits` | `d41861b` |
| Closure | `856e4eb` | `fork-turns-none` | `approve-with-required-edits` | `6a0d139` |

The mandatory semantic checkpoint was reviewed at immutable target `a176edb` against baseline `07dc925`. It returned ten required findings: a reachable unsound host path, a broken wire-contract atomicity invariant, a specified admission refusal that did not hold, and seven others. Corrections ran across `c4a0e22`, `d67d756`, `9b76d19`, `a85c5fb`, `c58bcd2`, `56553de`, `56afcaa`, and `d41861b`; the audit column names `d41861b`, where the same reviewer closed the last two required edits and found no new defect. The verdict cell keeps `approve-with-required-edits` because it records what the immutable target returned, not the state after correction — promoting it to `approve` would erase from this record that the stage was blocked. The complete-gate evidence for this stage is the 534-test run at `56afcaa` plus `36cb38f`; `d41861b` changed one comment block, whitespace inside one test function, and one documentation paragraph, and is governed by the executable guards. The immutable proposal target is `fcdd7fb`.

A closure review at `dee1a10` returned `reject`, and the verdict is recorded rather than retried: that commit was not a closure target. Nine blocking findings held. Three references in the profile artifact, both scenarios, the profile README, and the Lean fixture were wrong — `Clause 10.4.3` is XPath data usage, `Table 10.87` is Start Event attributes, and `Table 13.4 WCP-19` names a workflow pattern absent from BPMN 2.0.2 — a repeat of the class caught at `f241234`, now bound by an executable guard. A literal NUL byte in the scheduler source made the file binary to Git, so its 246 lines were absent from the review packet's own change inventory. Five owner documents stated facts false at that commit, including a claim that no Temporal lane existed and a self-contradiction about evidence lanes. The required Lean victory relation and quantified laws, one of three required scenarios, two of three required histories, and a named stop condition's witness were absent, and the absences were not recorded by the owner of absence. Those documentation and integrity findings are corrected. The Lean victory relations and quantified laws, the Worker-absence history, and the durable-Update witness that were absent at that commit have since landed, so the evidence gap that made a further checkpoint the sensible next boundary no longer exists; the remaining stale-identity law is deferred with a named blocker rather than absent-and-unrecorded. The next governed boundary is therefore a closure review, which is what [PLAN.md](../PLAN.md#exact-resume-point) records.

The receipt carries one row per stage because [the receipt form](../TESTING-SPEC.md#review-receipt) defines three stage labels and its executable parser rejects a repeated one; an added `Closure retry` label was refused by that guard rather than accepted as a local extension. The two rejected closure targets are therefore recorded here in full rather than as table rows, and nothing about them is lost: `dee1a10` and `51549a8` both returned `reject`, for the reasons stated in this section and the next.

The third closure review at `856e4eb` returned `approve-with-required-edits` across five findings, and the same reviewer audited five correction rounds before approving at `6a0d139`. Every finding across those rounds was a documentation-accuracy defect — a comparative or self-referential claim written without reading its referent — and none touched BPMN meaning, the profile, the checked graph or IL, runtime or public observation, admission, a transition family, a proof boundary, or a Temporal refinement claim. Two of them recurred *inside* corrections for the same mechanism, which is why the disposition for that mechanism is `unguardable` with [a reusable question](../PROCESS-ASSESSMENT-LEDGER.md#self-assessment-questions) rather than another paragraph of prose. Two durable guards came out of the same rounds: cost-ledger standings are now recomputed rather than asserted, and staleness-prone ordinal phrasing is rejected on sight. The reviewer's own complete-row sweep of the cost ledger bounded the last such defect as the only live one, and its proportionality finding — that this capsule stated one obligation in three places, which is what produced two rejections — is answered by collapsing each obligation to a single owner.

A second closure review at `51549a8` also returned `reject`, and that verdict is likewise recorded rather than retried in place. Both closure rows keep `reject` because each records what its immutable target returned; a later approval adds a row rather than overwriting one, so this record cannot lose that the stage was blocked twice. Five required findings held. Two items stayed in the Required list while recorded absent elsewhere — quantified stale-identity state preservation and a third replayed history — so the target could not be a closure while failing its own specification; both are now classified where they belong, the first as deferred with a named blocker and the second as an obligation whose evidence is two instrument-disjoint lanes rather than a history no server will produce. The results section was anchored to the rejected `dee1a10`, which precedes most of the evidence it listed. One lane denied a semantic-core test that the implementation map linked in the same commit. The cost row claimed the largest documentation figure in its ledger while the same table records a larger one, so the comparison was replaced with the full ranking. And this document contradicted [PLAN.md](../PLAN.md#exact-resume-point) about which governed stage came next. Correcting the Required classification changes this capsule's evidence strategy, so the next closure review is a newly spawned cold reviewer rather than a correction audit.

Two required edits corrected claims this capsule and its guards had overstated. A generalised schema-reachability test was described as an uncorrelated second detector although it shares its traversal with the coverage guard, so a seeded over-approximation in that shared helper turns both green on one mutation; that is the same shape as the wire-schema finding it was written to close. Admission was also described as leaving exactly one residual freedom; an independent probe confirmed that swapping which None End Event each route reaches is admitted with the deadline unchanged, so two freedoms compose into four admitted topologies. Three earlier commits are deliberately **not** the target: `f241234` carried two wrong normative clause numbers; `661b0ce` still claimed two distinct End Events as the separating witness even though the canonical observation exposes no terminal element; and `d63be53` still stated the non-law in terms of a victory order this capsule does not define for host simultaneity. All three were corrected before review rather than after it.

The review returned ten required findings. Corrections ran in two same-reviewer rounds: `109c212` closed all ten and introduced four new defects, and `e37c018` closed those four. The audit column names `e37c018` as the final audited correction. One mechanical follow-up the second audit raised is applied here — the `ABTIMER-ARM-01` evidence row no longer attributes boundary registration to a handling-only clause, and the arming instant is recorded as a project interpretation because Clause 13.5.2 starts waiting when an Intermediate Event is reached and a Boundary Event never is.

## Question

What is the smallest bounded slice that gives an Activity occurrence a deadline: one interrupting Timer Boundary Event attached to one User Task, where the Timer firing abandons the Activity and follows the boundary route, and the Activity's own completion withdraws the Timer?

## Selection basis

Boundary Event is the largest structural family in the pinned CIB Seven `2.2.0` corpus with no closed reviewed slice of its own, at 298 files and 394 occurrences. The [breadth refresh](../research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#boundary-event-candidate-split) decomposes it and reports an interrupting Timer attached to a User Task at 25 files and 29 occurrences, with interruption the dominant corpus shape at 337 of 394 occurrences.

The selection reason is mechanism leverage, not prevalence. Compensation carries the single largest combination at 39 files but requires completed-work registration, context snapshots, and reverse-order invocation. Error boundaries are already closed on Service Task and Sub-Process hosts. This candidate is the largest boundary combination whose every host mechanism already exists.

Fixture prevalence is a scheduling signal only. It is not evidence that this profile executes, and this capsule selects no CIB relationship on lexical grounds.

## Normative basis

BPMN 2.0.2 is the sole semantic authority for this capsule.

- Ledger citation lock for `BPMN-BOUNDARY-TIMER-01`: Clause 10.5.6, Clause 13.5.3, and Tables 10.91, 10.92, 10.101, and 10.122, with the Activity lifecycle in Clause 13.3.2
- Clause 10.5 Table 10.91 owns the Boundary Event attributes, and Table 10.92 owns the legal `cancelActivity` values per trigger. The same two tables are already cited by the [boundary-error specification](BOUNDARY-ERROR-SPEC.md), which is why this capsule cites tables rather than a `10.5.x` sub-clause number.
- Clause 10.5.6 fixes what interrupting means: “An interrupting boundary Event is defined by a *true* value of its cancelActivity attribute.”
- The machine-readable artifacts fix the default. `Semantic.xsd` declares `<xsd:attribute name="cancelActivity" type="xsd:boolean" default="true"/>`, and `BPMN20.cmof` declares `BoundaryEvent-cancelActivity` with `default="true"`.
- Clause 13.5.3, *Intermediate Boundary Events*, owns the behavior and fixes an exact three-step order: handling first consumes the Event occurrence, then cancels the attached Activity when `cancelActivity` is set, and then follows the Sequence Flow connected to the Boundary Event.
- Clause 10.5.5 and Table 10.101 own `TimerEventDefinition.timeDuration`, with Table 10.122 as its XML Schema, already admitted at exactly `PT1S` by the [Intermediate Catch Timer specification](INTERMEDIATE-CATCH-TIMER-SPEC.md).
- Clause 13.3.2 owns the Activity lifecycle whose active state the deadline observes.

The omitted `cancelActivity` form is admitted **because it resolves to `true`** under the machine-readable default, not as a tolerated variant. This distinction is load-bearing and must not be inherited from the boundary-error precedent: Table 10.92 makes `true` the only legal value for an Error trigger, so that capsule's admission of an omitted attribute needs no default, whereas Table 10.92 lists `true`/`false` for a Timer and the default is the only fact that settles omission.

Clause 13.5.3's phrase “if the attribute is not set, the Activity continues execution (only possible for Message, Signal, Timer, and Conditional Events)” must therefore be read as *not set to `true`*. Read literally as *absent*, it would make an omitted attribute non-interrupting for a Timer and would contradict both the schema default and Clause 10.5.6. The capsule records that reading explicitly rather than relying on it silently.

Table 10.92 listing `true`/`false` for a Timer also means excluding non-interrupting behavior below is a deliberate scope decision about a legal BPMN shape, not the rejection of an invalid one. Table 10.91 names the association `attachedTo` in prose while the CMOF and XSD name is `attachedToRef`; the profile admits the machine-readable name, which the boundary-error capsule already consumes.

The ledger requirement is new: `BPMN-BOUNDARY-TIMER-01`. This document originally deferred adding it until the implementation and observed that the [closed-slice guard](../TESTING-SPEC.md#default-verification) is one-directional, so nothing would fail from the identifier's absence. That was correct and it is why the row was then missed at both implementation and graduation. The row now exists with `BPMN-MECH-EVENT-01` citing it as a closed reviewed slice, and [the ledger-consistency guard](../../scripts/requirement-ledger-consistency.test.ts) closes the direction that let it be missed. Under that guard a capsule's cited requirement enters the ledger as `unsupported` when the proposal is written and advances only at closure, which supersedes the deferral this paragraph first described.

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

**The profile pins a shape class, not this one diagram.** Admission compares an exact checked-node multiset, an exact operation multiset, generic graph reachability, and — since the attachment rule landed — that every deadline resolves to a unique same-scope User Task host. Together those reject a deadline on the Start Event, either None End Event, or the boundary follow-on task, and they reject retargeting the boundary route to converge on the normal follow-on task or retargeting Start to the boundary follow-on. Two residual freedoms remain, and they compose, so four topologies are admitted rather than one: which of the two chained User Tasks hosts the deadline, and which None End Event each route reaches. A source that attaches the deadline to the *normal* follow-on User Task instead of the diagrammed one satisfies every admission gate and yields a well-formed bounded process in which that task is the bounded one. The End-Event freedom is semantically inert, because the canonical observation exposes no terminal element identity. This is an exactness limit of multiset-plus-graph admission rather than an unsound program, and it is recorded here instead of claimed away; constraining the attachment structurally is excluded from this capsule.

- one private executable Process with `isExecutable="true"`;
- exactly one None Start Event with no Event Definition and exactly one outgoing Sequence Flow;
- exactly five Sequence Flows and exactly seven Flow Nodes: the None Start Event, the bounded User Task, the Boundary Event, the two follow-on User Tasks, and the two None End Events. The Boundary Event is counted because CMOF derives `BoundaryEvent` from `CatchEvent` and `Event`, whose superclasses include `FlowNode`;
- no parser warning of any kind, which remains admission-blocking;
- one bounded User Task with exactly one incoming and one outgoing Sequence Flow;
- one Boundary Event whose `attachedToRef` resolves to that bounded User Task;
- `cancelActivity` omitted or lexically `true`; every lexeme naming *false*, which is `false` and `0`, is **rejected** as the retained hostile control, because non-interrupting behavior is a separate proposition. `1` is refused too, before parsing and with a different diagnostic, because it is the one valid lexeme `bpmn-moddle` inverts; the compiler refuses it rather than let this profile see it as *false*;
- exactly one Timer Event Definition containing exactly one `timeDuration` whose exact lexical value is `PT1S`;
- exactly one outgoing boundary Sequence Flow and no incoming boundary Flow;
- two distinct follow-on User Tasks, one on each route, each with exactly one incoming and one outgoing Sequence Flow;
- two distinct None End Events;
- no other executable extension content.

**The distinct follow-on User Tasks are load-bearing, and the distinct End Events are not.** `StateObservation` exposes status, the four wait families, Process variables, enabled interactions, and logical time; it exposes no terminal element identity. Two routes that differ only in which None End Event they reach therefore produce the same public terminal observation, and an implementation that wrongly routed interruption to the Activity's normal output would still complete at logical time `1000` and be publicly indistinguishable. Publishing a distinct User Task on each route is what makes the route choice observable at the approved boundary, which is the same reason the [Event-Based Gateway profile](EVENT-BASED-GATEWAY-SPEC.md#exact-source-profile) gives each of its arms a distinct User Task. The two End Events are retained only for structural symmetry and are deliberately not claimed as a discriminator.

The resulting program inventory is one `initiate`, one `awaitBoundedUserTask`, two `awaitUserTask`, two `reachNoneEnd`, and one root `completeScope`. No standalone `awaitTimer` appears, because the boundary Timer is owned by the bounded operation.

Admission rejects a missing or unresolvable `attachedToRef`, an `attachedToRef` naming a non-Activity, a `cancelActivity` naming *false*, a second Boundary Event, a non-Timer Event Definition, a second Timer Event Definition, any duration other than `PT1S`, an incoming boundary Flow, a missing follow-on task on either route, any additional Flow Node such as a third User Task or Gateway, any Sequence Flow count other than five, and any parser warning.

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

Required Lean content, all with exact hypotheses. This list is the single owner of the Lean obligation; the rule-to-evidence matrix below carries evidence pointers only, and no other section restates it.

- a declarative arming relation and a two-constructor victory relation, both distinct from the evaluator;
- soundness from every evaluator-produced arming and victory transition to that relation;
- a quantified exclusivity law in the form the state type supports: one victory removes both live waits and removes its own deadline occurrence, so the same pair cannot win twice. Sibling *ineligibility by key* after a victory is stated quantified by `bounded_task_victory_withdrawals_are_final`, under an explicit `timerWaits` uniqueness hypothesis that the runtime-state invariant names as a conjunct but does not yet prove preserved; the unconditional form stays deferred under [Deferred with a named blocker](#required-optional-and-excluded);
- a quantified interruption law: the interrupting arm produces the boundary token and no normal token;
- an exact state-preservation law for a wrong identity, quantified over every state; the stale-identity counterpart is quantified by the same withdrawal-finality law, under that law's explicit uniqueness hypothesis;
- the nearest **checked non-law**: it is *not* a law that reaching logical time `1000` produces the boundary token, because an earlier committed completion stimulus has already withdrawn the Timer. Stimulus order is an explicit semantic input, so this is a statement about the core's sequential inputs and not about host simultaneity, which the preflight handles separately by failing closed. The finite witness must exhibit that state rather than assert the non-law in prose.

Three schedules over one definition:

| Case | Stimulus | Required stable state after the stimulus | Required follow-up check |
|---|---|---|---|
| Activity wins | exact bounded-task completion before deadline `1000` | only the normal follow-on User Task is published; no bounded task and no Timer remain; logical time `0` | stale exact Timer firing rejects and preserves that state |
| Deadline wins | exact Timer firing at deadline `1000` | only the boundary follow-on User Task is published; no bounded task and no Timer remain; logical time `1000` | stale exact bounded-task completion rejects and preserves that state |
| Pre-due firing | exact bounded Timer occurrence fired at `logicalTimeMs` `999` | rejected with exact state preservation; the armed state keeps both the bounded task and the Timer, and the deadline does not drift | the subsequent exact firing at `1000` still wins normally |

The pre-due row is required as a *witness* and cannot be a *registered scenario*, and the distinction is structural rather than a scheduling choice. The Temporal host derives its firing from committed runtime state — `timerFiringStimulus` assigns `logicalTimeMs` from the wait's own `deadlineMs` — so no scenario can drive that target to an off-deadline instant, and the runner rejects a second timer firing outright. Injecting one would let a caller make the host advance semantic time to an instant no committed deadline supports, which is exactly the boundary the adapter exists to hold. So the witness lives in the quantified Lean refusal law over every off-deadline instant plus [the focused semantic-core test](../../packages/semantic-core/test/activity-boundary-timer.test.ts), which is checked against both seeded defect directions: a core accepting a late firing and a core accepting an early one.

Two things a registered scenario would have added are therefore absent and recorded rather than claimed: a seeded mutation at the comparator itself, and a fixture bound to the exact `process.bpmn` bytes instead of hand-built to the shape those bytes lower to. The residual risk is a transcription error shared by the core fixture and nothing else; it is bounded by the two registered victory schedules, which exercise the same element and control-place identities against the real source. The witness also cannot be inherited from the [Intermediate Catch Timer specification](INTERMEDIATE-CATCH-TIMER-SPEC.md): that capsule's identically shaped `999` witness arms its timer when a token reaches a catch Event, whereas this one arms on Activity activation. That capsule's witness is Lean-only for the same structural reason, so a registered off-deadline firing exists nowhere in the project and would need a pipeline case that declares no Temporal target. No capsule needs that yet.

The published follow-on task identity is the discriminator, and it differs at the approved observation boundary rather than in hidden order. Both schedules then complete their published follow-on task and reach the same empty wait, task, subscription, Timer, effect, variable, and interaction surfaces, differing only in logical time. A declaration-order-permuted source must preserve each schedule's complete trace.

Start closure is exactly two internal steps, `initiate` and `awaitBoundedUserTask`. The armed state has no internal transition and is resumable through its published task interaction, so it is stable and not stranded. Each victory enables exactly one follow-on `awaitUserTask`, and completing it closes through one `reachNoneEnd` and root `completeScope`. No newly reachable multiple-enabled internal state exists, and the capsule must executable-check that every newly reachable closure stays inside `semanticProcessClosureLimit`.

Required negative content, each detected at the public boundary. This list is the single owner of the negative obligation, and each entry names the form its witness takes, because a seeded pipeline mutation is not available for every one of them: a seeded mutation for an implementation that leaves the loser wait; a seeded mutation for one that routes interruption to `task.output`, which publishes the wrong follow-on task; a positive lowering lock against erasure of the boundary Sequence Flow identity; a quantified Lean law plus an independent core test for a firing before the deadline; and a checked non-law in both directions for a half-armed pair, which is a separate defect: neither arm may commit while the other's wait is absent. An implementation producing both tokens is covered instead by the two victory soundness bridges, which map every evaluator-produced victory into a relation whose constructors each add exactly one output token, so one token per victory holds for every state rather than for the schedules a fixture happens to run. The exact-trace theorems and the core's exact state comparison additionally pin the token set on the registered schedules and the core's own stimuli. A both-tokens *seeded mutation* is deliberately not required, because that coverage already discriminates the defect on every transition rather than at one perturbed observation.

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

**Host capability.** `awaitBoundedUserTask` is neither passive, an ordinary token split, nor an uncoordinated host-driven wait. The exhaustive operation-kind classifier in [`host-admission.ts`](../../packages/temporal-adapter/protocol/src/host-admission.ts) adds one class, admits exactly one such operation with no token split, no other host-driven wait, and no managed event race, and continues rejecting every other composition before Workflow start. A mutation omitting the new operation from the classifier must fail that guard, and the classifier's `never` check must force the new kind to be handled.

**Smallest executable refinement witness.** One direct-VM activation premise witness plus the disposable histories below, replayed in the same gate. The coalesced row is a preflight design obligation that no history satisfies: a real server decides activation composition and will not reliably coalesce a completion Update with a timer callback, so the only way to compose that activation is the direct-VM harness, which produces commands rather than a replayable server history. Its two obligations are met by two lanes sharing no instrument — the direct VM reads the emitted commands, and a real-service probe Workflow carrying no BPMN meaning establishes that an accepted Update on a failed Workflow is answered rather than stranded. The row is retained as the obligation it states, and its evidence is those two lanes rather than a third history.

| Witness | Establishes | Required negative content |
|---|---|---|
| Direct-VM `doUpdate` + timer-fire activation | both callbacks accumulate before core advancement under the `hasSignals === false` premise; the `hasSignals` source lock holds | no core advancement from either callback alone |
| Completion history | the task Update commits before the deadline and the durable Timer is canceled | Timer started plus canceled, and no Timer fired |
| Interruption history | the Worker is stopped across the deadline, a replacement Worker commits Timer victory, and the later sequential completion Update resolves as a **semantic rejection** (obligation 1) | Timer started plus fired, and no cancellation |
| Coalesced history | the Worker is stopped until both callbacks are ready, replacement processing fails closed before semantic advancement, and the in-flight Update is **durably resolved rather than stranded** (obligation 2) | the typed failure is retained, and neither arm is adjudicated |

No history may contain Activity, Child Workflow, effect, or Workflow-cancellation events.

## Planned rule-to-evidence matrix

The table below states the **planned** lanes per rule. Two lanes count as two only when their failure modes are uncorrelated, which is why the shared refusal predicate is marked once.

Recorded results at the current closure target, stated per lane because they do not complete together. Every lane below is a claim about that target, not about the rejected `dee1a10`, which precedes the Lean victory relations, the reference guard, the Worker-absence witness, the real-service Update answer, and the semantic-core test:

- **BPMN/profile:** complete. Every rule's basis resolves in the pinned corpus, and an [executable guard](../../scripts/normative-reference-resolution.test.ts) now enforces that for every declared reference. An earlier target shipped three references that did not: two existing clauses cited for other subjects and one table row absent from BPMN 2.0.2.
- **Lean:** `ABTIMER-ARM-01`, `ABTIMER-COMPLETE-01`, and `ABTIMER-INTERRUPT-01` have declarative relations with evaluator-soundness bridges: arming, plus a two-constructor victory relation that requires both waits live and pairs them through a committed operation. `ABTIMER-REFUSE-01`'s pre-due refusal is now quantified over every state, timer, and instant rather than resting on one fixture, which matters because the arming instant is a recorded interpretation and the claim that carries it is that *no* off-deadline firing commits. Activation-counter preservation and the logical-time separation between the arms are proved for both constructors. Exclusivity is proved in the form the state type supports: no victory half-withdraws the pair, and a victory removes its own deadline occurrence so the same pair cannot win twice. The wrong-identity refusal is quantified over every state. The stale-identity counterpart is now stated quantified as well: `bounded_task_victory_withdrawals_are_final` proves over every state and both arms that each victory withdraws a live task and a live deadline and that no remaining wait carries either withdrawn key. Its key-uniqueness hypothesis remains **assumed**; what changed is that the hypothesis has a named owner, the `waitIdentitiesUnique` conjunct of the runtime-state invariant, rather than being an unstated premise. **Absent:** the quantified law stops at unfindability of the withdrawn keys and does not state the refusal *outcome* of the later stimulus, because that outcome belongs to the dispatcher and joining the two would make one law depend on both accounts. The stale firing's rejected outcome and exact state preservation therefore remain finite checked witnesses plus the independent core refusal.
- **Independent TypeScript:** every rule is implemented, both victory schedules execute in the differential pipeline, and the family now carries [its own focused test](../../packages/semantic-core/test/activity-boundary-timer.test.ts) like every peer family. Its exact covered surface is recorded by [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md#interrupting-activity-boundary-timer) and not restated here.
- **Temporal refinement:** the two victory histories exist and replay, and the deadline survives the Worker being absent across its due instant — the replacement Worker commits the interruption from committed state while the bounded Activity is live, which is a stronger obligation than resuming a bare timer wait. The preflight's durable-resolution stop condition now holds at the command level: the refused completion Update is accepted and then answered by the Workflow's failure, never by a result, and the assertion rejects both stranding and a silently chosen winner. The service half is now checked too, on a probe Workflow carrying no BPMN meaning, so the two lanes share no instrument — one reads emitted commands, the other awaits a real client handle. An accepted Update on a failed Workflow is answered rather than left pending, which closes the obligation by composition. One limit is recorded and locked by assertion: the answer explains that the Workflow closed before the Update completed and does **not** carry the Workflow's failure identity, so a caller awaiting a bounded completion cannot learn from that path that the host refused to choose a winner. The refusal identity reaches the Workflow result and Event History only, which bounds this capsule's typed-identity claim to those surfaces.
- **Negative witness or mutation:** two of five are seeded pipeline mutations — the retained withdrawn deadline and the misrouted deadline victory. The partial-arm case is a checked non-law in both directions instead: neither arm can commit while the other's wait is absent, so a half-armed pair is unusable from either side and cannot be mistaken for a resumption surface. The pre-due case is covered in both targets instead: the quantified Lean law rejects every off-deadline instant rather than the one a mutation would perturb, and the focused core test is verified by seeding a core that accepts an early firing and a core that accepts a late one. A seeded pipeline mutation would additionally require a registered pre-due scenario, which no target can execute. Boundary-Flow identity erasure is covered by the positive lowering lock in `packages/bpmn-source/test/activity-boundary-timer-source.test.ts`.

The coalescing premise carries two lanes whose instrument is shared: both the source lock over `hasSignals` and the behavioural direct-VM contrast identify an activation by `workflowInfo().historyLength`, which is also what the production scheduler uses. A defect in that identification is invisible to both; the error direction is over-refusal, so the exposure is bounded rather than unsound.

| Rule | BPMN/profile | Lean | Independent TypeScript | Temporal refinement | Negative witness or mutation |
|---|---|---|---|---|---|
| `ABTIMER-ARM-01` | Clause 13.3.2 for the Activity reaching Active; the arming instant itself is a project interpretation, since no clause fixes when a boundary Event's waiting begins (13.5.2's “reached” cannot apply to a Boundary Event) | declarative arming relation and evaluator soundness | atomic task-plus-timer creation | armed Query with one durable Timer started | partial-arm mutation creating one member without the other |
| `ABTIMER-COMPLETE-01` | Clause 13.5.3 normal continuation | quantified exclusivity law | victory removes both waits | completion history: Timer canceled, never fired | mutation that leaves the Timer wait live |
| `ABTIMER-INTERRUPT-01` | Clause 13.5.3 three-step order | quantified interruption law with counter preservation | boundary token only, no normal token | interruption history: Timer fired, no cancellation | mutation routing interruption to `task.output`, detected by the wrong published follow-on task |
| `ABTIMER-REFUSE-01` | exact-occurrence and exact-time refusal | quantified off-deadline and wrong-identity refusal; stale identity as a checked witness under its recorded deferral, beside a quantified withdrawal-finality law that assumes key uniqueness | independent core refusal with both seeded defect directions rejected | no registered schedule can present an off-deadline firing | pre-due firing at `999` and its `1001` mirror; stale sibling after either victory |
| `ABTIMER-OBSERVE-01` | four-kind canonical ordering | projection agreement | published follow-on task identity distinguishes the route | canonical Query projects core state only | boundary-Flow identity erasure collapsing both routes to one output |

CIB Seven is deliberately absent from every row; see the CIB relationship section.

## Required, optional, and excluded

The table is the single owner of evidence dispositions for this capsule. Its stable obligation keys make it impossible to classify the same obligation as both required and absent. The surrounding sections own the detailed contracts and rationale.

### Rule-keyed disposition lock

| Obligation key | Disposition | Boundary |
|---|---|---|
| `ABTIMER-ARM-01/admission-lowering-and-operation` | `required` | Exact source profile, checked graph, lowering, and the atomic bounded-task operation. |
| `ABTIMER-ARM-01/lean-and-host-premise` | `required` | Lean arming relation and soundness, host capability class and typed failure, and direct-VM premise witness. |
| `ABTIMER-COMPLETE-01/victory-evidence` | `required` | Rule row, Lean and core evidence, registered scenario with mutation, and completion history. |
| `ABTIMER-INTERRUPT-01/victory-evidence` | `required` | Rule row, Lean and core evidence, registered scenario with mutation, interruption history, and Worker-absence history. |
| `ABTIMER-REFUSE-01/pre-due-and-identity-evidence` | `required` | Wrong-identity and pre-due witnesses in Lean and the semantic core, including both seeded core defect directions. |
| `ABTIMER-REFUSE-01/quantified-stale-state-preservation` | `deferred` | `bounded_task_victory_withdrawals_are_final` states the quantified form over every state and both victory arms, but still **assumes** key uniqueness. The hypothesis now has a named owner, the `waitIdentitiesUnique` conjunct of the runtime-state invariant, whose preservation across the registered transition arms is unproved; the deferral closes when that preservation lands. |
| `ABTIMER-REFUSE-01/pre-due-temporal-scenario` | `excluded` | No admitted adapter delivery can present an off-deadline firing. |
| `ABTIMER-REFUSE-01/stale-completion-temporal-scenario` | `excluded` | Neither admitted delivery mode preserves the ordering needed by this scenario. |
| `ABTIMER-OBSERVE-01/projection-evidence` | `required` | Rule row, canonical observation, and distinct published follow-on task identity. |
| `ABTIMER-INTERRUPT-01/time-skipping-calibration` | `optional` | The full local-server witness remains mandatory. |
| `ABTIMER-ARM-01/profile-scope-extensions` | `excluded` | All trigger, host, repetition, timer-form, public-cancellation, CIB, and A12 extensions listed below. |

The deferred quantified form needs key uniqueness to hold of reachable states. That invariant is now **stated** as the `waitIdentitiesUnique` conjunct of the runtime-state invariant, and `bounded_task_victory_withdrawals_are_final` states the law under it as an explicit hypothesis, so the fact is no longer an unstated premise. What is still missing is preservation: no theorem establishes that a state reached by execution satisfies the conjunct, because the invariant's preservation obligations are unimplemented. Closing the deferral here would still assume the invariant rather than establish it, which is why the row stays `deferred` and points at this paragraph.

The excluded profile extensions are non-interrupting boundary Timers; boundary Timers on Service Task, Sub-Process, Call Activity, Transaction, or Receive Task hosts; cycle and date timer forms; any duration other than `PT1S`; multiple Boundary Events on one Activity; Message, Error, Escalation, Signal, Conditional, Cancel, and Compensation boundary triggers; repeated or Multi-Instance Activities; boundary Events on a Sub-Process boundary reached by propagation; general Activity cancellation or a public cancel command; incidents; CIB Seven compatibility evidence; and A12 adoption.

The refusal itself is checked by fixture in Lean, quantified over wrong identities, independently in the semantic core across both stale directions, and as the follow-up check of both registered schedules. Only its quantified stale-state form is deferred.

## CIB relationship

**None selected.** BPMN 2.0.2 resolves this account without ambiguity, no admitted source needs a `camunda:*` extension, the Temporal mapping needs no engine observation, and no downstream blocker remains after the standard mechanism exists. Under the [CIB on-demand gate](../PROJECT-DESIGN.md#cib-evidence-on-demand) all five questions answer no, so this capsule adds no CIB profile surface and registers no relationship. The pinned corpus supplied only the scheduling signal above.

If implementation discovers a public observation this profile cannot produce without an engine-specific choice, that is a stop condition and a phase-zero probe obligation, not a silent overlay.

## Product-surface consequence

This capsule reaches the product command through example configuration and the existing driver, adding no product code, as the [Temporal engine runner specification](../RUNNABLE-TEMPORAL-MVP-SPEC.md) requires.

The driver's precedence rule keeps waiting while a timer wait is open precisely so a host-resolved wait can withdraw an enabled interaction, and that arm is already product-reachable and live through the `event-based-gateway-timer-wins` example, which a separate increment added before this capsule's implementation baseline. This profile adds a second definition where both arms are reachable from declared configuration alone: a plan answering the bounded task exercises Activity victory, and a plan that answers only the boundary follow-on task exercises deadline victory. Both boundary examples are checked for admission and configuration only; neither is a live durable product run, so they claim no product evidence beyond that.

Both plans must still answer their follow-on task, so neither example ends in an observation-limit refusal.

## Common-mode risks

- **One assumption shared by all four targets.** Every target derives the deadline from the same committed `durationMs: 1000` and the same arming instant. If the arming instant is wrong, all four agree and are all wrong. This exposure is sharper than it first appears, because BPMN 2.0.2 does not fix the arming instant for a boundary Event at all: Clause 13.5.2 starts waiting when an Intermediate Event is *reached*, and a Boundary Event is never reached by a token, so arming on Activity activation is a project interpretation rather than a transcribed clause. The mitigation is therefore the capsule's own pre-due firing witness plus a seeded deadline mutation, which discriminate the arming instant rather than the arithmetic; no normative citation can substitute for them.
- **Reused refusal rules.** `ABTIMER-REFUSE-01` reuses the existing full-identity refusal implementation. Two lanes that share that implementation are one lane, not two, so the capsule may not count Lean and TypeScript refusal as uncorrelated evidence where both call the same reused predicate.
- **The detector reuse.** If the coalescing detector is reused unchanged, a defect in it fails both capsules together; the distinct typed failure identity above is the minimum separation.

## Versioning consequences

Pre-release policy applies: the new operation kind is added atomically across the checked-graph compiler, Semantic Process contract, JSON Schemas, Lean decoder and lowering, semantic core, the adapter's typed contract module and host-capability classifier, differential catalog, and every fixture, with no compatibility reader, format counter, or migration branch. No retained Event History is kept beyond the disposable gate.

### Extractions this implementation forced

This capsule crossed three module-size extraction boundaries rather than one, and each landed as a separate behavior-preserving commit rather than as work done under a size squeeze inside a semantic change.

- The adapter runner: nine forwarding probe methods moved to [mutation probes](../../packages/temporal-adapter/testkit/src/mutation-probes.ts) behind a narrow host contract at `d14570b`.
- The semantic core runtime: [control-flow token transitions](../../packages/semantic-core/src/semantic-process-control-flow-runtime.ts) became their own owner.
- The Lean definition decoder: the former combined owner split into [shared element decoders](../../BpmnSemantics/SemanticProcessJson/Elements.lean), [checked-process decoding](../../BpmnSemantics/SemanticProcessJson/CheckedProcess.lean), and [the program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean).
- [Checked-graph lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) absorbed the bounded-task clause and was left below the extraction threshold, which the next family cleared.

**This section deliberately records no headroom figures.** The planning inventory that carried them belonged to this capsule while it was a proposal, where [the reviewability guard](../../scripts/document-reviewability.test.ts) recomputes every figure against measurement. That guard reads proposals only, so the table went out of jurisdiction at graduation and seven of its eight figures drifted while its own preamble still promised they were recomputed — a false claim about coverage rather than a stale number. Measure a current owner with `node scripts/what-binds.ts <path>...`; [an executable guard](../../scripts/document-reviewability.test.ts) now rejects a graduated specification that reintroduces the table.

The Lean split supersedes the boundary recorded in [the archived Lean comment-discipline proposal](../archived/LEAN-COMMENT-DISCIPLINE-PROPOSAL.md), which deliberately kept checked-process and program decoding in one owner and retained the shared element decoders there. That choice was sound at its size, and its substantive constraint is preserved: the shared decoders are still neither duplicated nor pushed into the wire-primitive support module. What changed is that the combined owner reached the review target while every future operation needs a clause in its program half, and the file already exposed exactly two public entry points, so the representation boundary was the split the code was already asking for.

### Guards and oracles this implementation must change or satisfy

These oracles already constrain the planned artifacts; none of them is new work invented by this capsule. Enumerate them again with `node scripts/what-binds.ts` before the first edit rather than from recall.

| Guard | Requirement it already places on this capsule |
|---|---|
| [product example configs](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts) | Every registered profile has a live example and every example names a registered profile. Two examples over one definition are admissible; a profile with none is not. |
| [document reviewability](../../scripts/document-reviewability.test.ts) | A new scenario family directory must be linked from its registry README, each scenario document from its family README, and this section must keep naming resolvable guards and owners. |
| [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts) | Every added profile, scenario, and retained-evidence artifact must be registered in the same change, with no unreferenced profile and no unregistered artifact. |
| [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | Every registered scenario needs exactly one pipeline case carrying a meaningful seeded semantic mutation. |
| [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts) | The bounded Activity wait must be classified against concurrent host-driven waits, including the race-plus-bounded shape that must stay rejected. |
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
