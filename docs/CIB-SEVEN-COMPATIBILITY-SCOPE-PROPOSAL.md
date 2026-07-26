# CIB Seven compatibility scope proposal

**Status:** Owner-approved on 2026-07-26 with the binding-identity, phase-zero evidence, and documentation-ownership conditions recorded below; the bounded phase-zero probe is authorized, but no dependency or production implementation is approved

## Question

Which Camunda/CIB Seven BPMN extensions and execution APIs should this project treat as current scope, deliberate future scope, deferred compatibility work, or non-goals?

The pinned-source findings and family inventory are in [CIB Seven BPMN extensions and execution-API research](research/CIB-SEVEN-EXTENSIONS-RESEARCH.md). This proposal selects project boundaries; it does not authorize a semantic capsule, dependency, Java runtime, expression engine, or production API implementation.

## Recommended compatibility claim

The owner adopted this durable target:

> The project aims to execute an explicitly versioned subset of BPMN 2.0.2 and selected Camunda/CIB Seven source extensions with declared behavioral compatibility. It does not aim to be a drop-in replacement for the CIB Seven Process Engine Java, REST, plugin, persistence, deployment, or administration APIs.

Compatibility claims remain level-specific:

- exact BPMN source bytes and unsupported extension content can be retained without being executable;
- only selected namespace-expanded QNames and exact contexts enter source admission;
- selected bindings normalize to project-owned descriptors before Semantic Process IL;
- behavioral compatibility is established capsule by capsule against the pinned CIB profile;
- handler, Java, scripting, expression, and worker-protocol compatibility require their own contracts and evidence.

“CIB-compatible” without one of these boundaries is prohibited.

## Recommended dispositions

| Surface | Disposition | Rationale and reopen condition |
|---|---|---|
| Exact source-byte retention for extension-bearing BPMN | **In scope now** | Preserve provenance even when execution rejects an extension; retention does not imply normalized round-trip or execution |
| Namespace-aware recognition of capsule-selected extensions | **In scope now** | Required for exact CIB evidence; admit by namespace URI, local name, BPMN context, and value shape |
| Project-owned effect descriptor and handler identifier | **In scope for the Service Task capsule** | Supplies the portable semantic/adapter boundary without importing a Java class or JUEL object into the core |
| Polyglot Temporal Activity execution and project-native Java handlers | **Strategic compatibility scope; implementation separately approved** | A TypeScript Workflow can dispatch the language-neutral effect protocol to TypeScript or JVM Workers; this supplies Java business-code integration without duplicating the interpreter |
| Exact `camunda:delegateExpression="${bpmnLeanEffectHandler}"` plus `camunda:asyncBefore="true"` | **Recommended for the Service Task capsule only** | CIB can bind the exact expression to the probe bean; project admission treats the whole expression as a selected token and does not claim general JUEL |
| Generic `camunda:class` execution | **Deferred** | XML support is easy, but arbitrary Java class loading, construction, field injection and delegate APIs are not; reopen for a real Java-delegate migration consumer |
| Generic bean/delegate-expression binding | **Future candidate** | Prefer a project handler registry first; reopen after the public handler lifecycle and variable/result contract have a consumer |
| Existing CIB Seven `JavaDelegate` binaries | **Deferred compatibility lane** | Requires an isolated Java executor and an exact `DelegateExecution` API disposition; assess after typed variables and a Java-worker deployment need exist |
| Existing original Camunda 7 delegate binaries | **Deferred separately** | `org.camunda` and `org.cibseven` package identities differ; support would require a distinct bridge or dual API surface |
| Full `DelegateExecution`, `ActivityBehavior`, Process Engine services, REST and plugin compatibility | **Non-goal for the current product architecture** | This would reproduce engine internals and host identities that the semantic-core boundary deliberately excludes; reconsider only through a separately funded compatibility program |
| General JUEL/Unified EL | **Deferred** | Requires exact grammar, coercion, bean/property/method resolution, variable scope and error semantics; the selected literal expression is not general evaluation |
| Bounded deterministic FEEL | **Future semantic candidate after typed variables** | Potential project-native expression language, but not CIB Service Task expression compatibility; requires a dedicated profile/capsule and dependency decision |
| BPMN Script Task with a pure deterministic language subset | **Future candidate after typed variables** | May enter semantic evaluation only when language, values, errors, functions and determinism are formally bounded |
| Effectful or untrusted scripts | **Deferred Activity/effect hosting** | Must execute outside Workflow and semantic core under a pinned sandbox/capability profile |
| Generic JSR-223, Groovy, JavaScript, Python or Ruby script compatibility | **Deferred compatibility lane** | Language engines and security behavior are deployment-specific and dependency-bearing |
| External-task topic/fetch-and-lock protocol | **Deferred** | Valuable migration surface, but adds locks, leases, worker identity, failure, retries and incidents; reopen for an external-worker consumer |
| Async continuations and job retry extensions | **Capsule-selected only** | Host realization and evidence, never automatic semantic facts; each use needs a CIB configuration and fidelity classification |
| Field injection and input/output mappings | **Deferred** | Require handler object lifecycle, expressions, typed variables, scopes and result propagation |
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
- project admission recognizes only the exact expression token in this exact Service Task profile and normalizes it to handler identifier `bpmnLeanEffectHandler` plus the project effect descriptor.

The standard `implementation="urn:bpmn-lean:effect:probe-v1"` and the extension `delegateExpression="${bpmnLeanEffectHandler}"` are one profile-defined pair. Executable admission rejects either field alone, any alternative spelling or value, and every mismatched pair. The normalized effect contract assigns distinct authority: `handler` is Worker dispatch authority, while `implementation` is effect-descriptor identity. Both come from the admitted pair and neither may be selected or changed independently by a Worker or adapter.

Requiring the project URN is deliberately a probe-fixture profile choice. A real existing CIB document ordinarily carries its Camunda binding without this project URN, so the pair is not the future general migration-admission rule. Any migration profile that infers or supplies descriptor identity must make that mapping explicit, versioned, and separately evidenced.

Lean, Semantic Process IL, the TypeScript semantic core, and Temporal Workflow code never parse or evaluate JUEL and never contain a CIB Java class. The Temporal Activity Worker selects the test handler through adapter configuration. A future public registry may reuse the stable handler identifier, but this capsule does not generalize or publish that registry without a non-test consumer.

This is deliberate source compatibility, not Java API compatibility. Hostile variants such as method expressions, property paths, whitespace-normalized alternatives, another bean name, `camunda:field`, `camunda:expression`, or another extension context remain rejected.

## Replacement API direction

The replacement architecture should expose a project-owned effect protocol rather than make CIB’s `DelegateExecution` the universal API:

```ts
type EffectRequest = Readonly<{
  handler: "bpmnLeanEffectHandler";
  implementation: "urn:bpmn-lean:effect:probe-v1";
  idempotencyKey: string;
}>;

type EffectResult = Readonly<{
  kind: "success";
}>;
```

The success-only Service Task capsule needs no variables or payload, so it should not publish a broader interface yet. Later variable/effect capsules can add typed input and result data under ordinary wire-contract evolution.

The request is derived from one committed normalized descriptor containing the exact handler/implementation pair. A Worker dispatches only by `handler`; `implementation` identifies the requested effect meaning and remains part of content and idempotency binding. A request whose fields do not equal the admitted pair is an adapter-contract failure, not a fallback dispatch opportunity.

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

The driving product goal is replacing an actual CIB Seven solution, not implementing every deferred CIB feature speculatively. The selected Worker and façade boundaries therefore need a read-only inventory of that solution’s BPMN elements, extension bindings, `DelegateExecution` calls, variables, expressions, listeners, errors, incidents, and Java/REST API consumers.

That inventory defines the migration denominator and re-prioritizes the dispositions above. It can move variables, exact expression subsets, `BpmnError`, listeners, or delegate APIs earlier when the target actually uses them, but it does not move those semantics into the Worker or authorize general compatibility.

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

Keep three execution classes distinct:

| Class | Owner | Candidate language/runtime |
|---|---|---|
| Pure deterministic expression | Lean and semantic core | A future exact FEEL subset after typed values and variables |
| External or nondeterministic computation | Adapter Activity/effect | Project handler, isolated script executor, or Java bridge |
| CIB compatibility expression/script | Versioned compatibility adapter | Exact JUEL or named script engine and security profile |

FEEL is recommended for later assessment as the project-native deterministic language because it is closer to process data than embedding JavaScript or JUEL object invocation. That recommendation does not authorize FEEL now and does not treat FEEL as the language of `camunda:delegateExpression`.

Arbitrary scripts remain outside Workflow and the pure semantic core even if a future compatibility adapter accepts their source. Their declared capabilities, file/network/host access, deterministic inputs, timeout, memory limit, engine version, dependency graph, result typing, and retry/idempotency behavior must be explicit.

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

The [dual semantic-core proposal](DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md) is rejected and the single TypeScript interpreter decision remains in force. The [Service Task effect proposal](capsules/SERVICE-TASK-EFFECT-PROPOSAL.md) is revised to the exact delegate-expression pair and is no longer blocked on interpreter language, but it cannot resume semantic decision until the phase-zero evidence condition above is green. Do not begin semantic or production implementation from an unverified binding account.

Apart from the bounded phase-zero probe, no production implementation, dependency, Java Worker, expression engine, script engine, or evidence replacement is approved by this document.

## Approved owner decisions

The owner approved all six decisions:

1. target selected source and behavioral compatibility, not general CIB engine API replacement;
2. use project-owned handler identities and effect contracts as the primary replacement API;
3. retain the TypeScript semantic core and Workflow while placing TypeScript and JVM Activity Workers behind one versioned language-neutral effect protocol;
4. use the exact delegate-expression bean token for the bounded Service Task capsule without claiming general JUEL;
5. keep Java delegate binaries, general beans/JUEL, scripts, FEEL, and external tasks as separately reopened compatibility lanes under the dispositions above;
6. treat full Process Engine Java/REST/plugin compatibility as a non-goal unless a separately funded compatibility program is approved.

## Reopen conditions

Reopen this scope before claiming a compatibility level not named here; admitting a new extension family or context; changing the exact Service Task binding pair; moving semantic interpretation out of the TypeScript core and Workflow; adding a Java/Kotlin Worker or compatibility API; accepting general JUEL, scripts, FEEL, or external-task protocols; or expanding the Process Engine API non-goal. Reopen the second-interpreter account only for the exact non-Temporal embedded JVM product trigger recorded in the [rejected dual-core proposal](DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md#reopen-trigger).
