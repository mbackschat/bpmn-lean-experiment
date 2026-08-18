# BPM platform competitive scope research

## Status

**Project-authored research carrying a bounded full-scope recommendation.** It is design input, not product authority and not an implementation claim. [The owner-approved BPM platform proposal](../BPM-PLATFORM-PROPOSAL.md) owns the first product contract, [PROJECT-DESIGN.md](../PROJECT-DESIGN.md) owns durable architecture and product boundaries, [PLAN.md](../PLAN.md) owns accepted sequencing, and the [`implementation-status-owner:BPM-PLATFORM`](../BPM-PLATFORM-IMPLEMENTATION-MAP.md) owns the exact implemented and absent surface.

**This document stays research until the approved proposal's surfaces are implemented.** The owner decided on 2026-08-07 that its competitive positioning and full-scope modules are not adopted into any owning document before then, so that the first product is finished rather than widened while it is being built. The trigger is exact and checkable: M5 of [the showcase milestone ladder](../SHOWCASE-MILESTONE-LADDER-DECISION.md#showcase-milestone-ladder) closing its exit gate, which is where the proposal's deployment, task, operations, incident, history, and mining surfaces are all reached. At that point this document is reconsidered as a whole, and whatever is adopted moves into its proper owner rather than being cited from here.

**Research date:** 7 August 2026

**Updated after platform product commits:** `4bfe36d..5854cc9` on 7 August 2026

**Scope:** The complete intended scope of product 2, the MIT BPM platform built on the project’s Temporal-hosted, Lean-assured BPMN execution engine

**Primary research input:** [Enterprise process-orchestration competitive landscape dossier](ENTERPRISE-PROCESS-ORCHESTRATION-COMPETITIVE-LANDSCAPE-RESEARCH.md)

## Executive recommendation

Product 2 should become an **assurance-first BPMN platform on Temporal**, where machine-checked BPMN processes can compose safely with code-native Temporal Workflows, human work, services, decisions, connectors, and governed agents.

The recommended primary product statement is:

> An assurance-first BPMN platform on Temporal, where machine-checked BPMN processes can compose safely with code-native Temporal Workflows, human work, services, and agents.

The supporting market statement is:

> Business-readable BPMN and developer-native durable code, composed on one Temporal foundation without confusing their semantic authorities.

This replaces a narrower positioning around regulated work alone. Self-hosting, sovereignty, migration safety, and regulated operation remain important strengths and target-segment advantages, but they should not define the whole product. Temporal is not merely an implementation detail or persistence substrate. Its long-term strategic value includes integration with other native Temporal Workflows that need not be BPMN processes.

The full platform should not attempt to imitate every low-code suite. It should provide a coherent middle layer spanning design, deployment, human work, operations, integration, migration, intelligence, and agent governance, with unusually strong assurance, diagnosis, and interoperability. Advanced RPA, IDP, content management, broad mining, and commodity connector breadth should initially remain partner territory.

The newly introduced [BPM platform proposal](../BPM-PLATFORM-PROPOSAL.md) should be approved and established as the first product baseline. It is strongly aligned with this assessment and is appropriately narrower: it defines the smallest credible platform product, while this report defines the intended growth architecture. The recommendation is to preserve that separation. Do not expand the proposal to absorb migration, browser modeling, multi-tenancy, native Temporal Workflow composition, agents, or advanced intelligence before its own product surfaces work end to end.

The one immediate deficiency is sequencing, not product direction. The proposal explicitly says its showcase milestone list is pending, and [PLAN.md](../PLAN.md) remains predominantly an engine plan. The next product decision should turn the approved proposal into a small ordered platform milestone ladder whose first owner-set acceptance condition remains: a third party can deploy its own BPMN file.

## Research basis and central market finding

The competitive landscape shows that an enterprise process product is no longer evaluated as an engine plus a modeler. Buyers expect a lifecycle that covers discovery, design, testing, packaging, execution, human work, integration, operations, migration, governance, and improvement.

The decisive market finding is not that every adjacent capability must be built. It is that the platform must own the coherence among them. A technically excellent runtime without task management, safe intervention, deployment lifecycle, and useful operational evidence will still be evaluated as infrastructure rather than as a BPM platform.

The research identifies four overlapping competitive arenas:

1. standards-based process platforms such as Camunda, CIB seven, Flowable, Bonita, KIE, and Operaton;
2. enterprise automation suites such as UiPath, IBM, Appian, Pega, SAP, ServiceNow, Bizagi, Microsoft, and Nintex;
3. developer-first durable orchestration such as Temporal, Orkes, AWS Step Functions, Azure Durable Functions, and Argo;
4. process intelligence and mining products such as Celonis and Apromore.

The opening for this project is between those arenas. It can combine business-readable and standards-oriented BPMN with Temporal’s durable code ecosystem, while adding safe human work, operation, migration, and evidence without becoming a proprietary application suite.

## Assessment of the current project definition

The three-product division in [PROJECT-DESIGN.md](../PROJECT-DESIGN.md#product-division) is sound:

1. product 1 is the MIT BPMN execution engine in this repository;
2. product 2 is the MIT BPM platform in this repository;
3. product 3 is the EUPL-1.2 A12 Workflows replacement in a separate A12-owned repository.

Keeping products 1 and 2 together is appropriate before a stable release contract exists. Changes to published observations can then update the engine, schemas, projections, and platform consumers atomically. Keeping product 3 outside the repository is equally important because it is a distribution and licensing boundary.

The project definition now correctly assigns deployment, versioning, task interaction, dashboards, operations, monitoring, history, mining, diagnosis, JUEL hosting, identity, persistence, and the external API to product 2. The new proposal also makes the API-first boundary, projection authority, initial stack, package layout, and initial exclusions concrete. It is complete enough to serve as the first product baseline, but it is intentionally not the complete competitive product scope assessed here. The following remain growth areas rather than omissions that should be pulled into the first proposal:

- browser-based visual modeling and collaboration beyond the initial definition repository and viewer;
- executable model testing beyond profile admission and diagnostics;
- rich forms and human work management beyond the shared task list, claim/release, and string/null interaction;
- connector and Worker governance;
- generic instance migration and safe state repair;
- package promotion and environment lifecycle;
- case work and federated tasks;
- agent governance;
- enterprise identity, tenancy, policy, secrets, and retention beyond the fake identity and initial audit;
- developer SDKs, CLI, and local testing;
- operational analytics versus cross-system process mining;
- native Temporal Workflow interoperability;
- unified but explicitly separated BPMN, platform, native-Workflow, and host operations beyond the initial Temporal UI links.

There was no `platform/` implementation tree when this research established its baseline. The [`implementation-status-owner:BPM-PLATFORM`](../BPM-PLATFORM-IMPLEMENTATION-MAP.md) owns the current Product 2 surface and absences. This means the proposal is a reviewed product contract, not by itself evidence of an implemented surface.

## Bidirectional assessment of the new product vision

### Overall judgment

The product division in [PROJECT-DESIGN.md](../PROJECT-DESIGN.md) and the surface contract in [BPM-PLATFORM-PROPOSAL.md](../BPM-PLATFORM-PROPOSAL.md) are in line with this assessment. I recommend approving the proposal as the phase-one platform constitution without a material redesign.

The proposal answers the right first question: what is the smallest complete product that makes the engine usable by an external adopter without creating a second BPMN authority? This report answers a different question: what must that product eventually grow into to become highly competitive? The answers are compatible when treated as successive horizons.

The approved direction should therefore be:

1. establish the proposal exactly as the initial platform product boundary;
2. deliver its surfaces through executable showcase milestones;
3. harden it into an operable, adopter-facing release;
4. add the competitive differentiators from this assessment through separate follow-on proposals.

### Proposal-to-full-scope continuity

| Initial proposal surface | Full-scope destination | Assessment |
|---|---|---|
| Deployment, exact definition storage, versions, and admission | Studio and Test, package promotion, assurance reports, compatibility analysis | Strong foundation. Browser modeling and collaboration can remain later additions. |
| Task list and task interaction | Work and Case | Correct first human-work slice. Rich performer semantics, forms, federation, SLAs, and case work remain later. |
| Operations, monitoring, incidents, and cancellation exposure | Operate and Diagnose | Correct boundary. Incidents and cancellation cannot ship as invented platform transitions and must wait for engine capsules. |
| Committed history and frequency or duration diagram overlays | Intelligence plus Operate | Correct first analytical slice. It builds the semantic event foundation without committing to a full mining suite. |
| Pluggable identity with a fake default | Enterprise identity and policy | Correct for the first product. OIDC, SCIM, tenancy, and full authorization policy remain follow-on capabilities. |
| Public HTTP API used by the platform UI itself | External API and developer ecosystem | Especially strong. It makes API adoption executable rather than aspirational and provides the later native Temporal entry point. |
| Pinned JUEL Activity Worker | Connect and Decide | Correct bounded compatibility capability. It does not imply a universal evaluator or DMN authority. |
| React 19, React Aria Components, TanStack, Vite, `bpmn-js`, and `node:sqlite` | Product UI and initial read-model implementation | Coherent, permissive, adopter-oriented stack. Some individual decisions remain open as recorded below. |
| Explicitly excluded migration, modeling, multi-tenancy, production packaging, deeper mining, DMN, and form design | Later modules in this report | Correct exclusions for phase one, not permanent product exclusions. Each material addition should reopen or succeed the proposal deliberately. |

### Full-scope-to-proposal corrections

The proposal also improves and constrains the earlier version of this assessment in several useful ways:

- The first product is not a browser modeler. It accepts, validates, stores, versions, and renders externally authored BPMN. Browser editing belongs to later Studio growth.
- The first product does not need an identity provider. It needs a pluggable identity boundary and a fake implementation. Authentication-provider selection comes later.
- The first task form is not a general form engine. It projects currently published string/null bindings, and richer form metadata waits for E2.
- The first read model is appropriately `node:sqlite` plus content-addressed filesystem definition blobs. A distributed analytical data plane is a later scaling decision.
- The initial live-view mechanism is HTTP long-polling. WebSockets and server-sent events are unnecessary until evidence shows otherwise.
- The initial mining surface is frequency and duration overlays on BPMN diagrams, not broad conformance checking or predictive mining.
- The initial UI stack is now concrete and better supported than a generic instruction to adopt permissive components.
- Native Temporal Workflow interoperability remains strategically important, but it is not a phase-one proposal requirement and should not delay the BPM platform foundation.

### Material gaps to close before implementation sequencing is considered complete

These are gaps in the transition from proposal to work plan, not reasons to redesign the product:

1. **Owner approval:** the proposal is independently reviewed but still says it awaits owner approval. Recommendation: approve it as the phase-one boundary.
2. **Milestone register:** the proposal says its showcase list is pending. Recommendation: add the milestone ladder defined later in this report to the plan, with one executable gate per accepted increment.
3. **E1 decomposition:** history needs committed transition records, while the operations diagram needs committed control-token and scope positions. Recommendation: decide them together if one publication can serve both, but specify and test them as distinct information requirements so one does not falsely imply the other.
4. **E2 sequencing:** assignment and form metadata are valuable but do not block a basic shared task list or string/null task interaction. Recommendation: keep E2 as an engine requirement, but schedule it after the basic published-task path unless the owner makes rich assignment part of an earlier showcase.
5. **Projection delivery contract:** the proposal correctly forbids state differencing and Event History inference but does not yet select cursoring, deduplication, ordering, reconciliation, and rebuild behavior. Recommendation: settle these in the first projection specification.
6. **Logical versus deployment services:** each surface is a service, API, and client, but the package diagram places them in one tree. Recommendation: begin as a modular monolith with logical service boundaries, not as independently deployed microservices.
7. **First external-adopter breadth:** “a third party can deploy their own BPMN file” requires engine admission broader than the current exact profiles. Recommendation: treat the smallest honest third-party deployable subset as a joint engine and platform milestone with an explicit supported-profile report, never as an implication of general BPMN support.

## Recommended competitive position

### Primary position

The platform should lead with **assured BPMN on Temporal with native Workflow composition**.

This means:

- BPMN is used where standardized, inspectable, business-readable process semantics matter;
- native Temporal Workflows are used where code is the better orchestration language;
- both forms compose through explicit, durable, typed contracts;
- Lean and the TypeScript semantic core remain authoritative only for BPMN behavior;
- the Semantic Process IL is not widened into a universal workflow representation;
- operations can follow both execution forms without presenting native Workflow behavior as Lean-verified BPMN behavior.

### Supporting position

The strongest supporting position is **migration-safe and operationally repairable long-running work**.

This addresses a decisive enterprise buying concern and makes the project’s exact identities, immutable artifacts, semantic state model, and formal assurance commercially visible. Self-hosting, data sovereignty, and a small audited dependency footprint reinforce this position for regulated and security-sensitive environments.

### Target segments with the strongest fit

- Existing Temporal users who need BPMN, task management, business visibility, and model governance without adopting another durability stack.
- BPMN users who need complex developer-authored orchestration without modeling technical logic as awkward BPMN diagrams.
- Camunda 7, CIB seven, Operaton, Activiti, or related estates that need a credible modernization and migration path.
- Regulated or long-running processes where replay, migration, audit, and safe repair matter more than superficial low-code breadth.
- Organizations that want self-managed or sovereign deployment without losing modern developer ergonomics.
- Teams that need people, services, and agents coordinated under one explicit business process while retaining code-native implementations behind bounded contracts.

## Architectural model

```text
Studio / Work / Operate / External API / Developer SDKs
                         |
                  Platform kernel
       identity | policy | repository | audit | projections
                         |
        Published engine consumption contract
      compile | start | observe committed state | command
          enriched by E1/E2 when separately approved
                         |
             Lean-assured BPMN engine
                         |
                   Temporal hosting
                         |
       Native Temporal Workflows and Workers
```

The diagram is intentionally not one semantic stack. BPMN state, native Workflow state, host state, and platform-owned business state have different authorities.

Deployment and definition versioning are platform operations over compiled artifacts, not a fifth semantic engine operation. E1 and E2 must enrich what the engine publishes or admits without creating a platform-side semantic path around the four permitted consumption kinds.

## Required factual domains

The platform must preserve three distinct fact domains.

### BPMN semantic facts

These come only from the engine’s published contract. Examples include definition and profile identity, semantic Process identity, occurrence identity, committed state, enabled interactions, logical time, semantic command outcome, and committed transition records.

The platform may project and index these facts. It may not reconstruct them from Temporal Event History, state differences, guessed element identity, or its own database.

### Temporal host and native Workflow facts

These include Worker and Task Queue health, Activity attempts, Workflow deployment versions, replay or nondeterminism failures, Workflow and Activity latency, Temporal server health, and the state of native Temporal Workflows.

They must be labeled as host or native-Workflow facts. They must not be promoted into BPMN semantics. Product UI packages should continue to avoid direct Event History interpretation. A bounded adapter operations contract should expose the host facts that the platform legitimately needs.

### Platform-owned facts

These include users, groups, tenants, authorization decisions, task claims, delegations, comments, attachments, business-object links, forms, connection bindings, secrets references, data classifications, retention policy, and wall-clock audit metadata.

These facts may control access or enrich work, but they do not create BPMN occurrences or change BPMN state without an explicit engine command.

## Shared platform foundations

These foundations are mandatory rather than optional commercial modules.

| Foundation | Minimum scope | Rationale and competitive potential |
|---|---|---|
| **Semantic publication gateway** | Canonical snapshots, committed transition records, monotonic revisions, enabled interactions, typed commands, command results, capability discovery, and bounded host diagnostics | Allows every UI, API, projection, and export to inherit engine facts without reverse engineering Temporal |
| **Definition and artifact repository** | Initially exact BPMN bytes in a content-addressed filesystem store, definition digest, selected profile, version ordinal, admission result, deployment state, and provenance; later compiler and dependency manifests, promotion, and rollback | Makes validation and exact version pinning trustworthy immediately, then becomes the base for reproducibility, diagnosis, and migration |
| **Platform data plane** | Initially `node:sqlite` operational projections plus a separate platform audit; later object storage, analytical export, larger stores, and rebuild tooling as scale requires | Enables fast product queries without treating the platform store as semantic authority and keeps the first deployment small |
| **Identity, tenancy, and policy** | Initially a pluggable identity boundary with a fake default and platform authorization decisions; later OIDC, SCIM, users and groups, tenants, environments, RBAC or ABAC, and service accounts | Keeps the first product runnable without building authentication while preserving the enterprise growth seam |
| **External API and developer experience** | Initially one public HTTP API used by the React UI and HTTP long-polling for live views; later OpenAPI, event subscriptions, typed SDKs, CLI, local fixtures, and contract testing | Makes external adoption real in phase one and supports a broader developer ecosystem later |
| **Platform operations** | Initially health, configuration, projection recovery, and links to Temporal UI for host detail; later backup and restore, retention, coordinated upgrades, support bundles, usage metering, secrets integration, and OpenTelemetry | Avoids reimplementing Temporal operations while growing toward a supportable customer-managed or managed product |

## Full product-module scope

The module descriptions below remain the recommended full competitive scope. They are not one release and must not be read as additions to the initial proposal. The proposal establishes the first slice of Deployment and Definitions, Work, Operate, Intelligence, Identity, and the API. Capabilities it explicitly excludes are growth modules that require a later proposal or a documented reopen condition.

### 1. Studio and Test

Minimum scope:

- an adopted BPMN modeler and renderer rather than a project-authored rendering engine;
- a definition repository with version history and immutable deployment packages;
- profile selection and exact source admission feedback;
- semantic linting and unsupported-construct diagnostics;
- model and package diff;
- reusable form definitions and form bindings;
- executable scenarios, Worker mocks, and contract fixtures;
- deployment compatibility and host-capability reports;
- model-to-model migration compatibility analysis;
- optional collaborative review and approval workflows.

Potential:

Studio can productize the project’s assurance instead of hiding it in CI. A deployment report can explain exactly which profile was selected, which constructs are admitted or rejected, which CIB relationships apply, which host capabilities are required, and which executable evidence passed.

This is more defensible than generic AI-generated BPMN. It gives developers and reviewers a reliable answer to “what will this definition mean here?”

Phase-one boundary:

The approved proposal should implement rendering, exact-source admission, storage, versions, and deployment first. Browser-based BPMN modeling, form design, collaboration, and migration analysis remain later Studio capabilities.

### 2. Work and Case

Minimum scope:

- task inboxes, personal and shared queues;
- task discovery from published engine interactions;
- claim, release, assignment, delegation, and substitution as platform work-management facts;
- authorization before command submission;
- forms and validated submitted data;
- comments, attachments, and business-object context;
- due dates, workload, SLA views, escalation policy, and notifications;
- supervisor and process-owner views;
- optional federation of tasks from external engines or systems;
- ad hoc platform work and milestones as a later case capability.

Potential:

Human work is mandatory for a credible BPM platform. A federated work hub can become a differentiator in mixed-engine and migration environments. Platform-native case work can support exception-heavy processes without claiming CMMN conformance.

Important boundary:

BPMN performer or resource-role semantics must be admitted and published by the engine when they matter to BPMN. Claims, comments, platform assignments, and authorization can remain platform facts. An SLA that only affects a dashboard is platform policy; an SLA that changes Process control flow requires an explicit BPMN timer or other engine mechanism.

Phase-one boundary:

The first task list is a shared view over published open User Tasks. Claim and release are platform work-management facts, while completion submits the exact content-bound engine command. Assignment and form metadata wait for E2. The first interaction surface renders the currently available string/null variable bindings and is not a general form engine.

### 3. Operate and Diagnose

Minimum scope:

- instance, task, definition, version, tenant, and business-object search;
- diagram state based on committed engine observations;
- semantic transition timeline;
- effect, timer, Message, and User Task inspection;
- Worker and host diagnostics labeled separately from semantic state;
- typed semantic rejection, adapter failure, Worker failure, policy refusal, and infrastructure-failure classification;
- retry, pause, resume, cancel, message delivery, task completion, and other interventions only where explicitly supported;
- bulk operations implemented as asynchronous, resumable jobs;
- operator authorization, dual approval where needed, and complete audit;
- evidence and support-bundle export.

Potential:

The platform can explain why an interaction is enabled, why a command was rejected, which occurrence and definition version were involved, which profile or rule governed the result, and whether a problem is semantic, host, Worker, or policy-related.

This semantic diagnosis is a direct product expression of the Lean and TypeScript work. It is potentially more distinctive than a conventional token display or engine-counter dashboard.

Phase-one boundary:

Cancellation and incidents are engine capsules, not actions the platform may synthesize. Host Event History, Activity attempts, and Workflow retries remain in Temporal UI until a bounded non-semantic diagnostics contract justifies projecting them.

### 4. Connect and Decide

Minimum scope:

- polyglot external Workers;
- a versioned connector and Worker registry;
- versioned request, result, and failure schemas;
- tenant and environment connection bindings;
- secret references, OAuth, mTLS, and workload identity;
- idempotency classification and propagated idempotency keys;
- operation-specific retry, timeout, rate-limit, circuit-breaker, cancellation, and reconciliation policies;
- connector telemetry and local contract tests;
- Java or JVM Worker support where migration requires it;
- the bounded JUEL evaluator host already selected by the project;
- external decision-service integration;
- native Temporal Workflow invocation and exposure.

Potential:

The connector runtime and governance model are more defensible than a large connector catalog. The project already has a strong neutral effect boundary, content-bound effect identity, explicit retry separation, and Temporal Activity execution. These can become a secure and observable execution plane for services, evaluators, agents, and native Workflows.

DMN should eventually be available to remain highly competitive, but it must not enter by implication. The first product capability can host a pinned adopted decision runtime or external decision service behind a versioned typed contract. Native DMN semantic authority would require a separate scope and evidence decision.

### 5. Lifecycle and Migration

The platform must distinguish five different capabilities:

1. platform and engine upgrade;
2. artifact promotion between environments;
3. legacy-product conversion;
4. migration of active instances to a changed definition;
5. runtime repair or controlled state intervention.

Minimum scope:

- immutable packages and definition-version pinning;
- environment promotion with dependency and connection resolution;
- package compatibility analysis;
- model and runtime-state migration plans;
- dry-run classification of instances as migratable, migratable with warnings, or blocked;
- explicit element, scope, timer, Message, task, effect, and variable mappings;
- versioned variable transformations;
- asynchronous and resumable selection and batch execution;
- idempotency and optimistic concurrency;
- pause, cancellation, progress, retry, and partial-failure policy for migration jobs;
- before and after evidence, approvals, operator identity, and per-instance audit;
- generic Camunda 7, CIB seven, Operaton, Activiti, or related analysis and conversion tooling;
- A12-specific migration only in product 3.

Potential:

Migration and safe repair should be the main supporting commercial differentiator. Camunda, Flowable, UiPath, CIB seven, Appian, IBM, and Nintex demonstrate that active migration and intervention are material enterprise capabilities, not optional administration.

The unusual opportunity is to machine-check migration invariants for supported mappings. A migration plan could provide evidence that active occurrences remain valid, scopes remain well-formed, timers and subscriptions are accounted for, and no identity is fabricated.

Responsibility must be divided precisely:

- the engine validates and atomically applies only explicitly supported semantic state transformations;
- the platform owns discovery, planning, population selection, dry run, transformations, batching, approval, progress, and audit;
- native Temporal Worker Versioning and replay compatibility remain a different lifecycle problem from BPMN instance migration.

### 6. Intelligence

Minimum scope:

- a stable, versioned semantic event export;
- definition, profile, element, occurrence, instance, tenant, actor, and command identity;
- multiple business-object correlations rather than one assumed case ID;
- version comparison, duration, cycle time, wait time, SLA, bottleneck, incident, and Worker performance views;
- runtime conformance against the deployed definition within the engine’s supported evidence boundary;
- operational dashboards for operators and process owners;
- retention, redaction, privacy, and data-classification policy;
- export and partner interfaces for cross-system mining;
- later closed-loop improvement proposals and governed deployment comparisons.

Potential:

The project’s exact definition digests, occurrence identities, semantic transition records, and profile identity can produce unusually high-quality event data. This supports native operational intelligence and makes the platform an excellent source for Celonis, Apromore, SAP Signavio, or other mining products.

Operational analytics and process mining must remain distinct. Engine-native history sees orchestrated work. Real end-to-end mining requires data from ERP, CRM, content systems, custom applications, and desktops.

The recommended approach is:

1. build the event and semantic foundation;
2. build lightweight native operational and version analytics;
3. integrate with mining and simulation specialists;
4. consider broader native mining only if later demand and data capability justify it.

### 7. Agent Control

Minimum scope:

- versioned agent definitions and typed work contracts;
- input and output JSON schemas;
- model, prompt, context, and tool provenance;
- MCP client and server roles and A2A adapters;
- tool allow-lists and side-effect classification;
- context-access and data-classification policy;
- cost, time, token, and attempt budgets;
- evaluators, groundedness checks, policy checks, and minimum scores;
- human approval, escalation, and fallback providers;
- canary and version pinning;
- complete traces, audit, and business-outcome metrics;
- replayable test fixtures.

Potential:

The correct architecture is deterministic outer orchestration with bounded nondeterministic inner work. A BPMN process decides when the agent may act, which exact context and tools it receives, which result schema is accepted, and when a person must approve. The agent decides how to solve the bounded task.

Agent execution should reuse the neutral effect and Temporal Activity or native Workflow seam. It must not become a new source of implicit BPMN semantics. This provides a credible agent story based on governance and evidence rather than a modeler chatbot.

### 8. Enterprise Administration and Hosting

Minimum scope:

- organizations, tenants, projects, workspaces, and environments;
- users, groups, roles, service accounts, and policy;
- definitions, deployments, Workers, Task Queues, and connection bindings;
- platform and fleet health;
- coordinated backup and restore for Temporal and platform-owned stores;
- data retention, archival, deletion, encryption, and evidence export;
- supported local-development, customer-managed, and managed deployments;
- upgrade planning and compatibility;
- security and dependency inventory;
- usage and cost visibility.

Potential:

The honest deployment promise is the same BPMN model, platform API, and integration contract across local development, customer-managed Temporal, and managed Temporal. The platform should not claim classic in-process embedding merely because some competitors provide it.

## Temporal-native interoperability as a first-class capability

Temporal interoperability is not merely part of deployment. It is a strategic product component.

It is also deliberately outside the initial BPM platform proposal. That is the correct sequencing. The public HTTP API, typed engine contract, neutral effect boundary, and strict fact-domain separation give it a clean future home without requiring phase-one code. Add it through a separately governed follow-on proposal after the core platform API and projection model are proven.

### BPMN to native Temporal Workflow

A BPMN Service Task or separately selected platform extension can invoke a versioned native Temporal operation through a neutral effect contract. The BPMN core owns when invocation becomes enabled, its semantic occurrence identity, and how the typed result affects Process state. The native Workflow owns its internal code semantics.

Possible realization mechanisms include a versioned platform Worker protocol, a dedicated Workflow-starting Activity, or a future reviewed Temporal operation boundary. The specific mechanism must be selected and evidenced without becoming BPMN authority.

### Native Temporal Workflow to BPMN

A native Workflow can use the platform contract to:

- select or compile a definition package;
- start a semantic Process instance;
- observe committed canonical state and published interactions;
- submit content-bound commands using occurrence identity taken from the publication;
- await or subscribe to semantic completion and typed outcomes.

### Long-lived coordination

The platform must define correlation, idempotency, cancellation, timeout, retry, version binding, result, and failure-translation contracts across BPMN and native Workflows.

These are integration contracts. They must not silently redefine BPMN cancellation, Call Activity, transaction, or retry behavior.

### Unified operations

Operators should be able to follow one business execution across BPMN and native Temporal components. The UI must visibly distinguish BPMN semantic state from native Workflow and host state.

The current bounded BPMN Call Activity must not silently become a Temporal Child Workflow. Native Workflow invocation needs a separately named integration contract or compatibility profile. This preserves exact BPMN meaning while allowing deliberate Temporal-native composition.

## Major competitive differentiators

### Verified migration and repair

Make supported migration plans executable, dry-runnable, auditable, and potentially machine-checked. This is a clearer switching reason than another generic connector catalog.

### Semantic diagnosis

Expose rule-level explanations for enabled interactions, refusals, state changes, and profile-dependent behavior. Keep semantic, adapter, Worker, policy, and infrastructure outcomes distinct.

### Assurance as a product

Produce a definition assurance report containing exact bytes and digests, selected profile, admitted and unsupported capabilities, relationship IDs, required host capabilities, test scenarios, evidence results, and migration compatibility.

### BPMN plus native durable code

Allow business-facing BPMN processes and developer-facing Temporal Workflows to coexist and call each other through explicit contracts. Customers should not need two unrelated orchestration platforms merely because some work is modeled and some is coded.

### Mining-ready semantic events

Publish stable semantic events and enrich them with platform-owned actor, tenant, trace, business-object, privacy, and retention metadata without mixing the factual authorities.

### Governed agents

Offer typed, budgeted, evaluated, auditable agent work within deterministic orchestration. MCP or A2A protocol support alone is not the differentiator.

### Open and sovereign operation

Preserve the MIT platform, self-managed deployment, permissive dependency graph, open contracts, exportable artifacts, and absence of a proprietary application data plane.

## Build, adopt, partner, and exclude

### Build because it is differentiating

- the engine-to-platform publication and command gateway;
- semantic projections and the committed history model;
- definition packages and assurance reports;
- task and operator domain behavior;
- semantic diagnosis and evidence;
- migration and repair planning;
- connector and Worker governance;
- Temporal-native interoperability contracts;
- agent policy and evaluation;
- mining-grade event semantics.

### Adopt maintained MIT-compatible components

- BPMN modeling and rendering;
- form rendering and schema validation;
- OIDC and SCIM clients;
- database, object-store, and messaging drivers;
- OpenTelemetry;
- charts and visualization;
- the JUEL evaluator runtime and other bounded evaluators;
- general transport and cryptographic primitives.

Every addition still requires the project’s resolved dependency-footprint, licensing, provenance, and security assessment. Adoption is preferred to recreating a solved component, but convenience alone does not justify a dependency.

### Assessment of the selected initial stack

The stack work in [BPM platform technology stack research](BPM-PLATFORM-STACK-RESEARCH.md) materially strengthens the proposal and should replace the generic stack assumptions in the original assessment.

| Decision | Recommendation | Rationale |
|---|---|---|
| React 19 with plain Vite | Keep | It matches the static API-client product shape, avoids a needless server meta-framework, and has the strongest adopter ecosystem. |
| React Aria Components | Keep | It supplies maintained interaction and accessibility without visual identity, CDN assets, telemetry, or a branded style system. |
| TanStack Table, Virtual, and Query | Keep | It covers the data-dense console and long-polling cache problem with a small permissive resolved graph and no commercial feature ceiling. |
| Platform-owned component kit | Keep, with a cost gate | It preserves brand neutrality and replacement control. Track actual component and accessibility cost against the roughly 2,000-line estimate; use shadcn over Radix only if the estimate fails materially. |
| `bpmn-js` viewer and overlays | Approved 2026-08-09 | Camunda 8 and both CIB Seven web generations use this family, and drawing BPMN Diagram Interchange correctly is not differentiating platform work. Keep phase one viewer-only, consistent with the proposal’s modeling exclusion, and retain the bpmn.io watermark and notice required by its license. |
| `node:sqlite` read model | Keep for phase one | It provides a zero-service, transactional local read model in the pinned runtime. Record its experimental upstream status and hide it behind the projection-store boundary so later scale does not rewrite product semantics. |
| CSS Modules | Select | It adds no runtime dependency, is native to Vite, keeps styling project-owned, and has suitable operations-console precedent. |
| Hand-rolled SVG charts | Use only for the first small aggregate views | The main mining visualization is the BPMN overlay. If general charts become real requirements, adopt a dependency-free library such as uPlot instead of growing an internal charting system. |
| HTTP long-polling | Select for phase one | Temporal UI demonstrates the pattern, it supports resume tokens and cancellation, and it avoids a second live transport before one is needed. |
| HTTP server and upload handling | Adopt a maintained minimal library after a focused resolved-graph and security comparison | Hand-writing multipart parsing is the higher-risk choice. The decision should optimize the complete attack surface, not the direct package count. |

Dependency review must inspect the pnpm-resolved graph, package artifact licences, install scripts, and runtime assets. Standard owners remain separate: the committed lockfile and frozen CI installation own exact resolution, pnpm's native production licence report supplies the closure for the platform licence check, pnpm `allowBuilds` owns install-script permission, and distribution tests own runtime assets. The research measurements used npm for candidate comparison and must be re-measured under pnpm before adoption.

### Partner first

- broad RPA;
- intelligent document processing;
- enterprise content and records management;
- hundreds of commodity SaaS connectors;
- cross-system object-centric mining;
- task mining;
- advanced process discovery and simulation;
- foundation-model hosting;
- vertical industry applications.

### Explicitly exclude from the initial platform

- a general low-code application builder;
- a project-authored identity provider;
- a replacement for Temporal;
- direct semantic projection from Temporal Event History;
- a complete native mining suite;
- a full RPA or IDP implementation;
- A12 source, delegates, or façades in this repository;
- implicit DMN or CMMN conformance;
- a universal Semantic Process IL for BPMN and native Temporal Workflows;
- unqualified BPMN, CIB, or migration compatibility claims.

## DMN, CMMN, and case boundaries

DMN capability is competitively important, but it must be introduced deliberately. The recommended first step is a versioned external or adopted decision runtime behind a typed evaluator contract. If DMN is later made an authoritative native semantic product, it requires its own scope, authority model, implementation, and evidence.

Case capability should begin as platform-native work management: ad hoc tasks, milestones, comments, attachments, business-object context, and optional federation. It should not claim CMMN. CMMN support would be another semantic product decision rather than an automatic extension of BPMN.

## Engine-contract additions required by the platform

The current engine-facing taxonomy of compile, start, observe committed state, and submit a command is the correct authority boundary. It is sufficient to describe the permitted kinds of semantic consumption but does not yet publish all information the platform needs. The proposal names the first two gaps as E1 and E2 without authorizing a fifth semantic path.

The accepted engine obligation set remains exactly E1 and E2, recorded by [the owner-approved platform proposal](../BPM-PLATFORM-PROPOSAL.md) and scheduled by [the showcase milestone ladder](../SHOWCASE-MILESTONE-LADDER-DECISION.md#showcase-milestone-ladder). Everything in the list below is a candidate rather than an obligation the engine has taken on. The E1a and E1b split is adopted by that ladder as two distinct information requirements, without those identifiers; the remaining items enter only through a milestone that needs one or a follow-on proposal that governs one.

The platform additionally needs:

- **E1a:** an append-only or cursor-based committed semantic transition publication for history, mining, diagnosis, and complete projection;
- **E1b:** committed control-token and definition/runtime-scope positions for the Operations diagram, unless the selected E1 record makes those positions exactly and reconstructibly available;
- **E2:** profile admission and public projection for User Task assignment and form metadata, scheduled after the basic shared-task path unless an earlier milestone explicitly requires it;
- a monotonic semantic state revision;
- stable definition, profile, compiler, and source identity in every relevant publication;
- capability discovery for supported commands and host mechanisms;
- stable terminal receipt and result retrieval contracts;
- task, Message, timer, and effect occurrence publications sufficient for read-model reconstruction;
- explicit migration-plan validation and application commands when migration is introduced;
- host diagnostic publication that is clearly non-semantic;
- a read-model rebuild or reconciliation contract.

The platform’s projected task set should remain executable-checked equal to the engine’s published open User Tasks. Its projected semantic history should be complete with respect to the engine’s committed transition records.

E1 needs an explicit delivery contract covering cursor stability, ordering, deduplication, transactional projection, restart, gap detection, replay, and rebuild. A state revision alone does not prove history completeness, and a transition stream alone does not necessarily provide the current diagram position.

## Recommended initial showcase sequence

The owner-set reopened MVP and the first complete product seam are two different acceptance gates and should not be conflated.

### Showcase A: third-party definition deployment

The first acceptance condition should remain exactly the one in the proposal: **a third party can deploy their own BPMN file**.

The smallest honest demonstration is:

```text
Upload exact BPMN bytes through the public HTTP API
  -> select an explicit supported profile
  -> compile and report admission or rejection with element identity and reason
  -> store an accepted definition by its engine-computed digest
  -> assign a version ordinal within the BPMN process identifier
  -> list and retrieve definitions and versions
  -> render the exact accepted definition
  -> start an instance pinned to the exact digest, if the admitted subset supports it
```

Required exit conditions:

- the input is genuinely supplied by the external user and is not one of the repository’s exact pre-registered fixtures;
- acceptance comes only from engine compilation under a named profile;
- the product reports the supported subset honestly and rejects unsupported source before Workflow start;
- exact bytes, digest, profile, and version remain bound;
- deployment is a platform artifact operation and does not become a new semantic engine operation;
- the React client uses only the same public HTTP API available to an external adopter;
- the engine still builds and verifies without any platform package;
- the platform imports only narrowed public engine entry points.

This milestone forces the necessary admission generalization and proves external adoption before E1, E2, identity providers, forms, incidents, or mining expand the scope.

### Showcase B: complete task and projection seam

The next showcase should establish the complete interaction and projection seam without requiring broad new BPMN semantics:

```text
Store exact definition package
  -> compile and admit
  -> deploy a version
  -> start an instance
  -> project a shared task inbox
  -> identify an actor through the pluggable identity boundary
  -> render a platform-bound form
  -> submit the published occurrence identity and values
  -> project the committed result and next state
  -> show the semantic and operator timeline
  -> export the audit record
```

Required exit conditions:

- no platform component constructs occurrence identity;
- the inbox exactly matches the engine’s published open User Tasks;
- every state-changing action is an authorized engine command;
- the history is built from committed transition publication, not Event History inference;
- actor and authorization information are retained as platform audit facts;
- the projection can be rebuilt or reconciled;
- Worker replacement and platform restart do not corrupt the read model;
- definition, profile, instance, command, and occurrence identities remain distinct;
- unsupported platform needs stop at an engine requirement rather than becoming platform policy.

This showcase can use a fake identity and shared inbox without claiming BPMN assignment semantics. Rich performer and form metadata remains E2 and should land only when a named milestone needs it.

## Dependency-ordered roadmap

This is a dependency order, not a calendar commitment.

### 0. Establish the approved product baseline

- owner approval of the independently reviewed proposal;
- narrowed public engine package entry points;
- engine-to-platform, UI-to-API, Event-History-import, resolved-dependency, and license guards;
- an ordered showcase register in `PLAN.md` with one executable gate per milestone;
- the initial modular-monolith deployment shape and package ownership.

### 1. Third-party definition deployment

- external BPMN upload through the public HTTP API;
- honest profile selection and sufficiently general admission for a third-party file within a named subset;
- content-addressed definition storage and version ordinals;
- admission diagnostics and viewer-only diagram rendering;
- exact digest pinning on Process start;
- the public React client as an API-only consumer.

### 2. Publication and projection foundation

- committed semantic transition publication;
- committed control-token and scope-position publication;
- monotonic revisions, cursoring, ordering, deduplication, gap detection, reconciliation, and projection rebuild;
- `node:sqlite` read models and platform audit separation;
- cross-product tests proving projected tasks and history agree with engine publications;
- host-diagnostic contract;
- long-polling live views.

### 3. Complete the initial proposal surfaces

- fake or pluggable identity and a shared task inbox;
- claim, release, and exact completion interaction;
- string/null variable form projection;
- semantic and operator history;
- basic operator view;
- instance and definition search;
- frequency and duration diagram overlays;
- incident, retry, and cancellation exposure only where the corresponding engine capsules are implemented;
- the pinned JUEL Activity Worker only when the deferred CIB compatibility lane opens;
- audit export.

### 4. Operable adopter release

- instance and task search;
- identity, tenants, and RBAC;
- effect and Worker diagnostics;
- OpenTelemetry and health;
- package promotion and rollback;
- public client and Worker SDKs;
- support and evidence bundles.

### 5. Migration and repair differentiator

- model and package diff;
- compatibility reports;
- dry-run migration;
- bounded active-instance migration;
- safe repair commands;
- asynchronous bulk jobs;
- approvals and complete audit;
- generic legacy-estate assessment tooling.

### 6. Work and integration breadth

- assignments, claims, delegation, SLAs, and notifications;
- comments, attachments, and business context;
- connector governance and private connectivity;
- JVM and decision Workers;
- native Temporal Workflow interoperability;
- optional task federation.

### 7. Intelligence and agent control

- mining-ready event export;
- operational and version analytics;
- native bounded conformance views;
- mining partnerships;
- agent registry, policy, evaluation, and HITL;
- MCP and A2A adapters.

### 8. Advanced case and ecosystem

- ad hoc case work and milestones;
- federated work hub;
- marketplace governance;
- vertical migration packs;
- closed-loop model improvement;
- broader managed-service operation.

## Platform coverage and success measures

Platform coverage must remain separate from BPMN requirement coverage and CIB profile coverage.

Recommended platform measures include:

- showcase milestones closed by executable acceptance gates;
- definition packages admitted and deployed;
- supported human-work operations;
- supported operator commands;
- read-model rebuild and reconciliation coverage;
- Worker and connector protocol coverage;
- supported migration source and target state classes;
- event-envelope field and retention coverage;
- supported native Temporal interoperability directions;
- tenant, authorization, audit, backup, and restore evidence;
- native versus partner intelligence capabilities.

No combined support percentage should merge BPMN, CIB, platform, A12 adoption, connector, or migration denominators.

## Potential product packaging

These are product modules and deployment bundles, not necessarily proprietary license gates. The project can remain MIT while offering managed operation, support, migration services, or packaged distributions.

| Package | Intended user | Contents |
|---|---|---|
| **Developer** | Individual engineering teams | Runtime, local Temporal path, Studio and Test basics, APIs, SDKs, CLI, mocked Workers, and local Operate view |
| **Enterprise Platform** | Platform engineering | Tenancy, identity integration, policy, HA guidance, backup and restore, audit, retention, external APIs, Work, and Operate |
| **Operate and Migrate** | Operations and modernization programs | Full diagnosis, bulk operations, compatibility analysis, dry runs, active migration, repair, and evidence |
| **Work and Case** | Business applications | Task hub, forms, assignments, delegation, SLA, attachments, case work, and federation |
| **Connect** | Integration and application teams | Worker and connector runtime, private connectivity, evaluators, Temporal interoperability, and governance |
| **Intelligence** | Process excellence | Event export, operational analytics, version comparison, bounded conformance, and mining integrations |
| **Agent Control** | AI platform and process teams | Agent registry, MCP and A2A, policies, evaluations, traces, budgets, and HITL |

Metering, if a managed product later needs it, should be predictable for long-running work. Active instances, completed work items, retained history, managed connector execution, agent cost under management, and managed capacity are more understandable than arbitrary per-BPMN-step pricing.

## Major risks and stop conditions

- If the platform needs a semantic fact the engine does not publish, stop and add an engine requirement. Do not infer it.
- If an operator action would mutate BPMN state without a reviewed engine command, stop.
- If native Temporal Workflow state is presented as Lean-verified BPMN state, stop.
- If BPMN Call Activity is silently equated with Temporal Child Workflow, stop.
- If DMN or CMMN semantics are implied by hosting a third-party evaluator or case UI, stop.
- If migration becomes direct platform-store or Event History surgery, stop.
- If platform projections cannot be rebuilt or reconciled against engine publications, stop.
- If a connector or agent retry can duplicate an unsafe side effect without an explicit uncertainty and reconciliation contract, stop.
- If an A12-specific identifier, source file, delegate, façade, or EUPL dependency enters products 1 or 2, stop.
- If deployment breadth requires weakening the project’s dependency and license controls, stop for an explicit owner decision.

## Immediate documentation recommendation

The earlier recommendation to create a governed platform-scope proposal has now been satisfied by [BPM-PLATFORM-PROPOSAL.md](../BPM-PLATFORM-PROPOSAL.md), supported by [BPM-PLATFORM-STACK-RESEARCH.md](BPM-PLATFORM-STACK-RESEARCH.md), the product division in [PROJECT-DESIGN.md](../PROJECT-DESIGN.md#product-division), and the explicit absence boundary in [`implementation-status-owner:BPM-PLATFORM`](../BPM-PLATFORM-IMPLEMENTATION-MAP.md#explicitly-absent).

The next documentation action should be smaller and operational:

1. approve the reviewed proposal in its Status section;
2. add a platform showcase milestone register to [PLAN.md](../PLAN.md), beginning with third-party definition deployment;
3. define the exact gate and supported-profile boundary for that reopened MVP;
4. give E1a, E1b, and later E2 separate engine-owned requirements and governed cycles;
5. record the initial modular-monolith deployment shape and the package guards before the first platform package lands;
6. resolve the remaining open stack decisions; `bpmn-js` and CSS Modules are selected, while long-polling remains recommended as above;
7. create separate follow-on proposals only when the first platform needs migration, browser modeling, native Temporal Workflow composition, multi-tenancy, advanced mining, DMN, case work, or agent control.

The current wording that the platform consumes only the engine’s published contract is now adequately qualified in the project design: every **BPMN semantic fact** comes only from that contract, while platform-owned identity, policy, persistence, and audit remain legitimate platform inputs and host facts remain separately labeled. The implementation must make this constitutional distinction executable through package boundaries and planted-violation guards.

## Final recommendation

The dossier’s “coherent middle layer” conclusion is correct, but this project can make the opening more specific and more defensible.

The goal should be neither another BPMN engine nor another broad low-code suite. It should be an assurance-first BPMN platform on Temporal that offers:

- exact and explainable BPMN semantics;
- first-class human work and operations;
- safe migration and repair;
- open, governed Workers and connectors;
- deliberate composition with native Temporal Workflows;
- mining-ready semantic events;
- governed agent execution;
- customer-controlled deployment and portable contracts.

The essential product distinction is that BPMN remains the formally governed business-process language, while Temporal remains both the durability substrate and the native code-orchestration ecosystem. The platform makes those two worlds interoperable without pretending that they share one semantic authority.

The practical recommendation is therefore **approve, establish, then expand**:

1. approve and implement the current BPM platform proposal as the smallest complete foundation;
2. prove external adoption first through third-party BPMN deployment;
3. complete the task, projection, operations, history, and basic mining surfaces already inside the proposal;
4. harden the result into an operable adopter release;
5. grow into verified migration and repair, richer human work, governed integrations, native Temporal Workflow composition, intelligence, and agents in that order.

This preserves focus without reducing ambition. The proposal is the correct first product, and the broader assessment is the correct destination.

## Source notes

The principal input is the imported [competitive landscape dossier](ENTERPRISE-PROCESS-ORCHESTRATION-COMPETITIVE-LANDSCAPE-RESEARCH.md), researched on 31 July 2026 and bound to the exact received content by the SHA-256 recorded in its provenance section and [SOURCES.md](../SOURCES.md#enterprise-process-orchestration-competitive-landscape-dossier).

Project assessment uses the current [BPM-PLATFORM-PROPOSAL.md](../BPM-PLATFORM-PROPOSAL.md), [BPM-PLATFORM-STACK-RESEARCH.md](BPM-PLATFORM-STACK-RESEARCH.md), [PROJECT-DESIGN.md](../PROJECT-DESIGN.md), [`implementation-status-router`](../IMPLEMENTATION-MAP.md), [PLAN.md](../PLAN.md), and [README.md](../../README.md).

The central migration and lifecycle claims were narrowly checked against current official documentation:

- [Camunda process-instance migration](https://docs.camunda.io/docs/components/concepts/process-instance-migration/)
- [Flowable process migration](https://documentation.flowable.com/latest/reactmodel/bpmn/concept/process-migration)
- [UiPath Maestro process operations](https://docs.uipath.com/maestro/automation-cloud/latest/user-guide/understanding-process-operations)
- [UiPath Maestro live-case pause, retry, and migration](https://docs.uipath.com/maestro/automation-cloud/latest/user-guide/how-to-manage-live-case-instances-pause-migrate-and-retry)
- [Temporal Worker Versioning](https://docs.temporal.io/production-deployment/worker-deployments/worker-versioning)

This assessment does not recertify every capability or entitlement across all 35 vendor dossiers. Edition, hosting, licensing, and newly announced agent capabilities require fresh verification before procurement or committed implementation decisions.
