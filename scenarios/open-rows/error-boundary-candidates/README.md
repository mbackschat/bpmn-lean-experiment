# Error boundary candidates on one host

This directory serves [PC-ERROR-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): which boundary of one Service Task catches a typed business failure when a host declares several candidates, and what a technical transport failure does beside them. The [payment model](charge-payment.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

The model charges a payment through three serial Service Tasks, each a delegated effect answered by `effectResult` stimuli. Every recovery boundary leads to its own Human Task, so the route taken is the open Human Task. Two separate `Error` declarations share the code `CARD_DECLINED`.

| Host | Candidate boundaries in document order |
|---|---|
| `AuthorizeCard` | exact `CARD_DECLINED`, then catch-all (no `errorRef`) |
| `CaptureFunds` | catch-all, then exact `CARD_DECLINED` through the second `Error` declaration |
| `NotifyBank` | two catch-alls |

| Scenario | Case it exercises |
|---|---|
| [authorize-exact-code](authorize-exact-code.scenario.json) | The code of the exact boundary reported where the exact boundary is declared first. |
| [authorize-other-code](authorize-other-code.scenario.json) | A code no exact boundary names, with the catch-all declared second. |
| [authorize-case-variant-code](authorize-case-variant-code.scenario.json) | A code that differs from the exact boundary's code only in letter case. |
| [capture-exact-code](capture-exact-code.scenario.json) | The shared code where the catch-all is declared first and the exact boundary uses the second declaration of that code. |
| [capture-other-code](capture-other-code.scenario.json) | A code no exact boundary names, with the catch-all declared first. |
| [notify-two-catch-alls](notify-two-catch-alls.scenario.json) | Two equal-precedence catch-alls, so only document order could separate them. |
| [authorize-technical-failure](authorize-technical-failure.scenario.json) | A technical failure of the host that declares both an exact boundary and a catch-all, with incidents enabled. |

The schedules carry no expected route, Process state or incident; the retained CIB evidence is the answer.
