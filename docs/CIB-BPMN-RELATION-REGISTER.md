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

The counts below cover only entries recorded by this project, including the separately counted open candidates. Selection and qualification follow each entry's status. Zero does not mean that the complete CIB Seven engine has been proven free of deviations.

| Lane | Recorded entries | Open candidates | Meaning |
|---|---:|---:|---|
| Normative agreement records | 14 | 2 | A bounded BPMN requirement and pinned CIB observation agree; candidates remain unapproved |
| Permitted operational details | 9 | 0 | CIB or the oracle adapter chooses host mechanics without changing required BPMN observations |
| Confirmed normative deviations | 0 | 1 | Clear BPMN requirement and pinned CIB evidence establish incompatible behavior |
| CIB interpretations of BPMN gaps or inconsistencies | 2 | 0 | CIB selects an operational meaning where BPMN does not uniquely settle it |
| CIB extension records | 19 | 3 | Project profile deliberately includes behavior beyond bare BPMN execution; candidates remain unselected |
| Configuration-specific realizations | 9 | 1 | Behavior is permitted or meaningful only under a declared CIB environment |
| Known CIB limitations within reviewed scope | 2 | 0 | Unsupported or incomplete behavior that is not yet classified as a normative deviation |

The current sequential User Task capsule has no recorded CIB deviation. That statement is bounded to its clauses, pinned environment, witnesses, and observation surface; it is not a general CIB conformance result.

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

**Alternative explanations excluded:** The exact model validates against the pinned BPMN 2.0.2 `BPMN20.xsd`; CIB deploys and executes it without parser warning; the probe observes public task existence rather than internal PVM state; `User_Right` proves the right branch has not traversed `Flow_Right_Join`; and neither task-query order nor project canonicalization can create `User_After_Join`. The result agrees with the pinned engine source. The balanced normative scenarios now calibrate raw task-query projection and canonical sorting but cannot separate the competing join-readiness accounts; immutable producer evidence for the negative probe remains open.

**Classification rationale:** This is more than a representation difference because it changes the publicly observable point at which downstream BPMN work becomes active. The normative account now has answer-free content-bound balanced evidence, a mutation-sensitive raw-to-canonical projection, and complete balanced Lean, CIB, TypeScript, and Temporal impact evidence. The entry remains a candidate rather than a confirmed deviation because the separating duplicate-left/no-right CIB probe itself is not yet an immutable answer-free evidence artifact with a retained negative-result projection.

**Profile decision:** The [parallel fork/join spec](capsules/PARALLEL-FORK-JOIN-SPEC.md) follows normative per-incoming-Sequence-Flow behavior. The current `cibseven-2.2.0-user-task-process-data-draft` profile is not expanded to claim parallel compatibility. Pinned CIB count-based behavior may be retained later only in an explicitly separate compatibility profile; one behavior cannot be claimed as both exact CIB compatibility and BPMN conformance.

**Capsule and semantic rule IDs:** The [parallel fork/join spec](capsules/PARALLEL-FORK-JOIN-SPEC.md) owns `PAR-JOIN-READY-01` and `PAR-JOIN-CONSUME-01`. Its balanced evidence lanes are closed as a draft; immutable negative-probe evidence remains pending.

**Lean, TypeScript, Temporal, and compatibility impact:** Lean and TypeScript retain incoming-flow provenance and excess-token multiplicity under the normative account. Focused Temporal evidence shows that the adapter hosts that account without interpreting join readiness or hiding the difference as scheduling. Balanced CIB evidence agrees but cannot distinguish the normative account from CIB's count-based implementation. A CIB-compatible implementation of the separating case would need an explicitly named deviation profile, which remains intentionally absent.

**Owner decision:** Approved normative BPMN behavior for the next capsule on 2026-07-26, with no parallel compatibility claim for the current CIB profile and no production implementation of the observed count-based behavior.

**Last reviewed:** 2026-07-26.

A candidate must appear here immediately when evidence suggests conflict with a clear BPMN requirement. It remains a candidate until the evidence threshold below is satisfied. Implementation of the disputed profile-dependent behavior pauses unless the capsule explicitly preserves competing accounts as an unresolved experiment.

The repository-wide audit on 2026-07-24 found no previously visited observation that satisfied the candidate or confirmed-deviation threshold. The later bounded parallel probe established `CIB-DEV-0001`; the other recorded PVM facts, generated IDs, history-TTL requirement, and task-service mapping remain classified below instead of being silently left open or mislabeled.

## Normative agreement register

### CIB-AGR-0001 — sequential Process and User Task lifecycle

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clauses 13.2 and 13.3 require an instantiated executable Process to progress along Sequence Flows, activate an Activity, wait while the User Task is active, and complete after the task and downstream None End Event complete.

**Pinned CIB observation:** CIB Seven `2.2.0` deploys and starts the exact plain BPMN fixture, exposes exactly one active `UserTask_Approve`, completes it through the public task service, and reports the Process complete at unchanged controlled logical time.

**Evidence:** [BPMN fixture and scenarios](../scenarios/user-task-discovery-completion/README.md), [exact-completion CIB evidence](../scenarios/user-task-discovery-completion/cibseven-evidence.json), [oracle runner test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScenarioRunnerTest.java), and [the current draft profile](../profiles/cibseven-2.2.0-user-task-process-data-draft/README.md).

**Boundary:** This establishes agreement only for one private executable `None Start Event → User Task → None End Event` Process and its declared observation surface. It says nothing yet about assignment, variables, repeated activation, concurrency, errors, or general Process Execution Conformance.

### CIB-AGR-0002 — active User Task discovery and basic completion

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clauses 10.7.3, 13.3.2, and 13.3.3 describe User Task activation, task-manager lifecycle, performance of the human work, and completion before outgoing control proceeds.

**Pinned CIB observation:** The public CIB task query exposes the active task and its BPMN definition key and name; completing the corresponding live host task removes the wait and completes the admitted Process.

**Evidence:** [User Task interaction capsule](capsules/USER-TASK-INTERACTION-SPEC.md), [exact-completion evidence](../scenarios/user-task-discovery-completion/cibseven-evidence.json), [interaction scenarios](../scenarios/user-task-discovery-completion/README.md), and [the current draft profile](../profiles/cibseven-2.2.0-user-task-process-data-draft/README.md).

**Boundary:** People assignment, ownership, authorization, forms, input/output data, and general User Task lifecycle are excluded. The project’s structured activation ordinal and refusal of a mismatched semantic occurrence are an operational mapping under `CIB-OP-0001`, not a claim that BPMN prescribes that identity representation.

### CIB-AGR-0003 — balanced two-branch Parallel Gateway lifecycle

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clauses 10.6.4 and 13.4.1 plus Table 13.1 require a diverging Parallel Gateway to activate both outgoing branches and a converging Parallel Gateway to wait for at least one token on each incoming Sequence Flow before consuming one per input and proceeding.

**Pinned CIB observation:** CIB Seven `2.2.0` starts the exact balanced fork/join Process with simultaneous `UserTask_A` and `UserTask_B` waits. Completing either task first leaves only the other task active; completing both joins once and completes the Process. A-then-B and B-then-A have the same initial and final canonical states.

**Evidence:** [Parallel scenarios](../scenarios/parallel-fork-join/README.md), [A-then-B evidence](../scenarios/parallel-fork-join/a-then-b.cibseven-evidence.json), [B-then-A evidence](../scenarios/parallel-fork-join/b-then-a.cibseven-evidence.json), [oracle runner test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScenarioRunnerTest.java), and [the parallel draft profile](../profiles/parallel-fork-join-draft/README.md).

**Boundary:** This agreement is limited to one balanced two-branch shape with distinct User Task elements. It does not distinguish normative per-incoming-flow synchronization from CIB's count-based join implementation and therefore does not weaken or resolve candidate `CIB-DEV-0001`. Repeated task elements, activation-ordinal derivation, excess same-input arrivals, more branches, nested gateways, and general parallel compatibility remain outside this agreement.

### CIB-AGR-0004 — literal PT1S Intermediate Catch Timer lifecycle

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clause 10.5.4 and Table 10.89 require a catching Intermediate Timer Event in normal flow to retain the token until its trigger and then continue. Clause 10.5.5 plus Tables 10.101 and 10.122 define `timeDuration` as the relative-duration timer form.

**Pinned CIB observation:** With CIB Seven `2.2.0` at the pinned revision, automatic job execution disabled, and the engine clock fixed at epoch zero, the exact `PT1S` fixture creates one wait-state timer job due at epoch plus 1000 ms. The executable-job query excludes that job before its due date, includes the same job when the controlled clock reaches the due date, and public job execution then removes the wait and completes the Process.

**Evidence:** [Intermediate Catch Timer scenario](../scenarios/intermediate-catch-timer/README.md), [controlled-clock oracle test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenIntermediateCatchTimerTest.java), [immutable profile](../profiles/cibseven-2.2.0-intermediate-catch-timer-draft/README.md), and the content-bound retained evidence generated only through the explicit replacement command.

**Fidelity boundary:** Job existence, scheduler ineligibility before due time, scheduler eligibility at due time, the due transition, and Process completion are engine-observed. The canonical logical deadline `1000` is adapter-derived by subtracting the fixed controlled-clock epoch from the engine job due date; it is not an independent CIB derivation of the project's logical-time representation.

**Boundary:** This establishes agreement only for one acyclic private executable `None Start Event → Intermediate Catch Timer Event with exact literal PT1S → None End Event` Process under `CIB-CFG-0001`. Other duration literals, expressions, time dates, cycles, repeating timers, boundary events, timer Start Events, competing events, cancellation, scheduler latency, and general timer compatibility remain unreviewed.

### CIB-AGR-0005 — exact-code interrupting Error Boundary Event

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clauses 13.3.3 and 13.5.3 plus Table 8.41 and Tables 10.90, 10.91, and 10.92 require the selected matching Error to interrupt the attached Service Task and continue only through the Error Boundary Event's outgoing Sequence Flow.

**Pinned CIB observation:** CIB Seven `2.0.0` at revision `57ed69550f1c9c2619b9711d8877418bb084a371` catches both code-only and message-bearing `BpmnError("LinkLimitReachedError", ...)` from the exact attached Service Task, exposes the boundary-route User Task, and does not execute the normal End path. An independently perturbed Error code and attachment each fail the deployment-derived profile comparison.

**Evidence:** [Boundary-error specification and phase-zero result](capsules/BOUNDARY-ERROR-SPEC.md), [frozen project-authored fixture](../adoption/a12/legacy/source-tree/scenarios/boundary-error/process.bpmn), [frozen packaged-engine probe](../adoption/a12/legacy/source-tree/runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBoundaryErrorPhaseZeroProbeTest.java), and the frozen ordinary content-bound scenario evidence.

**Fidelity boundary:** The boundary User Task and absence of the normal End path are engine-observed. Project effect intent, typed business-result shape, occurrence identity, and command identity are not CIB concepts. Caught-path output mapping is not part of this agreement; it is the separately selected extension `CIB-EXT-0004`.

**Boundary:** This establishes only one exact code, one attached interrupting handler, one flat Process, and one same-command synchronous CIB host realization. Catch-all handling, nested propagation, Error End Events, multiple handlers, general faults, and unhandled Error behavior remain outside this agreement.

### CIB-AGR-0006 — divergent Exclusive Gateway first-true and default routing

**Status:** Reviewed bounded agreement; standards capsule implemented, CIB JUEL overlay deferred

**BPMN basis:** BPMN 2.0.2 Clause 13.4.2 and Table 13.2 require a divergent Exclusive Gateway to evaluate outgoing conditional Sequence Flows in a defined order, select the first condition that evaluates true, and select the default Sequence Flow only when every condition is false.

**Pinned CIB observation:** CIB Seven `2.0.0` at revision `57ed69550f1c9c2619b9711d8877418bb084a371` selects the first true non-default Sequence Flow, selects the second after the first false, does not evaluate a later failing condition after an earlier true result, and selects the declared default after both reviewed conditions evaluate false. The selected branch is visible through its distinct User Task. These controls now use the exact two-condition-plus-default and string/null source profile rather than broader Boolean or nested-map feasibility shapes.

**Evidence:** [Exclusive Gateway condition specification](capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md), [packaged-engine JUEL gateway probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenExclusiveGatewayJuelProbeTest.java), and [CIB Seven extension research](research/CIB-SEVEN-EXTENSIONS-RESEARCH.md).

**Boundary:** Candidate order is the selected interpretation `CIB-INT-0001`; JUEL evaluation is configuration-specific under `CIB-CFG-0005`; synchronous command rollback is mapped by `CIB-OP-0004`. CIB accepts a language-qualified formal condition as a script source and may defer missing-script-engine failure until execution; the deferred JUEL profile rejects that source before parse-only JUEL validation. The implemented project language is not executed by CIB and does not turn this calibration into Simple Boolean truth evidence. This agreement does not cover a missing default, converging or mixed gateways, more than two conditions, conditional flow from another Flow Node, arbitrary JUEL, nested data, or scripts.

### CIB-AGR-0007 — ordinary embedded Sub-Process quiescent completion

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clauses 10.3.5 and 13.3.4 define an embedded Sub-Process as an Activity-owned execution scope that starts when reached and completes only after no contained token or active Activity remains, then continues through the Sub-Process's outgoing Sequence Flow.

**Pinned CIB observation:** CIB Seven `2.2.0` at revision `834a9874760de8a0107f7c1b32806e37f17fb017` starts the exact project-authored one-level ordinary Sub-Process with simultaneous `UserTask_ChildA` and `UserTask_ChildB` waits. Completing either child first leaves only its sibling active and does not expose the enclosing `UserTask_AfterScope`; completing both children destroys the child work and exposes exactly the enclosing task. A-then-B and B-then-A reach the same public post-child state, and completing the enclosing task completes the Process.

**Evidence:** [Ordinary embedded Sub-Process completion scenarios](../scenarios/embedded-subprocess-completion/README.md), content-bound evidence for [A then B](../scenarios/embedded-subprocess-completion/a-then-b.cibseven-evidence.json) and [B then A](../scenarios/embedded-subprocess-completion/b-then-a.cibseven-evidence.json), [public-service oracle test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScenarioRunnerTest.java), and the [draft profile](../profiles/cibseven-2.2.0-embedded-subprocess-completion-draft/README.md).

**Boundary:** This agreement is limited to one ordinary embedded Sub-Process, one child scope level, one diverging Parallel Gateway, two distinct child User Tasks, separate child None End Events, and one enclosing User Task. Project semantic occurrence identity and stale-command refusal remain operational mappings under `CIB-OP-0001`. Arbitrary nesting, repeated activation, Event Sub-Processes, implicit completion, boundary handling, Error propagation, Terminate End Events, child-local data, loops, multi-instance, Call Activities, transactions, compensation, and internal CIB scope representation remain outside this agreement.

### CIB-AGR-0008 — exact-code Error propagation from an embedded Sub-Process

**Status:** Reviewed bounded agreement; project semantic implementation and retained evidence complete

**BPMN basis:** BPMN 2.0.2 Clauses 10.3.5, 10.5.1, 13.3.4, and 13.5.3 require an Error End Event to propagate its Error to a matching interrupting boundary Error Event on the enclosing Sub-Process, cancel that Sub-Process instance, and continue through the boundary Event's outgoing Sequence Flow.

**Pinned CIB observation:** CIB Seven `2.2.0` at revision `834a9874760de8a0107f7c1b32806e37f17fb017` starts the exact project-authored one-level Sub-Process with simultaneous `UserTask_TriggerError` and `UserTask_SiblingWork` tasks. Completing Trigger Error first removes Sibling Work and exposes only outer `UserTask_Recover` while the Process remains live. Completing Sibling Work first leaves Trigger Error active; completing Trigger Error then exposes only Recover while the Process remains live. In both orders the Process completes only after Recover completes.

**Evidence:** [Project-authored Error-propagation fixture and answer-free schedules](../scenarios/subprocess-error-propagation/README.md), content-bound retained evidence for [Trigger first](../scenarios/subprocess-error-propagation/trigger-first.cibseven-evidence.json), [Sibling first](../scenarios/subprocess-error-propagation/sibling-first.cibseven-evidence.json), and [stale Sibling after Error](../scenarios/subprocess-error-propagation/stale-sibling-after-error.cibseven-evidence.json), the [public-service phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSubProcessErrorPropagationPhaseZeroProbeTest.java), and the [implemented Error-propagation specification](capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md).

**Fidelity boundary:** Live Process existence and exact active task-definition keys are engine-observed through public runtime and task services. They establish selection of the recovery route and disappearance of the live sibling at that boundary. They do not expose the CIB execution tree, prove how regional cancellation is represented internally, or prove that no additional hidden normal-path microstep occurred.

**Boundary:** This agreement is limited to one private executable Process, one ordinary embedded Sub-Process, one child Parallel Gateway, two distinct child User Tasks, one exact-code Error End Event, one matching interrupting boundary Error Event attached directly to that Sub-Process, and one outer recovery User Task. The stale schedule's recovery-state prefix remains evidence for this agreement, but mapping the removed generated host task and its refusal to the project semantic occurrence/result belongs to `CIB-OP-0001`. Catch-all or unmatched Errors, multiple handlers, ancestor search, arbitrary nesting, Event Sub-Processes, payload or data mapping, concurrent task commands, project semantic occurrence identity, stale-command refusal, and general Error compatibility remain outside this agreement.

### CIB-AGR-0009 — Message-addressed Receive Task subscription lifecycle

**Status:** Reviewed bounded agreement with retained public-subscription evidence

**BPMN basis:** BPMN 2.0.2 Clause 10 and Table 10.10 define a Receive Task as waiting for a Message from an external Participant and completing when that Message is received. Clause 13.3.3 repeats that activation waits for the associated Message and that Message arrival completes the Activity.

**Pinned CIB observation:** CIB Seven `2.2.0` at revision `834a9874760de8a0107f7c1b32806e37f17fb017` starts one exact project-authored None Start → Message-addressed Receive Task → None End Process and exposes exactly one public Message event subscription. The subscription reports the Receive Task activity ID, the root Message name, the live Process-instance ID, and a generated execution ID. Delivering through `messageEventReceived(subscription.eventName, subscription.executionId)` removes the subscription and completes the Process.

**Evidence:** [Project-authored scenario and exact BPMN fixture](../scenarios/message-addressed-receive-task/README.md), [content-bound retained evidence](../scenarios/message-addressed-receive-task/cibseven-evidence.json), [public-service phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenReceiveTaskPhaseZeroProbeTest.java), [Receive Task specification](capsules/RECEIVE-TASK-MESSAGE-SPEC.md), and [CIB runner documentation](../runners/cibseven/README.md).

**Fidelity boundary:** Subscription existence, activity ID, event name, generated execution ID, Process-instance ID, removal, and Process completion are engine-observed through public CIB services. Retained evidence records the generated identities only as presence/match facts and never exports them as comparison keys. The Message name is a source-admission fact only in the project: it never enters the checked graph, Semantic Process program, runtime state, or canonical observation. CIB does not expose the BPMN Message ID through this subscription API, so `CIB-OP-0005` maps the deployed Receive Task reference to the adapter-decided canonical `messageId`; semantic Process-instance identity and activation remain adapter supplied.

**Boundary:** This agreement is limited to one private executable Process with one non-instantiating, payload-free Receive Task carrying one direct `messageRef`, one named root Message, and no `operationRef`, Message Flow, Collaboration, correlation key, loop, Multi-Instance, boundary Event, or data association. It does not cover the addressless CIB execution-signal path, pre-activation delivery, Message buffering, transport binding, Web-service realization, payload, global correlation, repeated activation, or general Receive Task compatibility.

### CIB-AGR-0010 - product-neutral exact-code interrupting Error Boundary Event

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clauses 13.3.3 and 13.5.3 plus Table 8.41 and Tables 10.90, 10.91, and 10.92 require one matching Error to interrupt the attached Service Task and continue only through the Error Boundary Event's outgoing Sequence Flow.

**Pinned CIB observation:** CIB Seven `2.0.0` at revision `57ed69550f1c9c2619b9711d8877418bb084a371` catches the exact `MappedBusinessError` raised by the neutral mapped-boundary Service Task, exposes only `ReviewMappedError`, and reaches Process completion only after that User Task completes.

**Evidence:** [Mapped-boundary-Error scenario](../scenarios/mapped-boundary-error-service-task/README.md), [content-bound CIB evidence](../scenarios/mapped-boundary-error-service-task/cibseven-evidence.json), [scenario runner test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenMappedBoundaryErrorScenarioRunnerTest.java), and [product-neutral profile](../profiles/cibseven-2.0.0-mapped-boundary-error-service-task-draft/README.md).

**Boundary:** This establishes one exact code, one attached interrupting handler, one flat Process, and one synchronous CIB host realization. Catch-all handling, nested propagation, Error End Events, multiple handlers, general faults, and unhandled Error behavior remain excluded. The caught-path mapping is classified separately by `CIB-EXT-0009`.

### CIB-AGR-0011: bounded collection-driven sequential Multi-Instance User Task lifecycle

**Status:** Reviewed bounded agreement; no Multi-Instance compatibility profile selected

**BPMN basis:** BPMN 2.0.2 Clauses 10.3.8 and 13.3.7 plus Tables 10.29 and 10.30 require collection-driven sequential generation to expose one inner Activity instance at a time in collection order. Clauses 10.5.5, 10.5.6, 13.3.2, and 13.5.3 require the exact interrupting `PT1S` Boundary Timer to cancel the attached outer Activity and follow only its boundary route.

**Pinned CIB observation:** CIB Seven `2.2.0` under `CIB-CFG-0001` deploys the schema-valid exact fixture, exposes three distinct generated User Task IDs in `alpha`, `beta`, `gamma` item order, keeps one unchanged outer Timer job across task turnover, completes a zero-item collection without a task or Timer, and routes exact Timer execution after the first completion to the escalation User Task while making the current review task stale.

**Evidence:** The [public-service phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSequentialMultiInstancePhaseZeroProbeTest.java), its [exact BPMN fixture](../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/CibSevenSequentialMultiInstancePhaseZeroProbeTest.bpmn), and the [Sequential Multi-Instance specification](capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md#cib-seven-relationship-boundary).

**Fidelity boundary:** Task existence, generated task identity, item value, loop-variable values, Timer-job identity and due date, task staleness, boundary-route activation, and Process completion are observed through public CIB services. The probe supplies the collection under the literal `loopDataInputRef` identity because that is CIB's public Process-variable binding; this does not establish general BPMN Data Association execution or the project mediator.

**Boundary:** This agreement is limited to one private executable Process, one collection-driven sequential Multi-Instance User Task, three strings or an empty collection, one exact interrupting Boundary Timer, and one boundary-route User Task. Counter meaning is classified separately by `CIB-INT-0002`; output aggregation is excluded by `CIB-LIM-0001`. General Multi-Instance, another Activity body, completion conditions, parallel generation, other data mapping, repeated activation, and a CIB compatibility profile remain unreviewed.

### CIB-AGR-0012 — CIB7 2.2.0 exact-code business Error recovery

**Status:** Reviewed bounded normative agreement under the approved [mixed-task business Error account](capsules/MIXED-TASK-BUSINESS-ERROR-PROPOSAL.md); implementation and profile qualification remain open.

**BPMN basis:** Clauses 13.3.3 and 13.5.3, Table 8.41 and Tables 10.90, 10.91 and 10.92 require the selected matching Error to interrupt its attached Service Task and follow the boundary Sequence Flow instead of normal completion.

**Pinned CIB observation:** Published CIB Seven `2.2.0`, whose `v2.2.0` source revision is `834a9874760de8a0107f7c1b32806e37f17fb017`, executes through the [Maven oracle](../runners/cibseven/pom.xml) and routes the exact `InvoiceRejected` result to Recover, permits reentry through Review with fresh task/automation occurrences, and takes normal continuation on subsequent success. Technical failure does not activate this boundary; changing the declared code removes the catch. The default unmatched path has the separate mapping-sensitive host outcomes recorded in the experiment.

**Source inspection:** The diagnostic checkout is separately pinned at `5a45b47ea22688d774de97277c3ff7013f54fdd2`. [Source provenance](SOURCES.md#cib-seven) records byte-identical relevant BPMN engine and model-API trees between that checkout and the published release.

**Evidence:** The [eight-probe experiment](experiments/BUSINESS-EFFECT-DATA-EXPERIMENT.md#business-failure-follow-up), [public-service probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBusinessFailurePhaseZeroProbeTest.java) and [registered-relationship guard](../scripts/contract-artifact-projections.test.ts). No project semantic profile is qualified by this observation alone.

**Boundary:** One attached exact-code catch in a single-control root Process with repeated work; no catch-all, multiple-handler precedence, ancestor propagation or transaction/refinement equality. Output mapping is separately classified as `CIB-EXT-0016`; project occurrence IDs and typed command results are not CIB observations.

### CIB-AGR-0013 — sequential Multi-Instance Sub-Process completion

**Status:** Candidate bounded agreement for the [sequential Sub-Process proposal](capsules/SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md); proposal review approved; profile selection and qualification pending.

**BPMN basis:** §§13.3.4 and 13.3.7 require a complete inner Sub-Process before the next sequential instance, one-time instance count, empty-input continuation and completion-condition evaluation at body completion.

**Evidence:** The [public-service lifecycle probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSequentialMultiInstanceSubprocessProbeTest.java) against CIB Seven `2.2.0` separates both orders of two inner branches, fresh Task IDs, stale completion, zero input and early completion only after the complete body. It also observes a fixed total while a changed collection supplies the next item; collection shortening rolls back completion. [Research](research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#sequential-multi-instance-sub-process-account) retains the exact source and execution boundaries. [Artifact reference verification](../scripts/contract-artifact-projections.test.ts) rejects a profile reference if this entry is removed.

**Boundary:** Public Tasks, variables, completed Activity history and Process existence, with explicit command order and background jobs disabled. This is no general MI agreement, project identity equivalence or Temporal refinement. The proposed read-only collection restriction excludes mutable-collection execution without claiming CIB snapshot behavior. Candidate rules: `SMIS-ENTER-01`, `SMIS-END-01`, `SMIS-EARLY-01`.

### CIB-AGR-0014 — parallel repeated-body completion and cancellation

**Status:** Candidate bounded agreement for the [parallel Sub-Process proposal](capsules/PARALLEL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#independent-cold-review-receipt); the linked receipt governs account approval; profile selection and qualification remain pending.

**BPMN basis:** §§13.3.4 and 13.3.7 require completion of the inner Sub-Process before counting an instance, and cancellation of remaining instances when the completion condition succeeds.

**Evidence:** The [parallel mixed-task probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenParallelMultiInstanceDataProbeTest.java) runs two concurrent bodies through Review, mapped validation and Confirm. Changing the Process condition during Review does not finish the body; completing Confirm cancels the sibling, rejects its stale Task completion and offers one parent continuation. Natural completion preserves the other body's open work. [Research](research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#parallel-body-data-and-condition-context) retains the source and executable boundary.

**Boundary:** Public task/variable APIs and Process existence, explicit command order, synchronous calibration delegates and disabled background jobs. This does not establish arbitrary nested MI, inner parallel control, production effect cancellation, Temporal refinement or public capability registration. The sequential relationship remains separate. [Artifact-reference verification](../scripts/contract-artifact-projections.test.ts) covers this candidate ID without admitting a new profile.

## Interpretation register

An interpretation belongs here when BPMN is ambiguous, inconsistent, non-operational, or leaves several permitted behaviors and the pinned CIB engine supplies one concrete meaning. It is not labeled a deviation.

The [BPMN conformance target](BPMN-CONFORMANCE-TARGET.md#import-and-admission-policy) already records specification questions involving omitted `Process.isExecutable`, import/export wording, `Import.location`, incomplete interchange versus executable admission, and multi-instance wording. Those are BPMN-source issues awaiting feature-specific CIB probes, not CIB deviations and not yet approved `CIB-INT` entries.

### CIB-INT-0001 — Exclusive Gateway candidate order is XML Sequence Flow declaration order

**Status:** Selected bounded interpretation; standards capsule implemented

BPMN requires a defined order for outgoing conditional Sequence Flows but the portable XML does not require a gateway's `<outgoing>` references to be ordered. CIB Seven `2.0.0` constructs transitions while parsing process-level `<sequenceFlow>` elements and its Exclusive Gateway behavior iterates those transitions in that declaration order.

The selected profile orders candidates by XML `sequenceFlow` declaration order. The TypeScript importer records that order in the gateway's `candidateFlowIds`; the checked Sequence Flow collection itself is sorted by identity and contains no declaration-position field. Lean independently checks that lowering preserves the supplied candidate order, but cannot reconstruct XML order from that graph. [The compiler witness](../packages/bpmn-source/test/simple-boolean-expression.test.ts) reverses only the two Sequence Flow declarations, preserves their identities and gateway references, and requires the checked order, IL order, and first-true User Task to reverse together.

**Evidence:** The [packaged-engine JUEL gateway probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenExclusiveGatewayJuelProbeTest.java) deliberately reverses gateway `<outgoing>` references while keeping declaration order fixed and observes the declaration-first branch. The standards scenario repeats that discriminator without using CIB as its expression oracle; the pinned source path and selected project rule are recorded in the [Exclusive Gateway condition specification](capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md).

**Boundary:** This interpretation is limited to the admitted divergent Exclusive Gateway slice. It is not a general order for other Flow Nodes, event races, parallel scheduling, or runtime occurrences.

### CIB-INT-0002: sequential Multi-Instance `nrOfInstances` is desired cardinality from outer entry

**Status:** Observed bounded interpretation; not selected by the standards profile

BPMN Table 10.30 describes `numberOfInstances` as the number of generated inner instances, while Clause 13.3.7 says a sequential instance is generated only after its predecessor completes. CIB Seven instead initializes public loop variable `nrOfInstances` to the once-evaluated desired collection cardinality before the first inner task appears.

The exact three-item probe observes `nrOfInstances = 3` at loop counters `0`, `1`, and `2`, while `nrOfCompletedInstances` advances through `0`, `1`, and `2` and `nrOfActiveInstances` remains `1`. This is a concrete resolution of the specification tension, not evidence that CIB generates all three sequential instances at entry.

The project standards profile does not adopt that counter identity. It keeps normative generated-instance accounting in `numberOfInstances` and exposes the once-evaluated desired cardinality separately as project-owned `plannedInstanceCount`; neither CIB variable name nor value is semantic authority.

**Evidence:** The [public-service phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSequentialMultiInstancePhaseZeroProbeTest.java), the pinned `SequentialMultiInstanceActivityBehavior`, and the [selected counter resolution](capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md#normative-account-and-selected-resolutions).

**Boundary:** This interpretation covers only the exact sequential collection-driven fixture under `CIB-CFG-0001`. It says nothing about parallel Multi-Instance, runtime modification, migration, completion conditions, compensation, or project public counter names.

## Known limitation register

### CIB-LIM-0001: standard sequential Multi-Instance output aggregation is absent

**Status:** Observed bounded limitation; not a confirmed normative deviation

BPMN 2.0.2 Clause 13.3.7 and the `loopDataOutputRef`/`outputDataItem` rows of Table 10.29 describe per-instance output transfer into the outer output collection. Clauses 10.4.1–10.4.2 and the Data Association tables describe copying an Activity output back into its Process context after completion.

The exact schema-valid fixture declares the scalar `outputDataItem`, collection `loopDataOutputRef`, complete InputSet/OutputSet, and a DataOutputAssociation to one Process-scope collection Data Object. The public probe writes one scalar task-local `reviewResult` for each iteration and completes all three tasks. CIB completes the Process but creates no historic output collection under the declared output identity, data-output name, Data Object name, Data Object ID, or Data Object Reference ID. Its execution parser reads `loopDataInputRef` and `inputDataItem` but installs no corresponding `loopDataOutputRef` or `outputDataItem` behavior.

This remains a limitation rather than a confirmed deviation because the phase-zero probe is not retained answer-free producer evidence for a general conformance claim, and CIB exposes no standard User Task output-completion protocol distinct from its public variable API. The project standards profile independently requires exact indexed scalar-to-collection mediation and atomic final publication; it selects no CIB output-aggregation oracle.

**Evidence:** The [public-service phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSequentialMultiInstancePhaseZeroProbeTest.java), its [exact BPMN fixture](../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/CibSevenSequentialMultiInstancePhaseZeroProbeTest.bpmn), and the [project output rule](capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md#stable-semantic-rules).

**Boundary:** The finding covers only this exact sequential User Task fixture and the five declared output identity/name candidates. It does not classify Camunda input/output extensions, delegates, expressions, Sub-Process data, another Activity body, or general CIB Data Association behavior.

### CIB-LIM-0002: modeled BPMN key and context correlation is not executed

**Status:** Observed bounded limitation; not a confirmed normative deviation

BPMN 2.0.2 Clause 8.4.2 defines key-based correlation through a `CorrelationKey` whose `CorrelationProperty` retrieval expressions obtain values from a Message payload. A Process `CorrelationSubscription` adds context-based bindings whose data paths obtain the current correlation-property values from the Process context.

The exact schema-valid fixture declares one Conversation-owned key, one payload retrieval expression, and one Process-owned subscription binding the same property to a Process property. Two Process instances wait on the same Intermediate Catch Message Event with different values for that Process property. A public CIB message-correlation call carrying the matching payload but no CIB API correlation criterion reports two matching executions and an empty API correlation-key set; it neither evaluates the modeled retrieval expression nor uses the modeled Process binding. Supplying `processInstanceVariableEquals` through the CIB public API then selects and completes the intended instance while leaving the other wait live.

At the pinned `2.2.0` source revision, the [BPMN Model API registers the correlation model types](https://github.com/cibseven/cibseven/blob/834a9874760de8a0107f7c1b32806e37f17fb017/model-api/bpmn-model/src/main/java/org/cibseven/bpm/model/bpmn/Bpmn.java#L487-L492), while the [runtime correlation handler](https://github.com/cibseven/cibseven/blob/834a9874760de8a0107f7c1b32806e37f17fb017/engine/src/main/java/org/cibseven/bpm/engine/impl/runtime/DefaultCorrelationHandler.java#L79-L123) builds execution queries only from the public API's Process-variable, local-variable, business-key, Process-instance-ID, tenant, and Message-name criteria. CIB's API variable criterion is therefore a separate engine extension and not execution of the modeled BPMN retrieval and context paths.

This remains a limitation rather than a confirmed deviation because the phase-zero probe is a calibration witness, not retained answer-free producer evidence for a general conformance claim. The project standards profile must define and evidence its own bounded correlation account rather than adopting the API extension as BPMN meaning.

**Evidence:** The [public-service phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenMessageCorrelationPhaseZeroProbeTest.java), its [exact BPMN fixture](../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/CibSevenMessageCorrelationPhaseZeroProbeTest.bpmn), and the pinned source paths above.

**Boundary:** The finding covers one non-instantiating Intermediate Catch Message Event, one non-empty string property, one key, one retrieval expression, one Process subscription binding, two waiting Process instances, one ambiguous no-criterion call, and one successful Process-variable API criterion under `CIB-CFG-0001`. The fixture separates correlation selection only: it does not select Intermediate Catch Message compatibility, the fixture's expression language, Message payload mediation, initialization by a first Message, dynamic context updates, multiple keys or properties, Conversation execution, start-Message correlation, broadcast, local-variable or business-key criteria, or a general CIB correlation profile.

## Extension register

### CIB-EXT-0001 — exact delegate-expression Service Task binding

**Status:** Selected bounded extension

The Service Task effect profile admits exactly the paired standard protocol URI `urn:bpmn-lean:effect:probe-v1`, Camunda-namespace `delegateExpression="${bpmnLeanEffectHandler}"`, and Camunda-namespace `asyncBefore="true"` attributes. CIB Seven resolves the exact bean token and creates one durable async-before continuation job. The lexical XML prefix is irrelevant; both extension attributes are identified by expanded namespace name.

The selected extension is a host realization, not an independent derivation of the project's activated effect intent. CIB exposes a pre-activation continuation wait followed by atomic delegate invocation and Service Task completion. The project adapter maps that wait to the one bounded semantic effect occurrence and descriptor, with activation ordinal `1` decided from the required singleton job count.

**Evidence:** [Service Task effect scenario](../scenarios/service-task-effect/README.md), [packaged-engine phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskPhaseZeroProbeTest.java), [immutable profile](../profiles/cibseven-2.2.0-service-task-effect-draft/README.md), and content-bound retained evidence produced only by the explicit replacement command.

**Boundary:** This entry claims no general JUEL, arbitrary bean, Java class, `JavaDelegate`, `DelegateExecution`, field injection, listener, variable, service-fault, incident, external-task, or Process Engine API compatibility.

### CIB-EXT-0002 — exact A12 CreateDocument delegate and input/output mapping

**Status:** Selected bounded extension

The A12 CreateDocument profile admits exactly `{http://camunda.org/schema/1.0/bpmn}delegateExpression="${createDocumentDelegate}"`, one `camunda:inputOutput` element, literal input parameter `documentModelName = "MyDocumentModel"`, and output parameter `myDocumentReference = ${newDocRef}`. The project profile supplies protocol identity `urn:bpmn-lean:a12-delegate:v1`; that URI is not read from the maintained BPMN source.

CIB Seven `2.0.0` resolves the exact bean token, provides the mapped literal to the delegate, reads the delegate-written Activity-local `newDocRef`, and maps it into Process variable `myDocumentReference`. The selected extension is lexical and behavioral only for this one string-valued successful path. The token is not evaluated as a general JUEL expression by the project.

**Evidence:** [CreateDocument specification](capsules/CREATE-DOCUMENT-DATA-SPEC.md), [CIB Seven 2.0 target assessment](research/CIB-SEVEN-A12-BASELINE-RESEARCH.md), [frozen A12 target profile](../adoption/a12/legacy/source-tree/profiles/cibseven-2.0.0-a12-create-document-draft/README.md), [frozen packaged-engine runner test](../adoption/a12/legacy/source-tree/runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenCreateDocumentScenarioRunnerTest.java), the frozen project-authored equivalent fixture and content-bound `2.0.0` evidence, and the optional unchanged-source gate.

**Boundary:** This entry claims no general input/output mapping, expression language, arbitrary variable, bean, delegate, `DelegateExecution`, Java binary, failure, transaction rollback, Script Task, listener, or engine-API compatibility.

### CIB-EXT-0003 — exact deferred delegate expression and typed Java BPMN Error

**Status:** Selected bounded extension

The boundary-error profile admits exactly `{http://camunda.org/schema/1.0/bpmn}delegateExpression="#{createRelationshipLinkDelegate}"` and maps that deferred-expression token to project handler identity `createRelationshipLinkDelegate`. The project rejects the `${...}` spelling for this profile and does not evaluate either form as general JUEL.

CIB Seven `2.0.0` resolves the exact bean and permits the delegate to throw `BpmnError` with non-empty code `LinkLimitReachedError` and either no message or the reviewed non-empty message. The project Worker-facing result is a language-neutral typed value rather than a Java exception; Java `BpmnError`, bean lookup, and `DelegateExecution` remain host-extension mechanisms.

**Evidence:** [Boundary-error specification](capsules/BOUNDARY-ERROR-SPEC.md), [frozen packaged-engine phase-zero probe](../adoption/a12/legacy/source-tree/runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBoundaryErrorPhaseZeroProbeTest.java), and the frozen project-authored fixture.

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

**Evidence:** The Java-21 [packaged-engine phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskCompletionDataPhaseZeroProbeTest.java) uses the pinned CIB BPMN Model API to build the exact two-task control, records public task-service maps, runtime variables, final historic variables, active task keys, and Process liveness, and runs under `CIB-CFG-0001`. The [User Task completion-data specification](capsules/USER-TASK-COMPLETION-DATA-SPEC.md) owns the selected project rules and refinement boundary.

**Boundary:** Only Process-scope string and explicit null values, one exact active task, create/overwrite/preserve merge, no-data preservation, continuation visibility, final-history visibility, and unknown/stale refusal are selected. Task-local and transient variables, deletion, nested or serialized values, BPMN input/output specifications and Data Associations, forms, field validation, variable authorization, people assignment, multiple active dummy tasks, and general Task Service compatibility remain excluded.

### CIB-EXT-0006 — public Process start installs initial Process variables

**Status:** Selected bounded extension

CIB Seven `2.2.0` accepts a variable map through `RuntimeService.startProcessInstanceByKey(processDefinitionKey, variables)`. In the project-owned two-User-Task probe, the first active User Task reads the exact initial string map before any task-completion call. The no-data and completion controls retain those bindings until explicitly overwritten, and final history preserves the resulting Process map.

This is a CIB public-service extension over Process instantiation, not general BPMN data initialization, Data Association, or form meaning. The selected project profile maps one canonical string/null `initialVariables` list to fresh Process scope before internal start closure. A rejected semantic start installs no supplied value and creates no Temporal Workflow.

**Evidence:** The Java-21 [packaged-engine phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskCompletionDataPhaseZeroProbeTest.java) supplies the initial map through the public Runtime Service and reads it through the first task before completion under `CIB-CFG-0001`. The ordinary retained sequential scenarios now carry content-bound initial data through the Java runner. The [Process-start data specification](capsules/PROCESS-START-DATA-SPEC.md) owns the selected project rules and refinement boundary.

**Boundary:** Only a fresh private executable Process, canonical Process-scope string and explicit null values, visibility at the first stable wait, empty-list preservation, and exact semantic-start refusal are selected. Business keys, case instances, tenant IDs, named start events, start messages, transient or local variables, nested or serialized values, BPMN Properties and Data Associations, forms, variable authorization, and general Runtime Service compatibility remain excluded.

### CIB-EXT-0007 - bounded mapped-success Service Task input and output mapping

**Status:** Selected bounded extension

The product-neutral mapped-success profile admits exactly one Activity binding, one literal `requestValue = "example-input"` input parameter, and one `resultValue = ${result}` output parameter. CIB Seven `2.0.0` resolves the exact profile-owned binding, provides the mapped literal to the test delegate, reads the delegate-written Activity-local `result`, and maps it into Process variable `resultValue`.

**Evidence:** [Mapped-success scenario](../scenarios/mapped-success-service-task/README.md), [content-bound CIB evidence](../scenarios/mapped-success-service-task/cibseven-evidence.json), [scenario runner test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenMappedSuccessScenarioRunnerTest.java), and [product-neutral profile](../profiles/cibseven-2.0.0-mapped-success-service-task-draft/README.md).

**Boundary:** This selects one successful string-valued path. It does not select general input/output mapping, expression evaluation, arbitrary variables, beans, delegates, Java compatibility, failure, rollback, scripts, listeners, or engine APIs.

### CIB-EXT-0008 - bounded mapped-boundary Service Task binding and typed BPMN Error

**Status:** Selected bounded extension

The product-neutral mapped-boundary profile admits exactly one Activity binding and maps the Worker-facing typed result to a CIB `BpmnError` carrying nonempty code `MappedBusinessError` and the reviewed message. The project result remains a language-neutral value; Java exception transport and bean resolution are CIB host mechanisms.

**Evidence:** [Mapped-boundary-Error scenario](../scenarios/mapped-boundary-error-service-task/README.md), [content-bound CIB evidence](../scenarios/mapped-boundary-error-service-task/cibseven-evidence.json), [scenario runner test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenMappedBoundaryErrorScenarioRunnerTest.java), and [product-neutral profile](../profiles/cibseven-2.0.0-mapped-boundary-error-service-task-draft/README.md).

**Boundary:** This selects one exact handler token and one Error code. It does not select arbitrary expressions, handlers, Java delegate compatibility, Process-scope Worker writes, technical failures as business Errors, or other Error codes.

### CIB-EXT-0009 - bounded caught-Error output mapping before Activity cleanup

**Status:** Selected profile-scoped extension

CIB Seven `2.0.0` applies the selected `resultValue = ${result}` output parameter on the matching interrupting Error path before clearing Activity-local state. The reviewed null patch therefore creates a present null-valued Process variable before `ReviewMappedError` is exposed. The project semantic program remains mapping authority and applies patch, mapping, cleanup, and boundary routing atomically.

**Evidence:** [Mapped-boundary-Error scenario](../scenarios/mapped-boundary-error-service-task/README.md), [content-bound CIB evidence](../scenarios/mapped-boundary-error-service-task/cibseven-evidence.json), [scenario runner test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenMappedBoundaryErrorScenarioRunnerTest.java), and [product-neutral profile](../profiles/cibseven-2.0.0-mapped-boundary-error-service-task-draft/README.md).

**Boundary:** BPMN does not define this extension mapping during cancellation. Arbitrary mappings, expressions beyond one local reference, value kinds beyond string/null, nested scopes, general fault propagation, and a broader cancellation claim remain excluded.

### CIB-EXT-0010 — public User Task completion preserves a Boolean Process variable

**Status:** Selected bounded extension; registered, evidence-closed, and independently closure-reviewed

CIB Seven `2.2.0` accepts a Java `Boolean` in the public variable map supplied to `TaskService.complete(taskId, variables)`. In the project-owned two-User-Task probe, completing the first task with `Boolean.TRUE` exposes the same `java.lang.Boolean` through the next task's variables and Runtime Service variables, and final audit history retains it after Process completion. The probe rejects string `"true"` as an equivalent observation and confirms unknown and stale task IDs preserve the complete live state.

This is an additional CIB public-service extension over the BPMN User Task lifecycle, not general BPMN data-association, form, or variable-type meaning. The registered project profile maps one exact tagged Boolean completion value to the existing atomic merge-before-continuation behavior while retaining string/null Process Start and refusing Boolean under every old profile and non-selected surface. Its answer-free scenario, retained CIB evidence, Lean/core/differential execution, runnable example, and live Temporal witness are complete.

**Evidence:** The Java-21 [Boolean phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBooleanProcessDataPhaseZeroProbeTest.java) uses pinned CIB Seven `2.2.0`, the public Model API, Task Service, Runtime Service, and History Service under `CIB-CFG-0001`. The [Boolean Process-data specification](capsules/BOOLEAN-PROCESS-DATA-SPEC.md) owns the selected project rules, profile gate, Lean question, and Temporal account. The [registered scenario](../scenarios/user-task-boolean-completion/scenario.json) and [retained evidence](../scenarios/user-task-boolean-completion/cibseven-evidence.json) bind the actual Java Boolean observation to the same answer-free target that Lean, the independent core, differential comparison, and Temporal consume. The [checkpoint CIB test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBooleanProcessDataCheckpointTest.java) separately locks the project representation, value-domain admission, actual Java Boolean projection, and old-profile refusal.

**Boundary:** Only primitive Java Boolean on one exact active User Task completion, Process-scope create/replace/preserve merge, continuation visibility, final-history visibility, and unknown/stale refusal are selected. Boolean Process Start, task-local/transient data, nested or serialized values, numbers, deletion, BPMN input/output specifications and Data Associations, forms, field validation, authorization, assignment, expression evaluation, effects, multiple active dummy tasks, and general Task Service compatibility remain excluded. Existing `CIB-EXT-0005` and `CIB-EXT-0006` remain frozen to string/null values.

### CIB-EXT-0011: one literal candidate group on a User Task

**Status:** Selected bounded extension; registered and evidence-closed

CIB Seven `2.2.0` consumes the exact foreign attribute `{http://camunda.org/schema/1.0/bpmn}candidateGroups` on a User Task and exposes each resolved group through public Task Service candidate identity links. The selected project profile restricts this broader CIB surface to one nonempty literal group ID with no boundary code point from the proposal's explicit profile boundary-space set, refuses rather than normalizes boundary space, comma lists, and expressions, and projects one neutral group candidate into the existing open User Task. A leading or trailing U+00A0 is the non-ASCII separating control.

This is a CIB source and public-service extension, not the standard Potential Owner account. BPMN Resource Roles permit a Resource reference or assignment expression, but neither the normative representation nor the selected phase-zero observation identifies a portable literal group ID. A standard `potentialOwner` naming a Resource with the same human-readable value produces no CIB candidate identity link and remains deferred.

**Evidence:** The [assignment/form phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskAssignmentFormMetadataPhaseZeroProbeTest.java) uses pinned CIB Seven `2.2.0`, public Model API, Task Service task queries, and public identity-link queries under `CIB-CFG-0001`. It distinguishes the selected literal group from a changed group, CIB's comma-list expansion, CIB expression evaluation, a foreign-namespace twin, and a standard Potential Owner Resource reference. The [registered scenario](../scenarios/user-task-assignment-form-metadata/scenario.json), [retained evidence](../scenarios/user-task-assignment-form-metadata/cibseven-evidence.json), and [checkpoint test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskMetadataCheckpointTest.java) bind the public-service facts to the neutral projection. The [User Task assignment and form metadata specification](capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md) owns the selected projection and exclusions.

**Boundary:** One exact literal candidate group on one User Task is selected. Candidate users, multiple groups, expressions, assignee, owner, claim, release, identity lookup, authorization, organization semantics, Resource Roles, Human Performer, Potential Owner, Lane inference, due dates, follow-up dates, priority, notifications, and general Task Service compatibility remain excluded.

### CIB-EXT-0012: one typed generated-form field on a User Task

**Status:** Selected bounded extension; registered and evidence-closed

CIB Seven `2.2.0` consumes one exact `{http://camunda.org/schema/1.0/bpmn}formData` container with one `{http://camunda.org/schema/1.0/bpmn}formField`, and public Form Service exposes the field's unqualified `id` plus exact `string` or `boolean` type. Completing the task through public Task Service with a Java Boolean remains the separately selected `CIB-EXT-0010` value fact.

This is a CIB generated-form extension, not standard BPMN rendering content. BPMN Table 10.13 and the normative Rendering type define an opaque extension hook but no portable field identity, field type, rendering, validation, or submission mapping. The selected project profile therefore projects only neutral immutable field metadata and does not claim a form engine.

**Evidence:** The [assignment/form phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskAssignmentFormMetadataPhaseZeroProbeTest.java) uses public Model API and Form Service, proves alternate-prefix namespace identity, distinguishes `boolean` from `string`, and completes the selected task with an actual Java Boolean. The [registered scenario](../scenarios/user-task-assignment-form-metadata/scenario.json), [retained evidence](../scenarios/user-task-assignment-form-metadata/cibseven-evidence.json), and [checkpoint test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskMetadataCheckpointTest.java) independently retain exact Form Service field ID and type-name facts. The [User Task assignment and form metadata specification](capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md) owns the exact source shape, public projection, and Temporal account.

**Boundary:** One exact field with one nonempty key having no boundary code point from the proposal's explicit profile boundary-space set and type `string` or `boolean` is selected. Boundary space is refused without normalization; leading or trailing U+00A0 is the non-ASCII control. Multiple fields, labels, defaults, constraints, properties, scripts, form keys, rendering, submission mapping, field validation, task-local data, new value kinds, standard Rendering, WSHumanTask, and general Form Service compatibility remain excluded.

### CIB-EXT-0013: failed-job Service Task incident and retry

**Status:** Selected bounded extension; implemented and evidence-closed

CIB Seven `2.2.0` decrements the selected async-before Service Task job after failed public execution, creates one `failedJob` incident when retries reach zero, and removes that incident when public Management Service resets the same job to a positive retry count. The registered project profile restricts this operational surface to one exact Service Task effect, one payload-free technical failure, one public incident kind, and one retry that reopens the same semantic effect occurrence.

This is a CIB job-management extension, not general BPMN service-fault meaning. BPMN 2.0.2 does not define engine job retry counts, failed-job incidents, Management Service retry reset, or incident identity. The project therefore names the public semantic fact `effectExecutionFailed` and does not expose CIB job or incident IDs, retry count, exception details, or administrative retry policy.

**Evidence:** The [packaged-engine phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskIncidentPhaseZeroProbeTest.java) uses the exact selected Service Task source, public job execution, public incident query, and public retry reset. Under `createIncidentOnFailedJobEnabled = true`, it proves `3 -> 2 -> 1 -> 0`, one self-rooted public `failedJob` incident configured by the same job, incident removal after reset to one retry, replacement by a new raw incident after another failure, and later success through the same job and Process. The disabled-setting control reaches retries zero with no incident. The [registered profile](../profiles/cibseven-2.2.0-service-task-incident-draft/profile.json), [retained evidence](../scenarios/service-task-incident/cibseven-evidence.json), [incident runner test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenIncidentRunnerTest.java), and [schedule-alignment test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenIncidentScheduleAlignmentTest.java) bind the selected first literal-generation incident and one retry; the later raw incident remains research evidence outside its canonical mapping. The [Service Task incident capsule](capsules/SERVICE-TASK-INCIDENT-RETRY-SPEC.md) owns that boundary.

**Boundary:** One failed async-before job, one `failedJob` incident, one public retry reset, same job and Process retention, literal generation 1, and later success are selected. A second failed execution may occur only as raw CIB research evidence or a Temporal host failure and creates no second canonical incident. General incidents, further retry cycles, backoff, due dates, incident messages, job deletion, batch retry, arbitrary Management Service operations, external tasks, Process cancellation, BPMN Error, compensation, and production operator UI remain excluded.

### CIB-EXT-0014: public external deletion of one incident-bearing root Process

**Status:** Selected bounded extension; implemented and evidence-closed

CIB Seven `2.2.0` accepts public `RuntimeService.deleteProcessInstance(processInstanceId, reason, false, true)` for the root Process retained by the selected failed-job incident. The operation removes the live Process, job, incident, execution, and task region and records the historic root as `EXTERNALLY_TERMINATED`. A committed Process variable remains readable through public History Service after deletion.

This is a CIB public lifecycle extension beyond bare BPMN Process execution. BPMN 2.0.2 does not define an incident-addressed external root-deletion API, delete reason, or externally terminated historic-state code. The project profile maps one exact published generation-1 incident and root semantic Process identity to a typed cancelled terminal state without exposing CIB identity or making runtime absence sufficient evidence.

**Evidence:** The [Service Task incident phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskIncidentPhaseZeroProbeTest.java) starts the exact selected Process with one string variable, drives the configured job to one `failedJob` incident, invokes the public deletion operation, and checks zero live Process/job/incident/execution/task state, historic `EXTERNALLY_TERMINATED`, and the preserved historic variable. Its successful control separately requires historic `COMPLETED`. The [registered successor profile](../profiles/cibseven-2.2.0-service-task-incident-cancellation-draft/profile.json), [retained evidence](../scenarios/service-task-incident-cancellation/cibseven-evidence.json), [cancellation runner test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenIncidentCancellationRunnerTest.java), and [incident-scoped Process cancellation specification](capsules/SERVICE-TASK-INCIDENT-CANCELLATION-SPEC.md) bind the project command, typed state, cleanup, historic-state discriminator, and evidence boundary.

**Boundary:** Only the exact incident-bearing root Process, one exact public deletion call, cascade cleanup, externally terminated history, and one retained string Process variable are selected. Arbitrary Process deletion, nested-scope cancellation, deletion reason, listener or I/O-mapping policy, compensation, Transaction Cancel, modeled Terminate, batch deletion, process modification, suspension, activation, restart, job deletion, Product 2 authorization, and general Runtime Service compatibility remain excluded.

### Research queue

| Hint | Status | Required investigation |
|---|---|---|
| Java class, delegate-expression, expression, field-injection, and bean execution | Family inventoried in [CIB Seven extension research](research/CIB-SEVEN-EXTENSIONS-RESEARCH.md); first read-only condition slice classified by `CIB-AGR-0006`, `CIB-INT-0001`, `CIB-OP-0004`, and `CIB-CFG-0005` | Keep project handler binding, Java class loading, dependency injection, `JavaDelegate`, `DelegateExecution`, bean/method capability, mutation, engine services, and every expression context beyond the selected root-variable slice separate. |
| Script Task and script-bearing extensions | Family inventoried; disposition pending | Separate read-only JUEL, variable mutation, capability-bearing expressions, effectful scripts, and versioned engine-compatible scripts. Pin language, runtime, security, variables, results, limits, and dependencies before selection. |
| FEEL | Not selected as a substitute for the target JUEL surface | The pinned CIB FEEL integrations belong to DMN. Reopen only for a concrete DMN or explicitly FEEL-declared consumer with its own pinned runtime, result mapping, and CIB calibration. |
| External-task execution associated with a BPMN Service Task | Deferred alternative; not an adopted extension record | Reopen only for a concrete consumer of the topic, fetch-and-lock, lease, completion, failure, retry, and incident protocol. |

The research queue is not evidence and does not authorize implementation. It prevents a useful extension candidate from being conflated with a deviation or silently entering the semantic core.

### CIB-EXT-0015 — serial business-task enclosing inputs and local results

**Status:** Selected bounded extension under the approved [serial business-task account](capsules/SERIAL-BUSINESS-TASK-COMPOSITION-PROPOSAL.md); implementation and profile evidence remain open.

CIB Seven `2.2.0` input parameters evaluate against the enclosing scope before writing Activity-local inputs. Output parameters evaluate against the Activity scope; a local result takes precedence over a same-named parent value. The selected account admits only its explicit scalar literal/reference subset, unambiguous named delegate bindings and exact supplied output sources. Its identifier, reserved-name, initialization and result-patch restrictions are project admission decisions, not general CIB behavior.

**Evidence:** The [phase-zero experiment](experiments/BUSINESS-EFFECT-DATA-EXPERIMENT.md) and [public-service probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBusinessEffectDataPhaseZeroProbeTest.java) separate both input declaration orders, present null, missing-input failure before invocation, local output precedence and Process-instance separation. [Artifact-verifier coverage](../scripts/contract-artifact-projections.test.ts) requires this registered relationship and rejects a profile reference when its registry entry is absent. Full profile equivalence and retained scenario evidence remain unestablished.

**Boundary:** No general JUEL, bean/Java API compatibility, nested mapping, parent-output fallback, technical-failure equivalence or concurrent execution is claimed. CIB's async-before job precedes invocation; the project's committed argument snapshot and durable external-effect interval remain its own operational realization. Input/final-output comparisons do not establish equivalent transaction timing or exactly-once external effects.

### CIB-EXT-0016 — CIB7 2.2.0 caught-business-Error output mapping

**Status:** Selected bounded extension under the approved [mixed-task business Error account](capsules/MIXED-TASK-BUSINESS-ERROR-PROPOSAL.md); implementation and profile qualification remain open.

CIB Seven `2.2.0` applies the attached Service Task's output parameters on the matching Error path before Activity-local cleanup. A local result shadows a same-named parent, including present null. Without a local result, lookup may inherit the parent; with no binding in either scope, mapping fails and rolls back the asynchronous job command before recovery work commits. The selected project account requires complete explicit local results on both result arms, selecting local precedence but excluding fallback and missing-result execution.

**BPMN boundary:** Bare BPMN does not define the CIB `inputOutput` extension during cancellation. This is an extension over the normative interrupting catch, not a claim that BPMN requires fault-path output mediation. The project retains typed `bpmnError` as an Activity result; CIB's Java exception and same-command transaction are host mechanisms.

**Evidence:** The [business-failure experiment](experiments/BUSINESS-EFFECT-DATA-EXPERIMENT.md#business-failure-follow-up), its [public-service probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBusinessFailurePhaseZeroProbeTest.java), pristine `ExecutionEntity.destroy`/`IoParameter.execute`/`OutputParameter.execute` source, and [artifact reference verification](../scripts/contract-artifact-projections.test.ts). CIB supplies this mapping account and cannot also count as independent corroboration of it.

**Boundary:** String/null results and declared scalar mappings only; no arbitrary JUEL, Java binary compatibility, Process-side delegate writes, nested scope, missing-local fallback, retry equivalence or exactly-once external effects. The unmatched Error's root-cleanup failure is observed separately, including a literal-output counterexample and mapping-free control; it is not adopted semantics or a new BPMN deviation claim. Existing `2.0.0` records and profiles remain unchanged.

### CIB-EXT-0017 — repeated Sub-Process body-local mapping and enclosing writes

**Status:** Candidate bounded extension for the [sequential Sub-Process proposal](capsules/SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md); proposal review approved; profile selection and qualification pending.

CIB input parameters initialize local bindings in each new body. Human completion updates the nearest existing binding, while a Service output parameter evaluates its Activity-local result and writes through the enclosing scope. Declared body locals shadow parent variables, including present null. With those declarations absent, the same writes reach the existing Process variables. Body disposal removes locals and the next body reinitializes them. The exact CIB `inputOutput` and Task Service variable protocol are extensions, not normative BPMN data-association syntax.

**Evidence:** The [mixed human/Service body probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSequentialMultiInstanceDataProbeTest.java) against CIB Seven `2.2.0` separates repeated bodies, interleaved Processes, null and missing body declarations. Its distinct-source and shared-source outputs additionally distinguish body-local `decision` from Process-owned `summary`, both initially absent and present, through public variable rows and Task Service visibility. Both String/null orders preserve parent shadows, dispose Service locals and reinitialize the next body. A crossed-source control changes the observed targets. The focused class passes `/tmp/smis-cib-output-mapping-green-20261012`; the retained wrong-wiring run fails `/tmp/smis-cib-output-mapping-red-20261012`, both separately asserted on 2026-10-12. The complete two-release runner gate passes `/tmp/smis-cib-calibration-runner-integration-20261012`, and the focused source/artifact/document guards pass `/tmp/smis-cib-calibration-integration-20261012`, both separately asserted. These synchronous observations do not establish strict explicit-result rejection, asynchronous hosting or whole-model equivalence.

The [research boundary](research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#repeated-body-data-boundary) identifies `InputParameter.execute` and `OutputParameter.execute`; [artifact reference verification](../scripts/contract-artifact-projections.test.ts) checks registration. This source-informed account and its CIB probe are not independent semantic interpretations.

**Boundary:** One ordinary body level, string/null mappings, explicit local Service results and nearest existing parent/body bindings. No arbitrary JUEL, general nested mapping, MI output aggregation, external side-effect rollback or Temporal transaction equivalence. Existing `CIB-EXT-0015` remains root-only; it is not silently broadened. Candidate rule: `SMIS-DATA-01`.

### CIB-EXT-0018 — parallel body mappings and post-disposal condition context

**Status:** Candidate bounded extension for the [parallel Sub-Process proposal](capsules/PARALLEL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#independent-cold-review-receipt); the linked receipt governs account approval; profile selection and qualification remain pending.

CIB input parameters capture enclosing values into each concurrently created body. Declared locals isolate human completion and mapped Service results, including present null. Removing the declarations makes those writes reach the shared Process binding in explicit command order. The selected JUEL Process-variable completion condition is evaluated after body-local disposal: opposite local/Process Boolean values distinguish the enclosing condition value from the former body value. The proposal protects the selected condition name against local redeclaration rather than implying a general variable-scope contract.

**Evidence:** The [parallel data probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenParallelMultiInstanceDataProbeTest.java) and [source-grounded research](research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#parallel-body-data-and-condition-context) retain the four passing cases. [Artifact-reference verification](../scripts/contract-artifact-projections.test.ts) covers this candidate ID. CIB `inputOutput`, Task Service patches and JUEL name lookup are selected extension mechanisms, not normative DataAssociation syntax.

**Boundary:** One ordinary body level, string/null data, Boolean condition controls, immutable input collection and synchronous mapped delegate success. No automatic rollback of committed sibling writes, arbitrary expressions, general local-variable accessibility after scope completion, MI output aggregation or durable-effect equivalence is claimed. `CIB-EXT-0017` retains its separate sequential evidence boundary.

### CIB-EXT-0019 — structured business-task inputs and local results

**Status:** Selected bounded extension for the [structured effect-data amendment](capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#structured-effect-data-consuming-amendment), closed by independent review on 2026-10-14; selected by the draft effect-data profile artifact. The [structured effect-result probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenStructuredEffectResultProbeTest.java) (2026-10-14) observes the credit decision's input reference: Notify's in-place mutation of its structured input reaches the Process variable, the excluded aliasing boundary.

CIB Seven `2.2.0` evaluates a `${name}` input or output parameter to the raw variable object and stores that reference without copying (`InputParameter.java:46,51`, `OutputParameter.java:47,52`, `AbstractVariableScope.java:149-153,317-319`, JUEL `TypeConverterImpl.java:343-345`). Output mapping runs when the Activity scope is destroyed, after the delegate returns, and then removes every Activity-local variable (`ExecutionEntity.java:523-527,554`). BPMN 2.0.2 §10.4.1 states that executing a Data Association copies data to its target; the selected account follows it, carrying one `SingletonBusinessItem` per mapped name by value.

**Boundary:** A delegate mutating a structured input in place changes the Process variable through aliasing, and implicit update detection persists it (`TypedValueField.java:155-168`). The project's handler receives an immutable snapshot, so this aliasing is outside the selected account. No general JUEL, nested expression, Java object or listener mutation is claimed.

**Evidence:** the calibration probe [`CibSevenStructuredEffectResultProbeTest`](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenStructuredEffectResultProbeTest.java) records the projected result and the excluded input aliasing; it is not retained differential evidence.

### CIB-EXT-0020 — nested embedded scope locals and nearest-owner writes

**Status:** Selected bounded extension under the implemented [nested embedded scope data specification](capsules/NESTED-EMBEDDED-SCOPE-DATA-SPEC.md); CIB calibration pending.

CIB Seven `2.2.0` accepts `camunda:inputOutput` on an ordinary embedded `subProcess` (`BpmnParse.checkActivityInputOutputSupported`), runs its input parameters at entry in the outer scope (`PvmExecutionImpl.executeIoMapping`, `IoParameter.execute`, `InputParameter`) and its output parameters when the scope is destroyed in the inner scope (`ExecutionEntity.destroy`, `OutputParameter`). `AbstractVariableScope.setVariable` updates the nearest scope that has the name locally, walking parent by parent, and creates the binding at the root otherwise; a present null is a local binding and shadows.

**Boundary:** Serial nested ordinary embedded scopes up to definition depth three, String-literal or exact `${name}` inputs, outputs sourced from a declared local of the same scope and run at normal completion only, and `SingletonBusinessItem` values. It broadens the one-body-level account of `CIB-EXT-0017` without changing that entry. CIB also runs outputs on non-normal destruction (see `CIB-EXT-0016`); the abnormal-exit output policy belongs to a later interruption or Error amendment. The profile admits User Task completion patches only over names declared on the task's scope chain; this is a profile admission restriction, since CIB's `TaskEntity.setExecutionVariables` creates a root binding for an undeclared name. The calibration covers two nested levels; the admitted third level is uncalibrated. No concurrent branches, JUEL beyond exact references, Call or Multi-Instance mapping, aliasing of structured values (see `CIB-EXT-0019`) or BPMN `property`/`dataObject` notation.

**Evidence:** pending; the selected calibration extends the [body-data probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSequentialMultiInstanceDataProbeTest.java) to two nested levels.

### CIB-EXT-0021 — Call variable mappings by name across the instance boundary

**Status:** Selected bounded extension under the [Call variable mapping specification](capsules/CALL-VARIABLE-MAPPING-SPEC.md#normative-basis-and-cib-classification), calibrated against CIB Seven `2.2.0`.

BPMN 2.0.2 Clause 10.3.6 transfers Call data only through matching Call Activity and CallableElement inputs and outputs, and Clause 13.3.4 gives the called Process its own instance, so name-based transfer is an extension layered on the BPMN Call lifecycle. CIB Seven `2.2.0` reads `camunda:in`/`camunda:out` (`BpmnParse` Call parsing), evaluates every input in document order against the Call Activity's execution before the called instance starts (`CallableElementActivityBehavior`, `CallActivityBehavior`), copies an unset source as a present null (`CallableElementParameter`), gives the called instance no parent variable scope (`PvmExecutionImpl`), reads every output from the called process-instance scope at normal end and writes it with `setVariables` from the Call Activity's execution, so it lands at the nearest existing caller binding or the caller Process (`AbstractVariableScope.setVariable`, see `CIB-EXT-0020`), and silently drops outputs targeting `nrOfInstances`, `nrOfActiveInstances` or `nrOfCompletedInstances`. It reads `calledElement` as a raw deployment key, although BPMN types it as `xsd:QName`.

**Boundary:** One Call on the serial path of the caller's root in a two-Process document, `calledElement` equal to the other in-document Process's `id` with no QName resolution claimed, one to eight constant-`source` inputs and up to eight outputs with distinct nonempty targets and no reserved output target, and a called Process of one to three serial User Tasks. Outputs run at normal return only; CIB also runs them when an Error or Escalation leaves the called instance (`OutputVariablesPropagator`), which `PC-SCOPE-06` decides. Called completion patches name only input targets and output sources, a profile admission restriction since CIB would create any called variable. No `sourceExpression`, `variables="all"`, `local`, `businessKey`, version or tenant binding, mapping class or delegate, Call inside a Sub-Process (`PC-SCOPE-05`), repeated or concurrent mapped Call, or Call-carried BPMN data. Under the embedded completion profile only the key clause applies, to empty-data Calls in Process root bodies that repeat serially, run concurrently on Parallel branches and nest to depth three, with every mapping attribute refused ([repeated, nested and concurrent Calls](capsules/REPEATED-NESTED-CONCURRENT-CALLS-PROPOSAL.md#normative-basis-and-cib-classification)).

**Evidence:** The [Call variable mapping probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenCallVariableMappingProbeTest.java) drives the [retained loan application](../scenarios/call-variable-mapping/README.md) through its three journeys in the packaged CIB Seven `2.2.0` engine: the called instance's local variables hold exactly the copied inputs, an unset or present-null source arriving as a present null; a called patch of an input target leaves the caller's namesake unchanged; at return the outputs land on the caller Process, a never-set source overwriting the target with null. It maps no CIB child-instance or task id to the project's derived called identity; the ended caller's variables are read from CIB's variable history. The embedded completion profile's key reading has source-level agreement only: the [supplier onboarding scenarios](../scenarios/repeated-nested-concurrent-calls/README.md) cite this entry, and Lean, the TypeScript core and the pipeline agree on them, but no CIB run calibrates repeated, nested or concurrent Calls.

## Permitted operational-detail register

### CIB-OP-0001 — CIB host task identity mapped to project semantic task identity

**Status:** Reviewed operational mapping

CIB creates a generated task ID and addresses completion through `TaskService.complete(taskId)`. BPMN does not prescribe that database identity, Java API, or a portable encoding for one task occurrence.

The oracle adapter therefore maps the one live CIB task to project-owned identity `(Process instance, BPMN element, activation ordinal)` and keeps the generated CIB ID local to the query/complete call. A wrong activation is rejected by this mapping before calling CIB; after completion or interruption, absence of a matching live CIB task supports stale-occurrence rejection. The bounded project consistency probe starts the exact sequential fixture, captures its generated CIB task ID, completes that task, and then observes pinned CIB Seven reject a second `TaskService.complete` call for the now-non-live generated ID. The retained Sub-Process Error schedule supplies the separate interruption case. Together they confirm that the adapter's “no matching live host task means refuse” assumption agrees with the pinned engine at both selected lifecycle boundaries, but they do not turn the project activation ordinal into a raw CIB engine concept or close the adapter-decided activation cell.

This mapping preserves the BPMN-visible lifecycle under `CIB-AGR-0002` while avoiding false identity equivalence across CIB, Lean, TypeScript, and Temporal. Evidence and exact exclusions are in the [User Task interaction capsule](capsules/USER-TASK-INTERACTION-SPEC.md), [Sub-Process Error-propagation capsule](capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md), [the consistency probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenConsistencyProbeTest.java), and [CIB runner documentation](../runners/cibseven/README.md).

### CIB-OP-0002 — synchronous CIB delegate transaction mapped to a durable effect boundary

**Status:** Reviewed operational mapping

CIB Seven `2.0.0` executes the selected CreateDocument delegate and its input/output mappings synchronously inside the command transaction. It exposes no committed intermediate state corresponding to the project's effect intent or in-flight Temporal Activity. The project semantic core instead commits an effect wait and immutable arguments before the Temporal adapter performs the external effect, then applies one validated result patch and output mapping.

For the approved success-only capsule, both accounts agree on admitted input and final Process variables. The CIB execution is a host-realization check for those boundary observations, not an independent derivation of the project intermediate state. Failure atomicity, rollback after an external mutation, cancellation, and fault delivery are deliberately excluded and require separate semantic decisions.

**Evidence:** [CreateDocument specification](capsules/CREATE-DOCUMENT-DATA-SPEC.md), [frozen packaged-engine runner test](../adoption/a12/legacy/source-tree/runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenCreateDocumentScenarioRunnerTest.java), [frozen content-bound `2.0.0` evidence](../adoption/a12/legacy/source-tree/scenarios/create-document-data/cibseven-evidence.json), and the [frozen A12 target profile](../adoption/a12/legacy/source-tree/profiles/cibseven-2.0.0-a12-create-document-draft/README.md).

### CIB-OP-0003 — synchronous caught Error mapped to a durable typed result

**Status:** Reviewed operational mapping

CIB Seven `2.0.0` invokes the selected delegate, catches its Java `BpmnError`, applies `CIB-EXT-0004`, destroys the Activity scope, and opens the boundary User Task in one engine command. It exposes no committed effect intent or recoverable interval between the external delegate action and Error routing.

The project instead commits an effect intent, runs a Temporal Activity, and receives a successful typed business result containing code, required nullable message, and validated Activity-local patch. The semantic core then performs the selected atomic patch → mapping → cleanup → boundary transition. Activity failure, retry exhaustion, and Workflow failure remain adapter outcomes rather than business Errors.

**Evidence:** [Boundary-error specification](capsules/BOUNDARY-ERROR-SPEC.md), [frozen packaged-engine phase-zero probe](../adoption/a12/legacy/source-tree/runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBoundaryErrorPhaseZeroProbeTest.java), frozen ordinary CIB scenario evidence, and the retained Temporal Activity history/replay.

**Boundary:** This mapping compares the admitted final host observations while retaining different host transaction boundaries. It does not claim rollback equivalence, an independent CIB semantic effect-intent state, Java exception transport through Temporal, or compatibility for unmatched Errors.

### CIB-OP-0004 — synchronous JUEL command rollback mapped to speculative semantic commitment

**Status:** Selected operational mapping for the deferred JUEL compatibility lane; production capsule unimplemented

CIB Seven `2.0.0` evaluates a conditional Sequence Flow synchronously inside the command that completes the preceding User Task or starts the Process. When evaluation fails, the engine command rolls back: the preceding User Task remains available after failed completion, while a failure during Process start leaves no runtime or historic Process instance.

The proposed project host does not treat JUEL as an application effect or expose speculative semantic state while an asynchronous evaluator Activity is pending. It persists a private suspended continuation rather than relying on an Update handler's call stack or mutating the committed core state; the single semantic loop invokes and awaits the Activity, the originating handler remains pending for its command result, and public Queries continue to expose the last committed semantic state. A valid evaluation receipt commits completion plus routing atomically; one semantic `evaluationError` discards the continuation and returns `rolledBack` with the exact pre-command state.

**Evidence:** [JUEL evaluation architecture decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md), [packaged-engine gateway rollback probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenExclusiveGatewayJuelProbeTest.java), and the [Temporal hosting preflight](research/TEMPORAL-EXECUTION-RESEARCH.md#expression-language-hosting).

**Boundary:** The private continuation is a project durability mechanism, not a CIB or BPMN public state. Syntax rejection remains an admission failure. Temporal Worker loss, timeout, malformed transport, cancellation, and exhausted retries remain infrastructure or adapter failures; terminal Activity failure discards the continuation, fails the originating Update outside the semantic result algebra, preserves the committed User Task wait, and resumes the queued input loop. This mapping does not authorize a general transaction emulator, arbitrary expression side effects, or rollback of external effects.

### CIB-OP-0005 — CIB Message subscription mapped to project semantic subscription identity

**Status:** Reviewed operational mapping selected by the Receive Task capsule

CIB creates a generated execution identity for the public Message event subscription and addresses delivery through the subscription's Message name plus execution ID. BPMN does not prescribe either host identity, while the project addresses an exact runtime occurrence by `(Process instance, BPMN element, activation ordinal)` and checks the source Message ID through a closed `directMessage` channel.

For the one admitted non-repeating Receive Task, the oracle adapter maps the sole live CIB subscription's activity ID to activation `1`, replaces CIB's generated Process-instance identity with the scenario's stable semantic instance identity, and derives the direct Message ID from the deployed Receive Task definition rather than equating it with CIB's event name. It keeps the generated execution ID local to the public query/delivery call. Missing, multiple, mismatched, or already consumed subscriptions are refused before public delivery.

This mapping preserves the subscription lifecycle classified by `CIB-AGR-0009` without claiming identity equivalence across CIB, Lean, TypeScript, and Temporal. Evidence belongs to the [Message-addressed Receive Task scenario](../scenarios/message-addressed-receive-task/README.md), its content-bound retained result, and the [Receive Task specification](capsules/RECEIVE-TASK-MESSAGE-SPEC.md).

**Boundary:** The mapping is limited to one live, direct-Message, activation-`1` Receive Task subscription in one Process instance. It does not establish Message-name/Message-ID equivalence, general correlation, repeated activation, multiple subscriptions, buffered delivery, Message Event compatibility, or global Message routing.

### CIB-OP-0006 - synchronous mapped-success transaction mapped to a durable effect boundary

**Status:** Reviewed operational mapping

CIB Seven `2.0.0` invokes the neutral mapped-success delegate and its input/output mappings synchronously inside the start command. The project instead commits an effect wait and immutable arguments, executes a Temporal Activity, then applies the validated Activity-local patch and output mapping. Both accounts agree at the selected final Process-variable observation boundary.

**Evidence:** [Mapped-success scenario](../scenarios/mapped-success-service-task/README.md), its content-bound CIB evidence, the product-neutral Lean and TypeScript fixtures, and Temporal Activity history/replay.

**Boundary:** Failure atomicity, rollback after an external mutation, cancellation, and fault delivery remain excluded. This relation does not equate CIB's command transaction with the project's committed effect wait.

### CIB-OP-0007 - synchronous mapped boundary Error mapped to a durable typed result

**Status:** Reviewed operational mapping

CIB Seven `2.0.0` invokes the neutral mapped-boundary delegate, catches its Java `BpmnError`, applies `CIB-EXT-0009`, clears Activity-local state, and exposes `ReviewMappedError` in one engine command. The project commits an effect intent, executes a Temporal Activity, receives a typed business result, then performs the selected atomic patch, mapping, cleanup, and boundary transition.

**Evidence:** [Mapped-boundary-Error scenario](../scenarios/mapped-boundary-error-service-task/README.md), its content-bound CIB evidence, the product-neutral Lean and TypeScript fixtures, and Temporal Activity history/replay.

**Boundary:** This compares final selected observations while retaining distinct host transaction boundaries. It does not claim rollback equivalence, Java exception transport through Temporal, or compatibility for unmatched Errors.

### CIB-OP-0008: CIB failed-job incident mapped to a semantic effect incident

**Status:** Selected operational mapping; implemented and evidence-closed

CIB exposes a raw job ID, incident ID, retry count, execution association, and incident configuration. The project semantic core instead owns one stable effect occurrence and one literal-generation-1 incident. The adapter requires exact raw job and incident partners, then maps them to `EffectIncidentId { effectId, generation: 1 }`; neither raw identity nor retry count enters canonical state.

Retrying removes the incident while retaining the same occurrence. A later technical failure remains a host failure and creates no second semantic incident, even when CIB replaces the raw incident identity. Literal generation 1 content-binds the one admitted operator command without presenting CIB engine storage as semantic authority.

**Evidence:** The [packaged-engine phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskIncidentPhaseZeroProbeTest.java) proves that CIB retains the same raw job and Process through the selected incident reset; its later replacement incident remains unselected research evidence. The [retained evidence](../scenarios/service-task-incident/cibseven-evidence.json), [CIB incident projector](../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenIncidentProjector.java), [incident command executor](../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenIncidentCommandExecutor.java), and [incident runner test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenIncidentRunnerTest.java) bind and guard the raw-to-canonical mapping. The [Service Task incident capsule](capsules/SERVICE-TASK-INCIDENT-RETRY-SPEC.md) owns the projection refusal matrix, literal Lean/core identity account, and transport/semantic result separation.

**Boundary:** The mapping does not claim CIB independently derives semantic effect identity or generation. It does not expose job, incident, execution, Workflow, Run, Activity, attempt, retry-budget, cause, or stack identity and does not authorize Process cancellation or Product 2 action state.

### CIB-OP-0009: incident-scoped external termination mapped to semantic root cancellation

**Status:** Selected operational mapping; implemented and evidence-closed

CIB addresses public deletion with its generated root Process-instance ID and records `EXTERNALLY_TERMINATED` in history. The project profile instead publishes one stable semantic root identity and one exact generation-1 incident identity. Its adapter privately binds those facts to the exact live CIB root and matching failed-job incident before invoking deletion, then requires the externally terminated historic root before projecting typed `cancelled` state.

The semantic core independently derives the unique root occurrence, removes its complete live region, preserves Process variables and monotonic counters, and commits cancellation. CIB does not define that runtime representation or the project command identity. Runtime absence alone is insufficient because ordinary completion has the same absence; the historic-state discriminator and successful control make the mapping non-vacuous.

**Evidence:** The [phase-zero cancellation probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskIncidentPhaseZeroProbeTest.java), selected [`CIB-EXT-0014`](#cib-ext-0014-public-external-deletion-of-one-incident-bearing-root-process), [retained successor evidence](../scenarios/service-task-incident-cancellation/cibseven-evidence.json), [exact incident/root command executor](../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenIncidentCancellationCommandExecutor.java), [positive termination projector](../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenProcessTerminationProjector.java), and the [incident-scoped Process cancellation specification](capsules/SERVICE-TASK-INCIDENT-CANCELLATION-SPEC.md).

**Boundary:** Raw CIB Process, job, incident, execution, historic, and reason identity remains producer diagnostics only. This mapping does not claim that CIB derives semantic occurrence identity, cleanup invariants, counter preservation, Temporal closure behavior, authorization, audit, or Product 2 action state.

## Configuration-specific register

### CIB-CFG-0001 — pinned Milestone 0 oracle environment

**Status:** Reviewed configuration dependency

The current draft profile pins CIB Seven `2.2.0` at revision `834a9874760de8a0107f7c1b32806e37f17fb017`, Java 21, H2 `2.3.232`, disabled automatic job execution, an explicit logical clock, audit history, and default history TTL `P180D`. CIB deployment required the TTL in this environment; audit history remains outside the canonical observation boundary, while controlled time and scheduling prevent accidental host nondeterminism from entering the current capsule.

This is a profile constraint, not evidence that CIB differs from BPMN. It does not claim that another database, history level, scheduler setting, plugin set, or engine configuration produces the same observations. The machine-readable declarations are in the [current profile](../profiles/cibseven-2.2.0-user-task-process-data-draft/profile.json).

### CIB-CFG-0002 — explicit release of the Service Task continuation job

**Status:** Reviewed configuration dependency

Under `CIB-CFG-0001`, automatic job execution is disabled. Starting the exact `CIB-EXT-0001` Process creates one immediately executable async-before continuation job with no due date. The harness deliberately leaves that job waiting until the explicit Service Task effect schedule releases it through the public job API. Plain success executes it once; the fail-after-mutation schedule observes public retry decrement from three to two and executes the same durable job again without administrative retry changes.

The waiting interval is a harness scheduling input and the job is a CIB host construct. Neither is BPMN logical time, effect intent, or caller interaction. The content-bound retained result uses plain success; retry and re-execution details remain raw producer evidence.

### CIB-CFG-0003 — pinned A12 CIB Seven 2.0.0 oracle environment

**Status:** Reviewed configuration dependency

The A12 CreateDocument profile pins CIB Seven `2.0.0` at revision `57ed69550f1c9c2619b9711d8877418bb084a371`, Java 21, H2 `2.3.232`, disabled automatic job execution, an explicit clock, audit history, and default history TTL `P180D`. This identity is distinct from every `2.2.0` profile and evidence envelope even where selected engine source files are byte-identical.

The synchronous CreateDocument path does not use a continuation job, but the full environment remains pinned so deployment, history, cleanup, and later comparisons are reproducible. Passing a `2.2.0` behavioral probe under a dependency override is not evidence for this profile.

### CIB-CFG-0004 — default unmatched BPMN Error under the pinned A12 engine

**Status:** Reviewed configuration dependency

CIB Seven `2.0.0` defaults `enableExceptionsAfterUnhandledBpmnError` to `false`. For an unmatched `RelationshipLinkageError`, the engine logs the missing catcher and calls `execution.end(true)` rather than rethrowing the Error.

The mapping-free phase-zero control isolates that default: the Process has no remaining runtime instance, task, job, incident, normal End execution, or boundary-task execution; history retains one ended Process plus Activity-local `relationshipModel = "RelationshipModel"` and `newLinkId = "must-not-map"`. In the complete selected fixture, the later Camunda output mapping instead tries to resolve the already destroyed `newLinkId`, raises `Cannot resolve identifier 'newLinkId'`, and rolls the entire start command back, leaving no runtime or historic Process state.

**Classification rationale:** The two outcomes are separate configuration-and-extension facts. The mapping-free result records default unmatched handling; the mapped rollback is conditional on `CIB-EXT-0004` and must never be generalized as CIB's universal unmatched-Error behavior. The project does not select either as BPMN semantic authority. Its current unmatched successful Activity result becomes typed adapter failure `BPMN_UNHANDLED_BPMN_ERROR`.

**Evidence:** [Boundary-error specification](capsules/BOUNDARY-ERROR-SPEC.md) and the seven-test [frozen packaged-engine phase-zero probe](../adoption/a12/legacy/source-tree/runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBoundaryErrorPhaseZeroProbeTest.java).

### CIB-CFG-0005 — pinned read-only JUEL condition environment

**Status:** Selected bounded configuration for the deferred JUEL compatibility lane; production capsule unimplemented

When reopened, the first JUEL compatibility profile uses `org.cibseven.bpm.juel:cibseven-juel:2.0.0`, matching pinned CIB Seven `2.0.0`, over a complete immutable Process-scope context whose values use the project's existing tagged `VariableValue.String | VariableValue.Null` contract. The Java evaluator converts those variants to `String | null` after validation. It exposes exact root-variable lookup and no bean, property-on-Java-object, method, function, class, `execution`, Process Engine service, Spring, file, network, or mutation capability.

The admitted source has exactly two non-default conditions and one conditionless default, no condition `language`, `xsi:type` absent or resolving to BPMN `tFormalExpression`, and no Camunda `resource`. The condition result must be a non-null Java `Boolean`. Exact `${...}` and `#{...}` source is retained. A short-lived validation Workflow performs batched parse-only validation before any Process Workflow starts; runtime evaluator failures share one semantic `evaluationError` result, while diagnostic codes and messages do not affect semantic comparison.

**Evidence:** [JUEL evaluation architecture decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md), [isolated CIB JUEL runtime probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenIsolatedJuelRuntimeProbeTest.java), and [packaged-engine gateway probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenExclusiveGatewayJuelProbeTest.java).

**Boundary:** This selection does not admit nested objects, collections, numbers, Boolean Process variables, Java objects, arbitrary JUEL, input/output mappings, forms, scripts, listeners, bean resolution, or general CIB expression compatibility. The reviewed dependencies are approved but remain uncommitted and absent from production code. The active Simple Boolean standards profile is a different declared language and receives no CIB truth claim from this entry.

### CIB-CFG-0006 - pinned mapped-success CIB Seven 2.0.0 environment

**Status:** Reviewed configuration dependency

The product-neutral mapped-success profile pins CIB Seven `2.0.0` at revision `57ed69550f1c9c2619b9711d8877418bb084a371`, Java 21, H2 `2.3.232`, disabled automatic job execution, an explicit clock, audit history, and default history TTL `P180D`. Its synchronous path uses no continuation job, but the full environment remains pinned for reproducible deployment, history, cleanup, and evidence identity.

### CIB-CFG-0007 - pinned mapped-boundary-Error CIB Seven 2.0.0 environment

**Status:** Reviewed configuration dependency

The product-neutral mapped-boundary-Error profile pins the same CIB Seven `2.0.0` revision, Java, H2, scheduler, clock, history, and TTL settings as a distinct profile identity. Evidence for another release or another profile does not establish this configuration-specific claim.

### CIB-CFG-0008 - explicit failed-job incident creation

**Status:** Selected configuration dependency; implemented and evidence-closed

The registered Service Task incident profile explicitly sets `createIncidentOnFailedJobEnabled` to `true`. Pinned CIB Seven creates the public `failedJob` incident only under that setting. Relying on the engine default would make the profile's public incident fact depend on an undeclared host choice.

**Evidence:** The [Service Task incident phase-zero probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskIncidentPhaseZeroProbeTest.java) runs the same exact BPMN and failure schedule under both values. The enabled engine exposes and resolves the failed-job incident while retaining the job and Process; the disabled engine reaches retries zero with no incident. The [registered profile](../profiles/cibseven-2.2.0-service-task-incident-draft/profile.json), [engine-bundle factory](../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenEngineBundleFactory.java), and [schedule-alignment test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenIncidentScheduleAlignmentTest.java) bind the enabled configuration to the successor schedule and exclude it from predecessor schedules.

**Boundary:** This setting selects only creation of the one failed-job incident used by `CIB-EXT-0013`. It does not authorize other incident handlers, automatic execution, retry scheduling, arbitrary configuration, or semantic use of CIB retry counts and identities.

### CIB-CFG-0009 — default Java serialization of structured business values

**Status:** Selected configuration dependency for the [structured effect-data amendment](capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#structured-effect-data-consuming-amendment), closed by independent review on 2026-10-14; selected by the draft effect-data profile artifact. The [structured effect-result probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenStructuredEffectResultProbeTest.java) (2026-10-14) stores the credit assessment under the pinned default and reads back List order and duplicates, present Null, a Null distinct from an empty Map and the retained `BigDecimal` scale of `-1234.550`, whose local projection is the capsule's Decimal `-123455` at scale 2.

Without a Spin JSON default, CIB stores a serializable `java.util.Map` or `List` as an object value with Java serialization (`ProcessEngineConfigurationImpl.java:589-590,2591-2601`, `JavaObjectSerializer.java:40,67-87`); disabled Java serialization blocks only client-supplied serialized bytes (`VariableUtil.java:54-60`). That realization keeps List order and duplicates and `BigDecimal` scale. The calibration probe [`CibSevenStructuredEffectResultProbeTest`](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenStructuredEffectResultProbeTest.java), not retained differential evidence, has a local projection that reads the deserialized value, orders String Map keys by Unicode scalar value rather than Java's UTF-16 `compareTo`, projects nonnegative in-bound `Integer`/`Long` to the portable Integer and projects a `BigDecimal` to the canonical portable Decimal of the same mathematical value: trailing zeros are stripped and a negative scale becomes zero, and a canonical scale above 6 or a coefficient outside the signed 64-bit range is outside the domain. Non-String keys and negative or out-of-bound `Integer`/`Long` values are outside the domain and never become Decimals. CIB-retained scale is therefore not a compared fact. A Spin JSON default is excluded: the project runner installs no Spin plugin and its value fidelity is unverified.

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
| Count-only versus incoming-edge-provenance join state | `CIB-DEV-0001` candidate deviation | The normative per-incoming-flow requirement, schema-valid separating model, pinned source mechanism, bounded pristine-lane probe, owner-approved profile meaning, and balanced four-target impact establish a public conflict; immutable negative-probe evidence remains open |
| Literal `PT1S` normal-flow Intermediate Catch Timer | `CIB-AGR-0004` under `CIB-CFG-0001` | Controlled-clock evidence observes wait creation, ineligibility before due time, eligibility at the due date, due transition, and completion; logical deadline projection remains adapter-derived |
| Exact delegate-expression bean plus async-before Service Task execution | `CIB-EXT-0001` under `CIB-CFG-0002` | The exact expanded-QName pair, bean resolution, immediately executable continuation job, plain completion, packaged retry decrement, and test-local one-mutation re-execution are executable; the semantic effect-in-flight projection remains adapter-decided |
| Divergent Exclusive Gateway condition order, first-true short circuit, default routing, and failed-command rollback | `CIB-AGR-0006`, `CIB-INT-0001`, `CIB-OP-0004`, and `CIB-CFG-0005` | Public CIB deployment, task, selected-branch, history, and rollback observations distinguish the selected bounded account; the shared JUEL implementation remains one correlated truth lane |
| User Task completion with a public variable map | `CIB-EXT-0005` under `CIB-CFG-0001` | Task-service and history observations establish create/overwrite/preserve, present null, merge-before-continuation, no-data preservation, and no write on unknown or stale generated IDs; BPMN does not define this host completion API or universal form-to-Process-variable mapping |
| User Task completion with a primitive Boolean | Registered `CIB-EXT-0010` under `CIB-CFG-0001`; evidence-closed and independently closure-reviewed | The phase-zero probe and content-bound retained scenario evidence preserve an actual Java Boolean through public observations and separate it from string `"true"`; Lean, the independent core, differential comparison, and live Temporal refinement exercise the same exact profile |
| Process start with a public variable map | `CIB-EXT-0006` under `CIB-CFG-0001` | Runtime-service and first-task observations establish initial Process-variable visibility before completion; BPMN does not define this host start API or universal start-map semantics |
| Exact-code Error End propagation from an embedded Sub-Process | `CIB-AGR-0008` | Both child-command orders expose only Recover after the Error and complete only after Recover; retained raw task-state mutation detects a wrongly retained child sibling without claiming hidden execution-tree microsteps |
| Message-addressed Receive Task subscription and completion | `CIB-AGR-0009` | A project-authored direct-Message Receive Task exposes one public Message subscription; exact public delivery removes it and completes the Process, without equating CIB's event name or generated execution ID with project semantic identity |
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

The [BPMN conformance target](BPMN-CONFORMANCE-TARGET.md) owns the normative goal, [semantic capsules](capsules/README.md) own bounded project meaning, [profiles](../profiles/README.md) own selected compatibility contracts, the [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md) owns current semantic coverage, the [`implementation-status-owner:ASSURANCE-ADOPTION`](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) owns current CIB evidence coverage, and [the testing guide](TESTING-SPEC.md) owns evidence procedure.
