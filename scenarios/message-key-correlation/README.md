# Message key-correlation population scenarios

This directory holds the exact settlement-confirmation source and the answer-free engine-population inputs selected by the [Message key-correlation specification](../../docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md). Each Process instance starts and receives one directly addressed non-empty String payload before one definition-scoped correlated publication. The public publication contains no Process instance, Workflow, subscription, locator, selected target, expected outcome, or trace.

- [unique.population-scenario.json](unique.population-scenario.json) initializes two distinct references and publishes one of them.
- [zero.population-scenario.json](zero.population-scenario.json) publishes a third reference absent from both instances.
- [ambiguous.population-scenario.json](ambiguous.population-scenario.json) initializes both instances with the published reference.
- [cross-definition.population-scenario.json](cross-definition.population-scenario.json) initializes equal references under [the primary source](process.bpmn) and [a second definition](process-other-definition.bpmn) that changes only one optional human-readable name while preserving every relevant local id.

These inputs use the closed engine-population schema rather than widening the ordinary single-instance scenario or pipeline-case contracts. Lean, the TypeScript core, and Temporal are selected explicitly, while CIB is explicitly `null` under the classified `CIB-LIM-0002` boundary.
