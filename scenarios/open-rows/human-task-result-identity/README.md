# User Task results and occurrence identity

Answer-free schedules for [PC-HUM-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the inputs and results of a reusable User Task and the engine-issued occurrence identity, across serial, rework, branch, scoped, Multi-Instance and called compositions. The [work](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md) and [data](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md) semantics own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the target. They extend the existing [scope re-entry](../../scope-reentry/README.md), [discovery and completion](../../user-task-discovery-completion/README.md) and [cycle](../../user-task-cycle/README.md) witnesses. The profile is `cibseven-2.2.0` with no source overlay.

[claim-review.bpmn](claim-review.bpmn) reviews a claim. The User Task *Review* publishes the input `summary`, declares the form field `verdict` and maps its local `verdict` to the differently named Process variable `decision`. A JUEL condition on `decision` returns to *Review* on `rework`; otherwise a parallel fork opens the User Task *Sign* and the Sub-Process *Intake*, whose User Task *Collect* writes the Sub-Process's local `notes`, copied out as `intakeNotes`.

| Schedule | Case it separates |
|---|---|
| [claim-mapped-result](claim-mapped-result.scenario.json) | One complete journey: the mapped result, the fork, the scoped completion and the join. |
| [claim-wrong-identities](claim-wrong-identities.scenario.json) | Completions naming another instance, a task that is not open and an activation that has not begun, then a rework and a completion of the activation the loop has left. |
| [claim-extra-result](claim-extra-result.scenario.json) | A completion that submits a name no mapping or field declares beside the result, then a valid completion. |
| [claim-missing-result](claim-missing-result.scenario.json) | A completion that submits nothing, then a valid completion. |
| [claim-type-invalid-result](claim-type-invalid-result.scenario.json) | A completion that submits a Boolean for the string field `verdict`, then a valid completion. |
| [claim-scoped-stale-body](claim-scoped-stale-body.scenario.json) | A second completion of the scoped task *Collect* after its Sub-Process has closed. |

[item-review-sequential.bpmn](item-review-sequential.bpmn) and [item-review-parallel.bpmn](item-review-parallel.bpmn) put one User Task, with the same input (the body's `loopCounter`) and mapped result, in a Multi-Instance body with a cardinality of two.

| Schedule | Case it separates |
|---|---|
| [items-sequential-preceding-body](items-sequential-preceding-body.scenario.json) | The completion of the first body's activation again while the second body is open. |
| [items-parallel-stale-body](items-parallel-stale-body.scenario.json) | Out-of-order completion of simultaneous bodies, and a second completion of the body that already completed. |

[item-check-sequential.bpmn](item-check-sequential.bpmn) and [item-check-parallel.bpmn](item-check-parallel.bpmn) are the same loops with the form field only: no input or output mapping, so each submitted `verdict` is installed by name.

| Schedule | Case it separates |
|---|---|
| [items-sequential-preceding-body-unmapped](items-sequential-preceding-body-unmapped.scenario.json) | The schedule of `items-sequential-preceding-body` on the unmapped sequential loop. |
| [items-parallel-stale-body-unmapped](items-parallel-stale-body-unmapped.scenario.json) | The schedule of `items-parallel-stale-body` on the unmapped parallel loop. |
| [items-parallel-counter-submission](items-parallel-counter-submission.scenario.json) | A completion that submits `nrOfCompletedInstances`, a name the parallel body's loop state holds, then valid completions. |
| [items-sequential-counter-submission](items-sequential-counter-submission.scenario.json) | A completion that submits `loopCounter`, a name the sequential body's loop state holds, then valid completions. |

[item-named-parallel.bpmn](item-named-parallel.bpmn) is the unmapped parallel loop over the two items of the `items` collection, each body holding its item as `item`.

| Schedule | Case it separates |
|---|---|
| [items-parallel-item-named-submission](items-parallel-item-named-submission.scenario.json) | A completion that submits `item`, the name the body holds its input data item under, which stays with that body; the other body's `verdict` reaches the root. |

[called-review.bpmn](called-review.bpmn) calls a reusable review Process through a Call Activity with a mapped input and a differently named mapped output.

| Schedule | Case it separates |
|---|---|
| [called-task-identity](called-task-identity.scenario.json) | A completion of the called task under the caller's identity, then under the called identity, then again after the Call has returned. |

Notes for the target runners:

- The called occurrence is addressed by the derived called-instance identity (`call:<byte length>:<caller>:<byte length>:<Call element>:<activation>`, as in [call variable mapping](../../call-variable-mapping/README.md)).
- Form-field types are declared only on the `verdict` and `notes` fields; no schedule depends on a type outside string.
- Every submitted value is a String or a Boolean, and the Multi-Instance bodies are counted rather than collection-driven.
