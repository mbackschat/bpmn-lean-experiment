# Differential comparator

`@bpmn-lean/differential` compares already-canonical scenario results without accessing engines, Temporal, files, or databases. It deliberately contains no target-specific semantic repair.

The caller declares one reference result and one or more candidates. The comparator requires exact outcome and trace equality and returns the first typed disagreement: scenario outcome, trace length, observation kind, or observation value with its structural path.

CIB Seven is the declared reference for the draft CIB compatibility profile. This is not majority voting and does not make CIB normative for BPMN conformance.

Run the pure comparator gate:

```sh
./scripts/pnpm.sh run test:differential
```

The complete pipeline batches exact completion, wrong activation, and stale completion through one CIB Seven engine, one Lean result emitter, the semantic core, and two isolated Temporal executions per case. It compares all four canonical targets and content-bound CIB evidence, checks Query/Update results, requires a seeded task-activation mutation to be classified, replays all primary live histories through one Worker, records provenance and phase timings, proves cleanup, and enforces feedback budgets.

```sh
./scripts/pnpm.sh run test:pipeline
```
