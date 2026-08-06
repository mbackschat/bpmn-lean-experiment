# Interrupting Sub-Process boundary Timer proposal

## Status

**Owner-approved on 2026-08-04; at closure review.** All four decisions below are approved as recommended. The owner delegated the decision in this session rather than ruling on each one individually, so the approval rests on the recommendations and rationales recorded here and on the closed proposal review; it is not an independent owner analysis of the four alternatives. Approval authorizes exactly the scope recorded in this document and nothing beyond it.

No sentence in this document is a coverage, conformance, or CIB compatibility claim, and this document keeps its `-PROPOSAL` role until closure review approves graduation. **The conditional semantic-checkpoint stage is closed:** the review of `ef4edd4` returned `approve-with-required-edits` and the same reviewer's second correction audit at `3652549` returned `AUDIT: closed`.

This paragraph previously carried a per-lane inventory of what Lean and the evidence lanes did and did not yet contain. It is deleted rather than re-synchronized, which is the correction [the process-assessment ledger](../PROCESS-ASSESSMENT-LEDGER.md#findings) already records for this mechanism: three landed lanes had made that copy false while the owner one line below stayed correct. The owner is the only place that inventory belongs.

Implemented and absent scope is owned by [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md#current-claim) and deliberately not restated here; immediate sequencing is owned by [PLAN.md](../PLAN.md#exact-resume-point).

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `3c6b645` | `fork-turns-none` | `approve-with-required-edits` | `6a87774` |
| Semantic checkpoint | `ef4edd4` | `fork-turns-none` | `approve-with-required-edits` | `3652549` |
| Closure | `cf74cd8` | `not-recorded` | `pending` | `not-applicable` |

A commit cannot contain its own Git identity, so the immutable proposal target was recorded by a documentation-only follow-up before the review prompt was handed off, exactly as [the receipt form](../TESTING-SPEC.md#review-receipt) provides for. The reviewed target is that follow-up, `3c6b645`; its baseline is `c29db82`.

**The closure row names its target while the verdict stays `pending`, and that is the receipt's own encoding rather than an omission.** The cold closure review of `cf74cd8` returned `approve-with-required-edits` across three required findings, and [the receipt guard](../../scripts/independent-review-policy.test.ts) refuses to record that verdict until it can name a resolved correction-audit commit. The row therefore carries the target and `pending` until the same reviewer's warm audit closes, at which point the isolation, verdict, and audit cells are filled exactly as the two rows above were. The receipt form keeps isolation at `not-recorded` while a verdict is `pending`, because isolation is attested with the completed review rather than promised in advance; the review was in fact spawned with no forked turns and no model or reasoning override. The closure review also observed that the handed-off target left this row entirely `not-applicable`, which said nothing about the stage being reviewed; recording the target at `pending` is the fix.

The cold proposal review of that target ran under `fork-turns-none` and returned `approve-with-required-edits` across two required and six advisory findings. The same reviewer audited the first correction commit `bff800d` and found all eight closed, including both required findings on substance, while returning `AUDIT: open` on four prose defects introduced or left by that correction: a guard-table preamble claiming two marked rows where one is marked, a stop condition citing text above it as below, a stale guard row still asserting the ledger-row timing the same change had superseded, and a Figure 13.2 edge description over-generalized to a third state the argument does not use. All four are corrected in the commit carrying this paragraph, and the reviewer classified the round as a bounded correction rather than a material redesign, so it stays in the same thread.

A second audit of `6a87774` returned `AUDIT: closed` with no issues, and the audit column names that commit. The verdict cell keeps `approve-with-required-edits` because it records what the immutable target returned, not the state after correction; promoting it to `approve` would erase from this record that the stage was blocked. The row was `pending` until that audit closed, because [the receipt guard](../../scripts/independent-review-policy.test.ts) requires a recorded `approve-with-required-edits` verdict to name a resolved audit target and no commit can contain its own identity.

The reviewer left one forward-looking note that is deliberately not acted on yet. Two of the four second-round defects received no process-ledger entry, and the reviewer's reading is that the ledger's update rule places that obligation at capsule closure or session handoff rather than here, that the cross-reference defect is likely below the ledger's cost denominator, and that the over-generalized figure description is the better candidate of the two. Both are named in this receipt so the reflection boundary inherits them rather than rediscovering them.

**The proposal stage is closed and all four decisions are approved.** Implementation may begin, starting with the prerequisite extraction the owner inventory names. The conditional semantic-checkpoint review comes after the first green implementation checkpoint, because this capsule changes a wire contract, the checked graph, admission capability, and a transition family. The two required findings were both about *where* the work lands rather than what it means. First, the owner inventory omitted seven source owners the implementation must change, including the 75-line `checked-process-admission.ts`, which is both the tightest owner after the already-expired one and the file the second owner decision is actually about; it also omitted the profile-capability-row obligation. Second, owner decision 2 rested on a false premise: the checked-node variant's attachment reference carries no host domain in either target, so nothing there needed widening, and the real change site is a pair of near-duplicate admission validators the capsule never named or measured. Both are instances of mechanisms already carried in [the process-assessment ledger](../PROCESS-ASSESSMENT-LEDGER.md#findings) rather than new classes.

Two advisory findings changed substance rather than wording. The reviewer's reading of Clause 13.3.2's own Figure 13.2 moved the normative resolution off engine calibration and onto the standard, and the observation that quiescence is decided by an owner-scoped `timerWaits` conjunct produced a silent-deadlock counterexample this capsule now records with its own stop condition.

The cold semantic-checkpoint review of `ef4edd4` ran under `fork-turns-none` and returned `approve-with-required-edits` across six required and five advisory findings. The same reviewer audited two correction rounds: `f40cb6c` closed all six required findings on substance while introducing one false mechanism claim of its own, and `3652549` closed that claim and returned `AUDIT: closed`. The audit column names the second commit, and the verdict cell keeps `approve-with-required-edits` because it records what the immutable target returned rather than the state after correction; promoting it to `approve` would erase that the stage was blocked. The reviewer classified both rounds as bounded corrections in the same thread: across them the entire code delta is one Lean tactic flag plus two guard predicates and their negative tests, and no semantic account, rule identifier, wire contract, schema, transition family, proof boundary, profile, or evidence claim moved.

**The defect the first correction introduced is worth carrying forward, because it is the same class as the findings it was closing.** A new owner-inventory row credited the bounded-wait admission merge with rejecting a managed race beside a bounded wait, where that rejection is `managedTotal === 1` in the adapter's host classifier and already existed at the baseline. Both required findings on the profile's host claims were instances of asserting which mechanism enforces a rule without probing it, and the correction for them committed a third. [The process-assessment ledger](../PROCESS-ASSESSMENT-LEDGER.md#findings) records that instance against its own correction and names the mechanizable half the reviewer identified: seeding a conjunct mutation per negative case, which this capsule did for the host-kind allowlist and not for the child-task case.

**Two required findings were about where a rule is enforced, and one probe refuted both.** The profile's own text claimed that the attachment rule requires the unique admitted Sub-Process host. It does not: its allowlist admits a same-scope `UserTask`, so moving the deadline to the After Scope task compiles and lowers to the sibling family's `awaitBoundedUserTask` shape, which `profileAllowsProgramShape` then rejects at scenario and start admission. The host identity is pinned one layer later than claimed, and no execution path admits the wrong host. The adjacent child-task negative case had inherited the same misreading in its comment, crediting the host-kind conjunct where the same-scope conjunct is what fails; only the `NormalEnd` and `Start` cases carry host-kind weight, as their own comment already said.

**Three required findings were claim-versus-measurement defects.** The owner inventory omitted four owners this change created, so the recomputing guard measured only the rows that existed; the admission lock was described as eight cases where seven execute; and two prose figures in [PLAN.md](../PLAN.md) about the kernel-decide sweep were wrong — a 199-site denominator no command produces, against 232, and a guard claim that was false for the combinator position. The sixth finding is the sharpest: the same range added a repository-wide `native_decide` prohibition to [CLAUDE.md](../../CLAUDE.md) while 56 live tactic sites contradicted it. That claim is now executable rather than asserted, and a plain `cases outcome <;> decide` the guard could not see is converted.

Two advisory findings are deliberately carried into closure rather than answered here. `SPTIMER-OBSERVE-01` is asserted today against `state.userTaskWaits` rather than the canonical projection, so closure must assert the public observation or the separating witness is an internal array. And `isWellFormedEnterBoundedScopeOperation` checks only that the arming origin differs from the boundary node, where the sibling requires exact host identity; `definitionScopes[].originElementId` makes the stronger check available in both targets.

The semantic-checkpoint row previously named `3f2de80`, the first green implementation checkpoint, as its pending target. A commit cannot contain its own Git identity, so the handed-off immutable target is the documentation-only follow-up carrying this paragraph, which brings this Status section current with that implementation; its baseline is `225e32d`, so the reviewed range is the checkpoint commit, the Lean `decide +kernel` reduction, one documentation correction, and this update. Every focused gate is green on that tree — semantic core, BPMN source, contracts, infrastructure, source hygiene, harness types, `lake build`, and `lake test` — and the complete `./scripts/verify.sh` gate runs concurrently with the review rather than before it, because it mutates no tracked file. Writes to the Lean victory lane, the two answer-free scenarios, and the Temporal witness stay paused until the verdict.

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

Read literally, the set that gets terminated *excludes* nested Activities in `Ready` and `Active` — that is, it excludes exactly the live child work an interruption exists to stop, and the prose then supplies no other disposition for it. That reading is incoherent: it would leave a `Terminating` Sub-Process containing an `Active` child User Task with no rule to remove it and no rule to let it complete.

**The same clause contradicts that reading in its own normative figure.** Clause 13.3.2 states that the lifecycle is "described as a UML state diagram in Figure 13.2". That figure carries an `Activity Interrupted` edge out of `Ready` and out of `Active`, each into a choice offering `Interrupting Event` against `An Alternative Path for Event Gateway Selected → Withdrawn`, and the `Interrupting Event` path reaches a further choice splitting `Error → Failing` and `Non-Error → Terminating → Terminated`. So `Ready` and `Active` are interruptible states in the figure, and the prose's exclusion of them cannot be a deliberate carve-out. `Completing` also carries an `Activity Interrupted` edge, but directly into the `Error`/`Non-Error` choice with no `Interrupting Event` label and no `Withdrawn` alternative; that state is not part of this argument, which rests only on `Ready` and `Active`. What the figure does **not** supply is parent-to-child propagation: its edges describe an Activity being interrupted, not a parent in `Terminating` terminating its contents.

This proposal therefore resolves the conflict as **all non-final nested work is terminated**, on two normative reasons plus one non-load-bearing check:

1. Figure 13.2 establishes that a nested Activity in `Ready` or `Active` is an interruptible state reaching `Terminating` on a non-Error interrupting Event, which is what the prose sentence denies.
2. Clause 13.5.3's own instruction is that the attached Activity "is then cancelled", and Clause 13.3.4 makes the Sub-Process's contained elements part of that Activity. Together with reason 1 this supplies the propagation the figure alone does not: a cancelled Activity that still owns a live wait has not been cancelled.
3. Not load-bearing, and recorded only so it is not mistaken for authority: the project already resolved the same substance from the other direction in `SUBERR-INTERRUPT-01` in the [Sub-Process Error propagation specification](SUBPROCESS-ERROR-PROPAGATION-SPEC.md#stable-semantic-rules), and the pinned CIB engine agrees at the public boundary. Neither is evidence about BPMN, and no CIB relationship is registered on either.

The conflict is novel to this capsule. The Error capsule never needed the clause, because an Error is thrown from *inside* the child and the child scope's removal answers the nested question implicitly. A Timer arrives at the boundary from outside, which is exactly what makes the clause load-bearing here.

### A second normative tension, recorded but not resolved

Clause 10.5.6, which this proposal cites for what interrupting means, also states under its `Interrupting Event Handlers` heading — whose scope includes Timer — that "The parent **Activity** is canceled **after** either the error handler completes or **Sequence Flow** from the boundary **Event** is followed." That is a *later* cancellation point than Clause 13.5.3's order, which cancels the Activity before following the boundary Flow.

This proposal does not resolve the tension and does not need to: `SPTIMER-INTERRUPT-01` is one atomic transition with no observable intermediate state, so the two orders are indistinguishable at the approved observation boundary. It is recorded because a later capsule that exposes an intermediate state, or that admits an inline handler, inherits a real choice here rather than discovering one.

The same sub-clause also carries a published erratum in the pinned corpus: a `Non-interrupting Event Handlers` heading whose body describes `cancelActivity` set to *false*. It is present in the PDF and is not a conversion artifact. Nothing in this proposal depends on that passage.

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

The profile pins a shape class, not one diagram, exactly as its sibling does. Admission is layered and the layers are not interchangeable, which matters because the deadline's host is pinned by a later layer than this section originally claimed. The compile boundary compares an exact checked-node multiset, generic graph reachability, and the attachment rule's enumerated host-kind allowlist; the exact *operation* multiset is compared by `profileAllowsProgramShape` in [semantic-process admission](../../packages/semantic-core/src/semantic-process-admission.ts), which scenario and start admission call and `compileBpmnToSemanticProcess` does not. That operation multiset is therefore the conjunct that requires the Sub-Process host, and [the residual-freedom paragraph](#exact-source-profile) records the probe that establishes it.

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

**One residual admission freedom is expected and is recorded rather than claimed away.** Which of the two root None End Events each route reaches is semantically inert under the canonical observation, so at least two topologies are admitted.

**A second freedom does exist at the compile boundary, and this paragraph previously denied it.** The earlier claim was that no freedom remains over which Activity hosts the deadline, because only one admitted Flow Node is a Sub-Process and the attachment rule already requires that host. The attachment rule requires no such thing: its allowlist admits a `UserTask` host in the boundary node's own scope, so moving `attachedToRef` from the Sub-Process to the After Scope User Task **compiles**, and it lowers to a different family's program — `awaitBoundedUserTask` with a plain `enterScope`, the sibling capsule's shape, rather than `enterBoundedScope`. Under this profile's identity that program is then rejected by `profileAllowsProgramShape`, which the probe confirms returns `false` for it and `true` for the admitted shape. So the freedom is real, it is closed one layer later by the operation multiset, and no execution path admits the wrong host. The correction is to the claim about *which mechanism* closes it: the attachment rule constrains the host's kind and scope, never its identity. This is the probe answering the question the paragraph promised to answer by probe rather than assertion.

Admission rejects a missing or unresolvable `attachedToRef`, an `attachedToRef` naming anything other than the admitted Sub-Process, `triggeredByEvent="true"`, `cancelActivity="false"`, a second Boundary Event, a non-Timer or second Timer Event Definition, any duration other than `PT1S`, an incoming boundary Flow, a nested Sub-Process, a second child task, a missing child Start or End, a missing follow-on task on either route, and any parser warning.

The source compiler manifest needs **no new CMOF fact**: `BoundaryEvent`, `attachedToRef`, and `cancelActivity` come from the [boundary-error specification](BOUNDARY-ERROR-SPEC.md), `TimerEventDefinition` with `timeDuration` from the Intermediate Catch Timer specification, and `SubProcess` with `triggeredByEvent` from the [embedded Sub-Process completion specification](EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md). Each must be confirmed present in `bpmn-2.0.2-semantic-process-metamodel.json` before the first edit; one that turns out to be missing is a finding to record, not a silent manifest addition.

## Checked graph and lowering

The checked graph reuses the existing Timer Boundary Event node variant introduced by the sibling capsule unchanged. Its payload is the boundary event identity, the attachment reference, the exact retained `PT1S` literal, and the boundary Sequence Flow identity, and `attachedToRef` is an undiscriminated identifier in both targets — a bare `string` in [the Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) and a `NodeId` in [its Lean mirror](../../BpmnSemantics/SemanticProcessContract.lean). The variant carries **no host domain to widen**, so no new or amended checked-node variant is proposed.

The User Task restriction lives entirely in two admission validators, and they are the real change site: `boundaryTimersAttachToUserTasks` in [checked-process admission](../../packages/bpmn-source/src/checked-process-admission.ts) and `checkedBoundaryTimerAttachmentValid` in [its Lean counterpart](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean). Each resolves the reference to a node whose kind is `UserTask`, requires the host to sit in the boundary node's own scope, and requires no two deadlines to claim one host. The same-scope and one-host conjuncts already hold for a Sub-Process host, because the Sub-Process node and its boundary event both sit in the parent scope; only the host-kind conjunct excludes this profile. Widening it to admit a Sub-Process is decision 2 below.

That widening carries a stated risk rather than being mechanical. Both validators exist for one reason, recorded in their own documentation: a boundary Timer node that admits but resolves to no host lowers to no operation, because the deadline belongs to the host Activity's operation rather than to the boundary node, so a misattached node yields a *silently deadline-free program* that nothing downstream rejects. A host-kind predicate widened to any Activity would readmit exactly that failure for every Activity kind this profile excludes. The recommendation is therefore an explicitly enumerated host-kind set, not a relaxation to "any Activity".

The boundary Sequence Flow is a token-carrying control place in the ordinary `ControlPlace.origin` arm, as in the sibling. The Event-Based Gateway's disjoint configuration-Flow classification does not apply and no second exception is added.

Lowering produces one bounded-scope operation that owns the child scope entry and its deadline together, rather than a standalone `awaitTimer` beside a scope entry. Lean independently lowers the checked graph and requires exact equality with the received program; retaining the exact `PT1S` literal in checked source is what lets Lean normalize it to `1000` independently.

`packages/bpmn-source/src/semantic-process-lowering.ts` is at 25 lines of headroom and its sibling capsule already recorded that budget as expired. A behavior-preserving extraction of that owner is therefore a prerequisite commit, not work to be done inside this semantic change.

## Runtime state

No new runtime collection is proposed. The child scope occurrence already exists with complete identity, and the Timer wait family already carries complete occurrence identity.

**The deadline's `owner` must be the *parent* scope occurrence, and this is a correctness requirement rather than a modelling preference.** `isScopeOccurrenceQuiescent` in [the scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) decides quiescence as nine owner-scoped emptiness conjuncts, one of which requires that no `timerWaits` entry is owned by the occurrence under test. A deadline owned by the *child* occurrence would therefore make that occurrence permanently non-quiescent, so `SPTIMER-QUIESCE-01` could never fire and the quiescence arm would deadlock silently. Under this profile that failure has **no separating witness**: the deadline would still win at its instant, the boundary route would still be observable, and only the normal route would be unreachable — which is why the requirement is stated here, with a matching stop condition, rather than left to be discovered by a scenario that does not exist. Owning the deadline at the parent occurrence is also what "owned by the Sub-Process Activity occurrence" means, since the Sub-Process node itself sits in the parent scope.

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
| `SPTIMER-REFUSE-01` | reuses existing identity and exact-time refusal | quantified off-deadline and wrong-identity refusal | focused test over both stale directions and four wrong identities | **none** — both refusal shapes are structurally unregisterable, see below | refused shared activation answered by the Workflow's failure |
| `SPTIMER-OBSERVE-01` | canonical observation contract | observation fixtures | focused test over both routes | both schedules' route discriminator | Query projection equals the pure core |

Two registered answer-free schedules exist, one per victory route, each with a meaningful seeded semantic mutation. The pre-due witness lives in Lean and the semantic core and **not** as a registered scenario, for the structural reason the sibling recorded: the Temporal host derives the firing instant from the wait's own committed `deadlineMs` and the runner admits one firing per scenario, so no target can present an off-deadline instant.

**`SPTIMER-REFUSE-01`'s differential lane was planned as "each schedule's follow-up refusal" and that is not registerable.** The correction rests on the delivery boundary rather than on a scheduling preference, and the two halves fail for different reasons. Only `completeUserTaskInstance` stimuli are delivered to Temporal — [completion delivery](../../packages/temporal-adapter/src/completion-delivery.ts) takes a completion array and the host derives every firing itself — so a stale `fireTimer` after the quiescence victory would reach no host at all. And a stale child completion after the deadline victory races the host's own derived firing, which is the same limit the sibling capsule recorded when it excluded the abandoned Activity's stale completion. Both stale directions therefore stay in Lean and [the focused core test](../../packages/semantic-core/test/subprocess-boundary-timer.test.ts), where the order is exact and both refusals assert exact state preservation. This is a two-lane rule, not a three-lane one, and the row above now says so.

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
- **The schedulers' refusal identities.** Two families share one readiness mechanism today and this capsule makes a third. A copied identity would be invisible to every existing assertion, so the new identity needs its own negative assertion, exactly as the bounded-Activity one has. **Closed.** [The bounded-scope witness](../../packages/temporal-adapter/test/bounded-scope-deadline-temporal.test.ts) requires the shared-activation refusal to carry `BpmnBoundedScopeSchedulerUnavailable` and *not* the sibling's identity, and seeding the copied identity fails exactly that assertion while the other three stay green. The risk was also reduced at its source rather than only asserted against: the two families now instantiate one parameterized scheduler whose identity is a descriptor field, so a copy would have to be written deliberately rather than inherited by duplication.
- **The two attachment validators are correlated by construction.** Recorded in full under the owner inventory, because that is where the change sites are named: one host predicate encoded twice means a wrong widening lands identically in Lean and TypeScript, so agreement between them proves nothing about the widening.

## Versioning consequences

Pre-release policy applies. The new operation kind is added atomically across the checked-graph compiler, the Semantic Process contract, the JSON Schemas, the Lean decoder and lowering, the semantic core, the adapter's typed contract module and host-capability classifier, the differential catalog, and every fixture, with no compatibility reader, format counter, migration branch, or Workflow patch. No retained Event History is kept beyond the disposable gate.

### Owners this implementation grows

Nonblank headroom from `node scripts/what-binds.ts <path>...`, **measured after the first green implementation checkpoint** rather than before it. Every figure is recomputed by [the reviewability guard](../../scripts/document-reviewability.test.ts) on each run and must equal the measured value, so changing an owner's size fails the gate and forces this inventory to be revisited. That is what happened here: the checkpoint moved fifteen of these figures and the guard rejected the pre-implementation table.

| Owner | Headroom | Consequence, and when it expires |
|---|---:|---|
| [checked-graph lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 83 | Cleared from the expired 25 by extracting [conditional branch lowering](../../packages/bpmn-source/src/conditional-branch-lowering.ts) and [the identifier conventions](../../packages/bpmn-source/src/semantic-process-identifiers.ts) into their own owners. Re-expires under 40. |
| [checked-process admission](../../packages/bpmn-source/src/checked-process-admission.ts) | 61 | Decision 2's own file. `boundaryTimersAttachToUserTasks` is now `boundaryTimersAttachToDeadlineOwners` over an enumerated allowlist, renamed because the predicate is no longer about User Tasks. Above 40 and not yet expired. |
| [Lean checked-process admission](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) | 305 | Holds `checkedBoundaryTimerAttachmentValid` and now `checkedOwnsBoundaryTimerDeadline`, the independent mirror of the same allowlist. |
| [source projection for boundary Timers](../../packages/bpmn-source/src/timer-boundary-event-source.ts) | 515 | **Examined and needs no change for the host.** It resolves `attachedToRef` and never inspects the host's kind, and [the compiler](../../packages/bpmn-source/src/checked-process-compiler.ts) dispatches it on the Boundary Event type alone, so a Sub-Process host already projects. The row is retained rather than deleted so this record shows the owner was opened; the entry it replaces asserted a change from the module's role rather than its contents. |
| [checked-process compiler](../../packages/bpmn-source/src/checked-process-compiler.ts) | 81 | Examined; the Sub-Process and Boundary Event node projections it dispatches both already exist, so no dispatch change is expected. Tight enough that any addition here needs re-measurement first. |
| [semantic profile admission](../../packages/semantic-core/src/semantic-process-profile.ts) | 161 | Sufficient; owns `SemanticProfileId` and the exact checked-node and operation multiset predicates this profile's admission is specified in terms of. |
| [Lean profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 361 | Sufficient; the independent counterpart of those multiset predicates. |
| [Lean Semantic Process contract](../../BpmnSemantics/SemanticProcessContract.lean) | 171 | Carries the `enterBoundedScope` constructor, which reuses the existing `BoundaryTimerArm` structure. Still above 40. |
| [Lean lowering](../../BpmnSemantics/SemanticProcess/Lowering.lean) | 159 | Sufficient; carries the independent checked-graph-to-program lowering this capsule requires to equal the received program. |
| [semantic core runtime](../../packages/semantic-core/src/semantic-process-runtime.ts) | 22 | **Expired.** Dispatch only, as intended: the family's transitions live in [the bounded-scope runtime](../../packages/semantic-core/src/semantic-process-bounded-scope-runtime.ts) and even the completion-plus-withdrawal composition was moved there rather than orchestrated in the dispatcher. The next change touching this file needs a behavior-preserving extraction first. |
| [Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 23 | **Expired.** One operation kind and no new node variant cost 28 lines, partly offset by extracting the shared `BoundaryTimerArm` type that the wire schema and Lean contract already shared. The next contract addition needs an extraction first. |
| [bounded-scope runtime](../../packages/semantic-core/src/semantic-process-bounded-scope-runtime.ts) | 358 | **Created by this change**, 242 nonblank lines. Owns the family's atomic arming, both victory transitions, and the completion-plus-withdrawal composition, following the precedent that each managed wait family owns its own module. |
| [bounded-wait admission](../../packages/semantic-core/src/bounded-wait-admission.ts) | 457 | **Created by this change**, replacing the deleted `bounded-task-admission.ts` because the interrupting deadline arm is one wire shape, the shared `BoundaryTimerArm`, that must be checked identically for both hosts; the hosts differ only in what the deadline races. This owner decides program well-formedness and nothing about host capability. |
| [scope cancellation](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts) | 499 | **Created by this change** by extracting regional cancellation out of [the Error runtime](../../packages/semantic-core/src/semantic-process-error-runtime.ts) so both triggers share one owner. This is the shared mechanism the common-mode risk section names, which is why the trigger path needs its own discriminator. |
| [Lean bounded scope](../../BpmnSemantics/SemanticProcess/BoundedScope.lean) | 73 | **Created by this change** as the narrow module beside `BoundedTask.lean` that the `Execution.lean` row promised. Carries arming, both victory arms, `BoundedScopeVictoryStep`, both evaluator-soundness bridges, the withdrawal law, the counter-and-history preservation law, and the logical-time separation law. The capsule's required Lean lane is complete. Closure review then added the two per-evaluator logical-time laws that own the arms' separation, and rewrote `parentOwned` from an unsatisfiable premise into one guarded by the transition's own lookups, which is what left 73 lines of headroom here. |
| [scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) | 412 | Sufficient; owns the quiescence predicate this family races. |
| [graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 155 | Grew by three clauses, one of them unforeseen: `hasOneCompletionStrategyPerScope` counted only `enterScope` as a child scope's entry, so a deadline-bearing child scope had no entry at all and the program read as malformed. |
| [Lean runtime state](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 89 | **This row's prediction held.** Adding the shared completion's component-preservation lemma took it to 602 nonblank against the 600 target, which forced the extraction it warned about rather than an owner-approved exception. |
| [Lean scope completion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) | 497 | **Created by this change** as the extraction the row above forced. Owns the quiescence predicate, the normal completion transition, its extracted rewrite selector, and their preservation lemma; regional cancellation stays with runtime state because interruption shares no decision with quiescence. |
| [Lean execution](../../BpmnSemantics/SemanticProcess/Execution.lean) | 72 | Dispatch only; the family's relation and laws belong in a new narrow module beside [BoundedTask.lean](../../BpmnSemantics/SemanticProcess/BoundedTask.lean). |
| [Lean program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 205 | Sufficient. |
| [host capability classifier](../../packages/temporal-adapter/src/host-admission.ts) | 422 | Gained the bounded-scope class. The two copied managed-class blocks became one declaration-ordered table rather than a third copy, which preserves the existing refusal identities exactly. |
| [adapter typed contracts](../../packages/temporal-adapter/src/contracts.ts) | 338 | Sufficient; now carries the `BpmnBoundedScopeSchedulerUnavailable` refusal identity. |
| [bounded deadline scheduler](../../packages/temporal-adapter/src/bounded-deadline-scheduler.ts) | 386 | **Renamed and generalized by this change** from `bounded-activity-deadline-scheduler.ts`. One family-parameterized mechanism now serves both boundary-deadline host kinds under separate refusal identities, because this section's own common-mode risk names a third near-duplicate scheduler as the defect the readiness extraction removed. |
| [Workflow implementation](../../packages/temporal-adapter/src/workflow-implementation.ts) | 9 | **Effectively full.** Gained per-family scheduler selection and reconciliation over both boundary-deadline kinds. The next change touching it requires a behavior-preserving extraction as its own commit first. |
| [boundary deadline assertions](../../packages/temporal-adapter/test/boundary-deadline-assertions.ts) | 504 | **Created by this change** by extracting the host assertions both witnesses use. They read only emitted commands, so they are generic over which wait the deadline bounds; the refusal identity stays a parameter because the families must not share one. |
| [bounded scope witness](../../packages/temporal-adapter/test/bounded-scope-deadline-witness.ts) | 407 | **Created by this change.** Drives the three separating activation shapes through the shared direct-VM harness and derives every element identity from the committed program rather than naming it. |
| [bounded scope host locks](../../packages/temporal-adapter/test/bounded-scope-deadline-temporal.test.ts) | 510 | **Created by this change.** Carries the negative assertion for the new refusal identity, verified discriminating by seeding the sibling's identity. |

Two owners are now expired: [the Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) at 23 and [the semantic core runtime](../../packages/semantic-core/src/semantic-process-runtime.ts) at 22. Neither is above its review target, so neither blocks this checkpoint, but the next change that grows either one requires a behavior-preserving extraction as its own commit first. No extraction is ever work done under a size squeeze inside a semantic change.

That extraction also removed a pre-existing smell rather than only moving lines: the `place:` control-place prefix was spelled in three places across the lowering modules, and it is wire-visible — it reaches the program, its JSON Schema, Lean's independent decoder, and runtime token state — so a second spelling would have been a silent contract fork. It now has one owner.

The two attachment validators are near-duplicates across TypeScript and Lean encoding one host predicate, so widening them is a single conceptual edit applied twice. A wrong widening therefore lands identically in both targets and the differential lane cannot separate them. That is the same correlated-failure shape recorded under common-mode risks for the shared cancellation helper, but at the admission boundary, and it is why decision 2's negative cases must be written per excluded host kind rather than as one positive case.

**Decision 2's negative form turned out to be partly unconstructible, and the substitute is weaker in a way worth stating.** A case per excluded *Activity* kind cannot exist at the profile boundary: no registered profile admits both a Timer Boundary Event and a Service Task, Call Activity, or Receive Task, so such a fixture is rejected by the node multiset before the attachment rule runs and its pass would prove nothing about the host-kind conjunct. The implemented negatives instead attach the deadline to a None End Event and to the None Start Event, both of which are in this profile's own admitted multiset and in the boundary node's scope, so the allowlist is the only conjunct left that can reject them. Seeding the wrong widening — the allowlist's closing `false` replaced by `true` — fails exactly those two and nothing else, which is the evidence that they discriminate. A third candidate, attaching the deadline to itself, was dropped after that seeding showed it is rejected without the allowlist and would have looked like evidence for a rule it does not exercise.

### Guards and oracles this implementation must change or satisfy

These oracles already constrain the planned artifacts, with one exception marked in its own row as new assertion work. Enumerate them again with `node scripts/what-binds.ts` before the first edit rather than from recall.

| Guard | Requirement it places on this capsule |
|---|---|
| [profile-parameterized admission](../../docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) via [document reviewability](../../scripts/document-reviewability.test.ts) | Exactly one `## Current profile capabilities` row per registered profile identifier. A newly registered profile without its row turns the gate red, so the row lands in the same change as the profile. |
| [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts) | Every added profile, scenario, and retained-evidence artifact is registered in the same change, with no unreferenced profile and no unregistered artifact. |
| [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | Every registered scenario needs exactly one pipeline case carrying a meaningful seeded semantic mutation. |
| [product example configs](../../packages/temporal-adapter/test/product-example-configs.test.ts) | Every registered profile has a live example and every example names a registered profile; two examples over one definition are admissible. |
| [host admission](../../packages/temporal-adapter/test/host-admission.test.ts) | **New assertion work, not an existing constraint.** The classifier already rejects two concurrent managed waits in source, but no test feeds a bounded-wait-bearing program in and expects its refusal; the existing two-managed cases are both same-class races. This capsule adds the bounded-scope case rather than inheriting it. |
| [BPMN XML validation](../../scripts/bpmn-xml-validation.test.ts) | The new fixture must validate against the pinned normative schema, with `cancelActivity` omitted rather than asserted. |
| [contract artifact projections](../../scripts/contract-artifact-projections.test.ts) | The new operation must project into the shared wire contracts and their JSON Schemas atomically. |
| [normative reference resolution](../../scripts/normative-reference-resolution.test.ts) | Every declared reference in the profile artifact, scenarios, and fixtures must resolve in the pinned corpus. |
| [requirement ledger consistency](../../scripts/requirement-ledger-consistency.test.ts) | The requirement identifier this capsule names must exist as a ledger row. `BPMN-SUBPROCESS-BOUNDARY-TIMER-01` already exists in [the requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) as `unsupported`, added when this proposal was written; the implementation advances its disposition rather than creating the row. |
| [document reviewability](../../scripts/document-reviewability.test.ts) | A new scenario family directory must be linked from its registry README, each scenario document from its family README, and this section must keep naming resolvable guards and owners with measured headroom. |
| [source hygiene](../../scripts/source-hygiene.test.ts) | No owner above the hard ceiling and none above the review target without a recorded narrow justification. |

## Stop conditions

Stop and return to review rather than deciding in implementation if any of the following holds:

- an admitted state makes the deadline-to-scope ownership ambiguous, which refutes the no-hidden-record claim and forces an explicit occurrence record;
- child quiescence and last-token-consumption turn out to be separable under this profile, which would mean the withdrawal rule was chosen without a witness;
- either attachment validator cannot admit a Sub-Process host without also readmitting a host kind this profile excludes, which would mean the enumerated-set widening is unavailable and the deadline-free program is back;
- the deadline's owning scope occurrence cannot be the parent occurrence, which would make `SPTIMER-QUIESCE-01` unreachable for the reason [the runtime-state section](#runtime-state) gives;
- the host cannot recognise the scope deadline from committed state alone;
- a public observation requires an engine-specific choice, which is a phase-zero probe obligation;
- a required Lean law needs the unstated key-uniqueness invariant, which this capsule may not establish.

## Owner decisions

All four are **approved as recommended**, under the delegation recorded in the Status section.


1. **The arming instant for a scope host.** Recommended: arm atomically with child scope creation at Sub-Process entry, per `SPTIMER-ARM-01`. The alternative — arming when the child's first wait becomes active — makes the deadline depend on the child's internal topology and is rejected above.
2. **How the two attachment validators admit a Sub-Process host.** Recommended: widen each validator's host-kind conjunct to an explicitly enumerated set of `UserTask` and the admitted Sub-Process, leaving the same-scope and one-host conjuncts untouched, and add a negative case per newly excluded Activity kind. The checked-node variant itself needs no change, because its attachment reference carries no host domain. The alternative — relaxing the conjunct to any Activity — is rejected above because it readmits the silently deadline-free program the validators exist to prevent.
3. **A distinct host refusal identity.** Recommended: a new typed failure identity for a child-completion-and-deadline shared activation, distinct from the bounded-Activity one, so an operator can tell which semantic contract is unavailable.
4. **Standards-only scope with no CIB relationship.** Recommended: confirm, on the CIB on-demand gate's five answers above. The pinned corpus is used for scheduling and calibration only.
