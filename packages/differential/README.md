# Differential comparator

`@bpmn-lean/differential` compares already-canonical scenario results without accessing engines, Temporal, files, or databases. It deliberately contains no target-specific semantic repair.

The caller declares one reference result and one or more candidates. The comparator requires exact outcome and trace equality and returns the first typed disagreement: scenario outcome, trace length, observation kind, or observation value with its structural path.

CIB Seven is the declared reference for draft CIB compatibility profiles. A standards-only profile may instead declare Lean as its reference and omit CIB entirely; target membership is explicit per case. This is not majority voting and does not make either an implementation or a target count normative for BPMN conformance.

Run the pure comparator gate:

```sh
./scripts/pnpm.sh run test:differential
```

The complete pipeline batches twelve semantic cases through one Lean result emitter, the semantic core, and two isolated Temporal executions per case. Ten declared CIB cases additionally run through release-grouped CIB Seven engines and compare content-bound retained evidence; the Simple Boolean and Timer/User Task standards cases explicitly omit CIB. The pipeline compares each declared target relation, checks Query/Update and committed-state-derived timer results, requires seeded task, parallel, provenance, timer-deadline, conditional-route, effect, mapping, and boundary-error mutations to be classified, replays fourteen live histories through one Worker, records provenance and phase timings, proves cleanup, and enforces feedback budgets.

```sh
./scripts/pnpm.sh run test:pipeline
```
