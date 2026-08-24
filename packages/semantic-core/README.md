# TypeScript semantic core

`@bpmn-lean/semantic-core` is the dependency-free TypeScript evaluator for admitted Semantic Process programs. It owns BPMN-visible state transitions and canonical observations, while file I/O, XML parsing, CIB Seven integration, Temporal SDK code, and external effects stay outside the package.

## What you can do

Use the package to start an admitted Process, submit typed stimuli such as task completion or timer firing, inspect stable state, and run answer-free semantic scenarios. `applyStimulus` is pure: equal admitted programs, states, stimuli, and closure limits produce equal results.

```ts
const started = applyStimulus(semanticProcess, initialState, {
  kind: StimulusKind.StartProcess,
  commandId: "start-process",
  processId: "Process_Review",
  instanceId: "Instance_1",
  initialVariables: [],
});

const result = observeStableState(semanticProcess, started.state);
```

Semantic Process programs normally come from the [BPMN source-ingestion package](../bpmn-source/README.md). Durable hosting uses the same incremental boundary through the [Temporal adapter](../temporal-adapter/README.md).

## Quick start

Run the focused package gate:

```sh
./scripts/pnpm.sh run test:semantic-core
```

## Learn more

- [Source map](SOURCE-MAP.md) maps implementation responsibilities to files.
- [Semantic Process IL specification](../../docs/SEMANTIC-PROCESS-IL-SPEC.md) owns the checked graph and immutable program contracts.
- [Profile-parameterized admission specification](../../docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) owns profile-sensitive admission.
- [Parallel User Task metadata composition specification](../../docs/capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md) owns the exact closure-reviewed composed profile and evidence boundary.
- [Structured Human Work specification](../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns the M6 assignment-only metadata and typed completion-value boundary.
- [Sequential Multi-Instance specification](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) owns the exact registered controller, transition, observation, and exclusion boundary.
- [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../../docs/ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md) records the exact implemented and absent surface.
- [Testing specification](../../docs/TESTING-SPEC.md) owns the verification and evidence boundaries.
