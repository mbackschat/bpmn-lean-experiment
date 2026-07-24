# TypeScript semantic core

`@bpmn-lean/semantic-core` is the production-oriented, dependency-free TypeScript implementation of the currently approved BPMN semantic capsules. It contains BPMN-visible command/state transitions and canonical observation projection, but no file I/O, XML parser, CIB Seven code, Temporal SDK code, or external effects.

The current surface supports only the content-addressed `none Start Event → User Task → none End Event` model. It retains the original lifecycle scenario in [scenario.json](../../scenarios/m0-sequential-user-task/scenario.json) and implements the exact task-discovery and completion witnesses in the [User Task interaction scenarios](../../scenarios/m1-user-task-discovery-completion/). Its versioned executable IR is produced from the BPMN XML by the separate [source-ingestion package](../bpmn-source/README.md), and its results are checked against retained CIB evidence and the independent [Lean interpreter](../../BpmnSemantics/SequentialUserTask.lean).

## Public boundary

```ts
const started = applyStimulus(
  executableIr,
  initialState,
  {
    kind: StimulusKind.StartProcess,
    commandId: "start-process",
    processId: "Process_SequentialUserTask",
    instanceId: "Instance_1",
  },
);

const completed = applyStimulus(
  executableIr,
  started.state,
  {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-user-task-instance",
    taskId: {
      processInstanceId: "Instance_1",
      elementId: "UserTask_Approve",
      activation: 1,
    },
  },
);

const result = runScenario(scenario, executableIr);
```

`applyStimulus` is pure: the same executable IR, state, stimulus, and closure limit produce the same result. The interaction profile admits completion only for the exact active semantic task occurrence `(process instance, BPMN element, activation ordinal)` and derives open tasks plus command-ID-free enabled interactions solely from current semantic state. `runScenario` validates the IR schema, compiler/source/profile identity, and sequential topology, then derives canonical observations from an answer-free scenario. Retained CIB evidence is loaded only by tests and differential verification, never by this package. Internal closure-bound exhaustion is a harness result and never exposes an admitted command as committed.

`deployScenario` and `advanceScenario` expose the same deployment, command, and stable-state observation logic incrementally for durable hosts. `runScenario` consumes those operations too, so an adapter does not need to copy observation semantics.

The package intentionally does not reproduce Temporal durability, message delivery, retry, Workflow replay, persistence, or scheduling. The [Temporal adapter](../temporal-adapter/README.md) hosts this core and checks its Workflow result as a refinement of this boundary.

## Test

From the repository root:

```sh
./scripts/pnpm.sh run test:semantic-core
```
