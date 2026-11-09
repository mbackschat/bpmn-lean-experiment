# Escalation across Call Activities with output mapping

This directory serves [PC-ESCALATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): an Escalation raised inside a called instance and caught by a boundary of its Call Activity, the output mapping at that exceptional return, and which of ordinary or handler work ends first. The [intake model](claim-intake.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. The callee that relays the Escalation through its own handler is in [escalation-call-relay](../escalation-call-relay/README.md).

After a Parallel fork, two Call Activities run the Process `Process_ExamineClaim`, which runs the Human Task `Examine`, an Intermediate throw `NEEDS_EXPERT` and the Human Task `Conclude`. Each Call maps `claim` in as `dossier` and `status` out under its own name. `ReviewClaim` has a non-interrupting exact `NEEDS_EXPERT` boundary leading to `ConsultExpert`, and its normal return leads to `CloseReview`. `ReviewEscalated` has an interrupting exact `NEEDS_EXPERT` boundary leading to `TakeOver`. Children are addressed by the kernel's derived called-instance identifier.

| Scenario | Case it exercises |
|---|---|
| [non-interrupting-call-ordinary-first](non-interrupting-call-ordinary-first.scenario.json) | `Examine` sets `status` before the throw, then the called ordinary work completes while the handler is still open and sets `status` again. |
| [non-interrupting-call-handler-first](non-interrupting-call-handler-first.scenario.json) | The same, with the handler completing before the called ordinary work. |
| [interrupting-call](interrupting-call.scenario.json) | `Examine` sets `status` before the throw under the interrupting boundary. |

The schedules carry no expected route, mapped variable or Process state; the retained CIB evidence is the answer.
