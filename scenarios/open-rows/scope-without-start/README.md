# A Transaction and a Sub-Process without a start Event

This directory serves [#73](https://github.com/mbackschat/bpmn-lean-experiment/issues/73): the witnesses of [CIB-LIM-0024](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-lim-0024--cib-needs-a-start-event-in-a-sub-process-and-a-transaction). BPMN 2.0.2 §13.3.4 lets a Sub-Process without a start Event begin every Activity that has no incoming flow. CIB Seven `2.2.0` refuses deploying such a Sub-Process, and fails entering such a Transaction. Both models are project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay; every schedule is answer-free and the retained CIB Seven `2.2.0` answer is the target.

## Models

| Model | What it holds |
|---|---|
| [startless-transaction.bpmn](startless-transaction.bpmn) | The Process starts at `StartEvent_Ordered`, runs the Human Task `UserTask_Prepare`, enters the Transaction `Transaction_Settle` and then runs the Human Task `UserTask_After`. The Transaction holds the Human Task `UserTask_Settle`, which no flow connects, and no start Event. |
| [startless-sub-process.bpmn](startless-sub-process.bpmn) | The same shape with the embedded Sub-Process `SubProcess_Settle` in place of the Transaction. |

## Schedules

| Schedule | Model | Case it separates | Expected answer (the evidence is the answer) |
|---|---|---|---|
| [transaction-entry-rolls-back](transaction-entry-rolls-back.scenario.json) | startless-transaction | A Transaction is deployed without the check that refuses a Sub-Process, so the failure comes only when `UserTask_Prepare` completes and the Process enters it. | CIB rolls back the completion on entry and `UserTask_Prepare` stays open. The kernel refuses the model at deployment as `scope.withoutStart`. |
| [sub-process-refused-at-deployment](sub-process-refused-at-deployment.scenario.json) | startless-sub-process | The deployment check for a Sub-Process without a start Event, which no start command reaches. | CIB refuses the deployment. The kernel refuses it as `scope.withoutStart`. |

The two schedules share one shape on purpose: the Transaction's failure is a run-time one and the Sub-Process's a deployment-time one in CIB, so the kernel's single admission refusal is compared with both.

The expected answers are this README's claims for review against the retained evidence; no scenario file carries an expected deployment outcome, command outcome or Process state.
