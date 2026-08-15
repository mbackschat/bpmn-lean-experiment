# TypeScript semantic core

`@bpmn-lean/semantic-core` is the production-oriented, dependency-free TypeScript implementation of the approved semantic capsule. It owns BPMN-visible command/state transitions and canonical observations, but no file I/O, XML parser, CIB Seven code, Temporal SDK code, or external effects.

The execution boundary validates Semantic Process graph structure independently from exact profile-selected operation cardinality. It supports the reviewed sequential User Task, balanced two-branch parallel fork/join, exact `PT1S` Timer, finite acyclic Timer/User Task and Message/User Task compositions, one resumption-bounded User Task cycle, operation-addressed Intermediate Catch Message and direct-Message Receive Task subscriptions, exact top-level Message and Timer Start profiles, payload-free effect, one configured literal-generation-1 effect incident with exact retry and incident-gated hosting-root cancellation, data/error, Simple Boolean conditional choice, structured Inclusive Gateway, bounded Event-Based Gateway, ordinary embedded Sub-Process, direct-parent Sub-Process Error propagation, bounded called-Process Call Activity, the registered nested Terminate End profile, one registered configured Task profile, and the registered Boolean completion profile without selecting among complete program topology predicates or adding an operation family. The Boolean profile reuses the exact sequential shape and admits Boolean only at User Task completion through a profile/surface value-domain owner; Process Start, effects, expressions, and every older profile retain their prior domains. Semantic Process programs come from the separate [source-ingestion package](../bpmn-source/README.md), and results are checked independently against retained CIB evidence where declared and the generic [Lean Semantic Process interpreter](../../BpmnSemantics/SemanticProcess.lean).

## Public boundary

```ts
const started = applyStimulus(semanticProcess, initialState, {
  kind: StimulusKind.StartProcess,
  commandId: "start-process",
  processId: "Process_SequentialUserTask",
  instanceId: "Instance_1",
});

const completed = applyStimulus(semanticProcess, started.state, {
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-user-task-instance",
  taskId: {
    processInstanceId: "Instance_1",
    elementId: "UserTask_Approve",
    activation: 1,
  },
});

const result = runScenario(scenario, semanticProcess);
```

`applyStimulus` is pure: the same admitted Semantic Process program, state, stimulus, and closure limit produce the same result. It is the result-only projection of `applyStimulusWithTrace`, which retains the exact admitted stimulus, each actually selected internal operation and owner, successor logical time, and public control-position delta only after stable closure succeeds. The traced result also carries a separate one-for-one unnumbered flow-node lifecycle sequence. It derives starts and completed or cancelled terminals at those same evaluator boundaries, fold-checks private anchors, and requires the folded open set to equal `projectOpenFlowNodeOccurrences`; it never adds lifecycle fields to the existing transition records or changes semantic results. `projectCurrentControlPositions` independently maps current tokens and scopes to exact BPMN origins and fails closed on ambiguous or malformed ownership. User Task completion is admitted only for the exact active semantic occurrence `(Process instance, BPMN element, activation ordinal)`. Timer firing additionally requires exact logical deadline equality. Message delivery requires that occurrence identity plus exact equality of the closed `operationMessage | directMessage` channel; equal Message IDs under different arms do not match. `observeStableState`, `projectOpenUserTasks`, `projectOpenMessageSubscriptions`, `projectOpenTimers`, and `projectOpenIncidents` derive adapter projections directly from current semantic state. Hosts may select a strict subset from `observeStableState`, but they do not reconstruct interaction eligibility or ordering. `isWellFormedStimulus`, `stimulusCommandId`, and `sameStimulus` own structural admission and logical-command identity for adapters. Closure-bound exhaustion is a harness result and never exposes an admitted command as committed.

The code is split by responsibility:

| File | Responsibility |
|---|---|
| [semantic-value-contract.ts](src/semantic-value-contract.ts) | Value shapes the checked graph and the program carry unchanged |
| [checked-process-contract.ts](src/checked-process-contract.ts) | Checked BPMN graph: the admitted representation still in BPMN elements |
| [semantic-process-contract.ts](src/semantic-process-contract.ts) | Semantic Process IL: operations, control places, and program data |
| [semantic-process-admission.ts](src/semantic-process-admission.ts) | Structural scenario/program validation and identity admission |
| [semantic-process-operation-admission.ts](src/semantic-process-operation-admission.ts) | Closed operation-shape, payload, reference, and origin validation |
| [semantic-process-graph-admission.ts](src/semantic-process-graph-admission.ts) | Topology-independent producer/consumer, reachability, co-reachability, and profile-selected full-graph or resumption-cut acyclicity validation |
| [semantic-process-profile.ts](src/semantic-process-profile.ts) | Exact profile operation-kind cardinality capabilities |
| [checked-process-profile-shape.ts](src/checked-process-profile-shape.ts) | Exact checked-node multisets selected by registered profiles |
| [semantic-program-profile-shape.ts](src/semantic-program-profile-shape.ts) | Exact operation multisets selected by registered profiles |
| [semantic-profile-catalog.ts](src/semantic-profile-catalog.ts) | Product-registered semantic profile identities |
| [semantic-profile-value-domain.ts](src/semantic-profile-value-domain.ts) | Profile-sensitive value admission for Process Start, User Task completion, and effect completion |
| [call-activity-admission.ts](src/call-activity-admission.ts) | Cross-definition invocation/return pairing and virtual completion edges |
| [semantic-process-call-runtime.ts](src/semantic-process-call-runtime.ts) | Called-instance identity, invocation, quiescent return, and subtree cleanup |
| [semantic-process-error-runtime.ts](src/semantic-process-error-runtime.ts) | Direct-parent Error propagation catching one exact Error at its attached scope |
| [semantic-process-scope-cancellation.ts](src/semantic-process-scope-cancellation.ts) | Shared scope-subtree classification and regional live-owner cancellation for Error, deadline, and Terminate semantics |
| [semantic-process-termination-runtime.ts](src/semantic-process-termination-runtime.ts) | No-output containing-scope termination with selected-occurrence retention |
| [semantic-process-bounded-scope-runtime.ts](src/semantic-process-bounded-scope-runtime.ts) | Sub-Process scope entry that arms an interrupting deadline, its quiescence withdrawal, and its interruption victory |
| [message-channel.ts](src/message-channel.ts) | Strict closed-arm Message-channel validation and exact equality shared by program and stimulus admission |
| [semantic-process-message.ts](src/semantic-process-message.ts) | Message-subscription activation, exact delivery, state-preserving refusal, and projection |
| [semantic-process-incident-validation.ts](src/semantic-process-incident-validation.ts) | Exact successor-profile, private association, and pre-dispatch incident-state validation |
| [semantic-process-incident-runtime.ts](src/semantic-process-incident-runtime.ts) | Literal-generation-1 effect-failure report and exact same-occurrence retry transitions |
| [semantic-process-incident-cancellation.ts](src/semantic-process-incident-cancellation.ts) | Exact incident-gated hosting-root derivation, complete cleanup, and typed cancellation transition |
| [semantic-process-triggered-start.ts](src/semantic-process-triggered-start.ts) | Shared fresh root occurrence and canonical outgoing-token mechanics after type-specific admission |
| [semantic-process-message-start.ts](src/semantic-process-message-start.ts) | Exact resolved Message-start pairing and no-subscription boundary |
| [semantic-process-timer-start.ts](src/semantic-process-timer-start.ts) | Exact resolved Timer-start pairing, distinct initiation, and no-running-Timer boundary |
| [semantic-process-runtime.ts](src/semantic-process-runtime.ts) | Runtime state, external command admission, enum-based operation dispatch for all current operations, operation-ID-stable internal closure, and `applyStimulus` |
| [semantic-transition-trace.ts](src/semantic-transition-trace.ts) | Exact unnumbered committed transition facts and complete-record replay validation |
| [flow-node-occurrence-lifecycle.ts](src/flow-node-occurrence-lifecycle.ts) | Exhaustive selected-boundary lifecycle mapping, private anchors, and exact start-before-terminal fold validation |
| [flow-node-occurrence-open-set.ts](src/flow-node-occurrence-open-set.ts) | Independent fail-closed projection of exact long-lived flow-node occurrences from RuntimeState and Program associations |
| [flow-node-occurrence-publication-completeness.ts](src/flow-node-occurrence-publication-completeness.ts) | Pure exhaustive E1-to-occurrence completeness relation over Program-owned transitions and retained private anchors |
| [flow-node-occurrence-publication-external-completeness.ts](src/flow-node-occurrence-publication-external-completeness.ts) | External-stimulus, event-race, Boundary Event, and cancellation half of publication completeness |
| [control-position-projection.ts](src/control-position-projection.ts) | Fail-closed public Sequence Flow token and definition/runtime-scope positions plus transition deltas |
| [scenario.ts](src/scenario.ts) | Stable observation projection and incremental/full scenario evaluation |
| [stimulus.ts](src/stimulus.ts) | Structural stimulus validation, command identity, and exact same-stimulus comparison |

`deployScenario` and `advanceScenario` expose the same logic incrementally for durable hosts. `runScenario` consumes those operations too. Temporal delegates its current-task Query, Update validation, and logical deduplication policy to the core instead of scanning trace history or maintaining copies.

Run the focused gate:

```sh
./scripts/pnpm.sh run test:semantic-core
```
