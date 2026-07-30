# Simple Boolean expression language decision

## Status

**Owner-selected on 2026-07-30 for the first standards-facing conditional-routing capsule; implementation is authorized but not yet complete. CIB JUEL remains a separately approved compatibility direction and is deferred from the active implementation path.**

## Question

How should the project execute enough BPMN `FormalExpression` behavior to establish conditional routing without making CIB JUEL, another vendor language, or a large general expression engine a prerequisite for BPMN structural progress?

## Normative boundary

BPMN 2.0.2 defines executable `FormalExpression` content and permits a `Definitions.expressionLanguage` URI plus a per-expression override. It does not define a universal expression grammar. The default for an omitted definition-level language is XPath 1.0, and the Common Executable conformance subclass names XPath as its data-access language, while BPMN also permits vendors to substitute another explicitly identified language.

The project may therefore implement a small declared language profile for Process Execution work, but it must not interpret an omitted language as that profile. A model using this language names the exact URI `urn:bpmn-lean:expression:simple-boolean:v1` on `Definitions.expressionLanguage`; every condition uses BPMN `tFormalExpression` and carries no individual language override.

This slice establishes only the declared Simple Boolean profile and the BPMN rules that consume its Boolean results. It does not establish XPath 1.0, arbitrary `FormalExpression`, Common Executable conformance, CIB expression compatibility, or BPMN Process Execution Conformance.

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

The language evaluates over the complete committed Process-scope `VariableBinding[]` already owned by the semantic runtime:

| Form | Result |
|---|---|
| `true` | `true` |
| `false` | `false` |
| `isPresent(name)` | `true` exactly when one Process binding with that name exists, including an explicit-null binding |
| `isNull(name)` | `true` exactly when the binding exists and its tagged value is `null`; absence is `false` |
| `stringEquals(name,value)` | `true` exactly when the binding exists with tagged string value equal to the decoded literal; absence and explicit null are `false` |

Duplicate Process binding names are invalid runtime state and are rejected by existing state/program admission rather than resolved by first or last occurrence. Every admitted expression is total and returns Boolean; version 1 has no semantic evaluation-error outcome.

## Representation and execution

The source boundary retains the exact decoded condition body and explicit language URI in the checked BPMN graph. Static profile admission parses and validates the body before a Process Workflow can start.

Lowering converts each admitted body into a closed typed expression:

```ts
type SimpleBooleanExpression = DeepReadonly<
  | { kind: "literal"; value: boolean }
  | { kind: "isPresent"; variable: string }
  | { kind: "isNull"; variable: string }
  | { kind: "stringEquals"; variable: string; value: string }
>;
```

Lean and TypeScript each implement the five-form parser and evaluator independently. Lean receives the checked exact body, independently parses it during canonical lowering, and checks the received Semantic Process program for exact equality before execution. The TypeScript semantic core receives only the typed program expression and performs no XML parsing.

Conditional routing uses one generic `choose` Semantic Process operation containing an input place, an ordered nonempty list of condition/output pairs, and one default output. It evaluates conditions in checked order, consumes one input token, and adds one token only to the first true candidate output or to the default output when all candidates are false.

The first source capsule remains exactly two conditional candidates plus one conditionless default. Candidate order is process-level XML `sequenceFlow` declaration order, recorded as the project profile interpretation already classified for the CIB comparison by `CIB-INT-0001`. The gateway's `<outgoing>` reference order is not semantic authority.

## Temporal hosting and refinement preflight

Simple Boolean evaluation is pure internal semantic work. It adds no durable ingress, public wait, timer, Activity, cancellation path, effect, retry policy, task queue, Java Worker, or external result receipt.

The existing single Workflow loop supplies the admitted program and committed state to the pure semantic core. A `choose` firing may occur inside the same bounded internal closure as initiation or an accepted User Task completion. Event History grows only through the surrounding Workflow Task and existing durable interaction; it does not add one Temporal Event per expression or conditional transition.

The state relation remains equality of committed Workflow-held core state and pure semantic-core state. Replay deterministically reevaluates the same typed expression from the same recorded program and committed Process bindings. The existing `semanticProcessClosureLimit`, currently 8, remains a per-command bound; the first conditional topology must carry an executable longest-path guard and a multiple-enabledness refusal or order-invariance guard.

## Evidence boundary

Normative clauses and the project language definition establish the intended account. Lean and TypeScript are independent implementations of both the tiny language and the consuming route rule. Temporal refines the TypeScript core and is not another semantic account.

CIB Seven cannot be used as an oracle for the project language. Existing CIB JUEL probes remain valuable evidence for the separately classified CIB overlay and for the shared BPMN first-true/default rules, but they do not validate Simple Boolean parsing or truth.

The first source scenarios therefore use the project profile and compare Lean, TypeScript, and Temporal directly. CIB participation is explicitly absent rather than coerced through JUEL or a translated expression.

## CIB JUEL disposition

The [JUEL evaluation architecture decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md) remains the approved direction when exact CIB expression compatibility becomes the active need. Its pinned-runtime, complete-context, read-only capability, receipt, rollback, and Java Activity boundaries remain valid.

JUEL implementation and its 38-jar Java Worker graph are deferred. The graph was reviewed and approved but is not adopted by the repository. The uncommitted empty Worker module and build gate are removed rather than retained as idle production surface.

When reopened, JUEL must be a separate language provider that supplies a content-bound result to the same BPMN conditional-choice meaning. It must not replace, extend, or reinterpret Simple Boolean v1, and the project must not translate one language's source into the other for evidence.

## Alternatives

| Alternative | Disposition | Reason |
|---|---|---|
| Make JUEL the first and only conditional language | Defer to CIB compatibility | Couples standards progression to Java Activity suspension, cross-SDK payloads, retries, rollback emulation, and a vendor language |
| Implement XPath 1.0 first | Defer | Stronger default-language coverage but substantially larger data, XML, function, and context surface than the first conditional-routing discriminator |
| Use only precomputed Boolean receipts | Reject as the first production profile | Useful for parameterized BPMN laws but does not execute any admitted `FormalExpression` source |
| Build a general project expression language | Reject | Recreates scope, typing, coercion, parsing, security, and evolution work not required by the bounded consumer |
| Adopt the five-form Simple Boolean language | Select | Small enough for independent Lean/TypeScript implementation, useful for runtime Process data, explicit in BPMN source, and reusable by later condition-consuming nodes |

## Versioning and exclusions

The language URI is its immutable semantic identity. Any new source form, whitespace rule, identifier rule, value domain, coercion, lookup scope, error behavior, or evaluation result requires another URI and its own admission and evidence.

Version 1 excludes XPath, JUEL, FEEL, scripts, general input/output mappings, Boolean Process variables, numbers, nested data, paths, functions, methods, beans, `execution`, engine services, mutation, side effects, runtime compilation, dynamic language registration, and implicit fallback from another language.

Conditional Events, loops, assignments, and other `FormalExpression` consumers may reuse the language only through their own semantic capsules. This decision supplies a language provider; it does not authorize those consuming semantics.

## Reopen conditions

Reopen before changing the language, interpreting an omitted or different language URI, adding another value kind or visible scope, making evaluation effectful or fallible, using a host object, claiming XPath or CIB compatibility, or exposing expression evaluation as a public wait or Temporal operation.
