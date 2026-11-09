# Project design

## Mission

Build a Temporal-hosted BPMN 2.0.2 execution engine that imports Process diagrams within CIB Seven `2.2.0` implemented element breadth and feature depth, and an MIT-licensed BPM platform on top of it. **Practical CIB7 Coverage** is the primary engine objective, with BPMN meaning authoritative within that implementation ceiling: the kernel IL, the Lean kernel, the TypeScript kernel and the Temporal host must be meaningful without CIB Seven and without any downstream product. Within that ceiling, practical breadth and semantic risk are co-equal scheduling inputs after normative dependencies. Practical breadth comes from the executable BPMN breadth of CIB Seven `2.2.0` and a maintained deduplicated corpus of representative whole models. Semantic risk comes from mechanisms whose concurrency, ordering, cancellation, scope, liveness, runtime-identity, data or durable-hosting obligations could invalidate the accepted representation or force a non-local redesign even when few sampled models use them.

CIB Seven compatibility is a versioned overlay on that BPMN engine. It selects and classifies CIB interpretations, extensions, configuration-specific realizations, limitations and evidenced deviations without allowing CIB host mechanisms to define the vendor-neutral BPMN core.

The distinguishing claim is that the BPMN meaning underneath the platform is stated executably in Lean rather than asserted, and that the platform inherits that assurance because it consumes the engine's published contract instead of reconstructing semantic facts. [The product division](#product-division) states the boundary that claim depends on; the [kernel architecture specification](kernel/ARCHITECTURE-SPEC.md) owns the engine's design, guardrails and assurance lane; [ARCHITECTURE.md](ARCHITECTURE.md) owns the repository and modular-monolith realization.

The project pursues these goals through four components:

1. versioned semantic profiles (a standards profile and cumulative CIB Seven profiles), which are data;
2. the Lean kernel, the formal semantic authority and executable specification;
3. the TypeScript kernel, a separately written transcription of the Lean kernel;
4. the Temporal host, continuously checked through differential, refinement and replay testing.

The normative target is owned by [BPMN-CONFORMANCE-TARGET.md](BPMN-CONFORMANCE-TARGET.md). Every reviewed CIB relationship belongs in the [CIB–BPMN register](CIB-BPMN-RELATION-REGISTER.md). This document owns the project-local constitution: goals, product boundaries, scope ordering and the evolution policy.

## Product division

The owner divided the work into three products on 2026-08-07.

| # | Product | Owner | License | Repository | Depends on | Owns |
|---|---|---|---|---|---|---|
| 1 | BPMN execution engine | this project | MIT | this one | Temporal | Source reading, kernel admission, the Lean and TypeScript kernels, the Temporal host, semantic profiles, the CIB relationship register, and CIB oracle evidence |
| 2 | BPM platform on Temporal | this project | MIT | this one | product 1 | Deployment and versioning, tasklist, task interaction, dashboard, operations and monitoring, history, mining, diagnosis, identity, persistence, and the external API |
| 3 | A12 Workflows replacement | A12 | EUPL-1.2 | **separate, A12-owned** | product 2 | A12 models, delegates, façades, and migration |

Dependency runs one way and so does licensing. Product 3 may build on MIT product 2; **product 2 must never take an EUPL dependency**, or the separation it exists to provide is gone. Product 3 consumes product 2 as a published MIT artifact, and **no A12 product code is added here**. A12 remains an external evidence and research input. The A12 source boundary recorded in [SOURCES.md](SOURCES.md) continues to bind this repository unchanged.

The post-MVP scalability order is Product 2 shared persistence, shared immutable artifact storage, bounded background recovery, and projection-backed reads first; Product 1 Workflow-chain budgets and Continue-As-New second; and workload isolation plus distributed capacity evidence third. The functional MVP remains explicitly single-node and carries no production scalability or capacity claim. [The Temporal BPMN execution scalability proposal](TEMPORAL-BPMN-EXECUTION-SCALABILITY-PROPOSAL.md) owns the scale contracts, outside the current target; [PLAN.md](PLAN.md) alone schedules work.

### Engine maturity roadmap labels

The engine uses a non-binding pre-1.0 maturity ladder as planning vocabulary, not assigned software versions: the labels create no package SemVer, release, compatibility promise, support window, migration baseline, delivery date, profile identity or conformance claim. Advancing a label requires an explicit evidence-backed owner decision.

| Starting-point label | Working outcome | Boundary |
|---|---|---|
| Engine `v0.1`, **Runnable MVP** | Retrospectively names the external runner floor and its durable-lifecycle hardening. | No production-scale claim. |
| Engine `v0.2`, **Minimum Useful Engine (MUE)** | Ordinary modeler interchange plus enough reusable Process Execution breadth for representative whole models. | Historical planning boundary; separate MUE acceptance is no longer selected or a prerequisite for Practical CIB7 Coverage. |
| Engine `v0.3`, **Scalable Engine** | Workload isolation, backpressure, fairness, failover, observability, capacity and cost evidence around the useful semantic surface. | Scale evidence does not increase BPMN or CIB coverage. |
| Engine `v0.9`, **Conformance Candidate** | A reviewable candidate against the declared BPMN Process Execution target with ledger, profiles, formal account, implementation and evidence aligned. | Not itself a conformance statement. |
| Engine `v1.0`, **Conformant Engine** | Reserved for an explicitly approved release boundary whose evidence supports the exact declared OMG Process Execution Conformance claim. | Unselected; any requirement beyond the CIB7 ceiling needs a new owner scope decision. |

A closed engine-maturity label is recorded by one annotated Git tag named `engine/v<major>.<minor>` whose annotation is `Engine v<major>.<minor>: <name>`, created only after the owner closes that boundary and never moved. Historical repository tags such as `MVP`, `M1` through `M6` and `v0.1.0-preview` keep their original targets and meanings.

### MUE delivery checkpoints

The historical MUE programme defined non-release checkpoints before the Engine `v0.2` boundary. Their evidence is preserved; Practical CIB7 Coverage supersedes separate MUE acceptance without claiming that acceptance passed. A checkpoint tag is an evidence snapshot under the [project tag policy](../CLAUDE.md#git-and-delivery), not a package version, compatibility promise or conformance claim.

| Checkpoint | Exit boundary | Annotated tag |
|---|---|---|
| MUE v0.2 Preview Alpha | One production-browser and real-Temporal vertical slice, demonstrable with curated examples, every unimplemented limit explicit. | `phase/mue-preview-alpha` |
| MUE v0.2 Preview Beta | Every remaining MUE content ID has one reviewed vertical checkpoint, integrated into one Product 2 preview with open limits disclosed. | `phase/mue-preview-beta` |
| MUE v0.2 Release Candidate | All MUE content IDs in the owner-selected boundary implemented and the feature surface frozen. | `phase/mue-release-candidate` |
| Minimum Useful Engine | Every MUE obligation closed by explicit owner decision. | `engine/v0.2` |

The published distribution `v0.2.0-rc.1` stays at `16c5b9f6`; the Alpha and Beta `phase/` tags stay at their original targets, together with the owner-directed RC phase-tag realignments and the bounded native-runtime risk exception. No further tag move is authorized.

#### Historical RC content boundary

`MUE-RELEASE-CANDIDATE` froze seven content IDs, all recorded `satisfied` on the old stack: `SEQUENTIAL-MULTI-INSTANCE`, `INTERNAL-COMMUTATION`, `PARALLEL-MULTI-INSTANCE`, `MECHANISM-MATURITY-EVIDENCE`, `DATA-AND-TASK-MECHANISMS`, `EVENT-SUBSCRIPTIONS` and `COMPENSATION-TRANSACTIONS`. Their closure records are historical and live at the [pre-reset document state](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/PROJECT-DESIGN.md#historical-rc-content-boundary); the kernel rewrite replaced the code they describe, so they carry no claim about the kernel. `H3-WORKLOAD-ISOLATION` stays in Engine `v0.3` and `CONFORMANCE-CLOSURE` in Engine `v0.9`.

### Practical CIB7 Coverage

On 2026-10-03 the owner selected **Practical CIB7 Coverage** as the primary delivery objective, superseding the MUE-then-coverage sequence; reconfirmed on 2026-10-04, the owner intends to show and release only Practical CIB7 Coverage. No new version or tag is assigned. [PLAN](PLAN.md) owns execution order.

The milestone closes the reviewed [practical-depth inventory](PRACTICAL-CIB7-COVERAGE-TARGET.md) of CIB7-supported element variants and their useful compositions under the kernel's [definition of done for a row](kernel/ARCHITECTURE-SPEC.md#definition-of-done-for-a-row). Isolated element examples cannot establish broad executable coverage. The inventory distinguishes required behavior, optional compatibility integrations and CIB-unsupported exclusions.

Acceptance requires all required rows and cross-family business journeys to pass, exact restrictions and CIB differences to be disclosed, and an explicit owner decision. Java/REST API replacement, every scripting runtime, vendor administration facilities and production-scale qualification do not follow from this milestone. The [CIB7 scope ceiling](#cib-seven-220-breadth-ordering) bounds it; full OMG conformance remains a separate conditional claim, not a reason to implement beyond CIB7.

### One repository for products 1 and 2

Products 1 and 2 share this repository. A change to a published observation ripples from the kernel through the contracts, the Temporal host and the engine API into the platform's read models and surfaces, and [the pre-release evolution policy](#pre-release-evolution-policy) requires that such a change replace every producer, consumer, fixture, schema and test **atomically**. Two repositories would need either lockstep releases or a version-tolerant reader, and the second is exactly what that policy forbids before an immutable baseline exists.

Product 3 is separate for the opposite reason: it is another organization's product under a reciprocal license, so its boundary is a distribution boundary rather than a change-coordination one.

```text
Kernel/                           product 1 Lean kernel
packages/                         product 1 TypeScript packages (kernel, bpmn-source, temporal-host, engine-api, differential)
  contract-types/                 neutral type-only contract utilities shared by products 1 and 2
profiles/ scenarios/ contracts/   product 1 semantic artifacts
runners/                          product 1 external-oracle adapters

platform/                         product 2 modular monolith and production Workers
showcase/                         product 2 milestone acceptance gates
```

[ARCHITECTURE.md](ARCHITECTURE.md) owns the concrete layout. Because the repository wall is gone, the boundary is executable: an owned guard fails when a product-1 tree references `platform/`, when a platform package deep-imports an engine internal path instead of its public entry point, or when a platform package imports Temporal Event History APIs. The only neutral cross-product package is `@bpmn-lean/contract-types`, which owns type-level immutability and no runtime, BPMN, engine, platform or transport behavior. The engine's complete gate keeps passing without building any platform package.

Sharing the tree also makes one check possible that separate repositories would not: for every registered scenario, the platform's projected task set must equal the engine's published open User Tasks, and its projected history must be complete with respect to the engine's committed publication. That turns "the platform reconstructs no semantic fact" from a rule into a test.

### Dependency posture

Two rules govern the platform's dependencies, and they are commonly mistaken for one.

**A small footprint is a stated requirement, for security rather than tidiness.** Every package in the resolved graph is attack surface, and a BPM platform is exactly the kind of product where a user-facing surface, a deployment endpoint and durable business state meet. The owner confirmed this on 2026-08-07 and declined to relax dependency approval for platform-only packages.

**Adopt rather than reimplement.** The platform implements what only it can implement and takes maintained MIT-compatible work for everything else; a BPMN diagram renderer is out of scope as implementation here, and so is anything else whose correctness is someone else's solved problem (owner direction, 2026-08-07). Expression evaluation is the exception the engine owns: the kernel evaluates its profile's expression subset inside the step, with no JVM in the TypeScript and Temporal solution ([owner decision, 2026-11-08](kernel/ARCHITECTURE-SPEC.md#runtime-state-and-step)).

The two rules agree more often than they conflict, because fewer packages is not automatically safer when the alternative is our own unaudited code in the same risky position. Where they genuinely conflict, the comparison is against the whole alternative, including the defects we would introduce and maintain, never against the package count alone.

Each candidate is decided on its own record: research the alternatives, compare the resolved footprint and licences against what building it would cost, and obtain owner approval before anything enters the tree. [The dependency rule](../CLAUDE.md#dependencies) follows the standard package-manager split: direct intent belongs in the owning manifest, exact resolution in the committed lockfile and frozen CI installation, and [`platform/license-policy.json`](../platform/license-policy.json) owns only the platform's permitted licences and exact non-standard exceptions.

Within product 1 the internal layering is:

```text
BPM platform on Temporal            (product 2)
        ↓ consumes the published engine contract
selected CIB Seven compatibility profiles
        ↓ refine or extend
vendor-neutral BPMN 2.0.2 execution kernel
        ↓ hosted by
Temporal durability and effect infrastructure
```

| Layer | Owns | Must not own |
|---|---|---|
| BPMN execution kernel | Standard Process structure and lifecycle, control flow, Activities, Events, scopes, variables, expression evaluation for the selected profile, public semantic observations, and host-independent inputs | Camunda extension QNames, CIB jobs/retries/incidents, downstream handlers or APIs, Temporal attempts, or product-specific model shapes |
| CIB Seven compatibility profile | Classified interpretations and gap resolutions, selected `camunda:*` source extensions, CIB configuration, transaction/variable behavior, jobs/retries/incidents, and bounded behavioral compatibility evidence | General BPMN authority, unqualified engine compatibility, downstream integration APIs, or product-specific business semantics |
| BPM platform | Deployment, read models, user and operator surfaces, persistence, identity, and product acceptance evidence | Any BPMN meaning, transition, admission decision, or occurrence identity it did not receive from a published engine observation |

### What the platform may consume

Product 2's permitted surface for **consuming semantic state** is the engine's published contract, in four kinds: compile exact bytes against a selected profile, start an admitted program, observe committed canonical state, and submit a command. Nothing else of that kind crosses. The [engine API](../packages/engine-api/) and the [Temporal host](../packages/temporal-host/) realize it; Product 2 consumes the Temporal client only through its engine gateway, so Worker and test infrastructure stay outside the platform server's dependency closure.

Consumption is not the only direction. The platform additionally **hosts** engine-defined work: it runs the Workflow Worker carrying the admitted program and implements the effect Activity Worker. Hosting is a responsibility, never a fifth way to reach semantic state.

Each surface splits into a service, a public HTTP API over it, and a client. [ARCHITECTURE.md](ARCHITECTURE.md#product-2-dependency-direction) owns the package realization. **The platform's own UI consumes only that public API and may not import a platform service package**, so a guarded UI passing demonstrates the API is sufficient for an adopter who builds their own front end.

Two rules make the assurance claim transferable, and without both of them it is false:

- **Occurrence identity is taken, never constructed.** The platform answers a published interaction by submitting the identity that interaction carried. No product code assembles a task, subscription, activation or Call identity.
- **A missing fact is a stop condition, not a workaround.** When the platform needs something the engine does not publish, it files an engine requirement and stops. It does not derive the fact from Temporal Event History, from a state difference, or from its own store.

### Source-grounded Product 2 interaction design

Before production code selects or implements a material Product 2 UI/UX surface, inspect the comparable CIB Seven capability first when one exists, using the pristine pinned source registered in [SOURCES.md](SOURCES.md) and its documentation, then another established product when CIB Seven has no analogue. Record in the owning research and product contract what the project adopts, deliberately deviates from and excludes, with the published engine or platform fact supporting each decision. Do not copy source code, styling, assets, private data models or product terminology from a reference product. CIB Seven remains a functional and interaction-design reference for Product 2, not a semantic authority, dependency or visual theme.

Coverage is accounted separately:

1. BPMN coverage counts reviewed Process Execution requirements and reusable standard mechanisms;
2. CIB coverage counts classified source extensions and behavioral relationships for named profiles;
3. platform coverage counts closed showcase milestones and their acceptance gates, against the denominator in [the showcase milestone ladder](SHOWCASE-MILESTONE-LADDER-DECISION.md#showcase-milestone-ladder).

No aggregate percentage may combine these denominators, and no public claim may exceed the exact profile and evidence recorded in the [kernel status map](kernel/KERNEL-STATUS-MAP.md).

## CIB Seven 2.2.0 breadth ordering

The owner selected CIB Seven `2.2.0` implemented element breadth and feature depth as the scope ceiling on 2026-10-03. A feature or deeper variant not implemented in that baseline is out of scope, even if BPMN specifies it. Before selection, record exact CIB source, test or documentation evidence for supported hosts, combinations, data, expressions, repetition and interruption; tag presence or test-file frequency alone is insufficient. Unknown depth stays unresolved, not implicitly admitted. This selects practical execution scope, not CIB architecture, Java/REST APIs or an obligation to reproduce defects. BPMN remains normative and the relationship register classifies differences.

Existing differences, including [standard Multi-Instance output aggregation](CIB-BPMN-RELATION-REGISTER.md#cib-lim-0001-standard-sequential-multi-instance-output-aggregation-is-absent), remain disclosed and require explicit disposition before any broad CIB7-depth acceptance.

CIB Seven `2.2.0` is also the primary mature-engine baseline for ordering work within that scope. The concrete queue belongs only to [PLAN.md](PLAN.md); the requirement ledger, CIB breadth research, executable corpus and scalability proposal supply evidence but do not schedule work. After normative dependencies, semantic risk and practical reach are co-equal and are not averaged: either can justify priority. Every semantic increment starts with the BPMN standard account, then adds a CIB relationship only as a classified overlay when an ambiguity, extension, configuration or compatibility claim requires it. Each newly executable variant adds a credible retained whole model when its row's acceptance names one.

Group requirements by reusable mechanism rather than by XML element: Process lifecycle and graph flow; Activity lifecycle; branching and merging; scopes and interruption; event subscription and consumption; variables, data and mapping; looping and Multi-Instance; compensation; import and reference closure. [The requirement ledger](BPMN-REQUIREMENT-LEDGER.md) owns dispositions. [CIB breadth research](research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md) measures mature engine-test breadth, while the curated executable corpus measures independent whole-model families this project can or cannot run. Neither raw XML-tag counts nor cloned model counts select work by themselves.

The standing high-risk semantic areas are Activity lifecycle and implicit merge or split; inclusive and complex synchronization; repeated scopes, interruption and cancellation; event subscription lifetime, correlation, races and Event Sub-Processes; loops, Multi-Instance, fairness, divergence and stable-state progress; data availability, mapping, mutation, expressions and external language execution; compensation ordering and snapshot state; repeated runtime occurrences and complete command identity; and Temporal delivery, retry, replay and cancellation refinements that could erase a public BPMN outcome. This list is a risk lens rather than an implementation queue.

The CIB breadth baseline counts executable Process behavior rather than every CIB product feature or public API. The corpus counts clone-normalized model families and reusable mechanisms rather than physical files or raw XML tags, and distinguishes schema validity, admission, semantic execution, Temporal execution, selected CIB comparison and Product 2 readiness. External examples remain external unless their licence permits redistribution.

Administration, persistence, authorization, Tasklist, Cockpit, forms UI, identity management, Collaboration features not exercised by the selected engine baseline and product-specific human-resource policy do not enter the **semantic** schedule merely because a CIB distribution contains adjacent facilities. Several of them are what product 2 provides as its own MIT work without importing CIB semantics for them.

The [CIB–BPMN register](CIB-BPMN-RELATION-REGISTER.md) owns relation classifications, and the [model-corpus registry](../model-corpus/README.md) owns the corpus's executable acceptance gate. Corpus evidence selects which requirement to review next; it never approves the semantic account for that requirement.

### CIB evidence on demand

For every BPMN work unit, add CIB-specific implementation only when at least one of these holds: BPMN leaves a material choice the selected profile must resolve; admitted source requires a `camunda:*` extension; the compatibility claim requires a pinned engine observation not already covered; CIB configuration or host behavior can change the canonical or adoption-visible result; or a concrete downstream blocker remains after the standard mechanism is implemented. Otherwise add no new CIB profile surface. When one holds, add the smallest relationship-register entry, profile option, scenario evidence and mutation that establishes the fact.

## Authority model

BPMN and CIB are related but not interchangeable. BPMN 2.0.2 is authoritative for syntax, metamodel and Process Execution Conformance. CIB Seven is a mature, compliance-oriented implementation whose normal role is to realize BPMN faithfully, make underspecified behavior operational, and add explicit engine extensions. [CLAUDE.md](../CLAUDE.md#authority-model) owns the ordered authority list.

The default CIB classification is normative agreement. Greater operational specificity is an interpretation when it resolves a BPMN gap. Worker, job, retry, incident, listener or other added capabilities are extensions when they exceed bare BPMN. A normative deviation is exceptional and requires clear standard language, pinned separating evidence, alternative-explanation exclusion and owner review.

CIB participates twice: before formalization, a normative requirement and the smallest relevant CIB probe are reviewed and classified into a profile; after implementation, the pinned complete engine remains the independent behavioral oracle for that profile. Raw CIB output never becomes Lean authority automatically, and differential mismatches are never resolved by majority vote.

## Component boundaries

| Component | Responsibility | Explicit limit |
|---|---|---|
| Semantic profile | Data: the selected CIB relation options and the admitted field set for one declared target ([profiles](kernel/ARCHITECTURE-SPEC.md#profiles)) | No code compares a profile identifier; a profile is not an engine build or an unqualified compatibility promise |
| BPMN source boundary (`@bpmn-lean/bpmn-source`) | Preserve exact bytes, parse, and read the model into the kernel IL, refusing only parse, preservation and unknown-element cases | Parser objects never cross it; every semantic refusal belongs to kernel admission |
| Kernel IL | One immutable, serializable, flat element table per definition, fixed in shape for every row ([IL specification](kernel/IL-SPEC.md)) | Not a mirror of the BPMN metamodel and not runtime state |
| Lean kernel | Executable operational meaning of the admitted surface and the declarative `Laws` per feature | It does not prove CIB, XML parsing, TypeScript, Temporal, databases or effects |
| TypeScript kernel | A separately written transcription of the Lean kernel's executable modules, paired by name | No I/O, no CIB or Temporal dependency, and no independent choice of operational account |
| Temporal host | Persist kernel state, deliver inputs, and host timers and effects durably, seeing the kernel only through its host interface | Hidden Workflow work may not redefine BPMN-visible behavior |
| BPM platform | Deploy and version definitions, project engine observations into read models, and serve user, operator and integration surfaces | It does not enter the kernel, redefine profiles, construct an occurrence identity, or reconstruct a semantic fact the engine did not publish |
| Assurance pipeline | Compare canonical consequences across Lean, TypeScript and retained CIB evidence, detect seeded disagreement, and test Temporal refinement and replay | Finite evidence never implies universal conformance |

## Why Lean

Lean is useful when it converts semantic risk into an executable definition, a reusable law, or a checked counterexample before the same choice spreads through TypeScript and Temporal. The Lean kernel is the executable specification that every scenario checks the TypeScript kernel and CIB Seven against; each `Laws.<F>` states its feature's rules independently of `Step`'s code, and the proof wave proves `Step` sound against them ([Lean assurance lane](kernel/ARCHITECTURE-SPEC.md#lean-assurance-lane)). A CIB witness, a Lean law, TypeScript behavior and Temporal refinement remain separate claims even when they agree.

### Two kinds of independence

Lean and the TypeScript kernel are independent **transcriptions** of one reviewed operational account. They are separately written and separately executable, and they mutually check transcription defects such as an inverted guard or a mistyped identity field. They are not independent **accounts**: both share the kernel's state decomposition and would reproduce an error in it identically. Agreement between Lean and TypeScript is a transcription check, never evidence of meaning.

Account-level independence therefore comes only from the normative and profile review and from pinned CIB evidence, bounded by the oracle fidelity that the [CIB observation policy](CIB-OBSERVATION-POLICY.md) records. The [engineering policy](kernel/ENGINEERING-POLICY.md#contracts-and-evidence) owns the evidence lanes and what each one does and does not establish.

Lean also forces architectural distinctions to become explicit: shared definition identity versus runtime occurrence identity; external input admission versus internal step closure; semantic failure versus rejected input versus harness exhaustion; semantic state versus CIB and Temporal host identity; declarative laws versus the executable step.

## Interpreter architecture

The production architecture is an **interpreter in TypeScript, not a BPMN-to-TypeScript code generator**.

```text
BPMN 2 XML
  → exact source identity, parsing and reading (@bpmn-lean/bpmn-source)
  → kernel IL data, admitted against the selected profile (Kernel.Admission)
  → pure kernel steps (Lean and TypeScript)
  → Temporal durability, delivery, timers and effects (temporal-host)
```

Reading and admission occur outside deterministic Workflow execution. One generic Workflow receives an admitted program and drives the kernel step from its host view. Temporal Activities, timers and messages implement declared effects and waits only after the kernel assigns their BPMN meaning. The [kernel architecture specification](kernel/ARCHITECTURE-SPEC.md) owns the design.

This choice preserves one inspectable model representation, avoids generating a new Workflow Definition for every diagram, and keeps SDK calls, Workflow deployment and replay mechanics from becoming accidental BPMN semantics. Generated TypeScript is never the semantic authority by construction.

## Profile-selected expression evaluation

BPMN `FormalExpression` carries expression text under a selected language. BPMN does not prescribe one universal grammar or evaluator, but an executable profile must still select the exact language, visible context, result type, failure consequence and consuming BPMN transition. Omitted definition-level and expression-level language selection retains BPMN's XPath default and is never silently interpreted as a project language.

Each profile selects exactly one evaluator for its admitted expressions, run inside the kernel step; no evaluation leaves the kernel. Until M2 every profile selects the [Simple Boolean language](SIMPLE-BOOLEAN-EXPRESSION-DECISION.md); from M2 a read-only JUEL subset, written in Lean and transcribed to TypeScript, grows by level ([JUEL decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md), [levels](kernel/ARCHITECTURE-SPEC.md#runtime-state-and-step)). An expression outside the selected evaluator is refused at admission with a stable code.

Read-only evaluation, variable mutation and engine or application-service calls are separate capability classes. Service calls use explicit effects. Beans, `execution`, Java objects, unlisted methods, file or network access, Groovy and FreeMarker do not enter any evaluator by implication; DMN decision tables and JavaScript Script Tasks follow their own [owner decisions](kernel/ARCHITECTURE-SPEC.md#owner-decisions-on-the-path). A universal multi-language framework is not extracted.

## CIB compatibility and polyglot effect execution

The project targets explicitly selected source and behavioral compatibility with versioned CIB Seven profiles. It does not target drop-in replacement of the Process Engine Java, REST, plugin, persistence, deployment or administration APIs. Every compatibility claim names its source syntax, feature surface, behavior, configuration, observation boundary and evidence; an unqualified “CIB-compatible” claim is prohibited.

Camunda/CIB extension syntax is admitted only through exact profile-selected BPMN contexts, expanded namespace QNames and value shapes, and is read into neutral handler bindings. Camunda namespaces and source tokens remain in exact source evidence; bean or Worker bindings remain in the BPM platform. The kernel IL, Lean and the TypeScript kernel contain only neutral identities and source-derived semantic data. Java classes, engine jobs, retries, host identities and downstream business literals never become semantic authority because the source or oracle uses them. The [CIB Seven compatibility scope proposal](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) keeps the family dispositions and reopen conditions.

The TypeScript kernel and the TypeScript Temporal Workflow remain the single production interpreter. Effect requests cross a language-neutral Activity protocol that TypeScript or JVM Workers may execute. A Worker performs external computation; it never mutates Process state directly or chooses semantic identity, and returns an effect result the kernel validates and commits.

Supporting Java handlers therefore does not justify rewriting the kernel in Java or Kotlin, maintaining a second JVM interpreter, or moving semantic decisions to a remote service. A JVM Worker may expose a project-owned Java handler API and, under separately reviewed profiles, bounded adapters for CIB Seven or Camunda 7 delegates; unsupported delegate operations fail explicitly. Full `DelegateExecution`, internal `ActivityBehavior`, Process Engine service and plugin compatibility remain outside the architecture unless the owner funds a separate compatibility program. The TypeScript SDK's deterministic Workflow sandbox, structural wire types and language separation from the Java CIB oracle make TypeScript the interpreter host; reopen that choice only for a named non-Temporal embedded JVM product mode that must own and advance Process state in-process, after fresh owner approval.

Workflow and Worker implementations agree through explicit Activity type, task queue, request and result schema, payload encoding, idempotency identity, timeout, retry, cancellation and failure contracts. Cross-SDK compatibility is an executable evidence obligation rather than an assumption about default payload converters.

## Pre-release evolution policy

The project is far from a production compatibility boundary and expects substantial change. Its evolution policy therefore optimizes for one clean architecture:

- each wire artifact has a stable structural `kind`;
- wire integers stay within the non-negative JavaScript-safe integer domain, and canonical identifiers are exact Unicode-scalar strings ordered lexicographically by scalar value without normalization;
- byte-level JSON admission rejects duplicate decoded object keys and unpaired surrogate encodings before typed decoding;
- JSON Schema `$id` owns schema-document identity;
- a semantic profile `id` owns reviewed semantic and compatibility meaning;
- kernel programs carry stable exact-source and selected-profile identity;
- a breaking shape change replaces all current producers, consumers, schemas, examples and tests atomically;
- no parallel legacy format, embedded format counter, compatibility switch, migration reader or fallback constructor is retained before a durable release baseline exists;
- local Temporal tests use a fresh in-memory server, replay the histories created in that same gate, and then discard all server state.

Before the first immutable release or persisted production history, the owner must explicitly approve:

1. which profile and wire artifacts become immutable;
2. the Event History baseline and Worker/version markers;
3. migration, patching, deprecation and rollback rules;
4. retained replay fixtures and their provenance;
5. support windows and removal criteria.

From that point onward, history compatibility and artifact migration become mandatory evidence based on real retained state rather than speculative prototypes.
