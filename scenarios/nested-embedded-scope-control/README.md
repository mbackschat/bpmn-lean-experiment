# Nested embedded scope-control scenarios

The cumulative [embedded Sub-Process completion profile](../../profiles/cibseven-2.2.0-embedded-subprocess-completion-draft/profile.json) and the [nested embedded scope-control capsule](../../docs/capsules/NESTED-EMBEDDED-SCOPE-CONTROL-PROPOSAL.md#separating-witnesses) own the bounded account. Two retained project-authored models use only User Tasks, Parallel Gateways and ordinary Sub-Processes nested to depth three, with no data, effects or source overlay. Neutral stimuli contain no expected answer and select Lean, TypeScript and Temporal with CIB absent, because the standard settles every selected behavior.

| Model | Business narrative |
|---|---|
| [Employee onboarding](employee-onboarding.bpmn) | Equipment is ordered in parallel with confirming the start date, which opens a Workplace setup scope. Setup assigns a desk beside an Accounts scope that creates the mailbox and grants VPN access at separate Ends. The welcome meeting is scheduled only when equipment and the whole setup are done. |
| [Internal audit](internal-audit.bpmn) | An audit encloses fieldwork, which plans, then samples and interviews in two parallel Sub-Processes three scopes deep before reviewing findings. Sign-off closes the audit scope and only then is the audit closed. |

| Scenario | Journey |
|---|---|
| [Setup first](onboarding-setup-first.scenario.json) | Confirm start date opens desk, mailbox, VPN and the pending equipment in one closure. Completing the mailbox, the desk and the equipment leaves only VPN open, and the welcome meeting appears only after VPN completes. |
| [Equipment first](onboarding-equipment-first.scenario.json) | Ordering equipment first leaves the start date as the only open task. Confirming it opens desk, mailbox and VPN together through two nested scope entries, and the welcome meeting follows the last of them. |
| [Early and stale](audit-early-and-stale.scenario.json) | Planning enters both depth-three scopes in one closure, and each completes alone while the join waits. Completing review findings before the join and drawing a sample again after its scope completed are both rejected with the state unchanged. Review findings then opens, and its completion continues inside the audit, so sign-off opens before the audit is closed. |

The [registration controls](../../packages/differential/test/nested-scope-control-pipeline-cases.test.ts) check public admission, the open User Tasks and Process status after every command, the preserved state after each refusal and the seeded mutations. The refusals of a fourth nesting level, an unpaired fork, a task-free fork branch, a root terminal fork, an Exclusive Gateway, a Service Task and a burst over the closure limit are [source-admission tests](../../packages/bpmn-source/test/nested-scope-control-source-admission.test.ts), not scenarios, because a refused definition has no schedule.
