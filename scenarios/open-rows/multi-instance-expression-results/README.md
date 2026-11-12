# Multi-Instance expression results

Neutral inputs for the collection, cardinality and completion half of [PC-DATA-08](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and the wrong-result-type cases of [PC-DATA-09](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), with the expression parts of PC-MI-07 and PC-MI-09. They separate the count, collection and counter rules of the [Multi-Instance level](../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#multi-instance-level). They are answer-free: the CIB Seven `2.2.0` evidence run supplies every expected result, and no schedule states one. Every scenario uses the `cibseven-2.2.0` profile with the neutral delegate-expression effect handler of the [Service Task effect scenario](../../service-task-effect/README.md).

The earlier [expression-cardinality-and-collections](../expression-cardinality-and-collections/README.md) probes read `${loopCounter}`, `${nrOfInstances}` and `${item}` in the Activity's own input mappings. CIB evaluates those mappings against the parent variable scope (`IoParameter#execute`), so it rolls the start back whatever the count. These models therefore declare no `camunda:inputOutput` mapping at all. Each is one Service Task `ServiceTask_Notify` with Multi-Instance loop characteristics and `camunda:asyncBefore="true"` on the loop, followed by the User Task `UserTask_Close`, as in the [Multi-Instance Service Task witnesses](../multi-instance-service-task/README.md). Each body's effect is a wait answered by an `effectResult` stimulus, and effect results are addressed by activation in generation order. A schedule whose start is expected to fail carries only the start, so the observation is whether the starting command commits.

## Models

| Model | Mode | Loop |
|---|---|---|
| [cardinality-variable](cardinality-variable.bpmn) | parallel | `loopCardinality` `${count}` |
| [cardinality-computed](cardinality-computed.bpmn) | parallel | `loopCardinality` `${count - 5}` |
| [cardinality-padded-literal](cardinality-padded-literal.bpmn) | parallel | `loopCardinality` with the literal body ` 2 `, spaces kept |
| [collection-variable](collection-variable.bpmn) | parallel | `loopDataInputRef` `DataInput_Recipients`, item `recipient` (the CIB-INT-0014 binding) |
| [collection-expression](collection-expression.bpmn) | parallel | `camunda:collection` `${order.lines}`, item `line` from the `inputDataItem` name |
| [collection-braces](collection-braces.bpmn) | parallel | `camunda:collection` `{items}`, which contains `{` but no `${`, item `item` |
| [completion-reads-instance](completion-reads-instance.bpmn) | parallel | collection as in collection-variable; completion `${recipient == stopItem \|\| loopCounter == stopIndex}` |
| [sequential-active-count](sequential-active-count.bpmn), [parallel-active-count](parallel-active-count.bpmn) | sequential, parallel | collection as in collection-variable; completion `${nrOfActiveInstances == active && nrOfInstances == total}` |
| [completion-reads-result-parallel](completion-reads-result-parallel.bpmn), [completion-reads-result-sequential](completion-reads-result-sequential.bpmn) | parallel, sequential | collection as in collection-variable; completion `${delivered}`, a value of the instance's own effect result |
| [completion-counter-equals](completion-counter-equals.bpmn) | parallel | collection as in collection-variable; completion `${loopCounter.equals(0)}`, an `Integer` counter against a `Long` literal |
| [cardinality-plain-literal](cardinality-plain-literal.bpmn) | parallel | `loopCardinality` with the literal body `3` |
| [cardinality-cdata-wrapped](cardinality-cdata-wrapped.bpmn) | parallel | `loopCardinality` whose CDATA `${count}` is wrapped in single spaces outside the section |
| [cardinality-whitespace-only](cardinality-whitespace-only.bpmn) | parallel | `loopCardinality` whose body is three spaces |
| [cardinality-boolean-expression](cardinality-boolean-expression.bpmn) | parallel | `loopCardinality` `${count > 1}` |
| [cardinality-decimal-sum](cardinality-decimal-sum.bpmn) | parallel | `loopCardinality` `${count + 0}` |
| [cardinality-decimal-exponent](cardinality-decimal-exponent.bpmn) | parallel | `loopCardinality` `${count * '1e1'}` |
| [cardinality-product-over-safe](cardinality-product-over-safe.bpmn) | parallel | `loopCardinality` `${count * count}` |

## Schedules

| Schedule | Model | Case it separates | Row |
|---|---|---|---|
| [count-text](count-text.scenario.json) | cardinality-variable | `count` is the String `2`; both results, then the close task | PC-DATA-08, PC-DATA-09 |
| [count-text-signed](count-text-signed.scenario.json) | cardinality-variable | `count` is the String `+2` | PC-DATA-09 |
| [count-text-padded](count-text-padded.scenario.json) | cardinality-variable | `count` is the String ` 2` | PC-DATA-09 |
| [count-text-negative](count-text-negative.scenario.json) | cardinality-variable | `count` is the String `-1` | PC-DATA-08, PC-DATA-09 |
| [count-text-over-int](count-text-over-int.scenario.json) | cardinality-variable | `count` is the String `2147483648` | PC-DATA-09 |
| [count-decimal-integral](count-decimal-integral.scenario.json) | cardinality-variable | `count` is the Decimal `2` | PC-DATA-08, PC-DATA-09 |
| [count-decimal-fractional](count-decimal-fractional.scenario.json) | cardinality-variable | `count` is the Decimal `2.5`; both results, then the close task | PC-DATA-09 |
| [count-decimal-negative](count-decimal-negative.scenario.json) | cardinality-variable | `count` is the Decimal `-2` | PC-DATA-09 |
| [count-integer-over-int](count-integer-over-int.scenario.json) | cardinality-variable | `count` is the Integer `4294967298`; both results, then the close task | PC-DATA-09 |
| [count-boolean](count-boolean.scenario.json) | cardinality-variable | `count` is a Boolean | PC-DATA-09 |
| [count-null](count-null.scenario.json) | cardinality-variable | `count` is a present Null | PC-DATA-09 |
| [count-map](count-map.scenario.json) | cardinality-variable | `count` is a Map | PC-DATA-09 |
| [count-absent](count-absent.scenario.json) | cardinality-variable | no `count` variable | PC-DATA-09 |
| [count-computed-negative](count-computed-negative.scenario.json) | cardinality-computed | `count = 3`, so the count is computed below zero | PC-DATA-08, PC-DATA-09 |
| [count-padded-literal](count-padded-literal.scenario.json) | cardinality-padded-literal | the untrimmed literal body | PC-DATA-08 |
| [collection-variable-map](collection-variable-map.scenario.json) | collection-variable | the collection variable is a Map | PC-DATA-09 |
| [collection-variable-text](collection-variable-text.scenario.json) | collection-variable | the collection variable is a String | PC-DATA-09 |
| [collection-variable-integer](collection-variable-integer.scenario.json) | collection-variable | the collection variable is an Integer | PC-DATA-09 |
| [collection-variable-null](collection-variable-null.scenario.json) | collection-variable | the collection variable is a present Null | PC-DATA-09 |
| [collection-variable-absent](collection-variable-absent.scenario.json) | collection-variable | no collection variable | PC-DATA-09 |
| [collection-expression-list](collection-expression-list.scenario.json) | collection-expression | `order.lines` is a List of two Strings; both results, then the close task | PC-DATA-08 |
| [collection-expression-map](collection-expression-map.scenario.json) | collection-expression | `order.lines` is a Map | PC-DATA-09 |
| [collection-expression-text](collection-expression-text.scenario.json) | collection-expression | `order.lines` is a String | PC-DATA-09 |
| [collection-expression-absent-key](collection-expression-absent-key.scenario.json) | collection-expression | `order` has no `lines` key, so the expression is null | PC-DATA-09 |
| [collection-expression-absent-variable](collection-expression-absent-variable.scenario.json) | collection-expression | no `order` variable | PC-DATA-09 |
| [collection-braces](collection-braces.scenario.json) | collection-braces | `items` is a List of two Strings and the attribute reads as text | PC-DATA-09 |
| [completion-reads-item](completion-reads-item.scenario.json) | completion-reads-instance | `stopItem = b`, `stopIndex = 9`; results 1 and 2, then body 3's result is sent | PC-DATA-08, PC-MI-09 |
| [completion-reads-counter](completion-reads-counter.scenario.json) | completion-reads-instance | `stopItem = none`, `stopIndex = 2`; result 3, then body 1's result is sent | PC-DATA-08, PC-MI-09 |
| [sequential-active-count](sequential-active-count.scenario.json) | sequential-active-count | `active = 1`, `total = 3`; result 1, then body 2's result is sent | PC-DATA-08, PC-MI-09 |
| [parallel-active-count](parallel-active-count.scenario.json) | parallel-active-count | `active = 2`, `total = 3`; result 1, then body 2's result is sent | PC-DATA-08, PC-MI-09 |
| [completion-reads-result-parallel](completion-reads-result-parallel.scenario.json) | completion-reads-result-parallel | result 1 with `delivered = false`, result 2 with `delivered = true`, then body 3's result is sent | PC-DATA-08, PC-MI-09 |
| [completion-reads-result-sequential](completion-reads-result-sequential.scenario.json) | completion-reads-result-sequential | the same schedule in sequential mode | PC-DATA-08, PC-MI-09 |
| [completion-counter-equals](completion-counter-equals.scenario.json) | completion-counter-equals | two items; result 1, then result 2 | PC-DATA-08, PC-MI-09 |
| [count-plain-literal](count-plain-literal.scenario.json) | cardinality-plain-literal | three results, then the close task | PC-DATA-08, PC-MI-07 |
| [count-cdata-wrapped](count-cdata-wrapped.scenario.json) | cardinality-cdata-wrapped | `count = 2`; the start only | PC-DATA-08, PC-DATA-09 |
| [count-whitespace-only](count-whitespace-only.scenario.json) | cardinality-whitespace-only | the start only | PC-DATA-08, PC-DATA-09 |
| [count-boolean-expression](count-boolean-expression.scenario.json) | cardinality-boolean-expression | `count = 2`, so the count is the Boolean result of a comparison. Predicted CIB answer: the start fails as in [count-boolean](count-boolean.scenario.json), since a Boolean is no number or numeric text. | PC-DATA-08, PC-DATA-09 |
| [count-decimal-sum](count-decimal-sum.scenario.json) | cardinality-decimal-sum | `count` is the Decimal `2`, so the count is the Decimal result of a sum; both results, then the close task. Predicted CIB answer: two instances, as in [count-decimal-integral](count-decimal-integral.scenario.json), since a `BigDecimal` is a `Number` read by `intValue`. | PC-DATA-08, PC-DATA-09 |
| [count-decimal-exponent](count-decimal-exponent.scenario.json) | cardinality-decimal-exponent | `count` is the Decimal `0`, so the count is a Decimal product whose scale is negative; the close task follows at once. Predicted CIB answer: no instance, then the close task, since the product is the `BigDecimal` `0E+1`, whose `intValue` is 0. | PC-DATA-08, PC-DATA-09 |
| [count-product-over-safe](count-product-over-safe.scenario.json) | cardinality-product-over-safe | `count = 100000000`, so the count is an Integer product above 2^53-1. Predicted CIB answer: a `Long` of 10^16 read by `intValue`, which wraps to an Int-range number the kernel does not decide. CIB attempts that count, 1,874,919,424 instances; alone this run breaches a resource bound of the hosted runner, whichever it reaches first: the 30 s CIB batch deadline (Verify run 43073432420, `CIB_SCENARIO_DEADLINE_EXCEEDED`) or the JVM heap (run 43235878488, `CIB_SCENARIO_HEAP_EXHAUSTED`); either way it ends as a harness failure and no CIB answer is retained. | PC-DATA-08, PC-DATA-09 |

After a schedule's last effect result comes the close task. A result sent to a body that no longer runs is a discriminator: CIB rejects it when the condition has closed the Activity, and accepts it otherwise. The kernel reader refuses the two whitespace models (`source.loopBodyWhitespace`), because the parser it uses drops the whitespace-only text nodes CIB keeps; their CIB answer records what that text evaluates to.
