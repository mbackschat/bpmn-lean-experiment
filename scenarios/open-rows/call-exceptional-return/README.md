# Exceptional Call return and caller interruption

This directory serves [PC-SCOPE-06](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a child Error or Escalation raised two Call levels down and routed to an ancestor, the mapped outputs at that exceptional return, the interruption of a Call tree by its caller, and a sibling Call and caller data around them. It also carries the witness for the reconciliation refusal `call.calledEventSubProcess` (a called Process with its own Event Sub-Process), which [the scopes semantics](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md) assign to this row. The [dispatch model](dispatch.bpmn) and the [handler model](book-with-handler.bpmn) are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. The one-level Error and Escalation cases are in [error-called-child](../error-called-child/README.md) and [escalation-call-propagation](../escalation-call-propagation/README.md).

## Dispatch model

The root `Process_Dispatch` starts with `priority`, then forks into two Calls:

| Call | Called Process | Mapping and boundaries |
|---|---|---|
| `Route` | `Process_Route` | in `priority`; out `carrier` as `carrier` and `slot` as `routeSlot`. Interrupting exact `NO_CARRIER` boundary to the Human Task `Reassign`; non-interrupting exact `SLOW_BOOKING` Escalation boundary to `NotifyDelay`; interrupting `PT10S` Timer boundary `Timeout` to `Expedite`. The normal return leads to `AfterRoute`. |
| `Spare` | `Process_Book` | out `slot` as `spareSlot`; the normal return leads to the Human Task `AfterSpare`. |

`Process_Route` runs the Human Task `Plan`, then the Call `Book` of `Process_Book` (out `slot` as `slot`; interrupting exact `NO_SLOT` boundary to the Human Task `Rebook`), then the Human Task `Confirm`. `Process_Book` runs the Human Task `Reserve`, whose completion writes `outcome` and `slot`, and an Exclusive Gateway on `outcome`: `noCarrier` ends in an Error End `NO_CARRIER`, `noSlot` in an Error End `NO_SLOT`, `late` throws the Escalation `SLOW_BOOKING` and then ends normally, and any other value ends normally. `Plan` writes `carrier`. Called instances are addressed by the kernel's derived identifier, nested for the `Book` instance under `Route`.

| Schedule | Case it exercises |
|---|---|
| [no-carrier-skips-nested-boundary](no-carrier-skips-nested-boundary.scenario.json) | `Plan` writes `carrier`, then the nested `Reserve` reports `noCarrier`, an Error that the `Book` boundary does not name and the `Route` boundary does; the `Spare` Call then runs. |
| [no-slot-caught-by-nearest-boundary](no-slot-caught-by-nearest-boundary.scenario.json) | The nested `Reserve` reports `noSlot`, which the `Book` boundary inside `Process_Route` names, and the route is completed from `Rebook`. |
| [slow-booking-escalation-two-levels](slow-booking-escalation-two-levels.scenario.json) | The nested `Reserve` reports `late`, an Escalation thrown two Call levels below the only boundary that names it. |
| [timer-interrupts-while-book-called](timer-interrupts-while-book-called.scenario.json) | `Plan` writes `carrier`, the `Route` Timer fires while the nested `Reserve` is open, that `Reserve` is completed late, and the sibling `Spare` Call then runs. |
| [timer-interrupts-after-book-returned](timer-interrupts-after-book-returned.scenario.json) | The nested Call returns with a booked slot, the `Route` Timer fires while `Confirm` is open, `Confirm` is completed late, and the `Spare` Call then runs. |
| [normal-return-baseline](normal-return-baseline.scenario.json) | Every Call returns normally, so the mapped outputs of both Calls and the continuation after each are available for comparison. |

## Handler model

The root `Process_Order` calls `Process_BookItem` (out `slot` as `slot`) with an interrupting exact `NO_STOCK` boundary to the Human Task `CallerHandlesStock`. The called Process runs `ReserveItem` and an Exclusive Gateway on `outcome` leading to an Error End `NO_STOCK` for `noStock`, and declares an interrupting Error Event Sub-Process for `NO_STOCK` whose body is the Human Task `Substitute`.

| Schedule | Case it exercises |
|---|---|
| [no-stock-handled-inside-child](no-stock-handled-inside-child.scenario.json) | `ReserveItem` reports `noStock`, an Error that both the called Process's Event Sub-Process and the caller's boundary name; `Substitute` and `AfterBook` follow. |
| [item-booked-normally](item-booked-normally.scenario.json) | `ReserveItem` reports a booked outcome and the Call returns normally. |

The schedules carry no expected route, mapped variable, open wait or Process state; the retained CIB evidence is the answer.
