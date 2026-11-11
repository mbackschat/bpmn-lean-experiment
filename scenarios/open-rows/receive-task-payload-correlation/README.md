# Message-addressed Receive Task correlation

Answer-free schedules for [PC-HUM-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a Receive Task that waits on a Message and is delivered under a correlation, in branching, repetition, embedded, called and Multi-Instance ownership. The [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. They extend the single-task [Message-addressed Receive Task](../../message-addressed-receive-task/README.md). The profile is `cibseven-2.2.0` with no source overlay, and every Receive Task references the one Message `Message_Payment`, so the schedules, not the model, decide which occurrence a delivery names.

A correlation is the list of matches a delivery states against the target occurrence's variables: the Process variable `orderId`, or the Multi-Instance `loopCounter` of the body.

[order-payments.bpmn](order-payments.bpmn) collects a card and a bank payment for one order in parallel branches; the card branch can repeat through the User Task *Review card payment* (a JUEL condition on `again`).

| Schedule | Case it separates |
|---|---|
| [order-branches-correlated-delivery](order-branches-correlated-delivery.scenario.json) | A matching delivery to one branch, a second delivery to the occurrence that just completed, then the sibling branch's delivery. |
| [order-wrong-correlation](order-wrong-correlation.scenario.json) | A delivery whose correlation names another order, then the sibling's and the same occurrence's matching deliveries. |
| [order-wrong-owner-and-activation](order-wrong-owner-and-activation.scenario.json) | Deliveries naming another instance and an activation that has not begun, then the matching delivery. |
| [order-repetition-previous-occurrence](order-repetition-previous-occurrence.scenario.json) | After one repetition, a delivery to the first activation's occurrence, then to the second's. |

[embedded-payment.bpmn](embedded-payment.bpmn) waits inside a Sub-Process with an interrupting timer boundary (`PT1H`); [called-payment.bpmn](called-payment.bpmn) waits in a called Process; [item-payments.bpmn](item-payments.bpmn) waits once per body of a parallel Multi-Instance Receive Task with a cardinality of two; [item-payments-by-name.bpmn](item-payments-by-name.bpmn) does the same over the String collection `items`, each body holding its element as `item`.

| Schedule | Case it separates |
|---|---|
| [embedded-delivery](embedded-delivery.scenario.json) | A matching delivery to the Receive Task inside the Sub-Process. |
| [embedded-delivery-after-cancellation](embedded-delivery-after-cancellation.scenario.json) | The timer boundary fires at 3,600,000 ms, then a delivery names the Receive Task it cancelled. |
| [called-delivery](called-delivery.scenario.json) | A delivery under the caller's identity, then under the derived called-instance identity. |
| [items-parallel-local-correlation](items-parallel-local-correlation.scenario.json) | Correlation on the body's `loopCounter`: a mismatching delivery, a matching one, a second to the completed body, then the remaining body. |
| [items-parallel-local-element](items-parallel-local-element.scenario.json) | `items` started as `apple` and `pear`; correlation on the body's element `item`, a String, so no counter type plays a part: `pear` at the first body, `apple` at the first body, then `pear` at the second. The kernel rejects the first and commits the other two; the pinned source predicts that CIB rejects all three, since it reads a local criterion on the Receive Task's own scope beneath the body's execution that holds `item` (CIB-LIM-0039). |

Not authored in the repository: the payload. [PC-HUM-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) maps a declared payload, but the [scenario value contract](../../../scripts/scenario-variable-value-contract.ts) admits a `deliver` payload only for two registered process ids, so a payload-bearing schedule here would fail the repository's contract check. The payload-bearing variants of all eight schedules, with their Receive Tasks declaring a Data Output that a Data Association writes to a Process Property, are held outside the repository until the contract admits their process ids.

Notes for the target runners:

- Every schedule here uses a `deliver` correlation, which the CIB runner does not yet realize; `items-parallel-local-correlation` also uses the `localVariable` correlation target.
- The called occurrence is addressed by the derived called-instance identity (`call:<byte length>:<caller>:<byte length>:<Call element>:<activation>`).
- The timer boundary's logical deadline is relative to the start's logical time, which no schedule states and which therefore stays at zero.
