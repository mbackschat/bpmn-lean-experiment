# CIB Seven compatibility scope proposal

**Status:** Owner-approved on 2026-07-26 and amended on 2026-07-30 with the profile-selected JUEL delegation direction; no JUEL dependency, Java evaluator Worker, expression wire contract, or production implementation is approved

## Question

Which Camunda/CIB Seven BPMN extensions and execution APIs should this project treat as current scope, deliberate future scope, deferred compatibility work, or non-goals?

The pinned-source findings and family inventory are in [CIB Seven BPMN extensions and execution-API research](research/CIB-SEVEN-EXTENSIONS-RESEARCH.md). This proposal selects project boundaries; it does not authorize a semantic capsule, dependency, Java runtime, expression engine, or production API implementation.

## Layer role

CIB Seven compatibility is an overlay on the vendor-neutral BPMN execution core, not the first or highest layer of the product. Standard BPMN propositions remain usable without a CIB profile. This document selects only the CIB syntax, interpretations, extensions, configurations, and host relations that a named compatibility profile adds.

A12 Workflows sits above this layer as a downstream adoption target. Its corpus may justify prioritizing one CIB surface, but A12 handler names, Java APIs, integration façades, and model-specific shapes belong to an A12 adoption adapter or exact compatibility fixture. They do not become generic CIB semantics.

Do not create or expand a CIB profile merely because a BPMN capsule exists. Add CIB work when at least one of these conditions holds:

- BPMN leaves a material operational choice and the selected profile adopts CIB's choice;
- the source uses a selected `camunda:*` extension;
- a behavioral compatibility claim needs a pinned separating observation;
- a CIB host mechanism or configuration can change the bounded public result;
- an A12 adoption requirement cannot be expressed through an already selected CIB contract.

Where standard BPMN behavior is sufficiently precise and no compatibility promise needs a new engine fact, the BPMN capsule may close without new CIB extension scope. Existing CIB evidence can still serve as a bounded oracle observation when its failure mode and fidelity are stated.

## Recommended compatibility claim

The owner adopted this durable target:

> The project aims to execute an explicitly versioned subset of BPMN 2.0.2 and selected Camunda/CIB Seven source extensions with declared behavioral compatibility. It does not aim to be a drop-in replacement for the CIB Seven Process Engine Java, REST, plugin, persistence, deployment, or administration APIs.

Compatibility claims remain level-specific:

- exact BPMN source bytes and unsupported extension content can be retained without being executable;
- only selected namespace-expanded QNames and exact contexts enter source admission;
- selected bindings normalize to project-owned protocol and handler descriptors before Semantic Process IL;
- behavioral compatibility is established capsule by capsule against the pinned CIB profile;
- handler, Java, scripting, expression, and worker-protocol compatibility require their own contracts and evidence.

“CIB-compatible” without one of these boundaries is prohibited.

## Recommended dispositions

| Surface | Disposition | Rationale and reopen condition |
|---|---|---|
| Exact source-byte retention for extension-bearing BPMN | **In scope now** | Preserve provenance even when execution rejects an extension; retention does not imply normalized round-trip or execution |
| Namespace-aware recognition of capsule-selected extensions | **In scope now** | Required for exact CIB evidence; admit by namespace URI, local name, BPMN context, and value shape |
| Project-owned effect protocol and handler identifier | **In scope for the Service Task capsule** | Supplies the portable semantic/adapter boundary without importing a Java class or JUEL object into the core |
| Polyglot Temporal Activity execution and project-native Java handlers | **Strategic compatibility scope; implementation separately approved** | A TypeScript Workflow can dispatch the language-neutral effect protocol to TypeScript or JVM Workers; this supplies Java business-code integration without duplicating the interpreter |
| Exact `camunda:delegateExpression="${bpmnLeanEffectHandler}"` plus `camunda:asyncBefore="true"` | **Recommended for the Service Task capsule only** | CIB can bind the exact expression to the probe bean; project admission treats the whole expression as a selected token and does not claim general JUEL |
| Generic `camunda:class` execution | **Deferred** | XML support is easy, but arbitrary Java class loading, construction, field injection and delegate APIs are not; reopen for a real Java-delegate migration consumer |
| Generic bean/delegate-expression binding | **Future candidate** | Prefer a project handler registry first; reopen after the public handler lifecycle and variable/result contract have a consumer |
| Existing CIB Seven `JavaDelegate` binaries | **Deferred compatibility lane** | Requires an isolated Java executor and an exact `DelegateExecution` API disposition; assess after typed variables and a Java-worker deployment need exist |
| Existing original Camunda 7 delegate binaries | **Deferred separately** | `org.camunda` and `org.cibseven` package identities differ; support would require a distinct bridge or dual API surface |
| Full `DelegateExecution`, `ActivityBehavior`, Process Engine services, REST and plugin compatibility | **Non-goal for the current product architecture** | This would reproduce engine internals and host identities that the semantic-core boundary deliberately excludes; reconsider only through a separately funded compatibility program |
| Read-only JUEL/Unified EL over typed Process data | **Selected architecture direction; capsule and dependency approval required** | Supply exact source and complete approved context to the pinned CIB JUEL runtime behind a Java Activity; Lean and TypeScript consume a bound result and do not implement JUEL |
| General JUEL methods, beans, `execution`, mutation, or engine-service access | **Deferred separate capability lanes** | Data evaluation, typed variable patches, bean/application capabilities, and Process Engine services have different authority, security, rollback, and effect boundaries |
| FEEL | **Not selected as the project-native replacement for JUEL** | The target BPMN expressions use JUEL and the pinned CIB FEEL integrations belong to DMN; reopen only for a concrete DMN or explicitly selected FEEL-language profile |
| BPMN Script Task with a pure deterministic language subset | **Future profile-specific candidate after typed variables** | Use the exact selected language runtime; do not create a project language merely to obtain Script Task coverage |
| Effectful or untrusted scripts | **Deferred Activity/effect hosting** | Must execute outside Workflow and semantic core under a pinned sandbox/capability profile |
| Generic JSR-223, Groovy, JavaScript, Python or Ruby script compatibility | **Deferred compatibility lane** | Language engines and security behavior are deployment-specific and dependency-bearing |
| External-task topic/fetch-and-lock protocol | **Deferred** | Valuable migration surface, but adds locks, leases, worker identity, failure, retries and incidents; reopen for an external-worker consumer |
| Async continuations and job retry extensions | **Capsule-selected only** | Host realization and evidence, never automatic semantic facts; each use needs a CIB configuration and fidelity classification |
| Exact literal and one local-reference input/output mappings | **Implemented bounded slices** | The current direct mapping representation is not general JUEL and must not grow into one; a future JUEL mapping capsule replaces it or proves an exact-token equivalence |
| Field injection and general input/output mappings | **Deferred** | Require handler object lifecycle, profile-selected expression evaluation, typed values, scopes, result propagation, and a transaction/failure decision |
| Execution/task listeners | **Deferred** | New lifecycle hook ordering and mutable callback contexts require separate semantics and evidence |
| Forms, assignees, candidates, dates and identity extensions | **Deferred to User Task profiles** | Not part of effect execution; reopen with identity/form consumers |
| Call Activity, decision and case bindings | **Deferred** | Require deployment/version/tenant identity and DMN/CMMN decisions |
| Multi-instance extensions | **Deferred** | Require collections, variable scopes, occurrence aggregation and concurrency semantics |
| Connectors and built-in mail/shell task types | **Deferred** | Plugin/configuration-specific protocols with no current consumer |
| Retry exhaustion, incidents, BPMN Errors, compensation and cancellation | **Deferred semantic capsules** | Must not be inferred from the success-only Service Task effect account |

## Service Task binding decision

The approved binding replaces the draft capsule’s `camunda:class="org.bpmnlean.cibseven.ProbeServiceTaskDelegate"` source binding with:

```xml
<serviceTask
  id="ServiceTask_Record"
  implementation="urn:bpmn-lean:effect:probe-v1"
  camunda:delegateExpression="${bpmnLeanEffectHandler}"
  camunda:asyncBefore="true" />
```

The exact binding has two target-specific realizations:

- CIB Seven’s test configuration registers `bpmnLeanEffectHandler` as the project probe `JavaDelegate`;
- project admission recognizes only the exact expression token in this exact Service Task profile and normalizes it to handler identifier `bpmnLeanEffectHandler` plus the project effect protocol.

The standard `implementation="urn:bpmn-lean:effect:probe-v1"` and the extension `delegateExpression="${bpmnLeanEffectHandler}"` are one profile-defined pair. Executable admission rejects either field alone, any alternative spelling or value, and every mismatched pair. The normalized effect contract assigns distinct authority: `protocol` is the technology or coordination protocol read from the standard `implementation` attribute, while `handler` is business-effect identity and Worker dispatch authority. Both come from the admitted pair and neither may be selected or changed independently by a Worker or adapter.

Requiring the project URN is deliberately a probe-fixture profile choice. A real existing CIB document ordinarily carries its Camunda binding without this project URN, so the pair is not the future general migration-admission rule. Any migration profile that infers or supplies protocol identity must make that mapping explicit, versioned, and separately evidenced. A second business effect under the same protocol receives a different handler rather than a new protocol URI.

Lean, Semantic Process IL, the TypeScript semantic core, and Temporal Workflow code never parse or evaluate JUEL and never contain a CIB Java class. The Temporal Activity Worker selects the test handler through adapter configuration. The separately proposed JUEL evaluator also preserves this boundary: an isolated Java Activity Worker invokes the pinned runtime and returns a typed, content-bound result. A future public registry may reuse the stable handler identifier, but this capsule does not generalize or publish that registry without a non-test consumer.

This is deliberate source compatibility, not Java API compatibility. Hostile variants such as method expressions, property paths, whitespace-normalized alternatives, another bean name, `camunda:field`, `camunda:expression`, or another extension context remain rejected.

## Replacement API direction

The replacement architecture should expose a project-owned effect protocol rather than make CIB’s `DelegateExecution` the universal API:

```ts
type EffectRequest = Readonly<{
  protocol: "urn:bpmn-lean:effect:probe-v1";
  handler: "bpmnLeanEffectHandler";
  idempotencyKey: string;
}>;

type EffectResult = Readonly<{
  kind: "success";
}>;
```

The success-only Service Task capsule needs no variables or payload, so it should not publish a broader interface yet. Later variable/effect capsules can add typed input and result data under ordinary wire-contract evolution.

The request is derived from one committed normalized descriptor containing the exact protocol/handler pair. A Worker dispatches only by `handler`; `protocol` identifies the execution protocol and remains part of content and idempotency binding. A request whose fields do not equal the admitted pair is an adapter-contract failure, not a fallback dispatch opportunity.

A Java bridge, if separately approved, sits behind this protocol as a Temporal Activity Worker or isolated executor:

```text
committed semantic intent
        ↓
project EffectRequest
        ↓
Java compatibility executor
        ↓
configured bean or delegate
        ↓
typed EffectResult / host failure
```

That bridge may offer one of two separately named modes:

- **project Java handler:** user code implements a small project-owned interface;
- **CIB delegate compatibility:** user code implements CIB’s `JavaDelegate`, and the bridge supplies only an explicitly supported `DelegateExecution` subset.

The second mode must fail fast on unsupported API calls and document class-loading, dependency injection, variables, transactions, incidents, retries, and exception translation. It cannot be described as drop-in compatibility until existing compiled delegates and their used API surface pass a compatibility suite.

## Migration-target consequence

The downstream adoption target is A12 Workflows `release/2025.06`, not one consuming application and not every CIB feature speculatively. The defined [A12 Workflows compatibility ledger](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) inventories its maintained BPMN elements, extension bindings, `DelegateExecution` calls, variables, expressions, scripts, listeners, errors, engine integration, and REST/JMS façade consumers. The A12 Full Stack Project Template is the canonical downstream-project blueprint, while its Workflows-enabled materialization remains a required future integration fixture.

The inventory prioritizes reusable BPMN mechanisms first and the necessary CIB overlay second. Typed variables and input/output mappings, conditional routing, message correlation, boundary Error behavior, and User Task lifecycle are lower-layer mechanisms with A12 consumers; bean-token bindings, assignment/form extensions, exact expression subsets, and delegate bridging are CIB or A12 adoption work layered on top. Absence from the A12 corpus does not remove a construct from the ultimate BPMN conformance target, and presence does not move A12 semantics into the engine.

The `CreateDocument` and boundary-error slices intentionally test the complete stack once at two difficult effect/data/fault seams. They are not a mandate to add a dedicated semantic path for every A12 model. Later models that reuse the same BPMN and CIB contracts should be handled by profile/adoption configuration and regression evidence.

A12 Workflows builds against CIB Seven `2.0.0`, while the current project profiles execute CIB Seven `2.2.0`. The first target-specific preflight must preserve those as distinct profiles unless bounded source and behavioral evidence establishes equivalence for the used subset.

## Interpreter and Worker language boundary

Supporting Java business code does not require moving the semantic interpreter to Java or Kotlin. The pure TypeScript semantic core remains inside the TypeScript Temporal Workflow and owns committed Process state, effect occurrence, intent, result admission, and continuation. Temporal Activities are decoupled through the server protocol, so a Worker in TypeScript, Java, or Kotlin can execute the same committed effect request.

```text
Lean specification
        ↓
TypeScript semantic core in TypeScript Workflow
        ↓ committed, versioned EffectRequest
Temporal Activity protocol
        ├── TypeScript Worker
        └── JVM Worker
              ├── project Java handler
              └── bounded JavaDelegate adapter
```

The Workflow and every Worker implementation must agree on the Activity type, task queue, versioned request/result schemas, payload encoding, idempotency identity, timeout, retry, cancellation, and failure classifications. Cross-SDK payload compatibility is executable evidence; no compatibility claim may rely only on the TypeScript and Java SDKs having superficially similar default converters.

The Worker never mutates Process state directly. It returns a typed effect result or, after a future variable contract exists, a typed variable patch. The TypeScript semantic core validates and commits that input through the ordinary semantic boundary. Java class identity, bean-container state, Activity attempts, and host exceptions remain adapter facts.

The language options have these dispositions:

| Option | Disposition | Rationale |
|---|---|---|
| TypeScript semantic core and Workflow plus TypeScript and JVM Activity Workers | **Selected architecture direction** | Preserves one production semantic implementation while permitting Java business logic |
| Kotlin implementation of the JVM Worker behind Java-friendly interfaces | **Permitted future implementation choice** | Kotlin may improve Worker implementation ergonomics without changing the public Java handler contract |
| Kotlin or Java rewrite of the semantic core solely to support Java handlers | **Rejected** | Arbitrary Java code must still execute as an Activity because Workflow code must remain deterministic |
| Separate TypeScript and Kotlin/Java production interpreters | **Rejected** | No JVM semantic-execution consumer exists; a third transcription adds bounded assurance and permanent capsule cost |
| Kotlin Multiplatform or generated shared interpreter | **Rejected for the current product** | Adds toolchain and common-mode complexity, weakens the independent TypeScript lane, and has no forcing non-Temporal JVM consumer |
| Remote semantic-core service | **Rejected for the current Workflow account** | Semantic decisions would leave replay-deterministic Workflow state or be reclassified as host Activity results |

If a JVM Worker is implemented, begin with a Java-friendly project handler API. The Worker itself may later be written in Kotlin, but its public contract must avoid Kotlin-specific types so ordinary Java handlers remain first-class. The first cross-language preflight should use plain Java unless Kotlin supplies a separately demonstrated capability, because Java directly tests the migration target without adding the Kotlin compiler, standard library, and build plugin.

A Java Worker, Temporal Java SDK, Kotlin toolchain, CIB/Camunda API artifact, payload converter, or deployment unit is a new dependency or infrastructure decision. The approved scope puts the polyglot boundary in strategic scope but does not approve any of those additions.

## Phase-zero evidence condition

Before the Service Task capsule can resume semantic decision or production implementation, a bounded probe against the pinned packaged CIB Seven environment must establish all of these facts:

1. the engine deployment parser accepts the exact unknown standard `implementation="urn:bpmn-lean:effect:probe-v1"` without a parser warning, and the project import lane reports no parser warning for the same exact bytes;
2. the pinned engine reads the binding attributes by the exact expanded QNames `{http://camunda.org/schema/1.0/bpmn}delegateExpression` and `{http://camunda.org/schema/1.0/bpmn}asyncBefore`, independent of lexical prefix;
3. the exact `${bpmnLeanEffectHandler}` token resolves to the registered project probe delegate under the embedded manual-scheduler configuration.

Any failure returns to this scope document for owner review. It must not be resolved through a different namespace, silent warning acceptance, binding fallback, ad-hoc expression evaluation, or capsule-local source change.

## Expression and script direction

Keep four execution classes distinct:

| Class | Semantic owner | Evaluation runtime |
|---|---|---|
| Read-only CIB expression over approved typed data | BPMN consumer owns evaluation point, context, result type, and state transition; CIB profile owns language | Exact pinned `cibseven-juel`, invoked outside Workflow code |
| Mutating expression | Semantic core validates and commits a typed patch | Exact profile runtime returns a patch and never mutates core state directly |
| Engine/application capability call | Explicit effect or downstream adoption contract | Java handler, bean bridge, or another isolated capability host |
| Script, template, or decision language | Separate language/profile capsule | Exact Groovy/JSR-223, FreeMarker, XPath, or DMN/FEEL runtime as selected |

The project does not implement a grammar, AST, evaluator, optimizer, or transpiler merely to obtain BPMN or CIB coverage. It provides the exact source, language/profile identity, complete visible typed context, and expected result boundary; the selected language runtime owns parsing and evaluation. Lean and the TypeScript semantic core validate the result binding and implement the consuming BPMN rule conditional on that result.

The first selected direction is read-only CIB JUEL. Its complete Process-scope context preserves presence versus explicit null and contains no `execution`, bean, function, method, Process Engine service, or arbitrary Java object. One batched gateway request preserves the candidate-flow order and short-circuit rule established by the future pinned-CIB capsule while the semantic core, not the evaluator, selects the outgoing Sequence Flow; source-order first-true behavior remains a hypothesis until that probe.

The existing `MappingExpression.stringLiteral` and exact `MappingExpression.localVariable` cases remain only for their implemented mapping capsules. The literal case is ordinary data. The local-variable case is a direct binding lookup under exact-token admission, not general JUEL; it must not grow. A future CIB JUEL mapping capsule replaces it atomically or retains an explicit exact-token equivalence, with no parallel selectable evaluator for the same source.

FEEL is not selected as a project-native substitute. The target corpus does not use it for these BPMN expressions, and the pinned CIB integrations belong to DMN. XPath, DMN/FEEL, Groovy, and FreeMarker remain separate language profiles rather than variants hidden behind an early universal expression framework.

Arbitrary scripts remain outside Workflow and the pure semantic core even if a future compatibility adapter accepts their source. Their declared capabilities, file/network/host access, deterministic inputs, timeout, memory limit, engine version, dependency graph, result typing, and retry/idempotency behavior must be explicit.

The selected request/result boundary, evidence limits, dependency candidate, and Temporal preflight are in the [JUEL evaluation architecture decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md).

## Claim discipline

Every admitted extension must record:

1. exact BPMN element context, expanded QName, lexical/value shape, and extension-element structure;
2. whether it is source syntax, portable project meaning, CIB host realization, or configuration artifact;
3. its normalized project-owned representation and rejection boundary;
4. CIB–BPMN relationship classification and profile identity;
5. observable behavior and target-specific fidelity;
6. dependencies, deployment/runtime requirements, and security boundary;
7. separating witnesses, seeded mutation, and reopen conditions.

Unknown or unselected extensions may remain in retained exact bytes, but executable admission rejects them. The compiler must not silently ignore an extension that could change execution.

## Consequences for current work

The durable compatibility claim and interpreter/Worker language boundary are recorded in [PROJECT-DESIGN.md](PROJECT-DESIGN.md#cib-compatibility-and-polyglot-effect-execution). This document retains the detailed family dispositions, claim discipline, evidence conditions, and reopen boundaries.

The [dual semantic-core proposal](DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md) is rejected and the single TypeScript interpreter decision remains in force. The [Service Task effect spec](capsules/SERVICE-TASK-EFFECT-SPEC.md) implements the exact delegate-expression pair under its bounded success-only semantic account.

Apart from the completed bounded Service Task work and its phase-zero probe, no new dependency, Java evaluator Worker, JUEL expression contract, script engine, or evidence replacement is approved by this document.

## Approved owner decisions

The owner approved these seven decisions:

1. target selected source and behavioral compatibility, not general CIB engine API replacement;
2. use project-owned handler identities and effect contracts as the primary replacement API;
3. retain the TypeScript semantic core and Workflow while placing TypeScript and JVM Activity Workers behind one versioned language-neutral effect protocol;
4. use the exact delegate-expression bean token for the bounded Service Task capsule without claiming general JUEL;
5. keep Java delegate binaries, capability-bearing JUEL/beans, scripts, FEEL, and external tasks as separately reopened compatibility lanes under the dispositions above;
6. treat full Process Engine Java/REST/plugin compatibility as a non-goal unless a separately funded compatibility program is approved.
7. for the first read-only CIB expression capsule, provide complete approved context to the actual pinned JUEL runtime behind a Java Activity, build no project AST/evaluator, keep mutation and engine-service calls separate, and require an explicit dependency decision before implementation.

## Reopen conditions

Reopen this scope before claiming a compatibility level not named here; admitting a new extension family or context; changing the exact Service Task binding pair; adding a Java/Kotlin Worker or compatibility API; admitting a JUEL capability beyond the approved read-only context; selecting scripts, FEEL, or external-task protocols; letting an evaluator or adapter choose BPMN control flow or mutate semantic state; or expanding the Process Engine API non-goal. Reopen the second-interpreter account only for the exact non-Temporal embedded JVM product trigger recorded in the [rejected dual-core proposal](DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md#reopen-trigger).
