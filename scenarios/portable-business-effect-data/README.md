# Portable business effect-data scenarios

The [profile](../../profiles/cibseven-2.2.0-portable-business-effect-data-draft/profile.json) and [capsule amendment](../../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#structured-effect-data-consuming-amendment) own the bounded account. [credit-decision.bpmn](credit-decision.bpmn) is the retained project-authored credit decision: Service Task *Assess credit* returns one structured assessment, which Service Task *Notify applicant* receives as its input. The exact [source overlay](source-overlay.json) binds both operations to caller-supplied Activity handlers. Neutral stimuli contain no expected answer and select Lean, TypeScript and Temporal with CIB absent.

| Scenario | Journey |
|---|---|
| [Assessed application](credit-assessed.scenario.json) | Assess returns a Map with two equal and one unequal credit check, a negative scale-two Decimal, a nested contact Map, a Boolean and a present Null; Notify receives it whole and returns a String receipt. |
| [Present Null](credit-null.scenario.json) | Assess returns Null, which Notify receives as a present value, and Notify returns an empty-Map receipt. |

The [registration controls](../../packages/differential/test/effect-data-pipeline-cases.test.ts) check public admission, every Process value at the Notify wait and at termination, and the seeded mutations. Root List results, over-long root Strings and wrong, extra or missing result bindings are typed refusals outside the scenario domain, so they live in the [value-domain matrix](../../packages/differential/test/scenario-value-domain-cases.ts) and the [command tests](../../packages/bpmn-source/test/effect-data-boundaries.test.ts) instead.
