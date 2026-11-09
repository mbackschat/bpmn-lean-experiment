# Terminate End inside called children

This directory serves [PC-TERMINATE-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a Terminate End inside a called instance, the caller's return and mapped output, other work of the called instance, a sibling Call of the same definition and caller work. The [pickup model](pickup.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. Terminate in Multi-Instance bodies is in [terminate-multi-instance-bodies](../terminate-multi-instance-bodies/README.md) and in Event Sub-Process instances in [terminate-event-subprocess-instances](../terminate-event-subprocess-instances/README.md).

After a Parallel fork, the root `Process_Pickup` runs two Calls of the one definition `Process_Handover`, `HandoverA` (out `receipt` as `receiptA`, followed by the Human Task `AfterA`) and `HandoverB` (out `receipt` as `receiptB`, followed by `AfterB`), and the Human Task `CallerOutside`. `Process_Handover` forks into the Human Task `Finish`, which leads to a Terminate End and writes `receipt`, the Human Task `Other`, the Service Task `Notify` (answered by `effectResult`) and the Receive Task `Ack` (message `handoverAcknowledged`). Called instances are addressed by the kernel's derived identifier.

| Schedule | Case it exercises |
|---|---|
| [terminate-one-call-sibling-survives](terminate-one-call-sibling-survives.scenario.json) | `Finish` completes in the first called instance; its `Other`, `Notify` and `Ack` are addressed afterwards, the second called instance's `Other` completes, then `AfterA` and `CallerOutside` complete. |
| [terminate-both-calls-reversed](terminate-both-calls-reversed.scenario.json) | `Finish` completes in the second called instance and then in the first, then `AfterB`, `AfterA` and `CallerOutside` complete. |

The schedules carry no expected open wait, mapped variable or Process state; the retained CIB evidence is the answer.
