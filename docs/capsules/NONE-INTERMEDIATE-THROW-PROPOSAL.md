# None Intermediate Throw Event proposal

## Status

Lifecycle: implementation-in-progress
Review: approved

## Question and delivery boundary

Can the nested scope-data profile admit a None Intermediate Throw Event wherever it admits a pass-through Task, so that the Event publishes one occurrence that starts and ends in the step its token arrives and moves the token on, while it keeps its own source kind and every model, command and observation the profile admits today keeps its meaning?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches), the candidate the [pass-through branch specification](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#question-and-delivery-boundary) screened next. Its shared mechanism is the pass-through lowering of the [pass-through Task specification](PASS-THROUGH-TASK-SPEC.md#representation-and-runtime-ownership), a one-input `mergeExclusive`, which the [pass-through branch specification](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md) runs on Parallel branches. It takes the one open clause of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that this mechanism serves:

- `PC-BASIC-01`, its Intermediate Throw None clause: a None Throw adds no wait. The row stays open on None Throws with several incoming or outgoing flows and on its multiple outgoing Start flows, concurrent None Ends and root-versus-child completion clauses, which other families own.

Screened out, each with its reason:

- Link Events (`PC-BASIC-02`). CIB records no activity for either Link Event, so a Link needs a non-publishing step or place aliasing, a representation change, as the pass-through branch specification records.
- `PC-MESSAGE-09`'s unbound-form clause, the sibling row that shares this behavior: CIB's `BpmnParse#parseIntermediateThrowEvent` gives a Message Throw without service-task properties the None behavior (`BpmnParse.java:1654-1658`, tag v2.2.0). Excluded here because the form needs a root `bpmn:Message`, which this profile's definitions reader refuses, so it depends on `PC-MESSAGE-01`, and dropping the Message is a candidate deviation from Clause 10.5.4 ("the Message will be sent") that belongs with the bound send.

Selection, 2026-11-03: chosen on cost and clause value within batch 4. Of the 1,947 BPMN models in the pinned CIB engine test resources, 128 hold an `intermediateThrowEvent`, most of them Signal, Message, Compensation, Escalation or Link throws; 6 hold a None Throw, four of them with listeners or `camunda:inputOutput`, and none is admitted by this profile, so the CIB reach is zero admitted fixtures. Close call against the Inclusive Gateway (`PC-CF-04`, 33 models): far greater reach and semantic risk, but a multi-session family needing new synchronization semantics, while this family reuses an approved lowering and closes a clause in one family budget.

## Normative basis and CIB classification

The passages are in the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

- **Clause 10.5.4, Table 10.89**, the None row: the None Intermediate Event is valid only in normal flow, is defined as a throw Event, has no EventDefinition, and is used to indicate a change of state in the Process.
- **Clause 10.5.4, "Intermediate Events in Normal Flow"**: when a token arrives at a throw Intermediate Event, its trigger occurs immediately and the token moves down the outgoing Sequence Flow. A None Throw has no trigger, so the token moves on at once.
- **Clause 10.5.4, "Sequence Flow Connections"**: an Intermediate Event may have several incoming flows, uncontrolled, with a separate instance of the Event per arriving token, and each outgoing flow starts a new parallel path. The NOTE's separate instance per arrival is the basis for one occurrence per activation; the several-flow forms are refused here and stay a residual of `PC-BASIC-01`.
- **Reading of Clause 13.5.2**, whose handling "consists of waiting for the Event to occur": 10.5.4 is the only clause that addresses throws, and its "immediately" settles a zero wait for a None Throw.

CIB Seven `2.2.0` at the pinned checkout: `BpmnParse#parseIntermediateThrowEvent` gives an Intermediate Throw Event without an EventDefinition the type `intermediateNoneThrowEvent` and `IntermediateThrowNoneEventActivityBehavior` (`BpmnParse.java:1669-1672`), whose inherited `FlowNodeActivityBehavior.execute` calls `leave`, and `HistoryParseListener#parseIntermediateThrowEvent` adds the activity-instance start and end handlers (`HistoryParseListener.java:203-205`). The Event therefore starts and ends its activity instance inside the command that delivered its token.

Classification: normative agreement, a new register entry `CIB-AGR-0016` — a None Intermediate Throw Event passes its token on at once and records one activity instance.

## Required, optional and excluded scope

Required: every model the profile admits today, unchanged, plus a None Intermediate Throw Event with an identity, an optional name, no contained EventDefinition and no `eventDefinitionRef`, no CIB attribute or extension element, one incoming flow and one unconditioned, non-default outgoing flow, as a vertex:

- on a serial path of the root or a Sub-Process body;
- in a re-entry root graph, including on a back-edge path;
- on a Parallel branch or around a fork of the root or a Sub-Process body, in exactly the forms the [pass-through branch specification](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#required-optional-and-excluded-scope) admits for a pass-through Task.

Optional: several None Throws on one path, and None Throws beside pass-through Tasks.

Excluded, each refused at admission:

- any EventDefinition, contained or referenced through `eventDefinitionRef`, including Message, Signal, Escalation, Compensation, Link, Multiple and an empty `messageEventDefinition`; moddle declares the reference non-enumerable, so the reader refuses it by name, as it does `default`;
- a CIB attribute or extension element, such as `camunda:asyncBefore`, `camunda:asyncAfter`, an execution listener or `camunda:inputOutput`, and data inputs or input sets;
- a second incoming or outgoing flow, and a conditioned or default outgoing flow, the uncontrolled-flow and parallel-path forms of Clause 10.5.4 on which `PC-BASIC-01` stays open;
- a None Throw in a called Process, whose body stays one to three User Tasks;
- every form the pass-through Task and pass-through branch accounts refuse, including a wait-free terminal branch and a forking model without an embedded Sub-Process;
- every other profile.

These bound admission only. A later widening admits more forms of the same checked node without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged. The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) adds Clause 10.5.4 and `CIB-AGR-0016`, and the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class.

Observation adds no field. A None Throw publishes one occurrence `(processId, elementId, owner)` that starts and ends in one publication, exactly as `PTT-PASS-01` states for a pass-through Task. Enabled external interactions change only through its successor. The checked-process wire contract gains one node variant, `noneIntermediateThrowEvent` with an `id`, in the [checked-process schema](../../contracts/schemas/checked-process.schema.json); every producer, consumer and fixture moves together under the [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy).

## Representation and runtime ownership

This family makes its one kernel type change, allowed by [contract item 4](../LEAN-BUILD-MODULARITY-SPEC.md#contract).

- **Checked graph.** A new arm `noneIntermediateThrowEvent (id : NodeId)` of `CheckedNode` in [`CheckedProcessContract`](../../BpmnSemantics/CheckedProcessContract.lean), and `CheckedNodeKind.NoneIntermediateThrowEvent` in TypeScript. The arm names the source kind, so neither erasure nor a reading as a Task can pass the checked relation, and a later Event feature has an Event node to attach to.
  - Rejected alternative: a third `TaskNotation`. It is the same kernel change, and it would record an Event as a Task, which the source kind forbids.
  - Rejected alternative: projecting the Event as a checked `exclusiveMerge`, rejected for the pass-through Task for the same reason: it erases the kind.
  - Rejected alternative: one generic `intermediateThrowEvent (definition)` arm for every trigger. The checked graph keeps one arm per admitted variant, as `globalSynchronousCompensationThrowEvent` does, so a later trigger adds its own arm with its own admission instead of widening this one.
- **Program.** Lowering emits the existing one-input `mergeExclusive` with the Event's input place, output place and the Event as origin, as `PTT-PASS-01` does for a Task. No IL type changes. A one-input `mergeExclusive` keeps meaning a pass-through step, never a merge region, so every Program-level analysis that already recognizes a pass vertex recognizes the Event unchanged.
- **Runtime.** Unchanged. The scheduler fires the operation as one step, the occurrence projection publishes an instantaneous occurrence for an operation-origin `mergeExclusive`, and each activation gets a fresh occurrence identity. On a Parallel branch the Event prepares as `mergeInput`, which `PTPB-COMMUTE-01` already makes independent beside a declared entry.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md), and every site that projects a checked `nonOperationalTask` for this profile projects the new arm the same way:

- **Source.** The nested scope-data source reader projects an `intermediateThrowEvent` with no EventDefinition, no `eventDefinitionRef` and no other key to the arm, as `projectNonOperationalTask` does for a Task, and refuses every other Intermediate Throw Event. The key inventory cannot see a reference-valued attribute, so `eventDefinitionRef` is refused by name. Other profiles' readers keep refusing it.
- **Checked validation.** The checked arity rule that holds a `nonOperationalTask` to one incoming and one unconditioned, non-default outgoing flow covers the arm, in Lean's [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) and the TypeScript [graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts).
- **Serial and re-entry analysis.** The scope-data vertex model projects the arm to its `PassThrough` vertex (`PTT-ADMIT-01`, `PTT-BURST-01`, `SRE-BURST-01`), in [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean) and [its TypeScript twin](../../packages/semantic-core/src/nested-scope-data-admission.ts).
- **Concurrent analysis.** The raw body mapping projects the arm to the `pass` vertex under this profile only, in `checkedVertex?` of [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) and `checkedKind` of [its TypeScript twin](../../packages/semantic-core/src/nested-scope-control-admission.ts), and the forking checked shape of the [routing module](../../packages/semantic-core/src/structured-scope-data-routing.ts) admits it beside the Task. The branch cut, Call placement and burst rules apply unchanged (`PTPB-WORK-01`, `PTPB-CALL-01`, `PTPB-BURST-01`).
- **Program level.** Nothing changes: the lowered Program is indistinguishable from one with a pass-through Task in the Event's place, except for the origin's element.

Nearest wrong algorithms, each with a separating witness below:

1. reading the Event as a pass-through Task, which loses its kind in the checked graph and the decoder;
2. passing an Event with an EventDefinition through as None, CIB's Message fallback;
3. admitting the arm under another profile;
4. dropping the arm at one analysis level, which admits at one level and refuses at the other;
5. dropping the CIB-attribute refusal, which passes an asynchronous continuation through as instantaneous.

## Stable rules

| Rule | Statement |
|---|---|
| `NIT-KIND-01` | The checked graph keeps a None Throw as `noneIntermediateThrowEvent`, never as a Task or merge, and the decoder refuses every other spelling. |
| `NIT-PASS-01` | A None Throw lowers to a one-input `mergeExclusive` with the Event as origin; its occurrence starts and ends in the step its token arrives, owned by the scope occurrence carrying its path, and one token reaches its outgoing flow. |
| `NIT-ADMIT-01` | The nested scope-data profile admits a None Throw exactly where it admits a pass-through Task, and refuses each excluded form. |
| `NIT-PROFILE-01` | Every other profile refuses an Intermediate Throw Event without an EventDefinition, as today. |

## Newly reachable waits and resumption

None. A None Throw never waits, so every wait, command and resumption point of the profile is unchanged; it only adds steps to the closures that deliver its token, which the existing burst rules bound.

## Separating witnesses

Each model carries a source overlay and a mapped Service Task.

- **Warranty repair** (re-entry root graph):
  - Start binds `device`.
  - Path: *Repair requested* → User Task *Diagnose fault* → None Throw *Fault diagnosed* → Merge *Repair round* → Sub-Process *Repair device* → Choice *Device passes?*.
  - *Repair device* declares a local `result` and copies it out to `testResult`; it holds Start → None Throw *Repair started* → User Task *Replace part* → mapped Service Task *Order spare part* → User Task *Test device*, which records `result` → End. The Choice therefore reads a Sub-Process output, as `NSD-TASK-01` requires.
  - On `testResult` = `passed`, None Throw *Device released* → End; by default, None Throw *Rework requested* → the Merge, re-entering *Repair device*.
  - Journey one: diagnose, replace, test passes. Journey two: diagnose, replace, test fails, replace again, test passes; *Rework requested* fires once, and *Repair started* gets a fresh occurrence in each iteration. The rework closure after *Test device*, body End and scope completion, Choice, *Rework requested*, Merge, scope entry, *Repair started* and the arming of *Replace part*, is eight steps, exactly the closure limit, which the implementation confirms by the computed burst.
- **Employee onboarding milestones** (root fork):
  - Start binds `employee`; User Task *Confirm start date* → fork → two branches → join → None Throw *Onboarding complete* → End.
  - Branch one: Sub-Process *Set up account*, which declares a local `account`, holds Start → User Task *Create account* → None Throw *Account ready* → End and copies `account` out.
  - Branch two: None Throw *Welcome sent* → mapped Service Task *Order laptop*.
  - The closure after *Confirm start date* batches the declared entry of *Set up account* beside *Welcome sent*, a merge input on another branch (`PTPB-COMMUTE-01`).
  - Two journeys, in both completion orders of *Create account* and the *Order laptop* result.
- **Refused edits:** a None Throw with a `messageEventDefinition` (wrong algorithm 2), with an `eventDefinitionRef` naming a definition (wrong algorithm 2), with a `signalEventDefinition`, with `camunda:asyncBefore` (wrong algorithm 5), with an execution listener, with a second outgoing flow and with a second incoming flow; a None Throw on a wait-free terminal branch; a None Throw as the only vertex before a Call in a body.
- **Profile control (minimal pair):** the employee onboarding model the embedded completion profile admits today is refused with one None Throw inserted on its root path before *Welcome meeting*, and admitted without it, at the source level; separately, the unedited onboarding checked graph with one None Throw node spliced in before *Welcome meeting* is fed straight to the core and Lean checked analyses under the embedded completion profile's identity and refused, while the unedited graph is admitted, so the checked-level profile test is killed rather than masked by the source reader; and a checked graph of an exact-shape profile plus one None Throw is refused at Lean's checked level (wrong algorithm 3).
- **Kind control:** the checked graph of each model holds the arm, never a `nonOperationalTask`, and the decoder refuses a `noneIntermediateThrowEvent` node that carries a `notation` (wrong algorithm 1).

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `NIT-KIND-01` | Both models hold the arm; the node with a `notation` is refused | Source, decoder, Lean conformance module | Project the Event as `nonOperationalTask` |
| `NIT-PASS-01` | Each None Throw publishes one started-and-ended occurrence in the closure that delivers its token, fresh per re-entry | Pipeline, CIB probe | Lower the Event as `awaitUserTask` |
| `NIT-ADMIT-01` | Both models admitted at both levels; each refused edit refused | Source and core at both levels, conformance module | Refuse the arm at one level (wrong algorithm 4); drop the attribute refusal |
| `NIT-PROFILE-01` | The embedded completion minimal pair at the source level and as spliced checked graphs; an exact-shape profile's graph plus a None Throw | Source, core and Lean checked levels, conformance module | Produce the arm without the profile test; count the arm with the unchanged group in `ProfileCardinalities` |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family and no runtime law; the Event lowers to the existing one-input `mergeExclusive`, whose pass-through behavior and commutation are already proved or checked under the pass-through accounts. A new executable conformance module, beside the [pass-through Task conformance module](../../BpmnSemantics/PassThroughTaskConformance.lean) whose admission owners it shares, checks admission of both models at both levels, the refused edits, the profile control and the lowering to one-input merges with the Event as origin.

## Temporal hosting and refinement preflight

No new hosting mechanism. A None Throw is an internal step inside one command closure; ingress, waits, timers, effects, cancellation, lifecycle and the publication projection are unchanged. The preserved relation is equality of hosted committed state and publications with the core's. Delivery, ordering, deduplication, retry and replay risks are unchanged. The smallest witness is the hosted pipeline over both models' journeys at family closure.

## Evidence and acceptance

The models run as answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus value-domain matrix rows, corpus rows and the About disclosure. The CIB lane extends the [pass-through Task probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) with both models' journeys, calibrating one ended `intermediateNoneThrowEvent` activity instance per None Throw activation without a task or job.

Implemented as proposed. The [conformance module](../../BpmnSemantics/NoneIntermediateThrowConformance.lean) holds seven checks: both models at both levels with the warranty's re-entry burst of eight and the onboarding's concurrent burst of seven, lowering to one-input merges with the Event as origin, both several-flow forms, the wait-free terminal branch against its waiting twin, the Call behind only a None Throw, the profile control (the spliced employee onboarding at both levels and an exact-shape graph refused by its cardinalities, a mutation that stops counting the arm failing it), and the decoder. The four pipeline mutations each move the one observation they name; the value-domain matrix runs the onboarding with the concurrent Start-name cases and the warranty with the pass-through Task cases, whose assertion now admits the warranty's unrequired `device`.

Closure gates:

- **Green at `3c3a12e1`:** the complete `verify.sh`: the Lean library and `BpmnConformance`, 918 jobs, whose driver holds all 1,294 checks; the runtime stage with the CIB oracle and the [pass-through Task probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java), ten tests; the complete Temporal gate; and the pipeline over all 170 registered cases, warm in 124.2 s. Then the research doctor and `test:model-corpus`, 30 tests, and the fast guards, 911 tests.

Then `PC-BASIC-01`'s Intermediate Throw None clause is accepted for this profile's single-flow form; the row stays open on its other clauses and on None Throws with several incoming or outgoing flows.

Nearest unsupported claims:

- None Throws with several incoming or outgoing flows, the uncontrolled-flow forms of Clause 10.5.4, on which `PC-BASIC-01` stays open;
- in called Processes, Multi-Instance bodies and every other profile;
- Message, Signal, Escalation and other throw triggers;
- the residual forms of the pass-through branch account;
- that every actual closure stays within the admitted burst (not proved in Lean, as for pass-through Tasks).

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): the checked-process schema gains one node variant, and every producer, consumer, fixture and test moves in one change, with no legacy reader or migration. No admitted model changes its Program, route or behavior: no model any profile admits today holds an Intermediate Throw Event without an EventDefinition.

### Owners this implementation grows

Build cost is a constraint. The one kernel type change is the new `CheckedNode` arm, an interface edit of `CheckedProcessContract` whose cone is 1,014 modules (`scripts/lean-fanout.ts` at `20933b89`), a complete rebuild that lands in one commit. Every consumer that matches on `CheckedNode` must cover the arm: the JSON decoder, `Lowering`, `CheckedGraphValidation`, `CheckedProcessAdmission`, `ProfileCardinalities`, `NestedScopeDataAdmission`, `NestedScopeControlAdmission` and the experimental `CheckedSource*` modules. In `ProfileCardinalities` the arm gets its own counter, which no exact shape names, as `nonOperationalTasks` does, so every exact-shape profile refuses it at the checked level; the arm never joins the group of arms that leave the counts unchanged. `NestedScopeControlAdmission.lean` stands at 796 of 800 nonblank lines and `nested-scope-control-admission.ts` at 788, so the arm joins the existing `nonOperationalTask` patterns there as an or-pattern; any larger growth means an extraction, never an exception. Lowering gains a private `rfl` law beside `lower_non_operational_task_is_one_input_merge`. The new conformance module is a leaf.

TypeScript owners: the [checked-process contract](../../packages/semantic-core/src/checked-process-contract.ts) and schema, the [nested scope-data source reader](../../packages/bpmn-source/src/nested-scope-data-source.ts), [graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts), [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), the [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts), the [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts) and the [routing module](../../packages/semantic-core/src/structured-scope-data-routing.ts).

Deferred kernel-change follow-ups: the two [Lean build follow-ups](../PLAN.md#lean-build-follow-ups) scheduled at the next kernel-type change, merging the renamed duplicate helpers and dropping unused simp arguments, and moving kernel operations out of `@[expose] public section`, are not done in this family. Each is a Rule 2 bulk change blocking nothing here, and deferring them costs one later complete rebuild; PLAN reschedules them as their own change after this family lands.

Guards the implementation must change or satisfy: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), the contract schema tests, the consumer-site registry of the [projected flow-element keys test](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts), and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts), whose routing stays unchanged.

Registration: `CIB-AGR-0016` in the [register](../CIB-BPMN-RELATION-REGISTER.md); a new `BPMN-NONE-THROW-01` row and the `BPMN-MECH-EVENT-01` row of the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md); the profile artifact's clauses, relationships and `features`, and its README; the new conformance module in `ConformanceChecksMain`; scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `1cdfae2b` | `fork-turns-none` | `approve-with-required-edits` | `398ecf59, 7c5abba5` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
