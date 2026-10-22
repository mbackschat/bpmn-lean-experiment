# Call variable mapping scenarios

The [profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) and the [Call variable mapping specification](../../docs/capsules/CALL-VARIABLE-MAPPING-SPEC.md#separating-witnesses) own the bounded account. One retained project-authored model shares the nested scope-data profile, with an exact source overlay that binds the acknowledgement Service Task to a caller-supplied Activity handler. Neutral stimuli contain no expected answer and select Lean, TypeScript and Temporal with CIB absent.

The [loan application](loan-application.bpmn) with its [handler](loan-application-overlay.json) acknowledges an application, passes the applicant and amount into a reusable identity-verification Process through a Call Activity with mapped inputs and outputs, and lets a review Sub-Process confirm or override the returned verdict before the decision is published.

| Scenario | Journey |
|---|---|
| [Approved loan](loan-approved.scenario.json) | A completion of the called document task addressed to the caller instance and a patch naming the caller-only `applicant` are rejected with the state unchanged. The task then commits a patch writing its namesake `amount`, which leaves the Process `amount` unchanged at the next called wait. The returned verdict lands as the Process `decision` and the copied applicant as `echoedCustomer`, a repeated verdict completion is rejected, and the reviewer's override is published back to `decision`. |
| [Null applicant](loan-null-applicant.scenario.json) | A present null `applicant` is copied into the called Process and returned as a present null `echoedCustomer` beside the returned verdict. |
| [Unset verdict](loan-unset-verdict.scenario.json) | A Start without `applicant` and with `decision = "old"` copies a present null in; the callee never sets its verdict, so the output overwrites `decision` with a present null and `echoedCustomer` is a present null. |

The [registration controls](../../packages/differential/test/call-variable-mapping-pipeline-cases.test.ts) check public admission, every open wait and Process value of each journey, the rejected commands, the lifetime of the called frame in committed core state and the seeded mutations. The pipeline observes only Process variables, so called-frame contents and their disposal rest on the Lean laws and core state validity. Start values that the scenario domain refuses or admits for this model live in the [value-domain matrix](../../packages/differential/test/scenario-value-domain-cases.ts).
