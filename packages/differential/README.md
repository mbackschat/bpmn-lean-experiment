# Differential comparator

`@bpmn-lean/differential` compares already-canonical scenario results without accessing engines, Temporal, files, or databases. It deliberately contains no target-specific semantic repair.

The caller declares one reference result and one or more candidates. The comparator requires exact outcome and trace equality and returns the first typed disagreement: scenario outcome, trace length, observation kind, or observation value with its structural path.

CIB Seven is the declared reference for draft CIB compatibility profiles. A standards-only profile may instead declare Lean as its reference and omit CIB entirely; target membership is explicit per case. This is not majority voting and does not make either an implementation or a target count normative for BPMN conformance.

Run the pure comparator gate:

```sh
./scripts/pnpm.sh run test:differential
```

The complete pipeline derives every semantic case and target relation from the guarded artifact catalogs, batches them through one Lean result emitter and the semantic core, and runs two isolated Temporal executions per case. Only cases that declare CIB additionally run through release-grouped CIB Seven engines and compare content-bound retained evidence; standards-only cases, including the bounded Inclusive Gateway, Event-Based Gateway, Call Activity, resumption-bounded User Task cycle, and Message Start profiles, explicitly omit CIB. The cycle case traverses both reviewed back-edges, reaches activation ordinals 1 through 3, exits through the default, and carries an activation-reset mutation. The Message Start case carries the complete operation-addressed trigger and locks both the supplied semantic instance identity and exact Interface Operation scenario binding without adding a channel observation. The pipeline checks Query/Update and committed-state-derived Timer results, requires every registered case to carry a meaningful seeded semantic mutation, replays every catalog-selected live history through one Worker, records provenance and phase timings, proves cleanup, and enforces feedback budgets.

```sh
./scripts/pnpm.sh run test:pipeline
```
