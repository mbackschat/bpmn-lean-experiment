# Signal throws with literal names

This directory serves [PC-SIGNAL-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a modeled Intermediate Signal throw and a Signal End with literal names, observed through receivers of the same Process instance. The [order model](order-signals.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork, four branches run. `Dispatch` leads into the Intermediate throw `order-shipped`, then the Human Task `Close`, then the Signal End `order-closed`. Three branches wait in an Intermediate Signal catch: `order-shipped` leading to `Notify`, `order-cancelled` leading to `Refund`, and `order-closed` leading to `Archive`.

| Scenario | Case it exercises |
|---|---|
| [intermediate-throw](intermediate-throw.scenario.json) | The Intermediate throw, with receivers of the thrown name and of another name waiting. |
| [signal-end](signal-end.scenario.json) | The Intermediate throw, then the Signal End. |
| [throw-interrupts-own-region](throw-interrupts-own-region.scenario.json) | On [self-interrupting-throw](self-interrupting-throw.bpmn): inside the Sub-Process `Region`, completing `Prepare` reaches the Intermediate throw `stop-region`, whose own instance's interrupting Signal boundary on `Region` fires first, so the throw's own completion is dropped, `AfterThrow` never opens and `Stopped` completes the instance. CIB is predicted to answer the same: `ThrowSignalEventActivityBehavior` notifies the receivers before it leaves the throw, and the interrupted thrower then has nothing to leave. |

The schedules carry no expected route or Process state; the retained CIB evidence is the answer. A throw's broadcast intent itself is not observable in CIB beyond its receivers.
