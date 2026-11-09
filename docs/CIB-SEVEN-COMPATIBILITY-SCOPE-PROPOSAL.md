# CIB Seven compatibility scope proposal

## Status

Lifecycle: owner-approved
Review: not-required

## Current boundary

Owner-approved on 2026-07-26; amended on 2026-07-31 to make CIB Seven `2.2.0` the BPMN breadth-ordering baseline and on 2026-10-03 to make it the scope ceiling. The kernel rewrite (owner decisions of 2026-11-08) replaced the Java-hosted JUEL direction: every profile evaluates its expressions inside the kernel step, with no JVM in the TypeScript and Temporal solution, and decides Script, decision and Cron execution as [owner decisions](kernel/ARCHITECTURE-SPEC.md#owner-decisions-on-the-path). The dispositions below are stated against the kernel.

## Question

Which Camunda/CIB Seven BPMN extensions and execution APIs should this project treat as current scope, deliberate future scope, deferred compatibility work, or non-goals?

The pinned-source findings and family inventory are in [CIB Seven BPMN extensions and execution-API research](research/CIB-SEVEN-EXTENSIONS-RESEARCH.md). This proposal selects project boundaries; it does not itself authorize a Java runtime or production API implementation.

## Layer role

CIB Seven compatibility is an overlay on the vendor-neutral BPMN execution core, not the first or highest layer of the product. Standard BPMN propositions remain usable without a CIB profile. This document selects only the CIB syntax, interpretations, extensions, configurations, and host relations that a named compatibility profile adds.

The 2026-10-03 owner amendment makes CIB Seven `2.2.0` implemented element breadth and feature depth the scope ceiling, as well as the ordering baseline: behavior absent from CIB7 is out of scope. Pinned implementation evidence must establish the depth of every selected mechanism. That priority does not make CIB normative, promote all CIB extensions into scope, require a CIB target for every standards mechanism, or combine BPMN and CIB coverage measures. The durable rule is owned by [PROJECT-DESIGN.md](PROJECT-DESIGN.md#cib-seven-220-breadth-ordering).

A12 Workflows sits above this layer as a downstream adoption target. Its corpus may justify prioritizing one CIB surface, but A12 handler names, Java APIs, integration façades, and model-specific shapes belong to an A12 adoption adapter or exact compatibility fixture. They do not become generic CIB semantics.

Do not create or expand a CIB profile merely because a BPMN mechanism exists. Add CIB work when at least one of these conditions holds:

- BPMN leaves a material operational choice and the selected profile adopts CIB's choice;
- the source uses a selected `camunda:*` extension;
- a behavioral compatibility claim needs a pinned separating observation;
- a CIB host mechanism or configuration can change the bounded public result;
- an A12 adoption requirement cannot be expressed through an already selected CIB contract.

Where standard BPMN behavior is sufficiently precise and no compatibility promise needs a new engine fact, the BPMN row may close without new CIB extension scope. Existing CIB evidence can still serve as a bounded oracle observation when its failure mode and fidelity are stated.

## Recommended compatibility claim

The owner adopted this durable target:

> The project aims to execute an explicitly versioned subset of BPMN 2.0.2 and selected Camunda/CIB Seven source extensions with declared behavioral compatibility. It does not aim to be a drop-in replacement for the CIB Seven Process Engine Java, REST, plugin, persistence, deployment, or administration APIs.

Compatibility claims remain level-specific:

- exact BPMN source bytes and unsupported extension content can be retained without being executable;
- only selected namespace-expanded QNames and exact contexts enter source admission;
- selected bindings normalize to project-owned protocol and handler descriptors before the kernel IL;
- behavioral compatibility is established row by row against the pinned CIB profile;
- handler, Java, scripting, expression, and worker-protocol compatibility require their own contracts and evidence.

“CIB-compatible” without one of these boundaries is prohibited.

## Recommended dispositions

| Surface | Disposition | Rationale and reopen condition |
|---|---|---|
| Exact source-byte retention for extension-bearing BPMN | **In scope now** | Preserve provenance even when execution rejects an extension; retention does not imply normalized round-trip or execution |
| Namespace-aware recognition of profile-selected extensions | **In scope now** | Required for exact CIB evidence; admit by namespace URI, local name, BPMN context, and value shape |
| Project-owned effect protocol and handler identifier | **In scope** | Supplies the portable kernel/host boundary without importing a Java class or JUEL object into the kernel |
| Polyglot Temporal Activity execution and project-native Java handlers | **Strategic compatibility scope; implementation separately approved** | A TypeScript Workflow can dispatch the language-neutral effect protocol to TypeScript or JVM Workers; this supplies Java business-code integration without duplicating the interpreter |
| Exact delegate-expression bindings registered by the kernel reader | **In scope, exact tokens only** | CIB binds the exact expression to a probe bean; the [reader's binding table](../packages/bpmn-source/src/kernel-reader/binding.ts) treats the whole expression as a selected token and claims no general JUEL |
| Generic `camunda:class` execution | **Deferred** | XML support is easy, but arbitrary Java class loading, construction, field injection and delegate APIs are not; reopen for a real Java-delegate migration consumer |
| Generic bean/delegate-expression binding | **Future candidate** | Prefer a project handler registry first; reopen after the public handler lifecycle and variable/result contract have a consumer |
| Existing CIB Seven `JavaDelegate` binaries | **Deferred compatibility lane** | Requires an isolated Java executor and an exact `DelegateExecution` API disposition; assess after typed variables and a Java-worker deployment need exist |
| Existing original Camunda 7 delegate binaries | **Deferred separately** | `org.camunda` and `org.cibseven` package identities differ; support would require a distinct bridge or dual API surface |
| Full `DelegateExecution`, `ActivityBehavior`, Process Engine services, REST and plugin compatibility | **Non-goal for the current product architecture** | This would reproduce engine internals and host identities that the kernel boundary deliberately excludes; reconsider only through a separately funded compatibility program |
| User Task completion with a typed Process-variable patch | **In scope** | The pinned `TaskService.complete(taskId, variables)` behavior is classified in the [work semantics](kernel/semantics/WORK-SEMANTICS-SPEC.md) |
| Read-only JUEL/Unified EL over typed Process data | **In scope from M2, by level** | A read-only JUEL subset written in Lean and transcribed to TypeScript, evaluated inside the kernel step; the pinned `cibseven-juel` is the behavioral oracle ([JUEL decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md)) |
| General JUEL methods, beans, `execution`, mutation, or engine-service access | **Deferred separate capability lanes** | Data evaluation, typed variable patches, bean/application capabilities, and Process Engine services have different authority, security, rollback, and effect boundaries |
| FEEL | **Only the bounded unary-test subset of DMN decision tables** | DMN decision tables are evaluated in the kernel with the hit policies UNIQUE, FIRST, ANY, COLLECT and RULE ORDER and a bounded FEEL unary-test subset; other FEEL is refused ([owner decision](kernel/ARCHITECTURE-SPEC.md#owner-decisions-on-the-path)) |
| JavaScript Script Tasks | **In scope (PC-AUTO-05, PC-AUTO-06)** | Run in the TypeScript host's built-in Node `vm` with a read-only context and no host objects; the result is recorded like an effect result, so replay never reruns it; scripts are trusted model content ([owner decision](kernel/ARCHITECTURE-SPEC.md#owner-decisions-on-the-path)) |
| Effectful or untrusted scripts | **Deferred** | The `vm` is no security boundary; untrusted scripts need a pinned sandbox and capability profile outside the Workflow and the kernel |
| Generic JSR-223, Groovy, Python or Ruby script compatibility | **Refused** | Language engines and security behavior are deployment-specific and dependency-bearing; script languages other than JavaScript are refused |
| External-task topic/fetch-and-lock protocol | **Deferred** | Valuable migration surface, but adds locks, leases, worker identity, failure, retries and incidents; reopen for an external-worker consumer |
| Async continuations and job retry extensions | **Profile-selected only** | Host realization and evidence, never automatic semantic facts; each use needs a CIB configuration and fidelity classification |
| Input/output mappings | **In scope by expression level** | Mappings evaluate through the profile's selected evaluator; Simple Boolean and literal forms before M2, the JUEL core level from M2 |
| Field injection | **Deferred** | Requires handler object lifecycle and a transaction/failure decision |
| Execution/task listeners | **Deferred** | New lifecycle hook ordering and mutable callback contexts require separate semantics and evidence |
| Form metadata, assignees, candidates, dates and identity extensions | **In scope as rows of the coverage target** | Task-field expressions arrive with the JUEL task-field level (M3) |
| Call Activity binding and version selectors, decision references | **In scope as rows of the coverage target** | CMMN case bindings stay out of scope |
| Multi-instance extensions | **In scope as rows of the coverage target** | Collection, cardinality and completion expressions arrive with the JUEL Multi-Instance level (M5) |
| Connectors and built-in mail/shell task types | **Deferred** | Plugin/configuration-specific protocols with no current consumer |
| Retry exhaustion, incidents, BPMN Errors, compensation and cancellation | **In scope as rows of the coverage target** | Each is its own kernel mechanism and is never inferred from the success path |

## Service Task binding decision

A Service Task binds its effect through a profile-defined pair of the standard `implementation` attribute and the extension `camunda:delegateExpression`, for example:

```xml
<serviceTask
  id="ServiceTask_Record"
  implementation="urn:bpmn-lean:effect:probe-v1"
  camunda:delegateExpression="${bpmnLeanEffectHandler}"
  camunda:asyncBefore="true" />
```

CIB Seven's test configuration registers the bean as a probe `JavaDelegate`; the kernel reader recognizes only the exact registered tokens and normalizes them to a protocol and an operation identity ([binding table](../packages/bpmn-source/src/kernel-reader/binding.ts)). `protocol` is the technology or coordination protocol; the handler is business-effect identity and Worker dispatch authority; neither may be selected or changed independently by a Worker or host. Requiring the project URN is a probe-fixture profile choice, not the general migration-admission rule: a migration profile that infers protocol identity must make that mapping explicit, versioned and separately evidenced.

Lean, the kernel IL, the TypeScript kernel and Temporal Workflow code never contain a CIB Java class. This is source compatibility, not Java API compatibility: method expressions, property paths, whitespace-normalized alternatives, another bean name, `camunda:field`, `camunda:expression` or another extension context remain refused.

## Replacement API direction

The replacement architecture exposes a project-owned effect protocol rather than making CIB's `DelegateExecution` the universal API: an effect request carries its protocol, handler and idempotency identity, and the Worker returns an effect result (success, business failure or technical failure) that the kernel validates and commits. A Worker dispatches only by handler; a request whose fields do not equal the admitted pair is a host-contract failure, not a fallback dispatch opportunity.

A Java bridge, if separately approved, sits behind this protocol as a Temporal Activity Worker or isolated executor, in one of two separately named modes: a **project Java handler** implementing a small project-owned interface, or **CIB delegate compatibility** for an existing `JavaDelegate` with an explicitly supported `DelegateExecution` subset. The second mode fails fast on unsupported API calls and cannot be described as drop-in compatibility until existing compiled delegates and their used API surface pass a compatibility suite.

## Migration-target consequence

The downstream adoption target is A12 Workflows `release/2025.06`, not one consuming application and not every CIB feature speculatively. The [A12 Workflows compatibility ledger](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) inventories its maintained BPMN elements, extension bindings, `DelegateExecution` calls, variables, expressions, scripts, listeners, errors, engine integration, and REST/JMS façade consumers. The A12 Full Stack Project Template is the canonical downstream-project blueprint, while its Workflows-enabled materialization remains a required future integration fixture.

The inventory prioritizes reusable BPMN mechanisms first and the necessary CIB overlay second. Typed variables and input/output mappings, conditional routing, message correlation, boundary Error behavior, and User Task lifecycle are lower-layer mechanisms with A12 consumers; bean-token bindings, assignment/form extensions, exact expression subsets, and delegate bridging are CIB or A12 adoption work layered on top. Absence from the A12 corpus does not remove a construct from the CIB7-bounded BPMN target, and presence does not move A12 semantics into the engine.

The `CreateDocument` and boundary-error slices intentionally test the complete stack once at two difficult effect/data/fault seams. They are not a mandate to add a dedicated semantic path for every A12 model. Later models that reuse the same BPMN and CIB contracts should be handled by profile/adoption configuration and regression evidence.

A12 Workflows builds against CIB Seven `2.0.0`, while the current project profiles execute CIB Seven `2.2.0`. The first target-specific preflight must preserve those as distinct profiles unless bounded source and behavioral evidence establishes equivalence for the used subset.

## Interpreter and Worker language boundary

Supporting Java business code does not require moving the interpreter to Java or Kotlin. The TypeScript kernel runs inside the TypeScript Temporal Workflow and owns committed Process state, effect occurrence, result admission and continuation; Temporal Activities are decoupled through the server protocol, so a Worker in TypeScript, Java or Kotlin can execute the same effect request. [PROJECT-DESIGN.md](PROJECT-DESIGN.md#cib-compatibility-and-polyglot-effect-execution) owns the durable boundary.

| Option | Disposition | Rationale |
|---|---|---|
| TypeScript kernel and Workflow plus TypeScript and JVM Activity Workers | **Selected** | One production semantic implementation while permitting Java business logic |
| Kotlin implementation of a JVM Worker behind Java-friendly interfaces | **Permitted future implementation choice** | Does not change the public Java handler contract |
| Kotlin or Java rewrite of the kernel to support Java handlers | **Rejected** | Arbitrary Java code must still execute as an Activity because Workflow code must stay deterministic |
| Separate TypeScript and JVM production interpreters | **Rejected** | No JVM semantic-execution consumer exists |
| Remote semantic service | **Rejected** | Semantic decisions would leave replay-deterministic Workflow state |

A Java Worker, Temporal Java SDK, Kotlin toolchain, CIB/Camunda API artifact, payload converter or deployment unit is a new dependency decision under [CLAUDE.md](../CLAUDE.md#dependencies).

## Expression and script direction

| Class | Semantic owner | Evaluation runtime |
|---|---|---|
| Read-only expression over typed Process data | The consuming BPMN rule owns evaluation point, context, result type and state transition; the profile selects the language | The profile's one evaluator inside the kernel step: Simple Boolean, or the JUEL subset from M2 |
| Mutating expression | Refused | — |
| Engine or application capability call (beans, `execution`, `task`) | Explicit effect or downstream adoption contract | Java handler, bean bridge or another isolated capability host; refused in expressions |
| JavaScript Script Task | The kernel commits the recorded result like an effect result | Node `vm` in the TypeScript host |
| DMN decision table | The kernel | Lean and TypeScript kernel, bounded FEEL unary tests |

An expression outside the selected evaluator is refused at admission with a stable code. XPath, Groovy, FreeMarker and general FEEL remain refused rather than hidden behind a universal expression framework.

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

The durable compatibility claim and interpreter/Worker language boundary are recorded in [PROJECT-DESIGN.md](PROJECT-DESIGN.md#cib-compatibility-and-polyglot-effect-execution). This document retains the detailed family dispositions, claim discipline and reopen boundaries. No Java Worker dependency is adopted.

## Approved owner decisions

The owner approved these decisions:

1. target selected source and behavioral compatibility, not general CIB engine API replacement;
2. use project-owned handler identities and effect contracts as the primary replacement API;
3. retain the TypeScript kernel and Workflow while placing TypeScript and JVM Activity Workers behind one versioned language-neutral effect protocol;
4. use exact delegate-expression bean tokens for Service Task bindings without claiming general JUEL;
5. keep Java delegate binaries, capability-bearing JUEL/beans, scripts, FEEL, and external tasks as separately reopened compatibility lanes under the dispositions above;
6. treat full Process Engine Java/REST/plugin compatibility as a non-goal unless a separately funded compatibility program is approved;
7. superseded on 2026-11-08: expressions are evaluated inside the kernel by a project-owned read-only JUEL subset with the pinned evaluator as oracle, and mutation and engine-service calls stay refused ([JUEL decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md));
8. use CIB Seven `2.2.0` executable BPMN breadth as the primary ordering baseline for the near-term standards schedule while keeping BPMN authority, CIB relationship classification, A12 `2.0.0` profiles, and all three coverage denominators separate;
9. on 2026-10-03, restrict future BPMN element breadth and feature depth to behavior implemented by CIB Seven `2.2.0`; [the durable scope ceiling](PROJECT-DESIGN.md#cib-seven-220-breadth-ordering) owns selection evidence, existing-difference disposition and claim limits.

## Reopen conditions

Reopen this scope before claiming a compatibility level not named here; admitting a new extension family or context; changing an exact Service Task binding pair; adding a Java/Kotlin Worker or compatibility API; admitting a JUEL capability beyond the read-only levels; selecting another script language, general FEEL or external-task protocols; letting an evaluator or host choose BPMN control flow or mutate semantic state; or expanding the Process Engine API non-goal. Reopen the second-interpreter account only for the exact non-Temporal embedded JVM product trigger owned by [PROJECT-DESIGN.md](PROJECT-DESIGN.md#cib-compatibility-and-polyglot-effect-execution); the [rejected dual-core account](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/archived/DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md#reopen-trigger) retains its rationale.
