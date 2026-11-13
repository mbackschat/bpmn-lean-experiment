# Error Event Sub-Process matching and precedence

This directory serves [PC-ERROR-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): interrupting Error Event Sub-Process (ESP) matching by exact code and catch-all, precedence against another ESP and against a boundary of the same host, and nesting. The [shipment model](shipment-exceptions.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork, four Sub-Process regions run side by side. In each, a Service Task answered by `effectResult` is the thrower, every handler is an interrupting Error ESP with `isInterrupting="true"` (or a boundary) that leads to its own Human Task, and the route taken is the open Human Task.

| Region | Thrower | Handlers of the region in document order |
|---|---|---|
| `Customs` | `ClearCustoms` | ESP catch-all, then ESP exact `CUSTOMS_HOLD` |
| `Freight` | `BookFreight` | ESP exact `FREIGHT_FULL`, then ESP catch-all |
| `Billing` | `Invoice` | ESP catch-all inside the Sub-Process, and an exact `BILLING_DISPUTE` boundary on the Sub-Process |
| `OuterGate` ⊃ `InnerGate` | `ScreenParcel` | inner ESP exact `INNER_BREACH`; outer ESP exact `OUTER_BREACH` |

Two further models hold the Error Event Sub-Processes in the process scope, each a pair, and end the process in the Error End Event `EndEvent_Fault` that throws the code `E1` after the Human Task `Pack`. Each handler leads to its own Human Task, `Review_First` and `Review_Second`.

| Model | Handlers in document order |
|---|---|
| [duplicate-code](duplicate-code.bpmn) | ESP `Handler_First` exact `E1`, then ESP `Handler_Second` exact `E1`, both naming the one Error `Error_Fault` |
| [two-catch-alls](two-catch-alls.bpmn) | ESP `Handler_First` catch-all, then ESP `Handler_Second` catch-all |

| Scenario | Case it exercises |
|---|---|
| [customs-exact-code-catch-all-first](customs-exact-code-catch-all-first.scenario.json) | The exact code where the catch-all ESP is declared first. |
| [customs-other-code-catch-all-first](customs-other-code-catch-all-first.scenario.json) | A code no exact ESP names, with the catch-all ESP declared first. |
| [freight-exact-code-exact-first](freight-exact-code-exact-first.scenario.json) | The exact code where the exact ESP is declared first. |
| [freight-other-code-exact-first](freight-other-code-exact-first.scenario.json) | A code no exact ESP names, with the exact ESP declared first. |
| [billing-catch-all-handler-against-exact-boundary](billing-catch-all-handler-against-exact-boundary.scenario.json) | A code that a boundary of the host names exactly while a catch-all ESP inside the host also catches it. |
| [nested-outer-handler](nested-outer-handler.scenario.json) | A code only the outer ESP names, thrown inside an inner Sub-Process that has an ESP for another code. |
| [nested-inner-handler](nested-inner-handler.scenario.json) | The code the inner ESP names. |
| [duplicate-code-handlers](duplicate-code-handlers.scenario.json) | `duplicate-code` under `cibseven-2.2.0`: `Pack` is completed, which throws `E1` toward two ESPs of one scope that name it. Separates a deployment that refuses two interrupting Error ESPs of one code from one that accepts them and lets the first in document order catch. The retained CIB evidence commits and leaves `Review_First` open, where the kernel refuses the model; the first difference is `trace[0].outcome`, owned by [CIB-LIM-0025](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-lim-0025--cib-admits-two-interrupting-error-event-sub-processes-of-one-code-in-one-scope). |
| [duplicate-code-handlers-standards](duplicate-code-handlers-standards.scenario.json) | The same model and journey under `bpmn-2.0.2`. The standards profile refuses every interrupting Event Sub-Process before the subscriptions are admitted (`profile.abnormalScopeEnd.withoutOutflow`), so no standards run can reach `scope.eventSubProcess.errorDuplicateCode` with an interrupting ESP. The retained CIB evidence commits and leaves `Review_First` open, where the standards profile refuses the model; the first difference is `trace[0].outcome`, owned by [CIB-INT-0007](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-int-0007--a-sub-process-left-abnormally-completes-normally). |
| [two-catch-alls-document-order](two-catch-alls-document-order.scenario.json) | `two-catch-alls` under `cibseven-2.2.0`: `Pack` is completed, which throws `E1` toward two catch-all ESPs of one scope. Separates the first in document order catching ([CIB-INT-0010](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-int-0010--at-one-catching-scope-an-event-sub-process-precedes-a-boundary-and-an-exact-code-precedes-a-catch-all)) from the second or both. The retained CIB evidence leaves `Review_First` open, the first in document order, and the disagreement ledger holds no entry for it. |

The schedules carry no expected route or Process state; the retained CIB evidence is the answer.
