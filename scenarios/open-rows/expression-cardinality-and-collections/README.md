# Multi-Instance collection and cardinality expression probes

Answer-free schedules for the collection, cardinality and count half of [PC-DATA-08](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) ("list extraction, integer count ... invalid-count and evaluation-error outcomes explicit") and the wrong-result-type cases of [PC-DATA-09](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). The forms a Multi-Instance wrapper takes in the plain case are witnessed by [multi-instance-expressions](../multi-instance-expressions/README.md) (collection property of a Map, computed cardinality, String collection), [multi-instance-user-task](../multi-instance-user-task/README.md) (completion predicates, among them the initially true one and the non-Boolean one) and [multi-instance-sub-process](../multi-instance-sub-process/README.md) (a malformed computed cardinality); this directory adds the forms they leave open. The core level of the [evaluation decision](../../../docs/kernel/ARCHITECTURE-SPEC.md#runtime-state-and-step) owns the subset and the Multi-Instance level (M5) adds the counters; the [data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md) own the context rule. The retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay.

[expression-probes.bpmn](expression-probes.bpmn) holds one parallel Multi-Instance User Task per probe behind an Exclusive Gateway whose JUEL conditions test the start variable `probe`; all branches merge before the End Event. A cardinality probe declares `loopCardinality` with its expression, a collection probe declares `camunda:collection` with its expression and the element variable `item`. Each body publishes `position` (`${loopCounter}`), `instances` (`${nrOfInstances}`) and, for a collection probe, `subject` (`${item}`) as its task inputs. Every schedule has one stimulus, the start with its `probe` and the one or two variables its expression reads, so the observation is the set of bodies the wrapper opens, or the failure of the starting command.

| Schedule | Model | Case it separates | Row |
|---|---|---|---|
| [size-method](size-method.scenario.json) | [expression-probes](expression-probes.bpmn) | A cardinality that is a method call on a List. | PC-DATA-08, PC-MI-07 |
| [structured-count](structured-count.scenario.json) | [expression-probes](expression-probes.bpmn) | A cardinality that is a property of a Map variable. | PC-DATA-08, PC-MI-07 |
| [numeric-text-count](numeric-text-count.scenario.json) | [expression-probes](expression-probes.bpmn) | A cardinality variable holding the String `2`. | PC-DATA-08, PC-DATA-09 |
| [non-numeric-text-count](non-numeric-text-count.scenario.json) | [expression-probes](expression-probes.bpmn) | A cardinality variable holding the String `two`. | PC-DATA-08, PC-DATA-09 |
| [boolean-count](boolean-count.scenario.json) | [expression-probes](expression-probes.bpmn) | A cardinality variable holding a Boolean. | PC-DATA-08, PC-DATA-09 |
| [negative-computed-count](negative-computed-count.scenario.json) | [expression-probes](expression-probes.bpmn) | A computed cardinality below zero. | PC-DATA-08, PC-DATA-09 |
| [fractional-computed-count](fractional-computed-count.scenario.json) | [expression-probes](expression-probes.bpmn) | A computed cardinality that is a Double with a fraction. | PC-DATA-08, PC-DATA-09 |
| [null-count](null-count.scenario.json) | [expression-probes](expression-probes.bpmn) | A cardinality variable holding a present Null. | PC-DATA-08, PC-DATA-09 |
| [nested-list-collection](nested-list-collection.scenario.json) | [expression-probes](expression-probes.bpmn) | A collection that is a List nested in a List of Maps. | PC-DATA-08, PC-MI-07 |
| [map-collection](map-collection.scenario.json) | [expression-probes](expression-probes.bpmn) | A collection expression that evaluates to a Map. | PC-DATA-08, PC-DATA-09 |
| [null-collection](null-collection.scenario.json) | [expression-probes](expression-probes.bpmn) | A collection variable holding a present Null. | PC-DATA-08, PC-DATA-09 |

Notes for the target runners:

- Gap: List start values.
- Gap: Map start values.
- Gap: List and Map start values.
- A Multi-Instance step that fails inside the starting command must be recorded as the command outcome rather than as a harness failure.
- `asyncBefore` is not declared on any loop, which the kernel reader refuses.
