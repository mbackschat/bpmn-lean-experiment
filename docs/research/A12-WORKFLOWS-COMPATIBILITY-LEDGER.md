# A12 Workflows compatibility ledger

## Purpose and claim boundary

This ledger defines the first migration denominator for replacing A12 Workflows `release/2025.06` with this Temporal-hosted, Lean-assured system. A12 Workflows is the A12 product compatibility target: it layers product behavior, integration APIs, Java/Kotlin implementation, and maintained BPMN assets on CIB Seven for downstream A12 projects. It is not one representative customer application among many.

The A12 Full Stack Project Template `release/2025.06` is the canonical downstream-project blueprint. Compatibility must ultimately be demonstrated through a Workflows-enabled template variant or generated project, but the inspected base checkout contains no direct Workflows or CIB dependency and no BPMN files. Its historical changelog records removal of the bundled Workflows/Camunda service in 2023, while its current documentation delegates product integrations to variants. The missing materialized Workflows variant is therefore a coverage gap, not evidence that the blueprint is outside scope.

Presence in documentation or a test fixture means A12 Workflows deliberately maintains that capability as product behavior or migration evidence. It does not measure frequency in deployed customer models. No downstream-project BPMN corpus was supplied, so this ledger must not be presented as a census of every A12 application.

This is external-system research and a classification ledger, not an approved semantic profile or implementation authorization. Exact checkout provenance and licenses are owned by [SOURCES.md](../SOURCES.md).

## Defined denominator and method

The A12 Workflows denominator is the complete checked-out `release/2025.06` tree at the revision recorded in [SOURCES.md](../SOURCES.md). It contains 62 physical BPMN files: 12 analyst-documentation assets, 42 engine test fixtures, and 8 model-migration fixtures. The 12 documentation files are byte-identical copies of engine fixtures, leaving 50 distinct exact-byte models. All counts below are over those 50 distinct models unless a row says otherwise.

The census recursively collected every `.bpmn` file, grouped exact bytes by SHA-256, parsed XML namespace-aware, and counted BPMN elements, Camunda extension attributes and elements, expressions, bindings, and script formats. The code census inspected all production Java and Kotlin source for CIB imports, delegate implementations, listener and plugin integration, and product-owned REST/JMS façades. A separate exact-byte admission probe submitted each of the 50 distinct models to the current bounded BPMN compiler without rewriting source.

One intentionally invalid fixture reaches the current parser-failure path. Rejection-diagnostic counts can exceed the 50-model denominator because one document can produce more than one parser warning.

| Denominator | Count | Qualification |
|---|---:|---|
| Physical BPMN files | 62 | 12 documentation, 42 engine fixtures, 8 migration fixtures |
| Distinct exact-byte BPMN models | 50 | Documentation duplicates are counted once |
| Current unchanged static source admission | 1 of 50 | Exact `CreateDocument.bpmn` under its dedicated CIB Seven `2.0.0` profile; zero models have closed product execution evidence |
| A12 Full Stack Project Template BPMN files | 0 | The base blueprint does not materialize its Workflows variant |

## BPMN surface

| Surface | Occurrences | Distinct models | Compatibility consequence |
|---|---:|---:|---|
| User Task | 75 | 35 | Task lifecycle remains central; forms, candidates, assignment, variables, and listener behavior are product requirements beyond the current capsule |
| Service Task | 38 | 28 | Every occurrence uses `camunda:delegateExpression`; the target binding is not the capsule’s project-URN fixture dialect |
| Script Task | 10 | 7 | Every Script Task uses Groovy and must be classified separately from deterministic expression evaluation |
| Business Rule Task | 3 | 3 | DMN decision selection and result mapping are real but later compatibility work |
| Exclusive Gateway | 16 | 9 | Conditional routing and typed expression truth are migration-critical |
| Parallel Gateway | 10 | 5 | The existing bounded parallel semantics reduce risk but do not admit these general models |
| Event-based Gateway | 1 | 1 | Deferred event race semantics have a concrete product consumer |
| Boundary Event | 7 | 7 | Delegate faults and conditional/error handling cannot remain indefinitely outside the migration plan |
| Error Event Definition | 3 | 3 | Aligns with production delegates that throw `BpmnError` |
| Conditional Event Definition | 1 | 1 | Requires variables, condition evaluation, and subscription lifecycle |
| Message Event Definition | 18 | 8 | Message correlation is both a model feature and a public façade operation |
| Intermediate Catch Event | 4 | 1 | The present corpus uses message rather than timer catches |
| Intermediate Throw Event | 8 | 4 | Message production/correlation must be covered |
| Collaboration | 17 | 17 | Pools, participants, and message flows are maintained source structure even where execution remains single-process |
| Lane | 11 | 4 | Lane structure is source metadata, not current execution semantics |
| Data Object | 2 | 2 | Data associations and variable mapping require an explicit typed boundary |

No distinct model contains a Timer Event Definition, Call Activity, Multi-Instance Loop Characteristics, `camunda:class`, `camunda:expression`, external-task type/topic, Camunda Task Listener element, or Camunda Connector element. Those families remain deferred for this product revision unless another maintained product surface or downstream-project corpus supplies a consumer.

## Camunda extension surface

| Extension surface | Occurrences | Distinct models | Qualification |
|---|---:|---:|---|
| `camunda:delegateExpression` | 38 | 28 | All Service Task bindings; 13 exact token spellings represent 9 logical bean names |
| `camunda:asyncBefore` | 24 | 14 | Fourteen Service Tasks use it: 9 before-only and 5 with both async flags; other element kinds account for the remaining occurrences |
| `camunda:asyncAfter` | 6 | 5 | One Service Task is after-only and 5 carry both flags |
| `camunda:formKey` | 67 | 35 | Forms are an A12 Workflows product surface, not an incidental engine feature |
| `camunda:candidateUsers` | 6 | 6 | Assignment and authorization need a bounded product contract |
| `camunda:candidateGroups` | 6 | 5 | Group resolution is a separate compatibility input |
| `camunda:inputOutput` | 90 | 43 | Typed variables and mapping are the broadest immediate source-admission dependency |
| `camunda:inputParameter` | 195 | 41 | Includes literals, expressions, lists, maps, and template scripts |
| `camunda:outputParameter` | 26 | 20 | Effect results and variable patches must preserve mapping scope |
| `camunda:executionListener` | 30 | 15 | 25 Groovy-script listeners, 4 delegate-expression listeners, and 1 expression listener |
| Camunda extension script | 31 | 14 | 25 Groovy, 5 `FreeMarker`, and 1 lowercase `freemarker` occurrence |
| Modeler templates | 27 | 17 | Source admission must preserve or deliberately ignore editor metadata without treating it as execution meaning |
| Decision reference/result mapping | 3 each | 3 | Business Rule Task compatibility requires explicit DMN and result-shape decisions |

The 38 Service Tasks omit the standard BPMN `implementation` attribute. The current capsule’s required `implementation` URN is therefore correctly classified as a probe-fixture profile choice, not an A12 migration rule. A target profile must infer a versioned effect protocol from the A12 profile while keeping the exact delegate-expression bean token as handler identity, or define another reviewed mapping; it may not require source rewriting and still call the model unchanged.

The Service Task scheduling matrix is 23 with neither async flag, 9 `asyncBefore`-only, 1 `asyncAfter`-only, and 5 with both. The 23 synchronous CIB executions couple delegate invocation, Process advancement, variable writes, and rollback in one engine transaction, whereas a Temporal Activity introduces a durable external-effect boundary. That is a material migration classification per handler, not a source flag that may be silently added or an adapter detail hidden by canonical success agreement.

## Expressions, variables, and scripts

The 50-model corpus contains 233 expression occurrences with 79 distinct exact strings: 201 `${...}` occurrences and 32 `#{...}` occurrences. They include simple bean tokens, variable reads, comparisons, null checks, boolean operators, nested property paths, `execution.businessKey`, `execution.getVariables()`, variable mutation, and calls into Process Engine services. One expression engine or one undifferentiated “JUEL support” label would conceal materially different authority and determinism boundaries.

The Script Task corpus contains 10 Groovy scripts in 7 models. The scripts read and mutate variables and nested document structures, intentionally throw failures, and in one migration fixture start another Process through Process Engine services. Extension scripts add Groovy execution listeners and FreeMarker input templates. Groovy/JSR-223 compatibility, FreeMarker templating, and bounded deterministic expressions therefore require separate dispositions and evidence.

The immediate research order is: define typed variable values, scopes, and input/output patches; classify the 79 exact expression strings by the smallest evaluable subset; separate read-only deterministic expressions from mutations and engine-service calls; then decide Groovy, FreeMarker, and listener migration. FEEL is not observed in this denominator and remains a future language choice rather than a substitute for the target’s actual expression surface.

## Delegate and effect surface

The 38 Service Task bindings use 13 exact `${...}`/`#{...}` spellings for 9 logical bean names. Seven production Kotlin classes implement CIB `JavaDelegate`: create document, create relationship link, delete relationship link, relink document, send email, set status, and synchronize available fields. `exportDocumentDelegate` has no implementation in this checkout, while `setDocumentFieldDelegate` appears only in a migration fixture; both remain classified gaps rather than assumed product handlers.

The production delegates use a small but non-trivial `DelegateExecution`/`VariableScope` subset: `getVariable`, string/list conversion helpers, `setVariableLocal`, Process-instance variable writes, and `BpmnError` construction with code and sometimes message. Four of the seven delegate classes throw `BpmnError`. They also depend on Spring bean registration and A12 Data Services, mail, and relationship services.

This evidence reopens the Java-delegate bridge as a concrete product requirement, but only after typed variables and effect patches exist. The smallest bridge target is a Java-friendly Activity Worker contract covering the exact used API subset and translating `BpmnError` into a future typed effect-fault result. Arbitrary `camunda:class`, general `DelegateExecution`, in-engine transactions, or a second semantic core are not implied.

## Product integration and API surface

A12 Workflows `release/2025.06` builds against CIB Seven `2.0.0`, whereas this project’s executable compatibility profiles currently use CIB Seven `2.2.0`. These versions must remain distinct until a bounded delta probe establishes whether the target-used source and behavior can share evidence. The version mismatch is the first compatibility preflight, not a reason to relabel existing `2.2.0` evidence.

Twenty-two production Java/Kotlin files import CIB APIs and four import CIB internal `impl` packages. The product embeds the Spring Boot engine, REST API, web application, database integration, connectors, template engines, custom serialization, task lifecycle listeners, and transaction rollback handling. These are A12 Workflows product responsibilities, but they are not all BPMN semantic-core responsibilities.

The product-owned `ProcessEngineClient` façade exposes six concrete operations: start a Process instance, update task variables, complete a task, assign a task, send a message, and get task variables. The same operation broker is used through REST and a JMS/outbox path by A12 extensions and consumers. This façade is the preferred adapter-level replacement seam; generic CIB REST, Java engine, plugin, and webapp compatibility remains a separate and much larger program.

The full-stack template is the canonical downstream blueprint, but the inspected base branch has no active Workflows/CIB wiring. Before claiming blueprint-level drop-in replacement, obtain or generate the Workflows-enabled variant and prove that its dependency coordinates, configuration, startup topology, authentication, client calls, and end-to-end flow can target the replacement without application-specific engine code.

## Dispositions and priority

| Surface | Inventory disposition | Rationale |
|---|---|---|
| CIB Seven `2.0.0` target alignment | Assess first | Existing semantic profiles pin `2.2.0`; source and executable revisions may not be merged silently |
| Typed variables, scopes, and input/output mapping | Promote to next research item | Present in 43 of 50 distinct models and required by delegates, conditions, forms, messages, and errors |
| Exact target expression subset | Promote with variables | 233 occurrences and 79 exact strings define a bounded, inspectable denominator |
| Bean-token Service Task admission | Promote | All 38 Service Tasks use simple delegate-expression bean tokens and no `implementation` URI |
| Synchronous Service Task transaction boundary | Assess with the first target path | 23 of 38 Service Tasks have neither async flag; Temporal Activity durability cannot be described as the same transaction model |
| `BpmnError` and boundary error behavior | Promote immediately after variable/effect patches | Four production delegates throw it and three models contain error event definitions |
| Java-friendly delegate Activity bridge | Promote after the data/fault contract | Seven concrete production delegates supply the consumer; no second semantic core is needed |
| User Task forms, candidates, assignment, and variable APIs | Promote to the compatibility roadmap | User Tasks and form keys dominate the corpus, and assignment/variables are public façade operations |
| Message correlation and send-message façade | Promote after variables | Eight models and the product client supply concrete consumers |
| Groovy Script Tasks and execution listeners | Defer behind variables/errors but keep product-critical | The corpus is real, but unrestricted engine-service calls require a larger sandbox and migration decision |
| FreeMarker input templates | Defer behind typed mapping | Six extension-script occurrences depend on the variable and serialization contract |
| Business Rule Task/DMN | Defer behind variables and expressions | Three concrete models justify later bounded research |
| General `camunda:class`, external tasks, connectors, Call Activities, timers, and multi-instance | Keep deferred | Absent from the defined product corpus at this revision |
| Generic CIB engine API, plugin, REST, and webapp replacement | Separate compatibility program | The target is A12 Workflows-level replacement; these surfaces exceed the current semantic architecture and cannot be implied by “drop-in” |

## Coverage interpretation

The inventory-time unchanged-admission baseline was 0 of 50 distinct A12 Workflows models: 48 produced `unsupportedModel`, 18 produced `parserWarning`, and one produced `parserFailure`, with overlapping diagnostics. The dedicated CreateDocument source projector now admits that one maintained model unchanged and preserves its exact binding/mapping data through TypeScript and Lean lowering. This is 1-of-50 static source admission but still 0-of-50 closed product execution evidence: runtime variable semantics, CIB `2.0.0`, Temporal refinement, and the A12 Worker or explicit migration adapter remain open.

“Drop-in” is qualified at the A12 Workflows product boundary. A model, handler, or client is drop-in only when the exact source or public contract is accepted unchanged and its bounded behavior is evidenced. Anything requiring a source rewrite, API rewrite, unsupported `DelegateExecution` call, engine plugin, or changed transaction model receives an explicit migration disposition; no aggregate label may hide those differences.

## Next decision input

The owner approved the distinct CIB Seven `2.0.0` target and the smallest typed variable, input/output mapping, effect-patch, and transaction-classification contract for `CreateDocument.bpmn`. Static source admission and lowering are implemented. The next checkpoint is runtime semantic closure, followed by CIB `2.0.0` and Temporal evidence. `BpmnError`, the Java-friendly Worker bridge, task/message façades, scripts, and listeners follow from that contract in the order above.
