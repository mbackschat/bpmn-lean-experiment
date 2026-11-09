# Error data of a called child's failure

This directory serves [PC-ERROR-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), whose clause names the selected error-data mapping of a called child's business Error. The [error-data model](supplier-review-error-data.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; the schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. The routing and output-mapping cases are in [error-called-child](../error-called-child/README.md).

The caller runs the Call Activity `ReviewDossier`, which maps `dossier` in and `verdict` out to `reviewVerdict`, with a catch-all boundary that names `camunda:errorCodeVariable` `reviewCode` and `camunda:errorMessageVariable` `reviewMessage` and leads to the Human Task `ResolveReview`. The called Process runs the Human Task `Prepare` and the Service Task `Assess`, answered by `effectResult`, whose output mapping writes `verdict` from the reported `result`. The called instance is addressed by the kernel's derived called-instance identifier.

| Scenario | Case it exercises |
|---|---|
| [child-failure-code-and-message](child-failure-code-and-message.scenario.json) | The child reports a business failure with a code, a message and a result after its `verdict` was set. |

The schedule carries no expected variables or route; the retained CIB evidence is the answer.
