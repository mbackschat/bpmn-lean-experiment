# Expression semantics

## Status

Interpretation for [PC-DATA-07](../../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), the Core JUEL level of the [evaluation decision](../ARCHITECTURE-SPEC.md#runtime-state-and-step). Written 2026-11-10, revised the same day after the cold interpretation review (approved with required changes) and the root's binding decisions; the track's combined review checks this revision with the code that implements it.

It owns the meaning of a JUEL expression at the Core level: which source text is JUEL, the grammar admitted, how an expression evaluates over the portable value domain, what each failure does at each site, and what admission refuses. The [data semantics](DATA-SEMANTICS-SPEC.md) keep owning which bindings a site reads and where a result is written; the [JUEL decision](../../JUEL-EVALUATION-ARCHITECTURE-DECISION.md) keeps its read-only context rules; the [Simple Boolean decision](../../SIMPLE-BOOLEAN-EXPRESSION-DECISION.md) keeps the standards profile's language.

Row-text decisions (root, 2026-11-10), which the root records in the coverage target at closure:

- PC-DATA-07's "exact retained text" clause is met by the retained source bytes, which `@bpmn-lean/bpmn-source` preserves, together with the reader's meaning-preserving parse into the IL. The IL carries no copy of the text.
- PC-DATA-06's "no captured-input fallback" is the standards profile's reading. CIB's output context (an output parameter evaluated in the Activity's own scope) is a registered extension, classified rather than imitated silently ([CIB relations](#cib-relations)).

## Authority and citations

Syntax and coercion follow the Expression Language specification at the grammar level of the pinned `cibseven-juel`: EL 2.2 (JSR 245 Maintenance Release 2) with method invocations, without the lambda, assignment and collection-literal syntax of EL 3.0, on the shaded Jakarta EL 4.0 API. Sections are cited as "EL §n" by their EL 2.2 numbers. The pinned evaluator is the behavioral oracle; a difference between the two is classified in the [relation register](../../CIB-BPMN-RELATION-REGISTER.md), never by majority. CIB source paths are relative to the pinned checkout `../oss/cibseven/cibseven` at `5a45b47`, whose `juel/` and `engine/.../impl/el/` trees are identical to the `v2.2.0` tag `834a9874` apart from `juel/pom.xml`. `Parser`, `Scanner`, `NumberOperations`, `BooleanOperations`, `TypeConverterImpl` and the `Ast*` classes live in `juel/src/main/java/org/cibseven/bpm/impl/juel/`; engine classes are named by their package tail.

The pinned operator and coercion code implements EL §1.7 to §1.10 and §1.18 clause by clause. The points EL leaves open are settled by the pinned code and stated below as such: a backslash before a backslash in text, Java's character classes, and which Java class carries an integer.

## Which text is JUEL

| Site | Source form | Reading under a profile selecting `Evaluator.juel` |
|---|---|---|
| Sequence Flow condition | `conditionExpression` with no `language` attribute, in Definitions with no `expressionLanguage` | JUEL, as CIB reads it (`bpmn/parser/BpmnParse.java:4411-4412`), its text trimmed as CIB trims it (`:4394`, `:4400`; the [condition-whitespace](../../../scenarios/open-rows/condition-whitespace/README.md) witnesses); draft [CIB-EXT-0030](#cib-relations). Covers the conditions of a Gateway's and of an Activity's outgoing flows, which CIB evaluates before the Activity's output writes ([CIB-INT-0011](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0011--an-activitys-outgoing-conditions-evaluate-before-its-output-writes)) |
| Sequence Flow condition | `language` attribute present (`juel`, `javascript`, …) | refused (`flow.condition.foreign`): CIB runs it as a script condition through a different engine (`BpmnParse.java:4413-4416`, `scripting/engine/JuelScriptEngine.java`), the Script binding of PC-AUTO-05 |
| Sequence Flow condition | Definitions declares `expressionLanguage` | refused (`flow.condition.foreign`): CIB ignores the declaration and evaluates JUEL; the model says otherwise |
| Sequence Flow condition | `camunda:resource` | refused by the reader as the not-carried fact `camunda:resource` (`reader.factNotCarried`), which no IL field holds; CIB reads it only with a `language` |
| Activity or Sub-Process | `camunda:inputParameter`, `camunda:outputParameter` text containing `${` or `#{`, trimmed as CIB trims it (`BpmnParseUtil.java:206`) | JUEL |
| Activity or Sub-Process | a `camunda:list` or `camunda:map` parameter value, its entries and map keys (`BpmnParseUtil.java:169-191`) | refused by the reader (`reader.unknownExtension`): Core builds no collection from text |
| Call Activity | `camunda:in`/`camunda:out` `sourceExpression` | JUEL with the `ioParameter` failure rule (`BpmnParse.java:4152-4157`, `el/ElValueProvider`) |
| Call Activity | `camunda:in`/`camunda:out` `local="true"` | refused by the reader as the not-carried fact `camunda:in/out local` (`reader.factNotCarried`) |
| Timer value, Message name, Conditional Event predicate | a `timeDate`, `timeDuration` or `timeCycle` text, a Message `name`, the `condition` of a Conditional Event Definition | JUEL at the Events level, under a profile selecting `Evaluator.juel` (see [subscriptions](SUBSCRIPTIONS-SEMANTICS-SPEC.md)); outside that level refused (`expression.outsideJuel`) |
| any other expression site | Signal names, correlation keys, business key, task fields, event output parameters, Data Association `transformation` | refused at Core (`expression.juel.site`); each later level of the [evaluation table](../ARCHITECTURE-SPEC.md#runtime-state-and-step) admits its own sites; the [Multi-Instance level](#multi-instance-level) admits the loop's collection, cardinality and completion condition |

A condition with neither `xsi:type` nor `language` is a BPMN `Expression`, which §8.4.6 calls non-executable; CIB evaluates it like a `tFormalExpression`, and the draft extension covers both. An explicit `xsi:type="tExpression"` on a Sequence Flow condition is a deployment error in CIB, which accepts only `tFormalExpression` there (`BpmnParse.java:4404-4407`); the reader refuses it as `reader.conditionExpressionType` under every profile, since BPMN calls that type non-executable too ([condition-language-declarations](../../../scenarios/open-rows/condition-language-declarations/README.md) `explicit-texpression`). An `xsi:type` naming no BPMN expression type is refused by the reader's schema check (`source.schema`). Under the standards profile every JUEL expression stays refused, with the codes the sites give today (`mapping.expression`, `flow.condition.foreign`, `expression.juel.site`).

The reader parses every CIB value expression and every undeclared condition as JUEL whatever the profile; a profile admits or refuses the result, so the reader selects no profile. Exactly `${name}`, with `name` an identifier that is no reserved word, stays the evaluator-neutral `Expression.variable`, and text with no `${` or `#{` in a parameter stays a String `Expression.literal`; both evaluate identically under either evaluator. A condition's text is always parsed, so a plain-text condition such as `true` is a String, which fails the condition as in CIB. A `camunda:in` with a `source` attribute stays a `callVariable` copy that reads an absent name as null (CIB-EXT-0021, `core/model/CallableElementParameter.java:40-50`); a `sourceExpression` is an `ioParameter` mapping and fails on an absent name like any other expression.

## Grammar at Core

The reader transcribes `Scanner` and `Parser` exactly, so the admitted language is defined by them and EL §1.19; admission then refuses the productions Core leaves out. Scanning:

- Outside an eval, text runs to the next unescaped `${` or `#{` (`Scanner.nextText`, `Scanner.java:233`). A backslash escapes a following `${` or `#{`; a backslash before any other character stays in the text; a backslash after a backslash appends one backslash and leaves the escape armed, so `\\${x}` is the text `\${x}`. EL §1.2.4 leaves this case open; the scanner settles it.
- Inside an eval, whitespace is Java `Character.isWhitespace` (`Scanner.java:455`) restricted to ASCII: space, tab, line feed, vertical tab, form feed, carriage return and U+001C to U+001F. The non-ASCII whitespace Java also accepts (U+1680, U+2000 to U+2006, U+2008 to U+200A, U+2028, U+2029, U+205F, U+3000) leaves the text unparsed, so the ASCII rule below wins over Java's class; draft CIB-LIM-0009.
- Identifiers are Java identifiers (`Scanner.java:408`); the reader admits only ASCII ones (start `[A-Za-z_$]`, part `[A-Za-z0-9_$]` and the ASCII identifier-ignorable controls U+0000 to U+0008, U+000E to U+001B and U+007F), and any non-ASCII character outside a string literal leaves the text unparsed.
- Reserved words are scanned as keywords, never identifiers: `and or not eq ne lt gt le ge true false null empty div mod instanceof` (`Scanner.java:149-164`, EL §1.14). `instanceof` has no production, so it is a syntax error.
- An integer literal is a digit run read by `Long.valueOf` (`Parser.java:140`), leading zeros allowed; one above 2^63−1 is a syntax error. A floating literal (a `.` or an exponent, `Scanner.nextNumber`) is a `Double` (`Parser.java:154`).
- A string literal is quoted by `'` or `"`; inside it only `\\` and the escaped quote are escapes, anything else is a syntax error (`Scanner.nextString`).

Productions (`Parser.java:269-723`), each admitted or refused at Core:

| Production | Pinned source | Core |
|---|---|---|
| text; composite of text and evals; one eval alone | `tree`, `text`, `eval` | admitted; a composite whose first eval is `#{` takes only `#{` evals and vice versa (`Parser.java:292`, EL §1.2.3), else a syntax error |
| `${expr}`, `#{expr}` | `eval` | admitted; both evaluate immediately in CIB (`el/JuelExpressionManager.java:84-87`) |
| `a ? b : c` | `expr` | admitted |
| `or`/`||`, `and`/`&&` | `or`, `and` | admitted |
| `==`/`eq`, `!=`/`ne` | `eq` | admitted |
| `<`/`lt`, `>`/`gt`, `<=`/`le`, `>=`/`ge` | `cmp` | admitted |
| `+`, `-` | `add` | admitted |
| `*`, `%`/`mod` | `mul` | admitted |
| `/`/`div` | `mul` | refused `expression.juel.division`: over Integers the result is a Double (EL §1.7.2) |
| unary `!`/`not`, `-`, `empty` | `unary` | admitted |
| `( expr )` | `nonliteral` | admitted |
| identifier | `nonliteral` | admitted, except CIB's engine-context names and Multi-Instance counters, which admission refuses (below; a completion condition reads the counters under the [Multi-Instance level](#counter-values)) |
| `true`, `false`, `null`, string, integer literal | `literal` | admitted |
| floating literal | `literal` | refused `expression.juel.floatLiteral`: a Double |
| `f(args)`, `ns:f(args)` | `nonliteral`, `function` | refused `expression.juel.function` |
| `base.name`, `base[expr]` | `value` | admitted |
| `base.name(args)` | `value`, `AstMethod` | admitted when `name` and the argument count denote a [listed method](#methods), else refused `expression.juel.method` |
| `base[expr](args)` | `value` | refused `expression.juel.computedMethod` |

The pinned factory uses the JEE6 profile, method invocations and varargs on and null properties off (`ExpressionFactoryImpl.java:87,134`, `el/JuelExpressionManager.java:66`), so `base[null]` evaluates to null.

## Evaluation

### Context

An expression evaluates against every binding visible from the site's scope occurrence, innermost first, a present null included ([data semantics](DATA-SEMANTICS-SPEC.md#process-data-and-start)): the JUEL decision's complete read-only context. Nothing else resolves. CIB's resolver chain also yields the engine objects, the configured beans and the registered functions (`JuelExpressionManager.java:142-163`, `el/VariableScopeElResolver.java:51-90`, `cfg/ProcessEngineConfigurationImpl.java:2723-2731`). Admission refuses the engine-context names and, outside a completion condition under the [Multi-Instance level](#counter-values), the Multi-Instance counters, and every function call; a bean name stays a plain identifier, because bean names are product names that never enter the IL ([boundaries](../../../CLAUDE.md#non-negotiable-boundaries)), so a bean the environment registers and no binding shadows is an unknown variable in the kernel where CIB resolves it (draft CIB-CFG-0011). An input mapping reads the context outside the occurrence it fills (`core/variable/mapping/InputParameter.java:46`); an output mapping reads the context the data semantics give it (`OutputParameter.java:47` reads the Activity's own scope; selected by `OutputContext`, see the [data semantics](DATA-SEMANTICS-SPEC.md#activity-data)). The legacy `Value.stringList` reads as a List of Strings, as the CIB runner hands it to the engine.

### Values during evaluation

The evaluator computes over the portable kinds and Java's carriers for them: null; Boolean; Integer, two's-complement 64-bit, so `+`, `-`, `*` and unary `-` wrap as Java's `long` does; Decimal as `BigDecimal`, an Int coefficient and an Int scale, exact; String as a sequence of UTF-16 code units wherever Java indexes or orders it; List; Map. A Double is never constructed: every rule below that would produce one ends the evaluation as `unsupported` (`juel.double`) once each operand's conversion to Double has succeeded, and as `juel.error` when one fails.

Each Integer during one evaluation carries its Java class, which only Java `equals` observes (EL's `==` converts both sides to `Long` first):

- `Long`: integer literals and the results of `+`, `-`, `*`, `%` and coercions to Integer (`NumberOperations.java:63-141`).
- `Integer`: the results of `length()`, `size()`, `indexOf` and `lastIndexOf`, and unary `-` applied to one of them (`NumberOperations.java:166`).
- unknown: every Integer read from the context, at any depth, and every element or entry a property access or `get` returns. The CIB runner hands Integers to the engine as `Long` at every depth, but a mapping stores the Java object it evaluated (an `Integer` for `${s.length()}`), and `Value` does not record which, so a variable's class is not known.

Java `equals` over evaluation values is three-valued. Two Integers of different values are unequal; of equal value they are equal when both classes are known and the same, unequal when both are known and differ, and otherwise unknown. An Integer never equals a Decimal; Decimals are equal only at the same coefficient and scale; Strings by UTF-16 content; Lists element-wise in order; Maps by key set and per-key `equals`. A List or Map comparison is unequal when its shapes differ or any member pair is unequal, equal when every pair is equal, and otherwise unknown. A rule that needs an unknown answer is `unsupported` (`juel.integerCarrier`).

### Coercions

Each coercion is EL §1.18 as `TypeConverterImpl` implements it; "fails" means an `ELException`, which [fails the evaluation](#failure-semantics) as `juel.error`.

| To | null | `""` | Boolean | Integer | Decimal | String | List, Map |
|---|---|---|---|---|---|---|---|
| Boolean (`TypeConverterImpl.java:30`) | false | false | itself | fails | fails | `"true"` in any ASCII case is true, anything else false | fails |
| Integer (`:157`) | 0 | 0 | fails | itself | `BigDecimal.longValue`: truncated toward zero, low 64 bits | `Long.valueOf` over ASCII: optional sign and digits in range, else fails | fails |
| Decimal (`:59`) | 0, scale 0 | 0, scale 0 | fails | `new BigDecimal(double)`: exact up to 2^53 in magnitude, beyond it `unsupported` (`juel.double`), since Java first rounds it to a double | itself | `new BigDecimal(String)` over ASCII, exponent forms and negative scales included, else fails; a scale beyond ±4096 is `unsupported` (`juel.decimalRange`), exact in Java but unbounded work in the kernel | fails |
| Double (`:139`) | 0 | 0 | fails | succeeds | succeeds | succeeds when `Double.valueOf` accepts it, else fails | fails |
| String (`:249`) | `""` | itself | `true`, `false` | decimal digits with sign | `BigDecimal.toString`, which switches to `E` notation for a negative scale or an adjusted exponent below −6 | itself | `unsupported` (`juel.collectionText`): Java's rendering depends on the host class |

`Double.valueOf` accepts, after stripping characters up to U+0020 at both ends, an optional sign followed by `NaN`, `Infinity`, a decimal floating literal with an optional exponent, or a hexadecimal one with a binary exponent, each but the first two optionally ending in one of `fFdD` (`java.lang.Double.valueOf` grammar). The evaluator checks only acceptance, never computes the Double. A String with a non-ASCII character coerced to Integer or Decimal is `unsupported` (`juel.nonAsciiText`): `Long.valueOf` and `new BigDecimal(String)` accept Unicode digits the kernel does not model.

### Operators

| Operator | Rule (pinned source; EL section) |
|---|---|
| `+` `-` `*` | both null: Long 0. A Decimal operand: both to Decimal, exact `add`, `subtract`, `multiply` (scale max, max, sum). Else a String operand containing `.`, `e` or `E`: the Double rule. Otherwise both to Integer, 64-bit wrap, a Long (`NumberOperations.java:63-118`; EL §1.7.1). So `${'hello' + 1}` fails (`'hello'` contains `e` and is no Double) and `${'1.5' + 1}` is `unsupported` |
| `%` `mod` | both null: Long 0. A Decimal operand, or a String with `.`, `e`, `E`: the Double rule. Otherwise both to Integer, Java remainder; a zero divisor raises an `ArithmeticException` (`NumberOperations.java:130`; EL §1.7.3) |
| unary `-` | null: Long 0. Decimal: negated. String with `.`, `e`, `E`: the Double rule; other String: to Integer, negated, a Long. Integer: negated with wrap, keeping its class. Boolean, List, Map: fails (`NumberOperations.java:143`; EL §1.7.4) |
| `<` `>` `<=` `>=` | two List or two Map operands: `unsupported` (`juel.identity`), since Java answers by reference identity first and then fails. Both null: false for `<`, `>`, true for `<=`, `>=`; one null: false. Then the first match of: a Decimal operand, both to Decimal, `compareTo`; an Integer operand, both to Integer; a String operand, both to String, UTF-16 code-unit order; both Boolean, false before true; a Boolean against a List or Map, a `ClassCastException`; otherwise fails (`BooleanOperations.java:41`; EL §1.8.1) |
| `==` `!=` | both null: equal; one null: unequal. Then the first match of: a Decimal operand, both to Decimal, `BigDecimal.equals`, so `${d == 1}` with `d` the Decimal `1.5 - 0.5` result `1.0` is false; an Integer operand, both to Integer; a Boolean operand, both to Boolean; a String operand, both to String; otherwise Java `equals`, three-valued (`BooleanOperations.java:136`; EL §1.8.2). The identity shortcut first agrees with `equals` for every value |
| `and` `&&`, `or` `||` | left to Boolean; the right is evaluated only when the left does not decide, then coerced to Boolean (`AstBinary.java:36,79`; EL §1.9.1) |
| `not` `!` | to Boolean, negated (EL §1.9.2) |
| `empty` | true for null, `""`, an empty List or Map; false for every other value, never a failure; its operand is evaluated first, so `empty missing` fails (`BooleanOperations.java:176`; EL §1.10) |
| `?:` | condition to Boolean; only the chosen branch is evaluated (`AstChoice.java:31`; EL §1.11) |
| composite | each part evaluated left to right and coerced to String, then concatenated; the result is a String even for `${x}${x}` (`AstComposite.java:31`; EL §1.2.3) |

### Identifiers and property access

An identifier is the innermost visible binding of that name; a name no binding declares fails as `unknown-variable` (`AstIdentifier.java:75` raises a `PropertyNotFoundException`; the evidence [missing-variable](../../../scenarios/open-rows/juel-evaluation-failures/README.md)), the same code an absent `Expression.variable` gives. `base.name` and `base[expr]` follow EL §1.6 and `AstProperty.eval` (`AstProperty.java:51`): a null base, or a null bracket property, gives null; otherwise by the base's kind:

| Base | Result |
|---|---|
| Map | a String property: that key's entry, null when absent, not a failure (`MapELResolver`); any other property kind is `unsupported` (`juel.indexType`), since the answer depends on the host Map class |
| List | the property as an index: an Integer is narrowed to 32 bits as Java's `intValue`, a String is parsed as `Integer.parseInt` over ASCII or fails, any other kind is `unsupported` (`juel.indexType`); an index outside the List gives null per the Jakarta EL 4.0 `ListELResolver.getValue` contract, which the [index-out-of-range](../../../scenarios/open-rows/juel-evaluation-failures/README.md) witness confirms once the runner projects Lists |
| String | the property's String form names a Java bean property: `empty`, `blank`, `bytes` and `class` exist and are `unsupported` (`juel.beanProperty`); any other name fails as `juel.propertyNotFound`. `empty` is reachable only as `word['empty']`, since a keyword after `.` is a syntax error |
| Boolean, Integer, Decimal | `class` is `unsupported` (`juel.beanProperty`); any other name fails as `juel.propertyNotFound` |

### Methods

A method call evaluates its receiver, then its arguments left to right, then invokes (`AstMethod.java:78`). A null receiver fails as `juel.propertyNotFound`. A listed method that the table below leaves blank for a String, List or Map receiver fails as `juel.error`: no carrier that reaches JUEL declares it, so no resolver finds it and `AstMethod.invoke` throws `MethodNotFoundException`, an `ELException` (`AstMethod.java:91-93`). The rule rests on the carrier census of [CIB-CFG-0009](../../CIB-BPMN-RELATION-REGISTER.md#cib-cfg-0009--default-java-serialization-of-structured-business-values), which bounds it; a carrier outside the census could declare the method, and the rule claims nothing for it. A receiver whose Java class has a method of that name the kernel does not model is `unsupported` (`juel.methodReceiver`): a Boolean, Integer or Decimal receiver, whose carrier has `equals` among others, and a Map's writing `replace` below. An argument of a kind other than the listed parameter's (null included) is `unsupported` (`juel.methodArgument`): Jakarta's `BeanELResolver` would pick a Java overload or coercion the kernel does not model. A Java exception inside the method fails as `juel.error`: Jakarta's `BeanELResolver.invoke` wraps it as an `ELException`.

The reader writes a call's method name as it stands; the codecs decode it through `JuelMethod`'s own wire names, which are the Java names, into `listed m` for a method of the closed list and `other name` for any other name. Admission refuses `other`, and a listed name with an argument count the table below gives it no overload for, both as `expression.juel.method`. The closed list, every method read-only:

| Method | String | List | Map | Result and edge rules |
|---|---|---|---|---|
| `length()` | yes | | | UTF-16 code units, an `Integer` |
| `isEmpty()` | yes | yes | yes | Boolean |
| `size()` | | yes | yes | an `Integer` |
| `equals(x)` | yes | yes | yes | Java `equals`, three-valued, any argument |
| `contains(x)` | String `x` | any `x`: true when some element is equal, false when every one is unequal | | Boolean |
| `startsWith(s)`, `endsWith(s)` | String `s` | | | Boolean |
| `indexOf(x)`, `lastIndexOf(x)` | String `x`, UTF-16 index | any `x`, the first (last) equal element, unknown before it `unsupported` | | an `Integer`, −1 when absent |
| `substring(i)`, `substring(i, j)` | Integer `i`, `j` narrowed to 32 bits | | | out of range fails `juel.error`; a cut inside a surrogate pair is `unsupported` (`juel.surrogateSplit`) |
| `toUpperCase()`, `toLowerCase()` | ASCII receivers | | | a receiver with a non-ASCII character is `unsupported` (`juel.nonAsciiText`): Java maps it by the JVM's default locale |
| `trim()` | yes | | | strips characters up to U+0020 at both ends |
| `concat(s)` | String `s` | | | String |
| `replace(s, t)` | String `s`, `t` | | | every non-overlapping occurrence, left to right, Java's `CharSequence` overload; an empty `s` inserts `t` at every UTF-16 position, `unsupported` when that splits a surrogate pair |
| `get(x)` | | Integer `x` narrowed to 32 bits; outside the List fails `juel.error` | String key; absent is null | the element, class unknown |
| `containsKey(k)`, `containsValue(v)` | | | String `k`; any `v`, three-valued | Boolean |

Every other name, `getClass`, `toString`, `hashCode` and every mutating method (`add`, `remove`, `put`, `set`, `clear`, …) included, is refused at admission. A Map's mutating `replace(k, v)` shares a listed name and arity; it reaches the evaluator only on a Map receiver, where `replace` is not listed, so it is `unsupported` and never runs.

### Results at a site

Every result, at every site, passes one check that it is a portable value ([data semantics](DATA-SEMANTICS-SPEC.md#values)) before the site sees it: an Integer in `0..9007199254740991`; a Decimal in canonical form, with scale `0..6`, a signed 64-bit coefficient, no trailing zero at a positive scale and zero at scale 0; a String of at most 1,024 UTF-8 bytes. A result outside that domain, such as `${b - a}` below zero or `${d * 2}` giving `3.0`, is `unsupported` (`juel.resultOutsideDomain`); CIB stores the Java value at a mapping. A condition's out-of-domain result is therefore `unsupported`, never a non-Boolean failure. A condition then takes a Boolean; any other result, null included, fails the site (`el/UelExpressionCondition.java:51-52`); a mapping stores the result. Lists and Maps reach a result only as context values or their elements, which are already portable.

## Failure semantics

An evaluation ends in a value, a `failure`, or `unsupported` with a `juel.*` or `expression.juel.*` code. Each Java exception class has one code, kept because a later site needs the class: CIB's `UelExpressionCondition.tryEvaluate` swallows only a `PropertyNotFoundException` (conditional events, M6).

| Code | Java exception | Raised by |
|---|---|---|
| `unknown-variable` | `PropertyNotFoundException` | an identifier, or an `Expression.variable`, that no binding declares |
| `juel.propertyNotFound` | `PropertyNotFoundException` | an unknown bean property; a method on a null receiver |
| `juel.arithmetic` | `ArithmeticException` | Integer `%` by zero |
| `juel.error` | every other: `ELException` from a coercion or comparison, `NumberFormatException` from a List index, `ClassCastException` from ordering a Boolean against a List or Map, `IndexOutOfBoundsException` from `get` or `substring`, an exception inside a method | |

CIB wraps each in a `ProcessEngineException` (`el/JuelExpression.java:62-76`), which aborts the engine operation it runs in, as [CIB-OP-0004](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0004--synchronous-juel-command-rollback-mapped-to-speculative-semantic-commitment) maps. What that operation is depends on the stimulus that reached the evaluation:

| Stimulus | CIB 2.2.0 | Kernel outcome under the CIB profile |
|---|---|---|
| a command (Start, task completion, a delivered Message or Signal, a variable update) | the command rolls back | `rolledBack` with the failure's code, state as before the command |
| an effect result | the job that completed the effect fails | `rolledBack` with the failure's code under `ContinuationFailure.rolledBack`, which both CIB profiles select: the effect result is refused and the effect stays open. CIB's failed job rolls its own transaction back and stays open with one retry fewer; the runner records that execution as `rolledBack` and ends the run ([`CibSevenCommandExecutor.java:353-357`](../../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenCommandExecutor.java), [`CibSevenEngineScenarioRunner.java:263-264,288-289`](../../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenEngineScenarioRunner.java)), so the two agree at the observation boundary, and the job's retries and incident lie beyond it. A profile selecting [CIB-EXT-0026](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0026--a-continuation-failure-after-an-effect-result-fails-the-job) (`ContinuationFailure.incident`) would turn it into the effect's technical failure instead. |
| a job continuation after an asynchronous boundary | the job fails, the boundary's commit stands | `unsupported` (`async-boundary-failure`, `Kernel.Step.deferred`, unchanged) |
| a Timer firing | the timer job fails, retries, then raises an incident | `rolledBack` under `ContinuationFailure.rolledBack`; `unsupported` (`timer-job-failure`) under `incident` |

`unsupported` from an evaluation stays `unsupported` at every site and every stimulus. Per site, under the CIB profile:

| Site | CIB 2.2.0 | Kernel outcome (command stimulus) | Witnesses |
|---|---|---|---|
| Gateway or conditional Sequence Flow | a failure or a non-Boolean result fails (`UelExpressionCondition.java:51-52`) | `rolledBack`, a non-Boolean as `condition-not-boolean` | [condition-expression-routing](../../../scenarios/open-rows/condition-expression-routing/README.md): `flag-absent`, `flag-integer`, `flag-present-null`, `flag-text-true`, `flag-text-other`, `false-reaches-broken` roll back; `true-before-broken` commits, the later condition unevaluated |
| Activity or Sub-Process input mapping | fails (`InputParameter.java:46`) | `rolledBack` | [juel-evaluation-failures](../../../scenarios/open-rows/juel-evaluation-failures/README.md); [mapping-failure-sites](../../../scenarios/open-rows/mapping-failure-sites/README.md) `entry-missing`, `entry-throws` |
| Activity or Sub-Process output mapping | fails the completing operation (`OutputParameter.java:47`) | `rolledBack`; no output of the completion is written | `exit-missing`, `exit-throws`, `scope-exit-missing` |
| Call `sourceExpression` in or out | fails (`ElValueProvider`) | `rolledBack` | [juel-core-table](../../../scenarios/open-rows/juel-core-table/README.md) `call-source-expression-in`, `call-source-expression-out` |

A property of a null base is no failure: it is null at every site, and the site then reads null (a condition fails on it, a mapping stores it). The standards profile admits no JUEL, so it has none of these outcomes; its Simple Boolean evaluation stays total.

## Admission at Core

Under a profile selecting `Evaluator.juel`, `Kernel.Admission.Data` refuses at an admitting site, each with a stable code. The two name codes are semantic refusals, so they sit in admission beside the others, as `Kernel.Admission.Work` refuses its reserved names; the names are the engine's resolver vocabulary, not product bean names:

| Code | Refused | Basis |
|---|---|---|
| `expression.juel.engineContext` | an identifier `execution`, `task`, `caseExecution`, `externalTask` or `authenticatedUserId` in any JUEL text, `${execution}` included | `VariableScopeElResolver.java:51-90` resolves them before any variable |
| `expression.juel.multiInstanceCounter` | `loopCounter`, `nrOfInstances`, `nrOfActiveInstances`, `nrOfCompletedInstances` | CIB holds them as instance and body locals; under `cibLocals` they are variables at every site inside an instance ([counters and the item](MULTI-INSTANCE-SEMANTICS-SPEC.md#counters-and-the-item-at-every-instance-site)), and this code stays outside every instance, in a loop's own count expressions and under `none` |
| `expression.juel.decisionResult` | `decisionResult` | CIB binds it only as the transient local of a decision task's execution (`DecisionEvaluationUtil.java:82`), which the kernel does not carry ([decision semantics](DECISION-SEMANTICS-SPEC.md#mappings-on-a-decision-task)) |
| `expression.juel.syntax` | JUEL-position text the reader could not parse at the pinned grammar (`Expression.foreign` with the JUEL language) | CIB refuses the deployment, so both answer `unsupported`; non-ASCII identifiers and whitespace, which CIB may parse, are the classified exception (draft CIB-LIM-0009) |
| `expression.juel.floatLiteral`, `expression.juel.division` | a floating literal; `/`, `div` | a Double, outside the portable domain |
| `expression.juel.function` | any function call; CIB registers `currentUser`, `currentUserGroups`, `now`, `dateTime` | JUEL decision; the Events level admits `now()` and `dateTime()` chains |
| `expression.juel.method`, `expression.juel.computedMethod` | a call to an unlisted name or argument count, mutating methods included; a method on a bracket target | the closed list |
| `expression.juel.malformed` | an empty node table; a child index not below its parent's; an integer lexeme that is not digits only or exceeds 2^63−1 | the reader's output contract; never reachable from a well-formed reader |
| `expression.outsideJuel` | a Simple Boolean expression | one evaluator per profile |

At a site Core does not admit, `Kernel.Admission.Subscriptions` and `Kernel.Admission.Data` (a Data Association mapping) refuse `.juel` as `expression.juel.site` under either evaluator. Under the standards profile `.juel` is refused as `mapping.expression` in a mapping and `flow.condition.foreign` in a condition, the codes `foreign` has there. `profile.evaluator.juel` is deleted: a profile may now select the evaluator.

The evaluator answers every refused shape with the admission code as `unsupported` (guard 20), so no refused shape evaluates.

## IL shape and placement

Parsing happens once, in the reader (`packages/bpmn-source/src/kernel-reader/juel.ts`), which emits the IL; neither kernel parses text. The parse is meaning-preserving: two texts with the same node table evaluate identically, and the source bytes stay in `@bpmn-lean/bpmn-source`'s preserved source. It is checked against the pinned evaluator through the retained evidence, and by a reader test of source-to-node tables. A text that does not parse becomes `Expression.foreign` with the JUEL language URN.

The parse is a flat node table in post-order, children referenced by index below their parent's, the root last: the IL's flat, identifier-referenced shape, with no nested or mutual inductive (`List Nat` children are not nested). Integer and floating literals keep their lexemes, so a Long beyond 2^53 survives the JSON wire, where TypeScript numbers would round it. `Kernel/IL/Types/Juel.lean`, imported by `Kernel/IL/Types.lean` as `Options` is, holds `JuelBinary`, `JuelUnary`, `JuelMethod` with `JuelMethod.admits (method) (count)`, `JuelCall` (`listed (method : JuelMethod) | other (name : String)`) and `JuelNode`; `Expression` gains `juel (nodes : List JuelNode)`. Each `JuelNode` constructor carries at most a header and a payload (guard 9), so a node with more than two parts carries one payload structure: `JuelFunctionNode`, `JuelCallNode`, `JuelComputedCallNode`, `JuelBinaryNode`, `JuelChoiceNode`. A quoted literal is `stringLiteral`, apart from the unquoted `text`, so that the node kinds mirror no `Value` kinds (guard 3). The TypeScript pair is `packages/kernel/src/il/types/juel.ts`. The wire form is Lean's derived JSON, except that a call target travels as the method name, which `Kernel.Codec`'s hand-written `JuelCall` instances look up; for `${a + 1}`:

```json
{"juel": {"nodes": [{"identifier": {"name": "a"}}, {"integer": {"digits": "1"}}, {"binary": {"payload": {"op": "add", "left": 0, "right": 1}}}]}}
```

`Kernel/Hooks.lean` and `hooks.ts` gain a third evaluation outcome, `Evaluation.unsupported (code)`, so that a kernel limit never poses as a semantic failure ([semantic invariants](../../../CLAUDE.md#semantic-invariants)). Every consumer maps it to `.error (.unsupported code)`. `Ctx.evaluateMappings` rolls an `ioParameter` failure back with the evaluation's own code, so one failure has one code at every site. `Feature.Flow.condition` maps a failure and a non-Boolean value to `.rolledBack`; under Simple Boolean neither can occur.

Evaluation lives in `Kernel/Feature/Data/Juel.lean` and `packages/kernel/src/feature/data/juel.ts`; `Feature.Data.evaluate` sends `.juel nodes` there. The evaluator recurses on node index, each child strictly below its parent, so it is total with the index as its measure. `JuelNode`, `JuelBinary`, `JuelUnary`, `JuelCall` and `JuelMethod` are guarded types of the [guardrails](../ARCHITECTURE-SPEC.md#guardrails-against-degradation), owned by `Kernel.Feature.Data` and matched also by `Kernel.Admission.Data` and the codecs; the reader holds no copy of the method list.

Lean's `String` is a sequence of Unicode scalar values and cannot hold a lone surrogate, while Java's is UTF-16. Every rule above that counts, indexes, cuts or orders a String does so in UTF-16 code units; the Lean evaluator converts explicitly and refuses a result that would split a pair. A divergence between the two kernels there is a defect the paired evaluator tests catch, a risk recorded rather than ruled out.

The profile option exists: `ProfileOptions.evaluator : Evaluator` (`simpleBoolean | juel`). The reader's `kernelProfileOptions` selects `juel` exactly when the profile carries the draft CIB-CFG-0011, which the cumulative CIB 2.2.0 profile adds with CIB-EXT-0030; `Admission.Profile` drops `profile.evaluator.juel`; the vocabulary schema gains the codes above.

## Multi-Instance level

Written 2026-11-10 for the collection, cardinality and completion half of PC-DATA-08 and the wrong-result-type cases of PC-DATA-09. Revised the same day after the first cold review. A second cold review approved it with required changes, which are folded in here (root decisions, 2026-11-10); the track's combined review checks this text with the code that implements it. It adds no grammar to Core. Under `Evaluator.juel` it admits JUEL, a variable read and text at three sites: `InstanceCount.cardinality` (`loopCardinality`), `InstanceCount.collection` (`camunda:collection`) and `MultiInstance.completionCondition`. It also delivers cardinality-driven generation for the body kinds the [Multi-Instance semantics](MULTI-INSTANCE-SEMANTICS-SPEC.md) admit. CIB paths are relative to the pinned checkout, as in [Authority and citations](#authority-and-citations). `MultiInstanceActivityBehavior` is cited by bare line, and its two subclasses as `Parallel…` and `Sequential…`.

### Reading the loop expressions

- **No trimming, no language.** CIB reads the text of `loopCardinality` and `completionCondition` untrimmed and passes it to the expression manager. It reads no `language` attribute there and no Definitions `expressionLanguage` (`bpmn/parser/BpmnParse.java:1824-1838`). So `<loopCardinality> 2 </loopCardinality>` is the String ` 2 ` in both engines, and the count rule fails it. The reader reads both bodies the way it reads a condition, with the language they declare. A body with no declared language is JUEL. Under `Evaluator.juel`, admission refuses a declared language on either element or on the Definitions, because CIB would run JUEL where the model names another language: a Simple Boolean body as `expression.outsideJuel`, any other language as `multiInstance.expressionLanguage`.
- **Empty and whitespace bodies.** An empty `loopCardinality` is a deployment error in CIB (`:1827-1829`); the reader refuses it as `reader.emptyLoopCardinality`. CIB keeps every text node of an element, whitespace included (`util/xml/Element.java:192-196`), while `bpmn-moddle` drops a text node that is only whitespace (`moddle-xml` `dist/index.js:839-847`), such as the spaces around a CDATA section or a whole body of spaces. The IL would then hold a text CIB never evaluates, so the reader refuses a `loopCardinality`, `completionCondition` or `loopDataInputRef` with such a node as `source.loopBodyWhitespace`, checking the exact source bytes. Rebuilding the kept text from the bytes is a later widening.
- **`camunda:collection`.** CIB takes the raw attribute as an expression when it contains `{` and as a variable name otherwise (`BpmnParse.java:1841-1848`). The reader uses the same test, so `camunda:collection="{items}"` is the JUEL text `{items}`, a String literal. CIB evaluates it to the String `{items}` and rolls back on every run (`:112-114`); under `Evaluator.juel` the kernel admits it and rolls back with `multiInstance.notACollection`.
- **`loopDataInputRef` expressions.** CIB also treats `loopDataInputRef` text containing `{` as an expression (`BpmnParse.java:1850-1861`). BPMN types it as a reference, so `${x}` names no element. The reader already refuses it as `source.reference` (`kernel-reader/references.ts`), which is outside [CIB-INT-0014](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0014--a-multi-instance-loop-binds-its-collection-and-item-by-the-loops-own-references-not-by-data-associations).
- **The element variable.** CIB reads the collection, and sets the item, only for a loop with an element variable, the `inputDataItem`'s `name` or `camunda:elementVariable` (`:85`, `:93`); a collection loop without one runs one instance per member with no item. The kernel keeps refusing a collection loop without its input data item (`multiInstance.inputDataItem`). A cardinality loop sets no item in either engine, so it needs none.
- **Cardinality and a collection together.** CIB takes the count from the cardinality (`:107-110`) and the items by index from the collection (`:84-89`, `:129-138`), failing once the index passes the collection's end. The IL carries both: `InstanceCount.countAndCollection`. Admission refuses it as `multiInstance.countAndCollection` until PC-MI-01, which owns the [both-forms witnesses](../../../scenarios/open-rows/multi-instance-user-task/README.md), decides it.
- **Sequential re-evaluation.** In sequential mode, CIB evaluates the collection again before every later instance (`Sequential…:57` through `evaluateCollection`, `:91-101`) and takes the next item by index (`:84-89`). The CIB profiles select it, `ProfileOptions.multiInstanceCollection = sequentialReread` ([CIB-INT-0043](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0043--a-sequential-multi-instance-collection-is-read-again-before-each-later-instance)): the kernel evaluates the collection, a variable read or a JUEL text alike, in the completing instance's scope occurrence before it is left, which holds the item, `loopCounter` and the instance's result locals as CIB's body execution does, and gives the next instance the item at its index. The standards profile keeps `entrySnapshot`. In parallel mode, CIB evaluates the collection twice in one operation over the same context (`:112`, `Parallel…:46`). The kernel evaluates it once.

### Contexts per site

A site's context holds the bindings visible from its scope occurrence, innermost first ([Context](#context)). "The item name" below is the local that `MultiInstance.itemName` gives under the profile's binding.

| Site | CIB 2.2.0 context | Kernel context | Admission |
|---|---|---|---|
| the loop's own cardinality and collection | the body execution before any counter is set (`execute`, `:63-74`), so this loop's counters are absent; for a loop nested in another loop's instance, an enclosing loop's counters are visible | the body's enclosing scope occurrence | a counter name stays `expression.juel.multiInstanceCounter`, a restriction that does not tell the two apart |
| completion condition | parallel: the completing instance's execution (`Parallel…:96`, `endedExecution`), holding `loopCounter`, the item and the instance's result locals, below the body that holds the three body counters; sequential: the body execution, holding all four counters, the item and the result locals of this and every earlier instance (`Sequential…:53`) | the completing instance's scope occurrence, evaluated before it is left: the item, the instance's result locals and, under `cibLocals`, the counters | admitted; a counter name only under `cibLocals` |
| elements nested in a Sub-Process instance (their inputs, outputs and conditions) | the nested execution under the instance; the Sub-Process is a scope (`BpmnParse.java:3887`) | the nested scope occurrence, below the instance's (`loopCounter` and the item) and the body's (the three body counters); the innermost loop's counters hide an enclosing loop's | admitted; a counter name under `cibLocals` (CIB-INT-0018); a counter-named target refused as `multiInstance.counterTarget` (CIB-LIM-0020) |
| a Multi-Instance Call Activity's `camunda:in` | the calling execution (`bpmn/behavior/CallableElementActivityBehavior.java:116`, `core/model/CallableElement.java:88-90`): the instance, with the body above it | the instance's scope occurrence: the item and, under `cibLocals`, the four counters | admitted; a counter name under `cibLocals` (CIB-INT-0018) |
| the Multi-Instance Activity's own `camunda:inputParameter` | the parent of the execution entering the Activity (`core/variable/mapping/IoParameter.java:50-51`, run by `pvm/runtime/PvmExecutionImpl.java:1309-1314`). The inner Activity is made no scope (`BpmnParse.java:4801-4815`, `:4004`), so a parallel input sees the body's counters but not `loopCounter` or the item, and a sequential one sees neither. A Sub-Process (`:3887`), a Transaction (`:3907`), a Receive Task with a `messageRef` (`:2755`), a DMN Business Rule Task (`:2360`) and an external Service Task (`:2556`) are scopes anyway, and their inputs see the instance | the instance's scope occurrence | under `loopReferences` admitted, except a counter or item name, refused as `multiInstance.ownInputReadsInstance` (CIB-LIM-0019), and a counter-named target, `multiInstance.counterTarget`; under `dataAssociations` refused (`multiInstance.mappings`) |
| the Multi-Instance Activity's own `camunda:outputParameter` | a deployment error (`BpmnParse.java:4855-4857`) | — | refused (`multiInstance.mappings`) |
| the Multi-Instance Activity's conditional outgoing Sequence Flows | the body execution that is leaving (`:171-176`, `FlowNodeActivityBehavior.java:55-56`, `BpmnActivityBehavior.java:81-92`, [CIB-INT-0011](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0011--an-activitys-outgoing-conditions-evaluate-before-its-output-writes)), which still holds the counters and, in sequential mode, the last instance's `loopCounter`, item and result locals | — | refused (`flow.conditionalOutflow`; the row lifting it assigns `multiInstance.outflowReadsInstance` to a counter or item name there) |

**Evaluated before the instance is left.** The kernel evaluates the completion condition in the completing instance's scope occurrence, before leaving it, under every profile. That corrects the earlier order, which left the occurrence first and so hid the item: BPMN 2.0.2 §13.3.7 lets the condition "refer to the MI Activity instance attributes and … inputDataItem", and Table 10.29's `completionCondition` is evaluated as each instance completes. Under the standards profile, `isPresent(<item>)` in a completion condition is therefore true. A Sub-Process instance's body-local data is still disposed before the condition evaluates, in both engines ([CIB-EXT-0018](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0018--parallel-body-mappings-and-post-disposal-condition-context)); PC-MI-04 and PC-MI-05 own that account for Sub-Process bodies.

**Result locals.** Under `ResultValues.activityLocals` ([CIB-EXT-0015](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0015--serial-business-task-enclosing-inputs-and-local-results)) an instance's effect-result values are locals of the instance: the kernel writes them into the instance's scope occurrence and keeps them there until its completion condition has run, so `${delivered}` reads the completing instance's result. CIB keeps a parallel instance's results on its own execution, which the condition reads, and a sequential instance's on the body, which also keeps every earlier instance's results until the body ends. Two cases have no kernel reading, so they are `unsupported` when they occur, with dynamic-only codes:

- `multiInstance.resultShadowsInstance`: an instance's result named like a counter or the item, or any write that reached a counter local. CIB overwrites that local, and in sequential mode the next `loopCounter` is computed from it (`Sequential…:48`).
- `multiInstance.sequentialResultLeftover`: in sequential mode, a completion condition is about to be evaluated while an earlier instance left a result name this instance did not write. CIB's condition would read the earlier value.

### Counter values

The profile option `ProfileOptions.multiInstanceCounters` selects them: `none` (the standards reading: no counter name resolves) or `cibLocals` (draft CIB-INT-0018, selected by the CIB profiles). Each counter is a Java `Integer` in CIB. No rule the kernel admits observes that class, since an Integer receiver lists no [method](#methods) at Core: `${loopCounter.equals(0)}`, false in CIB because `Integer.equals(Long)` is, is `unsupported` (`juel.methodReceiver`) in the kernel, and its witness records CIB's answer. The values are CIB's:

- `loopCounter` is the instance's zero-based index. Table 10.30 counts from one ("the n-th instance"); the kernel's zero-based resolution is the [Multi-Instance semantics'](MULTI-INSTANCE-SEMANTICS-SPEC.md).
- Parallel: `nrOfInstances` is the count, `nrOfActiveInstances` the count minus the completed instances, and `nrOfCompletedInstances` the completed ones. Both are updated before the condition reads them (`Parallel…:84-87`).
- Sequential: `nrOfInstances` is the count from entry ([CIB-INT-0002](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0002-sequential-multi-instance-nrofinstances-is-desired-cardinality-from-outer-entry)). `nrOfActiveInstances` is 1 from the first instance on, including when the condition is evaluated: it is set once (`Sequential…:41`) and `complete` never lowers it, where Table 10.30's sum would give 0. `nrOfCompletedInstances` is incremented before the condition (`:50-51`). `loopCounter` still names the completing instance, because `:48` computes the next index in a Java local.

Publication keeps the Table 10.30 accounting of the Multi-Instance semantics: CIB's values reach evaluation contexts only. Whether the final completion evaluates the condition at all is [CIB-INT-0009](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0009--on-the-final-multi-instance-completion-sequential-tests-exhaustion-first-and-parallel-tests-the-condition-first). A counter-named target written inside an instance is refused (`multiInstance.counterTarget`, CIB-LIM-0020); a write admission cannot see is `unsupported` (`multiInstance.resultShadowsInstance`). Under `cibLocals` admission refuses an item named like a counter as `multiInstance.itemNamedLikeCounter`: CIB sets both locals on one execution, so one overwrites the other.

### Option combinations

`Kernel.Admission.Profile` refuses, for a program with a Multi-Instance loop, the combinations that would read a loop expression under two engines at once:

| Code | Refused |
|---|---|
| `profile.multiInstanceCounters.none` | `Evaluator.juel` with counters `none`: CIB resolves the counter names in every JUEL loop expression |
| `profile.multiInstanceInputFailure.hold` | `Evaluator.juel` with input failure `hold`: CIB fails the operation where `hold` would wait |
| `profile.multiInstanceCounters.cibLocals` | `Evaluator.simpleBoolean` with counters `cibLocals`: Simple Boolean names no counter |

Under counters `none` a counter name stays `expression.juel.multiInstanceCounter` at every site.

### Results

The count and collection sites read the evaluator's value before the domain predicate of [Results at a site](#results-at-a-site) (`EvalContext.domainChecked` false), so a negative or long Integer, a non-canonical Decimal and a long String reach the rules below; an Integer beyond ±(2^53−1) is still `juel.resultOutsideDomain`, a bound both kernels share. `ProfileOptions.multiInstanceCount` selects the count rules: `integer`, the standards reading, or `javaInt` (draft CIB-EXT-0033, selected by the CIB profiles).

Under `integer`, BPMN 2.0.2 Table 10.29 says the `loopCardinality` expression "MUST evaluate to an integer": an Integer is the count, a negative one fails as `multiInstance.negativeCount`, and any other value fails as `multiInstance.notANumber`. Under `javaInt` the rules are CIB's `resolveLoopCardinality` (`:145-155`), in order:

1. **Integer**, at the evaluator's 64 bits:
   - Outside Java's `int` range it is `unsupported` (`multiInstance.countRange`). CIB's `intValue` keeps the low 32 bits (`:149`), so `4294967298` makes two instances.
   - A negative count fails as `multiInstance.negativeCount` (`invalidAmountException`, `:68-69`). So `${count - 5}` with `count` 3 gives −2 and that code, never `juel.resultOutsideDomain`.
   - Zero completes the Activity at once (`:65-66`).
   - Otherwise it is the number of instances.
2. **Decimal**: one with a nonzero fraction is `unsupported` (`multiInstance.fractionalCount`); CIB's `BigDecimal.intValue` truncates it toward zero. An integral Decimal follows rule 1 with its value (`:148-149`).
3. **String**:
   - A String with a non-ASCII character is `unsupported` (`juel.nonAsciiText`).
   - Text in `Integer.parseInt`'s ASCII grammar (an optional `+` or `-`, at least one digit, within `int`) follows rule 1 (`:150-151`).
   - Any other text fails as `multiInstance.notANumber`, matching CIB's `NumberFormatException`: ` 2`, `two` and `2147483648` all do.
4. **Null, Boolean, List or Map** fails as `multiInstance.notANumber` (`expressionNotANumberException`, `:153`).

At the collection site, a List or the legacy String List supplies the items (`:116`). Every other value, null, a Map, a String or any other scalar, fails as `multiInstance.notACollection`. CIB raises `unresolvableExpressionException` for an expression (`:113-114`). For a variable, it raises `invalidVariableTypeException` whether the value is absent, null or of the wrong type (`:117-120`). An expression failure keeps its own code, so `${missing}` fails as `unknown-variable`. A bare name and `${name}` read as the same `Expression.variable`, so an absent name fails as `unknown-variable` under both, although CIB raises `invalidVariableTypeException` for the first and `PropertyNotFoundException` for the second. Both fail the operation, and no site catches either exception class.

The completion condition takes Core's condition rule: the domain predicate, then a Boolean. Any other result, null included, fails as `multiInstance.completionNotBoolean` (`expressionNotBooleanException`, `:157-162`).

Where a failure lands is selected by `ProfileOptions.multiInstanceInputFailure` (draft CIB-INT-0019):

- `hold` is the standards reading: an unavailable collection holds the occurrence, as an unavailable InputSet does (BPMN 2.0.2 §10.4.2), and a present value the rules refuse is that rule's semantic failure (`multi-instance-collection` for a collection).
- `rollback` is CIB's reading: every failure at the count and collection sites fails the operation, following the [stimulus table](#failure-semantics). It rolls back in a command and after an effect result alike, since neither CIB profile selects CIB-EXT-0026, and is `unsupported` at a Timer.

A completion-condition failure, a non-Boolean result included, follows the stimulus table under both values: it rolls back the User Task completion or the effect result that reached it. Under the standards profile only Simple Boolean reaches the condition, which never fails. Every CIB schedule of [multi-instance-completion-failures](../../../scenarios/open-rows/multi-instance-completion-failures/README.md) agrees with CIB (measured 2026-11-12):

- The `*-sequential-*-final` schedules commit in both engines: the CIB profiles select CIB-INT-0009, so the sequential body's final completion tests exhaustion first and never evaluates the failing condition.
- The `service-*` schedules that evaluate it roll back in both at the runner's observation boundary: CIB's job execution throws and rolls back the job's transaction, and the runner records the effect result as `rolledBack` and ends the run ([`CibSevenCommandExecutor.java:353-357`](../../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenCommandExecutor.java), [`CibSevenEngineScenarioRunner.java:263-264,288-289`](../../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenEngineScenarioRunner.java)). The failed job's retries and incident, which the unselected CIB-EXT-0026 reads, lie beyond the compared trace.

### Instance bounds

The kernel imposes no bound on the number of instances (root decision, 2026-11-10). That is the recorded decision under "Superseded first-profile restrictions" in the [Multi-Instance semantics](MULTI-INSTANCE-SEMANTICS-SPEC.md), and CIB imposes none either. A collection count is at most 32 anyway, the value domain's member limit per container ([data semantics](DATA-SEMANTICS-SPEC.md#values)). A cardinality count under `javaInt` is at most 2,147,483,647; above that it is `multiInstance.countRange`. Exhausting a host's capacity is an infrastructure failure, never a semantic outcome.

### Codes this level adds

| Code | Kind | Refused or raised |
|---|---|---|
| `source.loopBodyWhitespace` | reader | a loop body with a whitespace-only text node `bpmn-moddle` drops |
| `reader.emptyLoopCardinality` | reader | an empty `loopCardinality` |
| `multiInstance.countAndCollection` | admission | a loop declaring both a cardinality and a collection |
| `multiInstance.collectionShortened` (`rolledBack`) | runtime | under `sequentialReread`, a re-read collection shorter than the next instance's index (CIB-INT-0043) |
| `multiInstance.collectionRemoved` (`unsupported`, dynamic-only) | runtime | under `sequentialReread`, a re-read collection removed or null (CIB-LIM-0054) |
| `multiInstance.expressionLanguage` | admission | under `Evaluator.juel`, a loop expression in a declared language other than JUEL or Simple Boolean |
| `multiInstance.itemNamedLikeCounter` | admission | under `cibLocals`, an item named like a counter |
| `multiInstance.ownInputReadsInstance` | admission | under `loopReferences`, a looping Activity's own input mapping reading a counter or the item (CIB-LIM-0019) |
| `multiInstance.counterTarget` | admission | under `cibLocals`, a counter-named target written inside an instance (CIB-LIM-0020) |
| `profile.multiInstanceCounters.none`, `profile.multiInstanceInputFailure.hold`, `profile.multiInstanceCounters.cibLocals` | admission | the option combinations above |
| `multiInstance.countRange`, `multiInstance.fractionalCount`, `multiInstance.resultShadowsInstance`, `multiInstance.sequentialResultLeftover` | dynamic `unsupported` | the count rules and the result locals above |
| `multiInstance.notANumber`, `multiInstance.negativeCount`, `multiInstance.notACollection`, `multiInstance.completionNotBoolean` | failure | the rules above |

Under the standards profile the three sites keep their codes: `multiInstance.collectionExpression` for a collection that is not a variable read, `multiInstance.completionConditionExpression` for a completion condition that is not Simple Boolean, `multiInstance.cardinality` for a cardinality, since Simple Boolean expresses no Integer, and `expression.outsideSimpleBoolean` for JUEL or a foreign expression at any of them. Under `Evaluator.juel` the first two codes no longer apply, `.juel` is no longer `expression.juel.site` there, and `multiInstance.cardinality` no longer applies.

### Witnesses

Admissible witnesses this level settles:

- **[multi-instance-service-task](../../../scenarios/open-rows/multi-instance-service-task/README.md).** The `*-quorum-reached-early` and `*-quorum-lowered-between-bodies` schedules settle `${nrOfCompletedInstances >= quorum}` in both modes. `parallel-quorum-initially-true` and `sequential-quorum-initially-true` settle PC-DATA-08's initially-true clause. `parallel-cardinality-reversed` and `sequential-cardinality` settle the count site.
- **[multi-instance-expression-results](../../../scenarios/open-rows/multi-instance-expression-results/README.md)**, authored for this level. It covers the count rules over text, signed and padded text, negative text, text above `int`, integral, fractional and negative Decimals, an Integer above `int`, Boolean, null, a Map and an absent variable; a computed negative count; the padded and the plain literal cardinality; the collection rules over variables and expressions (Map, text, Integer, null, absent key, absent variable); the bare `{` collection; the item, `loopCounter`, `${loopCounter.equals(0)}` and an instance's result `${delivered}` read by the completion condition in both modes; the sequential and parallel `nrOfActiveInstances`; and the whitespace refusals (a CDATA cardinality wrapped in spaces, a cardinality of spaces). Every model is a Service Task loop without mappings.
- **[multi-instance-completion-failures](../../../scenarios/open-rows/multi-instance-completion-failures/README.md)**, authored for this level. A non-Boolean completion condition and one whose evaluation fails, in both modes, on a nonfinal and on the final completion (where CIB-INT-0009 decides whether the condition runs), each under an effect result (a Service Task body) and under a User Task completion; and the standards witness `isPresent(<item>)`.

Every schedule in [expression-cardinality-and-collections](../../../scenarios/open-rows/expression-cardinality-and-collections/README.md), and the expression forms of [multi-instance-expressions](../../../scenarios/open-rows/multi-instance-expressions/README.md) and [multi-instance-user-task](../../../scenarios/open-rows/multi-instance-user-task/README.md), reads `${loopCounter}`, `${nrOfInstances}` or `${item}` in the Activity's own inputs. CIB rolls back on those reads whatever the count. So they witness the own-input row for PC-MI-10, not the count rules. `fractional-computed-count` divides, which stays refused as `expression.juel.division`: a JUEL division yields a Double, outside the portable domain ([Grammar at Core](#grammar-at-core)).

### Relations

- **Drafts:** CIB-INT-0018 (counter values), CIB-INT-0019 (an input failure fails the operation) and CIB-EXT-0033 (count coercions), each selected by both CIB profiles.
- **Existing entries read here:** CIB-INT-0002, CIB-INT-0009, CIB-INT-0011, CIB-INT-0014, CIB-EXT-0015, CIB-EXT-0018 and CIB-EXT-0026.
- **CIB-LIM-0009** gains the refusals listed above: both forms together, sequential collection expressions, declared-language loop expressions, the whitespace-only text nodes and an item named like a counter.
- **CIB-LIM-0010** gains fractional counts, counts outside `int`, results named like a counter or the item, and sequential result leftovers.

## Oracle plan and witness table

The pinned evaluator answers through ordinary scenarios run by the CIB oracle; no runner mode is added. Each expression is a `camunda:inputParameter` of a User Task the start opens, so the open task's published inputs are the observation, or a condition whose chosen User Task is; a form that can fail sits alone behind a probe gateway, as [juel-evaluation-failures](../../../scenarios/open-rows/juel-evaluation-failures/README.md) does, so one failure cannot hide another.

The CIB runner's value projection carries Decimal as `BigDecimal` at the value's canonical scale, List as `ArrayList`, Map as `LinkedHashMap` and every nested Integer as `Long`, the carriers [CIB-CFG-0009](../../CIB-BPMN-RELATION-REGISTER.md#cib-cfg-0009--default-java-serialization-of-structured-business-values) names; it projects an engine `Integer` or `Long` at any depth to Integer and a `BigDecimal` only in canonical form. The canonical result holds no Java value outside the portable domain (a Double, a Long below zero or above 2^53−1, a non-canonical `BigDecimal`), so no witness lets CIB store one where the runner observes it. A form the kernel refuses at admission publishes it as composite text (`quotient=${a / zero}`). A form the kernel evaluates holds it in the input of a Sub-Process, whose locals the runner does not project, and the task inside publishes `value=${value}`, Java's exact rendering; the kernel still meets the out-of-domain result at the Sub-Process input ([juel-evaluation-failures](../../../scenarios/open-rows/juel-evaluation-failures/README.md) `held-results`, table `held-decimal`).

| Rule | Expression forms × contexts | Expected kind | Witness |
|---|---|---|---|
| literals, text, composite, escapes, `#{}` | every literal kind, `\${`, `\\${`, mixed text | value; a mixed-delimiter composite refused | literals-and-text; table `text-escapes` |
| arithmetic over Integer, null, String | `+ - * % mod`, unary `-`, precedence, wrap at 2^63 | value; `%` by zero fails | arithmetic, coercion, modulo-by-zero; table `long-wrap` |
| Strings with `.`, `e`, `E` in arithmetic | `${'hello' + 1}`, `${'1.5' + 1 > 2}` | failure; `unsupported` | table `text-exponent-failure`, `text-double-operand` |
| Decimal arithmetic and comparison | Decimal with Integer, Decimal, numeric String; `==` across scales | value; `%` with Decimal `unsupported` | decimal-operands (its floating-literal comparisons moved to table `decimal-against-double`); table `decimal-scale-equality` |
| non-canonical Decimal results | `${d * 2}` stored, `${d * 2 == 3}` | `unsupported`; value | table `decimal-noncanonical-result` |
| Integer class | `${list.contains(s.length())}`, `${s.length() == 3}`, `${n.equals(3)}` | `unsupported`; value; `unsupported` | table `integer-class` |
| relational and equality | operand matrix null, Boolean, Integer, Decimal, String, List, Map | value or failure per the operator table; Boolean against List fails | relational, coercion; table `boolean-against-list` |
| logical, `empty`, `?:`, laziness | | value; `empty missing` fails | logical, empty-operator, ternary-operator, lazy-operands, empty-of-missing |
| identifiers | visible, shadowed, present null, absent | value; absent fails | missing-variable; scope-data-visibility |
| property access | Map key, absent key, null base, List index in and out of range, String bean and non-bean names | value, null, failure or `unsupported` per the access table | access-scalar-results, access-structured-results, [juel-form-separations](../../../scenarios/open-rows/juel-form-separations/README.md) `structured-access`, absent-and-null-access, index-on-text, unknown-property, index-out-of-range, non-integer-index; table `string-bean-property` |
| methods | every listed method per receiver kind, argument kinds, wrong receiver; a multi-character `replace` | value, failure or `unsupported` | string-methods, list-methods, map-methods; table `replace-multi-character` |
| condition sites | a plain-text condition `true`; the Activity outflow condition | `rolledBack`; value | table `plain-text-condition` |
| site rules | one probe per failure class × condition, input, output, Sub-Process output, Call `sourceExpression` in and out | `rolledBack` | condition-expression-routing, mapping-failure-sites; table `call-source-expression-in`, `call-source-expression-out` |
| result domain | negative, above 2^53−1, scale above 6, 1,025-byte String at a mapping | `unsupported` (kernel only) | negative-result, integer-overflow; table `string-over-limit` |
| admission | each refusal code | refused | juel-unsupported-syntax, condition-language-declarations, functions, the capability probes of juel-evaluation-failures; juel-form-separations `unknown-method`, `list-mutating-method`, `reflection-through-method` and juel-evaluation-failures `division-by-zero`, one model per code; table `collection-parameter` |

## Witnesses and ledger the Core level settles

Measured 2026-11-12 against the retained CIB Seven `2.2.0` answers: every witness of the [oracle plan](#oracle-plan-and-witness-table) that the Core and Multi-Instance levels admit and evaluate to a value or a failure agrees, including every condition-expression-routing, condition-whitespace, mapping-failure-sites and juel-unsupported-syntax schedule and the 26 [method-receiver](#methods) probes of juel-evaluation-failures. No kernel value differs from a CIB value; each remaining disagreement is a kernel `unsupported`, and the [disagreement ledger](../../../packages/differential/test/cib-disagreement-ledger.json) owns it by its registered relation:

| Owner | Witnesses |
|---|---|
| CIB-LIM-0009 (refused at admission) | the witnesses its register entry lists, among them the bundled refused probes of juel-evaluation-failures, whose engine-context forms answer the bundle's division refusal, and the dividing `multi-instance-sub-process` `sequential-computed-*` cardinalities |
| CIB-LIM-0010 (`unsupported` at run time) | the witnesses its register entry lists, whether CIB returns a value or rolls back |
| CIB-CFG-0011 | juel-evaluation-failures `bean-reference` |
| CIB-EXT-0030 | the standards-profile witnesses [exclusive-gateway-simple-boolean](../../../scenarios/exclusive-gateway-simple-boolean/README.md) and [inclusive-gateway-selected-branches](../../../scenarios/inclusive-gateway-selected-branches/README.md), whose Definitions declare the Simple Boolean language; CIB ignores the declaration, reads `true` and `isPresent(…)` as JUEL text, a String, and rolls the start back (`el/UelExpressionCondition.java:52`) |

The Multi-Instance expression witnesses that read the counters or the item in the Activity's own inputs (expression-cardinality-and-collections, multi-instance-expressions, multi-instance-user-task) are CIB-LIM-0019's refusal witnesses, not this level's.

## CIB relations

| Register entry | Role |
|---|---|
| [CIB-OP-0004](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0004--synchronous-juel-command-rollback-mapped-to-speculative-semantic-commitment) | an evaluation failure in a command rolls it back; its asynchronous-Activity wording is superseded by the stimulus table above |
| [CIB-EXT-0024](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0024--an-unresolved-input-or-output-parameter-expression-fails-its-evaluation) | an unresolved parameter expression rolls back; the retained `entry-missing` and `exit-missing` evidence verifies its inferred reading. Proposed status line for the root: "Verified for CIB Seven 2.2.0 by the retained `entry-missing` and `exit-missing` evidence; the kernel rolls back with the evaluation's own code (`unknown-variable`), implemented with the Core JUEL evaluator." |
| [CIB-CFG-0005](../../CIB-BPMN-RELATION-REGISTER.md#cib-cfg-0005--pinned-read-only-juel-condition-environment) | superseded for CIB Seven 2.2.0 by the draft CIB-CFG-0011 |
| CIB-CFG-0011 (draft) | the pinned 2.2.0 JUEL environment: `JuelExpressionManager`'s resolver chain, the JEE6 parser profile, the four registered functions, the runner's handler beans (`CibSevenScriptedEffect.HANDLER_BEANS`) and the oracle JVM's default locale, which the runner pins; selects `Evaluator.juel`. A bean the environment registers and no binding shadows resolves in CIB and is an unknown variable in the kernel |
| CIB-EXT-0030 (draft) | CIB evaluates a condition without `language` as JUEL, ignoring a missing `xsi:type`; BPMN makes XPath the default (Table 8.1 `expressionLanguage`, the XSD default) and lets vendors substitute their own languages (§8.2.1, "vendors are free to substitute their own languages"). The CIB profile reads the undeclared case as JUEL and refuses the declared one |
| CIB-EXT-0031 (draft) | CIB evaluates an output parameter in the Activity's own scope, so it reads captured inputs and ancestors (`OutputParameter.java:47`); the standards reading evaluates outputs against the submission alone. Selected by the profile option `OutputContext.activityScope` ([data semantics](DATA-SEMANTICS-SPEC.md#activity-data)) |
| CIB-LIM-0009 (draft) | refused at admission where CIB evaluates: functions, unlisted or mutating methods, floating literals and division, named-language conditions, Definitions-declared languages, non-ASCII identifiers and whitespace, engine-context names and Multi-Instance counters, `camunda:list` and `camunda:map` parameters, `camunda:resource` conditions and `local` Call copies (by the reader) |
| CIB-LIM-0010 (draft) | `unsupported` at run time where CIB returns a value or Java surface outside the portable domain: Double results, out-of-domain and non-canonical results at a mapping, collection-to-text, ordering two Lists or two Maps, Java `equals` over Integers of unknown class, String bean properties, unlisted receiver or argument kinds, non-ASCII case mapping and numeric text, surrogate splits |
