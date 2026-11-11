# Payload-bearing Message catches in branches, repeated arrivals and bodies

Answer-free schedules for [PC-MESSAGE-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): Message payloads delivered to Intermediate catches that write a Data Output into a Process Property, in parallel branches, on a branch entered again, in a nested scope and in both Multi-Instance body modes, and a Message-addressed Receive Task beside them; a payload that is absent, null or of another kind than the declared item; and a delivery that names a previous activation or body. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The models are project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [process.bpmn](../../message-addressed-receive-task/process.bpmn) | The Message-addressed Receive Task `Process_MessageAddressedReceiveTaskProbe` of the [Message-addressed Receive Task scenario](../../message-addressed-receive-task/README.md), reused by path: a None Start, the Receive Task *Wait for invoice* on the Message `newInvoiceMessage`, and a None End. It declares no Sub-Process, Property or Data Output. |
| [payload-catches.bpmn](payload-catches.bpmn) | After a Parallel fork five branches run, all declaring the one ItemDefinition `ItemDefinition_Payload` (`xsd:string`). *Quote*: an Exclusive merge, the catch `Catch_Quote` (`quote`) writing Property `Property_Quote`, the Human Task `Review_Quote`, and an Exclusive Gateway that returns to the merge on `${again == true}`. *Region*: the Sub-Process `Region` declaring Property `Property_Note`, with the catch `Catch_Note` (`note`) writing it and the Human Task `Inspect_Note`. *Receive*: the Receive Task `Await_Docs` on the Message `documents` and the Human Task `File_Docs`. *Sequential bodies*: the Sub-Process `Bodies_Seq` over the String list `items`, sequential, each body declaring Property `Property_SeqNote` written by `Catch_SeqBody` (`seqNote`), then `Check_Seq`. *Parallel bodies*: `Bodies_Par`, the same with `Catch_ParBody` (`parNote`), `Property_ParNote` and `Check_Par`. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [branches-each-own-destination](branches-each-own-destination.scenario.json) | payload-catches | PC-MESSAGE-03 | The nested catch, the quote catch and the Receive Task are each delivered, the first two with a String payload; the three Human Tasks then complete. |
| [repeated-arrival-fresh-wait](repeated-arrival-fresh-wait.scenario.json) | payload-catches | PC-MESSAGE-03 | The quote catch is delivered and the review sends the work back; the first activation is addressed with a second payload, then the second activation. |
| [payload-absent](payload-absent.scenario.json) | payload-catches | PC-MESSAGE-03 | The quote catch is delivered with no payload, then with one. |
| [payload-null](payload-null.scenario.json) | payload-catches | PC-MESSAGE-03 | The quote catch is delivered a present null payload. |
| [payload-of-another-kind](payload-of-another-kind.scenario.json) | payload-catches | PC-MESSAGE-03 | The quote catch is delivered the Integer 7 where the item is declared `xsd:string`, then the String. |
| [payload-to-receive-task](payload-to-receive-task.scenario.json) | payload-catches | PC-MESSAGE-03 | The Receive Task is delivered a String payload, then the same delivery without one. |
| [payload-offered-without-data-output](payload-offered-without-data-output.scenario.json) | process.bpmn | PC-MESSAGE-03 | The Receive Task, which declares no Data Output, is delivered a String payload ([CIB-LIM-0037](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-lim-0037--a-payload-offered-to-a-message-wait-without-a-data-output-commits-in-cib)), then the same delivery without one. |
| [sequential-bodies-previous-body](sequential-bodies-previous-body.scenario.json) | payload-catches | PC-MESSAGE-03 | Body 1's catch is delivered and its task completes; body 1's catch is addressed again, then body 2's catch is delivered and its task completes. |
| [parallel-bodies-out-of-order](parallel-bodies-out-of-order.scenario.json) | payload-catches | PC-MESSAGE-03 | Body 2's catch is delivered before body 1's, each with its own payload; body 1's catch is addressed again after its task completes. |

## Notes for the target runners

- Every schedule with a `payload` uses a `deliver` payload, which the CIB runner does not yet realize.
- `items` is the String list the Multi-Instance Sub-Processes iterate; a body's catch is addressed by activation, counted per begun occurrence of `Catch_SeqBody` or `Catch_ParBody` in the Process instance.
- `Property_Quote` is a Process Property; `Property_Note`, `Property_SeqNote` and `Property_ParNote` are Properties of their Sub-Processes.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
