# Interrupting Sub-Process boundary Timer proposal

## Status

**Draft proposal awaiting the independent cold proposal review and owner approval.** Nothing here is approved, implemented, or evidenced, and no sentence in this document is a coverage, conformance, or CIB compatibility claim. The owner decisions this proposal asks for are listed last. Implementation may not begin before both the review verdict and owner approval are recorded in the receipt below.

Implemented and absent scope is owned by [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md#current-claim) and deliberately not restated here; immediate sequencing is owned by [PLAN.md](../PLAN.md#exact-resume-point).

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

A commit cannot contain its own Git identity, so the immutable proposal target is recorded by a documentation-only follow-up before the review prompt is handed off, exactly as [the receipt form](../TESTING-SPEC.md#review-receipt) provides for.

## Question

What is the smallest bounded slice that gives a *scope* a deadline: one interrupting Timer Boundary Event attached to one embedded Sub-Process, where the Timer firing terminates the child scope's live work and follows the boundary route, and the child scope's own quiescent completion withdraws the Timer?

The distinct new information is not the Timer and not the boundary route. It is that the cancelled Activity **encapsulates a Process instance**, so interruption arrives from outside a scope that may hold a waiting child Activity, and the withdrawal condition is a scope-quiescence predicate rather than one task's completion.

## Selection basis

[The breadth research](../research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#priority-decision-after-the-interrupting-activity-boundary-timer) owns this selection, its measured figures, and the alternatives it rejects. It is selected for host-generic leverage over the corpus's largest boundary attachment host, not for being the largest remaining combination.

Fixture prevalence is a scheduling signal only. It is not evidence that this profile executes, and this proposal selects no CIB relationship on lexical grounds.

The compact CIB precedent is `subprocess/SubProcessTest.testSimpleSubProcessWithTimer.bpmn20.xml`: a private executable Process whose Sub-Process contains one None Start, one User Task, and one None End, with an interrupting boundary Timer attached to the Sub-Process and a boundary route to one User Task. `SubProcessTest.testSimpleSubProcessWithTimer` observes the child User Task as the single active task, advances the clock past the deadline, and then observes the boundary task as the single active task. Two differences from that fixture are deliberate and stated here so they are not mistaken for the corpus shape: its duration is `PT2H` where this profile admits only `PT1S`, and its boundary route ends at a User Task with no outgoing Flow, which this profile completes with a None End Event. Its three-level `ActivityInstance` tree is a CIB-internal projection and is not a BPMN public observation.

## Normative basis

BPMN 2.0.2 is the sole semantic authority for this proposal. Every clause below was read in the pinned corpus rather than cited from recall.

- Clause 13.3.4 opens "A **Sub-Process** is an **Activity** that encapsulates a **Process**", which is what makes a Sub-Process a legal boundary host at all, and states that once instantiated "its elements behave as in a normal **Process**".
- Clause 13.3.4 also fixes normal completion: "A **Sub-Process** _instance_ completes when there are no more _tokens_ in the **Sub-Process** and none of its **Activities** is still active." This is the normative anchor of the already implemented quiescence rule this proposal races against.
- Clause 13.5.3 fixes the boundary handling order: consume the Event occurrence, then cancel the attached Activity when `cancelActivity` is set, then follow the Sequence Flow connected to the boundary Event.
- Clause 10.5.6 fixes what interrupting means through a *true* `cancelActivity`, and the machine-readable artifacts fix the default: `Semantic.xsd` declares `cancelActivity` with `default="true"` and `BPMN20.cmof` declares `BoundaryEvent-cancelActivity` likewise. An omitted attribute is therefore admitted *because it resolves to `true`*.
- Table 10.92 lists `True`/`false` for a Timer trigger, so excluding non-interrupting behavior below is a scope decision about a legal BPMN shape rather than the rejection of an invalid one.
- Clause 10.5.5 and Table 10.101 own `TimerEventDefinition.timeDuration`, with Table 10.122 as its XML Schema, already admitted at exactly `PT1S` by the [Intermediate Catch Timer specification](INTERMEDIATE-CATCH-TIMER-SPEC.md).
- Clause 10.5 additionally constrains attachment: a boundary Intermediate Event must carry one of the listed triggers, must not be the target of a Sequence Flow, and — for a Cancel trigger only — may attach to a Sub-Process boundary only when its `Transaction` attribute is true. A Timer carries no such restriction, so no Transaction question arises here.
- Clause 13.5.4 states that Event Sub-Processes "cannot have attached boundary **Events**", which is why this profile admits an ordinary embedded Sub-Process and rejects `triggeredByEvent="true"`.

### One recorded normative conflict this capsule must resolve

Clause 13.3.2's Activity lifecycle governs what happens *inside* the cancelled Sub-Process, and its literal wording does not say what an interruption plainly requires:

> An **Activity**'s execution is interrupted if an interrupting **Event** is raised (such as an _error_) or if an interrupting **Event Sub-Process** is initiated, In this case, the **Activity**'s state changes to _Failing_ (in case of an _error_) or _Terminating_ (in case any other interrupting **Event**). All nested **Activities** that are not in _Ready_, _Active_ or a final state (_Completed_, _Compensated_, _Failed_, etc.) and non-interrupting **Event Sub-Processes** are terminated.

Read literally, the set that gets terminated *excludes* nested Activities in `Ready` and `Active` — that is, it excludes exactly the live child work an interruption exists to stop, and the clause then supplies no other disposition for it. That reading is incoherent: it would leave a `Terminating` Sub-Process containing an `Active` child User Task with no rule to remove it and no rule to let it complete.

This proposal resolves the conflict as **all non-final nested work is terminated**, and records the resolution here rather than agreeing with the clause silently. Three reasons, in decreasing weight:

1. Clause 13.5.3's own instruction is that the attached Activity "is then cancelled", and Clause 13.3.4 makes the Sub-Process's contained elements part of that Activity. A cancelled Activity that still owns a live wait has not been cancelled.
2. The project already resolved the same substance from the other direction. `SUBERR-INTERRUPT-01` in the [Sub-Process Error propagation specification](SUBPROCESS-ERROR-PROPAGATION-SPEC.md#stable-semantic-rules) removes every scope-owned token, wait, and live runtime owner in the child occurrence. This proposal inherits that account rather than inventing a second one, which is the whole reason the capsule is small.
3. The pinned CIB engine agrees at the public boundary: after the deadline, `SubProcessTest.testSimpleSubProcessWithTimer` finds the boundary task as the *single* result of a task query, so the child task is gone.

The third reason is calibration, not authority, and it must not be recorded as a CIB relationship: the standard resolves this once its own cancellation instruction is applied, so no engine choice is being adopted. The conflict is nonetheless novel to this capsule — the Error capsule never needed the clause, because an Error is thrown from *inside* the child and the child scope's removal answers the nested question implicitly. A Timer arrives at the boundary from outside, which is exactly what makes the clause load-bearing here.

### One project interpretation this capsule inherits

The arming instant is a project interpretation, not a normative fact. Clause 13.5.2 starts waiting when an Intermediate Event is *reached*, and a Boundary Event is never reached by a token. The [interrupting Activity boundary Timer specification](ACTIVITY-BOUNDARY-TIMER-SPEC.md) already recorded that gap and resolved it by arming on host activation; this proposal reuses that resolution and adds only which instant "activation" means for a scope host, which is decision 1 below.

## Selected account and the competing accounts it rejects

**Selected.** The deadline is created atomically with the child scope occurrence at Sub-Process entry, is owned by the Sub-Process Activity occurrence, and is withdrawn atomically by the child scope's quiescent completion. Firing it at exactly its deadline consumes the Timer occurrence, terminates every non-final runtime owner belonging to the child scope occurrence, removes that occurrence, preserves monotonic activation and End counters, and produces exactly one token on the boundary Sequence Flow in the parent scope.

Three competing accounts are rejected, and each rejection is falsifiable rather than stylistic:

- **Arming when the child's first wait becomes active.** Rejected. The deadline would then not exist during child entry, so a scope whose child immediately reached its End would never have been under a deadline at all, and the arming instant would depend on the child's internal topology rather than on the host Activity's lifecycle. Clause 13.3.2 makes the host Activity `Active` on activation, not on its content's progress.
- **Withdrawing the deadline when the child's last token is consumed, rather than at scope completion.** Rejected as a *distinct* instant that must not be assumed equal to quiescence. `SUBPROC-END-01` already establishes that consuming a branch's token neither completes the child scope nor emits the parent output while sibling work remains, so under a two-child scope these two instants differ. This profile admits one child task, which makes them coincide *here* — and that coincidence is precisely why the rule must be stated over quiescence, or a later multi-child capsule inherits a rule that was only accidentally correct.
- **Reusing the Error propagation transition by synthesising an Error.** Rejected. It would make a Timer's public outcome depend on an Error code that no source declares, and Clause 13.5.3 distinguishes the two triggers' `cancelActivity` legality in Table 10.92. The shared mechanism is regional cancellation, which is reused directly; the trigger is not.

## Exact source profile

One new immutable standards-only profile, registered identity `bpmn-2.0.2-subprocess-boundary-timer-draft`. It admits this shape class:

```text
None Start → [ Sub-Process: None Start → Child Task → None End ] ──normal──→ After Scope → None End A
                            │
                   (boundary Timer PT1S, interrupting)
                            │
                            └──boundary──→ Escalation Task → None End B
```

The profile pins a shape class, not one diagram, exactly as its sibling does. Admission compares an exact checked-node multiset, an exact operation multiset, generic graph reachability, and that the deadline resolves to the unique admitted Sub-Process host.

- one private executable Process with `isExecutable="true"`;
- exactly one root None Start Event with no Event Definition and one outgoing Sequence Flow;
- exactly one embedded Sub-Process, with `triggeredByEvent` omitted or lexically `false`, exactly one incoming and one outgoing Sequence Flow;
- inside it exactly one None Start Event, exactly one child User Task, exactly one None End Event, and exactly two child Sequence Flows;
- one Boundary Event whose `attachedToRef` resolves to that Sub-Process;
- `cancelActivity` omitted or lexically `true`; lexical `false` is **rejected** as the retained hostile control;
- exactly one Timer Event Definition containing exactly one `timeDuration` whose exact lexical value is `PT1S`;
- exactly one outgoing boundary Sequence Flow and no incoming boundary Flow;
- two distinct follow-on User Tasks, one per route, each with one incoming and one outgoing Sequence Flow;
- two distinct root None End Events;
- no parser warning of any kind, which remains admission-blocking;
- no other executable extension content.

**The distinct follow-on User Tasks are load-bearing; the distinct End Events are not.** `StateObservation` exposes status, the four wait families, Process variables, enabled interactions, and logical time, and exposes no terminal element identity. An implementation that wrongly routed interruption to the Sub-Process's normal output would otherwise complete at logical time `1000` and be publicly indistinguishable. Publishing a distinct User Task per route is what makes the route choice observable at the approved boundary, for the same reason the [Event-Based Gateway profile](EVENT-BASED-GATEWAY-SPEC.md#exact-source-profile) gives each arm its own User Task. The two End Events are structural symmetry only and must not be defended in evidence as a discriminator.

**One residual admission freedom is expected and is recorded rather than claimed away.** Which of the two root None End Events each route reaches is semantically inert under the canonical observation, so at least two topologies are admitted. Unlike its sibling, this profile has no second freedom over which Activity hosts the deadline, because only one admitted Flow Node is a Sub-Process and the attachment rule already requires that host. Whether a further freedom exists is a question the implementation must answer by probe rather than by assertion, and finding one is a finding to record, not a defect to hide.

Admission rejects a missing or unresolvable `attachedToRef`, an `attachedToRef` naming anything other than the admitted Sub-Process, `triggeredByEvent="true"`, `cancelActivity="false"`, a second Boundary Event, a non-Timer or second Timer Event Definition, any duration other than `PT1S`, an incoming boundary Flow, a nested Sub-Process, a second child task, a missing child Start or End, a missing follow-on task on either route, and any parser warning.

The source compiler manifest needs **no new CMOF fact**: `BoundaryEvent`, `attachedToRef`, and `cancelActivity` come from the [boundary-error specification](BOUNDARY-ERROR-SPEC.md), `TimerEventDefinition` with `timeDuration` from the Intermediate Catch Timer specification, and `SubProcess` with `triggeredByEvent` from the [embedded Sub-Process completion specification](EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md). Each must be confirmed present in `bpmn-2.0.2-semantic-process-metamodel.json` before the first edit; one that turns out to be missing is a finding to record, not a silent manifest addition.

## Checked graph and lowering

The checked graph reuses the existing Timer Boundary Event node variant introduced by the sibling capsule, whose payload is the boundary event identity, the resolved attachment target identity, the exact retained `PT1S` literal, and the boundary Sequence Flow identity. **Whether that variant is reusable unchanged is decision 2 below**, because its attachment field currently resolves to a User Task host and this profile resolves it to a scope-owning Activity. A shared variant with a widened host domain and a shared attachment validator is the recommendation; a second near-duplicate variant is the outcome to avoid.

The boundary Sequence Flow is a token-carrying control place in the ordinary `ControlPlace.origin` arm, as in the sibling. The Event-Based Gateway's disjoint configuration-Flow classification does not apply and no second exception is added.

Lowering produces one bounded-scope operation that owns the child scope entry and its deadline together, rather than a standalone `awaitTimer` beside a scope entry. Lean independently lowers the checked graph and requires exact equality with the received program; retaining the exact `PT1S` literal in checked source is what lets Lean normalize it to `1000` independently.

`packages/bpmn-source/src/semantic-process-lowering.ts` is at 25 lines of headroom and its sibling capsule already recorded that budget as expired. A behavior-preserving extraction of that owner is therefore a prerequisite commit, not work to be done inside this semantic change.

## Runtime state

No new runtime collection is proposed. The child scope occurrence already exists with complete identity, and the Timer wait family already carries complete occurrence identity.

The ownership relation rests on one falsifiable claim, stated so it can be refuted rather than assumed: a boundary Timer occurrence and its host scope occurrence are recoverable from the committed program plus the live scope occurrence and Timer wait, because the profile admits exactly one Sub-Process with exactly one boundary Timer. Atomic arming and atomic removal keep the two occurrences' `activation` counters equal, so the recovery key is the complete occurrence pair rather than an element identity. An admitted state in which two live waits are ambiguous about ownership refutes the claim and forces an explicit occurrence record; the nearest such state is a repeated or Multi-Instance Sub-Process, which this profile excludes.

This mirrors the sibling's decision to omit a hidden record, and it carries the same adapter consequence, which this capsule owns rather than inherits: with no record, the adapter must join the committed bounded-scope operation to the live scope occurrence and Timer wait to know that a Timer wait is a scope deadline rather than an ordinary `awaitTimer`. That join is new derivation work and must not be described as detector reuse.

Regional cancellation preserves activation counters and `endOccurrences` as monotonic historical facts, exactly as the Error propagation capsule established. A deadline victory therefore retains `endOccurrences = 0` when the child task was still active, and the internal post-cancellation state is deliberately **not** claimed equal to any other route's state.

## Proposed semantic rules

### `SPTIMER-ARM-01` — scope entry arms the child and its deadline atomically

Consuming the parent token at the admitted Sub-Process atomically creates the child scope occurrence, its child-entry token, and the boundary Timer occurrence with deadline `1000` logical milliseconds from the arming instant. None of the three exists without the others; a state with a live child scope and no deadline, or a deadline and no child scope, is invalid rather than a resumption surface.

### `SPTIMER-QUIESCE-01` — child quiescence withdraws the deadline

When the child scope occurrence owns no token, wait, User Task occurrence, or other runtime work, scope completion removes the occurrence *and* the boundary Timer occurrence and produces exactly one token on the Sub-Process's normal outgoing Flow. It never produces a boundary token. The withdrawal condition is quiescence, not last-token-consumption; under this profile those instants coincide, and the rule is stated over quiescence so a later multi-child capsule inherits a rule that is correct for the right reason.

### `SPTIMER-INTERRUPT-01` — deadline victory terminates the child region

Firing the exact boundary Timer occurrence at its exact deadline follows Clause 13.5.3's order: consume the Timer occurrence; terminate every non-final runtime owner belonging to the child scope occurrence or a descendant, including a waiting child User Task; remove the child scope occurrence; preserve monotonic activation counters and `endOccurrences`; then produce exactly one token on the boundary Sequence Flow in the parent scope. It produces no token on the Sub-Process's normal outgoing Flow. The steps are one atomic transition with no observable intermediate state; the normative order is recorded because it is the reviewable claim, not because the implementation may expose it.

### `SPTIMER-REFUSE-01` — losers and wrong identities preserve state exactly

After either victory the sibling stimulus is ineligible and is rejected with exact state preservation: a Timer firing after quiescent completion, and a child task completion after interruption. A wrong Timer occurrence, a wrong child task occurrence, a pre-due firing, and a wrong deadline are each rejected with exact state preservation, reusing the existing full-identity and exact-time refusal rules rather than restating them.

### `SPTIMER-OBSERVE-01` — project only the existing wait surfaces

The armed state publishes exactly one open child User Task and one open Timer through the existing four-kind canonical ordering, and exactly one enabled completion interaction for the child task. After quiescent completion the published follow-on is After Scope; after interruption it is the Escalation Task, and the child task wait and its interaction are absent. The capsule adds no observation field, no wait kind, and no stimulus kind.

## Laws, non-laws, and separating witnesses

Required Lean content:

- a declarative two-constructor victory relation over the quiescence arm and the deadline arm, requiring both the live child scope occurrence and the live deadline and pairing them through the committed bounded-scope operation;
- an evaluator-soundness bridge for each victory arm and for arming, so every evaluator-produced transition is permitted by the relation;
- activation-counter and `endOccurrences` preservation across the interruption arm;
- the logical-time law separating the arms: the quiescence arm leaves logical time unchanged while the deadline arm advances it to exactly `1000`;
- a quantified refusal of every firing that is not exactly due;
- that no victory half-withdraws the triple, so neither the child scope nor the deadline can be spent alone;
- that a victory removes its own Timer occurrence, so the same pair cannot win twice.

Required checked non-laws and negative witnesses:

- a checked non-law that interruption does **not** preserve child-scope-owned runtime state, which is the exact converse of the Error capsule's regional-cancellation claim and prevents the two from being stated as one over-general preservation law;
- an executable witness that the normal Sub-Process output is unreachable on the deadline arm, which is the analogue of `SUBERR-NORMAL-01`;
- an executable witness that a firing one millisecond early leaves the armed triple and its deadline exactly intact and still able to win at the exact instant.

Two hypotheses are expected to be stated rather than assumed, for the same reason the sibling states them: `RuntimeState` carries no uniqueness invariant over `timerWaits`, and the stronger claim that no later lookup *by key* can rediscover a withdrawn deadline needs uniqueness of the occurrence key. Both remain explicit hypotheses here. This capsule does **not** establish that invariant, whose scheduling is coupled to `stableStateResumable` and recorded in [PLAN.md](../PLAN.md#explicitly-deferred).

The separating witness is the follow-on User Task identity at the approved public boundary. A hidden microstep, storage order, or evaluator choice is not a discriminator.

## Temporal hosting and refinement preflight

This preflight is a feasibility and information-preservation review, not evidence that the adapter refines the core.

| Mechanism the family needs | Durable host mechanism | Preserved state relation, and its risk |
|---|---|---|
| Durable deadline over a live scope | The existing cancellation-scoped `DurableTimerOwner`, keyed on the committed Timer occurrence | The key is derived from committed state only, so replay recomputes it. Risk: the host must join the bounded-scope operation to the live scope occurrence to recognise the deadline, which is new derivation. |
| Race between child-task completion and the deadline | The existing activation-tagged readiness collaborator | One activation carrying both callbacks has no portable BPMN winner. Risk: reusing the bounded-Activity refusal identity would tell an operator the wrong contract is unavailable. |
| Withdrawal on quiescence | Host reconciliation against committed state after each commit | Risk: quiescence is a *derived* condition, so a host that reconciles on "child task absent" rather than on the committed scope occurrence disappearing would withdraw early under a future multi-child profile. |
| Cancellation of child work | None required | Child termination is a pure core transition; the host performs no cancellation and must not acquire one. |
| Worker absence across the due instant | The existing durable timer plus replay | Risk: none new, but the witness must show the replacement Worker committing interruption while the child task is live. |

Three preflight conclusions the implementation must honour:

1. **A new typed refusal identity is required.** The shared-activation refusal must not reuse `bpmnBoundedActivitySchedulerUnavailableFailureType`. The semantic contracts differ — one is an Activity's own completion racing its deadline, the other is a child scope's completion racing its enclosing Activity's deadline — and an operator must be able to tell which is unavailable. This is decision 3 below.
2. **The host mechanisms themselves are reused, not copied.** The readiness batching and durable timer ownership now have single owners, so this family composes them; adding a third near-duplicate scheduler would repeat the defect that extraction removed.
3. **No unclassified gap remains.** Every mechanism above maps to an existing durable one, so no unresolved mapping is being deferred into implicit adapter policy.

## Planned rule-to-evidence matrix

| Rule | Normative or profile clause | Lean | Semantic core | Differential scenario | Temporal witness |
|---|---|---|---|---|---|
| `SPTIMER-ARM-01` | Clause 13.3.4 instantiation; arming instant is the inherited project interpretation | atomic-arming relation and soundness bridge | focused test asserting the armed triple | both schedules' first observation | armed history shows one timer started |
| `SPTIMER-QUIESCE-01` | Clause 13.3.4 completion | quiescence-arm law and withdrawal | focused test asserting deadline removal | quiescence schedule | history shows the timer cancelled, not fired |
| `SPTIMER-INTERRUPT-01` | Clause 13.5.3 order; Clause 13.3.2 as resolved above | interruption-arm law, counter preservation, normal-output non-law | focused test asserting child wait removal | deadline schedule | history shows one timer fired and the boundary route taken |
| `SPTIMER-REFUSE-01` | reuses existing identity and exact-time refusal | quantified off-deadline and wrong-identity refusal | focused test over both stale directions and four wrong identities | each schedule's follow-up refusal | refused shared activation answered by the Workflow's failure |
| `SPTIMER-OBSERVE-01` | canonical observation contract | observation fixtures | focused test over both routes | both schedules' route discriminator | Query projection equals the pure core |

Two registered answer-free schedules are planned, one per victory route, each with a meaningful seeded semantic mutation. The pre-due witness lives in Lean and the semantic core and **not** as a registered scenario, for the structural reason the sibling recorded: the Temporal host derives the firing instant from the wait's own committed `deadlineMs` and the runner admits one firing per scenario, so no target can present an off-deadline instant.

## Required, optional, and excluded

**Required.** The source profile; the checked graph and lowering with the host-domain decision applied; the one new bounded-scope operation; the five rules with their evidence rows; [the Lean content and the negative content](#laws-non-laws-and-separating-witnesses) exactly as those two lists state them; the independent TypeScript core with its own focused test; the new host refusal identity; one registered answer-free scenario per route with seeded mutations; and the deadline-victory, quiescence-victory, and Worker-absence histories.

**Optional.** Time-skipping calibration, as for its two predecessors; the full local-server witness remains the mandatory refinement gate.

**Excluded.** Non-interrupting boundary Timers; nested Sub-Processes and any Sub-Process depth beyond one; more than one child task; Multi-Instance or repeated Sub-Processes; Transaction and Cancel semantics; Event Sub-Processes; boundary Timers on Call Activity, Service Task, Receive Task, or Transaction hosts; cycle and date timer forms; any duration other than `PT1S`; multiple Boundary Events on one Sub-Process; Message, Error, Escalation, Signal, Conditional, Cancel, and Compensation boundary triggers; child-local data and mappings; a public cancel command; incidents; CIB Seven compatibility evidence; and A12 adoption.

## CIB relationship

**None selected.** Under [the CIB on-demand gate](../PLAN.md#cib-on-demand-gate) all five questions answer no. BPMN resolves the account once Clause 13.5.3's cancellation instruction is applied to Clause 13.3.2's nested wording, and that resolution is recorded above as a standards reading rather than an engine choice. No admitted source needs a `camunda:*` extension, the Temporal mapping needs no engine observation, and no downstream blocker remains after the standard mechanism exists — A12 supplies no consumer at all here, since no distinct A12 model contains a Timer Event Definition.

The pinned corpus supplied the scheduling signal and the public-lifecycle calibration quoted in the selection basis. If implementation discovers a public observation this profile cannot produce without an engine-specific choice, that is a stop condition and a phase-zero probe obligation, not a silent overlay.

## Product-surface consequence

This capsule reaches the product command through example configuration and the existing driver, adding no product code. Two examples over one definition are required, one per route, because [the product oracle](../../packages/temporal-adapter/test/product-example-configs.test.ts) requires an example per registered profile and a single plan cannot both let the child task complete and let the deadline win.

## Common-mode risks

- **A shared cancellation helper could make Lean and the core agree by construction.** Regional cancellation is reused from the Error family, so if both targets call one shared routine, agreement on the interruption arm proves nothing about this trigger. The independence obligation is that the semantic core is separately written; the mitigation is that the checked non-law and the seeded mutation must discriminate on the *trigger* path, not only on the cancellation result.
- **Quiescence coinciding with last-token-consumption under this profile.** Both instants are equal here, so no witness can separate them, and a rule written over the wrong one would still pass every gate. The mitigation is the rule statement plus an explicit note in the Lean law's hypotheses; this is honestly a limit of the profile, not a solved problem.
- **The two schedulers' refusal identities.** Three families now share one readiness mechanism. A copied identity would be invisible to every existing assertion, so the new identity needs its own negative assertion, exactly as the bounded-Activity one has.

## Versioning consequences

Pre-release policy applies. The new operation kind is added atomically across the checked-graph compiler, the Semantic Process contract, the JSON Schemas, the Lean decoder and lowering, the semantic core, the adapter's typed contract module and host-capability classifier, the differential catalog, and every fixture, with no compatibility reader, format counter, migration branch, or Workflow patch. No retained Event History is kept beyond the disposable gate.

### Owners this implementation grows

Nonblank headroom from `node scripts/what-binds.ts <path>...`. Every figure is recomputed by [the reviewability guard](../../scripts/document-reviewability.test.ts) on each run and must equal the measured value, so changing an owner's size fails the gate and forces this inventory to be revisited.

| Owner | Headroom | Consequence, and when it expires |
|---|---:|---|
| [checked-graph lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 25 | **Already expired.** A behavior-preserving extraction is a prerequisite commit before any lowering clause is added here. |
| [semantic core runtime](../../packages/semantic-core/src/semantic-process-runtime.ts) | 47 | Dispatch only; the family's transitions belong in a new narrow owner beside [the bounded-task runtime](../../packages/semantic-core/src/semantic-process-bounded-task-runtime.ts). Re-expires under 40. |
| [Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 51 | Sufficient for one operation kind and no new node variant. Expires under 40. |
| [scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) | 433 | Sufficient; owns the quiescence predicate this family races. |
| [graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 179 | Sufficient. |
| [Lean runtime state](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 49 | Near the re-expiry threshold with no new collection planned; adding one would force an extraction first. |
| [Lean execution](../../BpmnSemantics/SemanticProcess/Execution.lean) | 78 | Dispatch only; the family's relation and laws belong in a new narrow module beside [BoundedTask.lean](../../BpmnSemantics/SemanticProcess/BoundedTask.lean). |
| [Lean program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 215 | Sufficient. |
| [host capability classifier](../../packages/temporal-adapter/src/host-admission.ts) | 448 | Sufficient; must gain the bounded-scope class and reject it beside a managed race. |
| [adapter typed contracts](../../packages/temporal-adapter/src/contracts.ts) | 354 | Sufficient; carries the new refusal identity. |

One owner is already expired, so this capsule crosses one mandatory extraction boundary. That extraction is a separate behavior-preserving commit and never work done under a size squeeze inside a semantic change.

### Guards and oracles this implementation must change or satisfy

These oracles already constrain the planned artifacts; none is new work invented by this capsule. Enumerate them again with `node scripts/what-binds.ts` before the first edit rather than from recall.

| Guard | Requirement it already places on this capsule |
|---|---|
| [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts) | Every added profile, scenario, and retained-evidence artifact is registered in the same change, with no unreferenced profile and no unregistered artifact. |
| [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | Every registered scenario needs exactly one pipeline case carrying a meaningful seeded semantic mutation. |
| [product example configs](../../packages/temporal-adapter/test/product-example-configs.test.ts) | Every registered profile has a live example and every example names a registered profile; two examples over one definition are admissible. |
| [host admission](../../packages/temporal-adapter/test/host-admission.test.ts) | The bounded-scope wait must be classified against concurrent host-driven waits, including the race-plus-bounded shape that must stay rejected. |
| [BPMN XML validation](../../scripts/bpmn-xml-validation.test.ts) | The new fixture must validate against the pinned normative schema, with `cancelActivity` omitted rather than asserted. |
| [contract artifact projections](../../scripts/contract-artifact-projections.test.ts) | The new operation must project into the shared wire contracts and their JSON Schemas atomically. |
| [normative reference resolution](../../scripts/normative-reference-resolution.test.ts) | Every declared reference in the profile artifact, scenarios, and fixtures must resolve in the pinned corpus. |
| [requirement ledger consistency](../../scripts/requirement-ledger-consistency.test.ts) | The requirement identifier this capsule names must exist as a ledger row; `BPMN-SUBPROCESS-BOUNDARY-TIMER-01` is added to [the requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) together with the implementation. |
| [document reviewability](../../scripts/document-reviewability.test.ts) | A new scenario family directory must be linked from its registry README, each scenario document from its family README, and this section must keep naming resolvable guards and owners with measured headroom. |
| [source hygiene](../../scripts/source-hygiene.test.ts) | No owner above the hard ceiling and none above the review target without a recorded narrow justification. |

## Stop conditions

Stop and return to review rather than deciding in implementation if any of the following holds:

- an admitted state makes the deadline-to-scope ownership ambiguous, which refutes the no-hidden-record claim and forces an explicit occurrence record;
- child quiescence and last-token-consumption turn out to be separable under this profile, which would mean the withdrawal rule was chosen without a witness;
- the checked Timer Boundary Event variant cannot carry both host domains without weakening its attachment validation;
- the host cannot recognise the scope deadline from committed state alone;
- a public observation requires an engine-specific choice, which is a phase-zero probe obligation;
- a required Lean law needs the unstated key-uniqueness invariant, which this capsule may not establish.

## Owner decisions required

1. **The arming instant for a scope host.** Recommended: arm atomically with child scope creation at Sub-Process entry, per `SPTIMER-ARM-01`. The alternative — arming when the child's first wait becomes active — makes the deadline depend on the child's internal topology and is rejected above.
2. **Checked-node reuse.** Recommended: widen the existing Timer Boundary Event variant's attachment host domain and share one attachment validator, rather than adding a second near-duplicate variant. This is the decision most likely to be revisited during implementation, so it is stated as a decision rather than assumed.
3. **A distinct host refusal identity.** Recommended: a new typed failure identity for a child-completion-and-deadline shared activation, distinct from the bounded-Activity one, so an operator can tell which semantic contract is unavailable.
4. **Standards-only scope with no CIB relationship.** Recommended: confirm, on the CIB on-demand gate's five answers above. The pinned corpus is used for scheduling and calibration only.
