# CIB Seven BPMN extensions and execution-API research

**Status:** Research result; family-level inventory complete for the pinned CIB Seven source, durable compatibility scope and read-only JUEL delegation direction approved, individual behavioral lanes selected only by approved capsules

**Scope:** The Camunda BPMN extension namespace retained by CIB Seven, Service Task execution bindings, Java delegates and beans, expressions, Script Tasks, FEEL, external tasks, and the compatibility claims each mechanism would require.

**Source boundary:** Findings refer to the pristine CIB Seven checkout and revision recorded in [SOURCES.md](../SOURCES.md). Counts describe the pinned Model API registration surface, not every valid element/attribute context or every engine plugin.

## Executive result

CIB Seven retains the namespace URI `http://camunda.org/schema/1.0/bpmn`. The lexical prefix is conventionally `camunda`, but any prefix bound to that URI has the same XML identity. Calling these extensions `cibseven:*` would be incorrect even though the Java implementation packages use `org.cibseven`.

The extension surface is not one feature. The pinned Model API defines 75 distinct `CAMUNDA_ATTRIBUTE_*` constants and registers 27 `Camunda*` extension-element implementations. Their meanings span execution bindings, jobs, variables, listeners, forms, scripts, retry policy, connectors, decisions, call activities, and deployment metadata. Supporting one QName does not imply support for its siblings, its use on another BPMN element, or the engine API behind it.

The most important compatibility finding is:

> XML recognition, source-model admission, behavioral compatibility, handler registration, Java binary compatibility, and CIB engine API compatibility are separate claims.

`camunda:class` is small only as XML. Executing an existing class with CIB semantics brings class loading, construction or dependency injection, field injection, the `JavaDelegate` interface, the broad `DelegateExecution` object, variables and scopes, model access, incidents, engine services, transaction behavior, and failure translation. That surface cannot be represented honestly as one Service Task effect callback.

The bounded packaged-engine probe linked from the [Service Task effect spec](../capsules/SERVICE-TASK-EFFECT-SPEC.md#result) confirms the exact narrower selection: CIB Seven resolves `${bpmnLeanEffectHandler}` from the legacy Camunda namespace, recognizes `asyncBefore` by expanded QName under a different lexical prefix, creates an immediately executable continuation job with three retries and no due date, decrements retries to two after a public failed execution, and cleanly re-executes the same durable job. These are source/oracle facts for the exact profile, not selection of general JUEL, bean, or Java-delegate compatibility.

## Namespace and ownership

The pinned engine parser reads namespaced attributes through `BpmnParser.CAMUNDA_BPMN_EXTENSIONS_NS`. The Model API registers the same namespace and uses Java types whose names retain `Camunda`. CIB Seven therefore implements and carries forward Camunda 7’s extension vocabulary; it does not mint a replacement `cibseven` XML namespace.

Project admission must compare expanded names `{namespace URI}localName`, never the source prefix. Exact source bytes remain preserved for provenance, while any admitted extension is normalized into a project-owned checked-source record. Camunda names, Java class names, engine job IDs, and expression objects do not enter Semantic Process IL or semantic runtime state unless an approved project contract gives one of them portable meaning.

## Family-level inventory

| Family | Representative source surface | Engine capability behind it | Compatibility consequence |
|---|---|---|---|
| Service and send-task execution binding | `class`, `delegateExpression`, `expression`, `type`, `topic`, connector elements | Java instantiation, expression resolution, built-in types, external-task protocol, plugins | Each binding is a separate execution account; accepting the attribute is not executing it |
| Asynchronous continuation and jobs | `async`, `asyncBefore`, `asyncAfter`, `exclusive`, `jobPriority`, `failedJobRetryTimeCycle` | Durable jobs, executor scheduling, acquisition, retry decrement, incidents | Host scheduling and retry facts must stay distinct from BPMN semantics |
| Field injection | `camunda:field` with string or expression values | Reflection over fields/setters after object construction or bean resolution | Requires object lifecycle, conversion, expression, and failure contracts |
| Variables and I/O mapping | `inputOutput`, input/output parameters, `in`, `out`, `local`, source/target, business-key and mapping attributes | Typed variables, scopes, serialization, mapping and result propagation | Blocked on an approved variable/type/scope model |
| Execution and task listeners | execution/task listener elements with class, delegate expression, expression, script, event, and fields | Lifecycle callbacks with mutable execution/task contexts | A new hook and ordering surface, not part of Service Task compatibility |
| Script execution | standard `scriptFormat` and body plus `resource`, `resultVariable`, and Camunda script elements | JSR-223 engines, bindings, beans, caching, host access, I/O policy | Language, security, determinism, packaging, and result mapping must be pinned |
| User Task and forms | assignee, candidates, due/follow-up dates, priority, forms, constraints, properties | Identity, calendars, form lifecycle, expressions, authorization | Separate interaction/profile capsules |
| Call, case, and decision binding | called-element/version/tenant attributes, decision references and result mapping, case binding | Deployment lookup, tenant/version selection, DMN/CMMN engines | Cross-definition identity and deployment semantics are required first |
| Multi-instance execution | collection and element-variable attributes plus async controls | Collection evaluation, per-instance variables, concurrency and aggregation | Blocked on data, scopes, and multi-instance semantics |
| Errors and retry policy | error-event definitions, error code/message variables, retry cycles | Failure classification, BPMN Error propagation, incidents | Must not be collapsed into the success-only effect result |
| Connectors and properties | connector, connector ID, input/output, property/map/list/value elements | Plugin-owned protocols and configuration | Plugin-specific and dependency-bearing |
| Deployment/process metadata | history TTL, version tags, startable/candidate-starter and tenant-related attributes | Repository, history, authorization, deployment selection | Mostly host/deployment compatibility rather than Process semantics |

This inventory qualifies families; it is not an exhaustive compatibility ledger of every `(BPMN element, extension QName, value shape)` combination. Such a ledger should be generated only when the project adopts a broader CIB-extension compatibility target, because context determines meaning and the raw constant list is not a semantic denominator.

## Service Task execution bindings

The pinned deployment parser selects among several mutually competing behaviors:

| Binding | Pinned CIB behavior | Project implication |
|---|---|---|
| `camunda:class` | Lazily constructs the named class through the configured artifact factory, applies `camunda:field` declarations, and accepts an internal `ActivityBehavior` or public `JavaDelegate` | Generic support requires a Java runtime contract; an exact project probe class proves only the oracle fixture |
| `camunda:delegateExpression` | Evaluates a JUEL expression on each invocation, expects an `ActivityBehavior` or `JavaDelegate`, and applies field declarations | An exact bean-name expression can map to a project handler key, but general support requires JUEL and bean-container semantics |
| `camunda:expression` | Evaluates JUEL and may write a configured result variable | Method invocation, variable typing, side effects, and expression errors become observable |
| `camunda:type="external"` with `camunda:topic` | Creates an external-task subscription addressed through fetch-and-lock, lease, complete, and failure APIs | Introduces a public worker protocol, lock expiry, retries, and incidents |
| Built-in `type` values and connectors | Uses engine-specific mail/shell behavior or a registered connector plugin | Configuration/plugin-specific and dependency-bearing |
| Synchronous execution | Runs the selected behavior in the command that enters the task | External mutation can precede transaction rollback; there is no durable pre-effect wait |
| `camunda:asyncBefore="true"` | Creates an immediately executable continuation job before the Service Task; with automatic execution disabled, a harness or executor later releases it | Supplies a durable host boundary, but the wait is a configuration artifact rather than BPMN Service Task semantics |

## What Java delegate compatibility entails

`JavaDelegate` itself has one method, `execute(DelegateExecution)`, but that apparent simplicity is misleading. `DelegateExecution` extends variable-scope, BPMN-model-context, base-execution, and engine-service-aware interfaces. It exposes process, activity, transition, parent, tenant, and host execution identities; business-key mutation; typed and local variables; model access; cancellation state; incident creation and resolution; and access to Process Engine services.

The class binding also depends on object creation and dependency injection:

- the default artifact factory uses a no-argument constructor;
- field declarations are injected reflectively through a setter or field;
- a Spring artifact factory can resolve application-context beans by class before falling back to construction;
- delegate expressions can resolve configured beans or Spring beans dynamically;
- exceptions participate in the engine command and transaction boundary.

There are three materially different Java claims:

1. **Source-compatible binding name:** accept a class or bean identifier from BPMN and map it to a separately configured project handler.
2. **Source/API-compatible adapter:** offer a deliberately bounded facade resembling selected `DelegateExecution` operations and require delegates to compile against that facade.
3. **Binary-compatible CIB delegate host:** load an existing class compiled against CIB Seven’s `org.cibseven.bpm.engine.delegate` API and reproduce the invoked API’s behavior.

The third claim requires a Java execution host and the relevant CIB API types. It still does not make an original Camunda 7 delegate compiled against `org.camunda.bpm.engine.delegate` binary-compatible, because the package names differ. Supporting both ecosystems would be another explicit compatibility decision.

An actual Java delegate cannot run inside the TypeScript Temporal Workflow. It would need a Java Temporal Activity Worker or another isolated Java executor behind a typed effect protocol. That is a new runtime, deployment, dependency, class-loading, trust, and observability boundary.

## Beans and expressions

CIB’s delegate-expression and ordinary expression paths use JUEL/Unified EL. Its expression manager resolves Process variables, configured beans, Process Application objects, collections/maps, and optionally Spring application-context beans.

An exact expression such as `${bpmnLeanEffectHandler}` can be treated structurally as one selected binding token and normalized to a project handler identifier. Doing that does not implement JUEL. General delegate expressions include property and method resolution, overload and coercion rules, bean lifecycle, variable lookup and shadowing, errors, and potentially side effects.

The CIB Seven `2.0.0` release publishes `org.cibseven.bpm.juel:cibseven-juel:2.0.0` as a standalone jar containing the parser, tree builder, internal AST, coercion, expression factory, and a relocated Jakarta EL API. [SOURCES.md](../SOURCES.md#cib-seven) owns the exact artifact and source provenance, license, POM/shading fact, local-cache boundary, and verified digest.

A read-only isolated feasibility probe supplies immutable root values through a deliberately closed resolver and lets that artifact parse and evaluate exact source. It distinguishes an explicitly present null from an absent identifier, evaluates scalar equality and null checks, resolves nested immutable map data in the broader feasibility configuration, accepts both `${...}` and `#{...}`, and rejects absent roots, String/Map methods, and writes when no bean or mutation resolver is installed. This establishes a capability-closed resolver construction while leaving the first production capsule narrower at Process-scope `string | null`.

The packaged CIB Seven `2.0.0` gateway probe establishes the engine account separately: it follows XML `sequenceFlow` declaration order even when the gateway's `<outgoing>` references are reversed, stops at the first true condition, uses the default only after all conditions are false, requires a non-null `Boolean`, stops on an earlier resolution failure rather than reaching a later true condition, rejects syntax at deployment, rolls a failed start command back without runtime or historic Process, Activity, or variable state, and rolls a failed User Task completion back to the same live task before succeeding after the missing string binding is supplied. These are source/oracle and transaction-boundary facts, not independent JUEL truth evidence.

Together the probes establish the source ordering, resolver feasibility, Boolean/error boundary, and CIB command rollback needed by the [Exclusive Gateway proposal](../capsules/EXCLUSIVE-GATEWAY-CONDITION-PROPOSAL.md). They do not establish a Temporal Java Worker, an adopted dependency, cross-SDK payload compatibility, speculative-command hosting, retained CIB evidence, or the consuming Lean/TypeScript semantics.

The TypeScript Workflow cannot load this Java artifact. The selected host boundary is a normal Java Temporal Activity Worker that receives an immutable request, evaluates against a capability-closed context, and returns a content-bound result. One gateway batch retains XML `sequenceFlow` declaration order and stops after the first true result; returning only a selected Flow would move gateway semantics into the evaluator.

The approved direction therefore separates three JUEL surfaces:

- **read-only data evaluation:** exact source plus complete approved Process-scope context to the pinned runtime;
- **variable mutation:** a separately approved evaluator result containing a typed patch for semantic-core validation;
- **bean, `execution`, or engine-service access:** an explicit effect or downstream adoption capability, not a data context.

The project builds no JUEL grammar, AST, evaluator, or transpiler. Lean and TypeScript implement the consuming BPMN transition conditional on the bound result. Because CIB and the proposed Worker use the same JUEL implementation, they form one correlated account for expression truth; CIB integration evidence can still test resolver context, source-order short-circuit, error/rollback behavior, and default flow.

Bean compatibility is therefore a useful roadmap target, but it needs two layers:

- a project-owned handler registry whose stable identifier is portable across TypeScript and Java executors;
- an optional Java compatibility executor that resolves a handler through a declared container and exposes only an approved execution-context subset.

The handler registry can precede Java compatibility. It provides a stable replacement API without claiming that existing delegate binaries can be dropped in unchanged.

## Script Tasks and script-bearing extensions

BPMN supplies the Script Task and its `scriptFormat` plus script body. CIB additionally supports external script resources, result-variable mapping, and script-bearing extension elements. The engine executes scripts through JSR-223 and exposes variables and configured beans as bindings.

Language availability is deployment-specific. The engine build has test/runtime integrations for languages such as Groovy, GraalJS, Jython, and JRuby, but those engines are not guaranteed by the CIB core artifact and are not present in this project’s current oracle dependency graph. Caching, automatic variable storage, host access, file/network I/O, and engine-specific compatibility settings materially affect behavior.

The project distinguishes:

- **profile-selected read-only expressions:** exact language runtime evaluation over approved typed semantic data, with Lean and the pure semantic core owning the consuming transition rather than reimplementing the language;
- **effectful or untrusted scripts:** external execution hosted as an Activity/effect, returning a typed result or variable patch;
- **engine-compatible scripts:** execution through a specifically versioned language engine and security profile, which is a separate compatibility target.

Arbitrary scripts must never execute in Temporal Workflow code or in the pure semantic core.

## FEEL is not CIB Service Task expression compatibility

CIB’s BPMN delegate expressions use JUEL. The pinned repository’s FEEL integrations live under the DMN engine (`feel-juel` and `feel-scala`); they are not the Service Task delegate-expression implementation and are not in the current oracle runner dependency graph.

FEEL is not selected as a project-native substitute for the target's JUEL expressions. A future Business Rule Task/DMN or explicitly FEEL-language profile may select an exact FEEL runtime, value domain, null/error semantics, allowed functions, time behavior, and result contract. That remains a separate language and compatibility claim and cannot be advertised as `camunda:delegateExpression` compatibility.

## Compatibility levels

| Level | Claim | Evidence needed |
|---|---|---|
| L0 — exact-byte retention | The original BPMN and extensions remain content-addressed evidence even when execution admission rejects them | Source digest and byte-preservation tests |
| L1 — namespace-aware recognition | Selected extension QNames and value shapes are parsed without prefix dependence | Strict admission and hostile namespace/value tests |
| L2 — normalized source compatibility | A selected CIB binding lowers to an equivalent project-owned binding descriptor | Independent lowering checks and rejection of unselected contexts |
| L3 — behavioral compatibility | The project and CIB produce the same declared observations for the selected binding | Capsule rules, CIB evidence, Lean/core agreement, Temporal refinement |
| L4 — handler SPI compatibility | Users can register implementations against a stable project effect API | Public contract, versioning, lifecycle, failure, data and concurrency tests |
| L5 — bounded Java API compatibility | Selected Java delegate operations behave through an isolated Java executor | Exact API inventory, compatibility facade or CIB API dependency, class-loading and transaction tests |
| L6 — CIB engine API compatibility | Existing Process Engine services, REST APIs, plugins, transactions and deployment behavior are interchangeable | Product-scale compatibility program |

The current project establishes L0 for admitted source and selects L1–L3 one capsule at a time. It has not established L4–L6.

## Consequences for the Service Task capsule

The exact project probe class originally proposed is adequate as a CIB oracle fixture, but choosing it as the project’s source binding would blur fixture realization with the intended replacement API. An exact delegate expression naming a project handler is the sharper capsule candidate: CIB resolves it to the probe bean, while project admission normalizes the exact token to the same project-owned effect descriptor.

That candidate proves only L1–L3 for one exact binding. General JUEL, arbitrary bean names, field injection, Java delegate loading, variables, and the production handler registry remain separate decisions.

The durable extension and API boundary is owner-approved in the [CIB Seven compatibility scope proposal](../CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md). The exact handler pair, phase-zero engine facts, and bounded success-only semantic account are fixed by the [Service Task effect spec](../capsules/SERVICE-TASK-EFFECT-SPEC.md); no broader expression, bean, Java API, or engine API claim follows.
