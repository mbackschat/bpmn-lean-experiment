# TypeScript semantic core

`@bpmn-lean/semantic-core` is the production-oriented, dependency-free TypeScript implementation of the approved semantic capsule. It owns BPMN-visible command/state transitions and canonical observations, but no file I/O, XML parser, CIB Seven code, Temporal SDK code, or external effects.

The current surface supports only the content-addressed `None Start Event → User Task → None End Event` model and the three [User Task witnesses](../../scenarios/user-task-discovery-completion/README.md). Executable IR comes from the separate [source-ingestion package](../bpmn-source/README.md), and results are checked independently against retained CIB evidence and the [Lean interpreter](../../BpmnSemantics/SequentialUserTask.lean).

## Public boundary

```ts
const started = applyStimulus(executableIr, initialState, {
  kind: StimulusKind.StartProcess,
  commandId: "start-process",
  processId: "Process_SequentialUserTask",
  instanceId: "Instance_1",
});

const completed = applyStimulus(executableIr, started.state, {
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-user-task-instance",
  taskId: {
    processInstanceId: "Instance_1",
    elementId: "UserTask_Approve",
    activation: 1,
  },
});

const result = runScenario(scenario, executableIr);
```

`applyStimulus` is pure: the same admitted IR, state, stimulus, and closure limit produce the same result. Completion is admitted only for the exact active semantic occurrence `(Process instance, BPMN element, activation ordinal)`. Open tasks and enabled interactions are derived only from current semantic state. Closure-bound exhaustion is a harness result and never exposes an admitted command as committed.

The code is split by responsibility:

| File | Responsibility |
|---|---|
| [executable-ir.ts](src/executable-ir.ts) | Project-owned executable definition data |
| [sequential-user-task-admission.ts](src/sequential-user-task-admission.ts) | Structural scenario/IR validation and identity admission |
| [sequential-user-task-runtime.ts](src/sequential-user-task-runtime.ts) | Runtime state, external command admission, internal closure, and `applyStimulus` |
| [sequential-user-task.ts](src/sequential-user-task.ts) | Stable observation projection and incremental/full scenario evaluation |

`deployScenario` and `advanceScenario` expose the same logic incrementally for durable hosts. `runScenario` consumes those operations too, so adapters do not copy observation semantics.

Run the focused gate:

```sh
./scripts/pnpm.sh run test:semantic-core
```
