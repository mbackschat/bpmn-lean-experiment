# Error Event Sub-Process matching and precedence

This directory serves [PC-ERROR-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): interrupting Error Event Sub-Process (ESP) matching by exact code and catch-all, precedence against another ESP and against a boundary of the same host, and nesting. The [shipment model](shipment-exceptions.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork, four Sub-Process regions run side by side. In each, a Service Task answered by `effectResult` is the thrower, every handler is an interrupting Error ESP with `isInterrupting="true"` (or a boundary) that leads to its own Human Task, and the route taken is the open Human Task.

| Region | Thrower | Handlers of the region in document order |
|---|---|---|
| `Customs` | `ClearCustoms` | ESP catch-all, then ESP exact `CUSTOMS_HOLD` |
| `Freight` | `BookFreight` | ESP exact `FREIGHT_FULL`, then ESP catch-all |
| `Billing` | `Invoice` | ESP catch-all inside the Sub-Process, and an exact `BILLING_DISPUTE` boundary on the Sub-Process |
| `OuterGate` ⊃ `InnerGate` | `ScreenParcel` | inner ESP exact `INNER_BREACH`; outer ESP exact `OUTER_BREACH` |

| Scenario | Case it exercises |
|---|---|
| [customs-exact-code-catch-all-first](customs-exact-code-catch-all-first.scenario.json) | The exact code where the catch-all ESP is declared first. |
| [customs-other-code-catch-all-first](customs-other-code-catch-all-first.scenario.json) | A code no exact ESP names, with the catch-all ESP declared first. |
| [freight-exact-code-exact-first](freight-exact-code-exact-first.scenario.json) | The exact code where the exact ESP is declared first. |
| [freight-other-code-exact-first](freight-other-code-exact-first.scenario.json) | A code no exact ESP names, with the exact ESP declared first. |
| [billing-catch-all-handler-against-exact-boundary](billing-catch-all-handler-against-exact-boundary.scenario.json) | A code that a boundary of the host names exactly while a catch-all ESP inside the host also catches it. |
| [nested-outer-handler](nested-outer-handler.scenario.json) | A code only the outer ESP names, thrown inside an inner Sub-Process that has an ESP for another code. |
| [nested-inner-handler](nested-inner-handler.scenario.json) | The code the inner ESP names. |

The schedules carry no expected route or Process state; the retained CIB evidence is the answer.
