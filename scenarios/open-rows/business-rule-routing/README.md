# Business Rule Task results feeding routing and a send

Answer-free schedules for [PC-AUTO-08](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a Business Rule Task whose declared outputs map independently into Process variables that drive an Exclusive Gateway and a Send Task, with overlap, no-match and failed decisions. The decision contract is the [owner decision](../../../docs/kernel/ARCHITECTURE-SPEC.md#owner-decisions-on-the-path) behind [the hit-policy witnesses](../business-rule-hit-policies/README.md); the [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md#script-and-business-rule-tasks) own the meaning, and the retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay.

The model [rule-routing.bpmn](rule-routing.bpmn) and the DMN resource [routing.dmn](routing.dmn) beside it hold the whole journey; every schedule binds the resource by path and digest (`bpmn.decisions`), so the CIB runner deploys it with the model. The [scenario value contract](../../../scripts/scenario-variable-value-contract.ts) admits Integer start values only for registered process ids, so the scores are numeric Strings that the decision's `integer` type reference converts. The Business Rule Task *Assess applicant* evaluates the UNIQUE decision `routeDecision` over the Integer-typed input `score`, supplied as a numeric String, and maps the whole result with `singleResult` to the task-local `outcome`; two output parameters copy its entries to the Process variables `grade` and `limit`. The decision's three rules test `< 40`, `[40..70]` and `> 60`, so the tests overlap on part of the range, and give the outputs (`low`, 100), (`mid`, 300) and (`high`, 900). JUEL conditions on `grade` then lead to the User Task *Review manually* (`high`), to the Send Task *Send approval notice* (`low`) or by default to an end event. The Send Task binds `${bpmnLeanEffectHandler}` with `camunda:asyncBefore="true"` and takes `recipient`, `grade` and `limit` as inputs.

| Schedule | Input | Case it separates |
|---|---|---|
| [low-grade-send](low-grade-send.scenario.json) | `score = "30"`, then the send's success result | An input that only the first rule tests true for, a grade the `low` condition tests, and the Send Task's result. |
| [high-grade-review](high-grade-review.scenario.json) | `score = "90"` | An input that only the third rule tests true for, a grade the `high` condition tests. |
| [mid-grade](mid-grade.scenario.json) | `score = "50"` | An input that only the second rule tests true for, a grade neither condition tests. |
| [overlap](overlap.scenario.json) | `score = "65"` | An input that the second and third rule both test true for, under the UNIQUE policy. |
| [no-match](no-match.scenario.json) | `score` a present Null | No rule can test true. |
| [wrong-type-input](wrong-type-input.scenario.json) | `score = "n/a"` | An input that is not numeric text, for the declared Integer type. |

[rule-condition-order.bpmn](rule-condition-order.bpmn) puts the condition on the decision task's own outgoing flow: *Assess applicant* leads to *Review manually* when `grade == 'pending'` and by default to an end event, and its output parameters overwrite `grade`. The start sets `grade = "pending"` and `score = "90"`, so the route shows whether the condition reads the variables before or after the outputs ([CIB-INT-0011](../../../docs/CIB-BPMN-RELATION-REGISTER.md)).

| Schedule | Case it separates |
|---|---|
| [condition-order](condition-order.scenario.json) | A decision task's outgoing condition against the output parameters it precedes. |

Notes for the target runners:

- `overlap` and `wrong-type-input` have an engine step that can fail inside the starting command; the runner must record it as the command outcome rather than as a harness failure.
- `outcome` is declared task-local so that no Map reaches a Process variable; the retained runner's variable projection carries only Strings, Integers, Booleans, present Nulls and lists of Strings.
