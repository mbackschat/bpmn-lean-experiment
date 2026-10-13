# Structured Process composition scenarios

The [profile](../../profiles/bpmn-2.0.2-structured-process-composition-draft/README.md) and [capsule](../../docs/capsules/STRUCTURED-PROCESS-COMPOSITION-PROPOSAL.md) own the bounded account. [invoice.bpmn](invoice.bpmn) and [serial.bpmn](serial.bpmn) retain the exact project-authored source bytes from the approved private execution and hosting witnesses. Neutral stimuli contain no expected answer and select Lean, TypeScript and Temporal with CIB absent.

| Scenario | Journey |
|---|---|
| [Invoice approval](invoice-approve.scenario.json) | Approve, merge and archive the associated decision. |
| [Invoice rejection](invoice-reject.scenario.json) | Reject, merge and archive the associated decision. |
| [Invoice manual review](invoice-manual.scenario.json) | Take the default branch with explicit null, then archive. |
| [Serial String handoff](serial-string.scenario.json) | Copy the associated String into the next task input. |
| [Serial null handoff](serial-null.scenario.json) | Preserve explicit null through the next task input. |

Every schedule rejects a Property-named or omitted output, stale activation and stale prior task; invoice schedules also reject writes from the ordinary branch task. Public engine admission, exact mapped writes, branch exclusivity, copied input and seeded input loss are checked by the [pipeline controls](../../packages/differential/test/structured-composition-pipeline-cases.test.ts). The [hosting witness](../../packages/temporal-adapter/testkit/test/structured-composition-recovery.temporal-test.ts) retains rollover, replacement, publication, recovery, replay and actual branch-bypass evidence.
