# Uncaught Error under the standards profile

This directory serves [PC-ERROR-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) under the [standards profile](../../../profiles/bpmn-2.0.2/README.md): an Error End Event whose code no catcher names while another path of the instance is still open. The [claim review model](claim-review.bpmn) is project-authored MIT source; it selects no CIB oracle, so the Lean kernel is the authority the TypeScript kernel is checked against.

After a Parallel fork, the Sub-Process `Review` runs the User Task `Inspect` into the Error End `End_Rejected` (`CLAIM_REJECTED`); its only boundary catches `CLAIM_INCOMPLETE`. The other branch runs the User Task `Audit`.

| Scenario | Case it exercises |
|---|---|
| [uncaught-error-end](uncaught-error-end.scenario.json) | `Inspect` completes while `Audit` is open, so the Error passes a boundary with another code and leaves the instance uncaught; `Audit` is then completed. |

The schedule carries no expected result. The [propagation semantics](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#finding-the-catcher) define the standards outcome of an uncaught Error.
