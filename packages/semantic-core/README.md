# TypeScript semantic core

`@bpmn-lean/semantic-core` is the production-oriented, dependency-free TypeScript implementation of the currently approved BPMN semantic capsules. It contains BPMN-visible command/state transitions and canonical observation projection, but no file I/O, XML parser, CIB Seven code, Temporal SDK code, or external effects.

The current surface supports only the content-addressed `none Start Event → User Task → none End Event` scenario in [scenario.json](../../scenarios/m0-sequential-user-task/scenario.json). Its result is checked against the CIB-calibrated trace and the independent [Lean interpreter](../../BpmnSemantics/SequentialUserTask.lean).

## Public boundary

```ts
const started = applyStimulus(
  sequentialUserTaskModel,
  initialState,
  {
    kind: StimulusKind.StartProcess,
    commandId: "start-process",
    processId: "Process_SequentialUserTask",
    instanceId: "Instance_1",
  },
);

const result = runScenario(scenario);
```

`applyStimulus` is pure: the same model, state, stimulus, and closure limit produce the same result. `runScenario` derives canonical observations without reading the scenario's calibration answer. Internal closure-bound exhaustion is a harness result and never exposes an admitted command as committed.

The package intentionally does not reproduce Temporal durability, message delivery, retry, Workflow replay, persistence, or scheduling. The Temporal adapter will host this semantic core and will be tested as a refinement of this boundary.

## Test

From the repository root:

```sh
./scripts/pnpm.sh run test:semantic-core
```
