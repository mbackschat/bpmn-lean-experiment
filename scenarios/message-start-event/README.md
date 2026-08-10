# Message Start Event scenario

The [answer-free scenario](scenario.json) executes the byte-identical [BPMN source](process.bpmn) admitted by the [BPMN 2.0.2 Message Start Event profile](../../profiles/bpmn-2.0.2-message-start-event-draft/profile.json) and governed by the [Message Start Event specification](../../docs/capsules/MESSAGE-START-EVENT-SPEC.md).

The first stimulus resolves `MessageStart_ApprovalRequest` through the complete `Interface_ProcessMessages` and `Operation_ReceiveApprovalRequest` channel and creates semantic instance `MessageStartInstance_1`. The second stimulus completes `UserTask_Approve` activation 1 with no submitted values. Empty Process variables are therefore an observed semantic result, not an omitted payload.

The scenario contains source identity and semantic inputs only. It carries no expected result, CIB runner target, retained CIB evidence, broker address, payload, or routing policy.
