# Error propagation out of called children

This directory serves [PC-ERROR-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a business failure inside a called child, its output mapping at the exceptional return point, repeated concurrent callers of one definition and the exposure of child locals. The [supplier model](supplier-review.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork the caller `Process_OnboardSupplier` runs two Call Activities of the one definition `Process_ReviewDossier`: `ReviewFinance` maps `financeDossier` in and `verdict` out to `financeVerdict`, and `ReviewCompliance` maps `complianceDossier` in and `verdict` out to `complianceVerdict`. Each Call has an exact `REVIEW_REJECTED` boundary leading to its own Human Task, and its own Human Task after normal return. The child runs the Human Task `Prepare` and then the Service Task `Assess`, answered by `effectResult`, whose output mapping writes `verdict` from the reported `result`. Completing `Prepare` sets the child's `verdict` and a local `scratch` that no Call maps out.

Called instances are addressed by the kernel's derived identifier, `call:` followed by the byte-length-prefixed caller instance, Call element and activation.

| Scenario | Case it exercises |
|---|---|
| [finance-rejected](finance-rejected.scenario.json) | One child reports the business failure the caller's boundary names, after its `verdict` and `scratch` were set, while the other child is untouched. |
| [finance-rejected-compliance-approved](finance-rejected-compliance-approved.scenario.json) | The same failure, then the other child's normal return. |
| [finance-unlisted-code](finance-unlisted-code.scenario.json) | The child reports a code no boundary of the caller names. |

The schedules carry no expected route, mapped variable or Process state; the retained CIB evidence is the answer.
