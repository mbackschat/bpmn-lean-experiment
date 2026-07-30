# JUEL evaluation architecture decision

## Status

**Owner-selected CIB compatibility architecture on 2026-07-30 and deferred later that day behind the standards-first [Simple Boolean expression decision](SIMPLE-BOOLEAN-EXPRESSION-DECISION.md). The reviewed dependency set remains approved but unadopted; the Java Activity Worker, wire contracts, and production implementation remain absent.**

## Question

How should a selected CIB Seven profile evaluate read-only JUEL expressions without creating a project-owned expression language, parser, abstract syntax tree, or evaluator?

This decision answers the evaluator-ownership and hosting question for the CIB JUEL compatibility overlay. The [Exclusive Gateway condition specification](capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md) owns the implemented standards-first project language and pure consuming semantics; when JUEL is reopened, it supplies another language result to that BPMN mechanism through a separately approved compatibility capsule. The exact reviewed dependency set was separately approved after independent review; this decision does not adopt it or claim an implementation.

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

## Deferred first compatibility consumer boundary

When this compatibility lane reopens, its first consumer is conditional Sequence Flow evaluation for an Exclusive Gateway. One evaluation request contains the gateway's ordered non-default candidate flows so one Java Activity invocation preserves the reviewed CIB ordering and short-circuit account without one Temporal Activity per condition. `CIB-INT-0001` fixes candidate order to XML `sequenceFlow` declaration order, and `CIB-AGR-0006` fixes first-true and all-false default behavior for the bounded profile.

The evaluator returns condition results, not a selected Sequence Flow. Under the candidate first-true account, a successful result contains either:

- a false prefix followed by the first true condition; or
- all false conditions when the consuming gateway may select its declared default.

The semantic core validates candidate identity and order and applies the separately approved gateway rule. If the pinned profile stops at the first true condition, evaluating later conditions is forbidden because a later expression may fail or invoke behavior that CIB would not reach.

This decision alone authorizes no new Semantic Process IL operation. The active standards capsule implements the generic `choose` mechanism without suspension. A future JUEL capsule must add its private suspended-command and receipt boundary atomically rather than leaving a parallel path in the current contract. Dependency adoption and every Java/receipt implementation step are deferred.

## Selected private contract boundary

The capsule fixes the exact semantic fields, result-prefix invariant, one evaluation-error arm, diagnostic boundary, and identity bindings. The concrete shared JSON Schema remains production work. Its minimum shape is:

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
  processVariables: readonly VariableBinding[];
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
      diagnostic: {
        code: "propertyResolution" | "methodResolution" | "nonBooleanResult" | "runtimeFailure";
        message: string | null;
      } | null;
    }
>;
```

For the first capsule, `VariableBinding` and tagged `VariableValue.String | VariableValue.Null` are the existing canonical variable contract; absence is represented by no binding. The Java evaluator converts those two variants to Java `String | null` only at its validated boundary. There is one semantic `evaluationError` arm because every evaluator failure has the same consuming result: rollback to the original committed state. Its optional diagnostic code and message are operator data only and are excluded from the request digest, Lean/TypeScript semantic comparison, and command outcome. The code is the closed union shown above, and a non-null message is capped at 512 UTF-8 bytes; the implementation never classifies absent-root versus unsupported-property behavior by localized JUEL message text. The successful result is the ordered false prefix ending with the first true result, or the complete all-false candidate list. The request digest binds profile, definition, semantic Process instance, gateway operation and activation, candidates, exact expressions, default, and the complete tagged Process-scope context. Host IDs, Activity attempts, task queues, and Java class names do not enter the semantic request.

## Temporal hosting preflight

The actual `cibseven-juel` implementation is Java and cannot execute inside the TypeScript Workflow sandbox. The selected hosting direction is a normal Java Temporal Activity Worker on a dedicated evaluator boundary. A TypeScript Local Activity or spawned JVM subprocess inside the Workflow Worker is not selected.

Deployment-time syntax validation uses a short-lived TypeScript `validateJuelConditions` Workflow started by the deployment orchestrator after structural compilation and before any Process Workflow. It schedules one batched parse-only Activity on the same Java evaluator Worker and requires a content-bound success receipt before admission is finalized. This names the missing cross-language transport without adding a direct service endpoint or fourth runtime root. Validation syntax failure is definition rejection; Worker absence, timeout, malformed transport, or validation-Workflow failure is deployment infrastructure failure.

The [capsule preflight](capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md#temporal-hosting-and-refinement-preflight) selects:

- one content-bound Activity request per gateway activation rather than one Activity per candidate condition;
- XML Sequence Flow declaration-order evaluation and first-true short-circuit;
- exact context serialization across the TypeScript and Java SDKs, including absence versus tagged explicit null and the selected String/Null values;
- deterministic result delivery under Worker restart and replay;
- start-to-close 2 seconds, schedule-to-close 10 seconds, two attempts, fixed 100-millisecond retry backoff, no heartbeat, read-only duplicate safety, and separate typed-evaluation versus infrastructure failures;
- Event History growth per evaluation Activity and the resulting difference from pure internal semantic closure;
- no evaluation result derived from Temporal task order, Activity attempt number, or another host identity;
- no evaluator bypass that lets Workflow code or the TypeScript core fabricate condition truth.

An Activity result is recorded in Event History and reused during replay. Replay therefore reproduces the selected route without running JUEL again for the recorded activation, while a new live activation evaluates against its new content-bound context. Runtime Activity attempt exhaustion fails the originating Update outside the semantic outcome algebra, discards the private continuation, preserves the original committed User Task wait, and resumes the single input queue; it cannot leave a permanently pending continuation.

## Evidence and independence

The minimum separating evidence must cover:

- exact `${...}` and `#{...}` source retention without normalizing them into one lexical token;
- a present string variable, explicit null, an absent variable, and rejection of nested or capability-bearing access outside the selected context domain;
- coercion and non-Boolean condition results;
- syntax, unresolved-property, and evaluation failures;
- ordered false/true short-circuit and all-false default behavior;
- a hostile method, bean, function, `execution`, or engine-service expression rejected or made unresolvable by the selected profile;
- cross-language Activity payload compatibility, Worker loss, retry, replay, and Event History inspection;
- a seeded request-binding or candidate-order mutation that the semantic boundary rejects.

CIB Seven and the project evaluator share the same JUEL implementation and therefore do not count as two uncorrelated evidence lanes for expression truth. CIB engine evidence still checks integration facts such as its resolver context, gateway iteration, command failure, and default-flow behavior. Lean and TypeScript prove and test the consuming BPMN transition conditional on the bound evaluation receipt; they do not independently corroborate JUEL truth.

For the selected capsule, pristine CIB public behavior supplies enough evidence to distinguish declaration order, first-true short circuit, default routing, syntax admission failure, runtime resolution/non-Boolean failure, selected branch, and command rollback. It does not expose the evaluator's complete internal resolver context or every evaluated prefix as raw public facts. A modified CIB branch may add tracing or deterministic fault points only as diagnostic evidence under the [reference-instrumentation policy](REFERENCE-INSTRUMENTATION-POLICY.md); it must be shadow-compared with the pristine pinned lane and does not increase the independent lane count.

## Candidate dependency record

The approved Worker dependency set has runtime roots `org.cibseven.bpm.juel:cibseven-juel:2.0.0` and `io.temporal:temporal-sdk:1.35.0`, plus build-time import of `com.fasterxml.jackson:jackson-bom:2.21.5` to align Temporal's older Jackson transitive family to a currently advisory-clean patch. [SOURCES.md](SOURCES.md#candidate-java-juel-evaluator-worker) owns the resolved 38-artifact graph, URLs, source revisions, licenses, local-cache boundary, integrity, advisory scan, and removal cost.

The JUEL artifact's role would be only parsing and evaluation in the isolated Java evaluator Worker. The Java Temporal SDK would host only the Activity Worker and cross-SDK payload boundary. Removing the module and task-queue registration removes the complete graph without changing the pure TypeScript semantic core. The Java module placement, payload converter, deployment unit, and container image remain implementation choices inside the capsule boundary.

No dependency is adopted. Independent review verified the complete direct and transitive graph, exact versions and integrity, licenses, source provenance, runtime role, security review, and removal cost, and the owner approved that exact set on 2026-07-30. Adoption requires the CIB compatibility lane to be explicitly reopened; the earlier uncommitted empty Worker module was removed when the standards-first sequence was selected.

## Required before implementation

1. **Completed:** derive and record the exact first read-only condition-expression denominator and the smallest required typed context domain.
2. **Completed:** classify the selected CIB behavior in the [CIB–BPMN relationship register](CIB-BPMN-RELATION-REGISTER.md).
3. **Completed:** decide evaluator errors and command rollback against pinned CIB Seven.
4. **Completed:** implement the [Exclusive Gateway source-order, default-flow, and evaluation-result capsule](capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md).
5. **Completed:** complete the capsule's Temporal hosting/refinement preflight.
6. **Completed:** approve the recorded Java Temporal, CIB JUEL, and Jackson alignment dependencies.
7. **Completed:** name the short-lived validation Workflow, runtime Activity-exhaustion recovery, one semantic evaluation-error arm, tagged variable context, per-command closure budget, runtime-only inventory, and atomic versioning set.
8. **Deferred:** reopen the CIB JUEL compatibility lane before adopting the approved dependencies or adding a Java Worker.
9. **Required after reopening:** define the shared request/result schema and prove the Java/TypeScript cross-SDK round trip before adding suspension, receipt, or Activity behavior to the current conditional-choice contract.

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
