# Differential comparator

`@bpmn-lean/differential` compares already-canonical scenario results without accessing engines, Temporal, files, or databases. It deliberately contains no target-specific semantic repair.

The caller declares one reference result and one or more candidates. For the current sequential Milestone 0 capsule, the comparator requires exact outcome and trace equality and returns the first typed disagreement:

- scenario outcome;
- trace length;
- observation kind;
- observation value with its structural path.

The CIB Seven result is the declared reference for the draft CIB compatibility profile. This is not majority voting and does not make CIB normative for BPMN conformance.

Run the focused gate from the repository root:

```sh
./scripts/pnpm.sh run test:differential
```

The complete `./scripts/pnpm.sh run test:pipeline` gate builds the target boundaries and batches the lifecycle, exact completion, wrong-activation, and stale-completion cases through one CIB Seven engine, one Lean JSON-lines emitter, the semantic core, and two isolated Temporal executions per case. It compares all four canonical targets and retained CIB evidence by scenario identity, checks exact Query/Update results, requires both the lifecycle-state and task-activation mutations to be classified, batch-replays live and retained histories through one replay Worker, records provenance and phase timings, proves cleanup, and enforces the Milestone 0 budgets.
