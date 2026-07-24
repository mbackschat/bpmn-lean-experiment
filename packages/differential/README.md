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
