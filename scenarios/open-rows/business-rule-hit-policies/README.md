# Business Rule Tasks over DMN decision tables

Answer-free schedules for [PC-AUTO-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), the finite decision contract of the Business Rule Task under the [owner decision](../../../docs/kernel/ARCHITECTURE-SPEC.md#owner-decisions-on-the-path) (DMN decision tables evaluated in the kernel, the hit policies UNIQUE, FIRST, ANY, COLLECT and RULE ORDER, and the FEEL unary-test subset of literals, comparisons, ranges, lists and negation). The [decision semantics](../../../docs/kernel/semantics/DECISION-SEMANTICS-SPEC.md) own the meaning, and their witness plan names every schedule here; the retained CIB Seven `2.2.0` answer is the target. DMN is the decision language here and never a replacement for JUEL: the Exclusive Gateway that selects a decision uses JUEL conditions. The profile is `cibseven-2.2.0` with no source overlay.

## Models and the DMN binding

Every scenario binds the DMN resource [decisions.dmn](decisions.dmn) by its exact bytes in `bpmn.decisions` ([scenario schema](../../../contracts/schemas/scenario.schema.json)); a target runner deploys each bound resource in the model's deployment and never discovers DMN files by directory. Every Business Rule Task references its decision by `camunda:decisionRef` with the default binding.

- [hit-policies.bpmn](hit-policies.bpmn): one Exclusive Gateway selects a Business Rule Task by the start variable `policy`; all branches merge into the User Task *Inspect result*.
- [decision-contexts.bpmn](decision-contexts.bpmn): `gradeUnique` (mapped `singleEntry` to `grade`) reached in three contexts the gateway selects: inside a Sub-Process whose input parameter binds a local `grade`, after an `asyncBefore` Service Task's effect result, and after a `PT10S` Timer.
- [unknown-decision.bpmn](unknown-decision.bpmn): one Business Rule Task whose `decisionRef` `noSuchDecision` no bound resource declares.
- [forms.bpmn](forms.bpmn): one Business Rule Task per table of [forms.dmn](forms.dmn), selected by `policy` as in `hit-policies.bpmn`; the schedules on it bind `forms.dmn` instead of `decisions.dmn`.
- [value-outputs.bpmn](value-outputs.bpmn): one Business Rule Task per table of [value-outputs.dmn](value-outputs.dmn), selected by `policy` as in `hit-policies.bpmn` and mapped `singleEntry` to `result`; the schedules on it bind `value-outputs.dmn` instead of `decisions.dmn`.

The [scenario value contract](../../../scripts/scenario-variable-value-contract.ts) admits Integer start values only for registered process ids, so every number below is a numeric String that the decision's `integer` type reference converts.

## Decision tables

The tables `gradeUnique`, `gradeFirst`, `gradeAnyAgree`, `gradeAnyConflict`, `gradeCollect`, `gradeRuleOrder` and `gradeDefault` (no declared hit policy) read the Integer-typed input `score` and share three rules on it, in this order: `< 50`, `[40..70]` and `> 60`, so the tests overlap on part of the range. Their outputs are the Strings `low`, `mid` and `high`; in `gradeAnyAgree` they are `fail`, `ok` and `ok`. `gradeBadOutput` declares an Integer output and gives one rule a String entry. `fee` reads the String `channel` with the tests `"branch"`, `"web","app"` and `not("branch","web","app")`.

| Table | Hit policy | Input | Rules (test → output) |
|---|---|---|---|
| `rating` | UNIQUE | `score` | `< 50` → `grade "low"`, `points 1`; `>= 50` → `"high"`, `2` |
| `ratingRuleOrder` | RULE ORDER | `score` | `< 50` → `"low"`, `1`; `[40..70]` → `"mid"`, `2`; `> 60` → `"high"`, `3` |
| `gradeFirstBadLater` | FIRST | `score` | `< 70` → Integer `1`; `> 50` → `"many"` under `integer` |
| `bands` | COLLECT | `score` | `[40..70]`, `]40..70[`, `(40..70]`, `[40..70)` → `closed`, `open`, `leftOpen`, `rightOpen` |
| `vipLabel` | UNIQUE | Boolean `vip` | `true` → `"vip"`; `false` → `"regular"` |
| `channelNull` | UNIQUE | `channel` | `null` → `"none"`; `"branch"` → `"branch"` |
| `notBranch` | UNIQUE | `channel` | `not("branch")` → `"other"`; `"branch"` → `"branch"` |
| `notSmall` | UNIQUE | `score` | `not(< 5)` → `"big"` |
| `fiveish` | COLLECT | `score` | `5.0` → `"exact"`; `[4.5..5.5]` → `"near"` |
| `signs` | UNIQUE | `score` | `7` → `"seven"`; `0` → `"zero"` |
| `numberText` | UNIQUE | `score` | `-` → `5` under `string` |
| `dashes` | UNIQUE | `score`, `channel` | `-` and an empty `<text/>` → `"both"` |

The tables of [forms.dmn](forms.dmn) witness the remaining admitted FEEL forms; each reads the Integer `score` unless it names another input.

| Table | Hit policy | Input | Rules (test → output) |
|---|---|---|---|
| `atMost` | COLLECT | `score` | `<= 10` → `"atMost10"`; `< 10` → `"below10"`; `>= 10` → `"atLeast10"` |
| `negatives` | COLLECT | `score` | `-5` → `"minusFive"`; `[-7..-3]` → `"minusRange"`; `< -10` → `"belowMinusTen"`; `> -1` → `"aboveMinusOne"` |
| `halves` | COLLECT | `score` | `< .5` → `"belowHalf"`; `> -.5` → `"aboveMinusHalf"`; `.5` → `"half"` |
| `inverted` | COLLECT | `score` | `[70..40]` → `"inverted"`; `-` → `"any"` |
| `escapes` | UNIQUE | String `channel` | `"a\"b"` → `"quote"`; `"a\\b"` → `"backslash"` |
| `flags` | UNIQUE | `score` | `< 50` → Boolean `approved` `false`, String `note` `null`; `>= 50` → `true`, `"ok"` |

The tables of [value-outputs.dmn](value-outputs.dmn) witness output values of each kind under ANY and an output with no declared type; each reads the Integer `score`.

| Table | Hit policy | Input | Rules (test → output) |
|---|---|---|---|
| `anyBoolean` | ANY | `score` | `< 50` → Boolean `approved` `true`; `[40..70]` → `true` |
| `anyInteger` | ANY | `score` | `< 50` → Integer `points` `1`; `[40..70]` → `1` |
| `anyNull` | ANY | `score` | `< 50` → String `note` `null`; `[40..70]` → `null` |
| `untyped` | UNIQUE | `score` | `< 50` → `label` `"seen"`, an output with no `typeRef` |

## Schedules

Every schedule starts the process; the two on `decision-contexts.bpmn` that reach the decision through an effect result or a Timer add that one stimulus.

| Schedule | Decision, mapping and input | Case it separates |
|---|---|---|
| [unique-single-match](unique-single-match.scenario.json) | `gradeUnique` `singleEntry`, `score = "55"` | UNIQUE with the inputs of one rule. |
| [unique-overlap](unique-overlap.scenario.json) | `gradeUnique`, `score = "65"` | UNIQUE with the inputs of two rules. |
| [unique-no-match](unique-no-match.scenario.json) | `gradeUnique`, `score` a present Null | UNIQUE when no rule can test true. |
| [unique-wrong-type-input](unique-wrong-type-input.scenario.json) | `gradeUnique`, `score = "n/a"` | An input value that is not numeric text, for the declared Integer type. |
| [unique-absent-input](unique-absent-input.scenario.json) | `gradeUnique`, no `score` | An input variable that does not exist. |
| [first-overlap](first-overlap.scenario.json) | `gradeFirst`, `score = "65"` | FIRST with two matching rules. |
| [any-agreeing-overlap](any-agreeing-overlap.scenario.json) | `gradeAnyAgree`, `score = "65"` | ANY with two matching rules that give the same output. |
| [any-conflicting-overlap](any-conflicting-overlap.scenario.json) | `gradeAnyConflict`, `score = "65"` | ANY with two matching rules that give different outputs. |
| [collect-overlap](collect-overlap.scenario.json) | `gradeCollect` `collectEntries`, `score = "65"` | COLLECT with two matching rules, mapped to a list. |
| [collect-no-match](collect-no-match.scenario.json) | `gradeCollect`, `score` a present Null | COLLECT when no rule can test true, mapped to a list. |
| [rule-order-overlap](rule-order-overlap.scenario.json) | `gradeRuleOrder` `collectEntries`, `score = "65"` | RULE ORDER with two matching rules, mapped to a list. |
| [default-hit-policy](default-hit-policy.scenario.json) | `gradeDefault`, `score = "65"` | An absent hit policy with two matches fails as UNIQUE. |
| [bad-output-type](bad-output-type.scenario.json) | `gradeBadOutput`, `score = "55"` | A matching rule whose output entry does not fit the declared output type. |
| [first-later-output-fails](first-later-output-fails.scenario.json) | `gradeFirstBadLater`, `score = "60"` | FIRST converts every matching rule's outputs before selecting, so a later rule's bad output fails. |
| [single-result-map](single-result-map.scenario.json) | `rating` `singleResult`, `score = "55"` | `singleResult` with two outputs writes a map. |
| [single-result-overlap](single-result-overlap.scenario.json) | `ratingRuleOrder` `singleResult`, `score = "65"` | `singleResult` over two matches fails. |
| [result-list-default](result-list-default.scenario.json) | `ratingRuleOrder`, no `mapDecisionResult`, `score = "65"` | The default `resultList` writes a list of maps. |
| [single-entry-two-outputs](single-entry-two-outputs.scenario.json) | `rating` `singleEntry`, `score = "55"` | `singleEntry` with two outputs fails. |
| [collect-entries-two-outputs](collect-entries-two-outputs.scenario.json) | `ratingRuleOrder` `collectEntries`, `score = "65"` | `collectEntries` across two outputs fails. |
| [no-result-variable](no-result-variable.scenario.json) | `gradeUnique` without `resultVariable`, `score = "55"` | Nothing is written. |
| [interval-endpoints-40](interval-endpoints-40.scenario.json), [interval-endpoints-70](interval-endpoints-70.scenario.json) | `bands`, `score = "40"` and `"70"` | Which interval end points are closed. |
| [boolean-tests-true](boolean-tests-true.scenario.json), [boolean-tests-false](boolean-tests-false.scenario.json) | `vipLabel`, Boolean `vip` | Boolean literal tests. |
| [boolean-from-string](boolean-from-string.scenario.json) | `vipLabel`, `vip = "TRUE"` | Conversion of text to `boolean`. |
| [null-test](null-test.scenario.json) | `channelNull`, `channel` a present Null | `null` matches a null input and a String literal does not. |
| [not-null-input](not-null-input.scenario.json) | `notBranch`, `channel` a present Null | A negated literal matches a null input. |
| [not-compare-null-input](not-compare-null-input.scenario.json) | `notSmall`, `score` a present Null | A negated comparison does not match a null input. |
| [decimal-literal](decimal-literal.scenario.json) | `fiveish`, `score = "5"` | Decimal literals against an Integer input. |
| [integer-from-string-plus](integer-from-string-plus.scenario.json), [integer-from-string-minus-zero](integer-from-string-minus-zero.scenario.json) | `signs`, `score = "+7"` and `"-0"` | Signed numeric text under `integer`. |
| [string-from-number](string-from-number.scenario.json) | `numberText`, `score = "1"` | A number output literal under `string`. |
| [dash-and-empty-entries](dash-and-empty-entries.scenario.json) | `dashes`, `score = "1"`, `channel = "web"` | `-` and an empty entry both match. |
| [fee-literal](fee-literal.scenario.json) | `fee`, `channel = "branch"` | A String literal test. |
| [fee-list](fee-list.scenario.json) | `fee`, `channel = "app"` | A list of String literals. |
| [fee-negation](fee-negation.scenario.json) | `fee`, `channel = "phone"` | A negated list. |
| [result-shadowed-in-subprocess](result-shadowed-in-subprocess.scenario.json) | `decision-contexts.bpmn`, root `grade = "root"`, `score = "55"` | The nearest-owner write when a Sub-Process binds the result name. |
| [after-effect-failure](after-effect-failure.scenario.json) | `decision-contexts.bpmn`, `score = "65"`, then the effect result | A UNIQUE overlap reached by an effect result. |
| [after-timer-failure](after-timer-failure.scenario.json) | `decision-contexts.bpmn`, `score = "65"`, then the Timer | A UNIQUE overlap reached by a Timer firing. |
| [form-at-most](form-at-most.scenario.json) | `atMost` `collectEntries`, `score = "10"` | `<=` and `>=` include their bound, `<` excludes it. |
| [form-negative-numbers](form-negative-numbers.scenario.json) | `negatives` `collectEntries`, `score = "-5"` | Negative literals as a test, interval ends and comparison bounds. |
| [form-fraction-without-whole-part](form-fraction-without-whole-part.scenario.json) | `halves` `collectEntries`, `score = "0"` | The `.5` and `-.5` number forms against an Integer input. |
| [form-inverted-interval](form-inverted-interval.scenario.json) | `inverted` `collectEntries`, `score = "55"` | An interval whose low end exceeds its high end matches nothing. |
| [form-escaped-quote](form-escaped-quote.scenario.json), [form-escaped-backslash](form-escaped-backslash.scenario.json) | `escapes` `singleEntry`, `channel` the text `a"b` and `a\b` | The `\"` and `\\` escapes of a String literal. |
| [form-boolean-output-true](form-boolean-output-true.scenario.json), [form-boolean-and-null-output](form-boolean-and-null-output.scenario.json) | `flags` `singleResult`, `score = "60"` and `"10"` | `true`, `false` and `null` output literals under `boolean` and `string`. |
| [unknown-decision](unknown-decision.scenario.json) | `noSuchDecision`, `score = "55"` | A Business Rule Task that names a decision no deployment contains. |
| [integer-from-large-decimal](integer-from-large-decimal.scenario.json) | `gradeUnique`, `score` the Decimal `3000000000` | A Decimal input beyond Java's `int` under an `integer` type. Predicted CIB answer: the decision fails and the start is rolled back, since `IntegerDataTypeTransformer` accepts a `Number` only when it equals its `int` narrowing. |
| [boolean-from-false-text](boolean-from-false-text.scenario.json) | `vipLabel`, `vip = "false"` | The text `false` under a `boolean` type. Predicted CIB answer: the `false` rule matches and `label` is `"regular"`. |
| [boolean-from-integer](boolean-from-integer.scenario.json) | `vipLabel`, `vip` the Integer `1` | An Integer input under a `boolean` type. Predicted CIB answer: the decision fails and the start is rolled back, since `BooleanDataTypeTransformer` takes only a Boolean or text. |
| [boolean-from-decimal](boolean-from-decimal.scenario.json) | `vipLabel`, `vip` the Decimal `0.5` | A Decimal input under a `boolean` type. Predicted CIB answer: the decision fails and the start is rolled back, since `BooleanDataTypeTransformer` takes only a Boolean or text. |
| [string-from-boolean](string-from-boolean.scenario.json) | `fee`, `channel` the Boolean `false` | A Boolean input under a `string` type. Predicted CIB answer: the input reads as the text `false`, which only the negated rule matches, since `StringDataTypeTransformer` is `String.valueOf`. |
| [first-no-match](first-no-match.scenario.json) | `gradeFirst` `singleEntry`, `score` a present Null | FIRST when no rule can test true. Predicted CIB answer: no rule matches and `grade` is null. |
| [any-no-match](any-no-match.scenario.json) | `gradeAnyAgree` `singleEntry`, `score` a present Null | ANY when no rule can test true. Predicted CIB answer: no rule matches and `grade` is null. |
| [any-boolean-outputs](any-boolean-outputs.scenario.json) | `anyBoolean` `singleEntry`, `score = "45"` | ANY over Boolean outputs that agree. Predicted CIB answer: ANY accepts two matching rules that give the same Boolean, and `result` is `true`. |
| [any-integer-outputs](any-integer-outputs.scenario.json) | `anyInteger` `singleEntry`, `score = "45"` | ANY over Integer outputs that agree. Predicted CIB answer: ANY accepts two matching rules that give the same Integer, and `result` is `1`. |
| [any-null-outputs](any-null-outputs.scenario.json) | `anyNull` `singleEntry`, `score = "45"` | ANY over null outputs that agree. Predicted CIB answer: ANY accepts two matching rules that both give null, and `result` is null. |
| [untyped-output](untyped-output.scenario.json) | `untyped` `singleEntry`, `score = "45"` | An output column with no `typeRef`. Predicted CIB answer: `result` is `"seen"`, the output literal as CIB holds an untyped text. |

## Observation boundary

- A failure inside a command (an overlap under UNIQUE, ANY or `singleResult`, a conversion failure, a mapper over two outputs) is the command's outcome, never a harness failure.
- CIB stores a decision's `HashMap` and `List` results through Java serialization. The runner projects a map with its entries sorted by name, as the kernel writes them. It projects a root list of Strings, the empty list included, as a String List, where the kernel writes a list of Strings; until the comparator equates the two, `collect-overlap`, `collect-no-match`, `rule-order-overlap`, `interval-endpoints-*` and `decimal-literal` differ in that kind alone.
