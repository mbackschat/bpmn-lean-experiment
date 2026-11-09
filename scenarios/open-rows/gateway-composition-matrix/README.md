# Cross-gateway composition matrix cells

Answer-free schedules for two cells of the [PC-CF-08](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) matrix that no other directory holds: Exclusive within Parallel, and Parallel within Inclusive. The remaining cells have their witnesses elsewhere: Inclusive after a Sub-Process, a Call and a Multi-Instance body, and Inclusive loop re-entry in [inclusive-join-compositions](../inclusive-join-compositions/README.md), and Event-Based within Parallel in [event-race-compositions](../event-race-compositions/README.md) ([parallel-race](../event-race-compositions/parallel-race.bpmn)). The [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay; conditions are JUEL over Boolean start variables.

## Models

| Model | What it holds |
|---|---|
| [exclusive-in-parallel](exclusive-in-parallel.bpmn) | A Parallel fork over a branch with the Choice *Choose packing* (`${express}`, default) merged again by an Exclusive Gateway, and the User Task *Print invoice*; one join before *Ship*. |
| [parallel-in-inclusive](parallel-in-inclusive.bpmn) | An Inclusive split with the conditioned candidates `${gift}` and `${insured}` and a default; the gift branch holds a closed Parallel block over *Wrap gift* and *Add card*, and all three branches meet at an Inclusive join before *Dispatch*. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [express-pack-first](exclusive-in-parallel-express-pack-first.scenario.json) | exclusive-in-parallel | The first candidate holds; the Choice branch completes before the sibling. |
| [standard-print-first](exclusive-in-parallel-standard-print-first.scenario.json) | exclusive-in-parallel | The default is taken; the sibling completes before the Choice branch. |
| [gift-and-insured](parallel-in-inclusive-gift-and-insured.scenario.json) | parallel-in-inclusive | Both conditioned candidates hold; the Parallel block completes before the insurance task. |
| [gift-only](parallel-in-inclusive-gift-only.scenario.json) | parallel-in-inclusive | Only the gift candidate holds; the Parallel block's tasks complete in reverse declaration order. |

The schedules carry no expected route or state; the retained CIB evidence is the answer.
