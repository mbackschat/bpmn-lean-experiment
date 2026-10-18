# Nested embedded scope data scenarios

The [profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) and the [nested embedded scope data capsule](../../docs/capsules/NESTED-EMBEDDED-SCOPE-DATA-PROPOSAL.md#separating-witnesses-and-rule-to-evidence-matrix) own the bounded account. Three retained project-authored models share one profile, each with its own exact source overlay that binds the Service Task operations to caller-supplied Activity handlers. Neutral stimuli contain no expected answer and select Lean, TypeScript and Temporal with CIB absent.

| Model | Journey |
|---|---|
| [Purchase order approval](purchase-order.bpmn) with [handlers](purchase-order-overlay.json) | Order approval encloses credit review, which encloses a compliance check, so every read, write and output crosses up to three frames. Its element identifiers match the Lean witness in the nested scope data conformance module. |
| [Expense claim review](expense-claim.bpmn) with [handlers](expense-claim-overlay.json) | One Sub-Process whose User Task takes a completion patch sized exactly at, and one byte over, the 16,384-byte patch allowance. |
| [Bulk quote sign-off](bulk-quote.bpmn) with [handlers](bulk-quote-overlay.json) | Three nested levels each copy one structured quote, which sizes the pre-start capacity envelope; the fitting journey is retained here. |

| Scenario | Journey |
|---|---|
| [Approved order](order-approved.scenario.json) | Compliance reads the Process `requestedLimit`, not credit review's sibling literal, and order approval's null `status` over the Process `"open"`. A completion naming an undeclared name is rejected with the state unchanged. The review writes `status` into order approval's frame and the Process `limit` is published when credit review retires. Order approval then publishes `"approved"` as `finalStatus` and its untouched `decision`, and the order Map with two equal items, a present null and a negative Decimal arrives unchanged. |
| [Null risk class](order-null-risk.scenario.json) | A present null `riskClass` and `requestedLimit` commit with an empty compliance completion patch; a null local shadows and is published to the Process as a present value; the compliance output `"pending-check"` lands in order approval's frame and is published as `finalStatus` while the Process `status` stays `"open"`; empty List and Map members survive three frames. |
| [Patch allowance](claim-limits.scenario.json) | A 16,385-byte patch is rejected with the state unchanged, a 16,384-byte patch commits and reaches the effect and the Sub-Process output. |
| [Signed quote](quote-signed.scenario.json) | The signed copy written into the innermost frame never reaches the output of the outer frame, which publishes its own prepared quote. |

The [registration controls](../../packages/differential/test/nested-scope-data-pipeline-cases.test.ts) check public admission, every open wait and Process value of each journey, the exact patch sizes, source-order independence of the input declarations and the seeded mutations. A missing required Start name, a repeated patch name, a root List, an over-long root String and a Start whose structured values exceed the committed-state budget are refusals outside the scenario domain or before Workflow creation, so they live in the [value-domain matrix](../../packages/differential/test/scenario-value-domain-cases.ts), the core and Lean tests and the Temporal capacity envelope tests instead.
