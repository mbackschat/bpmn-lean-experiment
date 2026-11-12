# Multi-Instance mutable collections

Neutral inputs for [PC-MI-08](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (a collection changed while its Multi-Instance body runs: fixed entry total, sequential next-index re-read, rollback when the collection no longer reaches the next index). They are answer-free: the CIB Seven `2.2.0` evidence run supplies every expected result, and `standards-sequential-snapshot` runs under the `bpmn-2.0.2` profile in the kernel only. The item each instance received is observed without CIB-LIM-0019's own-input reads: a User Task nested in each Sub-Process instance publishes it as its `subject` input.

## Models

Each model is one embedded Sub-Process `SubProcess_Item` with Multi-Instance loop characteristics over the collection `items` with the element variable `item`, followed by the User Task `UserTask_Publish`. Inside each instance a None Start leads to the User Task `UserTask_Review`, whose input `subject` is `${item}`, and a None End.

| Model | Mode | Collection |
|---|---|---|
| [sequential](sequential.bpmn) | sequential | the variable `items` (`camunda:collection="items"`) |
| [sequential-expression](sequential-expression.bpmn) | sequential | the JUEL expression `${items}` |
| [parallel](parallel.bpmn) | parallel | the variable `items` |

## Schedules

Task completions address `UserTask_Review` by activation, one per begun instance in generation order.

| Schedule | Model | Journey | Row |
|---|---|---|---|
| [sequential-collection-grown](sequential-collection-grown.scenario.json) | sequential | `[a, b]` replaced by `[a, c, d]` during the first instance; the second instance's `subject` is `c`, and a third activation is completed though the entry total is two | PC-MI-08 |
| [sequential-collection-shrunk](sequential-collection-shrunk.scenario.json) | sequential | `[a, b]` replaced by `[a]` during the first instance, then the first completion | PC-MI-08 |
| [sequential-collection-removed](sequential-collection-removed.scenario.json) | sequential | `items` removed during the first instance, then both completions | PC-MI-08 |
| [sequential-collection-not-a-list](sequential-collection-not-a-list.scenario.json) | sequential | `items` replaced by the String `a` during the first instance, then the first completion | PC-MI-08 |
| [sequential-expression-grown](sequential-expression-grown.scenario.json) | sequential-expression | `[a, b]` replaced by `[a, g]` during the first instance; the second instance's `subject` is `g` | PC-MI-08, PC-MI-07 |
| [parallel-collection-replaced-after-entry](parallel-collection-replaced-after-entry.scenario.json) | parallel | `[a, b]` replaced by `[c, d]` after entry; the instances keep `a` and `b` | PC-MI-08 |
| [standards-sequential-snapshot](standards-sequential-snapshot.scenario.json) | the standards [sequential review](../../sequential-multi-instance/README.md) | under `bpmn-2.0.2`, kernel only: the collection `[contract, invoice, receipt]` replaced by `[contract, changed, added]` during the first instance; the second instance's input data item stays `invoice` | PC-MI-08 |
