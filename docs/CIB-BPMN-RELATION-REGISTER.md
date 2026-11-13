# CIB Seven and BPMN 2.0.2 relationship register

**Status:** Active central register

**Scope:** CIB Seven behavior reviewed by this project against OMG BPMN 2.0.2 Process Execution requirements

This document owns the classification of CIB Seven behavior relative to BPMN 2.0.2. It keeps ordinary conformance, operational interpretations, extensions, configuration-specific realizations, limitations, and deviations distinct.

This register is the CIB compatibility overlay, not the BPMN coverage ledger or the A12 adoption ledger. Add an entry only when a selected CIB behavior contributes a distinct classified fact. An A12 model may trigger the investigation, but its handler name, business data, façade, and adoption status remain outside the relationship proposition.

## Working presumption

CIB Seven is treated as a mature, compliance-oriented BPMN execution reference. The default expectation is that it implements BPMN 2.0.2 faithfully, makes underspecified or inconsistent parts operational, and adds explicit engine capabilities around the standard.

CIB being more concrete than the standard is not a deviation. A CIB extension is not a deviation merely because BPMN does not define its protocol. A deviation is recorded only when a clear normative requirement and separating evidence establish incompatible behavior.

This presumption guides investigation; it does not replace evidence or authorize an unbounded conformance claim.

## Current dashboard

The counts below cover only entries recorded by this project, including the separately counted open candidates, and only live entries: a withdrawn or superseded entry keeps its heading for navigation and is not counted. Selection and qualification follow each entry's status. Zero does not mean that the complete CIB Seven engine has been proven free of deviations.

| Lane | Recorded entries | Open candidates | Meaning |
|---|---:|---:|---|
| Normative agreement records | 24 | 0 | A bounded BPMN requirement and pinned CIB observation agree; candidates remain unapproved |
| Permitted operational details | 18 | 0 | CIB or the oracle adapter chooses host mechanics without changing required BPMN observations |
| Confirmed normative deviations | 0 | 13 | Clear BPMN requirement and pinned CIB evidence establish incompatible behavior |
| CIB interpretations of BPMN gaps or inconsistencies | 41 | 1 | CIB selects an operational meaning where BPMN does not uniquely settle it |
| CIB extension records | 47 | 2 | Project profile deliberately includes behavior beyond bare BPMN execution; candidates remain unselected |
| Configuration-specific realizations | 14 | 0 | Behavior is permitted or meaningful only under a declared CIB environment |
| Known CIB limitations within reviewed scope | 53 | 0 | Unsupported or incomplete behavior that is not yet classified as a normative deviation |

The sequential User Task account has no recorded CIB deviation. That statement is bounded to its clauses, pinned environment, witnesses, and observation surface; it is not a general CIB conformance result.

## Prominent deviation register

### Confirmed deviations

None recorded.

### Candidate deviations requiring classification

### CIB-DEV-0001 — parallel join activates from duplicate arrivals through one incoming flow

**Status:** Candidate deviation; owner decision recorded, confirmation evidence incomplete

**Summary:** Pinned CIB Seven `2.2.0` activates a Parallel Gateway join after two executions arrive through `Flow_Left_Join` while no execution has arrived through the other incoming `Flow_Right_Join`.

**BPMN requirement:** BPMN 2.0.2 Clause 10.6.4 requires a converging Parallel Gateway to wait for all incoming flows. Clause 13.4.1 and Table 13.1 require at least one offered token on every incoming Sequence Flow, consume exactly one from each incoming Sequence Flow, retain excess offered tokens, and produce exactly one on each outgoing Sequence Flow. The CMOF/XSD model preserves incoming `SequenceFlow` references; no Parallel Gateway attribute weakens that condition.

**BPMN sources and issues:** Clauses 10.6.4 and 13.4.1, Figure 13.3, Table 13.1, CMOF `ParallelGateway`/`Gateway`/`FlowNode`/`SequenceFlow`, XSD `tParallelGateway`, and open issues [BPMN21-268](https://issues.omg.org/issues/BPMN21-268) and [BPMN21-429](https://issues.omg.org/issues/BPMN21-429). The first supplies the uncontrolled-merge mechanism used to create two same-flow arrivals; the second cautions against treating incidental outgoing-flow order as a portable semantic order. Neither changes the per-incoming-flow join condition.

**CIB release and configuration:** CIB Seven `2.2.0` at revision `834a9874760de8a0107f7c1b32806e37f17fb017`, Java 21, H2 `2.3.232`, disabled job executor, audit history with `P180D` default TTL, and an isolated in-memory engine created by the project test harness.

**Separating model and scenario:** The schema-valid [duplicate-same-flow BPMN model](../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/CibSevenParallelGatewayProbeTest.duplicateSameFlow.bpmn) forks into two left User Tasks and one right User Task. The two left paths activate two instances of an uncontrolled-merge User Task; completing those instances sends two executions through the join's left incoming Sequence Flow while the right User Task remains active.

**CIB observation:** The [bounded pristine-lane probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenParallelGatewayProbeTest.java) observes one live `User_Right` and, at the same time, one live `User_After_Join`. The pinned [`ParallelGatewayActivityBehavior`](https://github.com/cibseven/cibseven/blob/834a9874760de8a0107f7c1b32806e37f17fb017/engine/src/main/java/org/cibseven/bpm/engine/impl/bpmn/behavior/ParallelGatewayActivityBehavior.java) explains the observation by comparing the number of inactive concurrent executions at the gateway with the number of incoming transitions, without checking which incoming transition supplied each execution.

**Expected normative behavior:** The join remains inactive while `Flow_Right_Join` has offered no token. Two offers on `Flow_Left_Join` cannot substitute for the missing right-flow offer.

**Alternative explanations excluded:** The exact model validates against the pinned BPMN 2.0.2 `BPMN20.xsd`; CIB deploys and executes it without parser warning; the probe observes public task existence rather than internal PVM state; `User_Right` proves the right branch has not traversed `Flow_Right_Join`; and neither task-query order nor project canonicalization can create `User_After_Join`. The result agrees with the pinned engine source. The balanced normative scenarios now calibrate raw task-query projection and canonical sorting but cannot separate the competing join-readiness accounts; the retained answer-free [left-pair-first witness](../scenarios/open-rows/parallel-region-compositions/README.md) separates them.

**Classification rationale:** This is more than a representation difference because it changes the publicly observable point at which downstream BPMN work becomes active. The normative account now has answer-free content-bound balanced evidence, a mutation-sensitive raw-to-canonical projection, and complete balanced Lean, CIB, TypeScript, and Temporal impact evidence. The separating duplicate-left/no-right case is an immutable answer-free artifact: the [left-pair-first witness](../scenarios/open-rows/parallel-region-compositions/README.md)'s retained CIB `2.2.0` evidence (2026-11-09) keeps the raw task queries and the canonical projection, in which `Decide` opens after both merged left tasks complete while `ReviewC` stays open. The entry remains a candidate until an owner review promotes it.

**Profile decision:** The [parallel fork/join spec](kernel/semantics/FLOW-SEMANTICS-SPEC.md) follows normative per-incoming-Sequence-Flow behavior. The current `cibseven-2.2.0` profile is not expanded to claim parallel compatibility. Pinned CIB count-based behavior may be retained later only in an explicitly separate compatibility profile; one behavior cannot be claimed as both exact CIB compatibility and BPMN conformance.

**Capsule and semantic rule IDs:** The [parallel fork/join spec](kernel/semantics/FLOW-SEMANTICS-SPEC.md) owns `PAR-JOIN-READY-01` and `PAR-JOIN-CONSUME-01`. Its balanced evidence lanes are closed as a draft, and the [left-pair-first witness](../scenarios/open-rows/parallel-region-compositions/README.md) retains the separating case's immutable evidence.

**Lean, TypeScript, Temporal, and compatibility impact:** Lean and TypeScript retain incoming-flow provenance and excess-token multiplicity under the normative account. Focused Temporal evidence shows that the adapter hosts that account without interpreting join readiness or hiding the difference as scheduling. Balanced CIB evidence agrees but cannot distinguish the normative account from CIB's count-based implementation. A CIB-compatible implementation of the separating case would need an explicitly named deviation profile, which remains intentionally absent.

**Owner decision:** Approved normative BPMN behavior for the next capsule on 2026-07-26, with no parallel compatibility claim for the current CIB profile and no production implementation of the observed count-based behavior.

**Last reviewed:** 2026-07-26.

### CIB-DEV-0002 — a parked Inclusive join is re-examined only when another execution arrives at it

**Status:** Candidate deviation; owner decision recorded, confirmation evidence incomplete

**Summary:** Pinned CIB Seven `2.2.0` evaluates a converging Inclusive Gateway's activation only when an execution arrives at it. When the last execution that could reach an empty incoming flow ends elsewhere, or a Boundary Event withdraws it, the executions waiting at the join are never re-examined. The instance stays running with no task, job or subscription that could resume it.

**BPMN requirement:** BPMN 2.0.2 Table 13.3 (§13.4.3) states when the gateway "is activated": a predicate over the state of its scope occurrence, not an arrival. Table 13.2, the Exclusive Gateway's, is the one that uses arrival language ("Each token arriving … activates"). The table claims the General Synchronizing Merge (WCP-38), which needs activation without an arrival. PC-CF-04 rejects "waiting forever for an unselected path".

**BPMN sources and issues:** Table 13.3 and §13.4.3; Table 13.2 for the contrast. §13.3.5 is the Ad-Hoc Sub-Process's semantics; its fixpoint lists only Parallel and Complex Gateways, so it is at most an analogy. Open issue [BPMN21-450](https://issues.omg.org/issues/BPMN21-450) concerns the "also a directed path" clause, not the trigger, and changes nothing here.

**CIB release and configuration:** CIB Seven `2.2.0` at revision `834a9874760de8a0107f7c1b32806e37f17fb017`. The configuration is the pinned oracle environment of CIB-CFG-0001, with JUEL conditions under CIB-CFG-0005. No setting changes the trigger.

**Separating model and scenario:** The retained [`unselected-path-parked-then-unselected`](../scenarios/open-rows/inclusive-join-compositions/README.md) separates CIB from every reach reading:

- Literal Table 13.3 counts only tokens on Sequence Flows. *Review B* is an active Activity, so the literal join activates when *Review A* arrives.
- The reading that counts Activity-held tokens (the kernel's and CIB's) activates it when *Review B* ends at *B closed*.
- CIB fires under neither reading.

The retained [`boundary-exit-parked-then-withdrawn`](../scenarios/open-rows/inclusive-join-activation/README.md) is a second instance, in which an interrupting Boundary Event withdraws the blocking work.

- The retained `inclusive-join-activation/nested-skip-*` and `raised-path-parked-then-failed` are further instances of the trigger.
- The `nested-inclusive*` and `nested-parallel*` witnesses belong to the agreeing class: CIB and the kernel both fire the outer join once.

**CIB observation:** `InclusiveGatewayActivityBehavior#execute` (`:46-52`) is the only caller of `activatesGateway`, and only when an execution arrives. An Activity's end only prunes (`PvmAtomicOperationActivityEnd:77-81`, `PvmExecutionImpl:577-603`). The retained evidence shows `running` with no open wait after *Review B* ends.

**Expected normative behavior:** A parked join fires as soon as Table 13.3's condition holds. The kernel evaluates it on each arrival and again whenever the closure is otherwise quiescent: no signal, no token and no idle scope occurrence is left (`Step.reoffer?`, journalled with the `idle` cause of the join's scope occurrence).

At that point every position is one `Feature.Flow.positions` sees. A completion still queued as a signal is no position, so an earlier evaluation would let a downstream join fire before the upstream join's token is on its flow, and fire again when it arrives (the audit's `nested` witness, now `inclusive-join-activation/nested-*`).

Every closure passes that point before it ends, whatever removed the last position. That includes an uncaught business Error that ends its path without an outflow (`raised-path-parked-then-failed`, CIB-INT-0013). This is stronger than the weak fairness the reading needs (a join whose condition holds from some point on fires eventually).

Ready joins are independent. When they are offered, the arrivals parked at one join are positions every other join sees, so a ready join cannot be reached by another's parked tokens. Their order (parking order) is therefore immaterial, which is a commutation-law obligation.

**Alternative explanations excluded:**

1. *Gap interpretation.* The witness separates CIB from every reach reading, so this is not a reach gap.
2. *Operational detail.* The behaviour decides whether downstream work ever becomes active.
3. *Limitation.* That class would need "is activated" to be a precondition checked at arrival, which leaves WCP-38 unsupported.
4. *Observation artefact.* The producer observes tasks, timer jobs and history only. "No task, job or subscription" therefore depends on the model having no asynchronous step and no message element, which holds for the retained witness.

**Classification rationale:** Table 13.3 is a clear requirement that an activated gateway executes, and the witness separates CIB from every reading of reach (classification order: not agreement, not an operational detail, not a gap resolution, not an extension or configuration). The entry stays a candidate because the [evidence threshold](#evidence-threshold-for-a-confirmed-deviation) is unmet: there is no pristine-lane probe and no owner review of the probe.

**Profile decision:** As for CIB-DEV-0001: every profile, both CIB profiles included, uses the standards trigger. The cumulative CIB profile claims no compatibility for a join that becomes ready without an arrival, and this candidate owns the disagreeing evidence, which agreed with the kernel before the change. Reproducing CIB's stall would need a further option selected only by an explicitly separate compatibility profile, which no profile proposes.

**Capsule and semantic rule IDs:** PC-CF-04; [flow semantics, Inclusive join activation and reach](kernel/semantics/FLOW-SEMANTICS-SPEC.md#inclusive-join-activation-and-reach).

**Lean, TypeScript, Temporal, and compatibility impact:**

- Lean `Kernel.Step.reoffer?` and `settle`, paired with `reoffer` and `settle` in `packages/kernel/src/step.ts`. `Feature.Flow.join` and its pair do not park an offered occurrence twice. No Hooks or State change.

**Owner decision:** Owner decision taken by the root under the owner's standing direction of 2026-11-10 to decide autonomously: the kernel follows Table 13.3 under every profile, as CIB-DEV-0001 does, and the candidate owns CIB's arrival-only trigger.

**Last reviewed:** 2026-11-10.

### CIB-DEV-0003 — CIB starts a sibling Event Sub-Process for an event an interrupting handler rethrows

**Status:** Candidate deviation; the kernel refuses the run, confirmation evidence absent

**Summary:** When an interrupting Event Sub-Process raises an Error or Escalation that another Event Sub-Process of the same scope catches, pinned CIB Seven `2.2.0` starts that sibling handler while the first one's interruption of the scope is under way.

**BPMN requirement:** BPMN 2.0.2 §13.5.4: while an interrupting Event Sub-Process runs, its parent is Failing or Terminating, and "new Event Handlers MUST NOT be started"; a rethrow passes "control … to the boundary Event" outside the Sub-Process.

**BPMN sources and issues:** §13.5.4 and §10.5.6; no open issue found that weakens the clause.

**CIB release and configuration:** CIB Seven `2.2.0` at pinned `5a45b47` under CIB-CFG-0001; no setting changes the finder.

**Separating model and scenario:** Owed. The kernel test `an Error an interrupting handler raises that a sibling handler would catch is refused` (`packages/kernel/test/propagation-rethrow.test.ts`) holds the shape: Sub-Process `T` with the interrupting Error handler `H` on `RAW`, which raises `SECOND`, and the interrupting handler `H2` on `SECOND`.

**CIB observation:** Source only: `bpmn/helper/ErrorDeclarationForProcessInstanceFinder.java:41-58` skips only the Event Sub-Process the thrower runs in (`pvm/process/ScopeImpl.java:170-182`), and `EscalationEventDefinitionFinder.java:58-61` only the thrower's direct flow scope, so a sibling handler at the same scope remains a candidate.

**Expected normative behavior:** The sibling is not started; the event goes on to the boundaries of the scope and outward.

**Alternative explanations excluded:** Not yet: no answer-free scenario has been run against the pristine oracle.

**Classification rationale:** §13.5.4 states the prohibition as a requirement, not a gap. The entry stays a candidate because the [evidence threshold](#evidence-threshold-for-a-confirmed-deviation) is unmet.

**Profile decision:** No profile imitates either reading: the kernel refuses the run under every profile as dynamic-only `unsupported` (`rethrow-caught-by-sibling-handler`), so neither CIB's start nor the standards' pass-over is claimed.

**Capsule and semantic rule IDs:** PC-ERROR-02; [propagation semantics, PC-ERROR-02](kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#pc-error-02-rethrow-from-an-event-sub-process).

**Lean, TypeScript, Temporal, and compatibility impact:** Lean `Kernel.Feature.Propagation.handlerCandidates`, paired with `handlerCandidates` in `packages/kernel/src/feature/propagation.ts`. No IL, Hooks or State change.

**Owner decision:** Refusal decided by the root under the owner's standing direction of 2026-11-10; the cold review of 2026-11-10 required the §13.5.4 basis.

**Last reviewed:** 2026-11-10.

### CIB-DEV-0004 — a non-interrupting Conditional Event fires again while its condition stays true

**Status:** Candidate deviation; the standards profile keeps BPMN's edge

Tables 10.89 and 10.90 trigger a Conditional Event when its condition becomes true; a re-fire on a write that leaves the condition true (150 → 150) fires without the condition becoming true. For Event Sub-Process starts the basis is weaker: Table 10.86 is silent and `:7378` only lets them use the boundary Event types. Interrupting subscriptions and catches fire once under either reading.

**Evidence:** Retained `conditional-evaluation/portable-create-false-then-update-true` (`Handle_Update#2`), `conditional-esp/process-alert-repeats`; pinned `BoundaryConditionalEventActivityBehavior.java:46-52`, `EventSubProcessStartConditionalEventActivityBehavior.java:44-50`.

**Boundary:** Non-interrupting Conditional boundaries and Event Sub-Process starts under the cibseven profiles.

### CIB-DEV-0005 — a task's submitted variables reach its own Conditional boundaries before it leaves

**Status:** Resolved, not a deviation; recorded as CIB-INT-0042

CIB dispatches the variable events of a task's completion before the task leaves, so a submission that makes a task's own interrupting Conditional boundary true cancels the completing task; the kernel offers a completion's writes after the task has left. BPMN states no requirement for either order: Figure 13.2 (BPMN-2.0.2.md:12310) leaves "Activity Interrupted" open from Completing and guards Completing → Completed with "Completing Requirements Done; Assignments Completed", so outputs are assigned while the Activity can still be interrupted. The difference is a gap BPMN leaves, which CIB-INT-0042 records.

**Evidence:** As CIB-INT-0042.

**Boundary:** As CIB-INT-0042.

### CIB-DEV-0006 — the last firing of a finite cycle starts an endless chain at its deadline

**Status:** Deviation candidate from the pinned source; awaits a retake after the runner change

When a finite cycle fires its `n`-th time with the clock exactly at that deadline, `DurationHelper#getDateAfterRepeat` (`:116-129`) exhausts the count with `cur` equal to the clock, does not end the cycle (`cur.before(date)` is false), and returns that instant; `TimerEntity#preExecute` creates a follow-up job due then, and every such firing repeats it. BPMN's `R<n>` has `n` recurrences; CIB's own test (`StartTimerEventTest:160-194`) avoids the artifact by moving the clock past each deadline. The kernel ends the cycle after `n` firings.

**Evidence:** The cited source; witness `timer-recurrence/count-finite-overlap` after the retake (the observation after the third firing). The dated witnesses `dated-start-and-period` and `dated-start-and-end` fire past the count, which the observation cannot express, so the runner ends them as harness failures naming this entry (`CibSevenOpenWaitProjector.remaining`). The retained answers of [journey-scheduled-case](../scenarios/open-rows/journey-scheduled-case/README.md) `duplicate-reminder` and `late-firing-keeps-cadence` (profile `cibseven-2.2.0`, Verify run 43370273960): the third firing of the boundary cycle `R3/PT4H` at its deadline 72,000,000 leaves CIB a fourth `ReminderDue` job due at that same instant with no recurrence left, where the kernel's cycle has ended; in `duplicate-reminder` a fourth firing named at 86,400,000 is then rejected by both.

**Boundary:** Finite ISO cycles whose firing happens exactly at the deadline; a runner firing later is outside today's observation boundary.

### CIB-DEV-0007 — a cycle armed between whole seconds drifts to the whole-second grid

**Status:** Deviation candidate from the pinned source

CIB stores an undated cycle's start formatted `yyyy-MM-dd'T'HH:mm:ss` (`TimerEntity.java:47,178-183`), so after the first firing the grid is anchored at the arming second: `R3/PT10S` armed at 10,500 fires at 20,500, then 30,000. The kernel keeps arming + k·period (20,500, 30,500).

**Evidence:** The cited source; witness `timer-recurrence/count-sub-second-arming` (to author, needs evidence).

**Boundary:** ISO cycles armed at a logical time that is not a whole second.

### CIB-DEV-0008 — a late cycle firing skips missed occurrences and spends their count

**Status:** Deviation candidate from the pinned source; a retained population witness observes it

The kernel's successor is the fired deadline plus one period whatever the firing's `at` (no drift, PC-TIMER-02). CIB computes the follow-up from the clock at the firing (`TimerEntity.java:199-205`, `CycleBusinessCalendar.java:53-58`): the first grid point after it, so occurrences missed while the job was late are skipped and the skipped steps use up the count.

At a root Timer start the same computation decides which occurrences CIB starts. The kernel names every due instant of the schedule as its own occurrence ([CIB-INT-0029](#cib-int-0029--a-timer-start-counts-from-its-deployment-and-fires-each-occurrence-once-while-the-deployment-is-current)) and leaves which missed ones a host fires to the host's catch-up policy (`TSTART-SCHEDULE-01`); a host that fires the overdue occurrence and then only the first due instant after that firing's time reproduces CIB.

**Evidence:** The cited source; the retained answer of `timer-start-population/cycle-start-late-firing` (profile `cibseven-2.2.0`), where CIB fires the first occurrence of `R3/PT10M` at 25 minutes instead of 10 and its one job is then due at 30 minutes, the first grid point after the firing: the 20-minute occurrence has no job (the runner answers `rejected`, [observation policy](CIB-OBSERVATION-POLICY.md)) and the 30-minute occurrence starts the second instance.

**Boundary:** Cycle firings with `at` after the deadline, at catches, boundaries, Event Sub-Process starts and root Timer starts; recorded so the observation boundary is explicit.

### CIB-DEV-0009 — `PnW` is not seven days per week

**Status:** Deviation candidate from the pinned source

ISO 8601 makes `PnW` `7n` days. CIB parses `P\\d+W` as `newDuration(n·604,800,000)` (`DurationHelper.java:148-159`), which the JDK spreads into years, months and days counted from 1970-01-01 (`DurationImpl.java:359-398`), so `P5W` is `P1M4D` and armed on 1970-02-01 adds 32 days. CIB's result equals seven-day weeks only up to `P4W`, or when the arming month compensates. The kernel keeps the ISO week. The same mechanism makes a dated `start/end` cycle period epoch-anchored (dated cycles are refused).

**Evidence:** The cited source; witness `timer-duration-forms/form-five-weeks-in-february` (to author).

**Boundary:** `PnW` with `n ≥ 5` (and `n = 4` armed in a 28-day February window where the months differ).

### CIB-DEV-0010 — withdrawn: the boundaries of an `asyncBefore` effect host

**Status:** Withdrawn, not a deviation (M6 track review, 2026-11-11); recorded as CIB-EXT-0038

CIB arms a Service Task's boundaries exactly while the Task is active, and its delegate realization makes that period atomic; BPMN does not require the Active state to last, so no clear requirement is broken. The difference comes from the project's mapping of CIB's pre-activation wait onto the active effect occurrence and is recorded as [CIB-EXT-0038](#cib-ext-0038--the-kernels-effect-wait-holds-its-hosts-boundaries-armed-which-cibs-asyncbefore-realization-never-commits).

### CIB-DEV-0011 — CIB starts every compensation handler of one trigger at once

**Status:** Deviation candidate from the pinned source and retained evidence; selected by no profile, since the kernel keeps BPMN's dependency order under every profile (`ProfileOptions.compensationOrder = dependency`; `allAtOnce` is refused)

BPMN 2.0.2 §13.5.5 runs default compensation "in reverse order of the execution of the original Activities, allowing for concurrency when there was no dependency": a Sequence Flow from A to B, a boundary Event of A connected to B, or a data dependency of B on A compensates B before A, and the records of one looping Activity run in reverse order of their forward completion. CIB Seven `2.2.0` creates a concurrent execution for every retained compensation subscription of the trigger and signals them all, in reverse creation order, within the triggering command, so every waiting handler is open at once whatever the dependencies.

**Evidence:** Pinned `bpmn/helper/CompensationUtil.java:55-88`; the retained answers of [compensation-order-chronology](../scenarios/open-rows/compensation-order-chronology/README.md) (all five schedules), [with-message-before-a-completes](../scenarios/open-rows/compensation-order-and-multiplicity/README.md), [end-untargeted](../scenarios/open-rows/compensation-targeting/README.md) [late-third-second-throw, two-records-live-data and unfinished-third-ineligible](../scenarios/open-rows/compensation-eligibility/README.md), and, where the ordered subject is a Sub-Process's group (CIB-INT-0036), [compensation-regions](../scenarios/open-rows/compensation-regions/README.md) (all four schedules), [cancel-end and success-then-outer-throw](../scenarios/open-rows/transaction-paths/README.md), [outer-cancel-after-inner-completed](../scenarios/open-rows/transaction-nested/README.md), the sequential Multi-Instance Sub-Process [regions-sequential-in-turn](../scenarios/open-rows/compensation-multi-instance-bodies/README.md), the sequential Multi-Instance Transaction [sequential-complete-then-compensate](../scenarios/open-rows/transaction-multi-instance/README.md) and, up to CIB-LIM-0045's failure, the sequential Multi-Instance Sub-Process's Compensation Event Sub-Process [sequential-in-turn-consumed and sequential-in-turn-rethrown](../scenarios/open-rows/compensation-event-subprocess-multi-instance/README.md) (profile `cibseven-2.2.0`), where CIB opens a handler the kernel holds until the handlers of its dependents, or of the later instances, complete. A Multi-Instance Task or Call runs its handler once in the kernel, which CIB-DEV-0012 records. Parallel instances are outside the entry: §13.5.5 lets them be compensated in parallel, as CIB does, and the kernel's serial order there is CIB-INT-0040.

**Boundary:** Triggers retaining two subjects that a §13.5.5 dependency orders, or repeated records of one subject; this entry owns the witnesses above whose only difference is CIB opening the ordered handlers together, and is the first owner of the sequential Multi-Instance witnesses whose handlers also read CIB-DEV-0014's restored body locals and of the two whose later difference is CIB-LIM-0045's.

### CIB-DEV-0012 — CIB compensates a Multi-Instance Task or Call once per instance

**Status:** Deviation candidate from the pinned source and retained evidence; selected by no profile, since the kernel runs the handler once under every profile (`ProfileOptions.multiInstanceCompensation = perSubProcessInstance`; `perInstance` is refused as `profile.multiInstanceCompensation.perInstance`)

BPMN 2.0.2 §13.5.5 says "In case the Activity is a multi-instance or loop, the Compensation Activity is triggered only once, too, and thus has to compensate the effects of all instances", and invokes a boundary handler once per instance only for a Multi-Instance Sub-Process (§10.7.2). CIB Seven `2.2.0` subscribes the handler at the Multi-Instance body when every completed instance of any Multi-Instance Activity leaves, so a Multi-Instance Task or Call Activity opens its handler once per completed instance and not at all after zero instances.

**Evidence:** Pinned `bpmn/behavior/AbstractBpmnActivityBehavior.java:53-62` and `:69-74`; the retained answers of [user-handler-two-items and user-handler-zero-items](../scenarios/open-rows/compensation-order-and-multiplicity/README.md) and [tasks-parallel-out-of-order and tasks-sequential-in-turn](../scenarios/open-rows/compensation-multi-instance-bodies/README.md) (profile `cibseven-2.2.0`), where CIB opens one handler per completed instance, or none, and the kernel one. The Multi-Instance Call witnesses `call-parallel-three-reviewers` and `call-sequential-three-reviewers` fall under the same source reading; the kernel admits a Multi-Instance Call body since M11 (PC-MI-03) and opens one handler for all its instances, so both are this entry's.

**Boundary:** Multi-Instance Tasks and Call Activities with a compensation handler; this entry owns the witnesses above, and is the first owner of `tasks-sequential-in-turn` and `call-sequential-three-reviewers`, whose handlers also read the body's last item (CIB-INT-0041).

### CIB-DEV-0013 — CIB runs a Sub-Process's boundary compensation handler beside, or instead of, black-box compensation

**Status:** Deviation candidate from the pinned source and retained evidence; selected by no profile, since the kernel runs the boundary handler once as the Sub-Process's black-box compensation under every profile

BPMN 2.0.2 §10.7.1 and §13.5.5 let a handler connected by a boundary Event "only perform black-box compensation of the original Activity", and activate the associated Compensation Activity once when compensation is triggered for that Activity. CIB Seven `2.2.0` subscribes a completed Sub-Process with a boundary handler twice: once with the boundary handler itself, and once through the event scope of CIB-INT-0036, whose handler resolves to the boundary handler when that handler is a Sub-Process and to the Sub-Process otherwise. A Task handler therefore runs beside the inner records' handlers, and a Sub-Process handler runs twice while the inner records never run. The kernel runs the handler once and keeps the inner records as its children, which only the handler's own throw compensates ([compensation semantics](kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md#i8--a-boundary-handler-on-a-sub-process-pc-compensation-05)).

**Evidence:** Pinned `bpmn/behavior/AbstractBpmnActivityBehavior.java:53-61` and `:69-74` (the boundary handler's subscription) and `bpmn/helper/CompensationUtil.java:143-151` and `:167-178` (the event scope's subscription and its handler); the retained answers of [task-handler-over-inner-record and subprocess-handler-over-inner-record](../scenarios/open-rows/compensation-handler-consumption/README.md) (profile `cibseven-2.2.0`), where CIB opens `UserTask_UndoGroup` beside `UserTask_UndoInner`, and `UserTask_UndoGroupReview` twice and never `UserTask_UndoInner`, and the kernel opens the handler once.

**Boundary:** Sub-Processes and Transactions with a Compensation Boundary Event; this entry owns those two witnesses in the ledger.

### CIB-DEV-0014 — CIB restores the Multi-Instance body's locals, not each instance's own, to its instances' compensation handlers

**Status:** Deviation candidate from the pinned source and retained evidence; selected by no profile, since under every profile the kernel restores each Multi-Instance Sub-Process instance's own item and, under `cibLocals`, its `loopCounter` wherever a snapshot is restored (its Compensation Event Sub-Process and its group), and its boundary handler restores no context (D9 of [Interpretation M9](kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md#i12--context-a-handler-reads-pc-compensation-01-pc-compensation-05))

BPMN 2.0.2 §13.5.5 takes "for each instance a separate data snapshot" of a Multi-Instance parent and restores "for each instance the dedicated snapshot", and §10.7.2 and §13.5.5 give each instance's Compensation Event Sub-Process "the specific snapshot data that was current at the time of completion of that particular instance"; the item and `loopCounter` are that instance's data (Table 10.29: `inputDataItem` is "a Data Input, representing for every Activity instance the single item of the collection"; Table 10.30: `loopCounter` "is provided for each generated (inner) instance"). CIB Seven `2.2.0` keeps the loop variables outside the Sub-Process's own scope execution, whose locals alone its event scope copies, so no handler restores its instance's own item. In sequential mode every instance runs on the body's execution, which carries the loop variables, and its event scope copies them by value when the body leaves: every instance's handler reads the body's last item. In parallel mode each instance runs on a concurrent child of the body's scope execution that carries the loop variables and is not copied: every handler reads the live variable. The kernel's handlers read the instance's own item.

**Classification rationale:** The §13.5.5 per-instance sentences are a clear requirement for a Compensation Event Sub-Process, so a handler of one instance reading another instance's item, or a later outer write, conflicts with it; the group of a Multi-Instance Sub-Process instance (CIB-INT-0036, I5) restores the same snapshot by extension, since it runs the instance's inner handlers in the instance's restored context. The entry's earlier argument, that neither BPMN form gives a handler "a value its instance did not hold", condemned the kernel's then live read as much as CIB's; with the instance's own item restored, the kernel no longer falls under it.

**Evidence:** Pinned `bpmn/behavior/SequentialMultiInstanceActivityBehavior.java:38-45` and `:56-59` (every sequential instance performed on the body's execution), `bpmn/behavior/ParallelMultiInstanceActivityBehavior.java:52` and `:60` (each parallel instance performed on a concurrent child) and `:66-68` (the `nrOf*` counters on the body), `bpmn/behavior/MultiInstanceActivityBehavior.java:76-88` (the loop variables set on the execution performing the instance), `:172-175` (the body's event scope on leaving) and `bpmn/helper/CompensationUtil.java:118-123` (the copy); the retained answers of [sequential-complete-then-compensate and parallel-complete-then-compensate](../scenarios/open-rows/transaction-multi-instance/README.md), [regions-sequential-in-turn and regions-parallel-out-of-order](../scenarios/open-rows/compensation-multi-instance-bodies/README.md) and, up to CIB-LIM-0045's failure, [sequential-in-turn-consumed, sequential-in-turn-rethrown, parallel-out-of-order-consumed and parallel-out-of-order-rethrown](../scenarios/open-rows/compensation-event-subprocess-multi-instance/README.md) (profile `cibseven-2.2.0`), where CIB's handlers read the last item (`c`, `s3`) in sequential mode and the live value (`outside`, `late`) in parallel mode, and each of the kernel's handlers its own instance's item (`a`, `b` or `c`; `s1`, `s2` or `s3`). The same copy reaches the boundary handlers of a sequential Multi-Instance Task or Call, to which BPMN restores no snapshot: CIB-INT-0041.

**Boundary:** Multi-Instance Activities with a compensation handler that reads a loop variable, in both modes; a boundary handler of a Multi-Instance Activity restores no context in the kernel and reads the item live, and is outside the entry (CIB-INT-0041). This entry is a later owner of the sequential witnesses above, whose first difference is CIB-DEV-0011's opening order, and of the parallel witnesses, whose first difference is CIB-INT-0040's opening order.

A candidate must appear here immediately when evidence suggests conflict with a clear BPMN requirement. It remains a candidate until the evidence threshold below is satisfied. Implementation of the disputed profile-dependent behavior pauses unless the capsule explicitly preserves competing accounts as an unresolved experiment.

The repository-wide audit on 2026-07-24 found no previously visited observation that satisfied the candidate or confirmed-deviation threshold. The later bounded parallel probe established `CIB-DEV-0001`; the other recorded PVM facts, generated IDs, history-TTL requirement, and task-service mapping remain classified below instead of being silently left open or mislabeled.

## Normative agreement register

### CIB-AGR-0001 — sequential Process and User Task lifecycle

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clauses 13.2 and 13.3 require an instantiated executable Process to progress along Sequence Flows, activate an Activity, wait while the User Task is active, and complete after the task and downstream None End Event complete.

**Pinned CIB observation:** CIB Seven `2.2.0` deploys and starts the exact plain BPMN fixture, exposes exactly one active `UserTask_Approve`, completes it through the public task service, and reports the Process complete at unchanged controlled logical time.

**Evidence:** [BPMN fixture and scenarios](../scenarios/user-task-discovery-completion/README.md), [exact-completion CIB evidence](../scenarios/user-task-discovery-completion/cibseven-evidence.json), oracle runner test (`CibSevenScenarioRunnerTest`, removed at W0.3b), and [the current draft profile](../profiles/cibseven-2.2.0/README.md).

**Boundary:** This establishes agreement only for one private executable `None Start Event → User Task → None End Event` Process and its declared observation surface. It says nothing yet about assignment, variables, repeated activation, concurrency, errors, or general Process Execution Conformance.

### CIB-AGR-0002 — active User Task discovery and basic completion

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clauses 10.7.3, 13.3.2, and 13.3.3 describe User Task activation, task-manager lifecycle, performance of the human work, and completion before outgoing control proceeds.

**Pinned CIB observation:** The public CIB task query exposes the active task and its BPMN definition key and name; completing the corresponding live host task removes the wait and completes the admitted Process.

**Evidence:** [User Task interaction capsule](kernel/semantics/WORK-SEMANTICS-SPEC.md), [exact-completion evidence](../scenarios/user-task-discovery-completion/cibseven-evidence.json), [interaction scenarios](../scenarios/user-task-discovery-completion/README.md), and [the current draft profile](../profiles/cibseven-2.2.0/README.md).

**Boundary:** People assignment, ownership, authorization, forms, input/output data, and general User Task lifecycle are excluded. The project’s structured activation ordinal and refusal of a mismatched semantic occurrence are an operational mapping under `CIB-OP-0001`, not a claim that BPMN prescribes that identity representation.

### CIB-AGR-0003 — balanced two-branch Parallel Gateway lifecycle

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clauses 10.6.4 and 13.4.1 plus Table 13.1 require a diverging Parallel Gateway to activate both outgoing branches and a converging Parallel Gateway to wait for at least one token on each incoming Sequence Flow before consuming one per input and proceeding.

**Pinned CIB observation:** CIB Seven `2.2.0` starts the exact balanced fork/join Process with simultaneous `UserTask_A` and `UserTask_B` waits. Completing either task first leaves only the other task active; completing both joins once and completes the Process. A-then-B and B-then-A have the same initial and final canonical states.

**Evidence:** [Parallel scenarios](../scenarios/parallel-fork-join/README.md), [A-then-B evidence](../scenarios/parallel-fork-join/a-then-b.cibseven-evidence.json), [B-then-A evidence](../scenarios/parallel-fork-join/b-then-a.cibseven-evidence.json), oracle runner test (`CibSevenScenarioRunnerTest`, removed at W0.3b), and [the parallel draft profile](../profiles/bpmn-2.0.2/README.md).

**Boundary:** This agreement is limited to one balanced two-branch shape with distinct User Task elements. It does not distinguish normative per-incoming-flow synchronization from CIB's count-based join implementation and therefore does not weaken or resolve candidate `CIB-DEV-0001`. Repeated task elements, activation-ordinal derivation, excess same-input arrivals, more branches, nested gateways, and general parallel compatibility remain outside this agreement.

### CIB-AGR-0004 — literal PT1S Intermediate Catch Timer lifecycle

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clause 10.5.4 and Table 10.89 require a catching Intermediate Timer Event in normal flow to retain the token until its trigger and then continue. Clause 10.5.5 plus Tables 10.101 and 10.122 define `timeDuration` as the relative-duration timer form.

**Pinned CIB observation:** With CIB Seven `2.2.0` at the pinned revision, automatic job execution disabled, and the engine clock fixed at epoch zero, the exact `PT1S` fixture creates one wait-state timer job due at epoch plus 1000 ms. The executable-job query excludes that job before its due date, includes the same job when the controlled clock reaches the due date, and public job execution then removes the wait and completes the Process.

**Evidence:** [Intermediate Catch Timer scenario](../scenarios/intermediate-catch-timer/README.md), controlled-clock oracle test (`CibSevenIntermediateCatchTimerTest`, removed at W0.3b), [immutable profile](../profiles/cibseven-2.2.0/README.md), and the content-bound retained evidence generated only through the explicit replacement command.

**Fidelity boundary:** Job existence, scheduler ineligibility before due time, scheduler eligibility at due time, the due transition, and Process completion are engine-observed. The canonical logical deadline `1000` is adapter-derived by subtracting the fixed controlled-clock epoch from the engine job due date; it is not an independent CIB derivation of the project's logical-time representation.

**Boundary:** This establishes agreement only for one acyclic private executable `None Start Event → Intermediate Catch Timer Event with exact literal PT1S → None End Event` Process under `CIB-CFG-0001`. Other duration literals, expressions, time dates, cycles, repeating timers, boundary events, timer Start Events, competing events, cancellation, scheduler latency, and general timer compatibility remain unreviewed.

### CIB-AGR-0005 — exact-code interrupting Error Boundary Event

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clauses 13.3.3 and 13.5.3 plus Table 8.41 and Tables 10.90, 10.91, and 10.92 require the selected matching Error to interrupt the attached Service Task and continue only through the Error Boundary Event's outgoing Sequence Flow.

**Pinned CIB observation:** CIB Seven `2.0.0` at revision `57ed69550f1c9c2619b9711d8877418bb084a371` catches both code-only and message-bearing `BpmnError("LinkLimitReachedError", ...)` from the exact attached Service Task, exposes the boundary-route User Task, and does not execute the normal End path. An independently perturbed Error code and attachment each fail the deployment-derived profile comparison.

**Evidence:** [Boundary-error specification and phase-zero result](kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md), [frozen project-authored fixture](../adoption/a12/legacy/source-tree/scenarios/boundary-error/process.bpmn), [frozen packaged-engine probe](../adoption/a12/legacy/source-tree/runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBoundaryErrorPhaseZeroProbeTest.java), and the frozen ordinary content-bound scenario evidence.

**Fidelity boundary:** The boundary User Task and absence of the normal End path are engine-observed. Project effect intent, typed business-result shape, occurrence identity, and command identity are not CIB concepts. Caught-path output mapping is not part of this agreement; it is the separately selected extension `CIB-EXT-0004`.

**Boundary:** This establishes only one exact code, one attached interrupting handler, one flat Process, and one same-command synchronous CIB host realization. Catch-all handling, nested propagation, Error End Events, multiple handlers, general faults, and unhandled Error behavior remain outside this agreement.

### CIB-AGR-0006 — divergent Exclusive Gateway first-true and default routing

**Status:** Reviewed bounded agreement; implemented under every profile, closure-reviewed with PC-CF-02 (2026-11-10)

**BPMN basis:** BPMN 2.0.2 Clause 13.4.2 and Table 13.2 require a divergent Exclusive Gateway to evaluate outgoing conditional Sequence Flows in a defined order, select the first condition that evaluates true, and select the default Sequence Flow only when every condition is false.

**Pinned CIB observation:** CIB Seven `2.0.0` at revision `57ed69550f1c9c2619b9711d8877418bb084a371` selects the first true non-default Sequence Flow, selects the second after the first false, does not evaluate a later failing condition after an earlier true result, and selects the declared default after both reviewed conditions evaluate false. The selected branch is visible through its distinct User Task. These controls now use the exact two-condition-plus-default and string/null source profile rather than broader Boolean or nested-map feasibility shapes.

**Evidence:** [Exclusive Gateway condition specification](kernel/semantics/FLOW-SEMANTICS-SPEC.md), [packaged-engine JUEL gateway probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenExclusiveGatewayJuelProbeTest.java), and [CIB Seven extension research](research/CIB-SEVEN-EXTENSIONS-RESEARCH.md).

**Boundary:** Candidate order is the selected interpretation `CIB-INT-0001`; under the CIB profiles conditions are JUEL at the core level in the environment of `CIB-CFG-0011`, and the standards profile evaluates Simple Boolean. The [Exclusive choice arity account](kernel/semantics/FLOW-SEMANTICS-SPEC.md) extends the agreement to Choices with any positive number of conditions and one conditionless default, at the root and on branches: CIB Seven `2.2.0` `ExclusiveGatewayActivityBehavior#doLeave` iterates every outgoing transition in declaration order. The retained [Exclusive choice compositions](../scenarios/open-rows/exclusive-choice-compositions/README.md) (`cibseven-2.2.0`) calibrate three conditions over Boolean, integer and String variables before User, Service, Manual and plain Tasks, the reversed and renamed sources, a converging Exclusive Gateway passing each arrival without waiting, and the refused flow shapes (two unconditioned flows, a default beside an unconditioned flow, one conditioned flow alone). A missing default is the interpretation `CIB-INT-0003`. This agreement does not cover mixed gateways, conditional flow from another Flow Node, JUEL beyond the core level, or scripts.

### CIB-AGR-0007 — ordinary embedded Sub-Process quiescent completion

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clauses 10.3.5 and 13.3.4 define an embedded Sub-Process as an Activity-owned execution scope that starts when reached and completes only after no contained token or active Activity remains, then continues through the Sub-Process's outgoing Sequence Flow.

**Pinned CIB observation:** CIB Seven `2.2.0` at revision `834a9874760de8a0107f7c1b32806e37f17fb017` starts the exact project-authored one-level ordinary Sub-Process with simultaneous `UserTask_ChildA` and `UserTask_ChildB` waits. Completing either child first leaves only its sibling active and does not expose the enclosing `UserTask_AfterScope`; completing both children destroys the child work and exposes exactly the enclosing task. A-then-B and B-then-A reach the same public post-child state, and completing the enclosing task completes the Process.

**Evidence:** [Ordinary embedded Sub-Process completion scenarios](../scenarios/embedded-subprocess-completion/README.md), content-bound evidence for [A then B](../scenarios/embedded-subprocess-completion/a-then-b.cibseven-evidence.json) and [B then A](../scenarios/embedded-subprocess-completion/b-then-a.cibseven-evidence.json), public-service oracle test (`CibSevenScenarioRunnerTest`, removed at W0.3b), and the [draft profile](../profiles/cibseven-2.2.0/README.md).

**Boundary:** This agreement is limited to one ordinary embedded Sub-Process, one child scope level, one diverging Parallel Gateway, two distinct child User Tasks, separate child None End Events, and one enclosing User Task. Project semantic occurrence identity and stale-command refusal remain operational mappings under `CIB-OP-0001`. Arbitrary nesting, repeated activation, Event Sub-Processes, implicit completion, boundary handling, Error propagation, Terminate End Events, child-local data, loops, multi-instance, Call Activities, transactions, compensation, and internal CIB scope representation remain outside this agreement.

### CIB-AGR-0008 — exact-code Error propagation from an embedded Sub-Process

**Status:** Reviewed bounded agreement; project semantic implementation and retained evidence complete

**BPMN basis:** BPMN 2.0.2 Clauses 10.3.5, 10.5.1, 13.3.4, and 13.5.3 require an Error End Event to propagate its Error to a matching interrupting boundary Error Event on the enclosing Sub-Process, cancel that Sub-Process instance, and continue through the boundary Event's outgoing Sequence Flow.

**Pinned CIB observation:** CIB Seven `2.2.0` at revision `834a9874760de8a0107f7c1b32806e37f17fb017` starts the exact project-authored one-level Sub-Process with simultaneous `UserTask_TriggerError` and `UserTask_SiblingWork` tasks. Completing Trigger Error first removes Sibling Work and exposes only outer `UserTask_Recover` while the Process remains live. Completing Sibling Work first leaves Trigger Error active; completing Trigger Error then exposes only Recover while the Process remains live. In both orders the Process completes only after Recover completes.

**Evidence:** [Project-authored Error-propagation fixture and answer-free schedules](../scenarios/subprocess-error-propagation/README.md), content-bound retained evidence for [Trigger first](../scenarios/subprocess-error-propagation/trigger-first.cibseven-evidence.json), [Sibling first](../scenarios/subprocess-error-propagation/sibling-first.cibseven-evidence.json), and [stale Sibling after Error](../scenarios/subprocess-error-propagation/stale-sibling-after-error.cibseven-evidence.json), the [public-service phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSubProcessErrorPropagationPhaseZeroProbeTest.java), and the [implemented Error-propagation specification](kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md).

**Fidelity boundary:** Live Process existence and exact active task-definition keys are engine-observed through public runtime and task services. They establish selection of the recovery route and disappearance of the live sibling at that boundary. They do not expose the CIB execution tree, prove how regional cancellation is represented internally, or prove that no additional hidden normal-path microstep occurred.

**Boundary:** This agreement is limited to one private executable Process, one ordinary embedded Sub-Process, one child Parallel Gateway, two distinct child User Tasks, one exact-code Error End Event, one matching interrupting boundary Error Event attached directly to that Sub-Process, and one outer recovery User Task. The stale schedule's recovery-state prefix remains evidence for this agreement, but mapping the removed generated host task and its refusal to the project semantic occurrence/result belongs to `CIB-OP-0001`. Catch-all or unmatched Errors, multiple handlers, ancestor search, arbitrary nesting, Event Sub-Processes, payload or data mapping, concurrent task commands, project semantic occurrence identity, stale-command refusal, and general Error compatibility remain outside this agreement.

### CIB-AGR-0009 — Message-addressed Receive Task subscription lifecycle

**Status:** Reviewed bounded agreement with retained public-subscription evidence

**BPMN basis:** BPMN 2.0.2 Clause 10 and Table 10.10 define a Receive Task as waiting for a Message from an external Participant and completing when that Message is received. Clause 13.3.3 repeats that activation waits for the associated Message and that Message arrival completes the Activity.

**Pinned CIB observation:** CIB Seven `2.2.0` at revision `834a9874760de8a0107f7c1b32806e37f17fb017` starts one exact project-authored None Start → Message-addressed Receive Task → None End Process and exposes exactly one public Message event subscription. The subscription reports the Receive Task activity ID, the root Message name, the live Process-instance ID, and a generated execution ID. Delivering through `messageEventReceived(subscription.eventName, subscription.executionId)` removes the subscription and completes the Process.

**Evidence:** [Project-authored scenario and exact BPMN fixture](../scenarios/message-addressed-receive-task/README.md), [content-bound retained evidence](../scenarios/message-addressed-receive-task/cibseven-evidence.json), [public-service phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenReceiveTaskPhaseZeroProbeTest.java), [Receive Task specification](kernel/semantics/WORK-SEMANTICS-SPEC.md), and [CIB runner documentation](../runners/cibseven/README.md).

**Fidelity boundary:** Subscription existence, activity ID, event name, generated execution ID, Process-instance ID, removal, and Process completion are engine-observed through public CIB services. Retained evidence records the generated identities only as presence/match facts and never exports them as comparison keys. The Message name is a source-admission fact only in the project: it never enters the checked graph, Semantic Process program, runtime state, or canonical observation. CIB does not expose the BPMN Message ID through this subscription API, so `CIB-OP-0005` maps the deployed Receive Task reference to the adapter-decided canonical `messageId`; semantic Process-instance identity and activation remain adapter supplied.

**Boundary:** This agreement is limited to one private executable Process with one non-instantiating, payload-free Receive Task carrying one direct `messageRef`, one named root Message, and no `operationRef`, Message Flow, Collaboration, correlation key, loop, Multi-Instance, boundary Event, or data association. It does not cover the addressless CIB execution-signal path, pre-activation delivery, Message buffering, transport binding, Web-service realization, payload, global correlation, repeated activation, or general Receive Task compatibility.

### CIB-AGR-0010 - product-neutral exact-code interrupting Error Boundary Event

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clauses 13.3.3 and 13.5.3 plus Table 8.41 and Tables 10.90, 10.91, and 10.92 require one matching Error to interrupt the attached Service Task and continue only through the Error Boundary Event's outgoing Sequence Flow.

**Pinned CIB observation:** CIB Seven `2.0.0` at revision `57ed69550f1c9c2619b9711d8877418bb084a371` catches the exact `MappedBusinessError` raised by the neutral mapped-boundary Service Task, exposes only `ReviewMappedError`, and reaches Process completion only after that User Task completes. The CIB Seven `2.0.0` profiles retired into the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/README.md) at the profile consolidation (#42), and their evidence is regenerated on `2.2.0` in the hosted lane.

**Evidence:** [Mapped-boundary-Error scenario](../scenarios/mapped-boundary-error-service-task/README.md), [content-bound CIB evidence](../scenarios/mapped-boundary-error-service-task/cibseven-evidence.json), scenario runner test (`CibSevenMappedBoundaryErrorScenarioRunnerTest`, removed at W0.3b), and [product-neutral profile](../profiles/cibseven-2.2.0/README.md).

**Boundary:** This establishes one exact code, one attached interrupting handler, one flat Process, and one synchronous CIB host realization. Catch-all handling, nested propagation, Error End Events, multiple handlers, general faults, and unhandled Error behavior remain excluded. The caught-path mapping is classified separately by `CIB-EXT-0009`.

### CIB-AGR-0011: bounded collection-driven sequential Multi-Instance User Task lifecycle

**Status:** Reviewed bounded agreement; no Multi-Instance compatibility profile selected

**BPMN basis:** BPMN 2.0.2 Clauses 10.3.8 and 13.3.7 plus Tables 10.29 and 10.30 require collection-driven sequential generation to expose one inner Activity instance at a time in collection order. Clauses 10.5.5, 10.5.6, 13.3.2, and 13.5.3 require the exact interrupting `PT1S` Boundary Timer to cancel the attached outer Activity and follow only its boundary route.

**Pinned CIB observation:** CIB Seven `2.2.0` under `CIB-CFG-0001` deploys the schema-valid exact fixture, exposes three distinct generated User Task IDs in `alpha`, `beta`, `gamma` item order, keeps one unchanged outer Timer job across task turnover, completes a zero-item collection without a task or Timer, and routes exact Timer execution after the first completion to the escalation User Task while making the current review task stale.

**Evidence:** The [public-service phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSequentialMultiInstancePhaseZeroProbeTest.java), its [exact BPMN fixture](../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/CibSevenSequentialMultiInstancePhaseZeroProbeTest.bpmn), and the [Sequential Multi-Instance specification](kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md).

**Fidelity boundary:** Task existence, generated task identity, item value, loop-variable values, Timer-job identity and due date, task staleness, boundary-route activation, and Process completion are observed through public CIB services. The probe supplies the collection under the literal `loopDataInputRef` identity because that is CIB's public Process-variable binding, which `CIB-INT-0014` classifies; this does not establish general BPMN Data Association execution or the project mediator.

**Boundary:** This agreement is limited to one private executable Process, one collection-driven sequential Multi-Instance User Task, three strings or an empty collection, one exact interrupting Boundary Timer, and one boundary-route User Task. Counter meaning is classified separately by `CIB-INT-0002`; output aggregation is excluded by `CIB-LIM-0001`. General Multi-Instance, another Activity body, completion conditions, parallel generation, other data mapping, repeated activation, and a CIB compatibility profile remain unreviewed.

### CIB-AGR-0012 — CIB7 2.2.0 exact-code business Error recovery

**Status:** Reviewed bounded normative agreement under the approved [mixed-task business Error account](kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md); implementation and profile qualification remain open.

**BPMN basis:** Clauses 13.3.3 and 13.5.3, Table 8.41 and Tables 10.90, 10.91 and 10.92 require the selected matching Error to interrupt its attached Service Task and follow the boundary Sequence Flow instead of normal completion.

**Pinned CIB observation:** Published CIB Seven `2.2.0`, whose `v2.2.0` source revision is `834a9874760de8a0107f7c1b32806e37f17fb017`, executes through the [Maven oracle](../runners/cibseven/pom.xml) and routes the exact `InvoiceRejected` result to Recover, permits reentry through Review with fresh task/automation occurrences, and takes normal continuation on subsequent success. Technical failure does not activate this boundary; changing the declared code removes the catch. The default unmatched path has the separate mapping-sensitive host outcomes recorded in the experiment.

**Source inspection:** The diagnostic checkout is separately pinned at `5a45b47ea22688d774de97277c3ff7013f54fdd2`. [Source provenance](SOURCES.md#cib-seven) records byte-identical relevant BPMN engine and model-API trees between that checkout and the published release.

**Evidence:** The [eight-probe experiment](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/experiments/BUSINESS-EFFECT-DATA-EXPERIMENT.md#business-failure-follow-up), [public-service probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBusinessFailurePhaseZeroProbeTest.java) and [registered-relationship guard](../scripts/contract-artifact-projections.test.ts). No project semantic profile is qualified by this observation alone.

**Boundary:** One attached exact-code catch in a single-control root Process with repeated work; no catch-all, multiple-handler precedence, ancestor propagation or transaction/refinement equality. Output mapping is separately classified as `CIB-EXT-0016`; project occurrence IDs and typed command results are not CIB observations.

### CIB-AGR-0013 — sequential Multi-Instance Sub-Process completion

**Status:** Selected bounded agreement, listed by the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile since sequential Multi-Instance Sub-Process bodies are admitted (`27561b587`); the retained [Sub-Process witnesses](../scenarios/open-rows/multi-instance-sub-process/README.md) agree.

**BPMN basis:** §§13.3.4 and 13.3.7 require a complete inner Sub-Process before the next sequential instance, one-time instance count, empty-input continuation and completion-condition evaluation at body completion.

**Evidence:** The [public-service lifecycle probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSequentialMultiInstanceSubprocessProbeTest.java) against CIB Seven `2.2.0` separates both orders of two inner branches, fresh Task IDs, stale completion, zero input and early completion only after the complete body. It also observes a fixed total while a changed collection supplies the next item; collection shortening rolls back completion. [Research](research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#sequential-multi-instance-sub-process-account) retains the exact source and execution boundaries. [Artifact reference verification](../scripts/contract-artifact-projections.test.ts) rejects a profile reference if this entry is removed.

**Boundary:** Public Tasks, variables, completed Activity history and Process existence, with explicit command order and background jobs disabled. This is no general MI agreement, project identity equivalence or Temporal refinement. A collection changed while the body runs is `CIB-INT-0043`'s and `CIB-LIM-0054`'s. Candidate rules: `SMIS-ENTER-01`, `SMIS-END-01`, `SMIS-EARLY-01`.

### CIB-AGR-0014 — parallel repeated-body completion and cancellation

**Status:** Selected bounded agreement, listed by the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile since parallel Multi-Instance Sub-Process bodies are admitted (`27561b587`); the retained [Sub-Process witnesses](../scenarios/open-rows/multi-instance-sub-process/README.md) agree. Under the standards profile a parallel body whose instances race is refused (`multiInstance.concurrentInstances`).

**BPMN basis:** §§13.3.4 and 13.3.7 require completion of the inner Sub-Process before counting an instance, and cancellation of remaining instances when the completion condition succeeds.

**Evidence:** The [parallel mixed-task probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenParallelMultiInstanceDataProbeTest.java) runs two concurrent bodies through Review, mapped validation and Confirm. Changing the Process condition during Review does not finish the body; completing Confirm cancels the sibling, rejects its stale Task completion and offers one parent continuation. Natural completion preserves the other body's open work. [Research](research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#parallel-body-data-and-condition-context) retains the source and executable boundary.

**Boundary:** Public task/variable APIs and Process existence, explicit command order, synchronous calibration delegates and disabled background jobs. This does not establish arbitrary nested MI, inner parallel control, production effect cancellation, Temporal refinement or public capability registration. The sequential relationship remains separate. [Artifact-reference verification](../scripts/contract-artifact-projections.test.ts) covers this candidate ID without admitting a new profile.

### CIB-AGR-0015 — uncontrolled incoming Sequence Flow at a None End Event ends each token separately

**Status:** Selected by the [nested scope-data profile](../profiles/cibseven-2.2.0-scope-chain/profile.json) for the [None End fan-in account](kernel/semantics/FLOW-SEMANTICS-SPEC.md), whose proposal review is approved; closure qualification pending.

**BPMN basis:** Clause 10.5.3 lets an End Event have several incoming Sequence Flows and makes it a sink for every arriving token; Clause 13.5.6 ends each arriving token and completes the Process once no token remains. Nothing joins the arrivals.

**Evidence:** At pinned `5a45b47`, a transition's execution enters its destination without consulting the destination's other incoming transitions (`AbstractPvmAtomicOperationTransitionNotifyListenerTake`), and only the Parallel, Inclusive and parallel Multi-Instance behaviors collect joining executions. The travel request tests of the [scope re-entry probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java) drive the [retained travel request](../scenarios/none-end-fan-in/README.md) through its three journeys in CIB Seven `2.2.0` (2026-11-02): each reaches *Request closed* on a different incoming flow, the Process ends, and *Request closed* has exactly one historic activity instance.

**Boundary:** A None End of the profile's re-entry root graph only, with JUEL renditions of the conditions under `CIB-CFG-0005`; public task, job, variable and history APIs. It does not cover fan-in at Activities, at Ends in Sub-Process bodies or called Processes, or under forks, and claims no Temporal refinement beyond the registered pipeline cases.

### CIB-AGR-0016 — a None Intermediate Throw Event passes its token on at once and records one activity instance

**Status:** Selected by the [nested scope-data profile](../profiles/cibseven-2.2.0-scope-chain/profile.json) for the [None Throw account](kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md), whose proposal review is approved; closure qualification pending.

**BPMN basis:** Clause 10.5.4 and its Table 10.89 make the None Intermediate Event a normal-flow throw Event without an EventDefinition, whose token moves down the outgoing Sequence Flow as soon as it arrives, with a separate instance of the Event per arriving token.

**Evidence:** At pinned `5a45b47`, `BpmnParse#parseIntermediateThrowEvent` gives an Intermediate Throw Event without an EventDefinition the type `intermediateNoneThrowEvent` and `IntermediateThrowNoneEventActivityBehavior` (`BpmnParse.java:1669-1672`), whose inherited `FlowNodeActivityBehavior.execute` leaves at once. The None Throw tests of the [pass-through Task probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) drive the [retained warranty repair and onboarding milestones](../scenarios/none-intermediate-throw/README.md) through their four journeys in CIB Seven `2.2.0` (2026-11-03): each None Throw activation is one historic activity instance of that type, ended in the command that reached it, with no task and no job, and a re-entered Sub-Process gets a fresh one.

**Boundary:** A None Throw with one incoming and one outgoing flow where the profile admits a pass-through Task, with JUEL renditions of the conditions under `CIB-CFG-0005`; public task, job, variable and history APIs; its several-flow forms belong to `CIB-AGR-0019`. It does not cover asynchronous continuations, listeners, called Processes or any throw trigger, and claims no Temporal refinement beyond the registered pipeline cases.

### CIB-AGR-0017 — a structured Inclusive join fires when every selected branch has arrived

**Status:** Selected by the [nested scope-data profile](../profiles/cibseven-2.2.0-scope-chain/profile.json) for the [Inclusive regions specification](kernel/semantics/FLOW-SEMANTICS-SPEC.md), whose proposal and closure reviews are approved.

**BPMN basis:** Clause 13.4.3 with Table 13.3 activates a converging Inclusive Gateway once at least one incoming flow holds a token and no token that can still reach an empty incoming flow without visiting the Gateway is missing, the Structured Synchronizing Merge (WCP-7). In an acyclic structured region the tokens that can still arrive are exactly the selected branches still live.

**Evidence:** At pinned `5a45b47`, the join of `InclusiveGatewayActivityBehavior` activates once the joined executions reach the incoming count or no other execution of the scope can reach the Gateway (`activatesGateway`, `canReachActivity`), including an execution inside a Sub-Process on a branch through its flow scope. The [Inclusive regions probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenInclusiveGatewayRegionsProbeTest.java) drives the [retained account opening and event booking](../scenarios/inclusive-gateway-regions/README.md) in CIB `2.2.0` (2026-11-04): with every check selected, *Open account* opens only with the last check in both orders, including the source-of-funds check inside its Sub-Process; a single selected check or the default alone is the join's only input; and the event booking's extras, one of them a nested Parallel region, join before *Event ready* waits for the venue in either order.

**Boundary:** Structured root Inclusive regions of the nested scope-data profile, with JUEL renditions of the conditions under `CIB-CFG-0005`; public task, job and history APIs. CIB's reachability join on unstructured, looping, nested or concurrently live Inclusive or Sub-Process-body regions and at asynchronous Gateways stays outside the class, and no Temporal refinement is claimed beyond the registered pipeline cases.

### CIB-AGR-0018 — a Link pair continues the token as the Sequence Flow it replaces

**Status:** Selected by the [nested scope-data profile](../profiles/cibseven-2.2.0-scope-chain/profile.json) for the [Link Events account](kernel/semantics/FLOW-SEMANTICS-SPEC.md), whose proposal review is approved; closure qualification pending.

**BPMN basis:** Clause 10.5.5 makes a Link a jump between two sections of one Process level: the Process continues as if the Sequence Flow had connected the throw's predecessor to the catch's successor, and both forms behave equivalently. One target Link Event takes a name; Clause 10.5.4 keeps a catching Link without incoming and a throwing Link without outgoing Sequence Flow. The machine-readable `LinkEventDefinition` makes `source` and `target` optional (`BPMN20.cmof:384-385`).

**Evidence:** At pinned `5a45b47`, `BpmnParse#parseIntermediateThrowEvent` creates no activity for a Link throw (`BpmnParse.java:1611-1622`), `#parseSequenceFlow` retargets each flow into it to the catch of its name (`BpmnParse.java:4306-4316`), `#parseIntermediateLinkEventCatchBehavior` refuses a second catch of one name across the whole resource (`BpmnParse.java:313`, `1575-1576`), and `HistoryParseListener` writes no history for the catch (`HistoryParseListener.java:207-211`). The [Link probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenLinkEventsProbeTest.java) drives the [retained Link models](../scenarios/link-events/README.md) beside their explicit-flow twins through four journeys in CIB `2.2.0` (2026-11-04): after every command both hold the same open User Tasks and jobs, no historic activity instance names a Link Event, and the rework journey crosses the Go To loop once.

**Boundary:** Single-source pairs in one scope of the executed Process with one unconditioned catch flow and no `source` or `target` reference, with JUEL renditions of the conditions under `CIB-CFG-0005`; public task, job and history APIs. A catching Link that a Sequence Flow also reaches passes that token on like any intermediate Event ([catch-with-incoming-both-arrivals](../scenarios/open-rows/link-event-compositions/README.md)). No Link Event, throw or catch, publishes an occurrence, the observation contract's [Link exception](kernel/semantics/PUBLICATION-AND-OBSERVATION-SEMANTICS-SPEC.md#flow-node-occurrences): CIB writes no history for either, since the throw has no activity (`BpmnParse.java:1611-1622`) and `HistoryParseListener` skips the catch (`HistoryParseListener.java:207-211`). Several throws of one name, chains, Links in called Processes and asynchronous or listened Link Events stay outside the class, and no Temporal refinement is claimed beyond the registered pipeline cases.

### CIB-AGR-0019 — a pass-through node passes each arriving token on its own and one activation starts every outgoing flow

**Status:** Selected by the [nested scope-data profile](../profiles/cibseven-2.2.0-scope-chain/profile.json) for the [pass-through implicit split and merge account](kernel/semantics/FLOW-SEMANTICS-SPEC.md), whose proposal review is approved; closure qualification pending.

**BPMN basis:** Clause 13.3.1 makes an Activity that is the target of several Sequence Flows participate in uncontrolled flow, enabled for each arriving token independently of the others as an Exclusive Gateway would be, and gives every unconditioned outgoing flow a token when it completes, as a parallel split. The Activity notes of Clause 10.3 and, for an Intermediate Event, Clause 10.5.4 state the same: a further token creates a separate instance, and each outgoing flow a separate parallel path.

**Evidence:** At pinned `5a45b47`, a transition enters its destination without consulting the destination's other incoming transitions (`AbstractPvmAtomicOperationTransitionNotifyListenerTake.java:34-51`), and a `task`, a `manualTask` and a None Throw leave through `BpmnActivityBehavior.performOutgoingBehavior` (`BpmnActivityBehavior.java:81-130`), which takes every unconditioned non-default transition, reusing the leaving execution for the first and creating one concurrent execution per further one (`PvmAtomicOperationTransitionDestroyScope.java:82-135`). The [pass-through Task probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) drives the [retained claim archiving and equipment dispatch](../scenarios/pass-through-implicit-split-merge/README.md) and their Abstract Task and None Throw twins in CIB `2.2.0` (2026-11-05): each claim decision passes *Archive claim file* as one ended instance and completes the Process, and the reservation passes *Print dispatch note* as one ended instance after which both User Tasks are open in the same command, in either completion order.

**Boundary:** Abstract Tasks, Manual Tasks and None Throws of the nested scope-data profile with several incoming flows in the Process root of a re-entry graph or several unconditioned outgoing flows where a Parallel fork of that arity is admitted, never both; public task, job and history APIs. Merges under a fork, conditioned or default outgoing flows, every other Activity kind, Start Events and asynchronous or listened nodes stay outside the class, and no Temporal refinement is claimed beyond the registered pipeline cases.

### CIB-AGR-0020 — a User, Service or Send Task starts one occurrence per arriving token

**Status:** Selected by the [nested scope-data profile](../profiles/cibseven-2.2.0-scope-chain/profile.json) for the [Activity host account](kernel/semantics/FLOW-SEMANTICS-SPEC.md), whose proposal review is approved; closure qualification pending. It is the waiting-Task instance of `CIB-AGR-0019` and admits several `CIB-AGR-0018` throws into such a Task.

**BPMN basis:** Clause 13.3.1 makes an Activity that is the target of several Sequence Flows participate in uncontrolled flow, enabled for each arriving token independently of the others, and the Activity notes of Clause 10.3 make a further arriving token create a separate instance of the Activity.

**Evidence:** At pinned `5a45b47`, a transition enters its destination without consulting the destination's other incoming transitions (`AbstractPvmAtomicOperationTransitionNotifyListenerTake.java:34-51`), so each arrival executes the Task's behavior on its own: `UserTaskActivityBehavior#performExecution` inserts one new task per entry (`UserTaskActivityBehavior.java:54-62`), and `ServiceTaskDelegateExpressionActivityBehavior#performExecution` invokes the delegate once per entry before leaving (`ServiceTaskDelegateExpressionActivityBehavior.java:101-119`). The [retained claim review](../scenarios/activity-host-merge/README.md) is the calibration model; its CIB probe is the closure's qualification evidence.

**Boundary:** User Tasks without data-input, data-output, boundary or Multi-Instance variants, and Service and Send Tasks without a BPMN Error route, of the nested scope-data profile, with several incoming flows and one outgoing flow in the Process root of a re-entry graph, including several Link throws of one name whose catch leads to such a Task; public task, job and history APIs. Merges under a fork or in a body, splits at any Task, every other Activity kind and asynchronous or listened Tasks stay outside the class, and no Temporal refinement is claimed beyond the registered pipeline cases.

### CIB-AGR-0021 — exact Intermediate Catch Timer durations

**Status:** Selected by the [Intermediate Catch Timer](../profiles/cibseven-2.2.0/profile.json) and [Timer/User Task composition](../profiles/bpmn-2.0.2/profile.json) profiles for the [Timer exact durations](kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) account.

**BPMN basis:** Clause 10.5.5 and Tables 10.101 and 10.122 make `timeDuration` the relative-duration Timer form; Clause 10.5.4 and Table 10.89 hold the token at the Intermediate Catch Timer until its trigger.

**Pinned CIB observation:** `DurationHelper` at `834a9874` parses a non-repeating duration with `DatatypeFactory.newDuration` and adds it to the start time, so hours, minutes and seconds add exact elapsed time. With the controlled clock at epoch zero, `PT1H30M` and `PT90M` each create one timer job due at epoch plus 5,400,000 ms that is not executable before the clock advance, is executable once the clock is set to the due date, and completes the Process when executed.

**Evidence:** the [`PT1H30M`](../packages/bpmn-source/test/fixtures/intermediate-catch-timer-durations/pt1h30m/scenario.json) and [`PT90M`](../packages/bpmn-source/test/fixtures/intermediate-catch-timer-durations/pt90m/scenario.json) scenarios through `CibSevenIntermediateCatchTimerTest` (removed at W0.3b).

**Fidelity boundary:** the due date, ineligibility before the advance, eligibility at the due date and completion are engine-observed; ineligibility at 1 ms before the due date follows from the exact due date and is not separately observed. The logical deadline is adapter-derived as in `CIB-AGR-0004`.

**Boundary:** an exact `PT[nH][nM][nS]` lexeme whose deadline is at most 2^53 − 1 at the Intermediate Catch Timer only. The boundary, race-arm, Timer Start and repeatable-catch sites keep `CIB-AGR-0004`'s single literal; the refused forms are `CIB-LIM-0003`.

### CIB-AGR-0022 — a None Start's start and an embedded Sub-Process's completion take every unconditioned outgoing flow in their one step

**Status:** Selected by the [nested scope-data profile](../profiles/cibseven-2.2.0-scope-chain/profile.json) for the [scope host account](kernel/semantics/SCOPES-SEMANTICS-SPEC.md), implemented and closure-reviewed. It is the Start and Sub-Process instance of `CIB-AGR-0019`'s split.

**BPMN basis:** Clause 10.5.1 generates a token for each outgoing Sequence Flow of a triggered Start Event, which Clause 13.2 restates for the Process; Clause 13.3.1 gives every outgoing flow of a completing Activity a token, a parallel split; Clause 13.3.4 instantiates an embedded Sub-Process when a token arrives and completes it when no token remains inside.

**Evidence:** At pinned `5a45b47`, a body Start is the Sub-Process's initial activity (`BpmnParse#parseStartEvents`, `#selectInitial`; `SubProcessActivityBehavior#execute`) and a root Start is entered at process start (`PvmAtomicOperationProcessStart`); both leave through `FlowNodeActivityBehavior#leave`, and a Sub-Process leaves through `SubProcessActivityBehavior#complete`. `BpmnActivityBehavior#performOutgoingBehavior` collects every unconditioned non-default transition and takes them in one `leaveActivityViaTransitions`, creating one concurrent execution per further transition (`PvmAtomicOperationTransitionDestroyScope`) and no activity instance for the split. `UncontrolledFlowTest#testSubProcessTwoOutgoingFlowsEndProcess` asserts both successors of a splitting Sub-Process. The [retained employee onboarding](../scenarios/scope-host-split/README.md) is the calibration model; its CIB probe is the closure's qualification evidence.

**Boundary:** the root None Start, the None Start of an ordinary embedded Sub-Process body and an ordinary embedded Sub-Process, of both CIB profiles, each with two or more unconditioned, non-default outgoing flows, the Sub-Process with one incoming flow; placed outside every fork region of its scope and its ancestors, or, as the retained [None event compositions](../scenarios/open-rows/none-event-compositions/README.md) `start-split` answers (`cibseven-2.2.0`) calibrate, a Sub-Process on a branch of its Start's split; public task, job and history APIs. Conditional and default outgoing flows, merges at Starts, Sub-Processes and Calls, splitting Calls and called-Process Starts, bounded, monitored, Multi-Instance, transaction and Event Sub-Processes, and asynchronous or listened Starts and Sub-Processes stay outside the class, and no Temporal refinement is claimed beyond the registered pipeline cases.

### CIB-AGR-0023 — a User, Service or Send Task's completion takes every unconditioned outgoing flow in its one step

**Status:** Selected by the [nested scope-data profile](../profiles/cibseven-2.2.0-scope-chain/profile.json) for the [Activity host split account](kernel/semantics/FLOW-SEMANTICS-SPEC.md), implemented, awaiting closure review. It is the Task instance of `CIB-AGR-0019`'s split, beside `CIB-AGR-0022`'s Start and Sub-Process instances, and the split counterpart of `CIB-AGR-0020`'s merge at the same Tasks.

**BPMN basis:** Clause 13.3.1 gives every outgoing Sequence Flow of a completing Activity a token, a parallel split, and Clause 10.3 restates it for Activities with several outgoing flows; Clause 13.3.3 applies it to User, Service and Send Tasks.

**Evidence:** At pinned `5a45b47`, a completed User Task (`UserTaskActivityBehavior#signal`), a completed Service Task (`ServiceTaskDelegateExpressionActivityBehavior#execute`) and a Send Task, which `BpmnParse#parseSendTask` gives that same behavior through `parseServiceTaskLike`, leave through `FlowNodeActivityBehavior#leave`. `BpmnActivityBehavior#performOutgoingBehavior` collects every unconditioned non-default transition and takes them in one `leaveActivityViaTransitions`, creating no activity instance for the split. The pinned `SequenceFlowTest#testTakeAllOutgoingFlowsFromNonScopeTask` completes one User Task and asserts both successor User Tasks open after that one completion; the [retained insurance claim intake](../scenarios/activity-host-split/README.md) is the calibration model, and its CIB probe is the closure's qualification evidence.

**Boundary:** a User Task, and a Service or Send Task without a BPMN Error route, of the nested scope-data profile, with one incoming flow and two or more unconditioned, non-default outgoing flows, without data associations, boundary events, Multi-Instance, listeners or task metadata, placed outside every fork region of its scope and its ancestors; public task, job and history APIs. Conditional and default outgoing flows, Tasks that both merge and split, Receive, Business Rule, Script and Manual Tasks, Calls, and every other profile stay outside the class, and no Temporal refinement is claimed beyond the registered pipeline cases and the recovery witness.

### CIB-AGR-0024 — a Multi-Instance Call Activity invokes one called instance per instance

**Status:** Selected bounded agreement: under the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile a Call Activity is admitted as Multi-Instance work (PC-MI-03), and the retained [Call body witnesses](../scenarios/open-rows/multi-instance-call-activity/README.md) agree.

**BPMN basis:** §10.3.6 makes each Call Activity instance invoke the called element; §10.3.8 and §13.3.7 make every Multi-Instance instance an Activity instance holding its item, generated together in parallel mode and one after the other in sequential mode, with the completion condition evaluated as each completes and the remaining instances cancelled when it holds.

**Evidence:** At pinned `834a9874`, a looping Call is no scope of its own (`BpmnParse.java:3997-4004`), so each instance's execution evaluates the Call's `camunda:in` (`CallableElementActivityBehavior.java:116`, `CallableElement.java:88-90`), starts one called instance, and receives its `camunda:out` through `passOutputVariables` before the instance completes (`CallableElementActivityBehavior.java:132-139`). The retained [Call body witnesses](../scenarios/open-rows/multi-instance-call-activity/README.md) (CIB Seven `2.2.0`) agree in both modes and both generation forms: equal reviewers give distinct called instances, reversed completion orders, cardinality bodies, quorum completion conditions cancelling the open called instances, an interrupting Timer on the body while called work remains, a called Error caught on the body, and two Calls forked in one closure. The retained answers of retake 43271426944 agree too: `camunda:in` reading the counters (`parallel-counters-in`, `sequential-counters-in`), a `camunda:out` named like the item that the completion condition reads (`sequential-item-out`), a called instance ending by Terminate or by an Error no catcher takes, which returns normally either way (`parallel-child-terminates`, `parallel-child-endings`), a called instance returning a new collection (`sequential-worklist`), and structured items mapped in (`call-parallel-structured-equal-lines`, `call-sequential-structured-equal-lines`). `error-multi-instance/sequential-second-instance-fails` and `escalation-multi-instance/parallel-interrupting` and `sequential-non-interrupting` agree with Call bodies too.

**Boundary:** Collection and cardinality Call bodies of both CIB profiles, called instances of the same deployment, public task, variable and Process-existence observations, including the Call's `camunda:in` reading the item and the counters, its `camunda:out` writing the item local, and a called instance's Terminate or uncaught Error, which ends only that called instance (`CIB-INT-0007`, `CIB-INT-0013`). A `camunda:out` targeting a counter stays refused (`CIB-LIM-0004`, `CIB-LIM-0020`); compensation of called instances stays with `CIB-DEV-0012`. No Temporal refinement is claimed beyond the registered pipeline cases.

## Interpretation register

An interpretation belongs here when BPMN is ambiguous, inconsistent, non-operational, or leaves several permitted behaviors and the pinned CIB engine supplies one concrete meaning. It is not labeled a deviation.

The [BPMN conformance target](BPMN-CONFORMANCE-TARGET.md#import-and-admission-policy) already records specification questions involving omitted `Process.isExecutable`, import/export wording, `Import.location`, incomplete interchange versus executable admission, and multi-instance wording. Those are BPMN-source issues awaiting feature-specific CIB probes, not CIB deviations and not yet approved `CIB-INT` entries.

### CIB-INT-0001 — Exclusive Gateway candidate order is XML Sequence Flow declaration order

**Status:** Selected bounded interpretation; standards capsule implemented

BPMN requires a defined order for outgoing conditional Sequence Flows but the portable XML does not require a gateway's `<outgoing>` references to be ordered. CIB Seven `2.0.0` constructs transitions while parsing process-level `<sequenceFlow>` elements and its Exclusive Gateway behavior iterates those transitions in that declaration order.

The selected profile orders candidates by XML `sequenceFlow` declaration order. The TypeScript importer records that order in the gateway's `candidateFlowIds`; the checked Sequence Flow collection itself is sorted by identity and contains no declaration-position field. Lean independently checks that lowering preserves the supplied candidate order, but cannot reconstruct XML order from that graph. [The compiler witness](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/packages/bpmn-source/test/simple-boolean-expression.test.ts) reverses only the two Sequence Flow declarations, preserves their identities and gateway references, and requires the checked order, IL order, and first-true User Task to reverse together.

**Evidence:** The [packaged-engine JUEL gateway probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenExclusiveGatewayJuelProbeTest.java) deliberately reverses gateway `<outgoing>` references while keeping declaration order fixed and observes the declaration-first branch. The standards scenario repeats that discriminator without using CIB as its expression oracle; the pinned source path and selected project rule are recorded in the [Exclusive Gateway condition specification](kernel/semantics/FLOW-SEMANTICS-SPEC.md).

**Boundary:** This interpretation is limited to the admitted divergent Exclusive Gateway slice. It is not a general order for other Flow Nodes, event races, parallel scheduling, or runtime occurrences.

### CIB-INT-0003 — an Exclusive Gateway whose conditions all fail rolls its command back

**Status:** Selected bounded interpretation; implemented and evidence-closed

BPMN Table 13.2 requires an exception when no condition of a diverging Exclusive Gateway without a default holds, and Clause 10.6.2 does not say what that exception does to the instance. CIB Seven `2.2.0` `ExclusiveGatewayActivityBehavior#doLeave` raises `ENGINE-02004` through `stuckExecutionException`, which aborts the whole command: a Start creates no instance and a User Task completion leaves its task open with none of the completion's writes.

The nested scope-data profile adopts that resolution as the semantic outcome `rolledBack` with the exact state before the command, for a Choice with two or more conditional flows and no default. CIB refuses a single conditional flow without a default when parsing (`BpmnParse#validateExclusiveGateway`), so the profile refuses it too. A no-match that an effect result reaches within its command is excluded, because CIB runs that command as a job whose failure is retried and raises an incident.

**Evidence:** The [calibration probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenExclusiveChoiceWithoutDefaultProbeTest.java) and the [Exclusive Choice without a default account](kernel/semantics/FLOW-SEMANTICS-SPEC.md).

**Boundary:** This interpretation covers Choices of both CIB profiles with core-level JUEL conditions, reached by a Start or a User Task completion; the retained [no-candidate-true](../scenarios/open-rows/exclusive-choice-compositions/README.md) answer (`cibseven-2.2.0`) calibrates it beside the probe. It does not cover a no-match after an effect result, incidents, job retries, a converging or mixed gateway, or any other profile. CIB refuses an Exclusive Gateway without an outgoing flow at deployment (`BpmnParse#validateExclusiveGateway`), and the kernel refuses it at admission (`gateway.exclusive.noOutgoingFlow`).

### CIB-INT-0004 — a Receive Task without a Message waits for an occurrence-addressed trigger

**Status:** Selected bounded interpretation; implemented and evidence-closed

BPMN Table 10.10 makes a Receive Task's `messageRef` optional, and Clauses 10.3.3 and 13.3.3 say the task waits for its associated Message and completes when it arrives, without saying how an unspecified Message is addressed. CIB Seven `2.2.0` declares no event subscription for such a task (`BpmnParse#parseReceiveTask`), waits in `ReceiveTaskActivityBehavior#performExecution` and leaves on an execution signal (`#signal`, reached through `RuntimeService#signal(executionId)` and `SignalCmd`).

The addressless Receive Task profile adopts that resolution with a field-free `unspecifiedMessage` channel: the wait is resumed only by a delivery naming its published occurrence with that channel. An unspecified delivery addresses only an addressless wait; CIB's signal also completes a Message-addressed Receive Task (`ReceiveTaskTest#testSupportsLegacySignalingOnSingleReceiveTask`), which the profile refuses as a project restriction, claiming no CIB agreement there. The trigger carries no variables, and CIB's variable-setting signal stays outside the profile.

**Evidence:** The [calibration probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenAddresslessReceiveTaskProbeTest.java) and the [addressless Receive Task account](kernel/semantics/WORK-SEMANTICS-SPEC.md).

**Boundary:** This interpretation covers only the root None Start → addressless Receive Task → None End shape of the addressless Receive Task profile. It does not cover repeated, embedded or Multi-Instance waits, trigger variables, signal names or any other profile.

### CIB-INT-0005 — an Inclusive Gateway output without a condition is always taken

**Status:** Selected bounded interpretation for the [Inclusive regions specification](kernel/semantics/FLOW-SEMANTICS-SPEC.md), whose closure review is approved

Clause 8.4.13 makes a Sequence Flow's `conditionExpression` an optional gating condition, while Table 10.124 gives an Inclusive Gateway's default a token "when none of the conditionExpressions on other Sequence Flows evaluate to true" and Table 13.3 throws "in case all conditions evaluate to false and a default flow has not been specified". Read literally, a split whose conditions are all false would take its default beside an ungated output, or throw without one. CIB Seven `2.2.0` at pinned `5a45b47` treats a non-default outgoing transition without a condition as true and takes the default only when nothing was selected (`InclusiveGatewayActivityBehavior.java:61-86`).

The nested scope-data profile adopts that reading: an absent condition is a condition that is always true, for selection, for the default rule and for the exception rule. Lowering gives such an output the Simple Boolean literal `true`, while the checked graph keeps its condition `null`. Admission requires an unconditioned output on a split without a default and refuses one beside a default, whose default no state could then reach.

**Evidence:** The [Inclusive regions probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenInclusiveGatewayRegionsProbeTest.java) runs the event booking with no extra ordered (2026-11-04): the unconditioned *Confirm attendee list* runs alone, and neither conditioned extra is activated.

**Boundary:** Inclusive splits, and an Activity's or Scope's own outgoing flows (§13.3.1, Figure 13.1), whose unconditioned flows are always taken as CIB takes them (`BpmnActivityBehavior#performOutgoingBehavior`; the kernel's `Feature.Flow.ownFlows`). A diverging Exclusive Gateway's sole unconditioned flow is `CIB-INT-0015`.

### CIB-INT-0002: sequential Multi-Instance `nrOfInstances` is desired cardinality from outer entry

**Status:** Observed bounded interpretation; not selected by the standards profile

BPMN Table 10.30 describes `numberOfInstances` as the number of generated inner instances, while Clause 13.3.7 says a sequential instance is generated only after its predecessor completes. CIB Seven instead initializes public loop variable `nrOfInstances` to the once-evaluated desired collection cardinality before the first inner task appears.

The exact three-item probe observes `nrOfInstances = 3` at loop counters `0`, `1`, and `2`, while `nrOfCompletedInstances` advances through `0`, `1`, and `2` and `nrOfActiveInstances` remains `1`. This is a concrete resolution of the specification tension, not evidence that CIB generates all three sequential instances at entry.

The project standards profile does not adopt that counter identity. It keeps normative generated-instance accounting in `numberOfInstances` and exposes the once-evaluated desired cardinality separately as project-owned `plannedInstanceCount`; neither CIB variable name nor value is semantic authority.

**Evidence:** The [public-service phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSequentialMultiInstancePhaseZeroProbeTest.java), the pinned `SequentialMultiInstanceActivityBehavior`, and the [selected counter resolution](kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md).

**Boundary:** This interpretation covers only the exact sequential collection-driven fixture under `CIB-CFG-0001`. It says nothing about parallel Multi-Instance, runtime modification, migration, completion conditions, compensation, or project public counter names.

### CIB-INT-0007 — a Sub-Process left abnormally completes normally

**Status:** Recorded bounded interpretation from the pinned source and retained evidence; selected by `ProfileOptions.abnormalScopeEnd` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json)

BPMN says a Sub-Process left by a Terminate End or by an interrupting Event Sub-Process is "abnormally terminated" (§13.3.4, §13.5.6) and leaves the parent's continuation open. A called process ended by a Terminate End at its process level is abnormally terminated the same way (§13.5.6), and §13.3.4 gives the Call Activity the Sub-Process's termination semantics, so the Call's continuation is open too. CIB Seven `2.2.0` completes such a Sub-Process normally and takes its outgoing flows; a called instance left by a Terminate End ends normally, passes the Call's outputs, and the Call leaves on its outgoing flows. A Terminate End inside one instance of a Multi-Instance Sub-Process, or inside one instance of a non-interrupting Event Sub-Process, terminates only that instance (§13.5.6), and BPMN counts a terminated Multi-Instance instance in `numberOfTerminatedInstances`, apart from the completed ones, with no completion-condition evaluation (Table 10.30, §13.3.7). CIB completes that instance normally too: a terminated Multi-Instance instance counts as completed in `nrOfCompletedInstances` and triggers the completion condition, with no terminated count, and a terminated Event Sub-Process instance ends while its host's ordinary work and its other instances run on.

**Evidence:** Pinned `SubProcessActivityBehavior#complete`, and the kernel rule basis in the [row traceability](kernel/ROW-TRACEABILITY-MAP.md#rule-basis) (`Propagation`, `Scopes.startEventSubProcess`, `Step`). For a called instance, pinned `BpmnParse.java:3170-3173` (a Terminate interrupts its flow scope), `PvmAtomicOperationInterruptScope.java:29-47`, `TerminateEndEventActivityBehavior.java:35-38` and `PvmAtomicOperationProcessEnd.java:61` (the Call's outputs); the kernel's `AdmissionRegistry.abnormalScope`, which counts a Terminate End at a called process's level since `3a0e71aa1`, with its guard row in `packages/kernel/test/admission-refusals-profile.test.ts`. The retained witnesses agree (CIB Seven `2.2.0`): [terminate-containing-region](../scenarios/open-rows/terminate-containing-region/README.md) `inner-scope-terminate` and `region-terminate-with-incident` (a Sub-Process left by a Terminate End goes on to its successor), [error-event-subprocess-recovery](../scenarios/open-rows/error-event-subprocess-recovery/README.md) `recover-and-continue` (the region of an interrupting handler goes on) [terminate-called-child](../scenarios/open-rows/terminate-called-child/README.md) `terminate-one-call-sibling-survives` and `terminate-both-calls-reversed` (the Call passes its output and leaves), [terminate-multi-instance-bodies](../scenarios/open-rows/terminate-multi-instance-bodies/README.md) `parallel-first-body-terminates`, `parallel-second-body-terminates` and `sequential-first-body-terminates` (the other bodies run on and the loop completes), and [terminate-event-subprocess-instances](../scenarios/open-rows/terminate-event-subprocess-instances/README.md) `first-handler-instance-terminates` and `second-handler-instance-ordinary-first` (the other handler instance and the host run on). For a Multi-Instance instance, pinned `SubProcessActivityBehavior.java:57-58`, `ParallelMultiInstanceActivityBehavior.java:82-96` and `SequentialMultiInstanceActivityBehavior.java:50-53` (counted as completed, then the completion condition); the completion-condition witnesses `parallel-first-body-completes-loop` and `sequential-first-body-completes-loop`, whose retained answers (Verify run 43238005814) agree.

**Boundary:** The kernel implements only this normal continuation; the standards reading (`AbnormalScopeEnd.withoutOutflow`) refuses a program whose shape reaches it, a Terminate End in a Sub-Process or at a called process's level or an interrupting Event Sub-Process, with `profile.abnormalScopeEnd.withoutOutflow`. A Multi-Instance instance's Sub-Process and an Event Sub-Process are Sub-Processes, so the same refusal covers a Terminate End in them; the kernel publishes no terminated count ([Multi-Instance semantics](kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md#terminated-instances-pc-mi-12), [scopes](kernel/semantics/SCOPES-SEMANTICS-SPEC.md#pc-terminate-02-terminate-inside-called-children-multi-instance-bodies-and-event-sub-process-instances)).

### CIB-INT-0008 — a repeating Timer without a start date first fires one period after arming

**Status:** Recorded bounded interpretation from the pinned source; selected by every profile

BPMN §10.5.5 does not fix the first firing of an ISO 8601 cycle that has no start date. CIB Seven `2.2.0` takes the arming time as the start and returns the first date after it, one period after arming; a count `R<n>` gives `n` firings at arming + k·period, each one period after the deadline it fired at, after which none follows.

**Evidence:** Pinned `DurationHelper` (constructor `:70-90`, `getDateAfterRepeat` `:116-129`), `TimerEntity#preExecute` and `#calculateNewDueDate`; `StartTimerEventTest#testCycleWithLimitStartTimerEvent` (two firings of `R2/PT5M`, then no job); retained `timer-recurrence/count-finite-overlap` (first deadline 10,000 after arming at 0); the kernel's `Timer.arm` and `Timer.successor`.

**Boundary:** Undated ISO cycles `R/<p>` and `R<n>/<p>` (`1 ≤ n ≤ 2^31 − 1`) with an exact period (no years or months, not zero) at every subscription site. Dated intervals, `R0`, signed counts and nominal periods are refused (`timer.cycle`). The last-fire chain, sub-second start truncation and late-firing skip are CIB-DEV-0006, CIB-DEV-0007 and CIB-DEV-0008.

### CIB-INT-0009 — on the final Multi-Instance completion, sequential tests exhaustion first and parallel tests the condition first

**Status:** Recorded bounded interpretation from the pinned source; selected by `ProfileOptions.multiInstanceFinalBody.modeSpecific` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile

BPMN §13.3.7 evaluates the completion condition on every completion. CIB Seven `2.2.0` skips it on the sequential mode's final completion, which `loopCounter == nrOfInstances` short-circuits, and evaluates it first in parallel mode.

**Evidence:** Pinned `SequentialMultiInstanceActivityBehavior:53` and `ParallelMultiInstanceActivityBehavior:95-96`; the kernel's `MultiInstance.evaluatesFinalCondition`; the retained witnesses [service-sequential-failing-final and service-sequential-not-boolean-final](../scenarios/open-rows/multi-instance-completion-failures/README.md), which commit in both engines because the sequential final completion never evaluates the failing condition, and their parallel counterparts, which roll back in both (CIB Seven `2.2.0`).

**Boundary:** The observable difference is whether the final completion's condition evaluates, not any other Multi-Instance counter. `MultiInstanceFinalBody.conditionEveryCompletion` keeps the BPMN evaluation.

### CIB-INT-0010 — at one catching scope an Event Sub-Process precedes a boundary, and an exact code precedes a catch-all

**Status:** Recorded bounded interpretation from the pinned source and retained evidence ([error-event-subprocess-precedence](../scenarios/open-rows/error-event-subprocess-precedence/README.md), agreeing); the kernel's meaning under every profile, with no option, document order between two catch-alls included

BPMN Table 10.88 lets an exact-code and a catch-all catcher both catch, and §10.5.1 names the nearest catcher only. CIB Seven `2.2.0` orders catchers at one scope by precedence: an Event Sub-Process start has precedence 10 over a boundary's 0, and a catcher with a code gets one more than a catch-all's.

**Evidence:** Pinned `BpmnParse:1221` (`setPrecedence(10)`), `ErrorEventDefinition#getPrecedence` ("handlers with error code take precedence over catchall-handlers"); the kernel's `Propagation.searchScopes` and `Subscriptions.codePrecedence`. For Escalations CIB lists an Event Sub-Process's definition while it parses the enclosing scope (`BpmnParse.java:1139-1143`) and a boundary's while it parses the host's parent's boundaries (`BpmnParse.java:3335-3339`, `3652-3656`), so an Event Sub-Process precedes a boundary of the same host. Its finder takes the first match in that list with no exact-before-catch-all rank (`bpmn/helper/EscalationEventDefinitionFinder.java:44-56`), but the declarations both CIB and the kernel admit never give one level two matching Escalation handlers (CIB-LIM-0021). The retained [escalation-event-subprocess-modes](../scenarios/open-rows/escalation-event-subprocess-modes/README.md) witnesses agree (CIB Seven `2.2.0`).

**Boundary:** Error and Escalation catches at one catching scope, including two catch-all Error boundaries on one host, which catch in document order ([notify-two-catch-alls](../scenarios/open-rows/error-boundary-candidates/README.md)). It does not cover searches across scopes, which §10.5.1 settles as nearest first. Two Error catchers of one kind in one place with the same exact code, which CIB keeps in document order by a stable sort on precedence (`BpmnParse.java:3645-3650`), are refused under every profile, since BPMN 2.0.2 §10.5.6 allows one interrupting handler per Event Declaration and does not order them: two interrupting Error boundaries of one host (`boundary.error.duplicateCode`) and two Error Event Sub-Processes of one scope (`scope.eventSubProcess.errorDuplicateCode`). Catch-alls are not refused: two catch-all Error boundaries of one host, or two catch-all Error Event Sub-Processes of one scope, catch in document order.

### CIB-INT-0011 — an Activity's outgoing conditions evaluate before its output writes

**Status:** Recorded bounded interpretation from the pinned source; selected by `ProfileOptions.conditionOrder.beforeOutputs` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile

BPMN §13.3.2 writes an Activity's outputs before it leaves, so a condition reads them (`ConditionOrder.afterOutputs`). CIB Seven `2.2.0` evaluates the outgoing conditions when the Activity leaves, against the execution that still holds the Activity's locals, and runs its output parameters only when the Activity ends after that.

**Evidence:** Pinned `BpmnActivityBehavior#performOutgoingBehavior:81-92` for the evaluation and `ExecutionEntity:524` for the output parameters; the kernel's `Feature.Flow.select`; the retained witness [review-output-order-mapped-output-and-condition](../scenarios/open-rows/activity-split-merge/README.md), which agrees under the option (CIB Seven `2.2.0`).

**Boundary:** Conditional Sequence Flows out of an Activity.

### CIB-INT-0012 — a diverging Inclusive Gateway that selects no flow rolls its command back

**Status:** Selected bounded interpretation from the pinned source

BPMN Table 13.3 throws an exception when every condition of a diverging Inclusive Gateway is false and it has no default, and Clause 10.6.3 does not say what that exception does to the instance. CIB Seven `2.2.0` at pinned `5a45b47` collects the non-default transitions whose condition is absent or true, takes the default when none was collected, and otherwise raises `ENGINE-02004` through `stuckExecutionException`, which aborts the whole command as in `CIB-INT-0003`.

The kernel adopts that resolution as the semantic outcome `rolledBack` with the state before the command (`inclusive-gateway-no-outgoing-flow`).

**Evidence:** Pinned `InclusiveGatewayActivityBehavior.java:61-84`, with the throw at `:82`, and `BpmnBehaviorLogger.java:51-55` for the code; the kernel's `Feature.Flow.inclusiveFlows`.

**Boundary:** A diverging Inclusive Gateway reached by a Start or a User Task completion, and an Activity's own conditional outflow that takes no flow, which rolls back as `activity-no-outgoing-flow` as CIB throws from `BpmnActivityBehavior#performOutgoingBehavior` (witnesses [activity-outflow-none-holds and inclusive-without-default-none-selected](../scenarios/open-rows/flow-simple-boolean-outflow/README.md)). An unconditioned output is always taken (`CIB-INT-0005`). It does not cover a no-match after an effect result, incidents or job retries. CIB deploys an Inclusive Gateway without an outgoing flow and rolls back every activation (`InclusiveGatewayActivityBehavior#execute`, `stuckExecutionException`); the kernel refuses it at admission (`gateway.inclusive.noOutgoingFlow`), a restriction.

### CIB-INT-0013 — an Error that no catcher takes ends only its throwing path

**Status:** Recorded bounded interpretation from the pinned source and retained evidence; selected by `ProfileOptions.unhandledError = endsThrowingPath` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile, under `CIB-CFG-0010`

BPMN 2.0.2 §10.5.1 leaves an Error without a catcher unresolved, and Table 10.88 calls the outcome unspecified, "a common one being termination of the Process instance"; the standards profile selects that termination (`UnhandledError.failsInstance`, [propagation semantics](kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md)). CIB Seven `2.2.0` with `enableExceptionsAfterUnhandledBpmnError = false` logs the missing catcher and calls `execution.end(true)` on the thrower's execution: the throwing path ends as at a None End Event, other paths are untouched, an enclosing Sub-Process completes normally once nothing else remains in it and its parent continues, and the instance completes when nothing remains. A Service Task's output parameters still run on that path, as on a caught one (`CIB-EXT-0016`).

When the search ends, a raising Service Task, which stood during it, leaves first (`Propagation.hostLeaves`, after any Call output pass of `CIB-EXT-0034`), writing its error-path outputs under `ErrorPathOutputs.mapped`; an Error End Event has already consumed its token. `endsThrowingPath` then ends the throwing path, and the instance goes on or completes as what remains says.

**Evidence:** Pinned `BpmnExceptionHandler#propagateError` (`BpmnExceptionHandler.java:129-137`); the retained witnesses [effect-wrong-code and error-end-no-catcher](../scenarios/open-rows/error-unhandled/README.md), [unrelated-sibling-catch-all](../scenarios/open-rows/error-ancestor-search/README.md), [root-without-outputs and parallel-root-branch-with-outputs](../scenarios/open-rows/error-unhandled-outcomes/README.md), [scope-unmatched-code](../scenarios/open-rows/automation-business-error-routing/README.md), whose Sub-Process continues after the mapped output of its unmatched Service Task, and [sibling-boundary-active](../scenarios/open-rows/automation-business-error-non-ancestor/README.md) (CIB Seven `2.2.0`, 2026-11-09); the kernel's `Propagation.unhandledError`.

**Boundary:** Errors raised by an Error End Event or by a Service Task's business failure that no boundary or Event Sub-Process of the instance catches. When the thrower ran directly in its instance's root, has output parameters and its path is the last one there, CIB rolls the command back instead (`CIB-LIM-0006`). Inside a called instance the throwing path ends the same way: with nothing else left there the called instance ends and its Call returns normally ([unlisted-code-without-outputs](../scenarios/open-rows/error-called-child-uncaught/README.md), retained and agreeing), and the Call's outputs pass at the called root first under `CIB-EXT-0034`. An uncaught Error whose thrower runs anywhere inside a Multi-Instance instance of its own instance is refused at run time as `unsupported`, with the dynamic-only code `unhandled-error-leaves-multi-instance-instance`, until PC-ERROR-03 settles what `execution.end(true)` does to that instance; the refusal also covers runs where other paths of that instance remain open. A called instance bounds it: a thrower inside a called instance whose Call is, or lies inside, a Multi-Instance instance of the caller ends its path in the called instance, which then ends and returns as above. It does not cover Errors that leave a compensation handler, technical failures, which no Error code catches here (`CIB-EXT-0029`), the history CIB records for the ended thrower, or `enableExceptionsAfterUnhandledBpmnError = true`.

### CIB-INT-0014 — a Multi-Instance loop binds its collection and item by the loop's own references, not by Data Associations

**Status:** Recorded bounded interpretation from the pinned source; selected by `ProfileOptions.multiInstanceBinding = loopReferences` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json)

BPMN 2.0.2 §10.2.8 (Table 10.29) makes `loopDataInputRef` a reference to the Activity's collection Data Input and `inputDataItem` the Data Input each instance receives, and §10.4.1 and §10.4.2 fill Data Inputs through Data Input Associations; the standard says nothing about how an engine's externally named variables relate to those item-aware elements. CIB Seven `2.2.0` reads the collection from the Process variable literally named by the `loopDataInputRef` text (an expression when it contains `{`) and gives each instance the item as a local variable named by the `inputDataItem`'s `name`, ignoring the Data Input Associations and any Data Object they read. This is the literal binding [`CIB-AGR-0011`](#cib-agr-0011-bounded-collection-driven-sequential-multi-instance-user-task-lifecycle) already used as CIB's public Process-variable binding.

The kernel reader carries both readings: `MultiInstance.count` and `inputDataItem` from the associations, `loopDataInputRef` and `inputDataItemName` from the loop. `MultiInstanceBinding.dataAssociations`, the standards reading, uses the first; `loopReferences` reads the collection from the variable `loopDataInputRef` names and binds the item to `inputDataItemName`, no local when the item has no name. A loop without `loopDataInputRef`, given by `camunda:collection`, keeps `count` under both. Under `loopReferences` a loop without an `inputDataItem` binds the item to `camunda:elementVariable`, which CIB sets first and an `inputDataItem`'s `name` replaces, even an absent one (`BpmnParse.java:1863-1873`); the kernel refuses the two together (`multiInstance.elementVariable`), as it does `camunda:elementVariable` under `dataAssociations`.

**Evidence:** Pinned `BpmnParse#parseMultiInstanceLoopCharacteristics` (`BpmnParse.java:1850-1873`: `loopDataInputRef` text to `setCollectionVariable` or `setCollectionExpression`, `inputDataItem@name` to `setCollectionElementVariable`); the [Multi-Instance Service Task witnesses](../scenarios/open-rows/multi-instance-service-task/README.md), whose start variable is `DataInput_Recipients`; the kernel's `MultiInstance.collectionOf` and `MultiInstance.itemName`.

**Boundary:** Standard-form loops on admitted Multi-Instance bodies. It claims nothing about general Data Association execution, Data Objects, a `loopDataInputRef` expression, `loopDataOutputRef` or `outputDataItem` (`CIB-LIM-0001`), or the item's visibility outside the instance (PC-MI-10).

### CIB-INT-0015 — a diverging Exclusive Gateway's sole unconditioned flow is a candidate whose condition always holds

**Status:** Selected bounded interpretation from the pinned source; the standards profile and the CIB profiles agree

BPMN 2.0.2 §10.6.2 and Table 13.2 route a diverging Exclusive Gateway by its conditions and its default and say nothing of an unconditioned output that is not the default. CIB Seven `2.2.0` treats a flow without a condition as one whose condition holds, tried in declaration order (`ExclusiveGatewayActivityBehavior#doLeave`), and its parser refuses a second unconditioned flow, an unconditioned flow beside a default, and a sole conditioned flow without default (`BpmnParse#validateExclusiveGateway`). The kernel reads the sole unconditioned flow the same way, as `CIB-INT-0005` reads an Inclusive output, and refuses the shapes CIB's parser refuses as `gateway.exclusive.unconditionedFlow` and `gateway.exclusive.singleConditionWithoutDefault`.

**Evidence:** Pinned `ExclusiveGatewayActivityBehavior#doLeave` and `BpmnParse#validateExclusiveGateway`; the kernel's `Admission.Flow.exclusive`; the witness [exclusive-sole-unconditioned-condition-holds](../scenarios/open-rows/flow-simple-boolean-outflow/README.md) (Lean and TypeScript agree; no retained CIB answer yet).

**Boundary:** A diverging Exclusive Gateway with at least two outgoing flows, at most one of them unconditioned and no default beside it.

### CIB-INT-0016 — a converging Inclusive Gateway fires when no further token of its scope occurrence can reach it

**Status:** Selected bounded interpretation of Activity-held tokens, shared by every profile; the reach through Boundary Events is `CIB-INT-0020`, and the trigger without an arrival `CIB-DEV-0002`. Beyond the duplicate-arrival class of `CIB-DEV-0001`, the standards and CIB profiles differ by `CIB-DEV-0002` and, under `CIB-INT-0020`, by the reach

BPMN 2.0.2 Table 13.3 activates a converging Inclusive Gateway when at least one incoming flow has a token and, for every empty incoming flow, no token upstream can reach it, without defining "upstream" in cyclic or multi-scope graphs. The kernel fires a join once no token of the same scope occurrence can reach an empty incoming flow without passing through the gateway, by a flow search over the IL that follows Links (`Feature.Flow.reaches`). CIB Seven `2.2.0` counts executions and reachability over the scope's process-virtual-machine graph (`InclusiveGatewayActivityBehavior#activatesGateway`, `#canReachActivity`). The two differ on admitted witnesses only by duplicate arrivals through one incoming flow, where CIB counts arrivals (`CIB-DEV-0001`), by a parked join that becomes ready without a new arrival, which CIB never re-examines (`CIB-DEV-0002`), and, under `CIB-INT-0020`, by a reach that does not follow a host's Boundary Events.

**Evidence:** Pinned `InclusiveGatewayActivityBehavior.java` (`activatesGateway`, `canReachActivity`); the retained witnesses [parallel-fed-join-a-then-b and parallel-fed-join-b-then-a](../scenarios/open-rows/inclusive-join-compositions/README.md), which agree, and [duplicate-arrival-join-left-pair-first](../scenarios/open-rows/parallel-region-compositions/README.md), which `CIB-DEV-0001` owns (CIB Seven `2.2.0`, 2026-11-09). The pending `inclusive-join-activation/nested-inclusive*` and `nested-parallel*`, where CIB and the kernel fire the outer join once, also agree by prediction.

**Boundary:** Converging Inclusive Gateways anywhere in one scope occurrence; arrivals from another scope occurrence are outside it, and the join after Sub-Processes, Calls and Multi-Instance bodies closes with `PC-SCOPE-01` and the Multi-Instance rows.

### CIB-INT-0017 — a COLLECT decision result lists its values in rule order

**Status:** Selected interpretation for the CIB profiles' decision tables (`CIB-EXT-0032`)

DMN 1.3 leaves the order of a COLLECT hit policy's result open. CIB Seven `2.2.0` returns the matched rules' outputs in rule order, and the kernel does the same ([decision semantics](kernel/semantics/DECISION-SEMANTICS-SPEC.md), items 5 and 6).

**Evidence:** The `collect-*` witnesses of [business-rule-hit-policies](../scenarios/open-rows/business-rule-hit-policies/README.md).

**Boundary:** COLLECT without an aggregator, as the decision semantics admit it.

### CIB-INT-0018 — Multi-Instance counters are CIB's execution locals at every site inside an instance

**Status:** Recorded bounded interpretation from the pinned source; selected by `ProfileOptions.multiInstanceCounters = cibLocals` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile

**What BPMN gives.** BPMN 2.0.2 gives each instance its item: Table 10.29's `inputDataItem` represents "for every Activity instance the single item of the collection" and can be the source of the Activity's Data Input Associations. Table 10.30 defines instance attributes: `loopCounter` for each inner instance, the n-th generated; `numberOfInstances`, `numberOfActiveInstances` (at most 1 in sequential mode), `numberOfCompletedInstances` and `numberOfTerminatedInstances` for the outer instance, where terminated, completed and active always sum to `numberOfInstances`. §13.3.7 lets the `completionCondition` refer to them. The standard names no expression variable for these attributes and says nothing about their visibility at any other site.

**What CIB selects.** CIB Seven `2.2.0` chooses the names, the values and the visibility. It holds `loopCounter`, zero-based, as a local of each instance's execution beside the item, and `nrOfInstances`, `nrOfActiveInstances` and `nrOfCompletedInstances` as locals of the body's, each a Java `Integer`; there is no terminated count.

- **Parallel:** the count, the count minus the completed instances, and the completed instances, each updated before the completion condition reads it.
- **Sequential:** `nrOfInstances` is the count from entry (CIB-INT-0002); `nrOfActiveInstances` is 1 throughout, including when the condition is evaluated, where Table 10.30's sum would give 0; `nrOfCompletedInstances` is incremented before the condition; `loopCounter` still names the completing instance.
- **Visibility:** every expression evaluated in an execution below an instance resolves them: the completion condition and every site nested in a Sub-Process instance alike. The innermost loop's counters hide an enclosing loop's. A loop's own cardinality and collection are evaluated before its own counters exist; an enclosing loop's counters are visible there.

Under the option the kernel holds the counters as locals of the body's and each instance's scope occurrence (`MultiInstance.counterLocals`) and admits a counter name at a site inside an instance (`Admission.MultiInstance.countersAt`); elsewhere a counter name stays `expression.juel.multiInstanceCounter`, as it does in a loop's own count expressions, a restriction that does not tell this loop's absent counters from an enclosing loop's. Publication keeps the Table 10.30 accounting of the [Multi-Instance semantics](kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md#counters-and-the-item-at-every-instance-site). Admission refuses an item named like a counter (`multiInstance.itemNamedLikeCounter`), a looping Activity's own input mapping reading the instance (`CIB-LIM-0019`) and a counter-named target inside an instance (`CIB-LIM-0020`); a write admission cannot see is `unsupported` (`multiInstance.resultShadowsInstance`). No admitted rule observes the counters' Java class: `${loopCounter.equals(0)}` is `unsupported` (`juel.methodReceiver`).

**Evidence:** Pinned `MultiInstanceActivityBehavior.java:49-54`, `:76-88`, `:196-204`; `ParallelMultiInstanceActivityBehavior.java:64-68`, `:84-87`, `:96`; `SequentialMultiInstanceActivityBehavior.java:38-45`, `:47-61`, `:67-70`. The retained [Multi-Instance Service Task](../scenarios/open-rows/multi-instance-service-task/README.md) quorum witnesses (`${nrOfCompletedInstances >= quorum}`, both modes), which agree under the option. The [multi-instance-expression-results](../scenarios/open-rows/multi-instance-expression-results/README.md) witnesses `sequential-active-count`, `parallel-active-count`, `completion-reads-counter` and `completion-counter-equals`, and the separating [multi-instance-instance-sites](../scenarios/open-rows/multi-instance-instance-sites/README.md) witnesses, which read the counters and the item at a nested site in both modes, `nrOfInstances` in sequential mode, and an inner loop's counters under an outer loop's; their evidence run is pending. The [compensation-multi-instance-bodies](../scenarios/open-rows/compensation-multi-instance-bodies/README.md) witnesses `counters-sequential-last` and `counters-parallel-early` read the body's counters in a compensation handler, as the body's event scope copied them when the last completion or the completion condition left the body (`MultiInstanceActivityBehavior.java:172-175`, [#106](https://github.com/mbackschat/bpmn-lean-experiment/issues/106)); their evidence run is pending.

**Boundary:** The four counter names inside an instance under `cibLocals`; under `none` no counter name resolves. Not covered: whether the final completion evaluates the condition (CIB-INT-0009); a loop's own count expressions and its conditional outgoing flows, which admission refuses; runtime modification (`createInnerInstance`, `initializeScope`) and migration; publication.

### CIB-INT-0019 — an unavailable, null or wrong-kind Multi-Instance input fails the operation

**Status:** Recorded bounded interpretation from the pinned source; selected by `ProfileOptions.multiInstanceInputFailure = rollback` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile

BPMN 2.0.2 §10.4.2 holds an Activity whose InputSet is unavailable until it becomes available. The standards reading holds the occurrence when the input collection is unavailable, and fails semantically on a present value that is no collection. CIB Seven `2.2.0` reads the count and collection when the token arrives and throws inside the operation that reached the Activity whenever one is missing or of the wrong kind, so the operation fails and nothing waits. The kernel follows the [stimulus table](kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#failure-semantics): a command rolls back; an effect result rolls back as well, since neither CIB profile selects CIB-EXT-0026, where CIB fails the job that completed the effect (a known disagreement); and a Timer is `unsupported`. The cases are a collection variable that is absent, null or not a `Collection`; a collection expression that fails or is not a `Collection`; and a count that fails, is not a number, or is negative (`multiInstance.notACollection`, `multiInstance.notANumber`, `multiInstance.negativeCount`, or the evaluation's own code).

**Evidence:** Pinned `MultiInstanceActivityBehavior:68-69` (`invalidAmountException`), `:113-114` (`unresolvableExpressionException`), `:117-120` (`invalidVariableTypeException`), `:153` (`expressionNotANumberException`). The retained [multi-instance-expression-results](../scenarios/open-rows/multi-instance-expression-results/README.md) `count-*` and `collection-*` witnesses (CIB Seven `2.2.0`); the count shapes the ledger keeps under PC-DATA-08/09 are CIB-LIM-0010 and CIB-EXT-0033 territory, not this entry's.

**Boundary:** The count and collection sites of admitted loops. A completion-condition failure follows the stimulus table under both values. A count that is fractional or outside Java's `int` range is `unsupported` (CIB-LIM-0010). Which values count is CIB-EXT-0033. The `service-*` and `user-sequential-*-final` schedules of [multi-instance-completion-failures](../scenarios/open-rows/multi-instance-completion-failures/README.md) agree with their retained CIB answers.

### CIB-INT-0020 — a converging Inclusive Gateway's reach does not follow a host's Boundary Events

**Status:** Selected bounded interpretation; selected by `ProfileOptions.inclusiveJoinReach = outgoingOnly` through both CIB profiles. The standards profile reads `withBoundaries`. The CIB side is a source prediction until the `boundary-path` evidence is retained.

Table 13.3 follows "directed path[s] formed by sequence flow" from a Sequence Flow that holds a token. It defines no continuation for a token held by an active Activity, a waiting Event or a child scope (CIB-INT-0016).

- **Standards reading:** such a position continues on the element's outgoing flows and on the outgoing flows of its Boundary Events, since an attached Event can still fire (§10.5.4).
- **CIB reading:** `InclusiveGatewayActivityBehavior#isReachable` (`:141-199`) follows outgoing transitions, an Event-Based Gateway's event activities and the flow scope of an activity without outgoing transitions. It never follows a Boundary Event, which is no outgoing transition of its host.
- **Consequence of `outgoingOnly`:** a join can fire while a Boundary Event that reaches it is still armed. That Event's later token arrives alone and fires the join again.

**Evidence:** Pinned `InclusiveGatewayActivityBehavior.java` `isReachable`. Pending [`boundary-path-parked-then-closed` and `boundary-path-parked-then-escalated`](../scenarios/open-rows/inclusive-join-activation/README.md); `parked-then-escalated` decides. Kernel tests: `packages/differential/test/flow-inclusive-join-activation.test.ts`.

**Boundary:** Boundary Events of a host inside the join's scope occurrence. Event Sub-Processes, and reach across scope occurrences, are outside it.

### CIB-INT-0021 — an Escalation no catcher takes lets its thrower continue

**Status:** Recorded bounded interpretation from the pinned source and retained evidence; the kernel's meaning under every profile, with no option

BPMN 2.0.2 §10.5.1 calls Escalations "non critical", with "execution continues at the location of throwing", and leaves an uncaught trigger unresolved; Table 10.88 calls the process's behavior unspecified when nothing catches an Escalation End. CIB Seven `2.2.0` runs the search, starts the catcher's handler if one is found, and then leaves the throw unless the catcher interrupts: an Intermediate throw takes its outgoing flows and an End Event ends its path, catcher or not.

The kernel raises first and the thrower leaves afterwards if its occurrence still stands (`Propagation.throwerLeaves`): an uncaught Escalation commits with the thrower's leave as its only effect, and under an interrupting catch the thrower ends cancelled with its scope.

**Evidence:** Pinned `ThrowEscalationEventActivityBehavior.java:41-58` and `EscalationHandler.java:50-75`; only `EscalationHandler#propagateEscalation:38-44`, which no BPMN throw calls, fails without a catcher. The retained witnesses [intermediate-uncaught and end-uncaught-then-ordinary-path](../scenarios/open-rows/escalation-uncaught/README.md) agree (CIB Seven `2.2.0`, 2026-11-10); the kernel's `Propagation.exhausted`.

**Boundary:** Escalations raised by Intermediate and End throw Events. An Escalation that reaches a compensation handler's scope uncaught stays refused (`compensation-handler-escalation`). An uncaught Escalation that leaves a called instance passes the Call's outputs at each called root it reaches (`CIB-EXT-0034`).

### CIB-INT-0022 — a rethrown event passes the Event Sub-Process it is raised in

**Status:** Recorded bounded interpretation from the pinned source and retained evidence; the kernel's meaning under every profile, with no option

BPMN 2.0.2 §13.5.4 lets an Event Sub-Process re-trigger its event "to cause its continuation outside the boundary of the associated Sub-Process", where "control passes to the boundary Event", and §10.5.6 says the inline handler otherwise absorbs it. BPMN does not say how the search treats the running handler itself. CIB Seven `2.2.0` skips it: its Error finder skips an Event Sub-Process that is an ancestor flow scope of the thrower at any depth, its Escalation finder only the thrower's direct flow scope.

The kernel passes an Event Sub-Process the raise originates inside at the scope occurrence that holds it (`Propagation.handlerCandidates`), so a rethrow reaches the host's boundaries and goes outward.

**Evidence:** Pinned `bpmn/helper/ErrorDeclarationForProcessInstanceFinder.java:41-58`, `pvm/process/ScopeImpl.java:170-182` and `bpmn/helper/EscalationEventDefinitionFinder.java:58-61`. The retained witness [same-code-rethrow](../scenarios/open-rows/error-event-subprocess-rethrow/README.md) agrees (CIB Seven `2.2.0`, 2026-11-10); the kernel tests `packages/kernel/test/propagation-rethrow.test.ts`.

**Boundary:** Errors from any depth inside the handler, and Escalations from directly inside it. Refused as dynamic-only `unsupported`: an Escalation raised deeper inside a handler that matches it, which CIB catches with that handler again and so re-enters it without bound (`escalation-rethrow-reenters-handler`); and a raise from an interrupting handler that a sibling Event Sub-Process of the same scope would catch (`rethrow-caught-by-sibling-handler`, CIB-DEV-0003). An Error raised from a Sub-Process nested inside the handler agrees with CIB ([error-event-subprocess-nested-rethrow](../scenarios/open-rows/error-event-subprocess-nested-rethrow/README.md)).

### CIB-INT-0023 — a data-derived Timer value is evaluated once when the Timer is armed

**Status:** Recorded bounded interpretation from the pinned source; selected by every profile that admits a Timer expression

BPMN Table 10.101 makes `timeDate`, `timeDuration` and `timeCycle` Expressions whose result conforms to ISO 8601, but says neither when the Expression is evaluated nor whether a later data change moves the Timer. CIB Seven `2.2.0` evaluates the value once when it creates the timer job, in the arming execution after its input mappings, and stores the due date and the cycle text on the job. The kernel evaluates the value once at arming (a catch on arrival in its scope, a boundary in its host's own scope after the host's input mappings, an Event Sub-Process start in its scope after entry, at the root after the start variables) and captures the deadline and recurrence in the open item. A value CIB itself rejects (a failing evaluation, `null`, a non-String) rolls back the input that reached the arming; a String CIB parses that the kernel does not admit is `unsupported` (`timer-duration`, `timer-date`, `timer-cycle`, `timer-cron`); a cycle's dialect is read from its value (`R…` ISO 8601, otherwise Cron).

**Evidence:** Pinned `TimerDeclarationImpl.java:96-153`, `PvmExecutionImpl.java:278-292`, `:1304-1318`, `ExecutionEntity.java:418-424`, `CycleBusinessCalendar.java:55`; retained `timer-data-derived/*` (captured deadline after a later write, rollback on absent, null, Integer and malformed values); `Kernel.Feature.Subscriptions.timerDetail`.

**Boundary:** Timer catches, boundaries and Event Sub-Process starts at the Events JUEL level under `Evaluator.juel`; root Timer starts stay PC-TIMER-04's (`start.timerExpression`). Date-valued results (`dateTime()`) stay refused until the Events level delivers dates.

### CIB-INT-0024 — a Message name given by an expression is resolved when its subscription opens

**Status:** Recorded bounded interpretation from the pinned source; selected by `MessageNames.addresses`

BPMN 2.0.2 has no Message name expressions (Table 8.48). CIB Seven `2.2.0` reads a `${…}` name as a JUEL expression and resolves it when the subscription's scope execution is initialized: before the host's input mappings for a boundary, and before the start or call variables for a root or called-root Event Sub-Process start. A failing evaluation or a non-String result rolls back the command; a `null` or empty result opens a subscription no name-addressed delivery reaches. The kernel resolves the name at the same point, rolls back on a failure or a non-String, answers `unsupported` (`message-name-empty`) for `null` or `""`, and keeps addressing the subscription by its channel.

**Evidence:** Pinned `BpmnParse.java:454-465`, `EventSubscriptionDeclaration.java:153-184`, `ExecutionEntity.java:409-413`, `PvmAtomicOperationCreateScope.java:46`, `PvmExecutionImpl.java:278-286`, `:1304-1314`; retained `message-name-addressing/expression-name-*`.

**Boundary:** Running catches, Event-Based Gateway arms, boundaries and Event Sub-Process starts. A root Message start with an expression name is refused (`start.messageNameExpression`), as CIB refuses it at deployment; the Receive Task site stays refused (`work.receive.messageExpression`).

### CIB-INT-0025 — a Conditional predicate that reads an absent variable or property is false

**Status:** Recorded bounded interpretation from the pinned source; selected by every profile

BPMN states no outcome for a condition that cannot be evaluated. CIB Seven `2.2.0` swallows a `PropertyNotFoundException` while it evaluates a Conditional Event and reads the predicate as false at that point, and rolls back on a `null` or non-Boolean result or any other failure. The kernel reads `unknown-variable` and `juel.propertyNotFound` as false where they are reached (`${a == 1 || b == 2}` with `a` absent is false; `${b == 2 || a == 1}` with `b == 2` is true) and rolls back otherwise (`condition-not-boolean`).

**Evidence:** Pinned `UelExpressionCondition.java:51`, `:57-67`, `JuelExpression.java:62-63`; retained `conditional-evaluation/unrelated-write-with-absent-variables`, `non-boolean-result`, `conditional-catch/absent-then-false-then-true`.

**Boundary:** Conditional Event predicates; Sequence Flow conditions keep their own rule.

### CIB-INT-0026 — a cycle on a site that fires once waits for its first occurrence only

**Status:** Recorded bounded interpretation from the pinned source; selected by every profile

BPMN Table 10.101 lets `timeCycle` stand on any Timer Event but states nothing about a recurrence at a site already triggered: a normal-flow catch consumes its token, an interrupting boundary cancels its host and an interrupting Event Sub-Process cancels its parent's work. CIB Seven `2.2.0` creates no repeat for a cycle on an Intermediate catch or an interrupting Timer and fires it once at the cycle's first occurrence. The kernel arms such a cycle as one wait at its first occurrence, published without recurrence.

**Evidence:** Pinned `TimerDeclarationImpl.java:96-106`, `BpmnParse.java:3417-3421`, `:3488-3492`, `:3567-3571`; retained `timer-recurrence/cycle-on-catch`, `cron-on-catch`, `cycle-on-interrupting-boundary`, `timer-catch-cycles/*`.

**Boundary:** Normal-flow catches, Event-Based Gateway arms, interrupting boundaries and interrupting Event Sub-Process starts, ISO and Cron cycles alike. A root Timer start's cycle is population semantics instead, each due instant its own occurrence ([CIB-INT-0029](#cib-int-0029--a-timer-start-counts-from-its-deployment-and-fires-each-occurrence-once-while-the-deployment-is-current), PC-TIMER-04).

### CIB-INT-0027 — an unbound Message throw passes its token on

**Status:** Recorded bounded interpretation from the pinned source for `MessageThrowForms.cibForms`; selected by the cibseven profiles

BPMN 2.0.2 Tables 10.88 and 10.89 have a Message End or Intermediate throw send its Message to a Participant, which a Message Flow may identify (Table 10.1), and §13.5.6 sends it at the End; `tMessageEventDefinition` carries only `messageRef` and `operationRef` (`Semantic.xsd:999-1008`), so the standard names no sending technology for a throw Event, and a Message Flow names a Participant, not a transport. CIB Seven `2.2.0` gives a Message throw that declares no `camunda:class`, `delegateExpression`, `expression` or `type` the `IntermediateThrowNoneEventActivityBehavior`, which leaves at once, and reads neither `messageRef`, `operationRef` nor a Message Flow (`BpmnParse.java:1654-1659`, `3185-3189`). Under `cibForms` the kernel does the same: the throw passes its token on as a None throw does, an End consumes it, and no send, effect or Message is created. The standards profile refuses the form (`throw.message.unbound`), since passing on would drop the send BPMN requires.

**Evidence:** The cited source; the retained [unbound-throws-pass-through](../scenarios/open-rows/message-throw-unbound/README.md) answer, in which a throw naming only a Message, a throw that is the source of a Message Flow and a Message End naming only a Message all pass and the instance completes; `packages/kernel/test/message-throw.test.ts`.

**Boundary:** Message Intermediate throws and Message End Events without a handler attribute. Their Data Input Associations, `camunda:inputOutput`, asynchronous continuations and execution listeners are refused (`throw.message.payload`, `throw.message.ioMapping`, `throw.message.asynchronous`, `throw.message.listener`). A Message Flow or a `messageRef` never creates a send.

### CIB-INT-0028 — a Signal is addressed by its name

**Status:** Recorded bounded interpretation from the pinned source for `SignalNames.addresses`; selected by the cibseven profiles

BPMN 2.0.2 Table 10.100 lets an event reference its Signal by `signalRef`, a QName, and gives the Signal a `name` of type `xsd:string` (`Semantic.xsd:1391-1397`) that addresses nothing; the standards profile (`SignalNames.identifier`) addresses a Signal by its Definitions' `targetNamespace` and id, and a throw reaches exactly the subscriptions of that Signal. CIB Seven `2.2.0` keys every Signal subscription and every throw by the referenced Signal's `name`: a Signal without a name fails deployment, and so do two Signals of one document with one name. Under `addresses` the kernel addresses each subscription, throw and broadcast intent by the name (`SignalAddress.named`), refuses an event whose Signal has no non-blank name (`signal.unnamed`), and publishes a Signal wait with that name.

**Evidence:** Pinned `BpmnParse.java:474-498`, `:3536-3545`, `EventSubscriptionDeclaration.java:137-184`; retained `signal-throw-literal/*`, `signal-throw-expression/*`, `signal-throw-payload/*`, `signal-start-compositions/race-*` and `handover-*`, and `signal-subscriptions/*` for boundaries and Event Sub-Process starts, which agree under the cibseven profiles; the kernel-only population witness `signal-broadcast-population/broadcast-boundary-and-esp-standards` broadcasts to both under the standards profile.

**Boundary:** Intermediate Signal catches, Event-Based Gateway arms and Signal throws (PC-SIGNAL-01, PC-SIGNAL-02), Signal boundaries and Event Sub-Process starts (PC-SIGNAL-03); root Signal starts as PC-SIGNAL-02 admits them. Two Signals of one document with one name, and two subscriptions of one name in one CIB event scope, which CIB refuses at deployment, are CIB-LIM-0026.

### CIB-INT-0029 — a Timer start counts from its deployment and fires each occurrence once while the deployment is current

**Status:** Recorded bounded interpretation from the pinned source; selected by every profile

BPMN 2.0.2 lets a Timer start a Process at a date, after a duration or by a cycle (Table 10.84, Table 10.101) but names no reference instant for a duration or an undated cycle on a top-level Start Event, and has no deployments. CIB Seven `2.2.0` computes a Timer-start job's due date from the deployment instant, anchors an undated cycle there, deletes every Timer-start job of a key it redeploys and runs the job at the clock of its firing. The kernel makes the origin and the due instants population semantics: a duration and an undated cycle count from the deployment's logical deploy time, a date is absolute, also before the deployment, and a Cron expression matches strictly after the origin. A `timerStart` names an occurrence by its due instant and commits only when that instant is one of the schedule's (`timer-occurrence-unknown`), the firing time is not before it (`timer-not-due`), the deployment is still current for its key (`timer-start-superseded`) and the occurrence is unconsumed (`timer-start-occurrence-consumed`). The started instance takes the firing time and the identity `timer:<len>:<deploymentId>:<len>:<startEvent>:<dueMs>`, so one occurrence never starts two instances. A single-instance scenario is the degenerate population, deployed at 0 and fired on time, so a Timer start there commits only at one of its due instants. CIB agrees on the origin and on every due instant of an on-time firing; after a late cycle firing it skips the missed grid points (CIB-DEV-0008).

**Evidence:** Pinned `bpmn/deployer/BpmnDeployer.java:144-146`, `:232-258`, `jobexecutor/TimerDeclarationImpl.java:109-153`, `:170-190`, `jobexecutor/TimerStartEventJobHandler.java:38-63`, `persistence/entity/TimerEntity.java:178-183`; retained `timer-start-event` and `timer-start-forms/duration-start-before-deadline`, where CIB rejects a start at 0 of a Timer due later, as the kernel does; kernel witnesses in `packages/kernel/test/population-timers.test.ts`.

**Boundary:** Root Timer starts whose schedule `Timer.resolve` offers a host. Schedule identity, catch-up of missed occurrences and overlap stay host and product policy (`TSTART-SCHEDULE-01`).

### CIB-INT-0030 — a Signal reaches a snapshot of its receivers, waiting catches by instance before starts

**Status:** Recorded bounded interpretation from the pinned source; selected by every profile

BPMN 2.0.2 broadcasts a Signal "to any Process that can receive" it (Table 10.88) and lets any catching Event in any scope receive a published trigger (§10.5.1), but names neither which receivers one broadcast reaches when receivers appear during it nor their order. CIB Seven `2.2.0` lists the subscriptions of the name once per API broadcast or throw before delivering to any, and an API broadcast notifies the waiting catches before it starts instances; within each group, and for a throw altogether, the list comes from a `HashSet`. The kernel reaches the snapshot taken when each delivery begins (an API `broadcast`, or each intent of a cascade), so a receiver armed during it is not reached, in the command's explicit `order` when it gives one, else in a fixed linearization: open Signal items of running instances, instances by instance identifier and items in arming order, then root Signal starts, deployments in deploy order and starts in document order. Within one State the linearization decides which of two same-Signal catches or Event-Based arms fires when the first one's continuation withdraws the second; the other is `skipped`. CIB-compared witnesses avoid order within one State.

**Evidence:** Pinned `cmd/SignalEventReceivedCmd.java:75`, `:84-85`, `persistence/entity/EventSubscriptionManager.java:94-105`, `bpmn/behavior/ThrowSignalEventActivityBehavior.java:53-56`; kernel witnesses in `packages/kernel/test/population-signals.test.ts`; the retained answers of `signal-broadcast-population/broadcast-two-definitions-starts-and-catches`, where one broadcast reaches two waiting catches and a root Signal start, and `signal-broadcast-population/broadcast-expired-receiver-unchanged`, where a second broadcast names an arm the first one's delivery withdrew (profile `cibseven-2.2.0`), agree with the kernel at the [population observation boundary](CIB-OBSERVATION-POLICY.md#population-evidence). That boundary sorts a fan-out's entries and drops `delivered` and `skipped`, so they witness which receivers a snapshot reaches, not their order.

**Boundary:** Signal broadcasts and thrown Signals' intents across the instances of one tenant-less population (PC-SIGNAL-04); receivers in the thrower's own State fire inside the throwing step (CIB-OP-0019).

### CIB-INT-0031 — a triggered start reaches the current deployment of its key unless the command names one deployment

**Status:** Recorded bounded interpretation from the pinned source; selected by every profile

BPMN 2.0.2 has no deployments or versions: each occurrence of a Start Event creates a new Process instance (§13.2, §10.5.6), without saying which of several deployed copies of one Process it instantiates. CIB Seven `2.2.0` numbers a key's versions by deployment and, when a key is redeployed, deletes the previous version's Message, Signal and Conditional start subscriptions and its Timer-start jobs, so a triggered start reaches the latest version unless the request names one process definition (`correlateStartMessage` and `evaluateStartConditions` with a `processDefinitionId`). The kernel's population makes the same choice: a start a command triggers reaches, per key, the last deployment of that key earlier in step order; a `{processKey}` selector names that current deployment and a `{deploymentId}` selector one exact deployment, superseded or not. The started instance takes the command's logical time and the identity `start:<len>:<commandId>:<len>:<deploymentId>:<len>:<startEvent>`, so a command starts at most one instance per deployment and start Event.

**Evidence:** Pinned `bpmn/deployer/BpmnDeployer.java:144-146`, `:232-238`, `:251-292`, `runtime/DefaultCorrelationHandler.java:154-165`, `:206-218`, `runtime/DefaultConditionHandler.java:46-50`, `:86-105`, `jobexecutor/TimerStartEventJobHandler.java:43-44`, `:54-58`; kernel witnesses in `packages/kernel/test/population-messages.test.ts`; the retained answers (profile `cibseven-2.2.0`), each agreeing with the kernel, of `message-start-population/{start-by-key-current-version,start-by-exact-old-version,same-definition-deployed-twice}` for a publication by key, by an old deployment and by each of two deployments of one definition, `conditional-start-population/exact-old-version` for an evaluation against the current deployments and against a superseded one, `signal-broadcast-population/broadcast-superseded-version-not-started` for a broadcast after a redeployment, and `timer-start-population/{redeploy-supersedes-timer-start,superseded-occurrence-fired-late}` for a Timer start whose key is redeployed before or after its due instant.

**Boundary:** Root Message starts a publication reaches (PC-MESSAGE-02) and root Timer starts (PC-TIMER-04, CIB-INT-0029), root Signal starts a broadcast or intent reaches (PC-SIGNAL-04) and root Conditional starts an `evaluateConditions` reaches (PC-CONDITION-02). Instances of a superseded deployment keep running, and a publication still reaches their waiting subscriptions.

### CIB-INT-0032 — a publication's definition selector restricts its waiting receivers too

**Status:** Recorded source disagreement from the pinned source; selected by every profile

BPMN 2.0.2 routes a Message to a waiting subscription or to a start of the Process it addresses (§13.2, §8.4.2) and has no deployment selector. CIB Seven `2.2.0` accepts a process definition only on a start-only correlation: every correlation that may reach executions throws when a `processDefinitionId` is set, so CIB never restricts its execution search to one definition. The kernel gives the selector one meaning in every mode: it resolves to one deployment (`{processKey}` the current one, `{deploymentId}` that one) and restricts both the waiting receivers and the start candidates to it; without a selector both range over the whole population. CIB has no answer for a selector outside start-only mode, so the CIB runner never issues one and CIB-compared witnesses avoid the combination.

**Evidence:** Pinned `MessageCorrelationBuilderImpl.java:249-257`, `:320-324`; kernel witness `packages/kernel/test/population-messages.test.ts` (a start-only publication by key and by deployment).

**Boundary:** Message publications in `any` and `executionsOnly` mode carrying a definition selector; a start-only publication with a selector is CIB-INT-0031.

### CIB-INT-0033 — CIB commits every receiver of one stimulus in one transaction

**Status:** Recorded interpretation from the pinned source; selected by no profile, since the kernel commits each receiver on its own under every profile (root decision 2026-11-11, per-receiver commitment); not a deviation

BPMN 2.0.2 states no transaction across process instances: each instance a Signal or a Conditional start reaches is independent (Table 10.88: a Signal is broadcast "to any Process that can receive"). The kernel commits each receiver of one stimulus as its own unit under every profile: each instance start of a Conditional start evaluation and each catch delivery and start of a broadcast or a thrown Signal. A failing receiver is its own `failed {target, outcome, code}` entry and changes only itself; the stimulus's other receivers and the emitter's command keep their results. CIB Seven `2.2.0` runs them in one command transaction, so one failing receiver rolls back every other receiver and the emitter. A Timer-start occurrence is one such unit too: the kernel records its start's failure as the `failed` entry of a committed fan-out, where CIB rolls the timer job's transaction back and leaves the job to its retries (`TimerStartEventJobHandler`).

**Evidence:** Pinned `cmd/EvaluateStartConditionCmd.java:56-83`, `cmd/SignalEventReceivedCmd.java:73-86`, `bpmn/behavior/ThrowSignalEventActivityBehavior.java:53-61`; the kernel tests `packages/kernel/test/population-conditions.test.ts` and `population-signals.test.ts`; the retained answers of `conditional-start-population/one-start-fails-others-start`, where one start's condition holds and the other's reads a null, and `signal-broadcast-population/broadcast-start-fails-catch-still-delivered`, where a broadcast reaches a waiting catch and a Signal start that fails (profile `cibseven-2.2.0`): CIB rolls the whole command back, where the kernel keeps the other receiver. The single-receiver twins `conditional-start-population/start-continuation-fails`, `signal-broadcast-population/broadcast-catch-continuation-fails` and `timer-start-population/timer-start-continuation-fails` fail their one receiver's continuation: CIB rolls the evaluation, the broadcast and the timer job back, where the kernel commits a fan-out holding the receiver's `failed` entry. This entry owns all five in the disagreement ledger.

**Boundary:** Stimuli in one tenant-less population where a receiver fails, beside another receiver or the emitter or alone, and Timer-start occurrences whose start fails; the ledger owner of every such witness.

### CIB-INT-0034 — CIB binds a Call's callee at each invocation

**Status:** Recorded interpretation from the pinned source; selected by no profile, since every profile binds at program assembly (`callBindingTime = programAssembly`) as PC-SCOPE-03 requires

BPMN 2.0.2 §10.3.6 gives a Call Activity's `calledElement` a CallableElement and names no deployment, version or binding time. CIB Seven `2.2.0` looks the callee up when the Call is reached: `latest` finds the latest version deployed by then, `deployment` the caller's own deployment's process, and `version` or `versionTag` the one definition carrying it, and a selector that names no definition or several fails the invoking command. The kernel binds when the caller is deployed: a Call on a process of deployment `d` resolves only among the carried processes of deployments up to `d`, so a process binds the same callees in every program that carries it, and a selector naming no carried process (`work.call.calledProcessMissing`) or several (`work.call.ambiguous`) refuses the deployment. A callee version or tag deployed after its caller is reached by CIB and not by the kernel; a missing or ambiguous target is refused by the kernel before any instance starts, where CIB fails only the invocation that reaches it. The binding is recorded per called instance, so recovery never re-resolves. Binding at deployment is what PC-SCOPE-03 requires: "exact retained binding across recovery … recovery never silently resolves a newer definition"; a lookup at each invocation would resolve a callee version deployed after the caller.

**Evidence:** Pinned `CallableElementUtil.java:75-103`, `ProcessDefinitionManager.java:141-162`; the retained population answers (profile `cibseven-2.2.0`) of `call-binding-versions/callee-redeployed-after-caller` (the kernel binds version 1, CIB `latest` at invocation version 2), `call-binding-versions/tag-deployed-after-caller` (the kernel refuses the caller's tag as missing, CIB reaches the tag deployed after it) and `call-binding-versions/shared-tag-ambiguous` (the kernel refuses `work.call.ambiguous`, CIB rolls the start back), and the missing-version and missing-tag answers of `call-binding-time/*`, which CIB rolls back at invocation. The kernel population witness `call-binding-population/nested-callee-binds-at-own-deployment` separates the binding time in the kernel only: under `bpmn-2.0.2` CIB reads its prefixed `calledElement` as key text and rolls the start back (CIB-EXT-0045), and its `cibseven-2.2.0` variant `call-binding-population/nested-callee-binds-at-own-deployment-key-text`, whose Calls name key text, retains CIB binding the triage's Call to review version 2 (deployment 3) at invocation where the kernel binds version 1 (deployment 1).

**Boundary:** Every Call selector of both `calledElementResolution` readings; expression selectors stay CIB-LIM-0032, tenants CIB-LIM-0033 and recursion CIB-LIM-0034. `callBindingTime = invocation` stays refused (`profile.callBindingTime.invocation`).

### CIB-INT-0035 — CIB runs a thrower's earlier-queued sibling branches after its Signal's receivers

**Status:** Recorded interpretation from the pinned source; selected by no profile, since the kernel finishes the thrower's step first under every profile; not a deviation

BPMN 2.0.2 sends a thrown Signal when the throw Event is reached (§13.5.6) and states no order between the thrower's continuation and the receivers in other Processes. The kernel publishes a throw's intent with its committed step: other instances receive it after every branch of the thrower's step has reached its next wait. CIB Seven `2.2.0` hands each receiver the Signal inside the throw and defers its continuation: an operation that can run asynchronously and is queued while another runs waits on CIB's operation stack, which runs the newest first. The thrower's `leave` queues its own continuation after the receivers', so that continuation runs to its next wait before any receiver continues, as in the kernel; a sibling branch that a fork queued before the throw runs only after the receivers. When a receiver rethrows a Signal for a catch on the throw's own continuation, both engines deliver it to the thrower; when the catch is on a sibling branch the fork queued before the throw, CIB's rethrow finds no subscription and the kernel delivers it. Separating witness: A forks, its first branch throws S1 and its second reaches a catch of S2; B's catch of S1 rethrows S2.

**Evidence:** Pinned `bpmn/behavior/ThrowSignalEventActivityBehavior.java:53-61` (each receiver's `eventReceived`, then `leave`), `interceptor/CommandInvocationContext.java:93-135` (an invocation is queued first at `:95` and deferred at `:102` while the loop at `:126` runs), the only async-capable operations `pvm/runtime/operation/PvmAtomicOperationTransitionNotifyListenerTake.java:35`, `PvmAtomicOperationTransitionCreateScope.java:42`, `PvmAtomicOperationActivityStartCreateScope.java:33` and `PvmAtomicOperationProcessStart.java:37`, and `PvmAtomicOperationTransitionDestroyScope.java:128-132` (a fork queues all its branches at once); the retained answer of `signal-broadcast-population/emitter-first-cascade` (profile `cibseven-2.2.0`), where CIB, like the kernel, leaves the emitter at *Wrap up the batch*; and the retained answer of the separating witness `signal-broadcast-population/sibling-branch-cascade` (`sibling-branch-cascade.population-cibseven-evidence.json`), where the kernel leaves the emitter at *Wrap up the batch* and CIB leaves `Emitter_1` at its catch of `signal-two` (`CatchSignalTwo`), as the source predicts.

**Boundary:** Thrown Signals reaching other instances in one tenant-less population (PC-SIGNAL-04) whose receiver rethrows to a catch of the thrower: a catch on the throw's own continuation agrees, and this entry owns every witness whose catch is on a sibling branch queued before the throw.

### CIB-INT-0036 — CIB compensates every completed Sub-Process without a handler as the group of its inner records

**Status:** Recorded interpretation from the pinned source and retained evidence; selected by `ProfileOptions.implicitCompensation = everySubProcess` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile; not a deviation

BPMN 2.0.2 is inconsistent here. §10.5.1 says "The compensation handler is either user defined or implicit. The implicit compensation handler of a Sub Process calls all compensation handlers of its enclosed Activities", which makes every Sub-Process compensable, while Tables 10.88 and 10.89 say "To be compensated, an Activity MUST have a boundary Compensation Event, or contain a Compensation Event Sub-Process"; §13.5.5's `compensable` attribute is in neither the CMOF nor the XSD (OMG BPMN21-403). CIB Seven `2.2.0` keeps the inner records of every completed Sub-Process and Transaction that holds a compensation subscription or a Compensation Event Sub-Process under an event-scope execution, subscribes the Sub-Process itself to its parent without a handler, and compensates those records as one group when the Sub-Process is compensated, by an untargeted throw of its parent or a throw naming it. The kernel retains such a Sub-Process as one group record whose children are its inner records (I5); under `bpmn-2.0.2` admission keeps refusing the form as `compensation.implicit`.

**Evidence:** Pinned `bpmn/behavior/SubProcessActivityBehavior.java:61-66`, `bpmn/helper/CompensationUtil.java:100-152` (the condition at `:108`), `bpmn/parser/BpmnParse.java:3902-3911` (a Transaction's Sub-Process behavior) and `event/CompensationEventHandler.java:61-64` (descending into the event scope); the retained answers of [compensation-regions](../scenarios/open-rows/compensation-regions/README.md), [transaction-paths](../scenarios/open-rows/transaction-paths/README.md), [compensation-multi-instance-bodies regions](../scenarios/open-rows/compensation-multi-instance-bodies/README.md), [default-handler-reads-and-writes-outer](../scenarios/open-rows/compensation-context-live-outer/README.md), [error-esp-completes-then-outer-throw](../scenarios/open-rows/compensation-event-subprocess-throws/README.md) and [error-end-in-subprocess](../scenarios/open-rows/transaction-and-error-exits/README.md) (profile `cibseven-2.2.0`).

**Boundary:** Completed Sub-Processes and Transactions without a compensation handler that retain records.

### CIB-INT-0037 — CIB compensates nothing inside a Sub-Process an Error leaves

**Status:** Recorded interpretation from the pinned source and retained evidence; the kernel's meaning under every profile (`ProfileOptions.errorExitCompensation = drops`, which every profile keeps; `compensatesContained` is refused as `profile.errorExitCompensation.compensatesContained` for a program with a Sub-Process that retains compensable work and that an Error can leave); not a deviation

BPMN 2.0.2 is inconsistent here. §10.7.3 and §13.5.5 make compensation of all contained Activities the default "if no error Event Sub-Process is specified for a particular Sub-Process and a particular error", while §10.3.5 (Transaction outcome 2) states that an Error interrupting a Transaction or a non-Transaction Activity causes no compensation, and presumed abort makes "compensation of a failed Activity" a null operation. CIB Seven `2.2.0` keeps the inner records of a Sub-Process only when it completes, so an Error leaving it deletes them with the interrupted Sub-Process and nothing is compensated. The kernel drops the records retained in a scope occurrence it leaves without completing it ([compensation semantics](kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md#i6--an-error-leaving-a-sub-process-with-completed-compensable-work-pc-compensation-03-pc-tx-01)).

**Evidence:** Pinned `bpmn/behavior/SubProcessActivityBehavior.java:61-66` (the event scope is created on completion only); the retained answers of [error-end-in-subprocess and error-end-in-transaction](../scenarios/open-rows/transaction-and-error-exits/README.md) and [error-end](../scenarios/open-rows/transaction-paths/README.md) (profile `cibseven-2.2.0`), which never open the inner handler and agree with the kernel.

**Boundary:** Sub-Processes and Transactions left by an Error, whether or not a catcher takes it.

### CIB-INT-0038 — CIB propagates a compensation handler's Error or Escalation from the compensation trigger

**Status:** Recorded interpretation from the pinned source and retained evidence; selected by `ProfileOptions.compensationHandlerFailure = propagatesFromTrigger` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile; not a deviation

BPMN 2.0.2 §13.3.2 names a compensation handler's states but states no disposition for a handler that fails, and §10.5.1 lets an Escalation continue at its thrower. The standards profile fails the instance on an Error a handler leaves uncaught (`failsInstance`, COMPH-FAIL-01). CIB Seven `2.2.0` runs every handler in a compensating execution it creates under the throwing one, so an Error or Escalation the handler raises propagates from there to the catchers that enclose the compensation throw, and an uncaught Error ends only the throwing path (CIB-INT-0013). Under `propagatesFromTrigger` the kernel's search passes the handler's context and goes on from its parent, the scope occurrence the trigger ran in; an event no catcher takes follows the profile's unhandled rule, and a handler that ends without completing ends its part of the run ([compensation semantics](kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md#i11--an-error-escalation-or-terminate-leaving-a-handler-pc-compensation-01-pc-compensation-04)).

**Evidence:** Pinned `bpmn/helper/CompensationUtil.java:62-75` (the compensating execution under the throwing one) and `BpmnExceptionHandler.java:129-137` (CIB-INT-0013's path end); the retained answers of [compensation-handler-failure-at-wait](../scenarios/open-rows/compensation-handler-failure-at-wait/README.md) (profile `cibseven-2.2.0`): the Error boundary on `SubProcess_Outer` catches the caught forms and `UserTask_Caught` runs, and the uncaught forms continue to `UserTask_After`; no rolled-back command supports it.

**Boundary:** Errors and Escalations leaving a compensation handler after it waited; a synchronous handler's raise is CIB-LIM-0042's, and one whose interrupting catch fails inside CIB is CIB-LIM-0046's.

### CIB-INT-0039 — CIB runs every Transaction method as `##Compensate`

**Status:** Recorded interpretation from the pinned source and retained evidence; selected by `ProfileOptions.transactionMethods = compatibilityAsCompensate` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile; not a deviation

BPMN 2.0.2 Table 10.21 lets a Transaction's `method` name the transaction protocol, a technology URI, and keeps `##Compensate`, `##Store` and `##Image` "for compatibility with BPMN 1.1" without stating what `##Store` and `##Image` mean in 2.0.2. CIB Seven `2.2.0` never reads the attribute: every Transaction gets the Sub-Process behavior and compensates on cancellation. The kernel runs `##Store` and `##Image` as `##Compensate` under `compatibilityAsCompensate`; a protocol URI names a protocol-controlled Transaction, which PC-TX-01 excludes, so admission refuses it as `scope.transaction.method` under every profile, and the standards profile refuses `##Store` and `##Image` as well ([compensation semantics](kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md#i14--transaction-method-pc-tx-01)).

**Evidence:** Pinned `bpmn/parser/BpmnParse.java:3902-3915` (`parseTransaction` reads no `method`); the retained answers of [image-method and store-method](../scenarios/open-rows/transaction-methods/README.md) (profile `cibseven-2.2.0`), which commit like `compensate-method`; the kernel's `Admission.Scopes.transaction`.

**Boundary:** Transactions whose `method` is `##Store` or `##Image`; a protocol URI stays refused under every profile.

### CIB-INT-0040 — CIB opens the compensation handlers of a parallel Multi-Instance Sub-Process's instances together

**Status:** Recorded interpretation from the pinned source and retained evidence; selected by no profile, since the kernel runs the instances' records in reverse completion order under every profile ([compensation semantics](kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md#i9--multi-instance-call-and-effect-subjects-pc-compensation-03), I1 (d)); not a deviation

BPMN 2.0.2 §13.5.5 compensates "_Instances_ of a loop or sequential multi-instance … in reverse order of their forward completion" and says "_Instances_ of a parallel multi-instance can be compensated in parallel", which permits concurrency but does not require it. CIB Seven `2.2.0` creates a concurrent execution for every retained subscription of the trigger and signals them all within the triggering command (CIB-DEV-0011's mechanism), so every instance's handler is open at once. The kernel keeps one order for both modes, since telling overlapping instances from ones that ran one after another needs a begin issue on `Compensable` ([#98](https://github.com/mbackschat/bpmn-lean-experiment/issues/98)).

**Evidence:** Pinned `bpmn/helper/CompensationUtil.java:55-88`; the retained answers of [regions-parallel-out-of-order](../scenarios/open-rows/compensation-multi-instance-bodies/README.md), [parallel-complete-then-compensate](../scenarios/open-rows/transaction-multi-instance/README.md) and, up to CIB-LIM-0045's failure, [parallel-out-of-order-consumed and parallel-out-of-order-rethrown](../scenarios/open-rows/compensation-event-subprocess-multi-instance/README.md) (profile `cibseven-2.2.0`), whose first difference is the state after the trigger: CIB opens three handlers and the kernel one.

**Boundary:** Parallel Multi-Instance Sub-Processes and Transactions whose instances' records one trigger compensates; this entry is the first owner of those four witnesses, whose handlers also read CIB-DEV-0014's restored body locals, and of the two whose later difference is CIB-LIM-0045's.

### CIB-INT-0041 — CIB restores a sequential Multi-Instance body's last item to its boundary compensation handler

**Status:** Recorded interpretation from the pinned source and retained evidence; selected by no profile, since the kernel's boundary handler restores no context and reads a loop variable live (D9 of [compensation semantics](kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md#i12--context-a-handler-reads-pc-compensation-01-pc-compensation-05)); not a deviation

BPMN 2.0.2 §10.7.1 and §13.5.5 let a handler connected by a boundary Event "only perform black-box compensation of the original Activity", and §13.5.5's snapshot sentences name only a Compensation Event Sub-Process, so BPMN restores no data to a boundary handler and does not settle what it reads of a loop variable. CIB Seven `2.2.0` runs the boundary handler of a Multi-Instance Activity in the body's event scope, which copies the body's local variables when the body leaves (CIB-DEV-0014's mechanism): in sequential mode the body's execution carries the item, so every handler reads the last item; in parallel mode the item lives on concurrent children that are not copied, so every handler reads the live value, as the kernel's does.

**Evidence:** Pinned `bpmn/behavior/SequentialMultiInstanceActivityBehavior.java:38-45` (every sequential instance performed on the body's execution), `bpmn/behavior/MultiInstanceActivityBehavior.java:76-88` (the loop variables on that execution), `:172-175` (the body's event scope on leaving) and `bpmn/helper/CompensationUtil.java:118-123` (the copy); the retained answer of [tasks-sequential-in-turn](../scenarios/open-rows/compensation-multi-instance-bodies/README.md) (profile `cibseven-2.2.0`), where CIB's handlers of a Multi-Instance Task read `seenStop = s3` and the kernel's single handler run `late` (trace [12] to [16]), against `tasks-parallel-out-of-order`, where both read `late`. The Multi-Instance Call witness [call-sequential-three-reviewers](../scenarios/open-rows/compensation-order-and-multiplicity/README.md), whose handlers read `r3` where `call-parallel-three-reviewers`'s read `late`, falls under the same source reading; the kernel refuses a Multi-Instance Call body (`activity.multiInstanceBody`, PC-MI-03).

**Boundary:** Boundary compensation handlers of sequential Multi-Instance Activities that read a loop variable; this entry is a later owner of `tasks-sequential-in-turn` and `call-sequential-three-reviewers`, whose first difference is CIB-DEV-0012's handler count.

### CIB-INT-0043 — a sequential Multi-Instance collection is read again before each later instance

**Status:** Recorded interpretation from the pinned source and retained evidence; selected by `ProfileOptions.multiInstanceCollection = sequentialReread` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile.

BPMN 2.0.2 §13.3.7 evaluates the number of instances once and generates a sequential instance only after the previous one completed; Table 10.29 gives each instance one item of the `loopDataInputRef` collection. It does not say whether a later instance takes its item from the collection as it was on entry or as it is when that instance is generated. The standards profile reads it once on entry (`entrySnapshot`, the [Multi-Instance semantics](kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md#entry-and-generation)). CIB Seven `2.2.0` keeps the total counted on entry and, as each sequential instance completes without ending the body, evaluates the collection again in the body's execution and binds the next item by its index in the current collection.

**Evidence:** Pinned `SequentialMultiInstanceActivityBehavior.java:47-61` (`complete` tests exhaustion and the completion condition first, then calls `evaluateCollection(scopeExecution)` and `performInstance` with the next index), `:67-70` (`prepareScope` fixes `nrOfInstances` on entry), `MultiInstanceActivityBehavior.java:76-97` (`performInstance`, `evaluateCollectionVariable` and `evaluateCollection`, which casts the value to a `Collection`) and `:129-138` (`getElementAtIndex` walks an iterator, so a collection shorter than the next index throws `NoSuchElementException`). The public-service probe of `CIB-AGR-0013` observes a fixed total while a changed collection supplies the next item, and a shortened collection rolling the completion back; the retained `multi-instance-service-task/sequential-collection-shrunk-then-restored` answer rolls the shortening completion back. The kernel's `MultiInstance.nextItems`.

**Boundary:** Sequential collection loops of both CIB profiles. The kernel reads the collection in the completing instance's scope occurrence before it is left, after the completion's writes, as CIB reads it in the body's execution that holds the item, `loopCounter` and the instance's result locals; a value that is no collection rolls the completion back (`multiInstance.notACollection`), as does a collection shorter than the next index (`multiInstance.collectionShortened`) and a failing JUEL read. A removed or null collection is `CIB-LIM-0054`'s. An earlier instance's result local that this one did not overwrite is `unsupported` (`multiInstance.sequentialResultLeftover`). With a loop-characteristics `asyncAfter` the re-read runs in the after-job, where a failure is `unsupported` (`async-boundary-failure`). Parallel loops and cardinality loops read nothing again; output aggregation with a re-read is refused (`profile.multiInstanceCollection.sequentialReread`).

### CIB-INT-0044 — CIB withdraws a Sub-Process's event-triggered boundaries when an interrupting Event Sub-Process starts

**Status:** Interpretation candidate from the pinned source; selected by no profile; its retained evidence confirms the source reading, and it awaits an interpretation and a cold review before any change to the Scopes rule ([#100](https://github.com/mbackschat/bpmn-lean-experiment/issues/100))

BPMN 2.0.2 §10.3.5 and §13.5.4 let an interrupting Event Sub-Process interrupt its parent's ordinary work and run its handler in the parent's context; they do not say whether the parent Activity's own boundary Events stay armed while the handler runs. A Cancel End settles this through the Activity lifecycle (§13.3.2, Figure 13.2), an interrupting Event Sub-Process does not. Under every profile the kernel clears the parent occurrence's work and its other Event Sub-Process starts and keeps the parent's own boundaries armed in the grandparent until the parent completes ([Scopes semantics](kernel/semantics/SCOPES-SEMANTICS-SPEC.md#event-sub-processes), `Scopes.arriveScope`), so a later Timer, Message, Signal or Conditional on such a boundary interrupts the parent and removes the running handler. CIB Seven `2.2.0` starts an interrupting Event Sub-Process by interrupting the scope execution that holds it, which removes that execution's jobs and its event subscriptions except compensation; a boundary's declarations live on the execution of the Activity it is attached to, which for a Sub-Process is that same scope execution, so CIB withdraws the Sub-Process's event-triggered boundaries and only the handler remains.

**Evidence:** Pinned `pvm/runtime/operation/PvmAtomicOperationActivityStartInterruptEventScope.java:32-41` and `PvmAtomicOperationInterruptScope.java:29-48` (the interrupt of the scope execution), `persistence/entity/ExecutionEntity.java:575-588` (`removeJobs` and `removeEventSubscriptionsExceptCompensation` unless `preserveScope`, which only process instance modification sets), `bpmn/parser/BpmnParse.java:3298-3301` (a boundary's event scope is its attached Activity) with its Timer, Signal, Message and Conditional declarations at `:3424`, `:3439`, `:3455` and `:3503`. The separating witnesses [boundaries-under-interruption](../scenarios/open-rows/message-esp-interrupting/README.md) `region-abort-then-deadline` and `region-abort-then-hold`, where the kernel still lists `Region`'s Timer and Message boundaries while `Abort_Handler` waits and lets either remove the handler; their retained answers (profile `cibseven-2.2.0`, Verify run 43370273960) list only `Abort_Handler` after `abortRegion`, reject the Timer firing and the `holdRegion` delivery, complete the handler and `Finish`, and reject `Late` and `Held`. This entry owns both witnesses in the ledger.

**Boundary:** Event-triggered boundaries (Timer, Message, Signal, Conditional) of the Activity whose scope an interrupting Event Sub-Process starts in, at a Sub-Process level; at the process level there is no such boundary. CIB keeps compensation subscriptions through the interrupt. A Cancel End's withdrawal of a Transaction's boundaries is Interpretation M9's I18. A variable write on the path to a Cancel End that a Conditional boundary on the Transaction might see, which CIB dispatches before the interrupt, is outside this entry.

## Known limitation register

### CIB-INT-0042 — CIB offers a task's submitted variables to its own Conditional boundaries before it leaves

**Status:** Recorded interpretation; selected by no profile; not a deviation

BPMN 2.0.2 assigns an Activity's outputs while it is Completing, a state Figure 13.2 (BPMN-2.0.2.md:12310) still lets an interruption leave, and orders neither against the Activity's own boundaries. CIB Seven `2.2.0` dispatches the variables a command submits on completing a task before the task leaves (`FlowNodeActivityBehavior.java:51-53`), so a submission that makes the task's own interrupting Conditional boundary true cancels the completing task and takes the boundary's flow; the task's output mappings run later and reach none of its own boundaries (`BoundaryConditionalEventTest#testSetVariableInOutputMapping`). The kernel offers a completion's writes, submitted and mapped alike, after the task has left, so none of its own boundaries sees them: the project's interpretation of the order, kept on purpose ([subscriptions semantics](kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#conditions)). A `ProfileOptions` value reproducing CIB's order would need an owner request for cibseven compatibility on this observation.

**Evidence:** Pinned `FlowNodeActivityBehavior.java:51-53`, `PvmExecutionImpl.java:2005-2023`, `BoundaryConditionalEventTest#testSetVariableInOutputMapping`; retained `conditional-boundary-hosts/completion-write-read-by-own-boundary` (CIB cancels the completing task through its own boundary, the kernel completes it).

**Boundary:** Submissions of User Tasks whose own Conditional boundaries read a submitted variable; this entry owns the ledger entry of `completion-write-read-by-own-boundary`.

### CIB-LIM-0001: standard sequential Multi-Instance output aggregation is absent

**Status:** Observed bounded limitation; not a confirmed normative deviation. Selected by `ProfileOptions.multiInstanceOutputs = none` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile (root decision 2026-11-11, M5 track review R3); the standards profile keeps `aggregates`

BPMN 2.0.2 Clause 13.3.7 and the `loopDataOutputRef`/`outputDataItem` rows of Table 10.29 describe per-instance output transfer into the outer output collection. Clauses 10.4.1–10.4.2 and the Data Association tables describe copying an Activity output back into its Process context after completion.

The exact schema-valid fixture declares the scalar `outputDataItem`, collection `loopDataOutputRef`, complete InputSet/OutputSet, and a DataOutputAssociation to one Process-scope collection Data Object. The public probe writes one scalar task-local `reviewResult` for each iteration and completes all three tasks. CIB completes the Process but creates no historic output collection under the declared output identity, data-output name, Data Object name, Data Object ID, or Data Object Reference ID. Its execution parser reads `loopDataInputRef` and `inputDataItem` but installs no corresponding `loopDataOutputRef` or `outputDataItem` behavior.

This remains a limitation rather than a confirmed deviation because the phase-zero probe is not retained answer-free producer evidence for a general conformance claim, and CIB exposes no standard User Task output-completion protocol distinct from its public variable API. The project standards profile independently requires exact indexed scalar-to-collection mediation and atomic final publication; it selects no CIB output-aggregation oracle.

**Evidence:** The [public-service phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSequentialMultiInstancePhaseZeroProbeTest.java), its [exact BPMN fixture](../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/CibSevenSequentialMultiInstancePhaseZeroProbeTest.bpmn), and the [project output rule](kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md).

**Boundary:** Every User Task Multi-Instance loop that declares an `outputDataItem`, sequential or parallel. CIB's parser reads `loopDataInputRef` and `inputDataItem` but not `loopDataOutputRef` or `outputDataItem` (`BpmnParse.java:1841-1858`), and installs the submitted name instead (CIB-EXT-0005). Under the CIB profiles the kernel writes no output collection either, as PC-MI-01's "no … standard output aggregate is invented" requires under the selected CIB result account; the standards profile keeps BPMN's aggregate (`multiInstanceOutputs = aggregates`). The phase-zero probe covers the sequential fixture; the parallel case rests on the same parser fact. It does not classify Camunda input/output extensions, delegates, expressions, Sub-Process data, or general CIB Data Association behavior.

### CIB-LIM-0002: modeled BPMN key and context correlation is not executed

**Status:** Observed bounded limitation; not a confirmed normative deviation

BPMN 2.0.2 Clause 8.4.2 defines key-based correlation through a `CorrelationKey` whose `CorrelationProperty` retrieval expressions obtain values from a Message payload. A Process `CorrelationSubscription` adds context-based bindings whose data paths obtain the current correlation-property values from the Process context.

The exact schema-valid fixture declares one Conversation-owned key, one payload retrieval expression, and one Process-owned subscription binding the same property to a Process property. Two Process instances wait on the same Intermediate Catch Message Event with different values for that Process property. A public CIB message-correlation call carrying the matching payload but no CIB API correlation criterion reports two matching executions and an empty API correlation-key set; it neither evaluates the modeled retrieval expression nor uses the modeled Process binding. Supplying `processInstanceVariableEquals` through the CIB public API then selects and completes the intended instance while leaving the other wait live.

At the pinned `2.2.0` source revision, the [BPMN Model API registers the correlation model types](https://github.com/cibseven/cibseven/blob/834a9874760de8a0107f7c1b32806e37f17fb017/model-api/bpmn-model/src/main/java/org/cibseven/bpm/model/bpmn/Bpmn.java#L487-L492), while the [runtime correlation handler](https://github.com/cibseven/cibseven/blob/834a9874760de8a0107f7c1b32806e37f17fb017/engine/src/main/java/org/cibseven/bpm/engine/impl/runtime/DefaultCorrelationHandler.java#L79-L123) builds execution queries only from the public API's Process-variable, local-variable, business-key, Process-instance-ID, tenant, and Message-name criteria. CIB's API variable criterion is therefore a separate engine extension and not execution of the modeled BPMN retrieval and context paths.

This remains a limitation rather than a confirmed deviation because the phase-zero probe is a calibration witness, not retained answer-free producer evidence for a general conformance claim. The project standards profile must define and evidence its own bounded correlation account rather than adopting the API extension as BPMN meaning.

**Evidence:** The [public-service phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenMessageCorrelationPhaseZeroProbeTest.java), its [exact BPMN fixture](../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/CibSevenMessageCorrelationPhaseZeroProbeTest.bpmn), and the pinned source paths above.

**Boundary:** The finding covers one non-instantiating Intermediate Catch Message Event, one non-empty string property, one key, one retrieval expression, one Process subscription binding, two waiting Process instances, one ambiguous no-criterion call, and one successful Process-variable API criterion under `CIB-CFG-0001`. The fixture separates correlation selection only: it does not select Intermediate Catch Message compatibility, the fixture's expression language, Message payload mediation, initialization by a first Message, dynamic context updates, multiple keys or properties, Conversation execution, start-Message correlation, broadcast, local-variable or business-key criteria, or a general CIB correlation profile.

### CIB-LIM-0003: Timer forms CIB accepts outside the profile's subset are refused

**Status:** Profile limitation; not a deviation

CIB accepts Timer text that the kernel refuses with `timer.duration`, `timer.date`, `timer.cycle` or `timer.cron` under every profile: interval forms in `timeDuration` (`S/PT5S`, `PT5S/E`, `S/E`, `R…`), seconds finer than a millisecond, seconds with digits on one side of the point only (`PT1.S`, `PT.5S`: the JDK's `BigDecimal` reads them, `DurationImpl.java:498-503` and `:664-675` of the Java 21 runtime the oracle lane runs; ISO 8601 is taken to require digits on both sides, H), a component above 2^31 − 1 (CIB's `int` getters truncate it silently, `DurationImpl.java:1162-1169`), zone-less, date-only, week, ordinal and basic-format dates, unpadded date fields (`1970-1-1T01:00:00Z`), `±hh` and `±hhmm` offsets, dates before 1970 (CIB commits a job due at once), a `P` lexeme in `timeDate` (a Joda period from now), dated cycles, `R0` and signed counts, nominal or zero cycle periods, and Cron outside the Quartz subset (the year field, `L`, `W`, `#`, names, both day fields concrete, a reversed range, a Cron with no next match (one that never matches, or whose next match lies past the bound)), and the Cron rules retained evidence certifies malformed only in the seconds field (a letter, a range without its end, more than one `/`, a step of 0, `?`) when they stand in any other field, since cron-utils' source is not pinned and the kernel claims malformed only where CIB's parser certainly fails. A value reaching such a form at run time (PC-TIMER-03) is `unsupported` with the dynamic twin.

**Evidence:** Pinned `DurationHelper.java:60-91`, `DateTimeUtil.java:48-63`, `DueDateBusinessCalendar.java:44-51`, `CronTimer.java:83-121`; the kernel's `Timer.classify` (`outside`); `timer-lexemes.test.ts`, `timer-recurrence.test.ts`, `admission-refusals-subscriptions.test.ts`; retained `timer-data-derived/cron-never-matches` (armed at the arming instant), `cron-descending-range` (armed at 30,000), `date-unpadded-fields` (armed at 3,600,000), `catch-point-without-digits` (`PT1.S` armed at 1,000) and `cron-arming-past-bound` (armed at the arming instant, its next match lying past the bound), each refused by the kernel as `unsupported`.

**Boundary:** Every Timer site under every profile.

### CIB-LIM-0004: a Call output targeting a Multi-Instance counter is refused

**Status:** Profile limitation; not a deviation

CIB deploys a Call Activity whose `camunda:out` targets `nrOfInstances`, `nrOfActiveInstances` or `nrOfCompletedInstances` and silently drops that output at return, while the profile refuses the model with `work.call.multiInstanceCounterOutput` ([work semantics](kernel/semantics/WORK-SEMANTICS-SPEC.md)). Dropping a declared output has no BPMN account, so the profile refuses the form instead of reproducing the drop.

**Evidence:** Pinned `CallableElementActivityBehavior#variablesFilter` at `834a9874` names the three counters; the retained [counter-output witness](../scenarios/open-rows/call-counter-output/README.md) commits in CIB Seven `2.2.0` (2026-11-09).

**Boundary:** Call outputs whose target is one of the three counter names, under every profile; `CIB-EXT-0021` admits no reserved output target.

### CIB-LIM-0005: a Boundary Event on an Event Sub-Process is refused

**Status:** Profile limitation; not a deviation

CIB attaches a Boundary Event to an Event Sub-Process like any Activity and runs it, while the profile refuses the model with `scope.eventSubProcess.boundary` ([scopes semantics](kernel/semantics/SCOPES-SEMANTICS-SPEC.md)): an Event Sub-Process is outside normal flow (§10.3.5), so the boundary's exception flow has no meaning BPMN defines (§13.5.4), and no row lifts the refusal.

**Evidence:** Pinned `BpmnParse#parseBoundaryEvents` at `834a9874` attaches by `attachedToRef` without excluding a triggered-by-event Sub-Process; the retained [Event Sub-Process boundary witness](../scenarios/open-rows/event-subprocess-boundary/README.md) deploys and commits in CIB Seven `2.2.0` (2026-11-09).

**Boundary:** any Boundary Event whose `attachedToRef` names an Event Sub-Process, under every profile.

### CIB-LIM-0006: ending an instance's last path through an uncaught Error rolls back when the thrower has output parameters

**Status:** Profile limitation; not a deviation

Under `CIB-INT-0013` an uncaught Error ends only its throwing path. When that path is the last one of the instance, the thrower ran directly in the instance's root and it has output parameters, each witness an output parameter reading `${result}`, CIB Seven `2.2.0` rolls the whole command back: the effect stays open and nothing the failure carried is written, as the 2.0.0 phase-zero probe already saw for a mapped thrower (`CIB-CFG-0004`). The same failure without output parameters completes the instance, and with another root path still open it commits and the mapped output is written. The rollback is CIB's cleanup order, not a BPMN outcome, so the CIB profiles do not imitate it: the kernel refuses that run with the dynamic-only code `unhandled-error-ends-instance-with-outputs` (`unsupported`), since whether the path is the last one depends on the run.

**Evidence:** The retained witnesses [root-last-path-with-outputs](../scenarios/open-rows/error-unhandled-outcomes/README.md), against its controls root-without-outputs and parallel-root-branch-with-outputs, and [route-rejected-unmatched-code and scope-non-ancestor-after-completion](../scenarios/open-rows/automation-business-error-routing/README.md), whose throwers are a scope and a non-scope Service Task (CIB Seven `2.2.0`, 2026-11-09); pinned `BpmnExceptionHandler.java:136` and `OutputParameter#execute`; the kernel's `Propagation.endsInstanceWithOutputs`.

**Boundary:** An uncaught Error of a Service Task whose output parameters read `${result}`, running directly in the process root with nothing else left there. The kernel refuses every thrower with output mappings in that position, so other output-parameter forms, which no witness covers, are refused conservatively. The same holds at the root of a called instance, where CIB also rolls back ([finance-unlisted-code](../scenarios/open-rows/error-called-child/README.md), CIB Seven `2.2.0`). A thrower inside a Sub-Process whose normal completion then ends the instance is not witnessed: the kernel completes that instance, and the CIB claim does not cover it.

### CIB-LIM-0007: pinned CIB parses one initial start per process and one start per Sub-Process

**Status:** Profile limitation; not a deviation

BPMN 2.0.2 §10.5.2 admits several Start Events in a process or a Sub-Process. CIB Seven `2.2.0` keeps one None or Timer Start per process as its initial (`BpmnParse#selectInitial`) and one start per Sub-Process (`BpmnParse#parseScopeStartEvent`); what it does with a second one is a parse-time choice, not BPMN meaning. The kernel refuses both forms (`start.rootCombination`, `start.subProcessCombination`) rather than imitate it.

**Evidence:** The retained witnesses [two-none-starts-start and subprocess-two-starts-start](../scenarios/open-rows/none-event-compositions/README.md) and [two-timer-starts-first](../scenarios/open-rows/timer-start-forms/README.md), where CIB rejects the deployment as the kernel refuses admission (CIB Seven `2.2.0`, 2026-11-09).

**Boundary:** A second None or Timer Start of a process, and a second start of any kind in a Sub-Process. Message Starts beside one initial start stay admitted.

### CIB-LIM-0008: pinned CIB erases referenced and multiple event definitions, Parallel Multiple, instantiation and non-executable processes

**Status:** Profile limitation; not a deviation

BPMN 2.0.2 gives a reusable EventDefinition (`eventDefinitionRef`, §10.5.1), a Multiple and a Parallel Multiple Event (§10.5.1), an instantiating Receive Task (§10.3.3, Table 10.10), an instantiating or Parallel Event-Based Gateway (§10.6.6) and a process not marked executable (Table 10.1 `isExecutable`) their own meaning. Pinned CIB Seven `2.2.0` at `834a9874` erases each:
- it has no reader for `eventDefinitionRef`: a catch carrying one fails to parse, and any other Event runs as a None Event;
- it keeps one of several definitions by a precedence that depends on the position: Start `BpmnParse:1021-1040`; Event Sub-Process Start, Error first, `:1114`; Boundary `:3317-3347`; End `:3140` ff.; intermediate catch `:1535-1555`;
- it never reads `parallelMultiple`, a Receive Task's `instantiate`, or an Event-Based Gateway's `instantiate` and `eventGatewayType`, so a gateway reached by a flow runs as a non-instantiating one;
- it deploys no process whose `isExecutable` is absent or false on a new deployment (`BpmnParse:560-574`).

The kernel refuses every one of these forms rather than imitate the erasure: the reader refuses `reader.eventDefinitionRef`; admission refuses `event.multipleDefinitions`, `event.parallelMultiple`, `work.receive.instantiate`, `gateway.eventBased.instantiate` and `process.notExecutable`, whose facts the IL carries (`Subscription.alternatives`, `Subscription.parallelMultiple`, `EventPayload.alternativeThrows`, `ReceiveWork.instantiate`, `GatewayKind.eventBased`, `Program.executable`, `CalledProcess.executable`).

This is not a candidate deviation. CIB and the kernel never differ on an admitted model; the [coverage target](PRACTICAL-CIB7-COVERAGE-TARGET.md) excludes these forms because they lack pinned CIB execution semantics, and the kernel claims no meaning for them.

**Evidence:**
- Retained witnesses in [event-reference-forms](../scenarios/open-rows/event-reference-forms/README.md): `multiple-event-definitions-message-then-timer` and `parallel-multiple-message-then-timer`, in which CIB arms the intermediate catch's Timer alone and rejects the Message.
- In [event-race-compositions](../scenarios/open-rows/event-race-compositions/README.md): `instantiating-with-start-message-wins` and `parallel-with-start-both-messages`, in which CIB runs a plain race; the ledger lists all four under this limitation.
- Witnesses awaiting CIB evidence in [interchange-reference-forms](../scenarios/open-rows/interchange-reference-forms/README.md): `event-definition-ref-catch-timer-then-proceed`, `event-definition-ref-start-none-start`, `event-definition-ref-start-message-start` (`eventDefinitionRef`), `instantiating-receive-task-message-start` and `instantiating-receive-task-none-start-then-deliver` (Receive `instantiate`).
- No witness for `isExecutable`: a non-executable source deploys nothing in CIB, so the pinned source lines above are the evidence.

**Boundary:** Those source forms only; a single inline definition, a non-instantiating Event-Based Gateway, an executable process and supported multiple separate starts or boundaries are unaffected.

### CIB-LIM-0009: the core JUEL level refuses at admission forms CIB deploys and evaluates

**Status:** Profile limitation; not a deviation

CIB Seven `2.2.0` evaluates more JUEL than the [core level](kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md) admits: functions, unlisted or mutating methods, floating literals and division, conditions in a named language or a Definitions-declared one, non-ASCII identifiers and whitespace, the engine-context names and Multi-Instance counters, `camunda:list` and `camunda:map` parameters, `camunda:resource` conditions and `local` Call copies, and, at the [Multi-Instance level](kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#codes-this-level-adds), a loop with both a cardinality and a collection, a loop expression in a declared language, an item named like a counter, and a loop body whose whitespace-only text node the parser drops. CIB deploys each such model and evaluates the form, to a value or to a failure that rolls the operation back; the kernel refuses each with a stable admission or reader code rather than evaluate a form whose result lies outside the portable value domain or whose context is engine state; a later JUEL level widens the admitted set without reinterpreting what Core accepts.

**Evidence:** The [admission table of the expression semantics](kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#admission-at-core) and the retained answers (CIB Seven `2.2.0`) of [juel-core-forms](../scenarios/open-rows/juel-core-forms/README.md) `functions` and `division`; the [core witness table](../scenarios/open-rows/juel-core-table/README.md) rows `collection-parameter`, `computed-method`, `counter-outside-multi-instance` and `decimal-against-double`; [juel-evaluation-failures](../scenarios/open-rows/juel-evaluation-failures/README.md) `division-by-zero` and the bundled refused probes (`execution-read`, `execution-mutation`, `authenticated-user-name`, `unknown-method`, `list-mutating-method`, `reflection-through-method`, one model whose first refused node is a division); [juel-form-separations](../scenarios/open-rows/juel-form-separations/README.md) `unknown-method`, `list-mutating-method` and `reflection-through-method`, and its single-probe engine-context models `execution-read`, `execution-mutation` and `authenticated-user-name` (retained in Verify run 43238005814); [condition-language-declarations](../scenarios/open-rows/condition-language-declarations/README.md) `named-juel`, `definitions-xpath-default` and `named-javascript` (CIB evaluates the JavaScript condition through GraalJS, CIB-CFG-0015, and commits); [multi-instance-expression-results](../scenarios/open-rows/multi-instance-expression-results/README.md) `count-cdata-wrapped` and `count-whitespace-only`; and [multi-instance-sub-process](../scenarios/open-rows/multi-instance-sub-process/README.md) `sequential-computed-two`, `-numeric-text`, `-noninteger`, `-negative` and `-malformed`, whose cardinality divides. CIB commits or rolls back where the kernel answers `unsupported` at deployment.

**Boundary:** The core and Multi-Instance levels' refusal codes only, wherever a mapping, a condition or a loop expression reaches them. It claims nothing about what a refused form would evaluate to.

### CIB-LIM-0010: the core JUEL level answers `unsupported` where CIB returns a value outside the portable domain or reaches a Java surface the kernel does not decide

**Status:** Profile limitation; not a deviation

Some admitted expressions reach, for particular data, a CIB result or Java behaviour the portable value domain cannot hold or the kernel does not decide: a Double, an out-of-domain or non-canonical Decimal at a mapping, a collection rendered as text, the ordering of two Lists or two Maps, Java `equals` over Integers whose carrier the kernel cannot know, String bean properties, a listed method on a receiver or with an argument whose kind the closed list does not give that method where the kernel does not decide CIB's answer, a List index of another kind than Integer or text, non-ASCII case mapping and numeric text, surrogate splits, a Multi-Instance count with a fraction or outside Java's `int` range, which CIB truncates or wraps (`multiInstance.fractionalCount`, `multiInstance.countRange`), an instance's effect result named like a counter or the item (`multiInstance.resultShadowsInstance`), and in sequential mode an earlier instance's result a completion condition would read (`multiInstance.sequentialResultLeftover`). CIB returns a value for some of these and fails for others with an `ELException` that rolls the operation back; the kernel answers `unsupported` with a stable dynamic-only code for each, as [the expression semantics](kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#failure-semantics) list them, rather than invent a portable value or a failure.

**Evidence:** The retained answers (CIB Seven `2.2.0`) of the [core witness table](../scenarios/open-rows/juel-core-table/README.md) rows where CIB returns a value (`integer-class-contains`, `integer-class-equals`, `list-equals-integers`, `list-index-of-integer`, `map-contains-value-integer`, `map-equals-integers`, `boolean-receiver-equals`, `composite-part-list`, `equal-text-list`, `order-list-text`, `order-text-list`, `decimal-noncanonical-result`, `decimal-plus-large-integer`, `text-double-operand`, `string-bean-property`, `string-over-limit`, `replace-integer-arguments`) and where it rolls back (`decimal-plus-non-ascii-text`, `integer-plus-non-ascii-text`, `index-non-ascii-text`, `integer-receiver-size`, `list-get-text-argument`, `substring-text-argument`, `list-index-boolean`, `property-of-text-by-list`); [juel-evaluation-failures](../scenarios/open-rows/juel-evaluation-failures/README.md) `integer-overflow`, `negative-result` and `map-replace` (a Map's mutating `replace`, which CIB runs); [juel-core-forms](../scenarios/open-rows/juel-core-forms/README.md) `access-structured-results` (List element equality over Integers of unknown carrier); and [multi-instance-expression-results](../scenarios/open-rows/multi-instance-expression-results/README.md) `count-decimal-fractional`, `count-integer-over-int` and `completion-counter-equals`, [multi-instance-sub-process](../scenarios/open-rows/multi-instance-sub-process/README.md) `sequential-decimal-fractional` (a Decimal count of 1.5 CIB truncates to one body) (`${loopCounter.equals(0)}`, false in CIB because a counter is a Java `Integer`). A witness whose CIB result lies outside the canonical result holds it in a Sub-Process input, which the runner does not project, and renders it as text (`held-results`, `held-decimal`).

**Boundary:** Admitted core and Multi-Instance expressions whose run reaches one of those cases; the statically refused forms are `CIB-LIM-0009`.

### CIB-LIM-0011: pinned CIB ignores the configured-task extension

**Status:** Profile limitation; not a deviation

A Task carrying `bpmnLean:taskDefinition` is a standards-profile extension that names its work by configuration. CIB Seven `2.2.0` ignores the foreign extension element and runs the Task as an Abstract Task that passes its token on, so CIB is no oracle for it.

**Evidence:** The retained [configured-task](../scenarios/configured-task/README.md) answer, where CIB passes through what the kernel opens as configured work (CIB Seven `2.2.0`).

**Boundary:** The `bpmnLean:taskDefinition` extension only.

### CIB-LIM-0012: an expression reading the `task` bean is refused at admission

**Status:** Profile limitation; not a deviation

CIB Seven `2.2.0` resolves `${task.assignee}` and its siblings inside a task listener and rolls the command back elsewhere, because the `task` bean exists only there. The kernel has no task bean in its expression context, so admission refuses an expression naming it (`expression.juel.engineContext`, as for CIB's other engine objects) and, until the JUEL Task-fields level defines the site, any non-literal User Task metadata expression (`work.user.assignee` and its siblings).

**Evidence:** The retained [task-metadata-condition](../scenarios/open-rows/human-task-metadata-composition/README.md) answer, where CIB rolls back a condition reading `task` (CIB Seven `2.2.0`).

**Boundary:** Expressions naming the `task` bean in User Task metadata and conditions.

### CIB-LIM-0013: pinned CIB ignores the Data Input and Output Associations of an Activity or a catch Event

**Status:** Known CIB limitation within reviewed scope

BPMN 2.0.2 §10.4.1 and §13.3.2 make an Activity's InputSet available only through its Data Input Associations and copy its OutputSet through its Data Output Associations. CIB Seven `2.2.0`'s `BpmnParse` never reads `ioSpecification`, `dataInputAssociation` or `dataOutputAssociation` outside a Multi-Instance loop's `loopDataInputRef` (`BpmnParse.java:1841-1858`, `CIB-INT-0014`): the task opens with no input whatever the source's availability, and a completion's submitted values are installed by name (`CIB-EXT-0005`) instead of being associated to their targets. On an Intermediate Catch, boundary, Event Sub-Process start or root start Message Event, and on a Message Receive Task (§13.3.3), the same parser omission leaves the declared Data Output without effect (BPMN 2.0.2 §10.5.1 Table 10.82): a delivery without variables commits and writes nothing, where the kernel refuses it under account P1 (`message-payload-required`) and, with a payload, writes the associated target. The standards profile follows BPMN; no CIB profile imitates the omission.

**Evidence:** The retained answers of `activity-data-input-user-task/{absent,null,present}`, `activity-data-output-user-task/{null,omitted,supplied}` and `activity-data-input-output-user-task/{absent,null,omitted,present}` (standards profile `bpmn-2.0.2`, CIB Seven `2.2.0`): CIB opens the task with no inputs, publishes the submitted `DataOutput_*` name instead of the associated Property, and commits an omitted required output; the retained answer of `message-payload-catch/absent-payload` (standards profile `bpmn-2.0.2`, CIB Seven `2.2.0`), where CIB commits a delivery without variables to a catch with a required Data Output, and of `message-start-compositions/shipment-payload-absent` (profile `cibseven-2.2.0`), where CIB starts an instance from a root Message start with a required Data Output and no variables; and of `message-start-compositions/shipment-payload-{map,string}` and `message-correlation-criteria/payload-with-{matching,mismatching}-criterion` (profile `cibseven-2.2.0`), where CIB starts an instance from a root Message start, or commits a delivery to a catch, whose Data Output the kernel fills with the payload, and writes no target; in the mismatching one CIB first rejects the delivery under another order's criterion; the retained answers of `message-payload-catches/{branches-each-own-destination,payload-absent,payload-null,payload-of-another-kind,repeated-arrival-fresh-wait}` (profile `cibseven-2.2.0`), where the kernel writes the payload into an item of the Sub-Process or Multi-Instance body holding the catch, or rejects a payload-free delivery, and CIB writes nothing and commits; and of `message-esp-interrupting/process-cancel-without-payload` (profile `cibseven-2.2.0`), where CIB commits a payload-free delivery to an interrupting Message Event Sub-Process start whose Data Output the kernel requires; and of `receive-task-payload/{into-scope,payload-required}` (profile `cibseven-2.2.0`), where CIB commits a delivery to the Receive Task `Await_Note`, whose Data Output the kernel requires and writes into the Sub-Process's Property, writes no target and opens `Inspect_Note` without its input, and rejects the second delivery once the task has left; and the population answers of [journey-order-payment](../scenarios/open-rows/journey-order-payment/README.md) `status-updates-repeat-with-payload` and `withdrawal-after-payment-and-beside-a-handler` (profile `cibseven-2.2.0`, Verify run 43370273960), where each delivery to the non-interrupting Message boundary *Status update arrives* commits and starts its handler, and the order ends without the Process Property `Property_StatusNote` that the kernel fills from the boundary's Data Output. The runner sends no payload, since CIB's Message carries only variables.

**Boundary:** Standard Data Associations on Activities and the Data Output Associations of Message catch Events and Message Receive Tasks, root Message starts included; Multi-Instance loop references stay `CIB-INT-0014`, and variables a delivery installs by name stay `CIB-EXT-0025`. It includes the Activities no token begins, a compensation handler and an Activity a Scope's implicit start begins: the kernel holds one whose Data Input Association source is unavailable, its compensation run and thrower waiting with it (M11's I-K2, PC-COMPENSATION-04, PC-DATA-09), where CIB opens it without the input.

### CIB-LIM-0014: the portable value domain rejects at ingress a value CIB stores

**Status:** Profile limitation; not a deviation

The portable value domain bounds a root value at four container levels, 256 value nodes and 16,384 canonical JSON bytes ([data semantics](kernel/semantics/DATA-SEMANTICS-SPEC.md#values)); the kernel rejects a Start, completion, variable update, effect result or payload carrying a value beyond them as `value-outside-domain`, with the state unchanged. CIB Seven `2.2.0` has no such bound: its default Java serialization stores the `ArrayList` and `LinkedHashMap` of any depth and size (CIB-CFG-0009), so the same command commits. A root String over 1,024 UTF-8 bytes is the same case: the scenario schema bounds only a nested String, and by 1,024 code points, and the CIB runner checks no root String's length ([`ScenarioVariableValueProjection.java:94`](../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioVariableValueProjection.java)), so CIB stores it and commits.

**Evidence:** The [structured-value-bounds](../scenarios/open-rows/structured-value-bounds/README.md) schedules `start-over-depth-bound`, `start-over-node-bound`, `start-over-byte-bound` and `completion-over-depth-after-valid-entry`, retained: CIB commits where the kernel rejects; the at-bound schedules agree. The [scalar-types-in-multi-instance](../scenarios/open-rows/scalar-types-in-multi-instance/README.md) schedules `string-over-bytes-human-completion` and `string-over-bytes-service-result` (600 `é`, 1,200 UTF-8 bytes, at a User Task completion and at an effect result), retained in Verify run 43238005814: CIB commits the command the kernel rejects as `value-outside-domain`. This entry owns their ledger entries.

**Boundary:** The depth, node and byte bounds of a root value and the 1,024-byte bound of a root String. The member count, a negative Integer and the Decimal spelling and scale are wire rules the scenario schema states, which no CIB command receives. A nested String over 1,024 UTF-8 bytes and a Decimal coefficient past the signed 64-bit range can be schema-valid, but the CIB runner's decoder refuses both, so their witnesses are the kernel's alone.

### CIB-LIM-0015: a `latest` decision reference binds at program assembly

**Status:** Profile limitation; not a deviation

CIB Seven `2.2.0` resolves a Business Rule Task's `latest` `camunda:decisionRef` at every evaluation (`DecisionEvaluationUtil.java:121-123`, `CallableElementUtil.java:127-151`). A key missing then throws `DecisionDefinitionNotFoundException` (`DecisionDefinitionCache.java:67-69`), a `ProcessEngineException` without a cause that `BpmnExceptionHandler` rethrows (`:57-60,70-72`), so the reaching command rolls back. The kernel binds the reference once, when it assembles the program. A program carries its decisions without versions and refuses two decisions with one key (`decision.duplicateId`), and it is fixed for each instance, so an instance evaluates the assembled decision through recovery and replay. A key the program lacks is refused for the whole model (`work.rule.decisionMissing`), including runs that never reach the task.

**Evidence:** The retained hit-policy and routing witnesses, each deploying its BPMN and DMN resources together (CIB Seven `2.2.0`).

**Boundary:** Decision references only; the Call Activity's version binding is PC-SCOPE-03's. A redeployment of the key, a key deployed after the caller, and a key undeployed or deleted after assembly are outside the claim.

### CIB-LIM-0016: pinned CIB runs an automatic burst beyond the kernel's closure limit

**Status:** Profile limitation; not a deviation

CIB Seven `2.2.0` runs a closure without a wait state in one transaction to its end. The kernel bounds one command's micro-steps by `Step.closureBound` (100,000) and answers a longer closure `unsupported "closure-bound"`, committing nothing, rather than truncate it ([flow semantics](kernel/semantics/FLOW-SEMANTICS-SPEC.md), Cycles). It also bounds the state a closure walks: one whose micro-steps together run over more than `Step.closureWorkBound` (10,000,000) state entries is refused with the same code, which caps a burst that stays under the step count but grows its state with every step, such as a parallel Multi-Instance body that starts further instances.

**Evidence:** The retained answers (CIB Seven `2.2.0`) of the [cycle-compositions](../scenarios/open-rows/cycle-compositions/README.md) witnesses `automatic-loop-beyond-bound` and `automatic-loop-tail-beyond-closure-bound`, past the micro-step bound, and `automatic-loop-waiting-branch-beyond-work-bound`, past the work bound far below the micro-step bound, where CIB commits the start and the kernel answers `unsupported "closure-bound"`; this entry owns those three in the ledger. `automatic-loop-short-burst`, `automatic-loop-long-burst` and the twins one micro-step or one iteration shorter, `automatic-loop-tail-at-closure-bound` and `automatic-loop-waiting-branch-at-work-bound`, stay within the bounds and agree, so the retained answers place each bound exactly (Verify run 43370273960 for the two pairs).

**Boundary:** Automatic cycles with no wait state inside one command.

### CIB-LIM-0017: a declared name equal to a delegate token is refused at admission

**Status:** Profile limitation; not a deviation

CIB evaluates `camunda:delegateExpression` as JUEL when the job runs (`ServiceTaskDelegateExpressionActivityBehavior.java:107-122`), and its resolver chain reads process variables (`JuelExpressionManager.java:144`) before the configured beans (`:150`). A visible variable named like the token therefore shadows the handler, and the job fails because the delegate is no `JavaDelegate` (`:120`). The kernel binds the token to its operation when it reads the model and carries it as the work's `handlerKey`. `Kernel.Admission.Work` refuses a program that declares a name equal to a token one of its Service or Send Tasks or bound Message throws (CIB-EXT-0039) binds (`work.handlerKeyName`). Declared names are input and output parameter targets, `resultVariable`, `elementVariable`, an input data item's name, which CIB binds as the element variable (`BpmnParse.java:1868-1872`), and Call input and output targets. Form field ids and an input data item's id are refused as well, conservatively: `TaskService.complete` installs a submission without the form handler (`CompleteTaskCmd.java:70-72`), and CIB never binds the item's id, so neither shadows a handler in CIB.

**Evidence:** The retained `writable-handler-key` answer, where CIB rolls back the effect's result with the job's retries at 2, and `undeclared-handler-key`, its runtime counterpart (CIB Seven `2.2.0`).

**Boundary:** Names only the run supplies are outside the claim, where the kernel commits and CIB fails the job: an undeclared name a User Task submission installs (CIB-EXT-0005), a Start variable, and a `setVariables` command. A Process's Property, Data Object or Data Input or Output and a Data Association target are no declared names, since CIB installs none of them: `parseProperties` is commented out at process level (`BpmnParse.java:726`), and the pinned parser reads no Data Object, process I/O specification or Data Association.

### CIB-LIM-0018: pinned CIB deploys a non-interrupting Error boundary and leaves the failed Activity behind

**Status:** Profile limitation; not a deviation

BPMN 2.0.2 §13.5.3 and Table 10.90 make an Error boundary interrupting. CIB Seven `2.2.0` deploys one declared `cancelActivity="false"`, and on a business Error starts the boundary concurrently in the flow scope while the failed Activity's execution stays where it was with nothing left to complete it. The kernel refuses the model under every profile (`boundary.error.nonInterrupting`) instead of imitating that state.

**Evidence:** Pinned `BpmnParse.java:3305-3313` (`CONCURRENT_IN_FLOW_SCOPE`); the retained witness [boundary-failure](../scenarios/open-rows/error-non-interrupting-declarations/README.md) (CIB Seven `2.2.0`, 2026-11-10), where CIB commits and the kernel refuses.

**Boundary:** Non-interrupting Error boundaries on Activities that end in a business Error. A schedule that then completes the boundary's path, separating CIB's still-running instance from an interrupting reading, is owed.

### CIB-LIM-0019: a looping Activity's own input mapping that reads its counters or item is refused

**Status:** Profile limitation; not a deviation

CIB Seven `2.2.0` evaluates a Multi-Instance Activity's own `camunda:inputParameter` in the parent of the execution entering the Activity (`IoParameter.java:50-51`, called from `PvmExecutionImpl.java:1309-1314`, whose comment marks the choice `<LEGACY>` at `:1310-1314`). Which execution that is depends on whether the inner Activity is a scope (`BpmnParse.java:4801-4815`): a parallel non-scope Activity's input sees the body's counters but not `loopCounter` or the item, a sequential one sees neither, and a Sub-Process, Transaction, Receive Task with a `messageRef`, DMN Business Rule Task or external Service Task sees the instance. A name the execution does not hold fails the evaluation and rolls the start back. BPMN 2.0.2 Table 10.29 makes the `inputDataItem` the source of the Activity's Data Input Associations, so the item is visible there. The profile neither reproduces a rollback that depends on scope classification nor claims BPMN's reading for CIB: under `MultiInstanceBinding.loopReferences` it refuses a read of a counter name or the item name in a looping Activity's own input mappings as `multiInstance.ownInputReadsInstance`, for every inner kind and both modes, and admits own input mappings that read neither.

**Evidence:** The pinned sources above; the retained start-rollback witnesses in [multi-instance-user-task](../scenarios/open-rows/multi-instance-user-task/README.md), [multi-instance-nesting](../scenarios/open-rows/multi-instance-nesting/README.md), [multi-instance-expressions](../scenarios/open-rows/multi-instance-expressions/README.md), [multi-instance-activity-mapping-scope](../scenarios/open-rows/multi-instance-activity-mapping-scope/README.md), [input-mapping-contexts](../scenarios/open-rows/input-mapping-contexts/README.md) and [expression-cardinality-and-collections](../scenarios/open-rows/expression-cardinality-and-collections/README.md), 59 retained answers measured 2026-11-10: 54 roll back in CIB Seven `2.2.0`, and the 5 zero-instance schedules commit, since no instance starts. They are this refusal's witnesses, not row acceptance; the kernel tests `packages/kernel/test/admission-refusals-multi-instance.test.ts`.

**Boundary:** Own input mappings of a looping Activity under `loopReferences`. Own output mappings are a CIB deployment error (`BpmnParse.java:4855-4857`) and stay `multiInstance.mappings`; under `dataAssociations` every own mapping stays refused.

### CIB-LIM-0020: a target named like a Multi-Instance counter inside an instance is refused

**Status:** Profile limitation; not a deviation

CIB Seven `2.2.0` holds the Multi-Instance counters as execution locals (`MultiInstanceActivityBehavior.java:196-198`), so a mapping that writes a counter name inside an instance replaces CIB's count, and CIB reads a counter back as a typed `IntegerValue` (`:200-204`), in sequential mode to compute the next index (`SequentialMultiInstanceActivityBehavior.java:48`). Table 10.30's attributes are maintained by the engine, and BPMN has no account of a model writing them. Under `MultiInstanceCounters.cibLocals` the profile refuses, as `multiInstance.counterTarget`, a looping Activity's own input mapping whose target is a counter name, and an output mapping, Call output or subscription output written in a scope inside an instance whose target is one. A write admission cannot see, an effect result or a User Task submission reaching a counter local, is `unsupported` when it occurs (`multiInstance.resultShadowsInstance`, dynamic-only).

**Evidence:** The pinned sources above; the [nested-output-writes-counter](../scenarios/open-rows/multi-instance-instance-sites/README.md) witness, whose evidence run is pending; the retained [items-parallel-counter-submission and items-sequential-counter-submission](../scenarios/open-rows/human-task-result-identity/README.md) answers (CIB Seven `2.2.0`), where a User Task submission names `nrOfCompletedInstances` or `loopCounter` with a String and CIB rolls the completion back reading the counter typed, and the kernel answers `unsupported` (`multiInstance.resultShadowsInstance`); the kernel tests `packages/kernel/test/admission-refusals-multi-instance.test.ts`. `CIB-LIM-0004` covers the Call output CIB drops for three of the names under every profile.

**Boundary:** Counter-named targets inside an instance under `cibLocals`; outside every instance such a target is an ordinary variable.

### CIB-LIM-0021: pinned CIB refuses several Escalation handlers of one code in one place

**Status:** Profile limitation; not a deviation

BPMN 2.0.2 §10.5.6 allows one interrupting and any number of non-interrupting handlers for one Event Declaration, all of which run. CIB Seven `2.2.0` refuses at deployment, among the Escalation boundaries of one host and among the Escalation Event Sub-Processes of one scope, two of one code, a catch-all beside a coded one and two catch-alls, whatever their interruption modes. The kernel's search takes one catcher per level, so it refuses the same declarations under every profile (`boundary.escalation.duplicate`, `scope.eventSubProcess.escalationDuplicate`): a restriction, not an equivalence with BPMN.

**Evidence:** Pinned `BpmnParse.java:3702-3735` (`addEscalationEventDefinition`); the retained witnesses [escalation-boundary-conflicts](../scenarios/open-rows/escalation-boundary-conflicts/README.md) (CIB Seven `2.2.0`, 2026-11-10); the kernel tests `packages/kernel/test/admission-refusals-escalation.test.ts`.

**Boundary:** Escalation boundaries of one host and Escalation Event Sub-Processes of one scope. Within what both admit, at most one handler per level matches a code, so the missing exact-before-catch-all rank of CIB's finder never decides (CIB-INT-0010).

### CIB-LIM-0022 — CIB addresses a Message subscription by a required, scope-unique name

**Status:** Profile limitation selected by the cibseven profiles (`MessageNames.addresses`)

BPMN addresses a Message by its identifier and lets it be nameless. CIB Seven `2.2.0` subscribes by the Message's `name`, refuses a Message subscription whose name is missing or blank after trimming, and refuses two Message subscriptions of one unresolved name in one event scope. Under the cibseven profiles the kernel refuses the same models (`message.unnamed`, `message.duplicateName` for two names in one event scope) and keeps channel addressing, the runner mapping the channel onto the name (CIB-OP-0005). Under `bpmn-2.0.2` a nameless Message is admitted.

**Evidence:** Pinned `BpmnParse.java:1271-1282`, `:1297-1299`, `EventSubscriptionDeclaration.java:85-87`; retained `message-name-addressing/unnamed-message` (refused at deployment); `message-name-addressing/expression-names-different-messages` and `expression-names-resolve-equal` (two expression names of different texts on one host, deployed by both; the two boundaries share their host's execution, so when the names resolve equal CIB rolls a delivery to one of them back, which is CIB-LIM-0038's, as are several waits of one name in one instance).

**Boundary:** Catches, boundaries, Event Sub-Process starts, root starts and Receive Tasks; a Receive Task with a nameless Message is refused (`message.unnamed`, work admission). The duplicate rule groups every Message subscription of a program by CIB's event scope and start mark (`BpmnParse.java:1317-1327`) and refuses a repeated literal name (`message.duplicateName`): a boundary is in its host, or in the host's Multi-Instance body when the host loops (`:3290-3301`); a Receive Task's own Message is in the Receive Task, which its boundaries share unless it loops (`:2753-2760`); an Event Sub-Process start is in the scope holding the Event Sub-Process (`:1112`, `:3499-3503`), which a boundary of that Sub-Process shares; an Event-Based Gateway arm is in the gateway and any other catch in itself (`:1526-1530`); a root Message start is in its process with the start mark, apart from that level's Event Sub-Process starts (`:1026-1032`). CIB compares the unresolved name texts; the kernel compares a literal name by its text and an expression name by its parsed form, which the IL keeps instead of the text, so it refuses two expression texts that differ only in layout, which CIB deploys, and admits every pair CIB deploys whose parsed forms differ. A literal never collides with an expression name, since the reader reads every text holding `${` or `#{` as an expression. The cibseven profiles also admit a Message name given by an expression, which CIB resolves when the subscription opens (CIB-INT-0024).

### CIB-LIM-0023 — CIB ignores a Message Event's `operationRef`

**Status:** Profile limitation; not a deviation

BPMN lets a Message Event name the Operation that carries its Message (Table 10.99). CIB Seven `2.2.0` reads only `messageRef` and matches by name. The kernel's channel also carries the Operation and rejects a delivery on another Operation; an `operationRef` naming no Operation is a dangling reference the source refuses. The `operation-*` schedules agree only because the runner's channel check rejects a foreign channel before CIB is called.

**Evidence:** Pinned `BpmnParse.java:1259-1269`; retained `message-name-addressing/operation-*`.

**Boundary:** Every Message subscription.

### CIB-LIM-0024 — CIB needs a start Event in a Sub-Process and a Transaction

**Status:** Profile limitation selected by the cibseven profiles (`ScopeStart.required`)

BPMN 2.0.2 §13.3.4 lets a Sub-Process without a start Event begin, on entry, every Activity and Scope without incoming flow. CIB Seven `2.2.0` refuses deploying a `subProcess` without a `startEvent` ("must define a startEvent element"). It parses a `transaction` without that check, but runs it with `SubProcessActivityBehavior`, whose entry requires the initial activity that only a start Event sets, so entering such a Transaction fails and rolls the entering command back. Under the cibseven profiles the kernel refuses an embedded Sub-Process or Transaction that holds no start Event at admission (`scope.withoutStart`). Under `bpmn-2.0.2` it begins the Scope's Activities and Scopes without incoming flow, and a Gateway or Event among them stays refused (`scope.implicitStart`).

**Evidence:** Pinned `BpmnParse.java:967-968` (the deployment check, `process` and `subProcess` only), `:1083-1084` (a start Event sets `INITIAL_ACTIVITY`), `:3902-3917` (`parseTransaction`), `SubProcessActivityBehavior.java:41-45` (`ensureNotNull` on the initial activity); the kernel test `packages/differential/test/scope-start-profiles.test.ts`. The witnesses are [scope-without-start](../scenarios/open-rows/scope-without-start/README.md).

**Boundary:** Embedded Sub-Processes, a looping one and a compensation handler included, and Transactions. An Event Sub-Process always holds its triggering start. A process or called process without a start Event is [CIB-LIM-0056](#cib-lim-0056--cib-refuses-deploying-a-process-without-a-start-event-which-the-kernel-admits-and-cannot-start)'s.

### CIB-LIM-0026 — CIB keeps Signal names unique per document and per event scope

**Status:** Profile limitation for `SignalNames.addresses` (CIB-INT-0028); selected by the cibseven profiles

BPMN 2.0.2 lets two Signals share a `name`, which addresses nothing (Table 10.100), and lets any number of events catch one Signal; two root Signal starts of one process on one Signal each begin an instance (§13.2). CIB Seven `2.2.0` addresses a Signal by its name and refuses deploying a document that declares two Signals of one name, or that declares two Signal subscriptions of one unresolved name text and one start mark in one event scope. Under `addresses` the kernel refuses the same models: two Signals the program references with one name (`signal.duplicateDefinitionName`), and two Signal subscriptions of one name in one event scope with one start mark (`signal.duplicateName`), such as two arms of one Event-Based Gateway or two root Signal starts of one process. The IL keeps an expression name's parsed form, not its text, so two expression names compare structurally: texts that differ only in layout are refused by the kernel and deployed by CIB, as in CIB-LIM-0027.

**Evidence:** Pinned `BpmnParse.java:479-482` (`parseSignals`), `:1284-1288`, `:1301-1303`, `:1317-1328` (`hasMultipleSignalEventDefinitionsWithSameName`); retained `signal-start-compositions/duplicate-signal-starts-start`, refused by both; the kernel tests `packages/kernel/test/admission-refusals-subscriptions.test.ts`.

**Boundary:** Event scopes as CIB-LIM-0022 groups Message subscriptions: an Event-Based Gateway arm in the gateway and any other catch in itself (`:1526-1530`), an Event Sub-Process start in the scope holding its Event Sub-Process, unmarked (`:1112`, `:3499-3503`), and a root start in its process, marked (`:1033-1037`, `:3516-3520`), and a boundary in its host, or in the host's Multi-Instance body when the host loops (`:3290-3301`, `:3388-3393`), so a Sub-Process's boundary shares its event scope with the starts of the Event Sub-Processes inside it. A Signal that no event references never reaches the IL, so two such Signals of one name are admitted where CIB refuses the document. Under `identifier` neither rule applies.

### CIB-LIM-0027 — the kernel compares two root Conditional start predicates by their parsed form, CIB by their text

**Status:** Profile limitation selected by the cibseven profiles; not a deviation

CIB Seven `2.2.0` refuses deploying a process with two Conditional start Events whose condition texts are equal (`BpmnParse.java:1289-1292`, `:1305-1315`). The kernel's IL keeps a predicate's parsed form, not its text, so under `ConditionalStart.submittedContext` (CIB-EXT-0044) it refuses two root Conditional starts of one process level whose parsed predicates are structurally equal (`start.condition.duplicate`). Two texts that differ only in layout, such as `${amount >= 1000}` and `${amount>=1000}`, parse equal and are refused by the kernel while CIB deploys them; two texts whose literals differ in lexeme but not in value stay apart in both. BPMN 2.0.2 gives two Conditional starts of one process no rule (Table 10.84, §13.2: each start is independent).

**Evidence:** Pinned `BpmnParse.java:1289-1292`, `:1305-1315` (`getConditionAsString`); retained `conditional-start-compositions/duplicate-conditions-start`, refused by both.

**Boundary:** Root Conditional starts of one process level under `submittedContext`; under `refused` each is refused as `start.condition` first.

### CIB-LIM-0028 — CIB keeps a root Message start name unique across the current deployments of all keys

**Status:** Profile limitation selected by the cibseven profiles; not a deviation

BPMN 2.0.2 names no deployment and no rule that two processes' Message starts must differ; a Message start is addressed by its Message (§10.5.5). CIB Seven `2.2.0` subscribes a root Message start by its Message name and refuses deploying a definition whose root Message start name another process key's current version already subscribes in the tenant (`BpmnDeployer.java:328-363`); redeploying the same key replaces its own subscription. Under `MessageNames.addresses` (CIB-LIM-0022) the kernel's population refuses such a deployment (`deploymentRefused deployment.messageStartName`): a root Message start name of the deployed program equals one of another key's current deployment, the last registered deployment of that key. Under `description` no name addresses a start and nothing is checked.

**Evidence:** Pinned `BpmnDeployer.java:328-363`; the kernel test `packages/kernel/test/population-deploy.test.ts`; the retained answer of `message-start-population/second-deployment-same-start-name-refused` (profile `cibseven-2.2.0`), where CIB refuses the second key's deployment and the publication then starts the first key's instance, as the kernel does.

**Boundary:** Root Message starts of each deployment's root process in one tenant-less population; a called process's starts are never a population's start addresses.

### CIB-LIM-0029 — withdrawn: CIB commits every receiver of one stimulus together, the kernel each receiver on its own

**Status:** Withdrawn, not a limitation (M8 track review, 2026-11-11); recorded as CIB-INT-0033

CIB implements one transaction for every receiver of a stimulus, and the kernel departs from it on purpose. The classification order keeps a limitation for a capability CIB does not implement; BPMN states no transaction across process instances, so CIB's choice is its interpretation of that gap, recorded as [CIB-INT-0033](#cib-int-0033--cib-commits-every-receiver-of-one-stimulus-in-one-transaction).

### CIB-LIM-0030 — withdrawn: the kernel finishes a thrower's step before other instances receive its Signal

**Status:** Withdrawn, not a limitation (M8 track review, 2026-11-11); recorded as CIB-INT-0035

CIB implements an order between a thrower's continuation, its sibling branches and its Signal's receivers. The classification order keeps a limitation for a capability CIB does not implement; BPMN states no such order, so CIB's order is its interpretation of that gap, recorded as [CIB-INT-0035](#cib-int-0035--cib-runs-a-throwers-earlier-queued-sibling-branches-after-its-signals-receivers).

### CIB-LIM-0031 — withdrawn: a Call binds its callee when its caller is deployed, CIB at each invocation

**Status:** Withdrawn, not a limitation (M8 track review, 2026-11-11); recorded as CIB-INT-0034

CIB implements binding a callee at each invocation, and the kernel departs from it on purpose. The classification order keeps a limitation for a capability CIB does not implement; BPMN names no binding time, so CIB's choice is its interpretation of that gap, recorded as [CIB-INT-0034](#cib-int-0034--cib-binds-a-calls-callee-at-each-invocation).

### CIB-LIM-0032 — a Call's key, version or version tag given by an expression is refused

**Status:** Profile limitation of program-assembly binding; not a deviation

CIB Seven `2.2.0` evaluates a `calledElement`, `calledElementVersion` or `calledElementVersionTag` expression in the calling execution at each invocation (`BaseCallableElement.java:49-57`, `:95-128`), so the callee is chosen by run-time data. Binding at deployment cannot read run-time data, so the kernel refuses a called element given by an expression and, under `cibKey`, a version or tag given by one (`work.call.bindingExpression`). A model file reaches the first refusal in the reader, as `source.schema`, since `${calleeKey}` is no `xsd:QName` (`Semantic.xsd:149`); a kernel fixture that carries the expression is refused at admission as `work.call.calledElementExpression`. BPMN 2.0.2 §10.3.6 names a CallableElement statically.

**Evidence:** Pinned `BaseCallableElement.java:49-57`, `:95-128`, `CallableElementUtil.java:45-50`; retained `call-binding-time/binding-dynamic`, which CIB commits and the reader refuses as `source.schema`.

**Boundary:** Call Activities under both readings; literal selectors are CIB-INT-0034.

### CIB-LIM-0033 — a Call's tenant is refused in one tenant-less population

**Status:** Profile limitation; not a deviation

CIB Seven `2.2.0` lets a Call name the tenant whose definitions it searches (`camunda:calledElementTenantId`, `BaseCallableElement.getDefinitionTenantId`). BPMN 2.0.2 has no tenant, and a population is one tenant-less deployment registry, so the kernel refuses a Call's tenant (`work.call.tenant`) and a carried definition bound to one (`process.definition.binding`).

**Evidence:** Pinned `CallableElementUtil.java:48`, `:64`, `:84-99`, `BpmnParse.java:4030-4039`; retained `call-binding-time/call-tenant-selector`, which CIB rolls back at invocation.

**Boundary:** Call Activities and carried process definitions under every profile.

### CIB-LIM-0034 — a recursive Call is refused

**Status:** Profile limitation of program-assembly binding; not a deviation

CIB Seven `2.2.0` runs a Call whose callee leads back to the calling definition as a new instance per invocation, with no cycle check in `CallActivityBehavior` or `CallableElementUtil`. BPMN 2.0.2 §10.3.6 does not forbid recursion. The kernel binds a program's calls once, so it refuses a Call of the root process (`work.call.rootProcess`) and a Call on a carried process whose bound callee leads back to that process (`work.call.cycle`). Because a process binds only callees deployed no later than itself (CIB-INT-0034), such a cycle arises only among the processes of one deployment.

**Evidence:** Pinned `CallActivityBehavior.java`, `CallableElementUtil.java:45-103` (no cycle check); the population witness `call-binding-population/carried-call-cycle`, which the kernel refuses as `work.call.cycle` and whose retained CIB answer deploys all three processes. The witness starts no instance, so CIB's run-time recursion rests on the pinned source.

**Boundary:** Calls of the root process and cycles among carried processes under every profile.

### CIB-LIM-0035 — a Call's Data Associations to a callee of another deployment are refused

**Status:** Profile limitation; not a deviation

BPMN 2.0.2 §10.3.6 makes a Call's Data Inputs and Outputs correspond to its callee's without an association between them; the kernel reads that correspondence by position only within the caller's own document, where the reader sees both. A callee of another deployment carries no correspondence the program holds, so the kernel refuses such a Call's Data Associations (`work.call.dataAcrossDeployments`). CIB Seven `2.2.0` parses no Call Data Association (CIB-LIM-0013), so it deploys the Call and ignores them.

**Evidence:** Pinned `BpmnParse.java` (no `dataInputAssociation` parsing outside a Multi-Instance loop, CIB-LIM-0013); the kernel test `packages/kernel/test/admission-refusals-work.test.ts`.

**Boundary:** Standard Call data whose bound callee is a copy of another deployment's process; CIB variable mappings (`camunda:in`, `camunda:out`) are unaffected.

### CIB-LIM-0036 — a Business Rule Task in a copy of another deployment's process is refused

**Status:** Profile limitation; not a deviation

Under `BusinessRuleTask.decisionTable` (CIB-EXT-0032) a Business Rule Task names a decision among the DMN resources deployed with its own document. A deployment's program carries a copy of another deployment's called process, but not that deployment's DMN resources, so the kernel refuses a Business Rule Task in such a copy (`work.rule.acrossDeployments`). CIB Seven `2.2.0` resolves the decision when the task is reached, across deployments by key.

**Evidence:** The kernel test `packages/kernel/test/admission-refusals-decision.test.ts`. No retained CIB answer yet.

**Boundary:** Business Rule Tasks of carried copies; one in the deploying document's own processes is CIB-EXT-0032.

### CIB-LIM-0037 — a payload offered to a Message wait without a Data Output commits in CIB

**Status:** Profile limitation; not a deviation

A Message wait takes a delivered payload only through a Data Output that its Data Output Association moves into scope (BPMN 2.0.2 §10.5.1, Table 10.82; for a Receive Task §10.4.1 "Receive Task Mapping", which allows at most one Data Output and lets a payload without one "not flow"); a wait that declares none has no destination for one. CIB Seven `2.2.0`'s Message carries only variables: its correlation builder and `messageEventReceived` take variable maps and nothing else, so the runner sends no payload and CIB commits the delivery as one without it. The kernel refuses a payload offered to a Receive Task, catch or start Event that declares no Data Output (`message-payload-not-accepted`), account P1's restriction, and commits nothing.

**Evidence:** Pinned `MessageCorrelationBuilder.java:115-166` (only `setVariable*`), `RuntimeService.java:2014`, `:2039`; the runner's `CibSevenCommandExecutor.deliver`, which sends no payload; the retained answer of `message-payload-catches/payload-to-receive-task` (profile `cibseven-2.2.0`), where CIB commits a String payload offered to the Receive Task `Await_Docs`, which declares no Data Output, and the kernel refuses it (`message-payload-not-accepted`); and of `message-payload-catches/payload-offered-without-data-output` on `message-addressed-receive-task/process.bpmn`, where the kernel refuses the payload and commits the payload-free delivery that follows, and CIB commits the first and rejects the second.

**Boundary:** A payload offered to a Message wait that declares no Data Output. A wait that declares one is CIB-LIM-0013, and variables a delivery installs by name are CIB-EXT-0025.

### CIB-LIM-0038 — CIB cannot deliver a Message to one addressed waiting occurrence

**Status:** Known CIB limitation within reviewed scope; selected by no profile, since the kernel delivers to the addressed occurrence under every profile; not a deviation

A single-instance `deliver` input names one waiting occurrence by its full identity, and the kernel fires exactly that occurrence when its channel and criteria are accepted, under every profile (the [subscriptions specification](kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#messages)). CIB Seven `2.2.0` has no Message delivery to one occurrence: `createMessageCorrelation(name)` with `processInstanceId` and its criteria selects among every subscription of that name in the instance and fails with `MismatchingMessageCorrelationException` on zero or several matches. Where several waits of one instance match the name and criteria, CIB rolls the command back where the kernel delivers to the addressed one; where the addressed wait does not match but another does, CIB delivers to the other where the kernel rejects. Without criteria the runner addresses the wait's execution through `messageEventReceived(name, executionId)`, which also fails when that execution holds two subscriptions of the name, as the Message boundaries of one Activity do when their names resolve equal: CIB rolls the command back where the kernel delivers to the addressed boundary. CIB's selection is the kernel's population `publish`, which reaches exactly one receiver or is `ambiguous`.

**Evidence:** Pinned `runtime/DefaultCorrelationHandler.java:45-72`, `cmd/CorrelateMessageCmd.java:57-95`, `cmd/MessageEventReceivedCmd.java:79-87` (`ensureNumberOfElements(…, 1)` over the execution's subscriptions of the name); retained `message-name-addressing/expression-names-resolve-equal` (two boundaries of one host whose expression names resolve equal, delivered without criteria) and `message-correlation-criteria/ambiguous-same-instance` and `receive-task-payload-correlation/order-branches-correlated-delivery`, `order-repetition-previous-occurrence`, `order-wrong-correlation` and `order-wrong-owner-and-activation`, where two waits of one instance subscribe to one Message.

**Boundary:** Single-instance `deliver` inputs to Message catches, boundaries, Event Sub-Process starts and Receive Tasks under the cibseven profiles. A delivery whose instance holds one wait of that Message name agrees.

### CIB-LIM-0039 — CIB reads a local criterion at a Message Receive Task in a scope of its own

**Status:** Known CIB limitation within reviewed scope; selected by no profile, since the kernel reads a local criterion in the body occurrence's scope under every profile; not a deviation

BPMN 2.0.2 gives each instance of a Multi-Instance Activity its `loopCounter` (Table 10.30) and no execution tree. The kernel's Multi-Instance Receive Task waits in its body occurrence's scope, which holds its `loopCounter` (CIB-INT-0018), so a local criterion (CIB-EXT-0025) on a body variable reads it there. CIB Seven `2.2.0` makes a Message-addressed Receive Task a scope of its own beneath its Multi-Instance body's execution and evaluates a local criterion only on the execution holding the subscription, so a local criterion on a body variable such as `loopCounter` matches nothing in CIB and rolls the delivery back, where the kernel delivers.

**Evidence:** Pinned `bpmn/parser/BpmnParse.java:2754-2761` (`setScope(true)` for a Receive Task with `messageRef`), `runtime/DefaultCorrelationHandler.java:98-101`; retained `receive-task-payload-correlation/items-parallel-local-element`, whose local criterion names the body's String element variable `item`, so no counter type plays a part: CIB rejects all three deliveries where the kernel rejects the first and commits the other two, so the Receive Task's own scope alone separates the engines. The retained `items-parallel-local-correlation` states its criterion on `loopCounter`, which CIB stores as an `Integer` (`MultiInstanceActivityBehavior.java:77`), so it also meets CIB-LIM-0040; this entry and CIB-LIM-0040 own it together.

**Boundary:** Local criteria naming a variable of the Multi-Instance body at a looping Receive Task under the cibseven profiles. A catch inside a looping Sub-Process waits in a scope beneath its body in both engines and agrees (CIB-EXT-0025).

### CIB-LIM-0040 — CIB's variable query compares a Long criterion only with Long-typed variables

**Status:** Known CIB limitation within reviewed scope; selected by no profile, since the kernel compares an Integer criterion by kind and value under every profile; not a deviation

BPMN 2.0.2 gives a data value no Java type, and the kernel's Integer is one kind compared by value (CIB-EXT-0025). CIB Seven `2.2.0` stores each variable with the Java type of the value written: a command's variable as the runner hands it over, an engine-derived counter such as `loopCounter` as an `Integer` (`MultiInstanceActivityBehavior.java:77`), and an expression's result as JUEL returns it. Its variable query compares a plain `Integer` or `Long` only with a variable of that same type; the cross-type numeric comparison applies only to an abstract `NumberValue` (`QueryVariableValue.java:58-66`). The runner hands every Integer over as a `Long`, both for a variable a command writes and for a criterion (`ScenarioVariableValueProjection.toEngineValue`). So a criterion matches a command-supplied Integer across its whole 64-bit range (`integer-beyond-int-range`), but never an Integer the engine derived, where the kernel matches by value. The runner keeps the `Long` projection: an `Integer` projection would truncate values beyond 32 bits, choosing the type from the value would make the runner pick a type CIB never stored, and a `NumberValue` criterion is not the typed criterion the scenario contract states.

**Evidence:** Pinned `QueryVariableValue.java:58-66`, `MultiInstanceActivityBehavior.java:77`; retained `message-correlation-criteria/engine-integer-criterion`, whose criterion on `lastPosition`, mapped from `${loopCounter}`, CIB rejects where the kernel delivers; `integer-beyond-int-range`, which agrees; and `receive-task-payload-correlation/items-parallel-local-correlation`.

**Boundary:** Integer criteria on a variable CIB stores as `Integer` (an engine counter, or an expression result derived from one) under the cibseven profiles; this entry owns those witnesses in the ledger.

### CIB-LIM-0041 — CIB runs an asynchronous Compensation throw synchronously

**Status:** Known CIB limitation within reviewed scope; selected by no profile, since the kernel refuses the asynchronous form at admission under every profile (`throw.compensation.asynchronous`); not a deviation

BPMN 2.0.2 §10.7.2 lets a Compensation throw with `waitForCompletion = false` continue without waiting for the triggered compensation to complete. CIB Seven `2.2.0` deploys such a throw with a warning that the attribute is not supported and always waits for the compensation to join, so the throw's form cannot be told from the synchronous one in CIB.

**Evidence:** Pinned `bpmn/parser/BpmnParse.java:1726-1729` (the deployment warning) and `bpmn/behavior/CompensationEventActivityBehavior.java:51-52`; the retained answer of [unwaited-handler-open](../scenarios/open-rows/compensation-targeting/README.md) (profile `cibseven-2.2.0`), which waits for the handler.

**Boundary:** Compensation throws with `waitForCompletion = false`; this entry owns their witnesses in the ledger.

### CIB-LIM-0042 — CIB ignores the asynchronous continuation of a boundary compensation handler

**Status:** Known CIB limitation within reviewed scope; selected by no profile, since the kernel waits for every handler effect under every profile; not a deviation

BPMN 2.0.2 §10.7.1 lets a Compensation Activity be any Task or Sub-Process, and a Service Task's work is an external effect the kernel waits for. CIB Seven `2.2.0` starts a boundary compensation handler with `PvmAtomicOperation.ACTIVITY_START` on the compensating execution, which never defers to a job, so `camunda:asyncBefore` on the handler has no effect and its delegate runs inside the command that triggers compensation; a handler's raised Error or Escalation therefore leaves within that command.

**Evidence:** Pinned `bpmn/helper/CompensationUtil.java:62-75` and `event/CompensationEventHandler.java:73-78`; the retained answers of [compensation-handler-failures](../scenarios/open-rows/compensation-handler-failures/README.md) except `one-fails-caught`, [handlers-user-first and stale-interior-result-while-handlers-wait](../scenarios/open-rows/transaction-cancel-waiting-handlers/README.md) and [refund-incident-retried](../scenarios/open-rows/transaction-cancel-mixed/README.md) (profile `cibseven-2.2.0`), whose handler effects CIB runs in the triggering command; and of [cancel-leaves-unfinished-work-uncompensated](../scenarios/open-rows/journey-booking-recovery/README.md) (profile `cibseven-2.2.0`, Verify run 43370273960), where CIB runs *Cancel the flight* inside the cancelling decision, consuming its `effectResult` (`CibSevenScriptedEffect`), and opens *Tell the traveler* at once, so the command addressed to it while the kernel's flight handler still waits commits and ends the instance, and the later one is rejected.

**Boundary:** Service Task compensation handlers attached by a boundary Event; this entry owns their witnesses in the ledger except those of CIB-LIM-0046.

### CIB-LIM-0043 — CIB deploys Cancel forms BPMN does not define and fails or strands them

**Status:** Known CIB limitation within reviewed scope; selected by no profile, since the kernel refuses both forms at admission under every profile; not a deviation

BPMN 2.0.2 §10.3.5 lets a Cancel End Event cancel its Transaction, whose Cancel boundary then "will direct the flow after the Transaction has been rolled back and all compensation has been completed", and attaches the Cancel Intermediate Event only to a Transaction's boundary, where the kernel's §10.5.5 reading admits only an interrupting one. CIB Seven `2.2.0` deploys a Cancel End Event whose Transaction has no Cancel boundary and rolls back the command that reaches it, at the explicit `ensureNotNull` of the boundary it looks for; and it deploys a non-interrupting Cancel boundary, after whose path the instance stays running with no wait. The kernel refuses the first as `throw.cancel.uncaught` and the second as `boundary.cancel.nonInterrupting`, and a second Cancel boundary on one Transaction as `boundary.cancel.duplicate`, which CIB refuses too ([compensation semantics](kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md#i13--cancel-over-mixed-work-an-uncaught-cancel-and-the-cancel-boundary-forms-pc-tx-02)).

**Evidence:** Pinned `bpmn/behavior/CancelEndEventActivityBehavior.java:39-53` (the `ensureNotNull` at `:41-42`) and `bpmn/parser/BpmnParse.java:1776-1779` (a second Cancel boundary refused); the retained answers of [cancel-end-without-boundary, non-interrupting-cancel-boundary and two-cancel-boundaries](../scenarios/open-rows/transaction-cancel-refusals/README.md) (profile `cibseven-2.2.0`); the retained rollback carries no cause, so the `ensureNotNull` site is the source reading.

**Boundary:** A Cancel End Event in a Transaction without a Cancel boundary, and a non-interrupting Cancel boundary; this entry owns `cancel-end-without-boundary` and `non-interrupting-cancel-boundary` in the ledger.

### CIB-LIM-0044 — CIB refuses a second compensation handler of one Activity and a Process-level Compensation Event Sub-Process

**Status:** Known CIB limitation within reviewed scope; selected by no profile, since the kernel refuses the same forms at admission under every profile (`compensation.handlerCount`, `compensation.processEventSubProcess`); not a deviation

BPMN 2.0.2 states no limit of one compensation handler per Activity, and §13.5.5 contains a Compensation Event Sub-Process "within a Process or a Sub-Process". CIB Seven `2.2.0` keeps at most one handler per Activity or scope, refusing at deployment a Compensation boundary beside a Compensation Event Sub-Process of the same Sub-Process, two Compensation Event Sub-Processes of one scope and two Compensation boundaries on one Activity, and refuses a Compensation Event Sub-Process at Process level, since compensation across a call hierarchy is unsupported.

**Evidence:** Pinned `bpmn/parser/BpmnParse.java:913-920`, `:1187-1190`, `:1199-1201` and `:1754`; the retained answers of [esp-and-boundary-same-scope, two-esps-same-scope, two-compensation-boundaries and esp-at-process-level](../scenarios/open-rows/compensation-handler-form-refusals/README.md) (profile `cibseven-2.2.0`), refused at deployment as the kernel refuses them.

**Boundary:** Those four forms. An Association to an Activity without `isForCompensation` and a Sequence Flow into or out of a handler are BPMN-invalid (§10.7.1, Table 10.3), and both CIB and the kernel refuse them.

### CIB-LIM-0045 — CIB fails the compensation join of a Multi-Instance Sub-Process's Compensation Event Sub-Process

**Status:** Known CIB limitation within reviewed scope; selected by no profile: CIB cannot execute the model, and the rolled-back command is an engine failure, not CIB's answer; not a deviation

BPMN 2.0.2 §10.7.2 compensates every instance of a Multi-Instance Sub-Process, and §13.5.5 lets its Compensation Event Sub-Process carry that compensation. CIB Seven `2.2.0` opens one parent handler per instance and fails the command that completes one: leaving the Event Sub-Process ends compensation, which supplies a missing activity to the immediate parent only; that parent's join signals its own parent, which has no current activity, and `PvmExecutionImpl.signal` throws `PvmException` "cannot signal execution …: it has no current activity".

**Evidence:** Pinned `bpmn/behavior/BpmnActivityBehavior.java:122`, `pvm/runtime/PvmExecutionImpl.java:415-426` (ending compensation), `bpmn/behavior/AbstractBpmnActivityBehavior.java:120-135` (the join) and `pvm/runtime/PvmExecutionImpl.java:776-779` (the exception); the root's probe P1 of 2026-11-11 on [sequential-in-turn-consumed](../scenarios/open-rows/compensation-event-subprocess-multi-instance/README.md) step `s06`: `PvmExecutionImpl.signal:778` ← `AbstractBpmnActivityBehavior.signalCompensationDone:130` ← `signal:114` ← `PvmExecutionImpl.signal:783` ← `endCompensation:425` ← `BpmnActivityBehavior.performOutgoingBehavior:122` ← `SubProcessActivityBehavior.doLeave:65`. The retained rollbacks of `parallel-out-of-order-consumed` step `s06` and of `sequential-in-turn-rethrown` and `parallel-out-of-order-rethrown` step `s09` carry no cause; the two `s09` steps complete the inner handler, so their membership is an inference.

**Boundary:** Multi-Instance Sub-Processes with a Compensation Event Sub-Process, from the command that completes a handler; the observations before it stay CIB answers. This entry is the last owner of the sequential witnesses, whose first difference is CIB-DEV-0011's, and of the parallel ones, whose first difference is CIB-INT-0040's; the handlers of both read CIB-DEV-0014's restored body locals.

### CIB-LIM-0046 — CIB fails the interruption a synchronous compensation handler's caught Error starts

**Status:** Known CIB limitation within reviewed scope; selected by no profile: CIB cannot execute the model, and the rolled-back command is an engine failure, not CIB's answer; not a deviation

BPMN 2.0.2 §13.3.2 states no disposition for a failing handler; under CIB-INT-0038 the Error propagates from the trigger, where the Process's interrupting Error Event Sub-Process catches it. CIB Seven `2.2.0` runs the Service Task handler inside the triggering command (CIB-LIM-0042) and fails in the delete cascade that ends the interrupted work: firing an activity end asks `LegacyBehavior.isCompensationThrowing` for an activity-execution mapping, whose construction finds the scope it extends already mapped from the compensation-throwing ancestor, so its scope list is empty and taking its last element throws `IndexOutOfBoundsException`, which `CompensationEventHandler` wraps in `ProcessEngineException` "Error while handling compensation event".

**Evidence:** Pinned `pvm/runtime/operation/PvmAtomicOperationDeleteCascadeFireActivityEnd.java:35-40`, `PvmAtomicOperationActivityInstanceEnd.java:49`, `pvm/runtime/LegacyBehavior.java:624-626`, `pvm/runtime/PvmExecutionImpl.java:1559`, `:1572` and `:1643-1647`, and `event/CompensationEventHandler.java:82`; the root's probe P2 of 2026-11-11 on [one-fails-caught](../scenarios/open-rows/compensation-handler-failures/README.md) step `s02`: `ArrayList.get` ← `PvmExecutionImpl.createActivityExecutionMapping:1647` ← `:1559` ← `:1572` ← `LegacyBehavior.isCompensationThrowing:625` ← `PvmAtomicOperationActivityInstanceEnd.eventNotificationsStarted:49` ← `PvmAtomicOperationDeleteCascadeFireActivityEnd.eventNotificationsStarted:40`, below `CompensationEventHandler.handleEvent:82`. The retained `late-failure-after-success`, where the failing handler runs before the other one completes, commits and opens `UserTask_Recover`; the retained rollback of [refund-business-failure](../scenarios/open-rows/transaction-cancel-mixed/README.md) step `s04` carries no cause, so its membership is an inference.

**Boundary:** A synchronous compensation handler's Error caught by an interrupting catcher after another handler of the same trigger completed (the second condition is inferred from the two witnesses); this entry owns `one-fails-caught` and `refund-business-failure` in the ledger.

### CIB-LIM-0047 — CIB fails a Sub-Process compensation handler that forks

**Status:** Known CIB limitation within reviewed scope; selected by no profile: CIB cannot execute the model, and the rolled-back command is an engine failure, not CIB's answer; not a deviation

BPMN 2.0.2 §10.7.1 lets a Compensation Activity be a Sub-Process, whose content is ordinary flow. CIB Seven `2.2.0` starts a Sub-Process handler on the compensating execution itself, which `throwCompensationEvent` made concurrent, and fails at the first fork inside it: the transition prepares one outgoing execution per flow, the tree expansion of the second replaces the first, and the replacement carries no transition, so `PvmExecutionImpl.take` throws `PvmException` "no transition to take specified".

**Evidence:** Pinned `event/CompensationEventHandler.java:73-78`, `bpmn/helper/CompensationUtil.java:75`, `pvm/runtime/operation/PvmAtomicOperationTransitionDestroyScope.java:89-133`, `pvm/runtime/OutgoingExecution.java:41-46` and `pvm/runtime/PvmExecutionImpl.java:791-793`; the root's probe P3 of 2026-11-11 on [terminate-first](../scenarios/open-rows/compensation-handler-terminate/README.md) step `s01`: `PvmExecutionImpl.take:793` ← `OutgoingExecution.take:46` ← `PvmAtomicOperationTransitionDestroyScope.execute:133` ← `PvmAtomicOperationTransitionNotifyListenerEnd:54`; the retained rollback of `slow-first` step `s01`, the same command on the same model, carries no cause.

**Boundary:** Sub-Process compensation handlers whose flow forks; CIB gives no answer on a Terminate End inside a handler. This entry owns `terminate-first` and `slow-first` in the ledger.

### CIB-LIM-0048 — CIB cannot build the activity-instance tree of some compensation states

**Status:** Known CIB limitation within reviewed scope; selected by no profile: CIB cannot render the state the oracle observes, and the harness failure is no CIB answer; not a deviation

CIB Seven `2.2.0`'s `RuntimeService.getActivityInstance` builds an activity-execution mapping from every leaf execution; below a compensation-throwing ancestor it finds the scope it extends already mapped and takes the last element of an empty scope list, CIB-LIM-0046's site. CIB's own suite ignores activity-instance-tree assertions for compensation (CAM-4387 and CAM-4903). The oracle's runner derives occurrence identities from that tree, so it cannot observe these states; whether it re-sources them from executions, history or other CIB APIs that build no mapping is a separate decision, and such an observation is not excluded.

**Evidence:** Pinned `cmd/GetActivityInstanceCmd.java:123`, `pvm/runtime/PvmExecutionImpl.java:1559`, `:1572` and `:1643-1647`, and `engine/src/test/java/org/cibseven/bpm/engine/test/bpmn/event/compensate/CompensateEventTest.java`; hosted run 43073432420's twelve harness failures `java.lang.IndexOutOfBoundsException: Index -1 out of bounds for length 0`: [late-data-after-completion and no-late-data](../scenarios/open-rows/compensation-context/README.md), [esp-handler-reads-and-writes-outer](../scenarios/open-rows/compensation-context-live-outer/README.md), [compensation-event-subprocess-nesting](../scenarios/open-rows/compensation-event-subprocess-nesting/README.md) (four schedules), [throws-parent-activity](../scenarios/open-rows/compensation-event-subprocess-throws/README.md), [typed-data-reaches-handlers](../scenarios/open-rows/compensation-handler-bodies/README.md), [esp-consumes-one-of-two](../scenarios/open-rows/compensation-handler-consumption/README.md), and [subjects-effect-first and subjects-user-first](../scenarios/open-rows/transaction-cancel-mixed/README.md); the root's observation probe of 2026-11-12: `ArrayList.get` ← `PvmExecutionImpl.createActivityExecutionMapping:1647` ← `:1559` ← `:1572` ← `GetActivityInstanceCmd.execute:123`, reached from the runner's state observation (`CibSevenOccurrences.instance`, `CibSevenOccurrences.java:157`); the root's probe of 2026-11-13 met the same failure at the same site in four [journey-booking-recovery](../scenarios/open-rows/journey-booking-recovery/README.md) schedules, `cancel-compensates-completed-reservations`, `handlers-answered-in-another-order`, `late-changes-reach-the-handlers` and `cancel-after-the-car-recovery`.

**Boundary:** Observations of those states through the activity-instance tree; the twelve witnesses and the four journey schedules retain no evidence, so the ledger holds none of them.

### CIB-LIM-0049 — CIB never subscribes a Receive Task compensation handler to its Message

**Status:** Known CIB limitation within reviewed scope; selected by no profile, since the kernel keeps BPMN's meaning, under which the handler waits for its Message; not a deviation

BPMN 2.0.2 §10.7.1 lets a Compensation Activity be any Task, a Receive Task included, which waits for its Message. CIB Seven `2.2.0` makes a Receive Task with a `messageRef` a scope whose Message subscription is declared on itself, and creates a scope's declared subscriptions only when a new scope execution initializes; a boundary compensation handler instead reuses the compensating execution and starts the activity on it, so the handler's Message subscription is never created, a delivery to it is rejected and the compensation never completes.

**Evidence:** Pinned `bpmn/parser/BpmnParse.java:2754-2760`, `persistence/entity/ExecutionEntity.java:409-414` and `event/CompensationEventHandler.java:73-78` (`setActivity` and `PvmAtomicOperation.ACTIVITY_START` on the existing execution); the retained answers of [all-forms-complete, premature-and-stale-handler-results and abandoned-while-handlers-wait](../scenarios/open-rows/compensation-handler-bodies/README.md) (profile `cibseven-2.2.0`), which open no wait for `ReceiveTask_UndoQuote` and reject its Message.

**Boundary:** Receive Task compensation handlers attached by a boundary Event; this entry owns those three witnesses in the ledger.

### CIB-LIM-0050 — CIB drops a compensation handler's output parameters

**Status:** Known CIB limitation within reviewed scope; selected by no profile, since the kernel runs a handler's output mapping when it completes, as at every other Activity's completion; not a deviation, since the output parameter is CIB's extension (CIB-EXT-0015, CIB-EXT-0019), which no BPMN requirement governs

BPMN 2.0.2 §10.4.2 executes an Activity's output Data Associations "When an Activity finishes execution", and §13.3.2 pushes data "into the context of the Activity" upon completion; §10.7.1 makes a Compensation Activity an ordinary Activity in that respect. The project reads CIB's `camunda:outputParameter` as that completion mapping. CIB Seven `2.2.0` ends a compensation handler that has no outgoing flow, below a compensation-throwing ancestor, through `endCompensation`, which fires the end listeners and removes the execution without destroying its scope, so the output parameters that `destroy` executes never run and the handler's writes are lost. This rests on the source reading; no probe isolates the call.

**Evidence:** Pinned `bpmn/behavior/BpmnActivityBehavior.java:120-122` (such a handler calls `endCompensation`), `pvm/runtime/PvmExecutionImpl.java:414-425` (`endCompensation`: `FIRE_ACTIVITY_END`, then `remove()`), against `persistence/entity/ExecutionEntity.java:518-525` (`destroy` executes the activity's output parameters) and `:1049-1062` (`remove` does not); the retained answer of [default-handler-reads-and-writes-outer](../scenarios/open-rows/compensation-context-live-outer/README.md) (profile `cibseven-2.2.0`), whose handler `UserTask_UndoWork` writes `shared = handler-wrote` by an output parameter: after it completes, CIB's `shared` stays `s2` (trace [10] and [12]) and the kernel's is `handler-wrote`.

**Boundary:** Compensation handlers with output parameters that end through `endCompensation`; this entry owns that witness in the ledger.

### CIB-LIM-0051 — CIB deploys a Service Task whose implementation no binding matches

**Status:** Known CIB limitation within reviewed scope; selected by no profile, since the kernel refuses the task at admission (`work.service.unboundImplementation`, `throw.message.unboundImplementation`); not a deviation, since a delegate, class or expression is CIB's extension, which no BPMN requirement governs

BPMN 2.0.2 Table 10.8 lets a Service Task name its technology by `implementation` and the invoked Operation by `operationRef`; it says nothing of a Java bean. The project reads a declared CIB implementation through an effect binding, an overlay or built-in entry that maps the source attributes to a project-owned protocol and operation. A `camunda:delegateExpression`, `class` or `expression` that no binding matches names product code, which stays out of the program, so the reader carries no operation and admission refuses the Service Task, a Send Task performed by a handler, or a bound Message throw under `MessageThrowForms.cibForms` (CIB-EXT-0039). CIB Seven `2.2.0` builds the behavior from the declared attribute alone and deploys the model; it resolves a delegate expression only when the task executes, so an unknown token fails the job of a task behind `asyncBefore` and rolls back the command that reaches a synchronous one.

**Evidence:** Pinned `bpmn/parser/BpmnParse.java:2264-2305` (`parseServiceTaskLike` sets the behavior from `type`, `class`, `delegateExpression` or `expression` and never reads `operationRef`), `bpmn/behavior/ServiceTaskDelegateExpressionActivityBehavior.java:101-122` (`expression.getValue` when the task executes) and `bpmn/behavior/ClassDelegateActivityBehavior.java:111-112` (the class is instantiated then); the witness [unknown-delegate](../scenarios/open-rows/automation-handler-reuse/README.md), an `asyncBefore` Service Task bound to `${noSuchHandler}`, which the kernel refuses at deployment; its retained answer (CIB Seven `2.2.0`, Verify run 43238005814) commits the start and rolls back the command that runs the task's job, where the delegate expression fails to resolve. This entry owns its ledger entry.

**Boundary:** A declared delegate expression, class or expression that no overlay or built-in binding matches. A registered binding is unaffected, an external task's `camunda:topic` is refused by the reader (`reader.factNotCarried`), and a Message throw's `class`, `expression` or `type` is refused there as well (`throw.message.implementation`).

### CIB-LIM-0052 — the profile binds no host object and types a Script result by its value

**Status:** Known limitation within reviewed scope; selected by the cibseven profiles

CIB Seven `2.2.0` binds `execution` and, through GraalJS host access, every Java class (`scripting/engine/CamundaScriptEngineManager.java:195-203`, `cfg/ProcessEngineConfigurationImpl.java:609`), hands a List or Map variable to the script as a host object whose members and `Object.keys` differ from a JavaScript array or object, and types a number result by GraalJS's internal representation: an integer GraalJS keeps as an `int` becomes an `Integer`, one reached through negation, division or a `Math` function a `Double` (P1). The profile binds neither host object (`script-host-object`), freezes collections as plain arrays and null-prototype objects, and types an integer-valued result in 0..2^31−1 as Integer.

**Evidence:** The cited source and probe P1 ([script semantics](kernel/semantics/SCRIPT-SEMANTICS-SPEC.md#probe-p1-2026-11-12)); witness `probe-host-mutation` of the [JavaScript Script Task witnesses](../scenarios/open-rows/script-task-javascript/README.md).

**Boundary:** Scripts that reference `execution` or `Java`, read a List, Map or `stringList` variable, or return a number whose Java type the source does not fix. This entry owns the ledger entry of `probe-host-mutation`.

### CIB-LIM-0053 — competing Conditional items true at one evaluation fire in the input's ranked order, which CIB cannot be given

**Status:** Profile limitation under every profile; not a deviation

At one evaluation, one arming or one offered write, two Conditional items compete when firing one withdraws the other: an interrupting boundary withdraws every item inside its host occurrence, the host's other boundaries included, an Event-Based Gateway arm its gateway's other arms, and an interrupting Event Sub-Process start every item inside its scope occurrence. A connected set of competing items is a contest; nested cancellation regions, a mix of interrupting and non-interrupting items, and a host's boundaries with the Event Sub-Process starts of the scope that host opens, which one activation enables, are contests too. BPMN gives simultaneous triggers no order (§13.4.4, BPMN-2.0.2.md:12560). CIB Seven `2.2.0` takes one, which no profile can select. An Event-Based Gateway's arms follow `ScopeImpl.eventActivities`, a `HashSet<ActivityImpl>` whose classes override no `hashCode`, so identity hashes (**H:** it varies per JVM run). Boundaries and Event Sub-Process starts evaluated in the command that creates their subscriptions follow the creation order, which iterates a `HashMap` keyed by activity id, so a renaming can change it; in a later command they follow the subscriptions `selectEventSubscriptionsByExecution` reads back, with no `ORDER BY`. An interrupting firing that ends the execution silences the members after it, so CIB may fire a non-interrupting member before the interrupting one. The kernel takes none of these orders: the input states one as its ranking `conditionChoices`, which the kernel walks per contest ([subscriptions semantics](kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#conditions)); a contest the ranking leaves undecided is dynamic-only `unsupported` (`gateway-arms-simultaneous`, `conditions-simultaneous`), as CIB-LIM-0003 refuses forms CIB commits. A member whose interrupting firing an earlier write of the same input enqueued fires first and needs no ranking, and an item that firing withdraws takes part in no contest of the later write (`pending-pair-*`, `pending-mixed-*`, `pending-arms-*`), since CIB dispatches the variable events in write order and the first interruption ends the host before the next (`two-writes-first-wins`, whose retained answer agrees). The CIB runner cannot be given a ranking, so a witness whose contest needs one is kernel-only; CIB agreement is claimed only where no contest needs a ranking: none arises at one evaluation, several items true included when none withdraws another (`esp-starts-one-condition`), or an earlier write's pending interrupting firing decides it (`two-writes-first-wins`; `pending-pair-no-choice`, `pending-mixed-no-choice` and `pending-arms-no-choice` await their retained answers). `conditional-boundary-hosts/level-both-eligible` keeps its retained CIB evidence, which the kernel now refuses unranked: its twin `level-both-eligible-ranked`, ranked `[Warn_Level, Stop_Level]`, reproduces the retained answer, and `level-both-eligible-stop-first`, ranked `[Stop_Level]`, the other outcome BPMN admits. Inputs the host or the population makes, a durable timer firing, an effect result, a fan-out's delivery or start, carry no ranking, so a contest they raise stays refused; one ranking serves every contest of an input, so the same elements in two hosts or called instances are ranked alike.

**Evidence:** Pinned `EventBasedGatewayActivityBehavior.java:36-44`, `ScopeImpl.java:55`; `core/model/Properties.java:93-98`, `bpmn/parser/BpmnParse.java:1294`, `persistence/entity/ExecutionEntity.java:409-413`, `:1534-1546`; `resources/org/cibseven/bpm/engine/impl/mapping/entity/EventSubscription.xml:189-193`; `BoundaryConditionalEventActivityBehavior.java:46-53`, `EventSubProcessStartConditionalEventActivityBehavior.java:44-53`; `VariableListenerInvocationListener.java:75-80`, `PvmExecutionImpl.java:1999-2010`; the dropped witness `conditional-catch/gateway-two-true-arms` (`d69a66ae1`: a hosted replay did not reproduce its retained answer); the retained answer of `conditional-contests/two-writes-first-wins` (hosted retake 43321610024), which the kernel reproduces; the kernel's `Conditions.resolveContests`; `condition-simultaneous.test.ts`, `conditional-preemption.test.ts`, `conditional-ranked-twin.test.ts` (the ranked twin equals the retained answer) and the contest witnesses of [`conditional-contests`](../scenarios/open-rows/conditional-contests/README.md), `conditional-catch` (`arms-*`) and `conditional-boundary-hosts` (`level-both-eligible-*`).

**Boundary:** Conditional items that compete at one evaluation, under every profile. A host's boundaries and the Event Sub-Process starts of the scope it opens, a Sub-Process's own scope or a Call's called root, are enabled by one activation and evaluated together; a Multi-Instance body's instances, and whatever is armed after tokens move, are later evaluations; two Event-Based arms one Signal throw reaches are CIB-INT-0030's; two Sequence Flows from one Event-Based Gateway to one catch make two arms of one element that withdraw each other, which no ranking separates; a ranking under which an interruption overtakes work an earlier firing started is CIB-LIM-0055's.

### CIB-LIM-0054 — a sequential Multi-Instance collection removed or null before a later instance is unsupported

**Status:** Known limitation within reviewed scope; selected by the cibseven profiles with `CIB-INT-0043`

When the re-read of `CIB-INT-0043` finds the collection variable removed or a collection expression evaluating to null, CIB Seven `2.2.0` skips binding the item (`MultiInstanceActivityBehavior.java:85-88`, `collection != null`), so the next instance runs with the previous instance's item still set on the body's execution (`SequentialMultiInstanceActivityBehavior.java:56-58`). That value is an accident of the sequential body sharing one execution, not a BPMN meaning, and the kernel does not reproduce it: the completion is `unsupported` with the dynamic-only code `multiInstance.collectionRemoved`.

**Evidence:** The pinned sources above; the retained answers (CIB Seven `2.2.0`) of [multi-instance-mutable-collection](../scenarios/open-rows/multi-instance-mutable-collection/README.md) `sequential-collection-removed` and [multi-instance-user-task](../scenarios/open-rows/multi-instance-user-task/README.md) `portable-sequential-collection-removed`, where CIB commits and the kernel answers `unsupported`; the kernel's `MultiInstance.nextItems`.

**Boundary:** Sequential collection loops under `CollectionRead.sequentialReread` whose collection is removed or null when a later instance begins; on entry a removed or null collection is `CIB-INT-0019`'s.

### CIB-LIM-0055 — work an earlier firing started that a later interruption would remove before its first wait is unsupported

**Status:** Known limitation within reviewed scope; under every profile; a forward-compatible restriction

When one micro-step fires several items, at one evaluation in the input's ranked order ([CIB-LIM-0053](#cib-lim-0053--competing-conditional-items-true-at-one-evaluation-fire-in-the-inputs-ranked-order-which-cib-cannot-be-given)) or across the writes of one command in write order, the kernel enqueues every firing and runs every queued signal before any token moves. An interrupting firing therefore removes its region, at once its open items and through its queued cancellation or interrupting begin its occurrences and tokens, before work an earlier firing started there reaches its first wait: the begin of a non-interrupting Event Sub-Process the earlier firing triggered, the arming of what that begin started, or the token an inner boundary sends into the removed Sub-Process. Dropping that work would commit an answer without it, a Signal the earlier handler throws before its first wait included. CIB Seven `2.2.0` pushes each atomic operation onto the head of the command's queue and, when no operation is executing, drains the queue before returning (`interceptor/CommandInvocationContext.java:93-135`), so a variable event a command's write dispatches runs its handler to its first wait before the next event is dispatched, and the next event's interruption cancels a handler that already ran its no-wait work (**H**: no retained evidence of an earlier non-interrupting handler's work; `two-writes-first-wins` retains the case where the first event interrupts, and agrees). For writes made while an operation executes, an arming or a completion's outputs, the operations join the head of the running queue, an order no profile selects (CIB-LIM-0053). The kernel neither runs each firing to its wait first nor drops the work: an input whose firings of one micro-step, the earlier writes' first, put a withdrawing firing after one that continues inside the region it removes (`Conditions.overtakes`), or whose queued begin, arming or `occur` finds its scope occurrence or occurrence removed (`Step.stale`), is dynamic-only `unsupported` (`interrupted-before-wait`). Running each firing, signals and tokens, to its first wait before the next would lift the restriction without reinterpreting an accepted input. Before the ranking such an input was refused (`conditions-simultaneous`), failed (`begin-into-missing-scope`) or left an armed boundary on a removed Activity, so the restriction narrows no correct answer; a ranking that puts the interrupting member first, or whose earlier firings continue outside the interrupted region, commits.

**Evidence:** The pinned source above; the kernel's `Conditions.overtakes` and `Step.stale`; `interruption-queued-begin.test.ts` (a Signal-throwing non-interrupting handler refused under the write order and under the ranking, and committed with the interruption first), `condition-simultaneous.test.ts`, `conditional-preemption.test.ts`; the refused schedules `esp-mixed-warn-then-stop`, `nested-inner-then-outer`, `enabled-sub-start-then-boundary`, `enabled-call-start-then-boundary`, `enabled-effect-start-then-boundary`, `standards-nested-inner-then-outer` and `standards-enabled-start-then-boundary` of [`conditional-contests`](../scenarios/open-rows/conditional-contests/README.md), beside the committed `esp-mixed-stop-first`, `nested-outer-first`, `standards-mixed-stop-first`, `standards-mixed-warn-then-stop` and `standards-nested-outer-first`.

**Boundary:** Firings of one micro-step's evaluations and writes, and queued begins, armings and `occur`s of one closure, under every profile. A token in flight before the interrupting firing ran, a sibling branch of a fork whose other branch raises among them, is removed with its region as before; work that reaches the removed region only after a later micro-step's tokens move is outside this entry.

### CIB-LIM-0056 — CIB refuses deploying a process without a start Event, which the kernel admits and cannot start

**Status:** Known limitation within reviewed scope; a deployment-outcome difference under every profile, not an over-claim; selected by no profile, and no option refuses it at admission ([#77](https://github.com/mbackschat/bpmn-lean-experiment/issues/77))

BPMN 2.0.2 §10.5.2 makes a start Event optional at every process level, a top-level and a called process included: without one, every flow object without incoming flow, compensation Activities excepted, is instantiated when the process is. CIB Seven `2.2.0` refuses deploying a `process` without a `startEvent` ("must define a startEvent element"), as it refuses a `subProcess` (CIB-LIM-0024). The kernel admits such a process under every profile and implements no implicit start at the process level: it rejects the start of a root instance (`no-start-event`) and fails a Call to such a process (`called-process-without-none-start`), so the deployment that CIB refuses is admitted and then answers no start. Extending `ProfileOptions.scopeStart = required` from embedded scopes to process levels would refuse it at admission under the cibseven profiles and make the outcomes agree.

**Evidence:** Pinned `BpmnParse.java:966-968` (the check, `process` and `subProcess` alike); the retained answer of [event-race-compositions](../scenarios/open-rows/event-race-compositions/README.md) `instantiating-no-start-start` (CIB Seven `2.2.0`), whose deployment is `unsupported`, while the kernel refuses that model for its instantiating Event-Based Gateway (`gateway.eventBased.instantiate`) before this difference shows; the kernel's `Hooks.chooseStart` (`no-start-event`) and the Call's `called-process-without-none-start`.

**Boundary:** Top-level and called processes with no start Event under every profile. Embedded Sub-Processes and Transactions are CIB-LIM-0024's. A called process whose only starts are triggered is outside this entry.

### CIB-LIM-0057 — CIB runs the output parameters of an Activity an interruption removes

**Status:** Known CIB limitation within reviewed scope; selected by no profile beyond CIB-EXT-0016's thrower and interrupted host, since the kernel writes an Activity's output mappings only when it completes; not a deviation, since the output parameter is CIB's extension (CIB-EXT-0015, CIB-EXT-0019), which no BPMN requirement governs

BPMN 2.0.2 §10.4.2 executes an Activity's output Data Associations "When an Activity finishes execution", and an Activity that an interruption removes does not complete (§13.3.2, Figure 13.2). The project reads CIB's `camunda:outputParameter` as that completion mapping, so the kernel writes nothing for an Activity it removes; CIB-EXT-0016 selects CIB's writes only for an Error's or Escalation's thrower and the host its own boundary interrupts. CIB Seven `2.2.0` removes an interrupted region through `deleteCascade`, which destroys every scope execution in it, and `destroy` runs the Activity's output parameters unless `skipOutputMappingOnCanceledActivities` is set, which it is not by default; an Activity with `camunda:inputOutput` is a CIB scope, so a bystander inside the removed region writes its outputs outward from its own locals. In the witness the User Task *Decide whether to keep the booking*, whose input parameter sets `decision = keep` and whose output parameter writes `bookingDecision = ${decision}`, is open inside the Transaction when the Transaction's Error boundary takes `CARD_DECLINED`: CIB leaves the Process variable `bookingDecision = keep`, the kernel writes nothing.

**Evidence:** Pinned `pvm/runtime/operation/PvmAtomicOperationCancelActivity.java:60` (the boundary's `deleteCascade` of its host), `pvm/runtime/operation/PvmAtomicOperationDeleteCascadeFireActivityEnd.java:83-89` (`destroy(alwaysSkipIoMappings)`, false unless the flag is set), `ProcessEngineConfiguration.java:418` (the flag's default `false`), `persistence/entity/ExecutionEntity.java:518-525` (`destroy` executes the output parameters) and `bpmn/parser/BpmnParse.java:4803-4814` (an Activity with `camunda:inputOutput` becomes a scope); the retained answer of [card-declined-reaches-the-transaction-boundary](../scenarios/open-rows/journey-booking-recovery/README.md) (profile `cibseven-2.2.0`, Verify run 43370273960), whose state after `s04-card-declined` and every later state hold `bookingDecision` in CIB and not in the kernel, while every command outcome and open wait agree.

**Boundary:** Activities with `camunda:inputOutput` output parameters that an interrupting Error boundary removes with its host, other than the thrower and the host CIB-EXT-0016 covers; this entry owns that witness in the ledger. The same `deleteCascade` removes the region of every interrupting boundary and an interrupting Event Sub-Process's `clearScope` removes its scope's children (**H**: no retained witness separates those triggers yet). The Sub-Processes an Error leaves between its thrower and the catching host are the same mechanism, which CIB-EXT-0016 excludes from its claim. A Call's `camunda:out` does not run there (`ExecutionEntity.java:523-525` runs only `camunda:inputOutput`). No profile selects CIB's writes: an output mapping of an Activity that does not complete has no BPMN reading, and CIB differences are classified, not imitated (root decision 2026-11-13).

## Extension register

### CIB-LIM-0025 — CIB admits two interrupting Error Event Sub-Processes of one code in one scope

**Status:** Profile limitation; not a deviation

BPMN 2.0.2 §10.5.6 requires that "only one Event Sub-Process for the same Event Declaration MUST be modeled" for an interrupting Event. CIB Seven `2.2.0` adds each Error Event Sub-Process start to its scope's Error declarations and sorts them by precedence without a duplicate check (`BpmnParse.java:3645-3650`), so two interrupting handlers of one code deploy and the first in document order catches. The kernel refuses the model under every profile (`scope.eventSubProcess.errorDuplicateCode`), as it refuses the boundary analog (`boundary.error.duplicateCode`); two catch-all handlers stay admitted and catch in document order (`CIB-INT-0010`).

**Evidence:** Pinned `BpmnParse.java:3645-3650`; the retained [duplicate-code-handlers](../scenarios/open-rows/error-event-subprocess-precedence/README.md) witness deploys and commits in CIB Seven `2.2.0`.

**Boundary:** Interrupting Error Event Sub-Processes of one scope that name one code. Under the standards profile the same model is refused earlier, since the standards reading refuses an interrupting Event Sub-Process's abnormal scope end (`CIB-INT-0007`).

### CIB-EXT-0001 — exact delegate-expression Service Task binding

**Status:** Selected bounded extension

The Service Task effect profile admits exactly the paired standard protocol URI `urn:bpmn-lean:effect:probe-v1`, Camunda-namespace `delegateExpression="${bpmnLeanEffectHandler}"`, and Camunda-namespace `asyncBefore="true"` attributes. CIB Seven resolves the exact bean token and creates one durable async-before continuation job. The lexical XML prefix is irrelevant; both extension attributes are identified by expanded namespace name.

The selected extension is a host realization, not an independent derivation of the project's activated effect intent. CIB exposes a pre-activation continuation wait followed by atomic delegate invocation and Service Task completion. The project adapter maps that wait to the one bounded semantic effect occurrence and descriptor, with activation ordinal `1` decided from the required singleton job count.

**Evidence:** [Service Task effect scenario](../scenarios/service-task-effect/README.md), [packaged-engine phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskPhaseZeroProbeTest.java), [immutable profile](../profiles/cibseven-2.2.0/README.md), and content-bound retained evidence produced only by the explicit replacement command.

**Boundary:** This entry claims no general JUEL, arbitrary bean, Java class, `JavaDelegate`, `DelegateExecution`, field injection, listener, variable, service-fault, incident, external-task, or Process Engine API compatibility. It excludes a visible variable named like the token, which CIB resolves before the bean (CIB-LIM-0017).

### CIB-EXT-0002 — exact A12 CreateDocument delegate and input/output mapping

**Status:** Retired with its per-variant profile at the profile consolidation (#42); no current profile selects it

The A12 CreateDocument profile admits exactly `{http://camunda.org/schema/1.0/bpmn}delegateExpression="${createDocumentDelegate}"`, one `camunda:inputOutput` element, literal input parameter `documentModelName = "MyDocumentModel"`, and output parameter `myDocumentReference = ${newDocRef}`. The project profile supplies protocol identity `urn:bpmn-lean:a12-delegate:v1`; that URI is not read from the maintained BPMN source.

CIB Seven `2.0.0` resolves the exact bean token, provides the mapped literal to the delegate, reads the delegate-written Activity-local `newDocRef`, and maps it into Process variable `myDocumentReference`. The selected extension is lexical and behavioral only for this one string-valued successful path. The token is not evaluated as a general JUEL expression by the project.

**Evidence:** [CreateDocument specification](kernel/semantics/DATA-SEMANTICS-SPEC.md), [CIB Seven 2.0 target assessment](research/CIB-SEVEN-A12-BASELINE-RESEARCH.md), [frozen A12 target profile](../adoption/a12/legacy/source-tree/profiles/cibseven-2.0.0-a12-create-document-draft/README.md), [frozen packaged-engine runner test](../adoption/a12/legacy/source-tree/runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenCreateDocumentScenarioRunnerTest.java), the frozen project-authored equivalent fixture and content-bound `2.0.0` evidence, and the optional unchanged-source gate.

**Boundary:** This entry claims no general input/output mapping, expression language, arbitrary variable, bean, delegate, `DelegateExecution`, Java binary, failure, transaction rollback, Script Task, listener, or engine-API compatibility.

### CIB-EXT-0003 — exact deferred delegate expression and typed Java BPMN Error

**Status:** Retired with its per-variant profile at the profile consolidation (#42); no current profile selects it

The boundary-error profile admits exactly `{http://camunda.org/schema/1.0/bpmn}delegateExpression="#{createRelationshipLinkDelegate}"` and maps that deferred-expression token to project handler identity `createRelationshipLinkDelegate`. The project rejects the `${...}` spelling for this profile and does not evaluate either form as general JUEL.

CIB Seven `2.0.0` resolves the exact bean and permits the delegate to throw `BpmnError` with non-empty code `LinkLimitReachedError` and either no message or the reviewed non-empty message. The project Worker-facing result is a language-neutral typed value rather than a Java exception; Java `BpmnError`, bean lookup, and `DelegateExecution` remain host-extension mechanisms.

**Evidence:** [Boundary-error specification](kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md), [frozen packaged-engine phase-zero probe](../adoption/a12/legacy/source-tree/runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBoundaryErrorPhaseZeroProbeTest.java), and the frozen project-authored fixture.

**Boundary:** This entry claims no general immediate/deferred JUEL equivalence, arbitrary bean, Java delegate binary compatibility, general `DelegateExecution`, Process-scope writes, error-variable extensions, or other Error codes.

### CIB-EXT-0004 — caught-Error output mapping before Activity cleanup

**Status:** Selected profile-scoped extension and visible candidate deviation from the BPMN-only cancellation account

CIB Seven `2.0.0` executes the attached Service Task's Camunda output parameters during `ExecutionEntity.destroy(false)` on the matching interrupting Error path, before clearing Activity-local state. A pre-error local sentinel therefore becomes Process `relationshipLinkId = "must-not-map"`; the target-shaped local null creates a present null-valued Process variable before the boundary User Task is exposed.

**BPMN boundary:** BPMN 2.0.2 specifies interrupting Error handling and cancellation but does not define Camunda input/output extension execution during that cancellation. The capsule's BPMN-only reading would abandon normal Activity output. This entry is therefore not `CIB-AGR-0005` and is not evidence that general BPMN requires fault-path output mapping. It remains visibly candidate-deviating from that cancellation reading until a broader normative review warrants a different classification.

**Profile decision and rationale:** The owner selected the CIB behavior only for the A12 migration profile on 2026-07-27. The target delegate writes Activity-local `newLinkId = null` on both reviewed Error branches, CIB distinguishes an absent identifier from present null, and suppressing the mapping would bake a known target incompatibility into the profile. The Worker reports only the validated pre-error Activity-local patch; the semantic program remains mapping authority. The project transition is atomic patch → mapping → cleanup → boundary.

**Evidence and independence limit:** The [frozen packaged-engine phase-zero probe](../adoption/a12/legacy/source-tree/runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBoundaryErrorPhaseZeroProbeTest.java) establishes sentinel and null behavior and the pinned engine source explains the mechanism. Because CIB supplies the selected account, CIB agreement cannot count as independent corroboration for `BERROR-CIBMAP-01`; independent evidence is limited to strict negative witnesses and the separate Lean/TypeScript transcriptions, with Temporal refinement over the TypeScript core.

**Boundary:** Delegate-side Process-scope writes, arbitrary mappings, mapping expressions beyond the one simple local reference, other value kinds, listeners, nested scopes, general fault propagation, and a BPMN-conformant profile remain excluded. A BPMN-only profile may drop this extension without changing `BERROR-INTERRUPT-01`.

### CIB-EXT-0005 — public User Task completion installs submitted Process variables

**Status:** Selected bounded extension

CIB Seven `2.2.0` exposes current Process variables through `TaskService.getVariables(taskId)` and accepts a variable map through `TaskService.complete(taskId, variables)`. In the project-owned two-User-Task probe, completion creates an absent string binding, overwrites an existing string binding, preserves an unrelated binding, and creates a present null-valued binding. The following User Task observes the complete merged Process map in the same public command outcome, and audit history retains the same map after final Process completion. The no-data completion overload preserves the existing Process variables.

This is a CIB public-service extension over the BPMN User Task lifecycle, not general BPMN data-association or form meaning. The selected project profile maps one canonical string/null `submittedValues` patch to the same atomic merge-before-continuation behavior. Unknown and already completed generated task IDs throw `ProcessEngineException`; the probe observes the live Process variables and active task unchanged after each refusal. The project still maps its semantic occurrence identity separately under `CIB-OP-0001`.

**Evidence:** The Java-21 [packaged-engine phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskCompletionDataPhaseZeroProbeTest.java) uses the pinned CIB BPMN Model API to build the exact two-task control, records public task-service maps, runtime variables, final historic variables, active task keys, and Process liveness, and runs under `CIB-CFG-0001`. The [User Task completion-data specification](kernel/semantics/DATA-SEMANTICS-SPEC.md) owns the selected project rules and refinement boundary.

**Boundary:** Under `installsVariables` a mapped User Task's completion installs every submitted value from the task's own scope occurrence outward, at the nearest owner or else the instance root, before its output parameters and before its outgoing conditions (`review-output-order`; the kernel's `Feature.Work.completeUserTask`). Only Process-scope string and explicit null values, one exact active task, create/overwrite/preserve merge, no-data preservation, continuation visibility, final-history visibility, and unknown/stale refusal are selected. A User Task instance of a Multi-Instance loop without an output data item installs its submission the same way, from the instance's task, through the instance's execution (`CompleteTaskCmd.java:71`, `TaskEntity.java:869-873`; `body-metadata`, `items-*-unmapped`). A submitted name equal to a loop counter is `unsupported` (`multiInstance.resultShadowsInstance`). A name the task holds as a local input stays local and ends with the task (`work-user-task-completion`). Transient variables, deletion, nested or serialized values, BPMN input/output specifications and Data Associations, forms, field validation, variable authorization, people assignment, and general Task Service compatibility remain excluded. Under the embedded completion profile, in data-bearing Programs, a completion patch writes each name to its nearest declaring frame on the task's occurrence chain or to the Process, and a name outside the declaring frames is refused ([concurrent scope data](kernel/semantics/DATA-SEMANTICS-SPEC.md)).

Under this extension a User Task completion is not checked against the task's form fields or output mappings: `TaskService.complete` sets the submitted map on the task's execution (`CompleteTaskCmd.java:70-72`) without the form handler that `FormService.submitTaskForm` runs (`SubmitTaskFormCmd.java:75`). An extra result is installed, a missing result leaves the outputs reading the task's local input (CIB-EXT-0031), and a type-invalid result is installed as given; CIB and the kernel commit each (`claim-extra-result`, `claim-missing-result`, `claim-type-invalid-result`). A missing or extra result refuses unchanged only under the standards reading (`SubmissionRule.outputSet`, BPMN 2.0.2 §10.4.1: `undeclared-output`, `output-unavailable`). A form field type is published metadata under every profile, so a type-invalid result commits under both.

### CIB-EXT-0006 — public Process start installs initial Process variables

**Status:** Selected bounded extension

CIB Seven `2.2.0` accepts a variable map through `RuntimeService.startProcessInstanceByKey(processDefinitionKey, variables)`. In the project-owned two-User-Task probe, the first active User Task reads the exact initial string map before any task-completion call. The no-data and completion controls retain those bindings until explicitly overwritten, and final history preserves the resulting Process map.

This is a CIB public-service extension over Process instantiation, not general BPMN data initialization, Data Association, or form meaning. The selected project profile maps one canonical string/null `initialVariables` list to fresh Process scope before internal start closure. A rejected semantic start installs no supplied value and creates no Temporal Workflow.

**Evidence:** The Java-21 [packaged-engine phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskCompletionDataPhaseZeroProbeTest.java) supplies the initial map through the public Runtime Service and reads it through the first task before completion under `CIB-CFG-0001`. The ordinary retained sequential scenarios now carry content-bound initial data through the Java runner. The [Process-start data specification](kernel/semantics/DATA-SEMANTICS-SPEC.md) owns the selected project rules and refinement boundary.

**Boundary:** Only a fresh private executable Process, canonical Process-scope string and explicit null values, visibility at the first stable wait, empty-list preservation, and exact semantic-start refusal are selected. Business keys, case instances, tenant IDs, named start events, start messages, transient or local variables, nested or serialized values, BPMN Properties and Data Associations, forms, variable authorization, and general Runtime Service compatibility remain excluded. Under the embedded completion profile, in data-bearing Programs without a Call, Start installs every required name and any admitted name as a String of at most 1,024 UTF-8 bytes or a present null ([concurrent scope data](kernel/semantics/DATA-SEMANTICS-SPEC.md)).

### CIB-EXT-0007 - bounded mapped-success Service Task input and output mapping

**Status:** Selected bounded extension

The product-neutral mapped-success profile admits exactly one Activity binding, one literal `requestValue = "example-input"` input parameter, and one `resultValue = ${result}` output parameter. CIB Seven `2.0.0` resolves the exact profile-owned binding, provides the mapped literal to the test delegate, reads the delegate-written Activity-local `result`, and maps it into Process variable `resultValue`. The CIB Seven `2.0.0` profiles retired into the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/README.md) at the profile consolidation (#42), and their evidence is regenerated on `2.2.0` in the hosted lane.

**Evidence:** [Mapped-success scenario](../scenarios/mapped-success-service-task/README.md), [content-bound CIB evidence](../scenarios/mapped-success-service-task/cibseven-evidence.json), scenario runner test (`CibSevenMappedSuccessScenarioRunnerTest`, removed at W0.3b), and [product-neutral profile](../profiles/cibseven-2.2.0/README.md).

**Boundary:** This selects one successful string-valued path. It does not select general input/output mapping, expression evaluation, arbitrary variables, beans, delegates, Java compatibility, failure, rollback, scripts, listeners, or engine APIs. It excludes a visible variable named like the token, which CIB resolves before the bean (CIB-LIM-0017).

### CIB-EXT-0008 - bounded mapped-boundary Service Task binding and typed BPMN Error

**Status:** Selected bounded extension

The product-neutral mapped-boundary profile admits exactly one Activity binding and maps the Worker-facing typed result to a CIB `BpmnError` carrying nonempty code `MappedBusinessError` and the reviewed message. The project result remains a language-neutral value; Java exception transport and bean resolution are CIB host mechanisms. The CIB Seven `2.0.0` profiles retired into the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/README.md) at the profile consolidation (#42), and their evidence is regenerated on `2.2.0` in the hosted lane.

**Evidence:** [Mapped-boundary-Error scenario](../scenarios/mapped-boundary-error-service-task/README.md), [content-bound CIB evidence](../scenarios/mapped-boundary-error-service-task/cibseven-evidence.json), scenario runner test (`CibSevenMappedBoundaryErrorScenarioRunnerTest`, removed at W0.3b), and [product-neutral profile](../profiles/cibseven-2.2.0/README.md).

**Boundary:** This selects one exact handler token and one Error code. It does not select arbitrary expressions, handlers, Java delegate compatibility, Process-scope Worker writes, technical failures as business Errors, or other Error codes. It excludes a visible variable named like the token, which CIB resolves before the bean (CIB-LIM-0017).

### CIB-EXT-0009 - bounded caught-Error output mapping before Activity cleanup

**Status:** Selected profile-scoped extension

CIB Seven `2.0.0` applies the selected `resultValue = ${result}` output parameter on the matching interrupting Error path before clearing Activity-local state. The reviewed null patch therefore creates a present null-valued Process variable before `ReviewMappedError` is exposed. The project semantic program remains mapping authority and applies patch, mapping, cleanup, and boundary routing atomically.

**Evidence:** [Mapped-boundary-Error scenario](../scenarios/mapped-boundary-error-service-task/README.md), [content-bound CIB evidence](../scenarios/mapped-boundary-error-service-task/cibseven-evidence.json), scenario runner test (`CibSevenMappedBoundaryErrorScenarioRunnerTest`, removed at W0.3b), and [product-neutral profile](../profiles/cibseven-2.2.0/README.md).

**Boundary:** BPMN does not define this extension mapping during cancellation. Arbitrary mappings, expressions beyond one local reference, value kinds beyond string/null, nested scopes, general fault propagation, and a broader cancellation claim remain excluded.

### CIB-EXT-0010 — public User Task completion preserves a Boolean Process variable

**Status:** Selected bounded extension; registered, evidence-closed, and independently closure-reviewed

CIB Seven `2.2.0` accepts a Java `Boolean` in the public variable map supplied to `TaskService.complete(taskId, variables)`. In the project-owned two-User-Task probe, completing the first task with `Boolean.TRUE` exposes the same `java.lang.Boolean` through the next task's variables and Runtime Service variables, and final audit history retains it after Process completion. The probe rejects string `"true"` as an equivalent observation and confirms unknown and stale task IDs preserve the complete live state.

This is an additional CIB public-service extension over the BPMN User Task lifecycle, not general BPMN data-association, form, or variable-type meaning. The registered project profile maps one exact tagged Boolean completion value to the existing atomic merge-before-continuation behavior while retaining string/null Process Start and refusing Boolean under every old profile and non-selected surface. Its answer-free scenario, retained CIB evidence, Lean/core/differential execution, runnable example, and live Temporal witness are complete.

**Evidence:** The Java-21 [Boolean phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBooleanProcessDataPhaseZeroProbeTest.java) uses pinned CIB Seven `2.2.0`, the public Model API, Task Service, Runtime Service, and History Service under `CIB-CFG-0001`. The [Boolean Process-data specification](kernel/semantics/DATA-SEMANTICS-SPEC.md) owns the selected project rules, profile gate, Lean question, and Temporal account. The [registered scenario](../scenarios/user-task-boolean-completion/scenario.json) and [retained evidence](../scenarios/user-task-boolean-completion/cibseven-evidence.json) bind the actual Java Boolean observation to the same answer-free target that Lean, the independent core, differential comparison, and Temporal consume. The checkpoint CIB test (`CibSevenBooleanProcessDataCheckpointTest`, removed at W0.3b) separately locks the project representation, value-domain admission, actual Java Boolean projection, and old-profile refusal.

**Boundary:** Only primitive Java Boolean on one exact active User Task completion, Process-scope create/replace/preserve merge, continuation visibility, final-history visibility, and unknown/stale refusal are selected. Boolean Process Start, task-local/transient data, nested or serialized values, numbers, deletion, BPMN input/output specifications and Data Associations, forms, field validation, authorization, assignment, expression evaluation, effects, multiple active dummy tasks, and general Task Service compatibility remain excluded. Existing `CIB-EXT-0005` and `CIB-EXT-0006` remain frozen to string/null values.

### CIB-EXT-0011: one literal candidate group on a User Task

**Status:** Selected bounded extension; registered and evidence-closed

CIB Seven `2.2.0` consumes the exact foreign attribute `{http://camunda.org/schema/1.0/bpmn}candidateGroups` on a User Task and exposes each resolved group through public Task Service candidate identity links. The selected project profile restricts this broader CIB surface to one nonempty literal group ID with no boundary code point from the proposal's explicit profile boundary-space set, refuses rather than normalizes boundary space, comma lists, and expressions, and projects one neutral group candidate into the existing open User Task. A leading or trailing U+00A0 is the non-ASCII separating control.

This is a CIB source and public-service extension, not the standard Potential Owner account. BPMN Resource Roles permit a Resource reference or assignment expression, but neither the normative representation nor the selected phase-zero observation identifies a portable literal group ID. A standard `potentialOwner` naming a Resource with the same human-readable value produces no CIB candidate identity link and remains deferred.

**Evidence:** The [assignment/form phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskAssignmentFormMetadataPhaseZeroProbeTest.java) uses pinned CIB Seven `2.2.0`, public Model API, Task Service task queries, and public identity-link queries under `CIB-CFG-0001`. It distinguishes the selected literal group from a changed group, CIB's comma-list expansion, CIB expression evaluation, a foreign-namespace twin, and a standard Potential Owner Resource reference. The [registered scenario](../scenarios/user-task-assignment-form-metadata/scenario.json), [retained evidence](../scenarios/user-task-assignment-form-metadata/cibseven-evidence.json), and checkpoint test (`CibSevenUserTaskMetadataCheckpointTest`, removed at W0.3b) bind the public-service facts to the neutral projection. The [User Task assignment and form metadata specification](kernel/semantics/WORK-SEMANTICS-SPEC.md) owns the selected projection and exclusions.

**Boundary:** One exact literal candidate group on one User Task is selected. Candidate users, multiple groups, expressions, assignee, owner, claim, release, identity lookup, authorization, organization semantics, Resource Roles, Human Performer, Potential Owner, Lane inference, due dates, follow-up dates, priority, notifications, and general Task Service compatibility remain excluded.

### CIB-EXT-0012: one typed generated-form field on a User Task

**Status:** Selected bounded extension; registered and evidence-closed

CIB Seven `2.2.0` consumes one exact `{http://camunda.org/schema/1.0/bpmn}formData` container with one `{http://camunda.org/schema/1.0/bpmn}formField`, and public Form Service exposes the field's unqualified `id` plus exact `string` or `boolean` type. Completing the task through public Task Service with a Java Boolean remains the separately selected `CIB-EXT-0010` value fact.

This is a CIB generated-form extension, not standard BPMN rendering content. BPMN Table 10.13 and the normative Rendering type define an opaque extension hook but no portable field identity, field type, rendering, validation, or submission mapping. The selected project profile therefore projects only neutral immutable field metadata and does not claim a form engine.

**Evidence:** The [assignment/form phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskAssignmentFormMetadataPhaseZeroProbeTest.java) uses public Model API and Form Service, proves alternate-prefix namespace identity, distinguishes `boolean` from `string`, and completes the selected task with an actual Java Boolean. The [registered scenario](../scenarios/user-task-assignment-form-metadata/scenario.json), [retained evidence](../scenarios/user-task-assignment-form-metadata/cibseven-evidence.json), and checkpoint test (`CibSevenUserTaskMetadataCheckpointTest`, removed at W0.3b) independently retain exact Form Service field ID and type-name facts. The [User Task assignment and form metadata specification](kernel/semantics/WORK-SEMANTICS-SPEC.md) owns the exact source shape, public projection, and Temporal account.

**Boundary:** One exact field with one nonempty key having no boundary code point from the proposal's explicit profile boundary-space set and type `string` or `boolean` is selected. Boundary space is refused without normalization; leading or trailing U+00A0 is the non-ASCII control. Multiple fields, labels, defaults, constraints, properties, scripts, form keys, rendering, submission mapping, field validation, task-local data, new value kinds, standard Rendering, WSHumanTask, and general Form Service compatibility remain excluded.

### CIB-EXT-0013: failed-job Service Task incident and retry

**Status:** Selected bounded extension; implemented and evidence-closed

CIB Seven `2.2.0` decrements the selected async-before Service Task job after failed public execution, creates one `failedJob` incident when retries reach zero, and removes that incident when public Management Service resets the same job to a positive retry count. The registered project profile restricts this operational surface to one exact Service Task effect, one payload-free technical failure, one public incident kind, and one retry that reopens the same semantic effect occurrence.

This is a CIB job-management extension, not general BPMN service-fault meaning. BPMN 2.0.2 does not define engine job retry counts, failed-job incidents, Management Service retry reset, or incident identity. The project therefore names the public semantic fact `effectExecutionFailed` and does not expose CIB job or incident IDs, retry count, exception details, or administrative retry policy.

**Evidence:** The [packaged-engine phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskIncidentPhaseZeroProbeTest.java) uses the exact selected Service Task source, public job execution, public incident query, and public retry reset. Under `createIncidentOnFailedJobEnabled = true`, it proves `3 -> 2 -> 1 -> 0`, one self-rooted public `failedJob` incident configured by the same job, incident removal after reset to one retry, replacement by a new raw incident after another failure, and later success through the same job and Process. The disabled-setting control reaches retries zero with no incident. The [registered profile](../profiles/cibseven-2.2.0/profile.json), [retained evidence](../scenarios/service-task-incident/cibseven-evidence.json), incident runner test (`CibSevenIncidentRunnerTest`, removed at W0.3b), and schedule-alignment test (`CibSevenIncidentScheduleAlignmentTest`, removed at W0.3b) bind the selected first literal-generation incident and one retry; the later raw incident remains research evidence outside its canonical mapping. The [Service Task incident capsule](kernel/semantics/WORK-SEMANTICS-SPEC.md) owns that boundary.

**Boundary:** One failed async-before job, one `failedJob` incident, one public retry reset, same job and Process retention, literal generation 1, and later success are selected. A retried incident whose job fails again opens the next incident generation (`failures + 1`) on the same occurrence ([automation-incident-composition](../scenarios/open-rows/automation-incident-composition/README.md)). General incidents, further retry cycles, backoff, due dates, incident messages, job deletion, batch retry, arbitrary Management Service operations, external tasks, Process cancellation, BPMN Error, compensation, and production operator UI remain excluded.

### CIB-EXT-0014: public external deletion of one incident-bearing root Process

**Status:** Selected bounded extension; implemented and evidence-closed

CIB Seven `2.2.0` accepts public `RuntimeService.deleteProcessInstance(processInstanceId, reason, false, true)` for the root Process retained by the selected failed-job incident. The operation removes the live Process, job, incident, execution, and task region and records the historic root as `EXTERNALLY_TERMINATED`. A committed Process variable remains readable through public History Service after deletion.

This is a CIB public lifecycle extension beyond bare BPMN Process execution. BPMN 2.0.2 does not define an incident-addressed external root-deletion API, delete reason, or externally terminated historic-state code. The project profile maps one exact published generation-1 incident and root semantic Process identity to a typed cancelled terminal state without exposing CIB identity or making runtime absence sufficient evidence.

**Evidence:** The [Service Task incident phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskIncidentPhaseZeroProbeTest.java) starts the exact selected Process with one string variable, drives the configured job to one `failedJob` incident, invokes the public deletion operation, and checks zero live Process/job/incident/execution/task state, historic `EXTERNALLY_TERMINATED`, and the preserved historic variable. Its successful control separately requires historic `COMPLETED`. The [registered successor profile](../profiles/cibseven-2.2.0/profile.json), [retained evidence](../scenarios/service-task-incident-cancellation/cibseven-evidence.json), cancellation runner test (`CibSevenIncidentCancellationRunnerTest`, removed at W0.3b), and [incident-scoped Process cancellation specification](kernel/semantics/WORK-SEMANTICS-SPEC.md) bind the project command, typed state, cleanup, historic-state discriminator, and evidence boundary.

**Boundary:** Only the exact incident-bearing root Process, one exact public deletion call, which for an incident inside a called instance deletes the root with every called instance (`called-incident-cancel`), cascade cleanup, externally terminated history, and one retained string Process variable are selected. Arbitrary Process deletion, nested-scope cancellation, deletion reason, listener or I/O-mapping policy, compensation, Transaction Cancel, modeled Terminate, batch deletion, process modification, suspension, activation, restart, job deletion, Product 2 authorization, and general Runtime Service compatibility remain excluded.

### Research queue

| Hint | Status | Required investigation |
|---|---|---|
| Java class, delegate-expression, expression, field-injection, and bean execution | Family inventoried in [CIB Seven extension research](research/CIB-SEVEN-EXTENSIONS-RESEARCH.md); first read-only condition slice classified by `CIB-AGR-0006`, `CIB-INT-0001`, `CIB-OP-0004`, and `CIB-CFG-0005` | Keep project handler binding, Java class loading, dependency injection, `JavaDelegate`, `DelegateExecution`, bean/method capability, mutation, engine services, and every expression context beyond the selected root-variable slice separate. |
| Script Task and script-bearing extensions | Family inventoried; disposition pending | Separate read-only JUEL, variable mutation, capability-bearing expressions, effectful scripts, and versioned engine-compatible scripts. Pin language, runtime, security, variables, results, limits, and dependencies before selection. |
| FEEL | Not selected as a substitute for the target JUEL surface | The pinned CIB FEEL integrations belong to DMN. Reopen only for a concrete DMN or explicitly FEEL-declared consumer with its own pinned runtime, result mapping, and CIB calibration. |
| External-task execution associated with a BPMN Service Task | Deferred alternative; not an adopted extension record | Reopen only for a concrete consumer of the topic, fetch-and-lock, lease, completion, failure, retry, and incident protocol. |

The research queue is not evidence and does not authorize implementation. It prevents a useful extension candidate from being conflated with a deviation or silently entering the semantic core.

### CIB-EXT-0015 — serial business-task enclosing inputs and local results

**Status:** Selected bounded extension under the approved [serial business-task account](kernel/semantics/DATA-SEMANTICS-SPEC.md), listed by the [cibseven-2.2.0 profile](../profiles/cibseven-2.2.0/profile.json). Its Multi-Instance instance clause (root decisions 2026-11-10) is implemented as `ProfileOptions.effectResultValues = activityLocals` and agrees with the retained [Multi-Instance Service Task witnesses](../scenarios/open-rows/multi-instance-service-task/README.md); the serial business-task clauses keep their open profile evidence.

CIB Seven `2.2.0` input parameters evaluate against the enclosing scope before writing Activity-local inputs. Output parameters evaluate against the Activity scope; a local result takes precedence over a same-named parent value. The CIB runner's delegate writes every result value with `setVariableLocal` on its execution (`CibSevenScriptedEffect.java:165`). For an inner instance of a Multi-Instance Activity that execution is the instance's own, so a value no output mapping consumes ends with the instance; the kernel selects that under `ResultValues.activityLocals` for Multi-Instance instance effects only (`Work.unconsumed`). Every other effect result keeps the standards reading `outputSet`, rejecting such a value as `undeclared-output` because BPMN 2.0.2 §10.4.1 makes the result the Activity's OutputSet (`Work.outputs`): CIB makes a Service Task a scope only for `camunda:inputOutput` on an Activity that is no Multi-Instance inner Activity (`BpmnParse.java:4797-4814`) or for a non-compensation boundary (`BpmnParse.java:3297`), so on a non-scope task the local lands on the flow execution, which continues past the task and, in a single-path root, persists as a Process variable. The selected account admits only its explicit scalar literal/reference subset, unambiguous named delegate bindings and exact supplied output sources. Its identifier, reserved-name, initialization and result-patch restrictions are project admission decisions, not general CIB behavior.

**Evidence:** The [phase-zero experiment](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/experiments/BUSINESS-EFFECT-DATA-EXPERIMENT.md) and [public-service probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBusinessEffectDataPhaseZeroProbeTest.java) separate both input declaration orders, present null, missing-input failure before invocation, local output precedence and Process-instance separation. [Artifact-verifier coverage](../scripts/contract-artifact-projections.test.ts) requires this registered relationship and rejects a profile reference when its registry entry is absent. Full profile equivalence and retained scenario evidence remain unestablished.

**Boundary:** The discarded-local clause covers the effect results of a task CIB makes a scope, a Multi-Instance instance or a task with `ioParameter` mappings (`BpmnParse.java:4797-4814`), on the success and mapped Error arms (the [Multi-Instance Service Task witnesses](../scenarios/open-rows/multi-instance-service-task/README.md) and `send-result-with-output`); a task without either keeps the OutputSet reading, and a User Task submission keeps `SubmissionRule`. No general JUEL, bean/Java API compatibility, nested mapping, parent-output fallback or technical-failure equivalence is claimed; concurrent continuations are classified by [`CIB-OP-0010`](#cib-op-0010-concurrent-async-before-service-task-continuations-mapped-to-concurrent-effect-occurrences). CIB's async-before job precedes invocation; the project's committed argument snapshot and durable external-effect interval remain its own operational realization. Input/final-output comparisons do not establish equivalent transaction timing or exactly-once external effects. Under the embedded completion profile only the binding clause applies to data-free Programs, whose overlay-bound Service Tasks have no input or output mappings ([concurrent scope Service Tasks](kernel/semantics/WORK-SEMANTICS-SPEC.md)); in data-bearing Programs of that profile the input and output mapping clauses also apply, with exact `${name}` sources resolved over the occurrence chain ([concurrent scope data](kernel/semantics/DATA-SEMANTICS-SPEC.md)). The same snapshot realization covers the nested scope-data profile's concurrent data-bearing effects, which CIB evaluates only when the continuation job runs; when a sibling command commits a write before that job runs, a CIB delegate reads the newer value and the project's snapshot does not, and no argument agreement is claimed for that schedule ([concurrent structured scope data](kernel/semantics/DATA-SEMANTICS-SPEC.md)).

### CIB-EXT-0016 — CIB7 2.2.0 caught-business-Error output mapping

**Status:** Selected bounded extension under the approved [mixed-task business Error account](kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md); implementation and profile qualification remain open.

CIB Seven `2.2.0` applies the attached Service Task's output parameters on the matching Error path before Activity-local cleanup. A local result shadows a same-named parent, including present null. Without a local result, lookup may inherit the parent; with no binding in either scope, mapping fails and rolls back the asynchronous job command before recovery work commits. The selected project account requires complete explicit local results on both result arms, selecting local precedence but excluding fallback and missing-result execution.

**BPMN boundary:** Bare BPMN does not define the CIB `inputOutput` extension during cancellation. This is an extension over the normative interrupting catch, not a claim that BPMN requires fault-path output mediation. The project retains typed `bpmnError` as an Activity result; CIB's Java exception and same-command transaction are host mechanisms.

**Evidence:** The [business-failure experiment](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/experiments/BUSINESS-EFFECT-DATA-EXPERIMENT.md#business-failure-follow-up), its [public-service probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBusinessFailurePhaseZeroProbeTest.java), pristine `ExecutionEntity.destroy`/`IoParameter.execute`/`OutputParameter.execute` source, and [artifact reference verification](../scripts/contract-artifact-projections.test.ts). CIB supplies this mapping account and cannot also count as independent corroboration of it.

Two widenings from the PC-ERROR-01 witnesses (CIB Seven `2.2.0`, 2026-11-09). The Service Task's output parameters also run when no catcher takes the Error and only its path ends (`CIB-INT-0013`; [scope-unmatched-code](../scenarios/open-rows/automation-business-error-routing/README.md), [parallel-root-branch-with-outputs](../scenarios/open-rows/error-unhandled-outcomes/README.md)). A Sub-Process that an Error boundary of its own interrupts runs its output parameters as CIB destroys it, after the catch variables of `CIB-EXT-0028`, so on a shared name the output wins ([output-shadow-caught](../scenarios/open-rows/error-esp-catch-variables/README.md)); the kernel's `Propagation.interruptedOutputs` writes them from the Sub-Process outward under `ErrorPathOutputs.mapped`.

A widening from PC-ESCALATION-03 (2026-11-10): a Sub-Process that an interrupting Escalation boundary of its own interrupts runs its output parameters in the same way, after the Escalation code variable, since `deleteCascade` destroys the host either way (`PvmAtomicOperationCancelActivity.java:60`, `ExecutionEntity.java:523-525`). Only `camunda:inputOutput` output parameters run there, never a Call's `camunda:out`. The kernel test `a Sub-Process an interrupting Escalation boundary interrupts maps its outputs after the code variable` covers it; the retained witness is owed.

A widening from PC-ERROR-03 (2026-11-10): a Service Task whose business Error a catcher outside it takes, or no catcher takes, runs its output parameters only once the search has decided. CIB's walk starts at the task's own execution, a scope since the task has output parameters (`BpmnParse.java:4803-4814`), and destroys it when the catcher starts or the path ends (`BpmnExceptionHandler.java:97-155`), so the writes run in this order: each Call output pass at a called root the walk visits, innermost first (`CIB-EXT-0034`); the catcher's code and message variables (`CIB-EXT-0028`); the task's output parameters; the interrupted host's output parameters; then the catcher begins. Uncaught, the passes precede the task's output parameters. A boundary's `deleteCascade` destroys the task before its host (`PvmAtomicOperationDeleteCascade.java:37-66`); an interrupting Event Sub-Process's `clearScope` destroys it with its event scope's other children and runs no host outputs (`PvmAtomicOperationInterruptScope.java:30-48`, `PvmExecutionImpl.java:345-359`). Every error-path output run rests on `skipOutputMappingOnCanceledActivities = false`, CIB Seven `2.2.0`'s default (`ProcessEngineConfiguration.java:418`, read at `PvmAtomicOperationDeleteCascadeFireActivityEnd.java:83-89`), which the profile environment states as configuration. The kernel's `Propagation.hostLeaves` lets the task leave at that point, and the host's outputs read the task's written outputs. Retained witnesses: [error-called-child](../scenarios/open-rows/error-called-child/README.md) `finance-rejected`, `finance-rejected-compliance-approved` and [error-called-child-error-data](../scenarios/open-rows/error-called-child-error-data/README.md) `child-failure-code-and-message` agree (CIB Seven `2.2.0`); the retained [error-thrower-leave](../scenarios/open-rows/error-thrower-leave/README.md) witnesses agree (CIB Seven `2.2.0`).

**Boundary:** String/null results and declared scalar mappings only; no arbitrary JUEL, Java binary compatibility, Process-side delegate writes, missing-local fallback, retry equivalence or exactly-once external effects. The outputs of a Multi-Instance instance's inner Activity, which CIB makes no scope (`BpmnParse.java:4803-4814`), on an Error a catcher outside it takes are outside the claim. Of nested scopes only the interrupted host Sub-Process is covered: Sub-Processes the Error leaves between its thrower and the catching host, which CIB also destroys, run no output parameters in the kernel and are outside the claim. The unmatched Error's root-cleanup rollback is `CIB-LIM-0006`, not adopted semantics or a new BPMN deviation claim. Existing `2.0.0` records and profiles remain unchanged.

### CIB-EXT-0017 — repeated Sub-Process body-local mapping and enclosing writes

**Status:** Candidate bounded extension, owned by PC-MI-10. The body-local initialization from the looping Activity's own input mappings runs under `CIB-INT-0014`'s binding, and the retained [sequential-post-disposal-condition](../scenarios/open-rows/multi-instance-sub-process/README.md) answer (CIB Seven `2.2.0`) agrees with it, a completed body's locals reset for the next; the enclosing-write clauses stay refused (`multiInstance.mappings`, `multiInstance.instanceResult`), so no profile selects this entry.

CIB input parameters initialize local bindings in each new body. Human completion updates the nearest existing binding, while a Service output parameter evaluates its Activity-local result and writes through the enclosing scope. Declared body locals shadow parent variables, including present null. With those declarations absent, the same writes reach the existing Process variables. Body disposal removes locals and the next body reinitializes them. The exact CIB `inputOutput` and Task Service variable protocol are extensions, not normative BPMN data-association syntax.

**Evidence:** The [mixed human/Service body probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSequentialMultiInstanceDataProbeTest.java) against CIB Seven `2.2.0` separates repeated bodies, interleaved Processes, null and missing body declarations. Its distinct-source and shared-source outputs additionally distinguish body-local `decision` from Process-owned `summary`, both initially absent and present, through public variable rows and Task Service visibility. Both String/null orders preserve parent shadows, dispose Service locals and reinitialize the next body. A crossed-source control changes the observed targets. The focused class passes `/tmp/smis-cib-output-mapping-green-20261012`; the retained wrong-wiring run fails `/tmp/smis-cib-output-mapping-red-20261012`, both separately asserted on 2026-10-12. The complete two-release runner gate passes `/tmp/smis-cib-calibration-runner-integration-20261012`, and the focused source/artifact/document guards pass `/tmp/smis-cib-calibration-integration-20261012`, both separately asserted. These synchronous observations do not establish strict explicit-result rejection, asynchronous hosting or whole-model equivalence.

The [research boundary](research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#repeated-body-data-boundary) identifies `InputParameter.execute` and `OutputParameter.execute`; [artifact reference verification](../scripts/contract-artifact-projections.test.ts) checks registration. This source-informed account and its CIB probe are not independent semantic interpretations.

**Boundary:** One ordinary body level, string/null mappings, explicit local Service results and nearest existing parent/body bindings. No arbitrary JUEL, general nested mapping, MI output aggregation, external side-effect rollback or Temporal transaction equivalence. Existing `CIB-EXT-0015` remains root-only; it is not silently broadened. Candidate rule: `SMIS-DATA-01`.

### CIB-EXT-0018 — parallel body mappings and post-disposal condition context

**Status:** Candidate bounded extension, owned by PC-MI-10. Per-body input capture runs under `CIB-INT-0014`'s binding; the write clauses stay refused (`multiInstance.mappings`, `multiInstance.instanceResult`). The kernel reads the completion condition without the body's own-input locals: they live in the Sub-Process's scope occurrence below the instance's, which holds only the item and counters (`MultiInstance.conditionContext`); the retained [parallel-post-disposal-condition](../scenarios/open-rows/multi-instance-sub-process/README.md) answer (CIB Seven `2.2.0`) agrees with that context. No profile selects this entry.

CIB input parameters capture enclosing values into each concurrently created body. Declared locals isolate human completion and mapped Service results, including present null. Removing the declarations makes those writes reach the shared Process binding in explicit command order. The selected JUEL Process-variable completion condition is evaluated after body-local disposal: opposite local/Process Boolean values distinguish the enclosing condition value from the former body value. The proposal protects the selected condition name against local redeclaration rather than implying a general variable-scope contract.

**Evidence:** The [parallel data probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenParallelMultiInstanceDataProbeTest.java) and [source-grounded research](research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#parallel-body-data-and-condition-context) retain the four passing cases. [Artifact-reference verification](../scripts/contract-artifact-projections.test.ts) covers this candidate ID. CIB `inputOutput`, Task Service patches and JUEL name lookup are selected extension mechanisms, not normative DataAssociation syntax.

**Boundary:** One ordinary body level, string/null data, Boolean condition controls, immutable input collection and synchronous mapped delegate success. No automatic rollback of committed sibling writes, arbitrary expressions, general local-variable accessibility after scope completion, MI output aggregation or durable-effect equivalence is claimed. `CIB-EXT-0017` retains its separate sequential evidence boundary.

### CIB-EXT-0019 — structured business-task inputs and local results

**Status:** Selected bounded extension for the [structured effect-data amendment](kernel/semantics/DATA-SEMANTICS-SPEC.md), closed by independent review on 2026-10-14; selected by the draft effect-data profile artifact. The [structured effect-result probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenStructuredEffectResultProbeTest.java) (2026-10-14) observes the credit decision's input reference: Notify's in-place mutation of its structured input reaches the Process variable, the excluded aliasing boundary.

CIB Seven `2.2.0` evaluates a `${name}` input or output parameter to the raw variable object and stores that reference without copying (`InputParameter.java:46,51`, `OutputParameter.java:47,52`, `AbstractVariableScope.java:149-153,317-319`, JUEL `TypeConverterImpl.java:343-345`). Output mapping runs when the Activity scope is destroyed, after the delegate returns, and then removes every Activity-local variable (`ExecutionEntity.java:523-527,554`). BPMN 2.0.2 §10.4.1 states that executing a Data Association copies data to its target; the selected account follows it, carrying one `SingletonBusinessItem` per mapped name by value.

**Boundary:** A delegate mutating a structured input in place changes the Process variable through aliasing, and implicit update detection persists it (`TypedValueField.java:155-168`). The project's handler receives an immutable snapshot, so this aliasing is outside the selected account. No general JUEL, nested expression, Java object or listener mutation is claimed.

**Evidence:** the calibration probe [`CibSevenStructuredEffectResultProbeTest`](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenStructuredEffectResultProbeTest.java) records the projected result and the excluded input aliasing; it is not retained differential evidence.

### CIB-EXT-0020 — nested embedded scope locals and nearest-owner writes

**Status:** Selected bounded extension under the implemented [nested embedded scope data specification](kernel/semantics/DATA-SEMANTICS-SPEC.md), widened to concurrent occurrences by the [concurrent scope data specification](kernel/semantics/DATA-SEMANTICS-SPEC.md) and, under its own profile, by [concurrent structured scope data](kernel/semantics/DATA-SEMANTICS-SPEC.md) and [root Parallel forks](kernel/semantics/FLOW-SEMANTICS-SPEC.md), and from one activation to each activation by [scope re-entry](kernel/semantics/SCOPES-SEMANTICS-SPEC.md); the concurrent and re-entry widenings are calibrated, the nested-depth calibration pending. It is selected by the [cibseven-2.2.0-scope-chain profile](../profiles/cibseven-2.2.0-scope-chain/profile.json) and by no other profile: its scope-chain submission restriction (NSD-TASK-01) is a project admission restriction that is exclusive with the root install of `CIB-EXT-0005`, hence the separate profile.

CIB Seven `2.2.0` accepts `camunda:inputOutput` on an ordinary embedded `subProcess` (`BpmnParse.checkActivityInputOutputSupported`), runs its input parameters at entry in the outer scope (`PvmExecutionImpl.executeIoMapping`, `IoParameter.execute`, `InputParameter`) and its output parameters when the scope is destroyed in the inner scope (`ExecutionEntity.destroy`, `OutputParameter`). `AbstractVariableScope.setVariable` updates the nearest scope that has the name locally, walking parent by parent, and creates the binding at the root otherwise; a present null is a local binding and shadows.

**Boundary:** Serial nested ordinary embedded scopes up to definition depth three, String-literal or exact `${name}` inputs, outputs sourced from a declared local of the same scope and run at normal completion only, and `SingletonBusinessItem` values. It broadens the one-body-level account of `CIB-EXT-0017` without changing that entry. CIB also runs outputs on non-normal destruction (see `CIB-EXT-0016`); the abnormal-exit output policy belongs to a later interruption or Error amendment. The profile admits User Task completion patches only over names declared on the task's scope chain; this is a profile admission restriction, since CIB's `TaskEntity.setExecutionVariables` creates a root binding for an undeclared name. The calibration covers two nested levels; the admitted third level is uncalibrated. Under the embedded completion profile, in data-bearing Programs, the same account holds over the live occurrence chain for concurrent and same-definition occurrences, merge targets included, with String values of at most 1,024 UTF-8 bytes or a present null, and the User Task clause applies over that chain ([concurrent scope data](kernel/semantics/DATA-SEMANTICS-SPEC.md)). There a mapped Call's caller occurrence is also a chain origin: its inputs read, and its outputs write, along that occurrence's chain ([concurrent mapped Calls](kernel/semantics/WORK-SEMANTICS-SPEC.md)). Under the nested scope-data profile the same live-chain account holds for Parallel forks in Sub-Process bodies, with `SingletonBusinessItem` values; the merge-target clause stays the embedded completion profile's ([concurrent structured scope data](kernel/semantics/DATA-SEMANTICS-SPEC.md)). It also holds for Parallel forks in the Process root body of a model that holds no Call in that body, whose branches write the Process store directly ([root Parallel forks](kernel/semantics/FLOW-SEMANTICS-SPEC.md)). Under the nested scope-data profile the account also holds for each activation of a Sub-Process that a root-body cycle re-enters after its previous activation completed: the inputs run again at each entry against the then-current enclosing values, the outputs run once at each normal completion, and Process values written by an earlier activation survive ([scope re-entry](kernel/semantics/SCOPES-SEMANTICS-SPEC.md)). No concurrent branches outside those placements, JUEL beyond exact references, Multi-Instance mapping, aliasing of structured values (see `CIB-EXT-0019`) or BPMN `property`/`dataObject` notation.

**Evidence:** The nested-depth calibration is pending; it extends the [body-data probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSequentialMultiInstanceDataProbeTest.java) to two nested levels. The [concurrent scope data probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenConcurrentScopeDataProbeTest.java) calibrates the concurrent widening in CIB `2.2.0` on both retained models (2026-10-31). Each of two live Price damage executions keeps its own estimate and present-null adjuster, so each Fetch rates input reads its own occurrence, and the later completer's output wins in both orders. The Fire safety check, entered concurrently with its shadowing sibling, initializes from the enclosing Inspection, and both checks write the shared findings. The [concurrent mapped Calls probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenConcurrentMappedCallsProbeTest.java) calibrates the Call caller occurrence as a chain origin (2026-11-01): each expert's output lands in its own review Sub-Process's declared verdict while the sibling review keeps `pending`, and the travel Budget check's output reaches the Process while Booking's local budget keeps its entry value. The [concurrent structured scope data probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenConcurrentStructuredScopeDataProbeTest.java) calibrates the nested scope-data widening with Java `Map` and `List` values on both retained models along the released-job schedule (2026-11-01): each branch arms from its own copy of the order, the branch outputs publish at their Sub-Process's completion, and each loan dossier stays in its own branch and called instance. The same probe calibrates the root-fork widening on the [retained employee onboarding](../scenarios/root-parallel-forks/README.md) along the released-job schedule (2026-11-02): whichever root branch commits `onboardingStage` last keeps it in both orders, the laptop order reads the `employee` visible when its continuation job runs, and one welcome meeting opens after both branches. The [scope re-entry probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java) calibrates the re-entry widening in CIB `2.2.0` on the [retained claim rework](../scenarios/scope-reentry/README.md), with JUEL renditions of its conditions under `CIB-CFG-0005` (2026-11-02): the second *Assess claim* activation starts with `notes` read afresh from the claim summary although the first activation's *Inspect damage* changed it, its *Price repair* reads the fresh value, the first activation's `assessment` and `repairQuote` stay at the Process until overwritten, and the two activations have distinct activity-instance and task ids.

### CIB-EXT-0021 — Call variable mappings by name across the instance boundary

**Status:** Selected bounded extension under the [Call variable mapping specification](kernel/semantics/DATA-SEMANTICS-SPEC.md), calibrated against CIB Seven `2.2.0`; widened to concurrent mapped Calls by the [concurrent mapped Calls specification](kernel/semantics/WORK-SEMANTICS-SPEC.md) and by [concurrent structured scope data](kernel/semantics/DATA-SEMANTICS-SPEC.md), and to repeated invocation through a root-body cycle by [scope re-entry](kernel/semantics/SCOPES-SEMANTICS-SPEC.md), each calibrated on its retained models.

BPMN 2.0.2 Clause 10.3.6 transfers Call data only through matching Call Activity and CallableElement inputs and outputs, and Clause 13.3.4 gives the called Process its own instance, so name-based transfer is an extension layered on the BPMN Call lifecycle. CIB Seven `2.2.0` reads `camunda:in`/`camunda:out` (`BpmnParse` Call parsing), evaluates every input in document order against the Call Activity's execution before the called instance starts (`CallableElementActivityBehavior`, `CallActivityBehavior`), copies an unset source as a present null (`CallableElementParameter`), gives the called instance no parent variable scope (`PvmExecutionImpl`), reads every output from the called process-instance scope at normal end and writes it with `setVariables` from the Call Activity's execution, so it lands at the nearest existing caller binding or the caller Process (`AbstractVariableScope.setVariable`, see `CIB-EXT-0020`), and silently drops outputs targeting `nrOfInstances`, `nrOfActiveInstances` or `nrOfCompletedInstances`. It reads `calledElement` as a raw deployment key, although BPMN types it as `xsd:QName`.

**Boundary:** Up to two Calls in a two-Process document, both naming the other in-document Process, each on the serial path of the caller's root or of an embedded Sub-Process body at depth one or two, `calledElement` equal to that Process's `id` with no QName resolution claimed, one to eight constant-`source` inputs and up to eight outputs with distinct nonempty targets and no reserved output target, and a called Process of one to three serial User Tasks. Outputs run at normal return only; CIB also runs them when an Error or Escalation leaves the called instance (`OutputVariablesPropagator`), which `CIB-EXT-0034` selects. Called completion patches name only input targets and output sources, a profile admission restriction since CIB would create any called variable. A Call inside a Sub-Process reads its inputs and writes its outputs along that Sub-Process's chain, so an output target the Sub-Process declares lands in its local (`CIB-EXT-0020`), and each Call's own mappings apply to its own called instance ([Stage B](kernel/semantics/WORK-SEMANTICS-SPEC.md)). No `sourceExpression`, `variables="all"`, `local`, `businessKey`, version or tenant binding, mapping class or delegate, third, nested or concurrent mapped Call beyond the data-bearing placements below, or Call-carried BPMN data. Under the embedded completion profile only the key clause applies outside data-bearing Programs, to empty-data Calls in Process root bodies that repeat serially, run concurrently on Parallel branches and nest to depth three, with every mapping attribute refused ([repeated, nested and concurrent Calls](kernel/semantics/WORK-SEMANTICS-SPEC.md)). Under the embedded completion profile, in data-bearing Programs, mapped Calls also sit wherever Stage A admits a Call vertex in the root body, concurrent Parallel branches included, and on the serial path of a Sub-Process body at depth one or two that is not a merge target, never leading that body directly or through leading Sub-Processes; each call evaluates its inputs from, and writes its outputs to, its own caller occurrence's chain, whatever the completion order, with String values of at most 1,024 UTF-8 bytes or a present null. A fork never leads straight into two Calls of one definition and one called Process is never invoked both with and without mappings ([concurrent mapped Calls](kernel/semantics/WORK-SEMANTICS-SPEC.md)). Under the nested scope-data profile the data-bearing placement clause also applies on the Parallel branches of a Sub-Process body, never in the forking body itself, within that profile's two-Call bound and with `SingletonBusinessItem` values ([concurrent structured scope data](kernel/semantics/DATA-SEMANTICS-SPEC.md)). Under the nested scope-data profile a root-body cycle may invoke the same Call again after its previous called instance returned; each invocation evaluates its inputs at that moment into a new called instance and writes its outputs once at that instance's return ([scope re-entry](kernel/semantics/SCOPES-SEMANTICS-SPEC.md)).

**Evidence:** The [Call variable mapping probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenCallVariableMappingProbeTest.java) drives the [retained loan application](../scenarios/call-variable-mapping/README.md) through its three journeys in the packaged CIB Seven `2.2.0` engine: the called instance's local variables hold exactly the copied inputs, an unset or present-null source arriving as a present null; a called patch of an input target leaves the caller's namesake unchanged; at return the outputs land on the caller Process, a never-set source overwriting the target with null. It maps no CIB child-instance or task id to the project's derived called identity; the ended caller's variables are read from CIB's variable history. The [embedded mapped Calls probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenEmbeddedMappedCallsProbeTest.java) drives the [retained guarantor loan](../scenarios/repeated-nested-concurrent-calls/README.md#guarantor-loan-stage-b) through both journeys: the Sub-Process Call's child holds only its own mapped input, an absent source arriving as a present null, its output lands in the Guarantor review's local while the caller Process holds no such variable, the Sub-Process output parameter publishes it at completion, and the root-path Call's output stays as written. The embedded completion profile's key reading has source-level agreement only: the [supplier onboarding scenarios](../scenarios/repeated-nested-concurrent-calls/README.md) cite this entry, and Lean, the TypeScript core and the pipeline agree on them, but no CIB run calibrates repeated, nested or concurrent empty-data Calls. The [concurrent mapped Calls probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenConcurrentMappedCallsProbeTest.java) calibrates the data-bearing widening in CIB `2.2.0` on the [retained supplier onboarding and travel request](../scenarios/concurrent-mapped-calls/README.md) along their three scenarios' committed steps (2026-11-01). Two live calls of one Expert opinion Process each hold only their own mapped input, and each output lands in its own review's declared verdict in both completion orders; both travel Calls, invoked at Start, copy the absent traveller as a present null. The [concurrent structured scope data probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenConcurrentStructuredScopeDataProbeTest.java) calibrates the nested scope-data placement on the [retained loan assessment](../scenarios/concurrent-structured-scope-data/README.md) (2026-11-01): each expert's called instance holds only its own branch's structured dossier, and each opinion lands in its own declared local. The [scope re-entry probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java) calibrates repeated invocation on the [retained contract revision](../scenarios/scope-reentry/README.md) (2026-11-02): the second *Legal review* starts a distinct called instance holding only the revised text, completing the first instance's ended review task fails and changes nothing, and the second verdict overwrites the first at the caller.

### CIB-EXT-0022 — Abstract and Manual Tasks as immediate pass-through

**Status:** Selected bounded extension under the [pass-through Task specification](kernel/semantics/WORK-SEMANTICS-SPEC.md) for the nested scope-data profile, widened to Parallel branches by the [pass-through branch specification](kernel/semantics/FLOW-SEMANTICS-SPEC.md) to wait-free terminal branches by the [terminal forks specification](kernel/semantics/FLOW-SEMANTICS-SPEC.md) and to data-declaring definitions by the [data-declaring terminal branches account](kernel/semantics/DATA-SEMANTICS-SPEC.md), calibrated against CIB Seven `2.2.0` on its seven retained models.

BPMN 2.0.2 Clause 13.1 makes the Manual Task and the Abstract Task non-operational and lets an implementation extend them to execute; Clause 13.3.3 completes an Abstract Task on activation and has a Manual Task's work done by people outside the engine, and Clause 10.3.4.1 calls a Manual Task unmanaged, with no start or completion tracked by the engine. CIB Seven `2.2.0` gives a plain `task` a `TaskActivityBehavior` and a `manualTask` its empty subclass `ManualTaskActivityBehavior` (`BpmnParse.parseTask`, `parseManualTask`), whose `execute` calls `leave` and takes the default outgoing behavior at once (`TaskActivityBehavior`, `BpmnActivityBehavior.performDefaultOutgoingBehavior`). It records each activation as a historic activity instance of type `task` or `manualTask` that starts and ends inside the command that reached it, and creates no task entity and no job. For a Manual Task that record goes beyond Clause 10.3.4.1's untracked conceptual work, and the work is not distributed.

**Boundary:** A `task` or `manualTask` with only `id` and an optional `name`, one incoming Sequence Flow of any kind the profile admits and one unconditioned, non-default outgoing flow, on the serial path of the Process root or a Sub-Process body at an admitted depth, or in a [scope re-entry](kernel/semantics/SCOPES-SEMANTICS-SPEC.md) root graph on a Choice branch or a cycle, or on a Parallel branch of the Process root or of a Sub-Process body of a forking model, where `TaskActivityBehavior.execute` leaves in whichever concurrent child execution carries the token. A branch that reaches its fork's join may hold only such Tasks, a terminal fork's branch may reach its own None End through only such Tasks, and a Call is never preceded only by such Tasks from its body's Start. Each activation publishes one occurrence that starts and ends in that step, a distinct one on each re-entry, and moves the token on with no wait, effect or data change. A model holding one is admitted only when its longest automatic burst stays within eight steps (`PTT-BURST-01`). Several incoming or several unconditioned outgoing flows, never both, belong to `CIB-AGR-0019`. Excluded: called Processes, a conditional or default outgoing flow, asynchronous continuations, execution listeners, mappings and other extension elements, loop or Multi-Instance characteristics, boundary Events and `isForCompensation`.

**Evidence:** The [pass-through Task probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) drives the [retained equipment return and document intake](../scenarios/pass-through-task/README.md) in CIB `2.2.0` (2026-11-02), with the intake's conditions rendered as JUEL under `CIB-CFG-0005`: *Unpack equipment*, *Close return ticket*, *File paper original* and *Register digital copy* each show one ended activity instance of their type and no task or job while the Process stands at the next wait or has ended, and the re-entered *Phone sender* shows two distinct activity instances. The same probe drives the [retained office relocation and invoice settlement](../scenarios/pass-through-parallel-branches/README.md) (2026-11-02): in both completion orders of the relocation, *Hand over keys*, *Notify facilities* and the body's *Label boxes* each end inside the command that forked, *File movers' confirmation* inside the command that ran *Book movers* and *Close relocation ticket* inside the command that fired the join, and the invoice review's *Archive receipt* and *Notify accounting* both end inside the command that completed *Check invoice*. It also drives the [retained employee offboarding and office move](../scenarios/terminal-forks/README.md) (2026-11-04): *Notify payroll* and its End and the direct End *Departure recorded* end inside the command that ran *Look up employee*, the Process stays running after the first User Task branch ends and ends with the second in both orders, and entering *Clear old office* ends *Return keys*, *Cancel parking permit* and their Ends while the Sub-Process instance stays active until *Pack desk* completes. It also drives the [retained expense claim](../scenarios/data-declaring-terminal-branches/README.md) (2026-11-05): the policy result ends *File paper receipt*, *Notify cost centre* and their Ends inside its command while the entered *Review claim* instance keeps its local `verdict`, and the Process ends only with *Approve claim*'s completion.

### CIB-EXT-0023 — Send Task performed by a configured handler

**Status:** Selected bounded extension under the [Send Task specification](kernel/semantics/WORK-SEMANTICS-SPEC.md), selected by the cibseven profiles, calibrated against CIB Seven `2.2.0` on its retained models.

BPMN 2.0.2 Clause 10.3.3 defines the Send Task as a Task that sends a Message to an external Participant, through `messageRef`, `operationRef` and `implementation` (default `##WebService`), the Participant identified by a Message Flow, and Clause 13.3.3 has it send the Message built from its Data Input on activation and complete, assigning no output; the sending technology is left to `implementation`. CIB Seven `2.2.0` never reads `messageRef`, `operationRef` or `implementation` (`BpmnParse.parseSendTask`, BpmnParse.java:2505-2541): with `camunda:class`, `delegateExpression`, `expression` or `type` it parses the Send Task as a Service Task (`parseServiceTaskLike`, CAM-942), otherwise it reports a parse error, and it records each activation as a historic activity instance of type `sendTask` (BpmnParse.java:1912). The send is therefore the configured handler's effect and the Message data its inputs, which are CIB extension locals (`CIB-EXT-0015`), not BPMN Data Inputs.

**Boundary:** A `sendTask` with `id`, an optional `name`, `implementation` the Activity effect protocol, a `camunda:delegateExpression` bound by the source overlay (`CIB-EXT-0019`), an optional `camunda:asyncBefore="true"` and `camunda:inputOutput` input parameters of the Service Task's grammar, in every position a cibseven profile admits a mapped Service Task, an attached Error boundary included. It executes as that mapped effect, one effect occurrence per activation whose arguments snapshot the committed inputs, completed only by its result, which must be empty: the profile admits no output parameter on a Send Task. No Message is constructed and no Message Flow, Collaboration, `messageRef` or `operationRef` is read; each is refused, as are `camunda:class`, `expression`, `type`, `resultVariable`, another `implementation`, listeners, loop and Multi-Instance characteristics. Without `camunda:asyncBefore` the send runs inside the command that reaches it; a technical failure of that synchronous send is `CIB-EXT-0049`'s. A Send Task with a modeled recipient, `messageRef` or `operationRef` and no configured handler stays refused (`work.send`): CIB has no execution meaning for it, so the refusal is a forward-compatible restriction, not an open target.

**Evidence:** The [Send Task probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSendTaskProbeTest.java) drives the [retained shipping notice and claim acknowledgement](../scenarios/send-task/README.md) in CIB `2.2.0` (2026-11-03), running every continuation job before the next command: each send is one job, then one delegate invocation whose locals are exactly the evaluated inputs (the customer's address as `recipient`, the order as `correlationId`, the literal channel; the claim reference), then one ended historic activity instance of type `sendTask` with no task entity, and the Process variables keep only the Start bindings, in both completion orders of the claim's fork. The retained [send-task-configured-send](../scenarios/open-rows/send-task-configured-send/README.md) answers agree with the kernel: typed inputs, success, a business failure caught by an Error boundary (`send-rejected`), a transport failure with its incident and retry, a committed snapshot against a later `setVariables`, rejected undeclared outputs, wrong activations and duplicate results, and a Message-Flow-only Send Task refused at deployment.

### CIB-EXT-0024 — an unresolved input or output parameter expression fails its evaluation

**Status:** Verified for CIB Seven `2.2.0` by the retained `entry-missing` and `exit-missing` evidence of [mapping-failure-sites](../scenarios/open-rows/mapping-failure-sites/README.md); the kernel rolls back with the evaluation's own code (`unknown-variable`) through the core JUEL evaluator

An unresolved `camunda:inputParameter` or `outputParameter` expression raises an evaluation failure that rolls the command back; it is not an unavailable Data Input, which holds the token (§13.3.2).

**Evidence:** Pinned `JuelExpression#getValue` throws `ProcessEngineException` ("Unknown property used in expression"); the kernel's `Mapping.dialect` rule in `Ctx.evaluateMappings`. The rule basis marks this reading inferred.

**Boundary:** Expressions the kernel evaluates. `MappingDialect.dataAssociation` keeps the BPMN availability rule, and the kernel holds an unavailable InputSet only for that dialect.

### CIB-EXT-0025 — Message correlation by API criteria and delivered variables

**Status:** Recorded extension from the pinned source for `MessageCorrelation.apiCriteria` and `DeliveryVariables.installs`; selected by the cibseven profiles

Correlation criteria are API-supplied and match Process or local variables, business key or instance identity, and delivered variables install without a modeled output. Under `apiCriteria` each criterion of a delivery or publication is checked against the waiting subscription's own state: a Process variable the instance root holds, a local variable the subscription's scope occurrence holds itself, the instance's own business key, or its public instance identifier, a variable's value compared by kind and value, a null matching only a present null; a variable criterion whose value is a Decimal, a String list, a list or a map is `unsupported` (`correlation-criterion-not-primitive`), since CIB's variable query refuses such an Object value (`SingleQueryVariableValueCondition.java:83-85`) and rolls the correlation back; the criteria form a conjunction and two naming one target are rejected (`criteria-duplicate`). A criterion that reaches a root Message start is decided for the command where the publication falls through to its sole start candidate. CIB fails a start-only correlation that carries a Process or local variable criterion (`ensureCorrelationVariablesNotSet`), and the kernel rejects it the same way (`criteria-start-only`) before any start is sought. In either mode CIB starts an instance under a business-key criterion's key and ignores a process-instance criterion when it seeks a start; the kernel reproduces neither and answers `unsupported` (`start-criterion-not-variable`), never starting under another key. A variable criterion in the default mode only seeks a waiting execution, so when none matches CIB starts the instance with the delivered variables alone, and the kernel does the same. Under `installs` a delivery's variables install after its mapped outputs, by the nearest-owner rule, in the delivering step.

**Evidence:** Pinned `MessageCorrelationBuilderImpl` (`processInstanceVariableEquals`, `localVariableEquals`, `setVariable`), `DefaultCorrelationHandler.java:79-123`, `AbstractCorrelateMessageCmd.java:69-79`, `SingleQueryVariableValueCondition.java:83-85`; the kernel test `packages/kernel/test/message-api-criteria.test.ts`; the [object-valued-criterion](../scenarios/open-rows/message-correlation-criteria/README.md) witness, which CIB rolls back; the population witnesses [object-valued-criterion-with-start](../scenarios/open-rows/message-start-population/README.md), [start-only-with-criteria](../scenarios/open-rows/message-start-population/README.md) and [criterion-reaching-start](../scenarios/open-rows/message-start-population/README.md), whose CIB answers are retained; for a criterion reaching a start, pinned `MessageCorrelationBuilderImpl.java:249-257` and `:332-336`, `DefaultCorrelationHandler.java:46-72` and `:148-165`, `AbstractCorrelateMessageCmd.java:81-95`, and the kernel tests in `packages/kernel/test/population-messages.test.ts`.

**Boundary:** Message catches, boundaries, Event Sub-Process starts and Receive Tasks reached by an occurrence-addressed `deliver` or a population `publish`. A local criterion reads only the waiting item's own scope: CIB evaluates it on the execution holding the subscription (`DefaultCorrelationHandler.java:98-101`), so at a catch inside a looping Sub-Process the `loopCounter` of the enclosing instance matches nothing, in CIB and the kernel alike; at a looping Receive Task the two differ (CIB-LIM-0039). A modeled key is refused under `apiCriteria` (`message.correlation.modeled`, CIB-LIM-0002). CIB selects among an instance's subscriptions where the kernel addresses one occurrence (CIB-LIM-0038). CIB's variable query compares a `Long` criterion only with `Long`-typed variables (`QueryVariableValue.java:58-66`); the runner hands every Integer over as a `Long`, so a criterion matches a command-supplied Integer and never one the engine derived (CIB-LIM-0040). A criterion whose value is not primitive is `unsupported` in the kernel where CIB rolls the command back, a publication's before any receiver or start is sought, and this entry owns every such witness. A business-key or process-instance criterion that reaches a start is a restriction of the admitted surface (`unsupported start-criterion-not-variable`) where CIB starts under the criterion's key or ignores the instance; a start-only variable criterion is `rejected criteria-start-only`, as CIB rolls it back. This entry owns those witnesses too.

### CIB-EXT-0026 — a continuation failure after an effect result fails the job

**Status:** Recorded extension; selected by no profile (the option `ContinuationFailure.incident` reads it)

A failure in a continuation reached by an effect result fails the job and raises an incident instead of rolling back, the path CIB-INT-0003 excludes from its own boundary and CIB-EXT-0013 describes for a failing job.

**Evidence:** The boundary of CIB-INT-0003 and the [failed-job account in CIB-EXT-0013](#cib-ext-0013-failed-job-service-task-incident-and-retry); the kernel's `Step.effectContinuation`.

**Boundary:** A `.rolledBack` continuation of a successful effect result under `ContinuationFailure.incident` only.

### CIB-EXT-0027 — an asynchronous continuation commits the input at its boundary

**Status:** Recorded extension from the pinned source, read under every profile; success path and failure split verified by one local probe against published CIB Seven `2.2.0` on 2026-11-08; Multi-Instance loop marks added from the pinned source (PC-MI-02, 2026-11-09)

`camunda:asyncBefore` and `camunda:asyncAfter` are transaction boundaries. CIB commits the command at the boundary and continues in a job, so a failure after the boundary fails that job, with its retries and incidents (`CIB-EXT-0013`), and the part before it stays committed. The kernel runs a closure across a boundary as one input and does not split it: a closure that rolls back or fails after it crossed a boundary is `unsupported` (`async-boundary-failure`), never a rollback of the whole input. A closure that does not fail is unchanged, because CIB reaches the same committed state once the job has run.

**Evidence:** Pinned `ExecutionEntity#performOperation` asks each atomic operation `isAsync` and, when it is, `scheduleAtomicOperationAsync` sends a message job instead of continuing. `PvmAtomicOperationTransitionCreateScope` and `PvmAtomicOperationActivityStartCreateScope` answer with `isAsyncBefore`, before the Activity's scope, start listeners and input mappings; `PvmAtomicOperationTransitionNotifyListenerTake` and `PvmAtomicOperationActivityEnd` answer with `isAsyncAfter`, after the Activity ended and before its outgoing flows are taken; `AsyncContinuationJobHandler` continues the stored operation in the job's own transaction. The probe ran the sequential User Task model with and without `asyncBefore` on the task: after the one continuation job ran, the open task, the activity history and the completed instance were identical. With `asyncAfter` on the task and an Exclusive Gateway whose conditions are all false behind it, completing the task committed, and the continuation job failed with `ENGINE-02004` and two retries left. The kernel's `Step.crossed` and `Step.deferred` own the rule.

On a Multi-Instance Activity the marks are two pairs with no BPMN meaning. The Activity's own marks belong to the Multi-Instance body as a whole, and the marks declared on `multiInstanceLoopCharacteristics` (with legacy `camunda:async` as `asyncBefore`) belong to each inner instance, one continuation job per instance: `BpmnParse#parseAsynchronousContinuationForActivity` (`BpmnParse.java:2412-2426`) puts the Activity element's marks on the body activity and the loop characteristics' marks on the inner Activity; `MultiInstanceActivityBehavior#performInstance` starts each instance through `executeActivity`, which honours them. The IL carries the loop's pair as `MultiInstance.asyncBefore` and `asyncAfter`, and `crossed` (`Kernel.State`) reads a mark by the occurrence's role: the body's from the envelope, an instance's from the loop.

**Boundary:** The marks on Activities and Sub-Processes (`Envelope.asyncBefore`, `asyncAfter`) and on Multi-Instance loop characteristics (`MultiInstance.asyncBefore`, `asyncAfter`), read conservatively: any rollback or semantic failure after any crossing in the same input is `unsupported`, including one on a concurrent branch that CIB would roll back together with the boundary's job. Job identity, retries, exclusivity and priority, and asynchronous continuations on Events and Gateways stay outside; no job or transaction-timing equivalence is claimed.

### CIB-EXT-0028 — an Error catcher writes the caught code and message to named variables

**Status:** Selected bounded extension; selected by `ProfileOptions.errorCatchVariables = eventScope` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile; the standards profile refuses both attributes (`event.error.codeVariable`, `event.error.messageVariable`)

`camunda:errorCodeVariable` and `camunda:errorMessageVariable` on an Error Event Definition of a boundary or of an Event Sub-Process start name variables that receive the caught Error's code, a String, and its message, a String or a present null when the Error has none. BPMN 2.0.2 defines no such variables. CIB sets both with `setVariable` on the execution of the catcher's event scope before it starts the catcher: the boundary's host (`BpmnParse:3298`), or for an Event Sub-Process the enclosing scope (`BpmnParse:1112`). `setVariable` updates the nearest scope that binds the name and otherwise creates it at the instance root, so the variables outlive the handler. On a name shared with the interrupted host's output parameters the output, written later as CIB destroys the host, wins (`CIB-EXT-0016`); a Sub-Process local of that name is updated and leaves with the Sub-Process.

The kernel's `Propagation.catchDecided` writes the variables from that event scope outward, at once, before a raising Activity leaves and before the catcher begins. A Service Task host is still running when its own boundary catches, so its variables are set through the task's frame (`Work.mappedErrorOutputs`). A name the task holds, an input local or a result value the delegate set with `setVariableLocal`, updates that local, which ends with the task. Any other name is written from the task outward. The task's mapped output parameters then run (`PvmAtomicOperationCancelActivity.java:60`, `PvmExecutionImpl.java:613-626`, `ExecutionEntity.java:521-525`), so they read the variables and are written after them.

**Evidence:** Pinned `BpmnExceptionHandler#propagateError` (`BpmnExceptionHandler.java:146-154`) and `AbstractVariableScope#setVariable`; the retained witnesses [error-catch-variables](../scenarios/open-rows/error-catch-variables/README.md), [error-esp-catch-variables](../scenarios/open-rows/error-esp-catch-variables/README.md) and [error-null-message](../scenarios/open-rows/error-null-message/README.md) (CIB Seven `2.2.0`, 2026-11-09). The local-shadow witness disagrees only where CIB's root-variable observation lists the Sub-Process local, which audit history attributes to the root (`DefaultHistoryEventProducer#createHistoricVariableEvent`). Pinned `PvmAtomicOperationCancelActivity.java:60` (the cancelled event-scope execution is deleted with I/O mappings) and `PvmExecutionImpl.java:613-626` (`deleteCascade(reason)` does not skip them). The retained [mapping-order](../scenarios/open-rows/mapping-order/README.md) `task-caught-outputs` witness covers three cases, an output named like the catch variable, an output reading it and a task-local of its name, and agrees (CIB Seven `2.2.0`). An ancestor catcher's variables are written before a raising Service Task inside it leaves (`CIB-EXT-0016`, PC-ERROR-03): the retained [error-thrower-leave](../scenarios/open-rows/error-thrower-leave/README.md) witnesses agree.

A widening from PC-ESCALATION-01 (2026-11-10): `camunda:escalationCodeVariable` on an Escalation boundary or Event Sub-Process start (`BpmnParse.java:3681-3699`) receives the caught code as a String under the same option, and the standards profile refuses it (`event.escalation.codeVariable`). CIB sets it on the execution of the handler's event scope when the catcher interrupts and of its flow scope when it does not (`EscalationHandler.java:80-97`): for an Event Sub-Process both are the enclosing scope, for a non-interrupting boundary it is the host's parent, not the host. The kernel writes it from the host for an interrupting boundary and from the host's parent for a non-interrupting one (`Propagation.leaveOccurrence`). The retained witnesses [exact-code-variable and catch-all-code-variable](../scenarios/open-rows/escalation-code-variable/README.md) agree (CIB Seven `2.2.0`, 2026-11-10); the retained [escalation-catch-write-origin](../scenarios/open-rows/escalation-catch-write-origin/README.md) witnesses separate the host from its parent as the write origin and agree.

**Boundary:** Error and Escalation catchers on boundaries and Event Sub-Process starts. A catch variable an ancestor catcher sets (a boundary of an enclosing Scope, a boundary of a Call or an Event Sub-Process) is written before a raising Service Task inside it leaves, so an output parameter of the task named like it is written after it, and an output that reads it reads it where `setVariable` on the event scope's execution left it: behind the task's own locals and behind the locals of every scope between the task and the event scope, and never when the event scope lies in another process instance, a Call's boundary or a catcher in a caller (`BpmnExceptionHandler.java:146-153`). A Call holds no input-parameter local such a write could update: admission refuses every Call input parameter (`activity.inputMappings`). Outside the claim: expression-valued messages.

### CIB-EXT-0029 — a technical failure is caught by an Error code that names its Java exception class

**Status:** Recorded extension; not selected by any profile and not realized by the kernel

`ErrorEventDefinition#catchesException` (`ErrorEventDefinition.java:75-96`) lets an Error catcher whose `errorCode` equals the class name of a thrown Java exception, or of one of its superclasses, catch that exception: a technical failure of a delegate becomes the Error path instead of a failed job (`ErrorDeclarationForProcessInstanceFinder.java:45`, `BpmnExceptionHandler#propagateExceptionAsError`). The kernel's technical failure carries no exception type, so it never selects an Error catcher; it stays an incident (`CIB-EXT-0013`) or a host failure.

**Evidence:** The retained witnesses [error-java-class-codes](../scenarios/open-rows/error-java-class-codes/README.md) (CIB Seven `2.2.0`, 2026-11-09): the runner's technical failure is caught by boundaries coded `java.lang.RuntimeException` and `java.lang.IllegalStateException`; both disagreements stay classified under this entry. A business failure whose code is a class name is an ordinary code and agrees.

**Boundary:** The CIB profiles' claim covers Error codes that name no Java exception type; a model whose catcher code names one is outside it.

### CIB-EXT-0030 — a condition without a declared language is JUEL

**Status:** Selected extension through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile

BPMN 2.0.2 makes XPath the default expression language (Table 8.1 `expressionLanguage`, and the XSD default) and lets vendors substitute their own languages (§8.2.1). CIB Seven `2.2.0` evaluates a `conditionExpression` with no `language` attribute as JUEL and ignores a missing `xsi:type` (`BpmnParse.java:4411-4412`), whatever the Definitions declare. The CIB profiles read the undeclared case as JUEL at [the core level](kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#which-text-is-juel) and refuse a declared language (`CIB-LIM-0009`); the standards profile keeps its Simple Boolean subset.

**Evidence:** Pinned `BpmnParse.java:4411-4412`; the retained witnesses [condition-language-declarations](../scenarios/open-rows/condition-language-declarations/README.md) and [condition-expression-routing](../scenarios/open-rows/condition-expression-routing/README.md) (CIB Seven `2.2.0`), and the standards-profile witnesses [exclusive-gateway-simple-boolean](../scenarios/exclusive-gateway-simple-boolean/README.md), [inclusive-gateway-selected-branches](../scenarios/inclusive-gateway-selected-branches/README.md), [user-task-cycle](../scenarios/user-task-cycle/README.md) and [expense-exception-review](../scenarios/expense-exception-review/README.md), whose Definitions declare the Simple Boolean language: CIB ignores the declaration, evaluates `true` and `isPresent(…)` as JUEL text, a String, and rolls the start back (`el/UelExpressionCondition.java:52`), where the standards profile routes.

**Boundary:** Sequence Flow conditions and the other JUEL sites the expression semantics list; it claims nothing about XPath.

### CIB-EXT-0031 — an output parameter reads the Activity's own scope

**Status:** Selected extension through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the [cibseven-2.2.0-scope-chain profile](../profiles/cibseven-2.2.0-scope-chain/profile.json) (`OutputContext.activityScope`)

BPMN 2.0.2 §10.4.2 and §13.3.2 copy an Activity's outputs from its OutputSet, the values its completion produces; the standards reading therefore evaluates an output mapping against the submitted values alone, and a source only a captured input holds is unavailable. CIB Seven `2.2.0` evaluates a `camunda:outputParameter` in the Activity's own execution (`core/variable/mapping/OutputParameter.java:47`), so the mapping reads that execution's locals, its input locals and a delegate's `setVariableLocal` results among them, and then every variable visible from it. The CIB profile selects that context; the kernel reads it in [`Work.outputScope`](kernel/semantics/DATA-SEMANTICS-SPEC.md#activity-data). CIB runs an element's output parameters one at a time in document order (`BpmnParseUtil.java:89-110`, `IoMapping.java:44-48`) and writes each into the outer scope before it evaluates the next in the inner scope (`OutputParameter.java:44-52`), so a later output reads an earlier one's target unless the inner scope holds a local of that name. A value CIB sets through the Activity's execution before its outputs run goes through `setVariable` (`core/variable/scope/AbstractVariableScope.java:331-345`): a name the execution holds locally is updated there, any other reaches its nearest owner or the root, where a later output's write of the same name replaces it. Three completions do so: `TaskService.complete` sets the submission on the task's execution (`cmd/CompleteTaskCmd.java:71`, `persistence/entity/TaskEntity.java:869-873`), a decision task sets its mapped result (`util/DecisionEvaluationUtil.java:86`), and a caught Error sets its code and message variables on the boundary's host, a Sub-Process or a Service Task (`bpmn/helper/BpmnExceptionHandler.java:146-154`, `bpmn/parser/BpmnParse.java:3298,3301`), before `deleteCascade` destroys it and runs its outputs (`pvm/runtime/operation/PvmAtomicOperationCancelActivity.java:60`, `persistence/entity/ExecutionEntity.java:521-525`). Under the option the kernel reads the same way (`Ctx.outputReads`): the submitted values and the Activity's or Scope's own locals, an installed value of a local's name in that local's place, then the outputs already written, the latest first, then the installed values the frame does not hold, then the outer chain. A target named twice keeps the value written last.

**Evidence:** Pinned `OutputParameter.java:47`; the retained witnesses `captured-input-fallback` (Service Task) and `completion-captured-fallback` (User Task) of [output-mapping-fanout](../scenarios/open-rows/output-mapping-fanout/README.md), which commit in CIB and agree with the kernel under the option (CIB Seven `2.2.0`). Pinned `ExecutionEntity.java:521-525` (the mapped Error path runs the same list as the Scope is destroyed) and `AbstractVariableScope.java:331-345` with the three installing sites above; the [mapping-order](../scenarios/open-rows/mapping-order/README.md) `task-chained-outputs`, `scope-chained-outputs`, `error-path-chained-outputs`, `installed-chained-outputs`, `decision-chained-outputs`, `caught-chained-outputs`, `task-caught-outputs` and `duplicate-targets` witnesses, which agree (CIB Seven `2.2.0`, Verify run 42894734818).

**Boundary:** Output mappings of User and Service Tasks at normal completion and on the mapped Error path, where a Service Task's own boundary's catch variables stand behind them as installed values, of decision tasks, and the `camunda:outputParameter`s of a plain Task, which completes with the empty submission (`BpmnParse.java:4788-4831`, `ExecutionEntity.java:521-525`). Scope (Sub-Process) outputs read their own frame under either value and, under this option, also each earlier output's write, at normal completion and on the mapped Error path, where a caught variable no Scope local holds stands behind those writes (`Propagation.interruptedOutputs`). Call outputs read the called root and do not chain (CIB collects them into one map, `CallableElement.getOutputVariables`). A catch event's outputs read only the delivered payload, bound to every name a variable source reads, and JUEL is refused there (`expression.juel.site`), so an earlier write is never observable. A write's target is unchanged (nearest owner, `CIB-EXT-0020`).

### CIB-EXT-0032 — a Business Rule Task evaluates a DMN 1.3 decision table

**Status:** Selected extension through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the [cibseven-2.2.0-scope-chain profile](../profiles/cibseven-2.2.0-scope-chain/profile.json) (`ProfileOptions.businessRuleTask = decisionTable`); the standards profile refuses a decision task (`work.rule`), since BPMN 2.0.2 §10.3.3 names no rule engine

BPMN 2.0.2 leaves a Business Rule Task's rule engine open (§10.3.3). CIB Seven `2.2.0` makes a Business Rule Task with `camunda:decisionRef` a decision task (`BpmnParse.java:2321-2324,2357-2360`) that evaluates a deployed DMN decision and maps its result (`mapDecisionResult`) into `resultVariable`. The kernel evaluates a DMN 1.3 decision table that the program carries, within the admitted subset of [the decision semantics](kernel/semantics/DECISION-SEMANTICS-SPEC.md) (hit policies, FEEL unary tests, result mappers, conversions and failures, items 1 to 8), and writes the mapped result by the nearest-owner rule; every form outside the subset is refused with a stable code.

**Evidence:** Pinned `BpmnParse.java` and the DMN engine sources the decision semantics cite; the witnesses of [business-rule-hit-policies](../scenarios/open-rows/business-rule-hit-policies/README.md), its `form-*` witnesses included, whose CIB evidence the next retake records.

**Boundary:** Decision tables within the decision semantics' subset, with no Error catcher coded with a Java class (`CIB-EXT-0029`). The decision reference binds at program assembly (CIB-LIM-0015), not at each evaluation as in CIB. Inputs and outputs only as `camunda:inputOutput` parameters; a Data Association on a decision task is refused (`work.rule.dataAssociation`), since CIB runs none and no item of the decision semantics gives a DataOutput a source.

### CIB-EXT-0033 — a Multi-Instance cardinality counts parsed text and an integral Decimal

**Status:** Recorded extension; selected by `ProfileOptions.multiInstanceCount = javaInt` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile

BPMN 2.0.2 Table 10.29 says the `loopCardinality` expression "MUST evaluate to an integer"; the standards reading (`integer`) counts an Integer only and fails any other value as `multiInstance.notANumber`. CIB Seven `2.2.0`'s `resolveLoopCardinality` also accepts any `Number` through `intValue`, so an integral `BigDecimal` counts, and a `String` through `Integer.parseInt`, so the text `2` or `+2` counts while ` 2`, `two` and `2147483648` fail with a `NumberFormatException`. Under the option the kernel applies those rules at Java's `int` width. A Decimal with a fraction, which `intValue` truncates, and an Integer outside `int`, whose low 32 bits CIB keeps, are `unsupported` (CIB-LIM-0010); a String with a non-ASCII character is `unsupported` (`juel.nonAsciiText`), since `Integer.parseInt` accepts Unicode digits.

**Evidence:** Pinned `MultiInstanceActivityBehavior:145-155` (`:148-151`). The [multi-instance-expression-results](../scenarios/open-rows/multi-instance-expression-results/README.md) witnesses `count-text`, `count-text-signed`, `count-text-padded`, `count-text-over-int`, `count-decimal-integral` and `count-plain-literal`, whose evidence run is pending; the retained [Multi-Instance Service Task](../scenarios/open-rows/multi-instance-service-task/README.md) `parallel-cardinality-reversed` and `sequential-cardinality`.

**Boundary:** The cardinality site of admitted loops ([Multi-Instance level, Results](kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#results)).

### CIB-EXT-0034 — Call outputs pass when a raised Error or Escalation reaches the called root

**Status:** Selected bounded extension; selected by `ProfileOptions.raisedCallOutputs = atCalledRoot` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile; the standards profile writes nothing (`none`)

BPMN 2.0.2 executes a Call's Data Output Associations only when the Call completes (§10.3.6, §10.4.2, §13.3.4). CIB Seven `2.2.0` registers `tree/OutputVariablesPropagator.java:34-43` as an execution pre-visitor of both the Error and the Escalation search (`bpmn/helper/BpmnExceptionHandler.java:107`, `bpmn/helper/EscalationHandler.java:60`), and the scope finder and the propagator visit the same walked element before the stop condition is tested (`tree/ReferenceWalker.java:89-100`). So each time the search reaches the root of a called instance, the Call's `camunda:out` mappings run against that instance and are written from the Call's execution, whether that level catches, an outer level catches or nothing catches. Several Call levels pass innermost first, a rethrow from a root Event Sub-Process reaches the root again and passes again, and the pass precedes the catcher's code and message variables (`BpmnExceptionHandler.java:111`, before `:148-154`) and a raising Service Task's output parameters, which run only as its execution is destroyed (`CIB-EXT-0016`), so the pass reads the called instance before the failing task's outputs.

The kernel's `Propagation.passCallOutputs` calls `PropagationHooks.callOutputs` (`Work.Call.raisedOutputs`) at each called root the search visits, before any catcher there or further out begins ([scopes semantics, PC-SCOPE-06](kernel/semantics/SCOPES-SEMANTICS-SPEC.md#pc-scope-06-exceptional-call-return-and-propagated-cancellation)).

**Evidence:** The pinned sources above; the retained witnesses [call-exceptional-return](../scenarios/open-rows/call-exceptional-return/README.md), [escalation-call-propagation](../scenarios/open-rows/escalation-call-propagation/README.md) and [error-called-child](../scenarios/open-rows/error-called-child/README.md) (CIB Seven `2.2.0`), and the retained [call-raised-outputs](../scenarios/open-rows/call-raised-outputs/README.md), [escalation-called-uncaught](../scenarios/open-rows/escalation-called-uncaught/README.md) and [escalation-busy-called-root](../scenarios/open-rows/escalation-busy-called-root/README.md) answers: at a busy called root CIB passes the outputs when the Call's boundary catches and the kernel refuses the run when the root's own Event Sub-Process catches.

**Boundary:** `camunda:out` name mappings of `CIB-EXT-0021` only: no `variables="all"` and no delegate mapping. Refused as dynamic-only `unsupported`: a raise that runs directly at a called root while another path stands there, where the root's own Event Sub-Process catches and the Call maps outputs (`raise-caught-at-busy-called-root`). For a thrower that is no CIB scope, an Error or Escalation End Event, CIB's walk then visits the root first with the thrower's concurrent execution and stops at that catch before the propagator sees the process-instance execution (`tree/ActivityExecutionHierarchyWalker.java:52-54`), so whether the outputs pass rests on its execution tree. A catcher further out, the Call's own boundary included, lets the walk reach the process-instance execution, where the outputs pass, and the kernel passes them. A raising Service Task that CIB makes a scope (output parameters or a boundary, `BpmnParse.java:3297`, `:4803-4814`) starts the walk at its own execution, which reaches the root's process-instance execution (`:55-58`), so CIB passes the outputs; the refusal is conservative for that class. A Call that an interrupting boundary cancels passes nothing, as `deleteCascade` deletes its called instance (`PvmAtomicOperationDeleteCascade.java:57-64`); nor does one a removed caller region or an interrupting Event Sub-Process clears (`PvmExecutionImpl.java:345-359`, `clearScope`).

### CIB-EXT-0035 — CIB fires a Conditional Event on each matching variable write, filtered by its variable name and events

**Status:** Optional CIB extension; selected by `ConditionalRetrigger.eachWrite` through the cibseven profiles

BPMN triggers an intermediate or boundary Conditional Event "when a condition becomes true" (Tables 10.89, 10.90). CIB Seven `2.2.0` evaluates a Conditional subscription on every variable create, update (same value included) and delete in the subtree of the scope that owns the variable, filtered by `camunda:variableName` and `camunda:variableEvents`, and fires a non-interrupting one each time the predicate holds; arming evaluation ignores the filters. Under `eachWrite` the kernel does the same and publishes `lastValue: null`; under `edge` (the standards profile) it fires only on a false-to-true change, tracks `lastValue`, and refuses the two filters (`event.condition.filter`).

**Evidence:** Pinned `ConditionalEventDefinition.java:91-113`, `VariableListenerInvocationListener.java:75-80`, `ExecutionEntity.java:1731-1755`, `PvmExecutionImpl.java:1999-2010`, `:2185-2203`; retained `conditional-evaluation/portable-create-false-then-update-true` (the kernel agrees; its JUEL twin `create-false-then-update-true` is refused whole, CIB-LIM-0009), `conditional-esp/process-alert-repeats`.

**Boundary:** Conditional catches, boundaries, Event Sub-Process starts and Event-Based Gateway arms; root Conditional starts are PC-CONDITION-02's. An event name other than `create`, `update`, `delete` is refused (`event.condition.variableEvents`).

### CIB-EXT-0036 — a malformed Timer literal deploys and rolls back the command that arms it

**Status:** Optional CIB extension; selected by `ProfileOptions.malformedTimer.rollsBackArming` through the cibseven-2.2.0 profiles

BPMN Table 10.101 requires `timeDate`, `timeDuration` and `timeCycle` to conform to ISO 8601; a model whose literal does not is non-conforming, and BPMN states no run-time outcome for it. CIB Seven `2.2.0` deploys such a model and fails only when the Timer is armed (`exceptionWhileResolvingDuedate`, `exceptionWhileParsingCycleExpresison`), which rolls back the command that reached it. Under the CIB profiles the kernel admits a literal the pinned parser certainly rejects and rolls back the input that arms it; under `bpmn-2.0.2` (`malformedTimer.refused`) it refuses the model with the literal's `timer.*` code. A literal CIB commits but the kernel does not admit is refused under every profile (CIB-LIM-0003), never rolled back.

**Evidence:** Pinned `DurationBusinessCalendar.java:43-50`, `DueDateBusinessCalendar.java:42-58`, `CycleBusinessCalendar.java:53-67`, `DurationHelper.java:60-91`; retained `timer-duration-forms/form-negative`, `form-bare-number`, `form-lower-case` (`-PT5S`, `PT5`, `pt5s`) and `timer-date-forms/out-of-range-fields` (`1970-13-45T25:61:61Z`) roll the reaching start back; retained `timer-data-derived/catch-interval-text` (`PT1H/PT2H`, Joda's ISO date-time parser cannot read the `P…` end, `DateTimeUtil.java:47-60`) and the seconds-field Cron witnesses `cron-item-with-letter`, `cron-step-from-letter`, `cron-step-with-letter`, `cron-open-range`, `cron-step-zero-from-start`, `cron-step-zero-over-range`, `cron-two-steps` and `cron-unspecified-seconds` roll the arming command back; the kernel's `Timer.classify` (`malformed`).

**Boundary:** Literal Timer values classified malformed by `Timer.classify`: a duration not starting with `P` or not `xsd:duration`/`PnW` as the JDK's `DurationImpl` grammar rejects it (a point on a component other than seconds, a bare point), more than three `/` parts, two `/` parts both starting with `P`, a date of the extended shape with an out-of-range field or a character no ISO date has, a cycle with a count `parseInt` rejects or a malformed period, a Cron with the wrong field count, a foreign character, a number out of range, or a seconds field with a letter, a range without its end, more than one `/`, a step of 0 or `?` (the rules retained evidence certifies, in that field only; elsewhere CIB-LIM-0003). Root Timer starts are refused whatever the profile.

### CIB-EXT-0037 — CIB recalculates an armed Timer's due date on request

**Status:** Optional CIB extension; selected by no profile

`RecalculateJobDuedateCmd` (`ManagementService#recalculateJobDuedate`) re-evaluates an armed Timer's definition on an API call. BPMN has no such operation and the kernel offers none; an armed Timer keeps its captured deadline.

**Evidence:** Pinned `cmd/RecalculateJobDuedateCmd.java`.

**Boundary:** Not reachable through the scenario stimuli.

### CIB-EXT-0038 — the kernel's effect wait holds its host's boundaries armed, which CIB's `asyncBefore` realization never commits

**Status:** Selected bounded extension, a consequence of CIB-EXT-0001 and CIB-EXT-0023; selected by the cibseven profiles

Under CIB-EXT-0001 (CIB-EXT-0023 for a Send Task) CIB's effect wait is its `asyncBefore` continuation job, which precedes the Activity: `PvmAtomicOperationTransitionCreateScope#isAsync` answers `isAsyncBefore` (`PvmAtomicOperationTransitionCreateScope.java:28-31`), so the job is scheduled before `PvmAtomicOperationCreateScope` creates the scope execution whose `initialize` creates the boundary subscriptions (`PvmAtomicOperationCreateScope.java:31-46`, `ExecutionEntity.java:409-414`). The job then activates the Task, runs the delegate and completes it in one transaction, so no committed CIB state holds the Task's Timer, Message or Conditional boundaries. That is conformant: a Service Task may begin and finish atomically. The project maps the pre-activation wait onto the kernel's active effect occurrence (CIB-EXT-0001, CIB-OP-0002), and the kernel keeps BPMN's meaning for an active Task (§10.5.6, §13.5.3): its boundaries arm when it begins and are published open, a Timer fires at its deadline, a Message is accepted and a write reaches a Conditional boundary. CIB gives a Service Task whose work waits inside the Activity the same arming: an external task is created in the active, initialized scope (`ExternalTaskActivityBehavior.java:48-57`). The profiles therefore keep the arming and refuse nothing, and the oracle's delegate realization cannot observe these boundaries. The same mapping makes effect arguments unobservable before the job (CIB-OP-0013) and a failure after the crossing unsupported (CIB-EXT-0027).

**Evidence:** The cited source; the retained effect-host witnesses of `timer-boundary-hosts`, `message-boundary-interrupting` and `conditional-boundary-hosts`, in which the kernel holds the host's boundary subscriptions open where CIB holds none.

**Boundary:** Timer, Message and Conditional boundaries (Signal boundaries once admitted) of a CIB-EXT-0001 or CIB-EXT-0023 effect host under the cibseven profiles. Error boundaries agree. Not an operational detail, since Timer firings and Message acceptance are required observations.

### CIB-EXT-0039 — a Message throw performed by a configured handler

**Status:** Selected bounded extension for `MessageThrowForms.cibForms`; selected by the cibseven profiles

BPMN 2.0.2 names no sending technology for a Message throw Event (Tables 10.88 and 10.89; `tMessageEventDefinition`, `Semantic.xsd:999-1008`, has no `implementation`). CIB Seven `2.2.0` parses a Message throw whose event definition declares `camunda:class`, `delegateExpression`, `expression` or `type` as a Service Task, "same behavior as service task" (CAM-436; `BpmnParse.java:1643-1653`, `3174-3184`), without reading `messageRef`, `operationRef` or a Message Flow. Under `cibForms` the kernel reads the event definition's `camunda:delegateExpression` into an effect binding as for a Send Task under [CIB-EXT-0023](#cib-ext-0023--send-task-performed-by-a-configured-handler), matched on the delegate alone since an event definition has no `implementation`. The throw's occurrence opens one effect item with no arguments and waits for its result: a success, which carries no values since a throw Event has no output mappings, passes the token on or consumes it at an End; a business failure raises its Error from the throw's occurrence, which has no boundaries, so the search starts at the throw's scope; a technical failure opens an incident whose retry reopens the same item, so one modeled send keeps one occurrence. CIB runs the delegate inside the command that reaches the throw, and the kernel's effect wait is the mapping [CIB-OP-0002](#cib-op-0002--synchronous-cib-delegate-transaction-mapped-to-a-durable-effect-boundary) makes for a Service Task's success; a technical failure, which rolls CIB's reaching command back, is [CIB-EXT-0049](#cib-ext-0049--a-technical-failure-of-an-effect-without-a-job-boundary-opens-the-incident-cibs-asynchronous-case-opens). The standards profile refuses the form (`throw.message.bound`).

**Evidence:** The cited source; the retained [message-throw-bound](../scenarios/open-rows/message-throw-bound/README.md) answers `both-sends-succeed`, `intermediate-send-refused` and `end-send-refused`; `packages/kernel/test/message-throw.test.ts`. The [retry witness](../scenarios/open-rows/message-throw-retry/README.md) is CIB-EXT-0049's.

**Boundary:** A `camunda:delegateExpression` on a Message Intermediate throw's or Message End's event definition. `camunda:class`, `expression` and `type` (`throw.message.implementation`), `camunda:resultVariable` (`throw.message.resultVariable`), `camunda:inputOutput`, asynchronous continuations, execution listeners and Data Input Associations are refused. CIB resolves the delegate as a Service Task's, so a declared name equal to its root identifier is refused as one (`work.handlerKeyName`, CIB-LIM-0017), and a delegate no binding matches is refused (`throw.message.unboundImplementation`, [CIB-LIM-0051](#cib-lim-0051--cib-deploys-a-service-task-whose-implementation-no-binding-matches)).

### CIB-EXT-0040 — a Signal throw carries `camunda:in` variables and a business key

**Status:** Optional CIB extension for `SignalPayload.variables`; selected by the cibseven profiles

BPMN 2.0.2 §10.5.1 makes a Signal a broadcast trigger and gives a throw's Data Input Associations no receiver to fill; under `SignalPayload.none` the kernel refuses a throw's `camunda:in` copies (`throw.signal.payload`) and business key (`throw.signal.businessKey`). CIB Seven `2.2.0` builds a throw's payload from the `camunda:in` elements of its event definition and evaluates, in order, the business key, the payload and the name before it delivers. Under `variables` the kernel does the same: `source` copies a variable (an absent one as `null`, CIB-EXT-0021), `sourceExpression` evaluates at the Events level, `variables="all"` copies every variable visible from the throw at its own position, and a later target replaces an earlier one; a failing expression, a business key that is no String, or a name that is no String rolls the input back, a `null` business key is none, and a `null` name is `unsupported` (`signal-name-null`). The payload becomes the variables of every receiver the throw fires and of its broadcast intent, the business key that of the intent.

**Evidence:** Pinned `BpmnParse.java:4071-4094`, `ThrowSignalEventActivityBehavior.java:46-75`, `CallableElementParameter.java`; retained `signal-throw-payload/payload-delivered`, `throw-before-receiver-armed` and `signal-throw-expression/unbound-name`, which agree under the cibseven profiles.

**Boundary:** Intermediate Signal throws and Signal Ends. Refused under every profile: `camunda:async` (`throw.signal.asynchronous`), `local="true"` (`throw.signal.localVariables`) and Data Input Associations, which CIB never executes (`throw.signal.dataInput`).

### CIB-EXT-0041 — a Signal name is evaluated as an expression

**Status:** Optional CIB extension under `SignalNames.addresses` (CIB-INT-0028); selected by the cibseven profiles

`tSignal.name` is an `xsd:string` in BPMN 2.0.2 (`Semantic.xsd:1394`), so a standards Signal name holding an expression is refused (`signal.nameExpression`). CIB Seven `2.2.0` reads a `${…}` name as a JUEL expression: a catch resolves it when its subscription opens, a throw when it runs. The kernel reads it at the Events JUEL level: a catch whose name fails to evaluate or is no String rolls the arming back, a `null` or `""` name is `unsupported` (`signal-name-empty`), and a throw evaluates its name after its business key and payload (CIB-EXT-0040).

**Evidence:** Pinned `EventSubscriptionDeclaration.java:137-184`, `ThrowSignalEventActivityBehavior.java:51`; retained `signal-throw-expression/derived-name-differs`, `derived-name-matches`, `name-changes-before-throw` and `unbound-name`, which agree under the cibseven profiles.

**Boundary:** Intermediate catches, Event-Based Gateway arms and throws. A root Signal start whose name is an expression is refused (`start.signalNameExpression`), as CIB resolves it at deployment against an empty scope.

### CIB-EXT-0042 — an external Signal is delivered to one targeted subscription

**Status:** Optional CIB extension for `SignalDelivery.occurrenceTargeted`; selected by the cibseven profiles

BPMN 2.0.2 Table 10.88 broadcasts a Signal to every process that can receive it and names no delivery to one waiting occurrence. CIB Seven `2.2.0`'s `signalEventReceived(name, executionId)` delivers a Signal to the subscriptions of that name on one execution and fails when there is none. Under `occurrenceTargeted` a `deliver` input with a Signal trigger fires exactly the open Signal item its occurrence names when the address matches, and is rejected otherwise (`unknown-signal-subscription`); a late losing Event-Based arm is gone and rejected the same way. CIB fires every subscription of the name on the execution; the kernel's occurrence addresses one item, which agrees whenever one execution holds one subscription of the name.

**Evidence:** Pinned `SignalEventReceivedCmd.java:119-131` and `:158-162`, `RuntimeService.java:1981`; retained `signal-start-compositions/race-*`, `handover-*` and `signal-subscriptions/*`, which agree under the cibseven profiles; `signal-start-compositions/race-approved-standards` runs the standards profile, which rejects the delivery.

**Boundary:** Intermediate catches, Event-Based Gateway arms, boundaries and Event Sub-Process starts; an input form, never a model attribute. Under `broadcastOnly` `Step` rejects a `deliver` input with a Signal trigger (`signal-delivery-targeted`) before it reads the occurrence; a throw's own-State receivers fire inside the throwing step, never through that input. A targeted Signal that carries variables is rejected under every profile (`delivery-variables-not-admitted`), although CIB's `signalEventReceived(signalName, executionId, processVariables)` accepts them and sets them through each subscription it fires; a Signal's variables reach a receiver only through a broadcast (CIB-EXT-0043). CIB fires every subscription of the name on the addressed execution (`findSignalEventSubscriptionsByNameAndExecution`) where the kernel fires one item; no retained scenario holds two such subscriptions on one execution, because CIB-LIM-0026 refuses two of one name in one event scope, so that difference is unwitnessed.

### CIB-EXT-0043 — a Signal's variables install into the receiving scope

**Status:** Optional CIB extension for `SignalPayload.variables`; selected by the cibseven profiles

BPMN 2.0.2 §10.5.1 gives a Signal no data for its catchers; under `SignalPayload.none` a delivery that carries variables is rejected (`signal-variables-not-admitted`), never silently dropped. CIB Seven `2.2.0` sets a delivered Signal's variables on the receiving execution with `setVariables`. Under `variables` the kernel installs them as the firing catch's writes, each where the nearest-owner rule puts it (`WriteRule.outward`), after the values have passed the portable domain check. Data Output Associations on a Signal catch stay refused under both readings (`event.outputs`).

**Evidence:** Pinned `EventHandlerImpl.java:44-58`; retained `signal-throw-payload/payload-delivered`, which agrees under the cibseven profiles.

**Boundary:** Intermediate catches and Event-Based Gateway arms reached by a throw or a delivery; a started instance's variables are PC-SIGNAL-02's start side.

### CIB-EXT-0044 — CIB evaluates a root Conditional start over the variables a request submits

**Status:** Optional CIB extension; selected by `ConditionalStart.submittedContext` through the cibseven profiles

BPMN 2.0.2 Table 10.84 lets a Conditional Start Event's condition refer only to "static Process attributes and states of entities in the environment" and leaves the mechanism that accesses those states out of scope, so the standard defines no input that makes a root Conditional start true. CIB Seven `2.2.0` evaluates root Conditional starts on an API request (`evaluateStartConditions`) that submits variables and optionally names one definition and a business key: each condition is evaluated in a temporary execution holding only the submitted variables; a `camunda:variableName` the request does not submit makes the start false; an absent variable or property reads false and a `null` or non-Boolean result fails the request; every true start creates one instance with the business key and all submitted variables, and the handler keeps no state between requests. Under `submittedContext` the kernel evaluates a root Conditional start the same way over a start input's variables alone (`Hooks.startsFired`), with the Events-level predicate rules of CIB-INT-0025 (`condition-not-boolean`, rolled back); a start input that names one start evaluates only that start, and an unnamed one starts the single true start (`start-ambiguous` for several, `no-start-event` for none). A population's `evaluateConditions` evaluates every root Conditional start of the selected deployment, or of each key's current deployment, and starts one instance at each true start, each start its own unit of commitment (CIB-INT-0033); none in scope is `rejected no-conditional-start`, as CIB fails such a request. Under `refused` (the standards profile) a root Conditional start is refused (`start.condition`). BPMN's rule that a condition must become false and then true again is not claimed: each request is independent. `camunda:variableEvents` on a root start, which CIB deploys and ignores, is refused under every profile (`start.condition.variableEvents`), and two root Conditional starts of one process with one predicate are CIB-LIM-0027.

**Evidence:** Pinned `cmd/EvaluateStartConditionCmd.java:49-83`, `runtime/DefaultConditionHandler.java:44-134`, `el/UelExpressionCondition.java:49-67`; retained `conditional-start-compositions/large-order-*` and `expedited-order-*`, which agree once the profile selects this entry.

**Boundary:** Root Conditional start Events of the root process, started by a single-instance start input or a population's `evaluateConditions` in one tenant-less population. Event Sub-Process and intermediate Conditional Events stay CIB-EXT-0035.

### CIB-EXT-0045 — a Call names its callee by key text and binds a deployment, a version or a version tag

**Status:** Optional CIB extension for `CalledElementResolution.cibKey`; selected by the cibseven profiles

BPMN 2.0.2 types `calledElement` as `xsd:QName` (`Semantic.xsd:149`) and names no version; the standards reading (`qualifiedName`) resolves it through its namespace binding and binds the latest carried version (`work.call.binding` for any other binding). CIB Seven `2.2.0` reads `calledElement` as a definition key text, prefix included, and selects by `camunda:calledElementBinding`: `latest`, `deployment` (the caller's own deployment), `version` (`camunda:calledElementVersion`) or `versionTag` (`camunda:calledElementVersionTag`). Under `cibKey` the kernel names the carried process whose key equals the literal text and admits the same four bindings with literal values, each resolved when the caller is deployed (CIB-INT-0034): `latest` the highest eligible version, `deployment` the eligible process of the caller's own deployment, `version` and `versionTag` the eligible process carrying it. A prefixed text such as `tns:CalledProcess` names no carried process and is refused as missing, where CIB rolls the invocation back by the same key lookup; two eligible processes with one tag are `work.call.ambiguous`.

**Evidence:** Pinned `BpmnParse.java:3945-3987`, `:4016-4070`, `CallableElementUtil.java:75-103`, `ProcessDefinitionManager.java:141-162`; retained `call-binding-time/*`, whose missing, foreign-namespace, absent-version and unknown-tag forms stay PC-SCOPE-03 disagreements under the cibseven profiles (admission refuses the deployment as `work.call.calledProcessMissing`, where CIB fails only the invocation), and `called-process-call-activity` (negative calibration of the standards reading: CIB rolls back by key text where `qualifiedName` resolves the QName).

**Boundary:** Literal Call selectors; expression selectors are CIB-LIM-0032 and tenants CIB-LIM-0033.

### CIB-EXT-0046 — a Compensation throw whose `activityRef` names no Activity compensates nothing

**Status:** Recorded extension; selected by no profile, since the kernel refuses the reference under every profile (`throw.compensation.notActivity`)

BPMN 2.0.2 Table 10.94 types a Compensation Event Definition's `activityRef` as an Activity. CIB Seven `2.2.0` deploys a reference to any element of the throw's level, an Event or Gateway included, and a throw naming one finds no compensation subscription and continues at once.

**Evidence:** Pinned `bpmn/parser/BpmnParse.java:1695-1720` (`findActivityAtLevelOfSubprocess` matches any flow node of the level), `bpmn/helper/CompensationUtil.java:215-226` and `bpmn/behavior/CompensationEventActivityBehavior.java:45-54`; the retained answer of [throw-names-a-start-event](../scenarios/open-rows/compensation-activity-ref-refusals/README.md) (profile `cibseven-2.2.0`), which commits with nothing compensated.

**Boundary:** An `activityRef` naming a Start Event, Gateway or other non-Activity of the throw's level; this entry owns `throw-names-a-start-event` in the ledger.

### CIB-EXT-0047 — CIB resolves a targeted Compensation throw from any Event Sub-Process at its parent's level

**Status:** Recorded extension; selected by `ProfileOptions.compensationReferenceScope = eventSubProcessParent` through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile

BPMN 2.0.2 Tables 10.88 and 10.89 require the Activity a Compensation throw references to be visible from it: the throw lies in normal flow at the Activity's level, or in a Compensation Event Sub-Process of the Sub-Process containing the Activity. CIB Seven `2.2.0` looks the reference up at the throw's level and, when the throw lies in any Event Sub-Process, an Error, Escalation, Message, Signal, Timer or Conditional one included, at its parent's level, refusing any other reference at deployment. Under `bpmn-2.0.2` admission refuses a reference from a non-Compensation Event Sub-Process as `throw.compensation.activityLevel`.

**Evidence:** Pinned `bpmn/parser/BpmnParse.java:1695-1720` (the `TRIGGERED_BY_EVENT` step to the flow scope); the retained answer of [error-esp-throws-targeted](../scenarios/open-rows/compensation-event-subprocess-throws/README.md) (profile `cibseven-2.2.0`), which commits, and of [inner-throw-names-outer-activity and outer-throw-names-inner-activity](../scenarios/open-rows/compensation-activity-ref-refusals/README.md), which CIB refuses at deployment as the kernel does.

**Boundary:** Targeted throws inside a non-Compensation Event Sub-Process naming an Activity of its parent's level.

### CIB-EXT-0048 — a JavaScript Script Task is an effect the host evaluates over a committed snapshot

**Status:** Selected bounded extension for `ScriptTask.javascript`; selected by the cibseven profiles

BPMN 2.0.2 §10.3.3 (Table 10.12) gives a Script Task a `scriptFormat` and a `script`, and §13.3.3 runs the script when the Task is activated, but BPMN names no script language, no binding of the scope's data to script names (§10.4.1 "Script Task Mapping" only gives the script access to them) and no result assignment. CIB Seven `2.2.0` runs `javascript`, `ecmascript` and `js` on GraalJS, binds every variable visible from the execution by bare name and `execution` to the execution itself, discards assignments unless `autoStoreScriptVariables`, and writes a non-null result with `execution.setVariable(resultVariable, result)` (`bpmn/behavior/ScriptTaskActivityBehavior.java:56-59`). Under `ScriptTask.javascript` the kernel admits an inline JavaScript source and opens one effect item with the neutral descriptor `(urn:bpmn-lean:effect-protocol:script-v1, javascript)` whose arguments are every visible variable, nearest owner first, one per name; the host evaluates the source in a host-object-free Node `vm` context with the ECMAScript 2021 library, and the kernel writes the recorded result to `resultVariable` by the nearest-owner rule, as `setVariable` does. The [script semantics](kernel/semantics/SCRIPT-SEMANTICS-SPEC.md) are the contract. The standards profile refuses every Script Task (`work.script`).

**Evidence:** The cited source and the root's GraalJS probe P1 (2026-11-12, [script semantics](kernel/semantics/SCRIPT-SEMANTICS-SPEC.md#probe-p1-2026-11-12)); `packages/kernel/test/script-effect.test.ts` and `packages/temporal-host/test/script-handler.test.ts`; the retained answers (CIB Seven `2.2.0` with GraalJS 21.3.12, Verify run 43238005814) of the [JavaScript Script Task witnesses](../scenarios/open-rows/script-task-javascript/README.md): `probe-arithmetic-total`, `probe-text-label`, `probe-randomness`, `probe-wall-clock` and `nested-scope-write` agree with the kernel.

**Boundary:** An inline source whose `scriptFormat` is `javascript`, `ecmascript` or `js` ignoring ASCII case, read through String, Boolean, Null and Integer snapshot names, with a boolean, an integer in 0..2^31−1 or a well-formed String of at most 1,024 UTF-8 bytes as its result. Refused: any other language, `juel` and the absent format included (`work.script.language`), an absent source (`work.script.source`), a source starting with `${` or `#{` after Java's `trim` (`work.script.sourceExpression`), `camunda:resource` (`work.script.resource`), input and output mappings (`activity.inputMappings`, `activity.outputMappings`) and a Multi-Instance body (`activity.multiInstanceBody`). Dynamic `unsupported`: a result outside the domain (`script-result-unrepresentable`), a read of a variable of another kind (`script-value-unrepresentable`), a reference to `execution` or `Java` (`script-host-object`). An incident retry evaluates the activation's snapshot, where CIB's retried job reads the variables live. A failing synchronous script is [CIB-EXT-0049](#cib-ext-0049--a-technical-failure-of-an-effect-without-a-job-boundary-opens-the-incident-cibs-asynchronous-case-opens)'s. This entry owns the ledger entries of `probe-other-language-juel` and `multi-instance-body`, the kernel's refusals against CIB's execution.

### CIB-EXT-0049 — a technical failure of an effect without a job boundary opens the incident CIB's asynchronous case opens

**Status:** Selected bounded extension, a consequence of CIB-EXT-0013 and CIB-OP-0002; selected by the cibseven profiles through `TechnicalFailure.incident`

BPMN 2.0.2 defines no technical failure of an Activity's work (§13.3.3 defines only a fault), no incident and no command atomicity, so no clause decides what a failure inside the command that reached the work means. CIB Seven `2.2.0` runs a delegate without `asyncBefore`, a Script Task's script included, inside the command that reaches it, and a failure there goes through `executeWithErrorPropagation` and rolls that command back (`bpmn/behavior/AbstractBpmnActivityBehavior.java:87-109`); only an `asyncBefore` job fails on its own, with retries and a `failedJob` incident (CIB-EXT-0013). The kernel's effects run after the reaching command commits, since the effect result is a later input ([CIB-OP-0002](#cib-op-0002--synchronous-cib-delegate-transaction-mapped-to-a-durable-effect-boundary)), so the kernel cannot roll that command back and does not imitate it: under `TechnicalFailure.incident` it opens the incident the asynchronous case opens, whose retry reopens the same effect occurrence, and under `TechnicalFailure.hostFailure` it answers `unsupported` (`effect-technical-failure`) as for every effect.

**Evidence:** The cited source; the CIB runner realizes a synchronous technical failure as an engine exception from its delegate (`CibSevenScriptedEffect`), which rolls the reaching command back. The retained answers (CIB Seven `2.2.0`, Verify run 43238005814) of [service-task-failure-then-retry and send-task-failure-then-retry](../scenarios/open-rows/synchronous-effect-failure/README.md), [technical-failure-then-retry](../scenarios/open-rows/message-throw-retry/README.md), and the synchronous script failures `probe-unknown-name` and `probe-thrown-error` of the [JavaScript Script Task witnesses](../scenarios/open-rows/script-task-javascript/README.md); `packages/kernel/test/message-throw.test.ts`. In each, CIB rolls the reaching command back where the kernel commits it and opens an incident.

**Boundary:** A technical failure of a Service Task or configured Send Task without `camunda:asyncBefore` on the Activity or on its Multi-Instance loop, of every bound Message throw ([CIB-EXT-0039](#cib-ext-0039--a-message-throw-performed-by-a-configured-handler); asynchronous throws are refused), and of a Script Task without `camunda:asyncBefore` (CIB-EXT-0048). The CIB comparison for such a run holds for nothing after the reaching command; this entry owns the ledger entries of the five witnesses above. An `asyncBefore` effect's failure is CIB-EXT-0013's and agrees.

## Permitted operational-detail register

### CIB-OP-0001 — CIB host task identity mapped to project semantic task identity

**Status:** Reviewed operational mapping

CIB creates a generated task ID and addresses completion through `TaskService.complete(taskId)`. BPMN does not prescribe that database identity, Java API, or a portable encoding for one task occurrence.

The oracle adapter therefore maps the one live CIB task to project-owned identity `(Process instance, BPMN element, activation ordinal)` and keeps the generated CIB ID local to the query/complete call. A wrong activation is rejected by this mapping before calling CIB; after completion or interruption, absence of a matching live CIB task supports stale-occurrence rejection. The bounded project consistency probe starts the exact sequential fixture, captures its generated CIB task ID, completes that task, and then observes pinned CIB Seven reject a second `TaskService.complete` call for the now-non-live generated ID. The retained Sub-Process Error schedule supplies the separate interruption case. Together they confirm that the adapter's “no matching live host task means refuse” assumption agrees with the pinned engine at both selected lifecycle boundaries, but they do not turn the project activation ordinal into a raw CIB engine concept or close the adapter-decided activation cell.

This mapping preserves the BPMN-visible lifecycle under `CIB-AGR-0002` while avoiding false identity equivalence across CIB, Lean, TypeScript, and Temporal. Evidence and exact exclusions are in the [User Task interaction capsule](kernel/semantics/WORK-SEMANTICS-SPEC.md), [Sub-Process Error-propagation capsule](kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md), [the consistency probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenConsistencyProbeTest.java), and [CIB runner documentation](../runners/cibseven/README.md).

### CIB-OP-0002 — synchronous CIB delegate transaction mapped to a durable effect boundary

**Status:** Reviewed operational mapping

CIB Seven `2.0.0` executes the selected CreateDocument delegate and its input/output mappings synchronously inside the command transaction. It exposes no committed intermediate state corresponding to the project's effect intent or in-flight Temporal Activity. The project semantic core instead commits an effect wait and immutable arguments before the Temporal adapter performs the external effect, then applies one validated result patch and output mapping. This `2.0.0` observation is the frozen A12 CreateDocument evidence, which the profile consolidation (#42) neither retires nor regenerates.

For the approved success-only capsule, both accounts agree on admitted input and final Process variables. The CIB execution is a host-realization check for those boundary observations, not an independent derivation of the project intermediate state. Failure atomicity, rollback after an external mutation, cancellation, and fault delivery are deliberately excluded and require separate semantic decisions. The same mapping covers a JavaScript Script Task without `asyncBefore` ([CIB-EXT-0048](#cib-ext-0048--a-javascript-script-task-is-an-effect-the-host-evaluates-over-a-committed-snapshot)): CIB evaluates it inside the reaching command, the project commits the effect at activation and its recorded result as the next input, and the differential folds a successful result into the reaching command (`foldSynchronousEffects`), since the CIB runner reports the script's execution as it reports a synchronous delegate's.

**Evidence:** [CreateDocument specification](kernel/semantics/DATA-SEMANTICS-SPEC.md), [frozen packaged-engine runner test](../adoption/a12/legacy/source-tree/runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenCreateDocumentScenarioRunnerTest.java), [frozen content-bound `2.0.0` evidence](../adoption/a12/legacy/source-tree/scenarios/create-document-data/cibseven-evidence.json), and the [frozen A12 target profile](../adoption/a12/legacy/source-tree/profiles/cibseven-2.0.0-a12-create-document-draft/README.md).

### CIB-OP-0003 — synchronous caught Error mapped to a durable typed result

**Status:** Reviewed operational mapping

CIB Seven `2.0.0` invokes the selected delegate, catches its Java `BpmnError`, applies `CIB-EXT-0004`, destroys the Activity scope, and opens the boundary User Task in one engine command. It exposes no committed effect intent or recoverable interval between the external delegate action and Error routing.

The project instead commits an effect intent, runs a Temporal Activity, and receives a successful typed business result containing code, required nullable message, and validated Activity-local patch. The semantic core then performs the selected atomic patch → mapping → cleanup → boundary transition. Activity failure, retry exhaustion, and Workflow failure remain adapter outcomes rather than business Errors.

**Evidence:** [Boundary-error specification](kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md), [frozen packaged-engine phase-zero probe](../adoption/a12/legacy/source-tree/runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBoundaryErrorPhaseZeroProbeTest.java), frozen ordinary CIB scenario evidence, and the retained Temporal Activity history/replay.

**Boundary:** This mapping compares the admitted final host observations while retaining different host transaction boundaries. It does not claim rollback equivalence, an independent CIB semantic effect-intent state, Java exception transport through Temporal, or compatibility for unmatched Errors.

### CIB-OP-0004 — synchronous JUEL command rollback mapped to speculative semantic commitment

**Status:** Superseded: the kernel evaluates JUEL inside the step ([expression semantics](kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md)), so no profile selects this mapping

CIB Seven `2.0.0` evaluates a conditional Sequence Flow synchronously inside the command that completes the preceding User Task or starts the Process. When evaluation fails, the engine command rolls back: the preceding User Task remains available after failed completion, while a failure during Process start leaves no runtime or historic Process instance.

The proposed project host does not treat JUEL as an application effect or expose speculative semantic state while an asynchronous evaluator Activity is pending. It persists a private suspended continuation rather than relying on an Update handler's call stack or mutating the committed core state; the single semantic loop invokes and awaits the Activity, the originating handler remains pending for its command result, and public Queries continue to expose the last committed semantic state. A valid evaluation receipt commits completion plus routing atomically; one semantic `evaluationError` discards the continuation and returns `rolledBack` with the exact pre-command state.

**Evidence:** [JUEL evaluation architecture decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md), [packaged-engine gateway rollback probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenExclusiveGatewayJuelProbeTest.java), and the [Temporal hosting preflight](research/TEMPORAL-EXECUTION-RESEARCH.md#expression-language-hosting).

**Boundary:** The private continuation is a project durability mechanism, not a CIB or BPMN public state. Syntax rejection remains an admission failure. Temporal Worker loss, timeout, malformed transport, cancellation, and exhausted retries remain infrastructure or adapter failures; terminal Activity failure discards the continuation, fails the originating Update outside the semantic result algebra, preserves the committed User Task wait, and resumes the queued input loop. This mapping does not authorize a general transaction emulator, arbitrary expression side effects, or rollback of external effects.

### CIB-OP-0005 — CIB Message subscription mapped to project semantic subscription identity

**Status:** Reviewed operational mapping selected by the Receive Task capsule

CIB creates a generated execution identity for the public Message event subscription and addresses delivery through the subscription's Message name plus execution ID. BPMN does not prescribe either host identity, while the project addresses an exact runtime occurrence by `(Process instance, BPMN element, activation ordinal)` and checks the source Message ID through a closed `directMessage` channel.

For the one admitted non-repeating Receive Task, the oracle adapter maps the sole live CIB subscription's activity ID to activation `1`, replaces CIB's generated Process-instance identity with the scenario's stable semantic instance identity, and derives the direct Message ID from the deployed Receive Task definition rather than equating it with CIB's event name. It keeps the generated execution ID local to the public query/delivery call. Missing, multiple, mismatched, or already consumed subscriptions are refused before public delivery.

This mapping preserves the subscription lifecycle classified by `CIB-AGR-0009` without claiming identity equivalence across CIB, Lean, TypeScript, and Temporal. Evidence belongs to the [Message-addressed Receive Task scenario](../scenarios/message-addressed-receive-task/README.md), its content-bound retained result, and the [Receive Task specification](kernel/semantics/WORK-SEMANTICS-SPEC.md).

**Boundary:** The mapping is limited to one live, direct-Message, activation-`1` Receive Task subscription in one Process instance. It does not establish Message-name/Message-ID equivalence, general correlation, repeated activation, multiple subscriptions, buffered delivery, Message Event compatibility, or global Message routing. The runner also resolves a catch's, boundary's or Event Sub-Process start's subscription from the published Message identifier to the name CIB subscribed by, the resolved value for a name expression (CIB-INT-0024).

### CIB-OP-0006 - synchronous mapped-success transaction mapped to a durable effect boundary

**Status:** Reviewed operational mapping

CIB Seven `2.0.0` invokes the neutral mapped-success delegate and its input/output mappings synchronously inside the start command. The project instead commits an effect wait and immutable arguments, executes a Temporal Activity, then applies the validated Activity-local patch and output mapping. Both accounts agree at the selected final Process-variable observation boundary.

**Evidence:** [Mapped-success scenario](../scenarios/mapped-success-service-task/README.md), its content-bound CIB evidence, the product-neutral Lean and TypeScript fixtures, and Temporal Activity history/replay.

**Boundary:** Failure atomicity, rollback after an external mutation, cancellation, and fault delivery remain excluded. This relation does not equate CIB's command transaction with the project's committed effect wait.

### CIB-OP-0007 - synchronous mapped boundary Error mapped to a durable typed result

**Status:** Reviewed operational mapping

CIB Seven `2.0.0` invokes the neutral mapped-boundary delegate, catches its Java `BpmnError`, applies `CIB-EXT-0009`, clears Activity-local state, and exposes `ReviewMappedError` in one engine command. The project commits an effect intent, executes a Temporal Activity, receives a typed business result, then performs the selected atomic patch, mapping, cleanup, and boundary transition. The CIB Seven `2.0.0` profiles retired into the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/README.md) at the profile consolidation (#42), and their evidence is regenerated on `2.2.0` in the hosted lane.

**Evidence:** [Mapped-boundary-Error scenario](../scenarios/mapped-boundary-error-service-task/README.md), its content-bound CIB evidence, the product-neutral Lean and TypeScript fixtures, and Temporal Activity history/replay.

**Boundary:** This compares final selected observations while retaining distinct host transaction boundaries. It does not claim rollback equivalence, Java exception transport through Temporal, or compatibility for unmatched Errors.

### CIB-OP-0008: CIB failed-job incident mapped to a semantic effect incident

**Status:** Selected operational mapping; implemented and evidence-closed

CIB exposes a raw job ID, incident ID, retry count, execution association, and incident configuration. The project semantic core instead owns one stable effect occurrence and one literal-generation-1 incident. The adapter requires exact raw job and incident partners, then maps them to `EffectIncidentId { effectId, generation: 1 }`; neither raw identity nor retry count enters canonical state.

Retrying removes the incident while retaining the same occurrence. A later technical failure remains a host failure and creates no second semantic incident, even when CIB replaces the raw incident identity. Literal generation 1 content-binds the one admitted operator command without presenting CIB engine storage as semantic authority.

**Evidence:** The [packaged-engine phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskIncidentPhaseZeroProbeTest.java) proves that CIB retains the same raw job and Process through the selected incident reset; its later replacement incident remains unselected research evidence. The [retained evidence](../scenarios/service-task-incident/cibseven-evidence.json), [CIB incident projector](../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenOpenWaitProjector.java), [incident command executor](../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenCommandExecutor.java), and incident runner test (`CibSevenIncidentRunnerTest`, removed at W0.3b) bind and guard the raw-to-canonical mapping. The [Service Task incident capsule](kernel/semantics/WORK-SEMANTICS-SPEC.md) owns the projection refusal matrix, literal Lean/core identity account, and transport/semantic result separation.

**Boundary:** The mapping does not claim CIB independently derives semantic effect identity or generation. It does not expose job, incident, execution, Workflow, Run, Activity, attempt, retry-budget, cause, or stack identity and does not authorize Process cancellation or Product 2 action state.

### CIB-OP-0009: incident-scoped external termination mapped to semantic root cancellation

**Status:** Selected operational mapping; implemented and evidence-closed

CIB addresses public deletion with its generated root Process-instance ID and records `EXTERNALLY_TERMINATED` in history. The project profile instead publishes one stable semantic root identity and one exact generation-1 incident identity. Its adapter privately binds those facts to the exact live CIB root and matching failed-job incident before invoking deletion, then requires the externally terminated historic root before projecting typed `cancelled` state.

The semantic core independently derives the unique root occurrence, removes its complete live region, preserves Process variables and monotonic counters, and commits cancellation. CIB does not define that runtime representation or the project command identity. Runtime absence alone is insufficient because ordinary completion has the same absence; the historic-state discriminator and successful control make the mapping non-vacuous.

**Evidence:** The [phase-zero cancellation probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskIncidentPhaseZeroProbeTest.java), selected [`CIB-EXT-0014`](#cib-ext-0014-public-external-deletion-of-one-incident-bearing-root-process), [retained successor evidence](../scenarios/service-task-incident-cancellation/cibseven-evidence.json), [exact incident/root command executor](../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenCommandExecutor.java), [positive termination projector](../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenStateProjector.java), and the [incident-scoped Process cancellation specification](kernel/semantics/WORK-SEMANTICS-SPEC.md).

**Boundary:** Raw CIB Process, job, incident, execution, historic, and reason identity remains producer diagnostics only. This mapping does not claim that CIB derives semantic occurrence identity, cleanup invariants, counter preservation, Temporal closure behavior, authorization, audit, or Product 2 action state.

### CIB-OP-0010: concurrent async-before Service Task continuations mapped to concurrent effect occurrences

**Status:** Selected operational mapping; implemented, standards-only evidence

CIB interrupts each execution that enters an async-before activity (`PvmAtomicOperationTransitionCreateScope.isAsync` and `PvmAtomicOperationActivityStartCreateScope.isAsync`) and continues it from its own `AsyncContinuationJobHandler` job, so each token arriving at a Service Task gets its own continuation job. Under the default engine configuration sibling jobs have no acquisition order: priority, timer preference and due-date ordering are all off (`ProcessEngineConfiguration`, lines 209–211), and `JobManager.findNextJobsToExecute` then disables sorting (line 242), so sibling jobs may complete in either order. Jobs are exclusive by default (`AcquirableJobEntity.DEFAULT_EXCLUSIVE`), so jobs of one Process instance do not run at the same time. Each job runs in one required transaction (`ExecuteJobsRunnable`, line 56), in which a `JavaDelegate` resolved from a delegate expression is invoked and the execution leaves the task (`ServiceTaskDelegateExpressionActivityBehavior`, lines 115–119), so invocation and completion commit together.

The project instead commits one effect wait per occurrence, runs one Temporal Activity per wait, and commits each result as its own command in callback order. By the source cited above, both accounts are expected to agree on the public boundary of open User Tasks, open effects (CIB's pending continuation jobs) and Process status after each completion; no CIB run observes it. Job identity, acquisition and transaction timing are CIB host facts, not semantics.

**Evidence:** Pinned checkout `5a45b47ea2` source cited above; the [concurrent scope Service Task schedules](../scenarios/concurrent-scope-service-tasks/README.md) in both completion orders of each retained model, registered as standards-only pipeline cases; and the [recovery witness](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/packages/temporal-adapter/testkit/test/concurrent-scope-service-tasks-recovery.temporal-test.ts) through Continue-As-New, Worker replacement and replay. No CIB run is retained; a probe of one retained model would be optional calibration. Under the nested scope-data profile the [order fulfilment schedules](../scenarios/concurrent-structured-scope-data/README.md), registered as standards-only pipeline cases, the [recovery witness](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/packages/temporal-adapter/testkit/test/concurrent-structured-scope-data-recovery.temporal-test.ts) and the [concurrent structured scope data probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenConcurrentStructuredScopeDataProbeTest.java) along its released-job schedule apply the same mapping to data-bearing effects.

**Boundary:** Under the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json), for data-free overlay-bound Service Tasks admitted by the [concurrent scope Service Tasks](kernel/semantics/WORK-SEMANTICS-SPEC.md) family under the default job-acquisition configuration, and under the [cibseven-2.2.0-scope-chain profile](../profiles/cibseven-2.2.0-scope-chain/profile.json) for its data-bearing Service Tasks on Parallel branches in Sub-Process bodies ([concurrent structured scope data](kernel/semantics/DATA-SEMANTICS-SPEC.md)), under the same configuration; for them, argument agreement holds only on schedules where each continuation job runs before the next command commits. No job, transaction-timing, exclusive-lock, retry, incident or exactly-once external-effect equivalence is claimed, and no claim covers asynchronous continuation of other activity kinds.

### CIB-OP-0011: CIB execution waiting at an addressless Receive Task mapped to the project occurrence

**Status:** Selected operational mapping; implemented and evidence-closed

CIB keeps no event subscription for a Receive Task without a Message, so its public state shows only an execution whose activity is the task, addressed by a generated execution ID. BPMN prescribes no host identity, while the project addresses the wait by `(Process instance, BPMN element, activation ordinal)` with the field-free `unspecifiedMessage` channel selected by `CIB-INT-0004`.

For the one admitted addressless Receive Task, the oracle adapter finds the execution waiting at the task's activity ID by an execution query, maps it to activation `1` of the scenario's stable semantic instance with channel `unspecifiedMessage`, and maps the project delivery to `RuntimeService#signal(executionId)` without variables, keeping the execution ID local to the call. Missing, multiple or already consumed executions are refused before the call. The projected open wait is adapter-derived, not an engine-observed Message subscription.

**Evidence:** The [addressless Receive Task scenario](../scenarios/addressless-receive-task/README.md), its content-bound retained result and the [addressless Receive Task account](kernel/semantics/WORK-SEMANTICS-SPEC.md).

**Boundary:** The mapping is limited to one live activation-`1` addressless Receive Task wait in one Process instance. It does not establish repeated activation, multiple waits, signal names, trigger variables or signals to other activities.

### CIB-OP-0012 — a CIB-generated called instance identifier mapped to the project's derived `call:` identity

**Status:** Recorded operational mapping

CIB generates a process instance identifier per Call. BPMN prescribes no host identity, and the project derives a stable one from the calling instance, the Call Activity and its activation, each part length-prefixed so nested identifiers cannot collide.

**Evidence:** The kernel's `State.calledInstanceId`, and [row traceability](kernel/ROW-TRACEABILITY-MAP.md#rule-basis).

**Boundary:** Identity of a called instance only. The called definition is bound per instance in `InstanceData.definition`, and CIB's generated identifier is not exposed.

### CIB-OP-0013 — the arguments of an asynchronous effect wait are not observable through CIB's public API before its job runs

**Status:** Recorded observation boundary of the CIB evidence; applied by the differential comparator, not a profile selection

An asynchronous Service or Send Task in CIB Seven `2.2.0` stops before it enters the activity: `PvmAtomicOperationTransitionCreateScope#isAsync` and `PvmAtomicOperationActivityStartCreateScope#isAsync` (line 30) defer the start to an `AsyncContinuationJobHandler` job, and the input mappings run only when that job enters the activity instance (`PvmExecutionImpl#enterActivityInstance`, line 1314, `executeIoMapping`). While the effect waits, no public API shows the arguments the delegate will receive, so the runner publishes the effect wait with an empty argument list (`CibSevenOpenWaitProjector.java:369-373`). The kernel publishes the arguments it committed with the wait. Neither account is a BPMN fact the other contradicts: the arguments are the same input-mapping evaluation, observed by the kernel at the wait and by CIB only inside the job.

The differential comparator therefore leaves out `detail.arguments` of an `effect` open wait, and `detail.effect.arguments` of an `incident` open wait, whose failed job rolled its input mappings back with it, whenever one side is retained CIB evidence, as it leaves out the kernel-only `code` and `scopes`; the two kernels and the Temporal host still compare them.

**Evidence:** The pinned source cited above; the runner's projector comment; the [automation business error routing](../scenarios/open-rows/automation-business-error-routing/README.md), [handler reuse](../scenarios/open-rows/automation-handler-reuse/README.md), [parallel region composition](../scenarios/open-rows/parallel-region-compositions/README.md) and [configured send](../scenarios/open-rows/send-task-configured-send/README.md) witnesses, whose only difference from the kernel was this list (CIB Seven `2.2.0` evidence, 2026-11-10); the comparator test of `packages/differential/test/comparator.test.ts`.

**Boundary:** The `arguments` of an `effect` open wait against retained CIB evidence only. It covers the effect an incident wait carries; it does not cover the arguments the delegate receives when its job runs, or synchronous effects, which the comparator folds under `CIB-OP-0002`, `CIB-OP-0003` and `CIB-OP-0007`. Argument agreement remains a claim of the kernels and the Temporal host, not of CIB evidence.

### CIB-OP-0014 — a decision result's entry map is compared by name

**Status:** Recorded observation detail; applied by the runner's projection, not a profile selection

CIB Seven `2.2.0` returns a decision's output entries in a `HashMap`, whose iteration order is no semantic claim. The CIB runner projects a Map with its entries ordered by name (`ScenarioVariableValueProjection#projectMap`), and the kernel writes a Map in key order, so the two compare entry by entry.

**Evidence:** `ScenarioVariableValueProjection.java` `projectMap`; the `collect-entries-two-outputs` witness of [business-rule-hit-policies](../scenarios/open-rows/business-rule-hit-policies/README.md).

**Boundary:** The order of Map entries only; names, kinds and values still compare exactly.

### CIB-OP-0015 — a root List of Strings is observed in the legacy `stringList` kind

**Status:** Recorded observation boundary of the CIB evidence; applied by the differential comparator, not a profile selection

Java stores the legacy `stringList` kind and a structured `list` of Strings as the same `ArrayList`, so the CIB runner cannot tell them apart and projects every root-level List of Strings, the empty one included, as `stringList` (`ScenarioVariableValueProjection#projectHost`). Against retained CIB evidence the comparator therefore reads a kernel root `list` whose members are all Strings, in a state's variables and a User Task's inputs, as that `stringList`; a nested List keeps its kind, and two kernels or the Temporal host compare kinds exactly.

**Evidence:** The runner's projection comment; the decision witnesses `collect-overlap`, `collect-no-match`, `rule-order-overlap`, `interval-endpoints-*` and `decimal-literal` of [business-rule-hit-policies](../scenarios/open-rows/business-rule-hit-policies/README.md); the comparator test in `packages/differential/test/comparator.test.ts`.

**Boundary:** Root bindings against retained CIB evidence only; order and members still compare.

### CIB-OP-0016 — a split's branches run in declaration order, each to its next wait, join or end

**Status:** Selected operational detail; selected by `ProfileOptions.branchSchedule = declarationDepthFirst` through both CIB profiles. The standards profile reads `orderInvariant`.

BPMN 2.0.2 lets the branches of a split run concurrently in any interleaving (§13.3.1, Table 13.1; [BPMN21-429](https://issues.omg.org/issues/BPMN21-429) cautions against treating outgoing-flow order as portable). No order among them is the construct's meaning.

CIB Seven `2.2.0` reverses a split's outgoing executions (`PvmAtomicOperationTransitionDestroyScope:128-134`) for the LIFO invocation queue of `CommandInvocationContext` (`:95,139`). It ends a Sub-Process in the operation that ends its last execution (`PvmAtomicOperationActivityEnd:105`), before that queue reaches a sibling branch. As a result, the first-declared branch runs first, each to its next wait, join or end, before the next branch starts, and the last-declared branch's write is the one left.

A parallel Multi-Instance body is ordered the same way. CIB creates every instance's execution, then starts them from the last index down (`ParallelMultiInstanceActivityBehavior:50-61`, comment `:56-57`); each start is an `ACTIVITY_START_CREATE_SCOPE` operation (`MultiInstanceActivityBehavior:76-82`, `PvmExecutionImpl:822-857`) that a running command queues rather than runs (`PvmAtomicOperationActivityStartCreateScope:33-35`, `CommandInvocationContext:99-105`). The LIFO queue therefore runs instance 0 first, each instance to its next wait, join or end, its own completion included, before the next begins, and all of them before the work queued beneath the body. A queued start whose execution has ended meanwhile is skipped (`AtomicOperationInvocation:77-82`): a completion condition that holds deletes the unstarted executions, which are still active (`ParallelMultiInstanceActivityBehavior:99-104`, `PvmExecutionImpl:624`), and whose activity instance `executeActivity` had cleared (`PvmExecutionImpl:855`), so no end listener runs for them, history included (`PvmAtomicOperationActivityInstanceEnd:73-75`, `AbstractEventAtomicOperation:50`). An instance whose scope, or an enclosing one, is removed before its turn therefore never begins and leaves no activity instance. BPMN 2.0.2 §13.3.7 generates parallel instances with no order among them and cancels "the remaining instances" when the condition holds; it permits the interleaving in which those instances took no step and fixes no history for them, so both the order and the missing occurrence are operational detail. The standards profile keeps `orderInvariant` and begins every instance at entry. A sequential body is unaffected: its next instance begins from its predecessor's completion under every profile (`SequentialMultiInstanceActivityBehavior:44`, `:59`).

The kernel reproduces this as follows (`Feature.Flow.queued`, `Feature.MultiInstance.queueInstances`, `Step.nextToken`):

- It queues a split's flows reversed and takes the newest token first.
- It completes an idle scope occurrence before the next token moves.
- A parallel Multi-Instance body defers its instances' begins onto the closure's work stack, instance 0 on top (`State.deferBegins`); `Step` dispatches each deferred begin as the `begin` signal it was, with that signal's journal cause. An instance removed before its turn has a scope occurrence but no flow-node occurrence and no journal fact.

The schedule is observable when one branch writes a name another branch reads or writes before either waits. That is a race BPMN does not resolve, so the standards profile refuses it at admission rather than inherit an order (`flow.concurrentWrite`, a forward-compatible restriction). It is observable too when one branch acts on work another begins or completes in that closure: an Error, Escalation or Cancel an interrupting catcher around the split catches, a Terminate End or an interrupting Event Sub-Process removes the sibling's work only if it began first, a Signal throw resumes the sibling's catch only if it is already open, and a Compensation throw finds the sibling's record only if it completed; so are the continuations of Signal subscriptions two branches leave open, which one later broadcast resumes in the order the split's closure opened them. The standards profile refuses those as `flow.concurrentInterference` ([#81](https://github.com/mbackschat/bpmn-lean-experiment/issues/81)); CIB's schedule makes the first-declared branch's act come first, which is this entry's selection. Two instances of one parallel Multi-Instance body race the same way when an instance writes a name before its next wait, or completes in its entry closure beside a completion condition; the standards profile refuses that too (`multiInstance.concurrentInstances`, [#72](https://github.com/mbackschat/bpmn-lean-experiment/issues/72)).

A branch's footprint covers:

- **Reads:** input and output mapping sources, a Call's input sources, outgoing conditions and a Multi-Instance definition. An element the branch stops at counts only what it reads when it begins.
- **Writes:** output targets and a Call's outputs.

**Evidence:** The pinned source above. The retained [split-branch-order](../scenarios/open-rows/split-branch-order/README.md) witnesses agree:

- `parallel-fork`, `start-split` and `inclusive-split`;
- `uneven-fork` (depth first against interleaved);
- `nested-fork` (depth-first recursion);
- `subprocess-fork` (a Sub-Process completes before the sibling branch).

Kernel tests: `packages/differential/test/flow-branch-schedule.test.ts`; the standards refusal of a read-write race is in `packages/kernel/test/admission-refusals-flow.test.ts`, and of interfering branches and instances in `packages/kernel/test/admission-refusals-flow-interference.test.ts`. The retained [multi-instance-sub-process](../scenarios/open-rows/multi-instance-sub-process/README.md) witnesses `concurrent-condition-race`, `concurrent-write-race` and `concurrent-write-race-call` run such a race of parallel instances against CIB, which commits it in its instance order where the standards profile refuses it at admission (`multiInstance.concurrentInstances`).

The retained witnesses agree: `parallel-two-bodies-natural`, `parallel-two-bodies-reversed`, `parallel-sixteen-bodies-natural`, `parallel-sixteen-bodies-reversed`, `parallel-seventeen-bodies`, `parallel-cardinality-changed-after-entry`, `parallel-cardinality-two-reversed`, `parallel-early-cancel-keeps-sibling-write` and `parallel-early-cancel-of-fourteen` of [multi-instance-sub-process](../scenarios/open-rows/multi-instance-sub-process/README.md); `parallel-counters` and `nested-inner-hides-outer` of [multi-instance-instance-sites](../scenarios/open-rows/multi-instance-instance-sites/README.md); the three of [terminate-multi-instance-bodies](../scenarios/open-rows/terminate-multi-instance-bodies/README.md); and `parallel-bodies-own-listeners` of [message-esp-repeatable](../scenarios/open-rows/message-esp-repeatable/README.md). The retained separating witnesses `parallel-entry-reads-earlier-instance`, `parallel-first-instance-completes-early` and `parallel-body-above-sibling-branch` of multi-instance-sub-process agree too. Kernel test: `packages/kernel/test/multi-instance-begin-order.test.ts`.

**Boundary:** Branches within one closure, and the instances of a parallel body begun within one closure. The order across inputs is fixed by the inputs. A decision task's `resultVariable` is not in the footprint, since every profile that reads `orderInvariant` refuses a decision task (`work.rule`); a profile that admits both must add it first.

### CIB-OP-0017 — the engine clock after a rolled-back input is the runner's environment clock

**Status:** Operational mapping

A rolled-back input leaves the kernel's state, its logical time included, as before the input (the Outcome contract). The CIB runner sets `ClockUtil` to the stimulus's time before it executes the job or command, so CIB's next observation shows that time even though the command rolled back (`business-rule-hit-policies/after-timer-failure`: the Timer still open at 10,000, the clock at 10,000). The clock reading after a rolled-back input is the harness's environment, not a semantic fact. No comparator maps it: the disagreement ledger lists the observation under this entry, so the comparison still reports it.

**Evidence:** `runners/cibseven/.../CibSevenCommandExecutor.java:184-196`; retained `after-timer-failure`.

**Boundary:** Observations after a `rolledBack` input that stated a later time.

### CIB-OP-0018 — CIB attached subscriptions numbered by counting the kernel's reservations

**Status:** Operational mapping of the CIB runner

CIB has no activation numbers and keeps a non-interrupting attached subscription on its host's execution, a cycle successor as a new job there. The runner numbers each subscription without an activity instance of its own (Timer, Message, Signal or Conditional boundary, Event Sub-Process start, Event-Based Gateway arm) and each begun occurrence of such an element as the kernel reserves them: one reservation per host activation (observed or not), one per cycle successor at its predecessor's firing, a fresh one per firing whose subscription stays open, the subscription's own for a firing that closes it; a begin the runner did not drive takes a fresh activation when its element does not interrupt, otherwise its element's oldest live reservation. `recurrence.remaining` is the declared count less the chain's earlier firings.

**Evidence:** `CibSevenOccurrences` (class comment, `subscriptionActivation`, `timerFired`, `delivered`), `CibSevenOccurrenceNumberingTest`; `repeatable-event-subscriptions/boundary-timer-repeat`, `message-boundary-repeated/user-host-reentered-after-delivery`, `timer-recurrence/count-finite-overlap` after the retake.

**Boundary:** CIB runner projection only; no kernel meaning. Non-runner-driven interrupting firings (Conditional, Signal) of an element with several live reservations take the oldest, which is unwitnessed. CIB-OP-0005 keeps its Receive Task boundary.

### CIB-OP-0019 — a Signal throw's own-State receivers fire inside the throwing step, the others through its broadcast intent

**Status:** Operational mapping of a Signal throw within one kernel State; cross-instance atomicity is unclaimed

CIB Seven `2.2.0` lists every active subscription of a thrown Signal's name, delivers to each before the thrower leaves, skips one whose execution an earlier receiver ended, and runs them in the throwing command. The kernel splits that delivery at its State boundary. Within the thrower's own State (its instance, its called instances and its callers) the throw lists the open items of its address first, by process instance and then in arming order for CIB's unordered `HashSet`, and fires each through `Signal.fire` inside the throwing step, before its own completion: a receiver armed during the delivery is not delivered, an item gone by its turn is skipped, and the thrower leaves only if its occurrence still stands. Every other receiver is reached through the one `BroadcastIntent` the throw appends to `State.outbox`, published only with a committed input; the intent never returns to its own State. For one State the observations agree.

**Evidence:** Pinned `ThrowSignalEventActivityBehavior.java:53-61`, `:86-89`, `EventSubscriptionManager.java:111-126`; retained `signal-throw-literal/*`, `signal-throw-payload/*`, which agree under the cibseven profiles.

**Boundary:** Receivers inside the thrower's own State. Which other States receive an intent, in what order and with what commitment is the population's (PC-SIGNAL-04).

## Configuration-specific register

### CIB-CFG-0001 — pinned Milestone 0 oracle environment

**Status:** Reviewed configuration dependency

The current draft profile pins CIB Seven `2.2.0` at revision `834a9874760de8a0107f7c1b32806e37f17fb017`, Java 21, H2 `2.3.232`, disabled automatic job execution, an explicit logical clock, audit history, and default history TTL `P180D`. CIB deployment required the TTL in this environment; audit history remains outside the canonical observation boundary, while controlled time and scheduling prevent accidental host nondeterminism from entering the current capsule.

This is a profile constraint, not evidence that CIB differs from BPMN. It does not claim that another database, history level, scheduler setting, plugin set, or engine configuration produces the same observations. The machine-readable declarations are in the [current profile](../profiles/cibseven-2.2.0/profile.json).

### CIB-CFG-0002 — explicit release of the Service Task continuation job

**Status:** Reviewed configuration dependency

Under `CIB-CFG-0001`, automatic job execution is disabled. Starting the exact `CIB-EXT-0001` Process creates one immediately executable async-before continuation job with no due date. The harness deliberately leaves that job waiting until the explicit Service Task effect schedule releases it through the public job API. Plain success executes it once; the fail-after-mutation schedule observes public retry decrement from three to two and executes the same durable job again without administrative retry changes.

The waiting interval is a harness scheduling input and the job is a CIB host construct. Neither is BPMN logical time, effect intent, or caller interaction. The content-bound retained result uses plain success; retry and re-execution details remain raw producer evidence.

### CIB-CFG-0003 — pinned A12 CIB Seven 2.0.0 oracle environment

**Status:** Reviewed configuration dependency

The A12 CreateDocument profile pins CIB Seven `2.0.0` at revision `57ed69550f1c9c2619b9711d8877418bb084a371`, Java 21, H2 `2.3.232`, disabled automatic job execution, an explicit clock, audit history, and default history TTL `P180D`. This identity is distinct from every `2.2.0` profile and evidence envelope even where selected engine source files are byte-identical.

The synchronous CreateDocument path does not use a continuation job, but the full environment remains pinned so deployment, history, cleanup, and later comparisons are reproducible. Passing a `2.2.0` behavioral probe under a dependency override is not evidence for this profile.

### CIB-CFG-0004 — default unmatched BPMN Error under the pinned A12 engine

**Status:** Reviewed configuration dependency of the retired CIB Seven `2.0.0` engine; superseded for `2.2.0` by `CIB-CFG-0010`, `CIB-INT-0013` and `CIB-LIM-0006`

CIB Seven `2.0.0` defaults `enableExceptionsAfterUnhandledBpmnError` to `false`. For an unmatched `RelationshipLinkageError`, the engine logs the missing catcher and calls `execution.end(true)` rather than rethrowing the Error.

The mapping-free phase-zero control isolates that default: the Process has no remaining runtime instance, task, job, incident, normal End execution, or boundary-task execution; history retains one ended Process plus Activity-local `relationshipModel = "RelationshipModel"` and `newLinkId = "must-not-map"`. In the complete selected fixture, the later Camunda output mapping instead tries to resolve the already destroyed `newLinkId`, raises `Cannot resolve identifier 'newLinkId'`, and rolls the entire start command back, leaving no runtime or historic Process state.

**Classification rationale:** The two outcomes are separate configuration-and-extension facts. The mapping-free result records default unmatched handling; the mapped rollback is conditional on `CIB-EXT-0004` and must never be generalized as CIB's universal unmatched-Error behavior. Neither is BPMN semantic authority; on `2.2.0` the CIB profiles select the ending of the throwing path (`CIB-INT-0013`) and refuse the mapped rollback (`CIB-LIM-0006`).

**Evidence:** [Boundary-error specification](kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md) and the seven-test [frozen packaged-engine phase-zero probe](../adoption/a12/legacy/source-tree/runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBoundaryErrorPhaseZeroProbeTest.java).

### CIB-CFG-0005 — pinned read-only JUEL condition environment

**Status:** Superseded for CIB Seven `2.2.0` by `CIB-CFG-0011`; selected by no profile (bounded configuration of the deferred JUEL compatibility lane; production capsule unimplemented)

When reopened, the first JUEL compatibility profile uses `org.cibseven.bpm.juel:cibseven-juel:2.0.0`, matching pinned CIB Seven `2.0.0`, over a complete immutable Process-scope context whose values use the project's existing tagged `VariableValue.String | VariableValue.Null` contract. The Java evaluator converts those variants to `String | null` after validation. It exposes exact root-variable lookup and no bean, property-on-Java-object, method, function, class, `execution`, Process Engine service, Spring, file, network, or mutation capability.

The admitted source has exactly two non-default conditions and one conditionless default (for probe calibration of the nested scope-data profile under the [Exclusive choice arity account](kernel/semantics/FLOW-SEMANTICS-SPEC.md), any positive number of non-default conditions, and under the [Exclusive Choice without a default account](kernel/semantics/FLOW-SEMANTICS-SPEC.md), two or more non-default conditions without a default, and under the [Inclusive regions specification](kernel/semantics/FLOW-SEMANTICS-SPEC.md), the conditions of a root Inclusive split), no condition `language`, `xsi:type` absent or resolving to BPMN `tFormalExpression`, and no Camunda `resource`. The condition result must be a non-null Java `Boolean`. Exact `${...}` and `#{...}` source is retained. A short-lived validation Workflow performs batched parse-only validation before any Process Workflow starts; runtime evaluator failures share one semantic `evaluationError` result, while diagnostic codes and messages do not affect semantic comparison.

**Evidence:** [JUEL evaluation architecture decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md), [isolated CIB JUEL runtime probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenIsolatedJuelRuntimeProbeTest.java), and [packaged-engine gateway probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenExclusiveGatewayJuelProbeTest.java).

**Boundary:** This selection does not admit nested objects, collections, numbers, Boolean Process variables, Java objects, arbitrary JUEL, input/output mappings, forms, scripts, listeners, bean resolution, or general CIB expression compatibility. The reviewed dependencies are approved but remain uncommitted and absent from production code. The active Simple Boolean standards profile is a different declared language and receives no CIB truth claim from this entry.

### CIB-CFG-0006 - pinned mapped-success CIB Seven 2.0.0 environment

**Status:** Reviewed configuration dependency

The product-neutral mapped-success profile pins CIB Seven `2.0.0` at revision `57ed69550f1c9c2619b9711d8877418bb084a371`, Java 21, H2 `2.3.232`, disabled automatic job execution, an explicit clock, audit history, and default history TTL `P180D`. Its synchronous path uses no continuation job, but the full environment remains pinned for reproducible deployment, history, cleanup, and evidence identity. The CIB Seven `2.0.0` profiles retired into the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/README.md) at the profile consolidation (#42), and their evidence is regenerated on `2.2.0` in the hosted lane.

### CIB-CFG-0007 - pinned mapped-boundary-Error CIB Seven 2.0.0 environment

**Status:** Reviewed configuration dependency

The product-neutral mapped-boundary-Error profile pins the same CIB Seven `2.0.0` revision, Java, H2, scheduler, clock, history, and TTL settings as a distinct profile identity. Evidence for another release or another profile does not establish this configuration-specific claim. The CIB Seven `2.0.0` profiles retired into the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/README.md) at the profile consolidation (#42), and their evidence is regenerated on `2.2.0` in the hosted lane.

### CIB-CFG-0008 - explicit failed-job incident creation

**Status:** Selected configuration dependency; implemented and evidence-closed

The registered Service Task incident profile explicitly sets `createIncidentOnFailedJobEnabled` to `true`. Pinned CIB Seven creates the public `failedJob` incident only under that setting. Relying on the engine default would make the profile's public incident fact depend on an undeclared host choice.

**Evidence:** The [Service Task incident phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskIncidentPhaseZeroProbeTest.java) runs the same exact BPMN and failure schedule under both values. The enabled engine exposes and resolves the failed-job incident while retaining the job and Process; the disabled engine reaches retries zero with no incident. The [registered profile](../profiles/cibseven-2.2.0/profile.json), [engine-bundle factory](../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenEngineBundleFactory.java), and schedule-alignment test (`CibSevenIncidentScheduleAlignmentTest`, removed at W0.3b) bind the enabled configuration to the successor schedule and exclude it from predecessor schedules.

**Boundary:** This setting selects only creation of the one failed-job incident used by `CIB-EXT-0013`. It does not authorize other incident handlers, automatic execution, retry scheduling, arbitrary configuration, or semantic use of CIB retry counts and identities.

### CIB-CFG-0009 — default Java serialization of structured business values

**Status:** Selected configuration dependency for the [structured effect-data amendment](kernel/semantics/DATA-SEMANTICS-SPEC.md), closed by independent review on 2026-10-14; selected by the draft effect-data profile artifact. The [structured effect-result probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenStructuredEffectResultProbeTest.java) (2026-10-14) stores the credit assessment under the pinned default and reads back List order and duplicates, present Null, a Null distinct from an empty Map and the retained `BigDecimal` scale of `-1234.550`, whose local projection is the capsule's Decimal `-123455` at scale 2.

Without a Spin JSON default, CIB stores a serializable `java.util.Map` or `List` as an object value with Java serialization (`ProcessEngineConfigurationImpl.java:589-590,2591-2601`, `JavaObjectSerializer.java:40,67-87`); disabled Java serialization blocks only client-supplied serialized bytes (`VariableUtil.java:54-60`). That realization keeps List order and duplicates and `BigDecimal` scale. The calibration probe [`CibSevenStructuredEffectResultProbeTest`](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenStructuredEffectResultProbeTest.java), not retained differential evidence, has a local projection that reads the deserialized value, orders String Map keys by Unicode scalar value rather than Java's UTF-16 `compareTo`, projects nonnegative in-bound `Integer`/`Long` to the portable Integer and projects a `BigDecimal` to the canonical portable Decimal of the same mathematical value: trailing zeros are stripped and a negative scale becomes zero, and a canonical scale above 6 or a coefficient outside the signed 64-bit range is outside the domain. Non-String keys and negative or out-of-bound `Integer`/`Long` values are outside the domain and never become Decimals. CIB-retained scale is therefore not a compared fact. A Spin JSON default is excluded: the project runner installs no Spin plugin and its value fidelity is unverified.

**Boundary:** The carriers that reach JUEL under this configuration are the census the kernel's failure of a listed method a String, List or Map receiver lacks rests on ([expression semantics](kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#methods)): the runner's `String`, `Long`, `BigDecimal`, `Boolean`, `ArrayList` and `LinkedHashMap` ([`ScenarioVariableValueProjection.java:119-139`](../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioVariableValueProjection.java)) and a decision result's `HashMap`, `ArrayList` and `Collections.emptyList()` (`DmnDecisionResultEntriesImpl.java:98`, `DmnDecisionResultImpl.java:63,77`, `CollectEntriesDecisionResultMapper.java:40`). None declares a listed method its kind's column leaves blank. A carrier outside the census, such as a Spin value or another `Map` or `List` class, is outside every claim.

### CIB-CFG-0010 — default unmatched BPMN Error under CIB Seven 2.2.0

**Status:** Selected configuration dependency; pinned in the [cibseven-2.2.0 profile](../profiles/cibseven-2.2.0/profile.json) environment

CIB Seven `2.2.0` defaults `enableExceptionsAfterUnhandledBpmnError` to `false` (`ProcessEngineConfiguration.java:356`). Under it a BPMN Error that no catcher takes ends the throwing path (`CIB-INT-0013`); under `true` it raises `missingBoundaryCatchEventError` and rolls the command back (`BpmnExceptionHandler.java:132-133`). The profile's environment states `enableExceptionsAfterUnhandledBpmnError: false`, so `CIB-INT-0013` never rests on an undeclared default. The project runner sets no other value, so the pin names the engine default it already runs.

**Evidence:** The pinned source lines above and the retained PC-ERROR-01 witnesses cited by `CIB-INT-0013`.

**Boundary:** This setting selects only the unmatched-Error outcome of `CIB-INT-0013`. It replaces the `2.0.0` record `CIB-CFG-0004` for the `2.2.0` engine and authorizes no other configuration.

### CIB-CFG-0011 — pinned CIB Seven 2.2.0 JUEL environment

**Status:** Selected configuration through the [cibseven-2.2.0 cumulative profile](../profiles/cibseven-2.2.0/profile.json) and the scope-chain profile; selects `ProfileOptions.evaluator = juel`; supersedes `CIB-CFG-0005` for CIB Seven `2.2.0`

The kernel's [core JUEL level](kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md) is checked against the pinned engine's own JUEL environment: `JuelExpressionManager`'s resolver chain, the JEE6 parser profile, the four registered functions, the runner's handler beans (`CibSevenScriptedEffect.HANDLER_BEANS` and the tokens the scenario's source overlay declares, `CibSevenEffectBindings`) and the oracle JVM's default locale, which the runner pins to `en-US` because JUEL's String methods follow it (`runners/cibseven/pom.xml`). A bean the environment registers and no binding shadows resolves in CIB and is an unknown variable in the kernel, so no scenario names a bean; bean names never enter the IL.

**Evidence:** Pinned `JuelExpressionManager.java:142-163`, `el/VariableScopeElResolver.java:51-90`, `cfg/ProcessEngineConfigurationImpl.java:2723-2731`; the retained [core witness table](../scenarios/open-rows/juel-core-table/README.md) and the `bean-reference` witness of [juel-evaluation-failures](../scenarios/open-rows/juel-evaluation-failures/README.md) (CIB Seven `2.2.0`).

**Boundary:** That environment and locale only; other bean sets, function mappers or locales are outside it.

### CIB-CFG-0012 — CIB does not re-evaluate an armed Timer cycle

**Status:** Configuration-dependent CIB behavior; the oracle environment keeps CIB's default

CIB Seven `2.2.0` re-evaluates a cycle's expression when a successor job is created only under `reevaluateTimeCycleWhenDue = true`; its default is `false`, which the cibseven profiles' oracle environment keeps. The kernel captures the recurrence at arming (CIB-INT-0023), which equals the default.

**Evidence:** Pinned `TimerEntity.java:82-96`, `ProcessEngineConfigurationImpl.java:1071`.

**Boundary:** The CIB oracle environment; a CIB deployment with the switch on is outside every claim.

### CIB-CFG-0013 — CIB's Timer calendars read the JVM default time zone

**Status:** Configuration-dependent CIB behavior; the oracle environment pins UTC

CIB Seven `2.2.0` adds a Timer duration on a `GregorianCalendar` in the JVM default zone, reads a zone-less date in it and evaluates Cron in `ZoneId.systemDefault()`. The kernel computes every calendar step over UTC from logical time (owner decision 2026-11-08 for Cron, applied to calendar durations alike) and refuses zone-less dates. In a zone with offset changes CIB's calendar months, days and Cron matches differ from UTC around each change. The oracle runs with `-Duser.timezone=UTC`, fails closed in any other zone, and records `producer.timeZone`.

**Evidence:** Pinned `DurationHelper.java:141-146`, `DateTimeUtil.java:48`, `CronTimer.java:45-53`; `runners/cibseven/pom.xml` argLine, `CibSevenScenarioRunner.create`.

**Boundary:** The CIB oracle environment; a non-UTC CIB deployment is outside every claim.

### CIB-CFG-0014 — CIB's Cron dialect is Quartz with the legacy day-field patch

**Status:** Configuration-dependent CIB behavior; the kernel admits a subset of the default dialect

With the default `cronType = QUARTZ` and `supportLegacyQuartzSyntax = true` (`ProcessEngineConfigurationImpl.java:656,2739`, `CronProperty.java:33,45`), CIB rewrites the day fields before parsing (`CronTimer.java:83-121`): a wildcard in one day field leaves the other governing, `*`/`*` and `?`/`?` mean every day, and two concrete day fields silently drop the day of month. The kernel admits six fields with `*`, `?` in the day fields, numbers, ranges, lists and `x/y`, days of week 1-7 from Sunday, the first match strictly after arming and each successor strictly after the deadline it fired at, and refuses two concrete day fields (`timer.cron`).

**Evidence:** The cited pinned source; retained `timer-recurrence/cron-seconds-field` (30,000 then 60,000) and `cron-on-catch`.

**Boundary:** The default Cron configuration; another `cronType` is outside every claim.

### CIB-CFG-0015 — CIB evaluates JavaScript only with GraalJS on its classpath

**Status:** Configuration-specific realization; selected by the cibseven profiles

CIB Seven `2.2.0`'s engine module has GraalJS in test scope only (`engine/pom.xml:332-342`); without it a JavaScript Script Task fails when it runs (`scripting/engine/ScriptingEngines.java:143`). The CIB Run distribution and the project's CIB runner add GraalJS `21.3.12` (`distro/run/pom.xml:32`, `parent/pom.xml:32`; owner approval 2026-11-12, runner only), whose library is ECMAScript 2021 (P1, [script semantics](kernel/semantics/SCRIPT-SEMANTICS-SPEC.md#probe-p1-2026-11-12)).

**Evidence:** The cited source; [SOURCES](SOURCES.md) records the dependency.

**Boundary:** The pinned GraalJS `21.3.12` and its default host access; another JavaScript engine is outside the claim.

## Audit of previously visited findings

| Previously visited finding | Classification | Reason |
|---|---|---|
| Plain sequential Process deploys, waits at one User Task, and completes | `CIB-AGR-0001` | Bounded observed agreement with the applicable BPMN lifecycle |
| Active task discovery and completion through CIB public services | `CIB-AGR-0002` | Bounded observed agreement for the selected User Task surface |
| Generated CIB task IDs and `TaskService` calls | `CIB-OP-0001` | Host identity and API mechanics are more concrete than BPMN but do not conflict with it |
| Java/H2/history-TTL/job-executor/clock settings | `CIB-CFG-0001` | Required reproducibility and admission configuration, with non-semantic history excluded from comparison |
| PVM ordered topology, `null` event scope on ordinary flow nodes, and internal `noneEndEvent` type | Diagnostic internal representation; no relationship entry | These are implementation diagnostics, not public BPMN behavior or compatibility keys |
| Model API DOM, deployment parse tree, PVM definition graph, and runtime execution tree differ | Diagnostic architecture; no relationship entry | Separate authoring, compilation, and runtime representations do not imply a semantic difference |
| Balanced two-branch Parallel Gateway fork/join | `CIB-AGR-0003` | Both branches become active, either completion order leaves the symmetric wait, and both arrivals complete the Process; the balanced witness does not distinguish join algorithms |
| Count-only versus incoming-edge-provenance join state | `CIB-DEV-0001` candidate deviation | The normative per-incoming-flow requirement, schema-valid separating model, pinned source mechanism, bounded pristine-lane probe, owner-approved profile meaning, balanced four-target impact and the retained answer-free left-pair-first witness establish a public conflict; promotion awaits owner review |
| Literal `PT1S` normal-flow Intermediate Catch Timer | `CIB-AGR-0004` under `CIB-CFG-0001` | Controlled-clock evidence observes wait creation, ineligibility before due time, eligibility at the due date, due transition, and completion; logical deadline projection remains adapter-derived |
| Exact delegate-expression bean plus async-before Service Task execution | `CIB-EXT-0001` under `CIB-CFG-0002` | The exact expanded-QName pair, bean resolution, immediately executable continuation job, plain completion, packaged retry decrement, and test-local one-mutation re-execution are executable; the semantic effect-in-flight projection remains adapter-decided |
| Divergent Exclusive Gateway condition order, first-true short circuit, default routing, no-match rollback, and failed-command rollback | `CIB-AGR-0006`, `CIB-INT-0001`, `CIB-INT-0003`, `CIB-OP-0004`, and `CIB-CFG-0005` | Public CIB deployment, task, selected-branch, history, and rollback observations distinguish the selected bounded account; the shared JUEL implementation remains one correlated truth lane |
| User Task completion with a public variable map | `CIB-EXT-0005` under `CIB-CFG-0001` | Task-service and history observations establish create/overwrite/preserve, present null, merge-before-continuation, no-data preservation, and no write on unknown or stale generated IDs; BPMN does not define this host completion API or universal form-to-Process-variable mapping |
| User Task completion with a primitive Boolean | Registered `CIB-EXT-0010` under `CIB-CFG-0001`; evidence-closed and independently closure-reviewed | The phase-zero probe and content-bound retained scenario evidence preserve an actual Java Boolean through public observations and separate it from string `"true"`; Lean, the independent core, differential comparison, and live Temporal refinement exercise the same exact profile |
| Process start with a public variable map | `CIB-EXT-0006` under `CIB-CFG-0001` | Runtime-service and first-task observations establish initial Process-variable visibility before completion; BPMN does not define this host start API or universal start-map semantics |
| Exact-code Error End propagation from an embedded Sub-Process | `CIB-AGR-0008` | Both child-command orders expose only Recover after the Error and complete only after Recover; retained raw task-state mutation detects a wrongly retained child sibling without claiming hidden execution-tree microsteps |
| Message-addressed Receive Task subscription and completion | `CIB-AGR-0009` | A project-authored direct-Message Receive Task exposes one public Message subscription; exact public delivery removes it and completes the Process, without equating CIB's event name or generated execution ID with project semantic identity |
| Addressless Receive Task wait and execution-signal resumption | `CIB-INT-0004` and `CIB-OP-0011` | A project-authored Receive Task without a Message keeps no event subscription; one execution signal completes the Process, a second is refused, and neither Message correlation nor Signal broadcast reaches the wait |
| Modeled BPMN key/context Message correlation | `CIB-LIM-0002` under `CIB-CFG-0001` | Schema-valid modeled retrieval and Process-binding metadata leaves two same-name waits ambiguous; only a separate public API Process-variable criterion selects one instance, and no CIB correlation semantics are adopted by the project |
| Collection-driven sequential Multi-Instance lifecycle | `CIB-AGR-0011`, `CIB-INT-0002`, and `CIB-LIM-0001` under `CIB-CFG-0001` | Public services expose ordered distinct task turnover, zero-item closure, one stable outer Timer, and interruption; desired cardinality is stored at entry, while the standard output collection is not produced |
| Java delegates, beans, expressions, scripts, FEEL, listeners, mappings, connectors and other Camunda extension families | Research inventory only | The family-level surface is recorded in [CIB Seven extension research](research/CIB-SEVEN-EXTENSIONS-RESEARCH.md); no blanket extension or API compatibility claim is selected |
| External-task execution | Deferred extension alternative | The protocol is source-realistic but introduces topic, lease, worker, failure, retry, and incident semantics with no current capsule consumer |

## Classification order

Classify an observed CIB behavior in this order:

1. **Normative agreement:** BPMN is sufficiently clear and CIB behaves accordingly. This is the expected case.
2. **Permitted operational detail:** CIB chooses implementation detail that does not alter required BPMN observations.
3. **BPMN gap resolution:** BPMN is ambiguous, inconsistent, or incomplete and CIB selects an operational interpretation.
4. **CIB extension:** CIB adds a namespaced construct, protocol, lifecycle, or public capability beyond bare BPMN.
5. **Configuration-specific realization:** the behavior depends materially on a declared database, history, expression, scheduler, plugin, listener, or other profile choice.
6. **Limitation or unsupported surface:** CIB does not implement the examined capability, but the normative conformance consequence is not yet established.
7. **Candidate deviation:** evidence suggests conflict with a clear BPMN requirement but review is incomplete.
8. **Confirmed normative deviation:** the evidence threshold is satisfied and owner review confirms the classification.

Do not jump directly from a differential mismatch to “deviation.” First exclude fixture, import, configuration, scheduler, observation, canonicalization, and harness errors.

## Evidence threshold for a confirmed deviation

A confirmed deviation record requires:

- a stable `CIB-DEV-NNNN` identifier;
- the exact BPMN 2.0.2 clause, applicable figure/table, normative machine-readable fact where relevant, and open-issue disposition;
- a concise statement of the normative requirement and why it is not merely ambiguous;
- the smallest separating BPMN model and answer-free scenario;
- the exact CIB Seven release, source revision, environment, configuration, and observation boundary;
- immutable raw or recoverable producer evidence plus a mutation-sensitive canonical projection;
- reproduction through the pristine pinned oracle lane;
- exclusion of parser, harness, configuration, scheduling, projection, and instrumentation explanations;
- impact on BPMN conformance, CIB compatibility, checked source, Semantic Process IL, Lean, TypeScript, Temporal, replay, and public claims;
- the applicable capsule and stable semantic rule identifiers;
- an explicit owner decision and review status.

An unconfirmed concern is recorded prominently as a candidate rather than omitted or prematurely promoted.

## Entry template

```text
ID:
Status: candidate | confirmed | resolved-not-a-deviation | superseded
Summary:
BPMN requirement:
BPMN sources and issues:
CIB release and configuration:
Separating model and scenario:
CIB observation:
Expected normative behavior:
Alternative explanations excluded:
Classification rationale:
Profile decision:
Capsule and semantic rule IDs:
Lean evidence:
TypeScript evidence:
Temporal/refinement/replay impact:
Conformance and compatibility impact:
Owner decision:
Last reviewed:
```

Reviewed agreements use `CIB-AGR-NNNN`; permitted operational details use `CIB-OP-NNNN`; gap resolutions use `CIB-INT-NNNN`; selected extensions use `CIB-EXT-NNNN`; configuration-specific records use `CIB-CFG-NNNN`; limitations use `CIB-LIM-NNNN`; candidate and confirmed deviations use `CIB-DEV-NNNN`. Identifiers are never renumbered or reused.

## Mandatory capsule workflow

Before Lean or TypeScript implements profile-dependent behavior, the capsule must:

1. identify the applicable BPMN requirements and open issues;
2. probe pinned CIB Seven with the smallest observation capable of separating relevant accounts;
3. classify the relationship using this register;
4. add or link the required interpretation, extension, configuration, limitation, or deviation entry;
5. state the selected profile behavior and whether it is normative BPMN, a CIB interpretation, or a CIB extension;
6. keep an unresolved candidate deviation visible and implementation-blocking unless the owner approves a bounded competing-account experiment;
7. link the classification to stable capsule rule IDs and independent evidence lanes.

CIB therefore contributes twice: before Lean as reviewed profile evidence and after implementation as the executable differential oracle. Raw CIB results are never transformed automatically into Lean semantic authority.

## Profile consequences

Normative agreement normally needs no special override, but its requirement and evidence remain traceable through the capsule.

A gap resolution becomes an explicit interpretation in the CIB compatibility profile. A selected extension is separately named and scoped so it cannot inflate a BPMN conformance claim.

If a normative deviation is confirmed, the project must discuss and choose among:

- implement normative BPMN behavior and report the CIB incompatibility;
- implement CIB behavior under an explicitly named compatibility profile and report the normative deviation;
- support separate BPMN and CIB profiles.

One conflicting behavior cannot honestly be advertised as both exact CIB compatibility and BPMN conformance.

## Completeness boundary

This register is complete only relative to reviewed requirements, supported features, pinned CIB environments, maintained scenarios, and declared observation boundaries. Unknown or unreviewed areas remain unknown; absence from the register is not proof of agreement.

The [BPMN conformance target](BPMN-CONFORMANCE-TARGET.md) owns the normative goal, the [kernel semantics documents](kernel/semantics/) own bounded project meaning, [profiles](../profiles/README.md) own selected compatibility contracts, the [kernel status map](kernel/KERNEL-STATUS-MAP.md) owns current semantic and CIB evidence coverage, and the [engineering policy](kernel/ENGINEERING-POLICY.md#verification) owns evidence procedure.
