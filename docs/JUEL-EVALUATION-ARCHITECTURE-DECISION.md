# JUEL evaluation architecture decision

## Status

**Owner-selected architecture decision on 2026-07-30; the exact semantic capsule, dependencies, Java Activity Worker, wire contracts, and production implementation remain unapproved.**

## Question

How should a selected CIB Seven profile evaluate read-only JUEL expressions without creating a project-owned expression language, parser, abstract syntax tree, or evaluator?

This decision answers the evaluator-ownership and hosting question. It does not yet select the first complete JUEL expression set, expand the runtime value domain, approve Exclusive Gateway semantics, or authorize a dependency.

## Layer and authority

BPMN 2.0.2 defines `FormalExpression` and lets a definition or individual expression identify its expression language. It does not define JUEL. JUEL behavior therefore belongs to a selected CIB compatibility profile, not to the vendor-neutral BPMN core.

The authority split is:

| Concern | Owner |
|---|---|
| Exact expression source, language/profile identity, permitted source context, and admission | BPMN source boundary plus the selected CIB profile |
| Visible variable scopes, typed values, absence versus explicit null, and evaluation point | BPMN semantic account |
| JUEL parsing, AST construction, operators, coercion, property resolution, and evaluation | Exact pinned JUEL runtime |
| Binding an evaluation result to the exact request and applying the consuming BPMN rule | Lean and the pure TypeScript semantic core |
| Durable invocation, retry, result delivery, replay, and Java Worker routing | Temporal adapter |
| Bean, `DelegateExecution`, Process Engine service, and A12 capability binding | CIB compatibility or downstream A12 adoption layer, outside the future read-only capsule |

The pinned language runtime is semantic authority only for the result of the selected language evaluation. It does not choose an outgoing Sequence Flow, mutate Process state, define scope visibility, or become BPMN authority.

## Selected direction

The project supplies the exact JUEL source and a complete immutable context for the declared visible scope to the actual CIB Seven JUEL implementation. That implementation parses the source, constructs its internal AST, resolves values, applies JUEL coercion, and evaluates the expression.

Lean, the TypeScript semantic core, and project-authored Java code do not implement or mirror the JUEL grammar or evaluator. They retain the exact expression source and validate a content-bound evaluation result.

The first profile is read-only:

- the context contains every binding visible in the selected Process scope, not only variables that admission predicts the expression will read;
- presence and explicit null remain distinct;
- values are immutable JSON-like data from an exact closed domain selected by the capsule;
- no `execution` object, configured bean, Spring context, function mapper, Process Engine service, file/network capability, or mutable Java application object enters the context;
- a method call or capability-bearing expression is outside this profile even when the pinned JUEL grammar can parse it.

Variable mutation and engine-service calls are different mechanisms. A future mutating expression must return a typed variable patch for semantic-core validation. A Process Engine or application-service call must use an explicit effect or adoption capability. Neither follows from read-only JUEL support.

## Existing bounded mapping token

The implemented CreateDocument and boundary-error capsules already recognize one exact output token such as `${newDocRef}`, lower it to `MappingExpression.localVariable`, and perform a direct Activity-local binding lookup in Lean and TypeScript. They also represent literal input bodies as `MappingExpression.stringLiteral`.

That representation is not a JUEL parser or general evaluator: admission accepts only the complete exact token selected by each capsule, and the runtime performs no JUEL parsing, coercion, operator, property, function, or method behavior. The literal arm is ordinary mapping data and remains valid.

The local-variable arm is nevertheless a project-owned shortcut for one JUEL-shaped mapping form. It remains only to preserve the two implemented evidence-closed capsules until a mapping-expression capsule replaces it. It must not be extended with operators, paths, coercion, conditions, or additional JUEL syntax. When CIB JUEL input/output mapping enters scope, that capsule must either replace the shortcut atomically with pinned-runtime evaluation or prove and retain an explicit exact-token equivalence under one owner; pre-release code must not retain two independently selectable evaluation paths for the same admitted source.

The first conditional-Sequence-Flow capsule does not remove this mapping representation because it has a different consumer and lifecycle. Removing it beforehand would break current checked programs and evidence without supplying a replacement.

## First consumer boundary

The first intended consumer is conditional Sequence Flow evaluation for an Exclusive Gateway. One evaluation request may contain the gateway's ordered non-default candidate flows so one Java Activity invocation can preserve the reviewed CIB ordering and short-circuit account without one Temporal Activity per condition. Source-order first-true evaluation is the initial hypothesis, not an approved behavior; the capsule must establish it against pinned source and an executable probe.

The evaluator returns condition results, not a selected Sequence Flow. Under the candidate first-true account, a successful result contains either:

- a false prefix followed by the first true condition; or
- all false conditions when the consuming gateway may select its declared default.

The semantic core validates candidate identity and order and applies the separately approved gateway rule. If the pinned profile stops at the first true condition, evaluating later conditions is forbidden because a later expression may fail or invoke behavior that CIB would not reach.

This decision authorizes no new Semantic Process IL operation. The Exclusive Gateway capsule must decide whether an external evaluation wait is a reusable semantic mechanism, complete its Temporal preflight, and satisfy the targeted closure-limit and multiple-enabledness gate before changing checked source, IL, Lean, or the TypeScript core.

## Candidate private contract

The exact wire shape remains a capsule decision. The minimum information is:

```ts
type JuelConditionRequest = DeepReadonly<{
  profileId: string;
  definitionId: string;
  processInstanceId: string;
  evaluationId: string;
  candidates: readonly {
    sequenceFlowId: string;
    expression: string;
  }[];
  defaultSequenceFlowId: string;
  processVariables: readonly {
    name: string;
    value: JuelContextValue;
  }[];
}>;

type JuelConditionResult = DeepReadonly<
  | {
      kind: "evaluated";
      requestDigest: string;
      results: readonly {
        sequenceFlowId: string;
        value: boolean;
      }[];
    }
  | {
      kind: "evaluationError";
      requestDigest: string;
      sequenceFlowId: string;
      error: JuelEvaluationError;
    }
>;
```

`JuelContextValue`, `JuelEvaluationError`, request identity, digest domain, and the exact result-prefix invariant remain deliberately undefined until the first capsule fixes the typed value and error boundaries. Host IDs, Activity attempts, task queues, and Java class names do not enter the semantic request.

## Temporal hosting preflight

The actual `cibseven-juel` implementation is Java and cannot execute inside the TypeScript Workflow sandbox. The selected hosting direction is a normal Java Temporal Activity Worker on a dedicated evaluator boundary. A TypeScript Local Activity or spawned JVM subprocess inside the Workflow Worker is not selected.

The preflight must establish:

- one content-bound Activity request per gateway activation rather than one Activity per candidate condition;
- source-order evaluation and first-true short-circuit;
- exact context serialization across the TypeScript and Java SDKs;
- absence versus explicit null and the selected scalar/container types;
- deterministic result delivery under Worker restart and replay;
- retry, timeout, cancellation, duplicate execution, malformed result, and unavailable-Worker classification;
- Event History growth per evaluation Activity and the resulting difference from pure internal semantic closure;
- no evaluation result derived from Temporal task order, Activity attempt number, or another host identity;
- no evaluator bypass that lets Workflow code or the TypeScript core fabricate condition truth.

An Activity result is recorded in Event History and reused during replay. Replay therefore reproduces the selected route without running JUEL again for the recorded activation, while a new live activation evaluates against its new content-bound context.

## Evidence and independence

The minimum separating evidence must cover:

- exact `${...}` and `#{...}` source retention without normalizing them into one lexical token;
- a present scalar variable, explicit null, an absent variable, and a nested read from the selected context domain;
- coercion and non-Boolean condition results;
- syntax, unresolved-property, and evaluation failures;
- ordered false/true short-circuit and all-false default behavior;
- a hostile method, bean, function, `execution`, or engine-service expression rejected or made unresolvable by the selected profile;
- cross-language Activity payload compatibility, Worker loss, retry, replay, and Event History inspection;
- a seeded request-binding or candidate-order mutation that the semantic boundary rejects.

CIB Seven and the project evaluator share the same JUEL implementation and therefore do not count as two uncorrelated evidence lanes for expression truth. CIB engine evidence still checks integration facts such as its resolver context, gateway iteration, command failure, and default-flow behavior. Lean and TypeScript prove and test the consuming BPMN transition conditional on the bound evaluation receipt; they do not independently corroborate JUEL truth.

## Candidate dependency record

The candidate language dependency is `org.cibseven.bpm.juel:cibseven-juel:2.0.0` from the pinned CIB Seven `2.0.0` release. [SOURCES.md](SOURCES.md#cib-seven) owns the artifact URL, source revision, license, POM/shading fact, local-cache boundary, and verified SHA-256.

Its role would be only JUEL parsing and evaluation in the isolated Java evaluator Worker. Removing it removes the CIB JUEL compatibility lane and Worker implementation without changing the pure TypeScript semantic core. The exact Temporal Java SDK, Java build module, payload converter, task queue, container image, and deployment unit remain undecided dependencies and infrastructure.

No dependency is adopted by this decision. Dependency approval requires the complete direct and transitive graph, exact versions and integrity, licenses, source provenance, runtime role, security review, and removal cost.

## Required before implementation

1. Derive and record the exact first read-only condition-expression denominator and the smallest required typed context domain.
2. Classify the selected CIB behavior in the [CIB–BPMN relationship register](CIB-BPMN-RELATION-REGISTER.md).
3. Complete the evaluator error and command-rollback decision against pinned CIB Seven.
4. Complete the Exclusive Gateway source-order, default-flow, and evaluation-result semantic capsule.
5. Complete the Temporal hosting/refinement preflight above.
6. Obtain explicit approval for every new Java, Temporal, JUEL, build, and runtime dependency.
7. Use red/green evidence before changing production Lean, TypeScript, Java, schemas, or retained evidence.

## Exclusions

This decision does not authorize:

- a project-owned expression grammar, AST, evaluator, optimizer, or transpiler;
- extending the existing exact `MappingExpression.localVariable` shortcut into a JUEL subset;
- a project-native FEEL substitute for JUEL;
- standard XPath support or a general multi-language expression framework;
- arbitrary JUEL methods, beans, functions, `execution`, `DelegateExecution`, Process Engine services, or application services;
- variable mutation, side effects, scripts, Groovy, FreeMarker, JavaScript, or DMN/FEEL evaluation;
- an expression result selected or fabricated by the Temporal adapter;
- a Java semantic core, Java Workflow, second production interpreter, or remote semantic-core service;
- general CIB compatibility, general expression support, or BPMN Process Execution Conformance.

XPath, DMN/FEEL, Groovy, and FreeMarker remain separately selected language profiles with their own runtimes and capability boundaries. A shared multi-language protocol may be extracted only after a second implemented consumer demonstrates genuinely identical contract structure.

## Reopen conditions

Reopen this direction if the actual target expressions require a capability-bearing `execution` context for the first useful slice, if a Java Activity cannot preserve the required command/rollback observation, if Activity history cost is unacceptable, if the selected JUEL artifact cannot be sandboxed to the approved context, if a standard BPMN profile rather than the CIB overlay becomes the first consumer, or if Lean must prove expression truth rather than the consuming transition conditional on an external result.
