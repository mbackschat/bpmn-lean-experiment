# Cancel events outside a Transaction and other Cancel placements

This directory serves [PC-TX-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and [PC-TX-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): Cancel End and Cancel Boundary Events placed where BPMN 2.0.2 does not allow them (§10.5.5, §10.3.5), where only one is allowed, or where the pair is incomplete. Each model is project-authored MIT source for the `cibseven-2.2.0` profile and each schedule is answer-free: CIB Seven `2.2.0` supplies the retained answer, whether it deploys the model, refuses it or fails inside a command.

| Schedule and model | Placement | Journey |
|---|---|---|
| [cancel-boundary-on-subprocess](cancel-boundary-on-subprocess.scenario.json), [model](cancel-boundary-on-subprocess.bpmn) | A Cancel Boundary Event on a plain Sub-Process | start only |
| [cancel-end-in-subprocess](cancel-end-in-subprocess.scenario.json), [model](cancel-end-in-subprocess.bpmn) | A Cancel End Event inside a plain Sub-Process | start only |
| [cancel-end-at-process-level](cancel-end-at-process-level.scenario.json), [model](cancel-end-at-process-level.bpmn) | A Cancel End Event directly in the Process | start only |
| [two-cancel-boundaries](two-cancel-boundaries.scenario.json), [model](two-cancel-boundaries.bpmn) | Two Cancel Boundary Events on one Transaction | start only |
| [non-interrupting-cancel-boundary](non-interrupting-cancel-boundary.scenario.json), [model](non-interrupting-cancel-boundary.bpmn) | A Cancel Boundary Event written `cancelActivity="false"` on a Transaction that runs `UserTask_Step` (compensation Human Task `UserTask_UndoStep`, then a Cancel End Event) beside `UserTask_Other`; the boundary leads to `UserTask_Cancelled` and the normal exit to `UserTask_Normal` | `UserTask_Step`, `UserTask_UndoStep`, `UserTask_Cancelled`, `UserTask_Other` and `UserTask_Normal` complete in that order |
| [cancel-end-without-boundary](cancel-end-without-boundary.scenario.json), [model](cancel-end-without-boundary.bpmn) | A Transaction with a Cancel End Event and no Cancel Boundary Event | `UserTask_Step` is completed twice |

The schedules carry no expected deployment outcome, command outcome or Process state; the retained CIB evidence is the answer.
