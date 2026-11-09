# Transaction success, Cancel and Error paths

This directory serves [PC-TX-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the ordinary successful Transaction path, the distinctions between normal completion, Cancel End and Error End, and the retention of a completed Transaction for a later Compensation throw. The [booking model](booking.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. Selected `method` metadata is in [transaction-methods](../transaction-methods/README.md).

## Model

The Transaction `Transaction_Booking` runs the Human Tasks `UserTask_Flight` (compensation Human Task `UserTask_UndoFlight`, whose input `seenFlight` reads `flight`) and `UserTask_Hotel` (handler `UserTask_UndoHotel`), then an Exclusive Gateway on the start variable `outcome`: `cancel` reaches a Cancel End Event, `error` reaches an Error End Event with the code `BOOKING_FAILED`, and any other value reaches a None End Event. The Transaction has a Cancel Boundary Event leading to `UserTask_Cancelled` and an Error Boundary Event for `BOOKING_FAILED` leading to `UserTask_ErrorHandled`. Its normal exit leads to `UserTask_Confirm`, an untargeted Intermediate Compensation throw at the Process level and `UserTask_After`. The Process starts with `flight = f0`.

## Schedules

| Schedule | `outcome` | Journey |
|---|---|---|
| [success-then-outer-throw](success-then-outer-throw.scenario.json) | `ok` | `UserTask_Flight` completes writing `flight`, `UserTask_Hotel` completes, then `UserTask_Confirm`, both handlers and `UserTask_After`. |
| [cancel-end](cancel-end.scenario.json) | `cancel` | The two tasks complete, then the Hotel handler, `UserTask_Cancelled` (attempted early), the Flight handler and `UserTask_Cancelled` again. |
| [error-end](error-end.scenario.json) | `error` | The two tasks complete, the Flight and Hotel handlers are addressed, then `UserTask_ErrorHandled`. |

The schedules carry no expected open wait, retained record or Process state; the retained CIB evidence is the answer.
