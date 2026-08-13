# Differential comparator

`@bpmn-lean/differential` compares already-canonical scenario results without accessing engines, Temporal, files, or databases. It deliberately contains no target-specific semantic repair.

The caller declares one reference result and one or more candidates. The comparator requires exact outcome and trace equality and returns the first typed disagreement: scenario outcome, trace length, observation kind, or observation value with its structural path.

CIB Seven is the declared reference for draft CIB compatibility profiles. A standards-only profile may instead declare Lean as its reference and omit CIB entirely; target membership is explicit per case. This is not majority voting and does not make either an implementation or a target count normative for BPMN conformance.

Run the pure comparator gate:

```sh
./scripts/pnpm.sh run test:differential
```

The complete pipeline derives every semantic case and target relation from the guarded artifact catalogs, batches them through one Lean result emitter and the semantic core, and runs two isolated Temporal executions per case. Only cases that declare CIB additionally run through release-grouped CIB Seven engines and compare content-bound retained evidence; each concurrent CIB batch owns a distinct Maven output directory, and pipeline cleanup waits for every parallel lane to settle before removing shared temporary state. Standards-only cases, including the bounded Inclusive Gateway, Event-Based Gateway, Call Activity, resumption-bounded User Task cycle, Message Start, Terminate End, and configured Task profiles, explicitly omit CIB. The cycle case traverses both reviewed back-edges, reaches activation ordinals 1 through 3, exits through the default, and carries an activation-reset mutation. The Message Start case carries the complete operation-addressed trigger and locks both the supplied semantic instance identity and exact Interface Operation scenario binding without adding a channel observation. The Terminate End cases distinguish containing-scope termination from premature root completion, incomplete sibling cancellation, and state drift after stale-command refusal. The configured Task case rejects effect pass-through by detecting the premature exposure of its trailing User Task. The Boolean completion case runs CIB Seven, Lean, the core, and both Temporal executions with exact-semantic comparison and makes Boolean-to-string conversion disagree at the final binding. The incident cancellation case likewise uses all four targets, requires Retry-before-Cancel publication, preserved Process data, positive CIB external-termination history, and a typed cancelled state with no live work. Its Temporal target additionally proves that a distinct post-terminal command returns `processClosed` with the retained cancelled receipt; this adapter lifecycle result is verified separately from canonical semantic equality. The pipeline checks Query/Update and committed-state-derived Timer results, requires every registered case to carry a meaningful seeded semantic mutation, replays every catalog-selected live history through one Worker, records provenance and phase timings, proves cleanup, and enforces feedback budgets.

```sh
./scripts/pnpm.sh run test:pipeline
```
