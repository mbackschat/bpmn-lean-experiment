# Portable business values handoff scenarios

The [profile](../../profiles/bpmn-2.0.2-portable-business-values-handoff-draft/README.md) and [capsule amendment](../../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#serial-handoff-consuming-amendment) own the bounded account. [order-handoff.bpmn](order-handoff.bpmn) is the retained project-authored order review and archive model under the BPMN default expression language. Neutral stimuli contain no expected answer and select Lean, TypeScript and Temporal with CIB absent.

| Scenario | Journey |
|---|---|
| [Nested order](order-nested.scenario.json) | Review and Archive receive the 12-node order with two equal items, a present-Null field and an exact scale-two amount. |
| [Revised order](order-revised.scenario.json) | Review submits ordered unequal items and a negative Decimal, and Archive submits a Map receipt. |
| [Present Null](order-null.scenario.json) | Review submits Null, which Archive receives as a present value, and Archive submits an empty Map. |

The nested and revised schedules refuse a Property-named, omitted, extra and stale-activation output, and a stale prior task. The Null schedule refuses an omitted output, so absence stays distinct from Null. The [registration controls](../../packages/differential/test/portable-handoff-pipeline-cases.test.ts) check public admission, every Process value at each wait and at termination, and the seeded mutation classes. Root List values and over-long root Strings are typed refusals outside the scenario domain, so they live in the [value-domain matrix](../../packages/differential/test/scenario-value-domain-cases.ts) and the command tests instead.
