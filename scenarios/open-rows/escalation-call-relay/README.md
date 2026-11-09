# Escalation relayed by a called Process's Event Sub-Process

This directory serves [PC-ESCALATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a called Process whose own Event Sub-Process (ESP) catches an Escalation and throws it again, a boundary of the Call Activity that names it, and the output mapping that the exceptional return may run more than once. The [relay model](relayed-claim.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. The plain Call cases are in [escalation-call-propagation](../escalation-call-propagation/README.md).

The caller runs the Call Activity `ReviewRelayed`, which maps `claim` in as `dossier` and `status` out as `relayedStatus`, with a non-interrupting exact `NEEDS_EXPERT` boundary leading to `ConsultRelayed`. The called Process runs the Human Task `ExamineRelayed`, an Intermediate throw `NEEDS_EXPERT` and the Human Task `ConcludeRelayed`, and declares a non-interrupting ESP for `NEEDS_EXPERT` whose body throws `NEEDS_EXPERT` again. The called instance is addressed by the kernel's derived called-instance identifier.

| Scenario | Case it exercises |
|---|---|
| [relayed-through-callee-handler](relayed-through-callee-handler.scenario.json) | `ExamineRelayed` sets `status` before the throw, which the called Process's ESP catches and throws again toward the Call's boundary. |

The schedule carries no expected route, mapped variable or Process state; the retained CIB evidence is the answer.
