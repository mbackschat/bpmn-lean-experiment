# Addressless Receive Task compositions

Answer-free schedules for [PC-HUM-06](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a Receive Task that names no Message, resumed only by an explicit delivery naming its published occurrence, in repeated, embedded and both Multi-Instance placements. The [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. They extend the root witness [addressless Receive Task](../../addressless-receive-task/README.md). The profile is `cibseven-2.2.0` with no source overlay.

[scan-handover.bpmn](scan-handover.bpmn) waits at the addressless Receive Task *Await scan*, lets the User Task *Check scan* send the parcel back to the wait through a JUEL condition on `again`, and then waits at *Await signature*, an addressless Receive Task inside the Sub-Process *Handover*.

| Schedule | Case it separates |
|---|---|
| [scan-repeated-and-embedded](scan-repeated-and-embedded.scenario.json) | A second activation of the repeated wait, then the wait inside the Sub-Process, each resumed by its own occurrence. |
| [scan-stale-and-wrong-occurrence](scan-stale-and-wrong-occurrence.scenario.json) | Deliveries to the completed occurrence, to a task that is not open and to another instance, then the embedded wait's own delivery. |

The [named-message-and-signal schedule](parcel-named-message-and-signal.scenario.json) reuses the exact source of the root witness without copying it: a delivery on a named Message and a Signal delivery name the addressless wait, then the unspecified delivery does.

[item-handover-sequential.bpmn](item-handover-sequential.bpmn) and [item-handover-parallel.bpmn](item-handover-parallel.bpmn) hold one addressless Receive Task per body of a Multi-Instance Receive Task with a cardinality of two.

| Schedule | Case it separates |
|---|---|
| [items-sequential-turnover](items-sequential-turnover.scenario.json) | A second delivery to the first body's occurrence while the second body waits, then the second body's delivery. |
| [items-parallel-out-of-order](items-parallel-out-of-order.scenario.json) | Out-of-order delivery to simultaneous bodies and a second delivery to the body that completed. |

Notes for the target runners:

- The Signal delivery in the named-message schedule is a `deliver` with `trigger.kind: "signal"` aimed at a wait that holds no Signal subscription.
- The Multi-Instance bodies are counted rather than collection-driven; the activation of a body's occurrence counts the bodies begun so far.
