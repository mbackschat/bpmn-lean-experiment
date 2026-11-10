# Decision semantics

## Status

This is the interpretation for PC-AUTO-07. Its cold interpretation review ([review rule](../ARCHITECTURE-SPEC.md#review)) returned "approved with required changes" on 2026-11-10, and this revision carries those changes. The kernel, admission and reader code implement it (track M3, 2026-11-10); the CIB evidence for its witnesses is still to be retaken.

The [owner decision](../ARCHITECTURE-SPEC.md#owner-decisions-on-the-path) of 2026-11-08 binds it:

- DMN decision tables are evaluated in the kernel, in Lean and TypeScript.
- The hit policies are UNIQUE, FIRST, ANY, COLLECT and RULE ORDER.
- A bounded FEEL unary-test subset is admitted (literals, comparisons, ranges, lists, negation); other FEEL is refused.
- The specification is normative, CIB's DMN engine is the oracle, and Lean is the authority. No dependency is added.

This document says what a Business Rule Task does once its occurrence has begun, beside the [work semantics](WORK-SEMANTICS-SPEC.md). A Business Rule Task without `camunda:decisionRef` and with a delegate implementation stays `service` work ([work semantics](WORK-SEMANTICS-SPEC.md#script-and-business-rule-tasks)).

Paths are relative to the pinned CIB Seven `2.2.0` checkout ([SOURCES](../../SOURCES.md#dmn-13-and-feel)):

- `E/` is `engine/src/main/java/org/cibseven/bpm/engine/impl/`.
- `D/` is `engine-dmn/engine/src/main/java/org/cibseven/bpm/dmn/engine/impl/`.
- `M/` is `model-api/dmn-model/src/main/`.

## Normative basis

BPMN 2.0.2 §10.3.3 (Table 10.11) has the Business Rule Task send its InputOutputSpecification's data to a business rules engine and receive its output. The engine is named only by `implementation`. §13.3.3 completes the task when the rule evaluation ends. BPMN does not say how those data bind to the decision's inputs, or where a result goes without Data Output Associations; that is a profile selection, taken from CIB.

DMN 1.3 is normative for:

- the decision table: its inputs, outputs, rules and `typeRef`, and its hit policies, of which Unique, Any, First, Rule order and Collect without an aggregator are selected;
- the FEEL simple unary tests that its input entries are written in.

The DMN 1.3 reading copy is not yet in the external corpus ([SOURCES](../../SOURCES.md#dmn-13-and-feel)), so this document cites DMN by construct name and does not cite clause numbers. The model namespace (`M/java/org/cibseven/bpm/model/dmn/impl/DmnModelConstants.java:22-37`) and the XSD that CIB validates against (`M/resources/org/cibseven/bpm/model/dmn/schema/DMN13.xsd`) are pinned through CIB.

## CIB Seven 2.2.0

| Fact | Source |
|---|---|
| A Business Rule Task with `camunda:decisionRef` is a decision task, whatever delegate it also names. Its task activity is a scope. | `E/bpmn/parser/BpmnParse.java:2321-2324,2357-2360` |
| The decision is bound by `decisionRefBinding` (default latest), version, version tag and tenant. An unknown `mapDecisionResult` is a deployment error. `camunda:resultVariableName` is a legacy alias of `resultVariable`. | `E/bpmn/parser/BpmnParse.java:2366-2399,2221-2228` |
| The `latest` binding is resolved at every evaluation, against the deployments present then. | `E/util/DecisionEvaluationUtil.java:74`, `E/util/CallableElementUtil.java:127-151` |
| The result is kept in the transient task-local `decisionResult`. With `resultVariable` set, the mapped result is written with `execution.setVariable` from the task's scope execution, which is the nearest-owner write outward. A `resultVariable` named `decisionResult` hits that transient local. | `E/util/DecisionEvaluationUtil.java:79-87`, `E/core/variable/scope/AbstractVariableScope.java:327-345` |
| `singleEntry`: the only entry of the only result. It is null without a result and fails for two results or two entries. | `E/dmn/result/SingleEntryDecisionResultMapper.java`, `D/DmnDecisionResultImpl.java:51-58,98-105` |
| `singleResult`: the only result's entry map. It is null without a result and fails for two results. | `E/dmn/result/SingleResultDecisionResultMapper.java`, `D/DmnDecisionResultImpl.java:51-58` |
| `collectEntries`: the list of the one output's values. It is empty without a result and fails when the results name two outputs. | `E/dmn/result/CollectEntriesDecisionResultMapper.java` |
| `resultList`: the list of entry maps. Every entry map is a `HashMap`, so its order is unspecified. | `E/dmn/result/ResultListDecisionTableResultMapper.java` |
| Evaluation runs in three passes. Every input is evaluated and converted, and each input in turn filters the rules. Then every remaining matching rule's output entries are evaluated and converted. Only then does the hit policy apply. | `D/evaluation/DecisionTableEvaluationHandler.java:84-87,101-133,152-161` |
| An input entry with empty or blank text is true. | `D/evaluation/DecisionTableEvaluationHandler.java:199-214` |
| A blank output entry is left out of its rule's entry map (`returnBlankTableOutputAsNull` defaults to `false`). | `D/evaluation/DecisionTableEvaluationHandler.java:216-235`, `D/DefaultDmnEngineConfiguration.java:86` |
| An absent hit policy is UNIQUE. PRIORITY and OUTPUT ORDER have no handler and fail deployment. UNIQUE fails on two matches. ANY fails unless every matching rule's entry map equals the first, compared by output and typed value. | `D/transform/DmnDecisionTableTransformHandler.java:48-60`, `D/hitpolicy/DefaultHitPolicyHandlerRegistry.java:34-42`, `D/hitpolicy/UniqueHitPolicyHandler.java:35-39`, `D/hitpolicy/AnyHitPolicyHandler.java:41-71`, `D/delegate/DmnEvaluatedOutputImpl.java:69-80` |
| Two or more outputs each need a name, and names must be unique; a single output may be nameless. | `D/transform/DefaultDmnTransform.java:300-315` |
| Input expressions, input entries and output entries are FEEL (`feel-scala` `1.19.3`) unless the legacy behaviour is enabled. An `expressionLanguage` on an element, or on `definitions` when it is not a FEEL namespace, switches that expression to another language. | `D/DefaultDmnEngineConfiguration.java:104-131`, `D/transform/DmnExpressionTransformHelper.java:58-78`, root `pom.xml:31` |
| A `typeRef` name is matched ignoring case, and an unknown one converts nothing. A null value is never converted. A conversion failure is a `DmnEngineException`. | `D/type/DefaultDataTypeTransformerRegistry.java:41-61`, `D/type/DmnTypeDefinitionImpl.java:41-58` |
| `string` is `String.valueOf` and never fails. `boolean` takes a Boolean, or the String `true` or `false` in any case. `integer` takes an integral Number within `int`, or a String through `Integer.parseInt` (an optional sign, Unicode decimal digits, no whitespace). | `D/type/StringDataTypeTransformer.java`, `D/type/BooleanDataTypeTransformer.java`, `D/type/IntegerDataTypeTransformer.java:32-44` |
| DMN 1.1 to 1.5 namespaces are all accepted, and every resource is validated against its XSD at deployment. | `M/java/org/cibseven/bpm/model/dmn/impl/DmnModelConstants.java:22-37`, `M/java/org/cibseven/bpm/model/dmn/impl/DmnParser.java:56` |
| A failure reaches `executeWithErrorPropagation`. DMN exceptions are `RuntimeException`s rather than `ProcessEngineException`s, and a mapper failure wraps its DMN cause. An Error catcher whose code names that Java class, or a superclass such as `java.lang.RuntimeException`, catches the failure (CIB-EXT-0029). Otherwise the failure fails the reaching command or job. | `E/bpmn/behavior/DmnBusinessRuleTaskActivityBehavior.java:53-68`, `E/bpmn/helper/BpmnExceptionHandler.java:57-63`, `E/bpmn/parser/ErrorEventDefinition.java:75-97` |

## Selected contract

### 1. Admitted task

The admitted Business Rule Task has:

- a profile that selects decision tables (`ProfileOptions.businessRuleTask = decisionTable`, CIB-EXT-0032); the standards profile refuses every decision task (`work.rule`), since BPMN 2.0.2 §10.3.3 names no rule engine;
- a literal `camunda:decisionRef` naming a decision the program carries;
- the default (latest) binding and no tenant;
- `camunda:resultVariable` absent, or a name other than `decisionResult`;
- an absent `mapDecisionResult` (meaning `resultList`) or one of the four mapper names;
- `ioParameter` input and output mappings (PC-AUTO-08, [below](#mappings-on-a-decision-task)), no Data Association (`work.rule.dataAssociation`), and no Multi-Instance body. CIB's parser reads no Data Association (pinned `BpmnParse.java` has no such parse), and no item here gives a DataOutput a source.

A `decisionRef` takes precedence over a delegate, as in CIB, and the delegate attribute CIB ignores is refused as `reader.factNotCarried`. The legacy `resultVariableName` alias is refused as `reader.factNotCarried`, like every Camunda attribute the reader declares but does not carry.

### 2. Admitted DMN resource

- The resource's namespace is DMN 1.3 (`https://www.omg.org/spec/DMN/20191111/MODEL/`).
- An `expressionLanguage` is allowed only on `definitions`, and only as the DMN 1.3 FEEL namespace.
- Decision ids are unique across every resource the program carries.
- Every carried resource is admitted whole, as CIB deploys and validates every resource in its deployment.

### 3. Admitted decision

- The decision's logic is one decision table, with no information requirements.
- The hit policy is UNIQUE (also when absent), FIRST, ANY, RULE ORDER, or COLLECT without an aggregator.
- Each input expression is a bare name. Each input has a `typeRef` of exactly `string`, `integer` or `boolean` (lower case).
- Each output has a name, unique within the table, and a `typeRef` that is absent or one of those three.
- Each input entry follows the grammar below, and each test's kind agrees with its input's `typeRef`:
  - `integer`: number tests;
  - `string`: string literals;
  - `boolean`: `true` and `false`;
  - `null` is allowed under every `typeRef`.
- Each output entry is a non-blank literal:
  - a string, `true`, `false` or `null`;
  - an integer number literal within Java `int`, and only when the output's `typeRef` is `integer` or `string`.

Untyped inputs, untyped number outputs, decimal outputs, blank outputs and nameless outputs are refused. Their CIB results (identity conversion, `Long` or `Double` values, entries missing from the map, a `null` key) have no witness, and refusing them settles mismatched-kind tests statically.

### 4. FEEL subset (lexical and syntactic)

```
entry    := ws* ( "-" | tests | "not" ws* "(" ws* tests ws* ")" )? ws*     -- empty text is "-"
tests    := test ( ws* "," ws* test )*
test     := literal | cmp ws* number | interval
cmp      := "<=" | ">=" | "<" | ">"
interval := ( "[" | "(" | "]" ) ws* number ws* ".." ws* number ws* ( "]" | ")" | "[" )
literal  := number | string | "true" | "false" | "null"
number   := "-"? ( digit+ ( "." digit+ )? | "." digit+ )                 -- digit: ASCII 0-9
string   := '"' ( any char except '"', '\', CR, LF | '\"' | '\\' )* '"'
ws       := space | tab | CR | LF
```

- `[` and `]` close an interval end. `(` and `)` open it, and so do the reversed brackets: `]` as the low end and `[` as the high end.
- A number literal must lie in the portable domain:
  - at most 15 significant digits;
  - at most 9 digits after the point.

  Such a value is exact both as a Decimal128 and as a binary64, so the witnessed result does not depend on which one `feel-scala` uses.
- A number compares by value: `5` equals `5.0`. An interval whose low end exceeds its high end matches nothing.
- `true`, `false`, `null` and `not` are keywords. A bare name, another escape, another whitespace character, `+`, an exponent, a function, a date or a string comparison is `foreign` and is refused.
- An input expression is a bare name `[A-Za-z_][A-Za-z0-9_]*` that is not a keyword.

### 5. Evaluation

Evaluation happens in one step, with no open item:

1. The task's occurrence begins.
2. Each input is read by name from the variables visible from its scope occurrence, nearest owner first, and converted by its `typeRef` (item 7).
3. The rules are tested in document order, each one against every input.
4. Every matching rule's output entries are converted by their outputs' `typeRef`s. A conversion failure here fails the decision even under FIRST, and even when the hit policy would discard that rule.
5. The hit policy selects the result list:
   - UNIQUE: the one matching rule, or none.
   - FIRST: the first matching rule.
   - ANY: the first matching rule, when every matching rule's entries are equal by output name, kind and value. A typed equality is used: an Integer equals an Integer of the same value, and two nulls are equal.
   - RULE ORDER and COLLECT: every matching rule, in rule order.

Tests are three-valued (true, false or null), and a rule matches only when every entry is true:

- `-` is true.
- Equality:
  - A literal against a null input is false, except that `null` is true there.
  - A null literal against a non-null input is false.
  - A literal against an input value of the same kind compares by value.
- A comparison or an interval against a null input is null.
- A list is the three-valued disjunction of its tests.
- `not` swaps true and false and keeps null.

So `not("a")` matches a null input, and `not(< 5)` does not. The witnesses fix both before code.

### 6. Result

- The selected rules become a list of entry maps from output name to value, in output declaration order.
- The mapper turns that list into the written value as the CIB table states:
  - `singleEntry` gives the value;
  - `singleResult` gives a `map`;
  - `collectEntries` gives a `list` of values;
  - `resultList` gives a `list` of `map`s.
- Entry order is not part of the comparison, because CIB's maps are unordered; the kernel writes a `map` in the Data domain's key order.
- With a result variable, the value is written by the nearest-owner rule from the task's own scope, so a task-local input of that name holds it and ends with the task ([mappings](#mappings-on-a-decision-task)). Without a result variable nothing is written, because `decisionResult` is transient.
- How the differential projects CIB's Java collections onto these kinds is the [witness README](../../../scenarios/open-rows/business-rule-hit-policies/README.md)'s observation boundary.

### 7. Conversion

The kernel transcribes CIB's transformers for the values it can hold. Null is never converted.

| `typeRef` | Converts | Fails | `unsupported` (dynamic) |
|---|---|---|---|
| `integer` | an `int` within Java `int`. A `decimal` whose value is integral and within `int`. A string that is ASCII and matches `[+-]?[0-9]+` within `int`. | any other string; a boolean; a non-integral or out-of-range number | `decision-conversion-text`: a string with a non-ASCII character, whose Unicode digits the kernel does not decide. `decision-conversion-range`: a `decimal` with more than 15 significant digits, which CIB converts through `double`. |
| `boolean` | a boolean; an ASCII string equal to `true` or `false` ignoring ASCII case | any other value | `decision-conversion-text`: a string with a non-ASCII character, which Java's `equalsIgnoreCase` folds (`ſ` as `s`). |
| `string` | a string, unchanged; a boolean as `true`/`false`; an `int` as its decimal text | never | `decision-conversion-kind`: a `decimal`, list, map or `stringList`, whose Java text form the kernel does not decide. |

An input whose value is a list, a map or a `stringList` is `unsupported` (`decision-input-kind`) before any test.

### 8. Failure

A decision failure is any of these:

- two matches under UNIQUE;
- differing entries under ANY;
- a failed conversion of an input or of a matching rule's output;
- `singleEntry` with two results or two entries;
- `singleResult` with two results;
- `collectEntries` across two output names.

A decision failure takes the outcome the [expression semantics' stimulus table](EXPRESSION-SEMANTICS-SPEC.md#failure-semantics) gives an evaluation failure, with the code `decision-failed`:

| Stimulus that reached the task | CIB 2.2.0 | Kernel outcome under the CIB profile |
|---|---|---|
| a command (Start, task completion, a delivered Message or Signal, a variable update) | the command rolls back | `rolledBack` (`decision-failed`), state as before the command |
| an effect result | the job that completed the effect fails | `ContinuationFailure.incident` turns it into the effect's technical failure ([CIB-EXT-0026](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0026--a-continuation-failure-after-an-effect-result-fails-the-job)) |
| a job continuation after an asynchronous boundary | the job fails, and the boundary's commit stands | `unsupported` (`async-boundary-failure`) |
| a Timer firing | the timer job fails, retries, then raises an incident | `unsupported`, with the Timer code the expression semantics give |

An Error catcher coded with a Java class name would catch the failure in CIB. That relation is [CIB-EXT-0029](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0029--a-technical-failure-is-caught-by-an-error-code-that-names-its-java-exception-class), which no profile selects, so such a model is outside the claim.

The kernel reads an absent input variable as null, as `feel-scala` resolves an unknown name (`Feature.Decision.readInput`); `unique-absent-input` is its witness.

## Classification drafts

| Draft | Lane | Proposition |
|---|---|---|
| Decision tables | extension | A Business Rule Task's `camunda:decisionRef` names a DMN 1.3 decision table that the program carries. The kernel evaluates it within the subset above and writes the mapped result to `resultVariable` by the nearest-owner rule. Boundary: items 1 to 8, with no Error catcher coded with a Java class. |
| Decision binding time | limitation | CIB resolves a `latest` decision at every evaluation (`CallableElementUtil.java:127-151`); the kernel binds it once at program assembly, the program being fixed per instance ([binding time](#binding-time-of-a-latest-decision-reference)). Drafted as a CIB-LIM entry with a boundary line on CIB-EXT-0032; the Call Activity's version binding is PC-SCOPE-03's. |
| Collect order | interpretation | DMN 1.3 leaves the order of a COLLECT result open. CIB returns rule order, which the profile selects. |
| Entry-map order | operational mapping | CIB's entry maps are `HashMap`s. The kernel orders entries by output declaration, and the differential compares maps by name. |

## IL shape (proposed `kernel-shape` hunk)

The decision types go into a new module, `Kernel/IL/Types/Decision.lean`, paired with `packages/kernel/src/il/types/decision.ts`, because `Types.lean` is at its size boundary. The hunk also adds the codec, the schema, the vocabulary and the fixtures. Every constructor keeps at most a header and a payload (guard 9).

Every field outside the subset stays in the shape and is refused, so a later level widens admission without reinterpreting an accepted model.

```lean
inductive TypeRef where
  | string | integer | boolean
  | foreign (name : String)                      -- refused `decision.typeRef`, also any other spelling
inductive Comparison where
  | lt | le | gt | ge
inductive FeelLiteral where
  | null | bool (value : Bool) | number (coefficient : Int) (scale : Nat) | string (value : String)
structure Interval where
  low : FeelLiteral
  lowClosed : Bool
  high : FeelLiteral
  highClosed : Bool
inductive UnaryTest where
  | literal (value : FeelLiteral)
  | compare (operator : Comparison) (bound : FeelLiteral)
  | interval (value : Interval)
structure TestList where
  negated : Bool
  first : UnaryTest                              -- a test list is never empty
  rest : List UnaryTest := []
structure ForeignText where
  language : Option String                       -- an element-level `expressionLanguage`
  text : String
inductive InputEntry where
  | any                                          -- `-` or empty text
  | tests (value : TestList)
  | foreign (value : ForeignText)                -- refused `decision.feel`
inductive OutputEntry where
  | literal (value : FeelLiteral)
  | blank                                        -- refused `decision.blankOutput`
  | foreign (value : ForeignText)                -- refused `decision.feel`
inductive InputExpression where
  | variable (name : String)
  | foreign (value : ForeignText)                -- refused `decision.inputExpression`
structure DecisionInput where
  expression : InputExpression
  typeRef : Option TypeRef                       -- none refused `decision.inputType`
structure DecisionOutput where
  name : Option String                           -- none or duplicate refused `decision.outputName`
  typeRef : Option TypeRef
structure DecisionRule where
  id : String
  inputs : List InputEntry
  outputs : List OutputEntry
inductive HitPolicy where
  | unique | first | any | ruleOrder | collect
  | priority | outputOrder                       -- refused `decision.hitPolicy`
inductive CollectAggregator where
  | sum | min | max | count                      -- refused `decision.hitPolicy`
structure DecisionTable where
  hitPolicy : HitPolicy := .unique
  aggregation : Option CollectAggregator := none
  inputs : List DecisionInput
  outputs : List DecisionOutput
  rules : List DecisionRule
inductive DecisionLogic where
  | table (value : DecisionTable)
  | foreign (element : String)                   -- e.g. `literalExpression`; refused `decision.logic`
structure Decision where
  id : String
  logic : DecisionLogic
  requires : List String := []                   -- refused `decision.requirements`
structure DecisionResource where
  sourceSha256 : String
  namespace : String                             -- other than DMN 1.3 refused `decision.namespace`
  expressionLanguage : Option String := none     -- other than FEEL 1.3 refused `decision.expressionLanguage`
  decisions : List Decision
-- Program gains `decisionResources : List DecisionResource := []`.
-- RuleWork gains `tenant : Option ValueSource := none` (refused `work.rule.tenant`).
```

## Refusal codes

| Code | Refused |
|---|---|
| `work.rule` | a decision task under a profile that selects no decision tables (`ProfileOptions.businessRuleTask = refused`) |
| `work.rule.dataAssociation` | a Data Input or Output Association on a decision task |
| `work.rule.decisionExpression` | a `decisionRef` given by an expression |
| `work.rule.binding`, `work.rule.tenant` | a binding other than latest; a tenant |
| `work.rule.decisionMissing` | a `decisionRef` that no carried resource declares |
| `work.rule.resultVariable` | `resultVariable="decisionResult"`, which CIB writes onto the transient task-local |
| `reader.unknownAttributeValue` (existing) | an unknown `mapDecisionResult`, which is a deployment error in CIB |
| `reader.factNotCarried` (existing) | `resultVariableName` |
| `reader.unknownAttribute` (existing) | an attribute in a foreign namespace on a DMN element; an undeclared unprefixed one is a parser warning |
| `decision.namespace`, `decision.expressionLanguage` | a DMN namespace other than 1.3; any `expressionLanguage` other than FEEL 1.3 on `definitions` |
| `decision.duplicateId` | one decision id in two carried resources |
| `decision.logic`, `decision.requirements` | a decision that is not a table; information requirements |
| `decision.hitPolicy` | PRIORITY, OUTPUT ORDER, or an aggregator |
| `decision.inputExpression`, `decision.inputType` | an input expression other than a bare name; an input without a `typeRef` |
| `decision.typeRef` | a `typeRef` other than lower-case `string`, `integer`, `boolean` |
| `decision.outputName` | a nameless or duplicate output name |
| `decision.feel` | an entry outside the grammar, or with an element-level language |
| `decision.testKind` | a test whose literal kind disagrees with its input's `typeRef` |
| `decision.number` | a number literal outside the portable domain; a decimal output; a number output without a `typeRef`, or under `boolean` |
| `decision.blankOutput` | a blank output entry |
| `decision.schema` | a violation of the DMN 1.3 XSD's required attributes or cardinalities within the declared types |
| dynamic `decision-failed` | item 8 |
| dynamic `unsupported` codes | `decision-conversion-text`, `decision-conversion-range`, `decision-conversion-kind`, `decision-input-kind` (item 7) |

`activity.inputMappings`, `activity.outputMappings` and `activity.multiInstanceBody` keep refusing those envelope fields.

## Parser and source binding

The DMN parser is a project-authored moddle package descriptor for the subset's types:

- It is passed as an extra package in the `BpmnModdle` constructor's `packages` argument, and a resource is read with `fromXML(xml, "dmn:Definitions")`.
- This adds no import of `moddle` and no `package.json` change.
- The descriptor also declares `literalExpression` and `informationRequirement`, so those reach their stable refusal codes.

Every other DMN element or attribute is a parser warning, and every parser warning blocks admission. CIB also validates against the DMN 1.3 XSD at deployment. Within the declared types, the reader checks the XSD's required attributes and cardinalities for those types, and refuses a violation as `decision.schema`. A failure of a type outside the subset is already a warning.

A scenario binds each DMN resource by its SHA-256 digest beside its BPMN source. That is a `contracts/schemas` change of the scenario document. The CIB runner must deploy every bound resource in the BPMN's deployment.

## Witness plan

Retained [hit-policy witnesses](../../../scenarios/open-rows/business-rule-hit-policies/README.md):

- every selected hit policy with overlap and with no match;
- the `singleEntry` and `collectEntries` mappers;
- String literal, list and negated tests;
- a wrong input type, an absent input, an output entry outside its `typeRef`, and an unknown decision.

The retained [routing witnesses](../../../scenarios/open-rows/business-rule-routing/README.md) cover PC-AUTO-08 ([its interpretation](#pc-auto-08-interpretation)).

New witnesses, all in the hit-policy directory; their selecting gateway needs M2's Core JUEL level:

| Witness | Separates |
|---|---|
| `single-result-map` | `singleResult` with two outputs, written to the root |
| `single-result-overlap` | `singleResult` over RULE ORDER with two matches fails |
| `result-list-default` | absent `mapDecisionResult` writes a list of maps |
| `single-entry-two-outputs` | `singleEntry` with two outputs fails |
| `collect-entries-two-outputs` | `collectEntries` across two outputs fails |
| `no-result-variable` | nothing is written |
| `first-later-output-fails` | FIRST fails on a later matching rule's output conversion |
| `default-hit-policy` | an absent hit policy with two matches fails as UNIQUE |
| `interval-endpoints` | `[40..70]`, `]40..70[`, `(40..70]`, `[40..70)` at 40 and 70 |
| `boolean-tests` | `true` and `false` against a boolean input |
| `null-test` | `null` matches a null input; a String literal does not |
| `not-null-input` | `not("branch")` matches a null input |
| `not-compare-null-input` | `not(< 5)` does not match a null input |
| `decimal-literal` | `5.0` and `[4.5..5.5]` against Integer `5` |
| `integer-from-string` | `"+7"` and `"-0"` under `integer` |
| `boolean-from-string` | `"TRUE"` under `boolean` |
| `string-from-number` | an integer output literal under `string` gives `"5"` |
| `dash-and-empty-entries` | `-` and an empty `<text/>` both match |
| `result-shadowed-in-subprocess` | the nearest-owner write when a Sub-Process binds the name |
| `after-effect-failure` | a UNIQUE overlap reached by an effect result |
| `after-timer-failure` | a UNIQUE overlap reached by a Timer firing |

The `form-*` witnesses on [forms.dmn](../../../scenarios/open-rows/business-rule-hit-policies/forms.dmn) cover the forms the tables above leave out:

| Witness | Separates |
|---|---|
| `form-at-most` | `<=` and `>=` include their bound, `<` excludes it |
| `form-negative-numbers` | negative literals as a test, interval ends and comparison bounds |
| `form-fraction-without-whole-part` | the `.5` and `-.5` number forms |
| `form-inverted-interval` | an interval whose low end exceeds its high end matches nothing |
| `form-escaped-quote`, `form-escaped-backslash` | the `\"` and `\\` String escapes |
| `form-boolean-output-true`, `form-boolean-and-null-output` | `true`, `false` and `null` output literals |

Every admitted form appears in at least one witness. A form the plan does not witness is refused by a code above.

CIB evidence needs the runner to deploy each scenario's bound `*.dmn` and to realize a Business Rule Task. No runner dependency is needed, because the DMN engine and `feel-scala` ship with CIB.

Kernel tests cover:

- each hit policy, mapper and conversion in Lean and TypeScript;
- the FEEL subset parser in the reader;
- every refusal row.

## PC-AUTO-08 interpretation

Status: the cold interpretation review (2026-11-10) approved this text with required changes, which it folds in. The decision-task mappings are implemented in `Feature.Work.evaluateDecision` and admitted by the `rule` arm of `Admission.Work.traits`, both with their TypeScript pairs. Two meanings are added: when a `latest` decision reference binds, and the mappings of a decision task whose result feeds routing and a send. The version binding of a Call Activity's called element is PC-SCOPE-03's, decided by that row's review against its own two-version population witness; this section claims nothing about it.

### Binding time of a `latest` decision reference

BPMN 2.0.2 names a Business Rule Task's engine by `implementation` (§10.3.3) and knows no deployment or version. `camunda:decisionRef` is the CIB extension that names the decision (CIB-EXT-0032), so when it binds is that extension's boundary.

CIB binds at every use:

| Fact | Source |
|---|---|
| A decision task resolves its decision at every evaluation; `latest` is the deployed definition of the key with the highest version at that moment. | `E/util/DecisionEvaluationUtil.java:121-123`, `E/util/CallableElementUtil.java:127-151` |
| A missing key throws `DecisionDefinitionNotFoundException`. | `E/persistence/deploy/cache/DecisionDefinitionCache.java:67-69` |
| That exception is a `ProcessEngineException` without a cause, so the behavior rethrows it rather than raising a BPMN Error, and the reaching command rolls back. | `E/bpmn/helper/BpmnExceptionHandler.java:57-60,70-72` |

The kernel binds once, at program assembly. A program carries its decisions without versions, and two carried decisions with one id are refused (`decision.duplicateId`), so a program names exactly one decision per key. Every step of an instance receives the same program, which is fixed per instance, so `Decision.runDecision` (`feature/decision.ts`) looks up that one decision through recovery and replay. The binding is therefore the program's, not a per-instance record.

Classification: CIB's per-use binding is the relation. The kernel's assembly binding is a profile limitation, drafted as a CIB-LIM entry, with a boundary line on CIB-EXT-0032. The two agree when no deployment touches the key between the assembly of the caller's program and the evaluation. They differ in these cases, each outside the claim:

1. **A later deployment of the key.** CIB evaluates the new version; the kernel evaluates the assembled one.
2. **A key missing at assembly.** The kernel refuses the whole model (`work.rule.decisionMissing`), also for runs that never reach the task. CIB deploys it, runs those runs, and rolls back only the command that reaches the missing key. This holds whether the key is deployed later or never.
3. **A key undeployed or deleted after assembly.** The kernel still evaluates the assembled decision; CIB rolls back the reaching command.

No witness separates the readings. Every retained witness deploys its BPMN and DMN resources together, and a two-version population cannot be admitted, because one program cannot carry two decisions of one key.

### Mappings on a decision task

CIB makes a decision task with `camunda:decisionRef` a scope (`E/bpmn/parser/BpmnParse.java:2357-2360`). The task's work runs in this order:

1. Its input parameters set locals before the evaluation.
2. The behavior evaluates the decision. It sets the transient `decisionResult` locally and the mapped result with `setVariable` (`E/util/DecisionEvaluationUtil.java:82-86`). The result reaches the nearest owner of the result variable, a task-local of that name included.
3. Then it leaves. The task's outgoing conditions are evaluated before its output parameters (CIB-INT-0011, which both CIB profiles select as `conditionOrder = beforeOutputs`).
4. The output parameters are evaluated in the task's execution (CIB-EXT-0031).

The [routing witnesses](../../../scenarios/open-rows/business-rule-routing/README.md) declare `outcome` task-local, map the `singleResult` map into it, and copy `${outcome.grade}` and `${outcome.limit}` out.

The kernel admits `ioParameter` input and output mappings on a decision task (`Feature.Work.evaluateDecision`):

1. The inputs open the task's local scope, as for a Service Task.
2. The decision reads its inputs from that scope.
3. The result is written outward from that scope, as its own signal ahead of the completion.
4. The completion's outgoing conditions run in the completion pipeline's place for the profile's `ConditionOrder`. Under `beforeOutputs` they read the result and the variables before the outputs; under `afterOutputs` they read the outputs.
5. The outputs read the result where its write left it: under `OutputContext.activityScope` a task-local of its name shadows, and otherwise an earlier output's write of its name comes first (`Ctx.outputReads`, CIB-EXT-0031), as CIB's `setVariable` placed it (`E/util/DecisionEvaluationUtil.java:86`). A result no output reads is no error.
6. The task-local result ends with the task.

A failed decision writes nothing and maps nothing (§8), so routing never reads fabricated success data. Each output parameter is its own mapping, so multiple declared outputs map independently.

A JUEL read of `decisionResult` in an output parameter, a condition, or anywhere else is refused (`expression.juel.decisionResult`, `Admission.Data.juelName`). CIB binds that name only as the transient local of a decision task's execution, and the kernel carries no such binding. A Multi-Instance decision task stays refused.

### Witness plan

- The six retained routing schedules (`high-grade-review`, `low-grade-send`, `mid-grade`, `overlap`, `no-match`, `wrong-type-input`) bind `routing.dmn` and await CIB's answer.
- The new [routing condition-order witness](../../../scenarios/open-rows/business-rule-routing/README.md) puts a condition on the decision task's own outgoing flow that reads a variable the task's outputs overwrite.
- The kernel tests `work-decision-mappings` and `admission-refusals-decision` cover each step above, in Lean and TypeScript.

## Open questions for the review

None remain. The revision settles the earlier two: untyped inputs are refused, and `long` and `double` stay outside the first subset.
