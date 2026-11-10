# JUEL core forms

Answer-free schedules for [PC-DATA-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (the read-only JUEL binding) and the expression-input half of [PC-DATA-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): one model per family of JUEL forms, each a User Task *Observe* whose input mappings evaluate one expression per form against the start variables. The core level of the [evaluation decision](../../../docs/kernel/ARCHITECTURE-SPEC.md#runtime-state-and-step) and the [JUEL decision](../../../docs/JUEL-EVALUATION-ARCHITECTURE-DECISION.md) own the subset; the [data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md) own the mapping rule. The retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay.

Every model has the shape Start Event, User Task *Observe*, End Event, and every schedule has one stimulus, the start. The open task's input mappings are the observation: each input is named for its form and holds that form's value, a present Null where the form evaluates to null. A family sits in one task so that its forms share one context; a form whose evaluation can fail has its own probe in [juel-evaluation-failures](../juel-evaluation-failures/README.md). The forms the core level treats as a closed table or refuses, the registered functions and the methods of String, List and Map values, have their own families below, so that the evidence shows which of them CIB evaluates.

| Schedule | Model | Case it separates | Row |
|---|---|---|---|
| [arithmetic](arithmetic.scenario.json) | [arithmetic](arithmetic.bpmn) | Integer `+`, `-`, `*`, `%` and `mod`, precedence, parentheses, left associativity, unary minus, literal operands. | PC-DATA-07, PC-DATA-05 |
| [division](division.scenario.json) | [division](division.bpmn) | `/` and `div` over Integers and over a Double literal, exact and inexact quotients, each published as composite text (`slashExact=${a / b}`), since the canonical result holds no Double. | PC-DATA-07, PC-DATA-05 |
| [decimal-operands](decimal-operands.scenario.json) | [decimal-operands](decimal-operands.bpmn) | A Decimal Process variable with Integer and Decimal operands, comparison against Integer literals, and the Decimal passed through unchanged. The floating-literal comparison is in [juel-core-table](../juel-core-table/README.md). | PC-DATA-07, PC-DATA-05 |
| [relational](relational.scenario.json) | [relational](relational.bpmn) | `==`, `!=`, `<`, `>`, `<=`, `>=` and their word forms over Integers, Strings and a Boolean, and relational against equality precedence. | PC-DATA-07, PC-DATA-05 |
| [logical](logical.scenario.json) | [logical](logical.bpmn) | `&&`, `and`, `||`, `or`, `!`, `not`, double negation, and `and` against `or` precedence. | PC-DATA-07, PC-DATA-05 |
| [lazy-operands](lazy-operands.scenario.json) | [lazy-operands](lazy-operands.bpmn) | An operand naming a variable no binding declares, on the branch that `and`, `or` and `?:` skip. | PC-DATA-07, PC-DATA-05 |
| [empty-operator](empty-operator.scenario.json) | [empty-operator](empty-operator.bpmn) | `empty` over an empty and a non-empty String, a present Null, an empty and a non-empty List and Map, a zero, a Boolean, a property and an element. | PC-DATA-07, PC-DATA-05 |
| [ternary-operator](ternary-operator.scenario.json) | [ternary-operator](ternary-operator.bpmn) | `?:` with Boolean and computed conditions, nesting, differently typed branches, a Null branch, and a ternary as an operand. | PC-DATA-07, PC-DATA-05 |
| [literals-and-text](literals-and-text.scenario.json) | [literals-and-text](literals-and-text.bpmn) | Integer, String, Boolean and Null literals, delimiter-free text, composite text, adjacent expressions, the deferred `#{}` delimiter, an escaped quote, an escaped delimiter. | PC-DATA-07, PC-DATA-05 |
| [access-scalar-results](access-scalar-results.scenario.json) | [access-scalar-results](access-scalar-results.bpmn) | `.` and `[]` access over nested Maps and a List of Maps, bracket and dot interchange, a variable and a computed index, a variable key, scalar results only. | PC-DATA-07, PC-DATA-05 |
| [access-structured-results](access-structured-results.scenario.json) | [access-structured-results](access-structured-results.bpmn) | Structured results of `.` and `[]`: the whole Map, a nested Map, the whole List, a List element, and equality of equal and unequal List elements. | PC-DATA-07, PC-DATA-05 |
| [absent-and-null-access](absent-and-null-access.scenario.json) | [absent-and-null-access](absent-and-null-access.bpmn) | A present-Null Map entry, a Map key no entry has, a property of a Null, `== null` and `empty` over each, Null in arithmetic, an absent entry below an absent entry. | PC-DATA-07, PC-DATA-05 |
| [coercion](coercion.scenario.json) | [coercion](coercion.bpmn) | Coercions between Integer, String, Boolean and Null operands: numeric text in arithmetic and comparison, text and Null as a Boolean operand, `==` across types, text against text, an empty String. | PC-DATA-07, PC-DATA-05 |
| [string-methods](string-methods.scenario.json) | [string-methods](string-methods.bpmn) | Read-only methods on a String value, with and without arguments, on a literal, and chained. | PC-DATA-07, PC-DATA-05 |
| [list-methods](list-methods.scenario.json) | [list-methods](list-methods.bpmn) | Read-only methods on a List value, and a method result used as an operand and as an index. | PC-DATA-07, PC-DATA-05 |
| [map-methods](map-methods.scenario.json) | [map-methods](map-methods.bpmn) | Read-only methods on a Map value, a key the Map lacks, and a method result that is itself called on. | PC-DATA-07, PC-DATA-05 |
| [functions](functions.scenario.json) | [functions](functions.bpmn) | The function-call forms CIB registers with no object to call on: `currentUser()`, `currentUserGroups()`, `now()` and `dateTime()`, each reduced to a Boolean. | PC-DATA-07, PC-DATA-05 |

The method families name the read-only methods the [core level](../../../docs/kernel/ARCHITECTURE-SPEC.md#runtime-state-and-step) calls "a closed list" without yet fixing the list; the schedules offer the usual read-only methods of each value kind so that the evidence can show which of them CIB evaluates.

Notes for the target runners:

- Gap: Double results: the runner's value projection carries no Double.
- Gap: Decimal start values and results: the runner's value projection carries no Decimal.
- Gap: List and Map start values.
- Gap: Map and List results of an input mapping.
- Gap: Map start values.
- Gap: List start values.
- The Map and List start values of the families that carry them are realized only once the runner projects Map and List variables.
- `functions` reads CIB's registered functions, which answer from the engine context and the engine clock; the runner's logical epoch fixes the clock, and no schedule depends on its value.
