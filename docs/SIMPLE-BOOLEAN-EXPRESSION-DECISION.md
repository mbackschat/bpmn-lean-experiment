# Simple Boolean expression language decision

## Status

**Owner-selected on 2026-07-30 and adopted by the kernel: until M2 every profile selects this language as its one evaluator; from M2 a CIB profile selects the read-only JUEL subset instead ([JUEL decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md), [kernel levels](kernel/ARCHITECTURE-SPEC.md#runtime-state-and-step)).**

## Question

How should the project execute enough BPMN `FormalExpression` behavior to establish conditional routing without making CIB JUEL, another vendor language, or a large general expression engine a prerequisite for BPMN structural progress?

## Normative boundary

BPMN 2.0.2 defines executable `FormalExpression` content and permits a `Definitions.expressionLanguage` URI plus a per-expression override. It does not define a universal expression grammar. The default for an omitted definition-level language is XPath 1.0, and the Common Executable conformance subclass names XPath as its data-access language, while BPMN also permits vendors to substitute another explicitly identified language.

The project may therefore implement a small declared language profile for Process Execution work, but it must not interpret an omitted language as that profile. A model using this language names the exact URI `urn:bpmn-lean:expression:simple-boolean:v1` on `Definitions.expressionLanguage`; every condition uses BPMN `tFormalExpression` and carries no individual language override.

This decision establishes only the declared Simple Boolean language and the BPMN rules that consume its Boolean results. It does not establish XPath 1.0, arbitrary `FormalExpression`, Common Executable conformance, CIB expression compatibility, or BPMN Process Execution Conformance.

## Selected language

Version 1 has exactly five source forms:

```text
true
false
isPresent(variableName)
isNull(variableName)
stringEquals(variableName,"string value")
```

`variableName` matches `[A-Za-z_][A-Za-z0-9_.-]{0,63}`. The `stringEquals` value is one JSON string token, including its standard escapes, whose decoded value contains only Unicode scalar values and is at most 128 UTF-8 bytes. An entire expression is at most 256 UTF-8 bytes. Whitespace outside the JSON string is forbidden, so each accepted source has one canonical spelling.

The language has no precedence, nesting, composition, coercion, paths, arithmetic, collections, functions, methods, objects, assignment, mutation, I/O, or host capabilities. Extending these five forms requires a new language identity rather than silently growing version 1.

The language evaluates over the committed variables visible to the evaluating occurrence:

| Form | Result |
|---|---|
| `true` | `true` |
| `false` | `false` |
| `isPresent(name)` | `true` exactly when one Process binding with that name exists, including an explicit-null binding |
| `isNull(name)` | `true` exactly when the binding exists and its tagged value is `null`; absence is `false` |
| `stringEquals(name,value)` | `true` exactly when the binding exists with tagged string value equal to the decoded literal; absence and explicit null are `false` |

Every admitted expression is total and returns Boolean; version 1 has no semantic evaluation-error outcome.

## Representation and execution

The [kernel reader](../packages/bpmn-source/src/kernel-reader/data.ts) recognizes the exact language URI and parses each admitted body into a closed typed expression of the kernel IL (`SimpleBoolean` in [`Kernel/IL/Types.lean`](../Kernel/IL/Types.lean): `literal`, `isPresent`, `isNull`, `stringEquals`). The exact source bytes stay the provenance root. A condition outside the language is refused at admission with a stable code (`expression.outsideSimpleBoolean`, `flow.condition.foreign`), before a Process Workflow can start.

`Kernel.Feature.Data` evaluates the typed expression inside the kernel step, in Lean and in the TypeScript transcription; neither parses XML. Gateway routing consumes the Boolean results under the [flow semantics](kernel/semantics/FLOW-SEMANTICS-SPEC.md): candidates are tried in process-level XML `sequenceFlow` declaration order, recorded as the profile interpretation classified for the CIB comparison by `CIB-INT-0001`; the gateway's `<outgoing>` reference order is not semantic authority.

Evaluation is pure internal semantic work. It adds no durable ingress, public wait, timer, Activity, effect or retry policy; replay reevaluates the same typed expression from the same program and committed bindings.

## Evidence boundary

Normative clauses and this language definition establish the intended account. Lean and the TypeScript kernel are transcriptions of one account of the language and of the consuming route rule; their agreement is a transcription check. Temporal refines the kernel and is not another semantic account.

CIB Seven cannot be an oracle for the project language. CIB JUEL evidence remains valuable for the separately classified CIB overlay and for the shared BPMN first-true and default rules, but it does not validate Simple Boolean parsing or truth. Scenarios on this language therefore compare the Lean and TypeScript kernels and the Temporal host directly, with CIB participation explicitly absent rather than coerced through JUEL or a translated expression.

## CIB JUEL disposition

The JUEL subset of the [JUEL decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md) is a separate evaluator a profile selects instead of this one. It does not replace, extend or reinterpret Simple Boolean v1, and the project never translates one language's source into the other for evidence.

## Alternatives

| Alternative | Disposition | Reason |
|---|---|---|
| Make JUEL the first and only conditional language | Defer to M2 | Coupled standards progression to a vendor language before the kernel's JUEL subset existed |
| Implement XPath 1.0 first | Defer | Stronger default-language coverage but substantially larger data, XML, function, and context surface than the first conditional-routing discriminator |
| Use only precomputed Boolean receipts | Reject as the first production profile | Useful for parameterized BPMN laws but does not execute any admitted `FormalExpression` source |
| Build a general project expression language | Reject | Recreates scope, typing, coercion, parsing, security, and evolution work not required by the bounded consumer |
| Adopt the five-form Simple Boolean language | Select | Small enough for Lean and its TypeScript transcription, useful for runtime Process data, explicit in BPMN source, and reusable by later condition-consuming nodes |

## Versioning and exclusions

The language URI is its immutable semantic identity. Any new source form, whitespace rule, identifier rule, value domain, coercion, lookup scope, error behavior, or evaluation result requires another URI and its own admission and evidence.

Version 1 excludes XPath, JUEL, FEEL, scripts, general input/output mappings, Boolean Process variables, numbers, nested data, paths, functions, methods, beans, `execution`, engine services, mutation, side effects, runtime compilation, dynamic language registration, and implicit fallback from another language.

Conditional Events, loops, assignments, and other `FormalExpression` consumers may reuse the language only through their own kernel rules and admission. This decision supplies a language provider; it does not authorize those consuming semantics.

## Reopen conditions

Reopen before changing the language, interpreting an omitted or different language URI, adding another value kind or visible scope, making evaluation effectful or fallible, using a host object, claiming XPath or CIB compatibility, or exposing expression evaluation as a public wait or Temporal operation.
