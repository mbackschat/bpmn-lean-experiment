# TypeScript semantic core

`@bpmn-lean/semantic-core` is the production-oriented, dependency-free TypeScript implementation of the approved semantic capsule. It owns BPMN-visible command/state transitions and canonical observations, but no file I/O, XML parser, CIB Seven code, Temporal SDK code, or external effects.

The execution boundary validates Semantic Process graph structure independently from exact profile-selected operation cardinality. It supports the reviewed sequential User Task, balanced two-branch parallel fork/join, exact `PT1S` Timer, finite acyclic Timer/User Task composition, payload-free effect, data/error, and Simple Boolean conditional-choice surfaces without selecting among complete topology predicates. Semantic Process programs come from the separate [source-ingestion package](../bpmn-source/README.md), and results are checked independently against retained CIB evidence where declared and the generic [Lean Semantic Process interpreter](../../BpmnSemantics/SemanticProcess.lean). The parallel evaluator executes `duplicate` and per-incoming-flow `synchronize`, while the timer evaluator executes `awaitTimer`, owns occurrence identity and logical deadlines, admits only exact-deadline firing, and projects `openTimers`. Canonical CIB and focused Temporal evidence are checked outside this package.

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

`applyStimulus` is pure: the same admitted Semantic Process program, state, stimulus, and closure limit produce the same result. User Task completion is admitted only for the exact active semantic occurrence `(Process instance, BPMN element, activation ordinal)`. Timer firing additionally requires exact logical deadline equality. `projectOpenUserTasks` and `projectOpenTimers` derive adapter projections directly from current semantic state. `isWellFormedStimulus`, `stimulusCommandId`, and `sameStimulus` own structural admission and logical-command identity for adapters. Closure-bound exhaustion is a harness result and never exposes an admitted command as committed.

The code is split by responsibility:

| File | Responsibility |
|---|---|
| [semantic-process-contract.ts](src/semantic-process-contract.ts) | Checked BPMN graph and Semantic Process definition data |
| [semantic-process-admission.ts](src/semantic-process-admission.ts) | Structural scenario/program validation and identity admission |
| [semantic-process-graph-admission.ts](src/semantic-process-graph-admission.ts) | Topology-independent producer/consumer, reachability, co-reachability, and acyclicity validation |
| [semantic-process-profile.ts](src/semantic-process-profile.ts) | Exact profile operation-kind cardinality capabilities |
| [semantic-process-runtime.ts](src/semantic-process-runtime.ts) | Runtime state, external command admission, enum-based operation dispatch for all current operations, operation-ID-stable internal closure, and `applyStimulus` |
| [scenario.ts](src/scenario.ts) | Stable observation projection and incremental/full scenario evaluation |
| [stimulus.ts](src/stimulus.ts) | Structural stimulus validation, command identity, and exact same-stimulus comparison |

`deployScenario` and `advanceScenario` expose the same logic incrementally for durable hosts. `runScenario` consumes those operations too. Temporal delegates its current-task Query, Update validation, and logical deduplication policy to the core instead of scanning trace history or maintaining copies.

Run the focused gate:

```sh
./scripts/pnpm.sh run test:semantic-core
```
