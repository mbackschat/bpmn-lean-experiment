# An uncaught Error inside a called child without output parameters

This directory serves [PC-ERROR-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a business failure inside a called child that no catcher takes, raised by a Service Task without output parameters ([propagation semantics](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#leaving-a-called-instance-pc-escalation-03-pc-error-03)). The [dossier-check model](dossier-check.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. The same failure from a thrower with output parameters is `finance-unlisted-code` in [error-called-child](../error-called-child/README.md).

The Call Activity `Check` runs `Process_CheckDossier` and maps `verdict` out as `checkVerdict`; its exact `CHECK_REJECTED` boundary leads to `Rework` and its normal return to `Approve`. The child runs the Human Task `Prepare` and then the Service Task `Assess`, answered by `effectResult`. The called instance is addressed by the kernel's derived called-instance identifier.

| Scenario | Case it exercises |
|---|---|
| [unlisted-code-without-outputs](unlisted-code-without-outputs.scenario.json) | `Prepare` sets `verdict`, then `Assess` reports a code no catcher names, which ends the child's only path. |

The schedule carries no expected route, mapped variable or Process state; the retained CIB evidence is the answer.
