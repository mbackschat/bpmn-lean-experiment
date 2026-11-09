# Business Rule Tasks over DMN decision tables: hit policies

Answer-free schedules for [PC-AUTO-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), the finite decision contract of the Business Rule Task under the [owner decision](../../../docs/kernel/ARCHITECTURE-SPEC.md#owner-decisions-on-the-path) (DMN decision tables evaluated in the kernel, the hit policies UNIQUE, FIRST, ANY, COLLECT and RULE ORDER, and the FEEL unary-test subset of literals, comparisons, ranges, lists and negation). The [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md#script-and-business-rule-tasks) own the meaning; the retained CIB Seven `2.2.0` answer is the target. DMN is the decision language here and never a replacement for JUEL: the Exclusive Gateway that selects a decision uses JUEL conditions. The profile is `cibseven-2.2.0` with no source overlay.

The model [hit-policies.bpmn](hit-policies.bpmn) references decisions by `camunda:decisionRef` with the default binding, and the DMN resource [decisions.dmn](decisions.dmn) sits beside it. **The CIB runner must deploy every `*.dmn` file of the model's directory in the same deployment as the `.bpmn` file.** The [scenario value contract](../../../scripts/scenario-variable-value-contract.ts) admits Integer start values only for registered process ids, so every number below is a numeric String that the decision's `integer` type reference converts. One Exclusive Gateway selects a Business Rule Task by the start variable `policy`; all branches merge into the User Task *Inspect result*, and every schedule has the start as its only stimulus.

The decision tables `gradeUnique`, `gradeFirst`, `gradeAnyAgree`, `gradeAnyConflict`, `gradeCollect` and `gradeRuleOrder` read the Integer-typed input `score`, supplied as a numeric String, and share three rules on it, in this order: `< 50`, `[40..70]` and `> 60`, so the tests overlap on part of the range. Their outputs are the Strings `low`, `mid` and `high`; in `gradeAnyAgree` they are `fail`, `ok` and `ok`. The single-result tables map with `singleEntry` to `grade`, the two list-producing tables with `collectEntries` to `grades`. `gradeBadOutput` declares an Integer output and gives one rule a String entry. `fee` reads the String `channel` with the tests `"branch"`, `"web","app"` and `not("branch","web","app")`.

| Schedule | Decision and input | Case it separates |
|---|---|---|
| [unique-single-match](unique-single-match.scenario.json) | `gradeUnique`, `score = "55"` | UNIQUE with the inputs of one rule. |
| [unique-overlap](unique-overlap.scenario.json) | `gradeUnique`, `score = "65"` | UNIQUE with the inputs of two rules. |
| [unique-no-match](unique-no-match.scenario.json) | `gradeUnique`, `score` a present Null | UNIQUE when no rule can test true. |
| [unique-wrong-type-input](unique-wrong-type-input.scenario.json) | `gradeUnique`, `score = "n/a"` | An input value that is not numeric text, for the declared Integer type. |
| [unique-absent-input](unique-absent-input.scenario.json) | `gradeUnique`, no `score` | An input variable that does not exist. |
| [first-overlap](first-overlap.scenario.json) | `gradeFirst`, `score = "65"` | FIRST with two matching rules. |
| [any-agreeing-overlap](any-agreeing-overlap.scenario.json) | `gradeAnyAgree`, `score = "65"` | ANY with two matching rules that give the same output. |
| [any-conflicting-overlap](any-conflicting-overlap.scenario.json) | `gradeAnyConflict`, `score = "65"` | ANY with two matching rules that give different outputs. |
| [collect-overlap](collect-overlap.scenario.json) | `gradeCollect`, `score = "65"` | COLLECT with two matching rules, mapped to a list. |
| [collect-no-match](collect-no-match.scenario.json) | `gradeCollect`, `score` a present Null | COLLECT when no rule can test true, mapped to a list. |
| [rule-order-overlap](rule-order-overlap.scenario.json) | `gradeRuleOrder`, `score = "65"` | RULE ORDER with two matching rules, mapped to a list. |
| [bad-output-type](bad-output-type.scenario.json) | `gradeBadOutput`, `score = "55"` | A matching rule whose output entry does not fit the declared output type. |
| [unknown-decision](unknown-decision.scenario.json) | `decisionRef` `noSuchDecision` | A Business Rule Task that names a decision no deployment contains. |
| [fee-literal](fee-literal.scenario.json) | `fee`, `channel = "branch"` | A String literal test. |
| [fee-list](fee-list.scenario.json) | `fee`, `channel = "app"` | A list of String literals. |
| [fee-negation](fee-negation.scenario.json) | `fee`, `channel = "phone"` | A negated list. |

Notes for the target runners:

- The retained CIB runner deploys the `.bpmn` file only and has no Business Rule Task realization; no schedule here supplies a decision result.
- `unique-overlap`, `unique-wrong-type-input`, `unique-absent-input`, `any-conflicting-overlap`, `bad-output-type` and `unknown-decision` have an engine step that can fail inside the starting command; the runner must record it as the command outcome rather than as a harness failure.
- Every result variable is a String, an Integer, a present Null or a list of Strings, so the retained runner's variable projection can carry it.
