# Compensation order and forward chronology

This directory serves [PC-COMPENSATION-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (invocation order, independent completion chronology versus dependency order) and the untargeted synchronous Intermediate throw of [PC-COMPENSATION-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). The [reverse-order model](reverse-order.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork, the Human Task `UserTask_BookA` leads to `UserTask_BookB` (B depends on A by Sequence Flow), `UserTask_BookC` is independent of both, and `UserTask_Clock` holds the clock open. Each of A, B and C has a Compensation Boundary Event associated with its own compensation Human Task (`UserTask_UndoA`, `UserTask_UndoB`, `UserTask_UndoC`). B and C converge on a Parallel join and an untargeted Intermediate Compensation throw, followed by `UserTask_After`. `UserTask_Clock` carries two non-interrupting Timer Boundary Events, `Boundary_Tick1` (`PT10S`) and `Boundary_Tick2` (`PT20S`); their only purpose is to give the engine clock distinct readings between completions: the retained runner moves its controlled clock only when a Timer fires, and the logical-time input on a stimulus (`at`) is neither realized by that runner nor admitted by a kernel host.

| Schedule | Forward completion order | Clock reading at each completion |
|---|---|---|
| [frozen-clock-a-b-c](frozen-clock-a-b-c.scenario.json) | A, B, C | none advanced |
| [frozen-clock-c-a-b](frozen-clock-c-a-b.scenario.json) | C, A, B | none advanced |
| [advancing-clock-a-b-c](advancing-clock-a-b-c.scenario.json) | A, B, C | A before `Boundary_Tick1` (0 ms), B after it (10 000 ms), C after `Boundary_Tick2` (20 000 ms) |
| [advancing-clock-c-a-b](advancing-clock-c-a-b.scenario.json) | C, A, B | C at 0 ms, A at 10 000 ms, B at 20 000 ms |
| [advancing-clock-a-c-b](advancing-clock-a-c-b.scenario.json) | A, C, B | A at 0 ms, C at 10 000 ms, B at 20 000 ms |

After the throw every schedule completes the three compensation Human Tasks in one fixed order (C, B, A), then `UserTask_After`, then `UserTask_Clock`, so the schedules differ only in the forward chronology. The pair of frozen-clock schedules and the three advancing-clock schedules separate dependency order (A before B) from completion chronology (where C falls relative to A and B).

The schedules carry no expected invocation order, open wait or Process state; the retained CIB evidence is the answer.
