# Escalation Event Sub-Process modes and precedence

This directory serves [PC-ESCALATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): interrupting and non-interrupting Escalation Event Sub-Processes (ESP), repeated handlers, the order in which ordinary and handler work end, and precedence against a boundary of the same host. The [order model](order-events.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. Nesting and rethrow are in [escalation-event-subprocess-nesting](../escalation-event-subprocess-nesting/README.md).

After a Parallel fork, four Sub-Process regions run side by side. Every handler leads to its own Human Task.

| Region | Ordinary work | Handlers |
|---|---|---|
| `Order` | `Process`, Intermediate throw `DELAY`, `Ship` | interrupting ESP `DELAY` |
| `Billing` | `Prepare`, two Intermediate throws `REMINDER` in a row, `Send` | non-interrupting ESP `REMINDER` |
| `Review` | `Inspect`, Intermediate throw `ALERT`, `Continue` | non-interrupting ESP exact `ALERT`; interrupting exact `ALERT` boundary on the Sub-Process |
| `Pack` | `Seal`, Intermediate throw `ALERT`, `Label` | non-interrupting catch-all ESP; interrupting exact `ALERT` boundary on the Sub-Process |

| Scenario | Case it exercises |
|---|---|
| [interrupting-handler](interrupting-handler.scenario.json) | The interrupting ESP raised mid-region, then completion of its handler. |
| [non-interrupting-ordinary-first](non-interrupting-ordinary-first.scenario.json) | Two handler instances open beside the ordinary work; the ordinary work completes first, then both handlers. |
| [non-interrupting-handlers-first](non-interrupting-handlers-first.scenario.json) | The same, with both handlers completing before the ordinary work. |
| [handler-against-boundary-same-code](handler-against-boundary-same-code.scenario.json) | An exact ESP and an exact boundary of the host with the same code. |
| [catch-all-handler-against-exact-boundary](catch-all-handler-against-exact-boundary.scenario.json) | A catch-all ESP and an exact boundary of the host that names the code. |

The schedules carry no expected route or Process state; the retained CIB evidence is the answer.
