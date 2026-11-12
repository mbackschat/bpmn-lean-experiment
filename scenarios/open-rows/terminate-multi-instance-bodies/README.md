# Terminate End inside Multi-Instance Sub-Process bodies

This directory serves [PC-TERMINATE-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a Terminate End inside one body of a parallel and of a sequential Multi-Instance Sub-Process, the other bodies, the completion of the Multi-Instance Activity and outside work. A Terminate inside a called instance is in [terminate-called-child](../terminate-called-child/README.md); a Terminate in a called body of a Multi-Instance Call is in [multi-instance-call-activity](../multi-instance-call-activity/README.md) (`parallel-child-endings`). The [packing model](packing.bpmn) and its [completion-condition variant](packing-completion.bpmn) are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork, the root `Process_Packing` runs the Human Task `Outside` and two Multi-Instance Sub-Processes, each followed by its own release Human Task. Start variables are the lists `parcels = [p1, p2]` and `batches = [b1, b2]`.

| Sub-Process | Mode | Body |
|---|---|---|
| `Parcels` | parallel, collection `parcels`, element `parcel` | Parallel fork into the Human Task `ParcelTrigger`, which leads to a Terminate End, and the Human Task `ParcelOther`; both publish `seenParcel`; then `AfterParcels` |
| `Batches` | sequential, collection `batches`, element `batch` | the same body with `BatchTrigger`, `BatchOther` and `seenBatch`; then `AfterBatches` |

[packing-completion.bpmn](packing-completion.bpmn) is the same model with the completion condition `${nrOfCompletedInstances >= 1}` on both loops, so a terminated instance separates being counted as completed, which ends the loop, from being counted as terminated, which does not ([scopes semantics](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#pc-terminate-02-terminate-inside-called-children-multi-instance-bodies-and-event-sub-process-instances)).

Inner tasks are addressed by activation, counted per begun inner instance in generation order.

| Schedule | Case it exercises |
|---|---|
| [parallel-first-body-terminates](parallel-first-body-terminates.scenario.json) | `ParcelTrigger` of body 1 completes, `ParcelOther` of body 1 is addressed afterwards, then body 2's `ParcelOther` and `ParcelTrigger` complete, followed by `AfterParcels` and `Outside`. |
| [parallel-second-body-terminates](parallel-second-body-terminates.scenario.json) | `ParcelTrigger` of body 2 completes first, `ParcelOther` of body 2 is addressed afterwards, then body 1's `ParcelOther` and `ParcelTrigger` complete, followed by `AfterParcels`. |
| [sequential-first-body-terminates](sequential-first-body-terminates.scenario.json) | `BatchTrigger` of body 1 completes, `BatchOther` of body 1 is addressed afterwards, then body 2's `BatchOther` and `BatchTrigger` complete, followed by `AfterBatches` and `Outside`. |
| [parallel-first-body-completes-loop](parallel-first-body-completes-loop.scenario.json) | The schedule of *parallel-first-body-terminates* on [packing-completion](packing-completion.bpmn): `ParcelTrigger` of body 1 completes, then body 1's `ParcelOther`, body 2's `ParcelOther` and `ParcelTrigger`, `AfterParcels` and `Outside` are addressed. |
| [sequential-first-body-completes-loop](sequential-first-body-completes-loop.scenario.json) | The schedule of *sequential-first-body-terminates* on [packing-completion](packing-completion.bpmn). |

The schedules carry no expected open wait, body count or Process state; the retained CIB evidence is the answer.
