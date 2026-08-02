# BPMN Lean Experiment — Proto-MVP Reviewer's Guide

## Status

**Maintained reviewer guide for the closed Proto-MVP at repository revision `1be7612`. This guide is explanatory; the linked specifications, implementation map, plan, and executable catalogs remain authoritative.**

> [!IMPORTANT]
> This file is a maintained review aid, not a competing implementation map, semantic specification, test catalog, or roadmap. For current truth, start with [PLAN.md](PLAN.md), [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md), and [TESTING-SPEC.md](TESTING-SPEC.md).

## Executive brief

The project is building a Temporal-hosted BPMN 2.0.2 Process execution engine with an executable Lean reference account, a separately written pure TypeScript semantic core, and differential/refinement evidence against selected CIB Seven behavior. Its long-term ambition is OMG Process Execution Conformance and eventual replacement of A12 Workflows through a separately bounded adoption layer. The Proto-MVP is the first reviewer-facing proof that this architecture works end to end across a nontrivial catalog.

The Proto-MVP is closed at clean repository revision `4f2fe61`, with milestone bookkeeping at `1be7612`. Its available capability set spans Process and scope lifecycle, User and Service Tasks, data bindings, structured branching and joining, Message and Timer waits, Receive Task, embedded Sub-Processes, Boundary Error propagation, structured Inclusive synchronization, a Message-versus-Timer Event-Based race, and a bounded called-Process Call Activity. The complete catalog has 28 scenarios, 18 selected CIB-backed cases, 10 standards-only cases, 30 disposable Temporal histories, 56 isolated Workflow executions, and a meaningful seeded semantic mutation for every pipeline case.

The result is not general BPMN support, a conformance certificate, broad CIB compatibility, or a production migration baseline. It is a coherent architecture demonstrator whose claims are intentionally profile-bounded and evidence-lane-specific.

## Who this guide is for

This guide is aimed at reviewers who need to decide whether the project has established a credible semantic and durable-execution architecture, whether its available capabilities match its evidence, and whether the remaining work can safely reuse the current foundations. It assumes familiarity with BPMN concepts but not with Lean or Temporal internals.

A useful review should answer four different questions separately:

1. Is each selected BPMN meaning normatively defensible and honestly bounded?
2. Does the Lean account express that meaning and establish useful laws rather than only fixture equality?
3. Does the TypeScript core independently transcribe the selected account without importing host or vendor behavior?
4. Does the Temporal adapter preserve the core's public outcomes under durability, retry, restart, and replay rather than defining BPMN meaning itself?

## Motivation and product direction

BPMN engines combine several difficult concerns: a large and sometimes underspecified standard, graph-shaped execution semantics, mutable occurrence identity, asynchronous external interaction, durable scheduling, vendor extensions, and years of compatibility behavior. A conventional implementation can easily mix these layers until the host scheduler, database, or vendor API silently becomes the semantic authority.

This project separates those concerns so that each claim can be reviewed and tested at the right boundary:

- BPMN 2.0.2 supplies the normative syntax and execution target.
- A reviewed semantic capsule selects one bounded proposition and its exclusions.
- Lean gives that proposition an executable formal account and reusable laws.
- The pure TypeScript semantic core separately implements the reviewed account for production use.
- Temporal persists the semantic state and realizes waits, timers, messages, Updates, effects, restart, and replay without redefining visible BPMN behavior.
- CIB Seven is used only for explicitly classified compatibility profiles and observations.
- A12 Workflows remains a downstream adoption target and never defines the reusable BPMN core.

<pre aria-label="Architecture and evidence flow">
OMG BPMN 2.0.2 ───────────────► reviewed bounded semantic capsule
                                            │
Pinned CIB Seven ── profile-specific ───────┤
                                            ├────► Lean reference account
Exact BPMN XML ─► admission ─► checked graph ─► Semantic Process IL
                                            └────► pure TypeScript core ─► Temporal adapter
                                                       │                       │
                                                       │                 durable host mechanisms
                                                       │
Lean ──────────────────────────────────────────────────┤
TypeScript core ───────────────────────────────────────┼─► canonical comparison ─► report, mutations, replay
Temporal ──────────────────────────────────────────────┤
Selected CIB profiles only ────────────────────────────┘

Future A12 adoption uses stable lower contracts; it does not define them.
</pre>

The one-way product dependency is equally important:

<pre aria-label="One-way product dependency">
A12 Workflows adoption and migration
                 │ uses
                 ▼
Selected CIB compatibility overlays
                 │ refine or extend
                 ▼
Vendor-neutral BPMN execution core
                 │ hosted by
                 ▼
Temporal durability and effect infrastructure
</pre>

A higher layer may request or configure a lower-layer capability, but lower layers must not import higher-layer identities, APIs, license-bound sources, or semantic assumptions.

## Current state at the Proto-MVP boundary

| Area | Shipped state |
|---|---|
| Source | Exact-byte BPMN XML ingestion through `bpmn-moddle`, strict profile admission, parser-warning rejection, checked project-owned graph, source digest, and independent Lean lowering check |
| Semantic language | Immutable Semantic Process IL with typed operations for Process/scope lifecycle, tasks, messages, timers, effects, gateways, Error propagation, Inclusive selection, event races, and called Processes |
| Formal account | Lean decoders, admission checks, declarative relations, executable evaluators, evaluator-soundness bridges, finite discriminators, quantified laws, and nearest checked non-laws |
| Production semantics | Pure deterministic TypeScript core with explicit stimuli, bounded internal closure, immutable definition data, serializable runtime state, canonical observation, and no I/O |
| Durable host | One generic Temporal Workflow family with Update/Signal ingress, Query projection, durable timers, external-effect Activities, Worker replacement, result recovery, replay, and fail-closed host-capability admission |
| Compatibility | Selected CIB Seven `2.2.0` and `2.0.0` relationships with field-level fidelity labels and content-bound retained evidence; standards-only cases deliberately omit CIB |
| Assurance | Complete artifact registry, answer-free scenarios, exact target relations, mutation-sensitive comparisons, history replay, Workflow isolation, strict schemas, source hygiene, and independent semantic review receipts |
| Product command | Runnable external-Temporal MVP for the admitted User Task path with a dummy host actor; no task inbox, UI, identity, authorization, or production deployment claim |

### Implemented bounded BPMN slices

| Family | Implemented slice | Important boundary |
|---|---|---|
| Process lifecycle | Private executable Process, None Start, None End, completion and refusal | No general instantiation or import closure |
| User Task | Activation, public discovery, exact occurrence completion, stale/wrong refusal, bounded completion data | No performer, assignment, authorization, forms engine, or task-list product |
| Sequence Flow and Parallel Gateway | Flow-identified tokens, exact balanced fork/join, multiplicity and live-sibling behavior | No arbitrary graph composition claim |
| Exclusive Gateway | Two Simple Boolean conditions plus default, declaration-ordered first-true selection | No general expression language or JUEL execution claim |
| Inclusive Gateway | One structured two-condition-plus-default split/join with data-dependent multi-selection and an occurrence-owned selected-branch set; the join synchronizes all and only selected branches | No general graph-reachability, nesting, repetition, or unstructured merge |
| Event-Based Gateway | One non-instantiating, core-owned exclusive race between an operation-addressed Message and exact `PT1S` Timer; the losing wait disappears atomically before public observation | No portable winner for coalesced readiness; no other trigger sets |
| Timer Event | One exact `PT1S` Intermediate Catch Timer with semantic logical time | No cycle/date expressions or general timer family |
| Message Event | One payload-free operation-addressed Intermediate Catch Message | No modeled throw, payload, Message Flow, or global/key correlation |
| Receive Task | One payload-free direct-Message, non-instantiating Receive Task | No addressless or operation-addressed Receive Task, transport realization, or repetition |
| Service Task | Profile-registered neutral effect intent, bounded success, retry reconciliation, typed exhaustion | No general Java delegate/JUEL contract or broad incident semantics |
| Data | Process string/null bindings, Activity-local scopes, selected literal input/output mappings | No general ItemDefinition or DataAssociation evaluator |
| Embedded Sub-Process | One-level ordinary completion and exact direct-parent Error propagation with regional cancellation | No arbitrary nesting, Event Sub-Process, or general cancellation |
| Boundary Error | One attached interrupting exact-code route around a Service Task | No catch-all, multiple candidates, or ancestor handler search |
| Call Activity | One namespace-qualified in-document called Process, distinct semantic Process instance within the hosting Workflow, empty-data invocation and normal return | No import, Global Task, mappings, recursion, repetition, concurrent calls, exceptional return, cancellation, or Child Workflow identity |

Across this inventory, branching, concurrency, hidden occurrence state, heterogeneous host readiness, losing-wait cancellation, nested semantic identity, return/quiescence, Worker replacement, and replay all use the same IL evaluator and Temporal Workflow family rather than feature-specific execution engines.

## Core design decisions and approaches

### 1. Exact source becomes a checked graph before execution

Raw moddle objects are confined to `@bpmn-lean/bpmn-source`. The importer preserves exact bytes and digest, blocks parser warnings, validates the selected source profile, resolves references, canonicalizes order where order is not semantic, and emits only project-owned serializable types. Lean, the semantic core, and the Temporal Workflow never receive `bpmn-moddle` objects.

This boundary is intentionally strict. Unsupported BPMN is rejected before Workflow creation rather than interpreted approximately. Every accepted profile states both its exact source shape and its excluded adjacent shapes.

### 2. The Semantic Process IL is a mechanism language, not a BPMN mirror

The IL contains a small set of typed operations such as `awaitUserTask`, `awaitMessage`, `duplicate`, `choose`, `selectMany`, `awaitEventRace`, `invokeProcess`, and `returnProcess`. BPMN element identity remains attached as origin/provenance, but the evaluator executes reusable mechanisms rather than switching on every BPMN XML element.

That lets a Receive Task and an Intermediate Catch Message Event reuse the same `awaitMessage` transition while checked-source admission still preserves their different BPMN loci and channel arms. It also makes new source shapes reuse existing semantics when their proposition really matches.

### 3. Lean is the formal semantic authority, not the production runtime

Lean expresses declarative permitted-transition relations separately from executable evaluators. Evaluator soundness proves that every produced transition is permitted by the relation. Quantified laws cover reusable facts where practical; concrete `by decide` witnesses lock finite traces, decoder behavior, closure bounds, and counterexamples without being mislabeled as general liveness or equivalence proofs.

Lean begins at the checked graph and program. It independently recomputes lowering and rejects inequality, but it does not parse XML or prove `bpmn-moddle` correct. This is a major assurance boundary a reviewer should keep visible.

### 4. TypeScript is an independent transcription, not an independent semantic vote

The pure TypeScript core is separately authored and has no CIB or Temporal dependency. It owns production `applyStimulus`, deterministic internal closure, runtime state, and canonical observations. Agreement with Lean is valuable for catching transcription errors, but both implementations follow the same reviewed capsule. A bad shared account can therefore make both agree incorrectly.

The project calls this **transcription independence**, distinct from **account-level independence**. Normative review and selected CIB evidence provide the latter only within their declared boundaries.

### 5. Temporal refines the core through durable stuttering

The Temporal Workflow persists core state and supplies durable waiting or I/O mechanisms. It may perform hidden steps—Workflow tasks, Timer commands, Activity attempts, Signal delivery, Update handling, Worker replacement—only if the next public semantic observation matches the core account.

The adapter derives timers and effects from committed core state, queues explicit semantic stimuli, applies them through the same core, exposes Queries from committed state, separates content-bound command identity from transport retries, and replays each disposable history. It fails closed when host capability cannot safely realize a reachable semantic configuration.

### 6. Canonical observation is the comparison boundary

Targets compare stable public consequences rather than internal microsteps or storage order. The observation contains Process status, active waits, open User Tasks, Message subscriptions, timers, effects, variables, enabled external interactions, and logical time. Hidden Inclusive selections, event-race records, called-Process associations, and Temporal host IDs do not leak into this contract.

### 7. Evidence lanes stay separate

The project does not majority-vote among Lean, TypeScript, Temporal, and CIB. A normative/profile claim, a Lean theorem, TypeScript correspondence, CIB observation, Temporal refinement, replay, and mutation are separate evidence lanes with different failure modes. A standards-only capsule can deliberately omit CIB when the engine supplies no independent evidence for the exact proposition.

### 8. Pre-release contracts are replaced atomically

There is one current wire representation. Before a durable release/history baseline, the project does not add compatibility readers, format counters, Workflow patches, migrations, or retained histories. Contract changes replace schemas, producers, consumers, fixtures, and tests together. This keeps the assurance problem tractable now, while explicitly deferring production migration obligations.

## Linear walkthrough: from BPMN bytes to replayed evidence

The following walkthrough uses the bounded Call Activity as the representative path because it exercises exact XML references, two Process definitions, distinct semantic identity, internal invoke/return operations, User Task Updates, canonical observation, Worker replacement, result recovery, mutation detection, and replay. The same architectural path serves every registered case; only the admitted profile, IL operations, stimuli, and host mechanisms differ.

### Step 1 — The source and scenario are exact, bounded inputs

The source contains one caller Process and one distinct called Process. The Call Activity uses a namespace-qualified `calledElement`; admission resolves the namespace and Process ID rather than matching only the local string. The answer-free scenario supplies commands but no expected result, so targets cannot read the oracle answer from their input.

Source: [`scenarios/called-process-call-activity/process.bpmn`](../scenarios/called-process-call-activity/process.bpmn), lines 1–35.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:tns="urn:bpmn-lean:test:call-activity" id="Definitions_CallActivity" targetNamespace="urn:bpmn-lean:test:call-activity">
  <bpmn:process id="CallerProcess" isExecutable="true">
    <bpmn:startEvent id="CallerStart">
      <bpmn:outgoing>Flow_Caller_Start_Call</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:callActivity id="Call_CalledProcess" calledElement="tns:CalledProcess">
      <bpmn:incoming>Flow_Caller_Start_Call</bpmn:incoming>
      <bpmn:outgoing>Flow_Caller_Call_Task</bpmn:outgoing>
    </bpmn:callActivity>
    <bpmn:userTask id="CallerTask" name="Caller task">
      <bpmn:incoming>Flow_Caller_Call_Task</bpmn:incoming>
      <bpmn:outgoing>Flow_Caller_Task_End</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="CallerEnd">
      <bpmn:incoming>Flow_Caller_Task_End</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_Caller_Start_Call" sourceRef="CallerStart" targetRef="Call_CalledProcess" />
    <bpmn:sequenceFlow id="Flow_Caller_Call_Task" sourceRef="Call_CalledProcess" targetRef="CallerTask" />
    <bpmn:sequenceFlow id="Flow_Caller_Task_End" sourceRef="CallerTask" targetRef="CallerEnd" />
  </bpmn:process>
  <bpmn:process id="CalledProcess" isExecutable="true">
    <bpmn:startEvent id="CalledStart">
      <bpmn:outgoing>Flow_Called_Start_Task</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="CalledTask" name="Called task">
      <bpmn:incoming>Flow_Called_Start_Task</bpmn:incoming>
      <bpmn:outgoing>Flow_Called_Task_End</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="CalledEnd">
      <bpmn:incoming>Flow_Called_Task_End</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_Called_Start_Task" sourceRef="CalledStart" targetRef="CalledTask" />
    <bpmn:sequenceFlow id="Flow_Called_Task_End" sourceRef="CalledTask" targetRef="CalledEnd" />
  </bpmn:process>
```

### Step 2 — Admission lowers BPMN loci into reusable typed operations

After profile admission and graph validation, lowering emits the immutable Semantic Process program. The operation family is closed: adding a new kind forces exhaustive decisions across decoders, evaluators, host admission, schemas, Lean, and tests. Call Activity contributes `invokeProcess` and `returnProcess`; the evaluator does not execute raw BPMN nodes.

Source: [`packages/semantic-core/src/semantic-process-contract.ts`](../packages/semantic-core/src/semantic-process-contract.ts), lines 280–314.

```ts
export enum SemanticProcessCompilerId {
  BpmnSourceSemanticProcess = "bpmn-source-semantic-process",
}

export enum SemanticOperationKind {
  Initiate = "initiate",
  EnterScope = "enterScope",
  InvokeProcess = "invokeProcess",
  ReturnProcess = "returnProcess",
  AwaitUserTask = "awaitUserTask",
  AwaitMessage = "awaitMessage",
  AwaitTimer = "awaitTimer",
  AwaitEffect = "awaitEffect",
  Duplicate = "duplicate",
  Synchronize = "synchronize",
  Choose = "choose",
  SelectMany = "selectMany",
  SynchronizeSelected = "synchronizeSelected",
  AwaitEventRace = "awaitEventRace",
  ThrowError = "throwError",
  ReachNoneEnd = "reachNoneEnd",
  CompleteScope = "completeScope",
}

export enum SemanticOriginKind {
  BpmnElement = "bpmnElement",
  BpmnSequenceFlow = "bpmnSequenceFlow",
}

export type SemanticProcessIdentity = DeepReadonly<{
  compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess;
  semanticProfile: string;
  sourceId: string;
  sourceSha256: string;
}>;
```

### Step 3 — Lean separates command admission, internal closure, and proof obligations

Lean applies one explicit external stimulus, then runs bounded internal closure. Command outcome and harness failures remain distinct. A committed command can still be unusable as a public stable observation if the closure bound is exceeded or an unapproved multiple-enabled state is reached. The separate `step_sound` theorem connects the executable selector to the declarative `ProgramStep` relation.

Source: [`BpmnSemantics/SemanticProcess/Execution.lean`](../BpmnSemantics/SemanticProcess/Execution.lean), lines 225–254.

```lean
def applyStimulus (closureLimit : Nat) (program : Program)
    (state : RuntimeState) (stimulus : Stimulus) : StimulusResult :=
  let admission := admitStimulus program state stimulus
  match admission.outcome with
  | .committed =>
      let closure := closeSupported closureLimit program admission.state
      { outcome := .committed
        state := closure.state
        internalStepBoundExceeded := closure.hitBound
        ambiguousInternalChoice := closure.ambiguousChoice }
  | .rolledBack =>
      { outcome := .rolledBack
        state := admission.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }
  | .rejected =>
      { outcome := .rejected
        state := admission.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }
  | .semanticFailure =>
      { outcome := .semanticFailure
        state := admission.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }
  | .unsupported =>
      { outcome := .unsupported
        state := admission.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }
```

Source: [`BpmnSemantics/SemanticProcess/Transition.lean`](../BpmnSemantics/SemanticProcess/Transition.lean), lines 260–279.

```lean
theorem step_sound :
    Obligations.evaluator_sound ProgramStep step := by
  intro program state choice successor result
  unfold step at result
  generalize selectedEq :
      program.operations.find? (fun operation =>
        decide (operation.id = choice)) = selected at result
  cases selected with
  | none => simp at result
  | some operation =>
      refine ⟨operation, List.mem_of_find?_eq_some selectedEq, ?_, ?_⟩
      · have selectedMatches : decide (operation.id = choice) = true :=
          List.find?_some
            (p := fun candidate : SemanticOperation =>
              decide (candidate.id = choice))
            selectedEq
        exact of_decide_eq_true selectedMatches
      · exact fire_sound operation state successor result

end BpmnSemantics.SemanticProcess
```

### Step 4 — The TypeScript core independently implements the same public transition boundary

The production core performs the same high-level split: validate the closure limit, admit the external command, close internal operations, and return a typed outcome plus committed state. It is not generated from Lean and performs no I/O. Reviewers should compare semantic facts and explicit non-requirements across the two implementations, not demand identical private code structure.

Source: [`packages/semantic-core/src/semantic-process-runtime.ts`](../packages/semantic-core/src/semantic-process-runtime.ts), lines 577–608.

```ts
export function applyStimulus(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
  closureLimit: number = semanticProcessClosureLimit,
): CommandResult {
  validateClosureLimit(closureLimit);

  const admission = admit(program, state, stimulus);
  switch (admission.outcome) {
    case CommandOutcome.Committed: {
      const closure = closeInternal(
        program,
        admission.state,
        closureLimit,
      );
      return {
        outcome: CommandOutcome.Committed,
        state: closure.state,
        internalStepBoundExceeded: closure.hitBound,
      };
    }
    case CommandOutcome.Rejected:
      return {
        outcome: CommandOutcome.Rejected,
        state: admission.state,
        internalStepBoundExceeded: false,
      };
    default:
      return assertNever(admission.outcome);
  }
}
```

### Step 5 — Stable canonical observation hides implementation-only state

Comparison occurs only after successful bounded closure. The projector reconstructs public waits and enabled interactions from committed runtime state. It does not expose selected-branch records, event-race bookkeeping, called-Process associations, Temporal Run IDs, expected results, or future commands.

Source: [`packages/semantic-core/src/scenario.ts`](../packages/semantic-core/src/scenario.ts), lines 134–171.

```ts
function observeStableState(state: RuntimeState): StateObservation | null {
  switch (state.control.kind) {
    case ControlStateKind.Running:
    case ControlStateKind.Completed:
      return {
        kind: CanonicalObservationKind.State,
        instanceId: state.control.instanceId,
        status:
          state.control.kind === ControlStateKind.Running
            ? ProcessStatus.Running
            : ProcessStatus.Completed,
        activeWaits: projectActiveWaits(state),
        openUserTasks: projectOpenUserTasks(state),
        openMessageSubscriptions: projectOpenMessageSubscriptions(state),
        openTimers: projectOpenTimers(state),
        openEffects: projectOpenEffects(state),
        variables: state.variables.process.bindings,
        enabledInteractions: [
          ...projectOpenUserTasks(state).map((task) => ({
            kind: StimulusKind.CompleteUserTaskInstance,
            taskId: task.id,
          } as const)),
          ...projectOpenMessageSubscriptions(state).map(
            (subscription) => ({
              kind: StimulusKind.DeliverMessage,
              subscriptionId: subscription.id,
              channel: subscription.channel,
            } as const),
          ),
        ],
        logicalTimeMs: state.logicalTimeMs,
      };
    case ControlStateKind.NotStarted:
      return null;
    default:
      return assertNever(state.control);
  }
}
```

### Step 6 — Temporal hosts accepted stimuli around the same core

The Workflow admits the immutable program before running, keeps a queue of explicit semantic stimuli, registers Queries and ingress handlers, and waits durably when the core exposes no pending command. Update validation and result reconciliation are host responsibilities; acceptance of the exact task occurrence remains a core decision. Worker restart replays this deterministic code and reconstructs the same committed state.

Source: [`packages/temporal-adapter/src/workflow-implementation.ts`](../packages/temporal-adapter/src/workflow-implementation.ts), lines 112–205.

```ts
export async function runBpmnProcessWithHostEffects(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
  waitForTimer: (durationMs: number) => Promise<void>,
  executeEffect: (
    request: EffectRequest,
  ) => Promise<EffectExecutionResult>,
  eventRaceActivationDrain: EventRaceActivationDrain =
    EventRaceActivationDrain.Required,
): Promise<CompletedProcessReceipt> {
  const deployment = deployProcess(start, semanticProcess);
  if (deployment.outcome !== CommandOutcome.Committed) {
    throw ApplicationFailure.nonRetryable(
      "Workflow input is not one admitted Semantic Process execution",
      "BpmnProcessAdmissionFailure",
    );
  }

  const trace: CanonicalObservation[] = [deployment.observation];
  const pendingStimuli: Stimulus[] = [];
  const acceptedStimuli: Stimulus[] = [];
  const commandResults: CommandResultLedgerEntry[] = [];
  const messageDeliveryResolutions: MessageDeliveryResolution[] = [];
  let state: RuntimeState = initialState;
  const eventRaceScheduler = createEventRaceReadinessScheduler(
    waitForTimer,
    eventRaceActivationDrain,
  );

  // Update handlers can run as soon as they are registered, including during replay after Worker restart. Start must already lead the semantic input queue.
  enqueueStimulus(acceptedStimuli, pendingStimuli, start);

  setHandler(bpmnTraceQuery, () => [...trace]);
  setHandler(
    bpmnOpenUserTasksQuery,
    () => projectOpenUserTasks(state),
  );
  setHandler(
    bpmnUserTaskDetailQuery,
    (request) => projectUserTaskDetail(state, request),
  );
  setHandler(
    bpmnMessageDeliveryResultQuery,
    (stimulus) =>
      findMessageDeliveryResolution(
        messageDeliveryResolutions,
        stimulus,
      ) ?? null,
  );
  setHandler(bpmnDeliverMessageSignal, (stimulus) => {
    validateDeliverMessageSignal(stimulus);
    const accepted = acceptedStimulus(
      acceptedStimuli,
      stimulus.commandId,
    );
    const acceptance = acceptMessageDelivery(
      messageDeliveryResolutions,
      stimulus,
      accepted,
    );
    const scheduledByEventRace = eventRaceScheduler.recordMessageCallback(
      state,
      stimulus,
      acceptance.enqueue,
    );
    if (acceptance.enqueue) {
      acceptedStimuli.push(stimulus);
      if (!scheduledByEventRace) {
        pendingStimuli.push(stimulus);
      }
    }
  });
  setHandler(
    bpmnCompleteUserTaskUpdate,
    async (stimulus) => {
      enqueueStimulus(acceptedStimuli, pendingStimuli, stimulus);
      await condition(
        () =>
          commandOutcome(commandResults, stimulus.commandId) !== undefined,
      );
      const outcome = commandOutcome(commandResults, stimulus.commandId);
      if (outcome === undefined) {
        throw ApplicationFailure.nonRetryable(
          `Semantic loop ended without an outcome for ${stimulus.commandId}`,
          "BpmnCommandOutcomeMissing",
        );
      }
      return outcome;
    },
    {
      validator: (stimulus) =>
        validateCompleteUserTaskUpdate(acceptedStimuli, stimulus),
    },
  );
```

### Step 7 — A semantic mutation must cause a public disagreement

Agreement alone is weak when targets share source artifacts. The Call Activity pipeline therefore erases only the called Process identity in the first public task observation. The target still appears plausible, but the comparator must report the exact observation path where called identity collapsed into caller identity.

Source: [`packages/differential/test/call-activity-pipeline-cases.ts`](../packages/differential/test/call-activity-pipeline-cases.ts), lines 17–70.

```ts
import type {
  MutableScenarioResult,
  PipelineCase,
} from "./pipeline-types.ts";

const scenarioRoot = "scenarios/called-process-call-activity";
const callerInstanceId = "CallActivityInstance_1";
const calledInstanceId =
  "call:22:CallActivityInstance_1:18:Call_CalledProcess:1";

function eraseCalledProcessIdentity(result: MutableScenarioResult): void {
  const observation = result.trace[2];
  const task = observation?.kind === CanonicalObservationKind.State
    ? observation.openUserTasks[0]
    : undefined;
  if (
    observation?.kind !== CanonicalObservationKind.State ||
    observation.instanceId !== callerInstanceId ||
    observation.openUserTasks.length !== 1 ||
    task?.id.processInstanceId !== calledInstanceId ||
    task.id.elementId !== "CalledTask"
  ) {
    throw new Error(
      "Call Activity calibration requires one called-owned task under the unchanged caller observation",
    );
  }
  observation.openUserTasks[0] = {
    ...task,
    id: { ...task.id, processInstanceId: callerInstanceId },
  };
}

const callActivityCase = {
  id: "called-process-call-activity",
  scenarioRelativePath: `${scenarioRoot}/scenario.json`,
  bpmnRelativePath: `${scenarioRoot}/process.bpmn`,
  workflowIdPrefix: "called-process-call-activity",
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: eraseCalledProcessIdentity,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[2].openUserTasks[0].id.processInstanceId",
    expected: calledInstanceId,
    actual: callerInstanceId,
  },
} as const satisfies PipelineCase;

export const callActivityPipelineCases = Object.freeze([callActivityCase]);
```

### Step 8 — The exit gate runs the complete registered catalog

The Proto-MVP is not a three-case demo. The pipeline asserts the exact complete case list, verifies artifact-catalog coverage, executes every declared target relation, applies each seeded mutation, replays the selected histories, and checks two isolated Workflow IDs per case. A new registered scenario without a pipeline case or mutation fails the catalog guard.

Source: [`packages/differential/test/pipeline.test.ts`](../packages/differential/test/pipeline.test.ts), lines 153–184.

```ts
      pipelineCases.map(({ id }) => id),
      [
        "user-task-discovery-completion",
        "user-task-wrong-activation",
        "user-task-stale-completion",
        "parallel-fork-join-a-then-b",
        "parallel-fork-join-b-then-a",
        "parallel-fork-join-stale-a-while-b-active",
        "embedded-subprocess-completion-a-then-b",
        "embedded-subprocess-completion-b-then-a",
        "embedded-subprocess-completion-stale-a-while-b-active",
        "embedded-subprocess-completion-stale-a-after-scope",
        "subprocess-error-propagation-trigger-first",
        "subprocess-error-propagation-sibling-first",
        "subprocess-error-propagation-stale-sibling-after-error",
        "intermediate-catch-timer-pt1s",
        "timer-user-task-composition",
        "intermediate-catch-message",
        "message-addressed-receive-task",
        "exclusive-gateway-simple-boolean-first-true",
        "inclusive-gateway-one-true",
        "inclusive-gateway-both-true-a-then-b",
        "inclusive-gateway-both-true-b-then-a",
        "inclusive-gateway-default",
        "event-based-gateway-message-wins",
        "event-based-gateway-timer-wins",
        "called-process-call-activity",
        "service-task-effect-success",
        "a12-create-document-data",
        "a12-boundary-error-caught",
      ],
    );
```

### End-to-end command sequence

The normal User Task path through a called Process illustrates how identities and ownership remain distinct:

<pre aria-label="Call Activity execution sequence">
Client             Source/admission        Temporal Workflow       TypeScript core       Lean/pipeline
  │ exact bytes/profile │                         │                        │                    │
  ├────────────────────►│ validate + lower        │                        │                    │
  │                     ├────────────────────────►│ immutable program      │                    │
  │                     └────────────────────────────────────────────────────────────────────►│
  │ start caller                                  │                        │                    │
  ├──────────────────────────────────────────────►│ apply start ──────────►│                    │
  │                                               │◄── called task state ──┤                    │
  │ Update: root Workflow + called task identity  │                        │                    │
  ├──────────────────────────────────────────────►│ apply completion ─────►│                    │
  │                                               │◄── caller task state ──┤                    │
  │                     Worker stops and restarts; Event History reconstructs committed state │
  │ exact retry ─────────────────────────────────►│ recovered result; no new accepted Update    │
  │ complete caller ─────────────────────────────►│ apply completion ─────►│                    │
  │◄──────────────────────────────────────────────┤ completed receipt       │                    │
  │                                               └────────────────────────────────────────────►│
  │                                                  compare, mutate, replay, verify isolation  │
</pre>

The key Call Activity identity rule is easy to miss: `CallActivityInstance_1` addresses the hosting Workflow, while `call:22:CallActivityInstance_1:18:Call_CalledProcess:1` identifies the called semantic Process instance owning `CalledTask`. Requiring equality between those values was a real integration defect found by the complete gate and corrected at the client boundary.

## What the evidence establishes

The clean Proto-MVP exit run at `4f2fe61` established the following finite result:

- all 28 registered scenarios admitted and executed through their declared target sets;
- every Lean/core/Temporal exact relation or explicitly weaker relation passed;
- all selected CIB and retained-CIB comparisons passed where a CIB lane exists;
- every standards-only case kept CIB explicitly absent;
- every case's seeded semantic mutation produced the required disagreement;
- all three global Lean artifact/provenance mutations rejected;
- 30 histories produced during the gate replayed successfully;
- 56 primary/isolation Workflow IDs were unique;
- disposable Temporal state and processes cleaned up;
- warm pipeline work measured 14.620 seconds under the declared contention allowance.

The 14.620-second measurement is numerically below the unchanged 15-second workstation budget, but the run used `BPMN_PIPELINE_WARM_BUDGET_MS=40000` while unrelated CPU-heavy programs were active. It is therefore correctness evidence, not a replacement for the last uncontended performance baseline.

The current BPMN requirement ledger has 39 individually reviewed requirement rows, 18 marked `supported`, but it explicitly is not an exhaustive Process Execution denominator. All 13 broad mechanism-family rows retain unsupported behavior. Reviewers should report exact implemented slices and explicit remainder rather than deriving a BPMN-wide completion percentage from these numbers.

## Risks and challenges

### Shared source-projection risk

The TypeScript source compiler is the sole BPMN XML reader and the sole producer of the checked graph consumed by Lean, the core, and Temporal. Lean independently recomputes checked-graph-to-IL lowering, but it cannot detect an XML-to-checked-graph defect that already erased or misclassified the same information for every downstream target. Strict source negatives, declaration permutations, reference-changing fixtures, exact source digests, XSD/CMOF guards, and selected independent CIB execution reduce this risk but do not eliminate it.

### Shared-account risk

Lean and TypeScript are independent implementations of one reviewed account. Agreement can catch transcription errors but not a flawed rule prescribed to both. The capsule review, normative interpretation, CIB classification where applicable, nearest counterexample, and public separating witnesses are therefore load-bearing.

### Bounded-profile risk

Many implemented features use exact topology and cardinality profiles. A structured Inclusive Gateway is not general Inclusive Gateway reachability; one Message/Timer race is not the full Event-Based Gateway family; one called Process is not general Call Activity. Reviewers should look for accidental widening in source admission, standalone program validation, profile capabilities, schema unions, and public documentation.

### Hidden-state and identity risk

Inclusive selected sets, event-race records, scope occurrences, and called-Process associations are necessary runtime information that must neither leak into canonical observation nor disappear before quiescence, cancellation, or return. Definition identity, semantic instance identity, occurrence activation, and Temporal Workflow identity must remain separate. Identity collapse and early cleanup are among the most realistic bugs.

### Closure and scheduling risk

Internal closure is deliberately bounded. Newly reachable multiple-enabled states need explicit approval, order-invariance evidence, or rejection. The TypeScript evaluator has a deterministic selector, while Lean also reports unresolved ambiguity; a capsule must not accidentally turn evaluator order into BPMN meaning.

### Temporal refinement risk

Temporal can lose or duplicate ingress, expose an intermediate state, derive a timer or effect from uncommitted data, race Message and Timer readiness, acknowledge a command before its semantic outcome is durable, or replay differently after code evolution. The current gates cover finite histories and selected mutations, not a general refinement theorem.

### Pre-release evolution risk

Histories are currently produced, replayed, and discarded inside one gate. There is no immutable production history baseline, Workflow patching policy, migration reader, rollback contract, or support window. The current replace-in-place policy is appropriate for pre-release development but must change before durable external deployments exist.

### CIB evidence-fidelity risk

CIB does not expose every canonical semantic field directly. Each projected field is classified as engine-observed, adapter-derived, adapter-decided, or not-claimed. A green retained-evidence comparison can be vacuous for empty terminal collections or dependent on a projector decision. Reviewers should inspect the discriminating waiting state and verify that each claimed raw fact has a load-bearing mutation or live probe owner.

### Coverage-denominator risk

Scenario count, supported reviewed rows, CIB fixture prevalence, and A12 model prevalence are different denominators. None is a BPMN conformance percentage. The next planning phase must deepen the normative requirement inventory before management reporting can safely attach percentages to Process Execution coverage.

### Source-fixture maintenance risk

Some source tests construct BPMN XML strings because namespace declarations, lexical QName shape, omitted attributes, declaration order, and deliberately malformed structures are admission discriminators. CIB Seven has a useful Java model builder, but no equivalent project TypeScript builder currently preserves all of those lexical distinctions. A future typed fixture DSL could reduce repetition only if it keeps an explicit escape hatch for exact XML and does not normalize away the facts under test.

### Review-process cost

Cold semantic reviews are intentionally expensive because they remove author context and re-derive claims. The project now uses stage-focused, same-model/same-effort sub-agents, static findings before heavy gates, deterministic review packets, disjoint implementation file ownership, focused agent gates, one root full gate, and warm same-reviewer correction audits. Review efficiency must not weaken context isolation for a material new semantic account.

## What a reviewer should know before evaluating

1. A capsule `-SPEC.md` means its bounded contract is implemented; a profile artifact may still say `draft` because the project has no production release/history baseline.
2. `supported` in the requirement ledger can mean a bounded reviewed slice. Read the owning capsule and exclusions before generalizing it to the whole BPMN construct.
3. CIB absence in a standards-only target set is deliberate, not a missing test, when no CIB relationship has been selected for the exact proposition.
4. Lean is authoritative for the selected operational account after checked-source admission, but it does not parse XML, prove TypeScript, or prove Temporal refinement.
5. TypeScript/Lean equality is not majority-vote evidence for the semantic interpretation. Normative reasoning and truly independent oracle observations remain separate.
6. Temporal Event History is host evidence. Workflow tasks, Activity attempts, Timer commands, Signals, and Update events are not BPMN semantic state unless the public contract explicitly projects a consequence.
7. Expected results are physically separate from neutral scenarios. A scenario contains commands and requested observation fields, never the oracle answer.
8. A mutation is meaningful only when it changes the proposition being claimed and fails at an approved public or admission boundary.
9. A `by decide` theorem over one fixture is a finite lock, not a general theorem. Check hypotheses and quantification before relying on theorem names.
10. The repository is pre-release. Do not infer deployment compatibility, retained-history compatibility, migration, packaging, security hardening for hostile XML CPU, or production operations.

## Reviewer evaluation framework

### A. Claim and scope

- Can the main claim be stated in one bounded sentence?
- Do `Status`, the requirement ledger, profile, capsule, implementation map, and plan describe the same boundary?
- Are required, optional, and excluded shapes explicit?
- Does any public wording silently promote a structured or exact slice into general BPMN support?

### B. Normative and compatibility basis

- Are the BPMN clauses, tables, CMOF, and XSD facts applicable to the exact source shape?
- Is every interpretation or source conflict recorded rather than hidden in code?
- If CIB participates, is the relationship classified and bound to a pinned release, configuration, observation boundary, and fidelity?
- Is CIB absent when it offers no independent evidence for the selected standard proposition?

### C. Source admission and lowering

- Does admission reject the nearest unsupported adjacent shape, including unknown keys and parser warnings?
- Are identity, multiplicity, declaration order, namespace resolution, scope ownership, and source provenance preserved when semantically relevant?
- Are order-insensitive collections canonicalized, while intentionally ordered constructs preserve the specified order?
- Does Lean independently recompute lowering and reject artifact disagreement?
- Can a declaration permutation or reference-changing fixture expose a fixture constant or positional pairing bug?

### D. Semantic account and formal evidence

- Is the declarative transition relation distinct from the evaluator?
- Does evaluator soundness cover every constructor of the new transition family?
- Do reusable theorems have meaningful hypotheses and results?
- Are concrete `by decide` witnesses described honestly?
- Is the nearest realistic non-law or negative witness executable?
- Are closure bounds and newly reachable multiple-enabled states checked explicitly?

### E. Independent TypeScript core

- Does the core implement the same invariant matrix without adding extra admission or counter premises?
- Does it remain pure, deterministic, serializable, and free of CIB/Temporal imports?
- Are semantic variants closed and exhaustively switched?
- Do wrong, stale, duplicate, and malformed inputs preserve or fail state exactly as specified?
- Does canonical observation depend only on admitted definition, committed runtime state, and explicit applied stimuli?

### F. Temporal refinement

- Is each durable Timer, Signal, Update, Activity, cancellation, or race derived from committed core state?
- Is host address separate from semantic occurrence identity where required?
- Are duplicate delivery, command identity conflict, Worker absence, result recovery, terminal receipt, and replay covered?
- Does the adapter fail closed for unsupported concurrent host mechanisms or coalesced readiness?
- Does a bypass mutation prove that Workflow code cannot skip the core while preserving the claimed trace?
- Are unrelated host event families asserted absent when the capsule claims mechanism reuse?

### G. Differential and retained evidence

- Is the scenario answer-free and content-bound to exact BPMN bytes and profile identity?
- Does each target relation match the actual claim rather than force every target into exact equality?
- Does every case have a seeded mutation with an exact expected disagreement path?
- Are raw producer facts distinguished from canonical projection decisions?
- Are terminal empty states avoided as the sole evidence for collection behavior?

### H. Governance, maintainability, and cost

- Are proposal, checkpoint, closure, correction-audit, and graduation receipts valid for material semantic work?
- Did implementation lanes own disjoint files and run focused gates while root ran the complete gate once?
- Are modules cohesive and below the source-hygiene boundaries without comment deletion or line compression tricks?
- Does the capsule cost ledger compare the measured direction honestly with a real baseline?
- Are the plan, implementation map, profile/scenario registries, and document registry synchronized?

## Red flags that merit a required finding

- A BPMN element is accepted because an optional field happens to be absent, with no closed discriminant or exact key check.
- A target derives identity, branch choice, deadline, correlation, or expected output from a fixture constant rather than source/runtime state.
- Lean and TypeScript both pass because the same incorrectly lowered artifact erased the discriminator before either target saw it.
- A Temporal timer, Activity, Signal, Update, or scheduler order decides a BPMN-visible result that the core did not select.
- A mutation changes a hidden microstep but not an approved public observation or admission result.
- A theorem name claims exactness, determinism, liveness, or equivalence beyond its proposition and hypotheses.
- A CIB field is labeled engine-observed even though the adapter invented or normalized it.
- A bounded slice is summarized as full element support, CIB compatibility, or Process Execution conformance.
- A new runtime record is omitted from quiescence, interruption cleanup, ordering, serialization, or replay review.
- A new operation kind escapes a closed host-capability or evaluator classification because one switch is not exhaustive.

## Suggested review route

For a management and architecture review:

1. Read [PROJECT-DESIGN.md](PROJECT-DESIGN.md), especially the layered architecture, authority model, Lean rationale, and independence boundary.
2. Read [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) for the exact implemented and absent surfaces.
3. Read the [Proto-MVP milestone](PLAN.md#reviewer-proto-mvp-milestone) and current checkpoint in [PLAN.md](PLAN.md).
4. Use the [capsule registry](capsules/README.md) to inspect the specifications governing any capability you probe; the representative walkthrough is owned by the [Call Activity specification](capsules/CALL-ACTIVITY-SPEC.md).
5. Inspect the complete target and mutation requirements in [TESTING-SPEC.md](TESTING-SPEC.md#complete-differentialrefinement-pipeline).

For an executable review from the repository root:

```bash
./scripts/doctor.sh verify
env CI=true ./scripts/pnpm.sh run test:infrastructure
env CI=true ./scripts/pnpm.sh run test:pipeline
```

The pipeline starts a disposable local Temporal server and therefore requires the environment's normal host port-binding authorization. Under known external CPU contention, an explicitly declared `BPMN_PIPELINE_WARM_BUDGET_MS` override may establish correctness but must not replace the default uncontended performance baseline.

For a complete release-style development gate:

```bash
./scripts/verify.sh
```

Reviewers should run focused semantic or adapter gates first when investigating a static finding, then run the complete wrapper once after corrections are integrated. Repeating full gates in every implementation or review lane wastes time and CPU without increasing independence.

## What is next

The next work returns from the reviewer milestone to BPMN breadth. The immediate planning action is to deepen the normative requirement denominator and select the next bounded mechanism by reusable Process Execution leverage, using CIB Seven breadth and A12 prevalence only to order equal-value choices.

The outstanding mechanism queue includes:

1. User Task performer/assignment and broader data behavior;
2. additional Start, Intermediate, End, and Boundary Event families;
3. standard loops and sequential/parallel Multi-Instance Activities;
4. broader Call Activity lifecycle, mappings, repetition, concurrency, cancellation, and resolution;
5. general gateway composition and reachability beyond the exact structured profiles;
6. Collaboration, Participants, Message Flow, payload, correlation, and Process instantiation;
7. compensation and transactions;
8. Business Rule, Script, Send, Manual, and other Task families;
9. import/reference closure and broader expression/data semantics;
10. retained production histories, versioning, migration, rollback, packaging, deployment, and operations.

The most important architectural challenge ahead is composition: extending breadth without turning the source compiler into a list of exact topology recognizers or weakening admission into an unreviewed general engine. Loops and Multi-Instance Activities are especially significant because they introduce repeated occurrence identity, scheduling, completion conditions, data collection, cancellation, and possible concurrency rather than merely another node kind.

## Repository map for deeper inspection

| Concern | Primary owner |
|---|---|
| Mission and architecture | [PROJECT-DESIGN.md](PROJECT-DESIGN.md) |
| Current implementation and absences | [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) |
| Current sequence and resume point | [PLAN.md](PLAN.md) |
| BPMN requirement dispositions | [BPMN-REQUIREMENT-LEDGER.md](BPMN-REQUIREMENT-LEDGER.md) |
| Shared checked graph and IL | [SEMANTIC-PROCESS-IL-SPEC.md](SEMANTIC-PROCESS-IL-SPEC.md) and [`semantic-process-contract.ts`](../packages/semantic-core/src/semantic-process-contract.ts) |
| Lean semantics | [`BpmnSemantics/SemanticProcess`](../BpmnSemantics/SemanticProcess) |
| TypeScript semantic core | [`packages/semantic-core`](../packages/semantic-core) |
| BPMN ingestion | [`packages/bpmn-source`](../packages/bpmn-source) and [BPMN-XML-INGESTION-DECISION.md](BPMN-XML-INGESTION-DECISION.md) |
| Temporal lifecycle | [TEMPORAL-PROCESS-LIFECYCLE-SPEC.md](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) and [`packages/temporal-adapter`](../packages/temporal-adapter) |
| Differential comparison | [`packages/differential`](../packages/differential) |
| Profiles and answer-free scenarios | [`profiles`](../profiles) and [`scenarios`](../scenarios) |
| Wire schemas | [`contracts`](../contracts) |
| CIB classifications | [CIB-BPMN-RELATION-REGISTER.md](CIB-BPMN-RELATION-REGISTER.md) |
| Test and review protocol | [TESTING-SPEC.md](TESTING-SPEC.md) |

## Bottom line

The Proto-MVP demonstrates that one standards-first semantic account can travel from exact BPMN source through checked graph and IL, executable Lean semantics, an independently written production core, durable Temporal hosting, selected CIB comparison, semantic mutation, and replay without collapsing those authorities into one implementation. The strongest result is architectural: the available branching, race, and called-instance capabilities use shared evaluators and one Workflow engine rather than profile-specific execution paths.

The strongest caveat is equally important: breadth is still profile-bounded, the requirement denominator is not exhaustive, and several evidence lanes share the TypeScript source producer. A positive review should therefore approve the demonstrated architecture and exact slices, not infer general BPMN execution or broad compatibility. The next phase should preserve that claim discipline while expanding the standard mechanism families that remain entirely or substantially open.
