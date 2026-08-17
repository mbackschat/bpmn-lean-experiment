# Architecture

## Status

**Owner-approved current implementation architecture.** This document owns the concrete repository layout, modular-monolith shape, package dependency direction, composition roots, and architecture decision register for products 1 and 2. It does not own product scope, BPMN meaning, implementation status, or work order.

## Responsibility split

[PROJECT-DESIGN.md](PROJECT-DESIGN.md) owns why the products, semantic authorities, and one-way product boundary exist. [The BPM platform proposal](BPM-PLATFORM-PROPOSAL.md) owns what the first platform product must provide. This document owns how source packages realize those decisions. The detail maps routed by [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) record which parts exist, and [PLAN.md](PLAN.md) records what comes next.

Local directory `README.md` files state only the ownership and dependency rules of their subtree. They link here instead of copying the complete layout or decision register.

## Architectural style

Product 2 begins as a modular monolith. Its services are logical modules with explicit package boundaries, composed into a small number of deployable applications. They are not independently deployed microservices merely because their source is separated.

The modular monolith keeps atomic engine-to-platform contract changes possible, permits a small self-hosted deployment, and leaves domain modules independently testable and extractable if measured scaling or deployment isolation later requires it. Network boundaries are introduced only for public HTTP clients, Temporal-hosted work, or independently deployed Workers whose lifecycle already differs.

## Repository map

```text
packages/                         product 1 TypeScript engine packages
  contract-types/                neutral type-only contract utilities shared by products 1 and 2
  temporal-adapter/              product 1 Temporal subsystem package container
BpmnSemantics/                    product 1 Lean reference
profiles/ scenarios/ contracts/   product 1 semantic artifacts
runners/                          product 1 adapters to external executable oracles

platform/                         product 2 modular monolith
  apps/                           deployable composition roots
    server/                       local or horizontally replicated public API
    postgresql-migrate/           explicit shared-schema migration command
    recovery-worker/              horizontally replicated Product 2 repair and projection loops
    web/                          static HTTP-only browser client
  contracts/                      public transport and event contracts
  foundation/                     reusable product-2 infrastructure mechanisms
  modules/                        business-capability modules
  ui-kit/                         shared accessible visual components
  workers/                        independently deployed production Workers

showcase/                         product 2 executable milestone acceptance gates
```

`runners/` is reserved for evidence adapters to independent executable oracles. Production Workers belong under `platform/workers/`; in particular, the deferred JUEL evaluator belongs under `platform/workers/juel-evaluator/`, never beside the CIB Seven oracle runner.

## Temporal adapter subsystem

`packages/temporal-adapter/` is a subsystem directory containing independently built workspace packages. It is not one runtime package and has no production umbrella entry point. The boundaries follow actual execution environments and dependency closures:

```text
packages/temporal-adapter/
  protocol/    shared Temporal-facing contracts, identity, transport, and host admission
  client/      start, Query, Signal, Update, and retained-result resolution
  workflow/    deterministic Workflow implementation and scheduling
  worker/      Workflow bundling, Worker lifecycle, and Activity hosting
  runner/      product-1 executable composition and command-line entry points
  testkit/     private ephemeral servers, mutations, calibration, and evidence support
```

The permitted dependency direction is:

```text
runner  ---> client
  |          |
  v          v
worker ---> protocol <--- workflow
  |                         |
  +-------------------------+

testkit ---> protocol + client + workflow + worker + runner
```

`protocol` may depend on the semantic core but on no Temporal SDK package. `client` owns the production `@temporalio/client` dependency. `workflow` owns `@temporalio/workflow`. `worker` owns `@temporalio/worker`. `runner` composes production engine packages and the client/worker surfaces without exporting test infrastructure. `testkit` alone owns `@temporalio/testing` and may depend on every sibling because it is excluded from production dependency graphs.

Committed execution publication follows the same direction. The semantic core and Lean independently retain exact unnumbered transition and public-position facts. `workflow` alone assigns contiguous revisions in deterministic state and serves a pure cursor Query. `protocol` owns Program-bound producer validation plus a separate representation-free transport validator and canonical bytes. `client` interprets the private Workflow address, while `@bpmn-lean/engine-api` exposes only public identity, an opaque locator, and the closed observation result. Revision state is not BPMN RuntimeState, and no layer reconstructs publication from Event History.

Flow-node occurrence publication is an additive sibling of committed execution publication rather than a field extension to it. The semantic core and Lean derive exact starts and completed or cancelled terminals at the same evaluator boundaries as E1 while retaining private pairing anchors outside the public wire. The Workflow validates both immutable successors from the retained head, samples its deterministic wall clock once per complete committed command batch, assigns public occurrence identity from E1 revision plus start index, and advances both accumulators before recording the command result. A separate pure Query uses the same complete-batch cursors. Product 2 consumes only the representation-free transport surface, transactionally projects each confirmed instance from its retained cursor, and aggregates one request-start exact-definition population or reports the whole result unavailable. It never reconstructs occurrence lifecycle or duration from E1 state differences, Temporal Event History, or platform ingestion time.

Product 2 may consume only the handle-free `@bpmn-lean/temporal-client/definition-start`, `@bpmn-lean/temporal-client/definition-schedule`, `@bpmn-lean/temporal-client/message-start`, `@bpmn-lean/temporal-client/process-work`, `@bpmn-lean/temporal-client/process-operations`, and `@bpmn-lean/temporal-client/execution-publication` entry points, and only through `platform/foundation/engine-gateway`. The gateway owns one lazy reusable concrete client connection and closes it with the server composition lifecycle. No other Product 2 package reaches the client package, Workflow code, Worker hosting, the product-1 runner, mutation Workflows, ephemeral servers, replay harnesses, or `@temporalio/testing`. This is dependency-closure isolation around the accepted Temporal investment, not a vendor-neutral abstraction.

For committed execution, the gateway passes the strict closed page to `operate`, which validates every page against the transactionally retained public head before atomically applying its contiguous suffix. The projection accepts byte-identical overlap, rejects changed overlap and gaps, and rebuilds only from authoritative revision zero. HTTP and the browser read that projection for one instance's History, current Diagram positions, and canonical export. No Product 2 owner reconstructs a record from Event History, state differences, audit, or a private host address.

## Product 2 dependency direction

```text
platform/apps/server
        |
        v
platform/modules/* ------> platform/foundation/*
        |                           |
        v                           v
platform/contracts       narrowed engine entry points

platform/apps/recovery-worker ---> platform/modules/* + platform/foundation/*
platform/apps/postgresql-migrate -> domain migration catalogs + postgresql-runtime
platform/apps/web -- HTTP only --> platform/apps/server
platform/workers/* ------ versioned contracts --> hosted effects
```

The rules are:

1. `apps/server`, `apps/recovery-worker`, and `apps/postgresql-migrate` compose modules and adapters but own no business rule.
2. `apps/web` is a public-API client. It does not import a module, foundation package, or server implementation.
3. A business module may depend on public platform contracts and narrowly scoped foundation packages.
4. A foundation package may not depend on a business module or application composition root.
5. Only the engine gateway may consume the engine's semantic contract, and it does so through narrowed public engine entry points.
6. A missing semantic fact stops at the engine gateway. No platform package derives it from Temporal Event History, state differences, or platform persistence.
7. Production Workers consume versioned request and result contracts. They do not import or enter the semantic core, mutate semantic state, or decide BPMN behavior.
8. Product 1 never imports `platform/` or `showcase/`.

## Applications

| Path | Ownership |
|---|---|
| `platform/apps/server/` | Node composition root for the public HTTP API in one explicit local or shared storage mode, module wiring, configuration, readiness, and optional static asset serving |
| `platform/apps/postgresql-migrate/` | Administrative composition root that applies the exact checksum-bound domain migration catalog with a dedicated credential; API and worker processes never migrate |
| `platform/apps/recovery-worker/` | Shared-mode composition root for the eleven bounded leased lifecycle, audit, and projection-recovery families; it exposes no HTTP surface |
| `platform/apps/web/` | React SPA and API client; feature folders may mirror modules but communicate only through HTTP |

Local mode remains deliberately small: one server process uses filesystem artifacts and SQLite, owns local startup recovery, and makes no horizontal claim. Shared mode runs two or more stateless API replicas and independently scalable Product 2 recovery-worker processes over one PostgreSQL 18 database at exact schema epoch 9. The migration command runs separately before either runtime starts. Shared API readiness checks PostgreSQL version, schema epoch, and engine connectivity without scanning domain populations; recovery-worker readiness adds one disposable lease. HTTP requests never perform fleet-wide Product 1 Query fan-out, and successful projection-backed reads expose their database-clock freshness bound. The web application remains a static bundle that an API replica may serve or an adopter may host separately. Temporal Workers retain their own deployment lifecycle and are not hidden inside a UI framework or server-side meta-framework.

The root `compose.yaml` is the evaluation distribution of this architecture, not another application owner. It runs the official pinned PostgreSQL and Temporal development images beside four project-built runtime targets: migration, Product 1 BPMN Worker, Product 2 API/web, and Product 2 recovery Worker. Compose admits the API only after migrations complete and the Product 1 Worker is healthy, exposes only the web/API origin, and retains PostgreSQL and Temporal state in named volumes. The recovery Worker refreshes projections before the API's maximum accepted read age, so a healthy background loop has headroom to replace a generation before public reads fail closed. Runtime stages copy pnpm-injected production package closures rather than the repository tree, run as the Node image's unprivileged user, and exclude Lean, Java, CIB Seven, research sources, showcases, and test harnesses. The migration role alone may create schema objects; runtime processes receive only the narrower data credential. This topology is an evaluation convenience and makes neither a production Temporal-deployment nor a capacity claim.

## Public contracts

`platform/contracts/` owns the transport-visible request, response, error, pagination, cursor, and event shapes of the public platform API. It contains no service implementation and no BPMN interpretation. Its deeply immutable shapes use the type-only `@bpmn-lean/contract-types` package, the sole neutral package shared by products 1 and 2. A later OpenAPI description, typed SDK, or event-subscription contract belongs here or is generated from this owner.

## Foundation packages

Foundation packages provide reusable infrastructure mechanisms and must not become a generic utility layer.

| Package | Ownership |
|---|---|
| `engine-gateway` | The four permitted engine-consumption kinds: compile, start, observe committed state, and submit a command |
| `artifact-store` | Exact artifact byte storage and retrieval through content identity; no compilation or version policy |
| `postgresql-runtime` | Product 2-only bounded pools, `READ COMMITTED` transaction and dedicated-session mechanics, database-clock access, and checksum-bound forward migration execution; no business schema or repository meaning |
| `recovery-runtime` | Product 2-only database-clock leases, token-fenced intermediate and final database applies, and bounded polling mechanics; no candidate identity, business recovery decision, gateway, or application lifecycle |
| `projection-runtime` | Generic cursoring, ordering, deduplication, reconciliation, and rebuild mechanics; no domain projection |
| `identity-policy` | Pluggable identity and platform authorization mechanisms |
| `audit` | Platform-owned actor, policy, and wall-clock audit facts, kept distinct from BPMN semantic history |
| `bpmn-definition-projection` | Product 2-only definition projection with one private parser graph: generated DI with killable layout, exact coverage validation, and closed provenance, plus an exact-source-bound closed Human Task catalog |

Create a foundation package only when its first real module needs it. A second consumer is normally required before extracting a general mechanism, except for the engine gateway and public trust boundaries whose separation is itself required.

## Business modules

Modules follow durable product capabilities rather than horizontal technical layers.

| Module | Ownership |
|---|---|
| `definitions` | Admission orchestration, definition metadata, version ordinals, deployment state, and assurance reports |
| `work` | Task discovery, claims, forms, authorization, human-work context, and later case work |
| `operate` | Instance operations, diagnosis, interventions, host diagnostics, and support evidence |
| `connect` | Worker, connector, evaluator, decision, secret-binding, and native Temporal interoperability governance |
| `lifecycle` | Package promotion, compatibility analysis, migration, repair, and bulk-job coordination |
| `intelligence` | Semantic-event export, operational analytics, version comparison, and mining integrations |
| `agents` | Agent registry, policy, evaluation, budgets, traces, and human approval |
| `administration` | Tenancy, identity integration, retention, backup, restore, hosting, and fleet administration |

`definitions` is instantiated for M1, `operate` for M2's confirmed-start Process-instance index and search service, M4's current incidents, durable operator actions, and action outbox, plus M5 E1's committed-execution projection, reconciliation, and publication routes, and `work` for M3's current-task aggregation, claims, typed completion, and audit delivery. The remaining names reserve ownership seams in this document; their directories and packages are created only when an accepted milestone or follow-on proposal needs them.

Each module owns its application service, domain-specific persistence ports, HTTP route contribution, and projections. `projection-runtime` supplies mechanics but never becomes the owner of every read model. This prevents `api/`, `projection/`, or `ui/` from becoming repository-wide catch-all packages as the product grows.

## User interface

`platform/ui-kit/` owns reusable accessible behavior and product styling, not business workflows. Business screens remain feature code in `apps/web` and call the same public HTTP API offered to external adopters.

The UI may share public contract types or a generated public client. It may not link a server service merely because both live in the same repository.

The implemented M3, M4, and M5 E1 surfaces use React Aria Components for accessible behavior, TanStack Table for native responsive collection row models, TanStack Query for bounded HTTP state, CSS Modules for feature-local styling, and shared CSS variables from the UI kit. M5 E1 mounts execution detail only after a fresh exact publication succeeds, renders each semantic revision separately from current multi-position Diagram highlighting, and downloads only the verified canonical bytes. Boolean completion is an explicit true-or-false choice so absence and null never collapse to false. No router, generalized form library, themed component framework, or virtualization is part of the selected slice.

The production bundle keeps the Work inbox eager and loads Definitions, Operations, About, their workspace-only HTTP clients, and Work task detail at the existing navigation or task-selection boundary. The structured form loads with a structured task detail. The bpmn-js viewer runtime and global viewer styles load only when a Diagram surface mounts; its marker and port contract remains lightweight and eager. A production-artifact guard enforces a sub-500 kB default Work static-import graph and rejects the viewer runtime in that graph without weakening the existing browser journeys, focus behavior, watermark, or license evidence.

The implemented `platform/foundation/bpmn-definition-projection/` Product 2 boundary privately owns the exact selected parser graph, returns only closed DI bytes with provenance or a closed exact-source-bound Human Task catalog, and has no semantic authority. It is the sole Product 2 exception to the semantic `bpmn-moddle` boundary: raw moddle values and generated non-DI XML may not escape it. Definitions owns digest-bound SQLite persistence, source-first diagram resolution, catalog projection at deployment, and their public consumers; the browser owns diagram rendering, exact task highlighting, provenance display, derived diagrammed-BPMN download, and structured form presentation. No Product 1 semantic, Lean, engine API, or Temporal gate may import this foundation package or invoke its Playwright acceptance.

Product 1 verification, Product 2 platform, showcase compatibility, and browser quality are separately selected CI lanes. A Product 2-only diff skips the unrelated two-operating-system Product 1 matrix while a stable aggregate check remains available to branch protection; shared manifest, lockfile, workspace, documentation, and mixed changes still select Product 1 verification. The browser lane never runs from `verify.sh`, a Lean/semantic-core/BPMN-source/CIB/differential gate, an ordinary Product 1 change, or the platform checkpoint. It builds the web dependency graph once, then reuses that bundle for package checks and fixed public-API Chromium evidence at 1280 and 1600 pixels. The exact same functional entry point runs locally before push and in GitHub Actions. A cross-boundary change selects independent jobs that GitHub can run concurrently instead of one wrapper serially rebuilding overlapping dependency graphs. M5 E1 adds path-scoped History and Diagram behavior to this lane. One wide Process Diagram screenshot remains an optional manually invoked human-review aid in the digest-pinned Linux Playwright environment, not a blocking regression gate. The M3 and M4 showcases separately retain real Temporal browser acceptance, and `test:release:m4` builds the shared Product 2 release graph once before the real-host witness and deterministic functional UI-quality lane.

The documentation screenshot project is separate from browser acceptance. It drives the running evaluation distribution only through accessible public UI landmarks, owns no web server or Docker lifecycle, and writes one exact ordered image catalog for the text-first walkthrough. A root orchestrator supplies a dynamic loopback origin and an isolated fresh-volume Compose project, then removes that project after capture. Regeneration runs only on explicit maintainer command, manual workflow dispatch, or a version tag and never becomes a blocking pixel-comparison lane.

Shared PostgreSQL correctness is a fifth independent Product 2 lane. It builds the union API, recovery-worker, and migration graph once, type-checks a source-mapped harness, then runs only nested real-database tests against isolated PostgreSQL 18 databases. Its separate workflow never adds PostgreSQL to ordinary package tests, the platform checkpoint, `verify.sh`, showcase compatibility, or browser quality.

## Showcases

`showcase/` contains executable acceptance gates organized by milestone, beginning with `showcase/m1-definition-deployment/` and currently extending through `showcase/m4-incident-operations/`. A showcase may configure and drive exact public production-package entry points, and may use private development-only test infrastructure when the milestone requires real hosting. It may not deep-import production internals, enter a production dependency graph, contain reusable production behavior, or expose a private alternative API.

## Architecture decision register

| ID | Decision | Rationale | Reopen condition |
|---|---|---|---|
| ARC-001 | Begin product 2 as a modular monolith with logical modules | Preserves atomic contract evolution and a small deployment without erasing ownership | A measured scaling, fault-isolation, or independent-release need cannot be met within the modular monolith |
| ARC-002 | Organize modules by business capability, not global technical layers | Keeps projections, routes, and persistence policy with their owning domain and avoids catch-all packages | Two implemented modules demonstrate a different shared ownership seam |
| ARC-003 | Keep `server` and `web` as composition roots | Makes deployables explicit while keeping business behavior independently testable | A second concrete deployable needs a distinct composition root |
| ARC-004 | Require the web application to use public HTTP only | Executably demonstrates that the public API is sufficient for an external client | Never for convenience; a different public transport requires its own adopted contract |
| ARC-005 | Keep generic projection mechanics in foundation and domain projections in modules | Separates delivery correctness from the meaning of task, operation, or intelligence rows | A proven projection is genuinely identical across two domain modules |
| ARC-006 | Put production Workers under `platform/workers/` and reserve `runners/` for external oracles | Preserves the product/evidence boundary and allows independent Worker deployment | A new repository-wide deployable category has a materially different lifecycle |
| ARC-007 | Instantiate directories only when active work needs them | Prevents an aspirational tree from being mistaken for implemented surface | A build or packaging tool requires an explicit generated workspace manifest |
| ARC-008 | Use Fetch-compatible module routes behind a Node HTTP adapter with no external transport library; deploy exact BPMN as a bounded raw XML body | Keeps route ownership with the domain module, preserves exact source bytes, and avoids adopting or hand-writing multipart machinery for a single-file M1 request | A required public operation needs multipart fields, resumable transfer, or another transport contract |
| ARC-009 | Confine `bpmn-js` to a viewer-only web adapter and retain its required visible bpmn.io watermark and exact license notice | Uses the mature BPMN DI renderer without granting browser parsing semantic authority or misrepresenting its license as MIT | Reopen if the renderer is replaced or the upstream license changes |
| ARC-010 | Build the static web client with React 19.2.8, React DOM 19.2.8, and development-only Vite 7.3.6, using plain CSS for the M1 workspace and no server-side meta-framework | Fits the HTTP-only static-client boundary, keeps build tooling out of production, and avoids selecting a component system before M1 needs one | Reopen when an accepted surface requires routing, a shared accessible component layer, or build behavior the current static composition cannot supply |
| ARC-011 | Make `packages/temporal-adapter/` a subsystem container of separate protocol, client, workflow, worker, runner, and testkit workspace packages with no production umbrella export | Isolates real execution environments and production dependency closures while keeping Temporal explicit as product-1 infrastructure; product 2 can use the client boundary without pulling Worker and test infrastructure into its server graph | A measured deployment or build constraint proves two adjacent packages have one inseparable lifecycle and dependency closure, or a new Temporal execution environment needs its own package |
| ARC-012 | Build M3 human work with React Aria Components, TanStack Table and Query, CSS Modules, and platform CSS variables, without a router, form library, component theme framework, or virtualization | Uses accessible behavior and standard table/request-state mechanics while keeping styling locally scoped and the HTTP-only static-client boundary intact | A measured UX or routing requirement cannot be met by the selected slice, or a shared theme package becomes independently necessary |
| ARC-013 | Confine generated diagram layout to a Product 2 presentation-foundation adapter and persist only exact-source-bound DI | Gives definitions without source DI a diagram without reserializing admitted source or granting presentation code semantic authority | A selected generator cannot preserve the closed DI-only boundary or a product requirement needs a different presentation format |
| ARC-014 | Keep headless Playwright in a path-filtered Product 2 UI-quality and showcase lane, outside `verify.sh` and all Product 1 semantic loops | Preserves fast, independent semantic work while making responsive and visual evidence mandatory for UI-facing changes and M3 release | Product boundaries or CI ownership change materially |
| ARC-015 | Split the static web bundle at workspace navigation, Work task selection, structured-detail, and Diagram mount boundaries | Measured composition showed that optional workspace clients, detail-only validation code, and bpmn-js dominated the original 809.89 kB entry; these boundaries reduce initial download and parsing without adding a router or changing a user journey | A measured startup trace, new default workspace, or prefetch requirement shows that another boundary materially improves the complete initial route |
| ARC-016 | Keep one local single-node mode and one PostgreSQL 18 shared mode, with a separate migration command and eleven-family recovery-worker application | Removes node-local Product 2 persistence and request-time fleet fan-out while retaining the modular monolith, domain repository ownership, and the ordinary database-free inner loop | Reopen before a second database, hybrid storage, changed freshness contract, unbounded artifact class, read-replica authority, or service extraction |

## Verification

The product-boundary guard discovers current and future source files plus package manifests rather than comparing hand-maintained package lists or prefixes. It resolves exact workspace package names and subpaths to their owning repository paths before applying the same dependency matrix used for relative imports. It rejects platform source outside an approved owner; internal platform imports that violate the dependency graph, including a web-to-service import; product-1 imports into `platform/`; platform deep imports into engine internals; public engine imports outside the engine gateway; showcase deep imports into engine internals; platform Event History imports; production imports of showcase evidence; and production JUEL placement under `runners/`. Exact public engine package roots are permitted from showcase evidence only. Malformed or duplicate package identities fail closed, and each prohibited class carries a planted violation in the guard's own tests.

The engine complete gate remains runnable without building the platform tree. Platform packages receive their own focused, showcase, browser, and PostgreSQL gates. CI maintains the independent M1, M2, M3, and M4 acceptance floors without making the platform a dependency of the engine verifier. The explicit PostgreSQL 18 lane proves schema epoch 9, two API replicas, two disjoint recovery workers with lease-loss reclaim, bounded large-population readiness, exact cross-replica definitions and structured Work, and the domain-owned repository, recovery, audit, suffix, and freshness contracts without claiming throughput or capacity.

The evaluation distribution has a cheap database-free structural guard plus an explicit Docker smoke gate. The structural guard owns the closed service topology, migration completion dependency, runtime closure packaging, ignored build context, separate database privileges, and manual-or-tagged Ubuntu workflow. The Docker smoke builds all four runtime images, starts the health-gated stack, and probes only the public origin. It is release or manual evaluation evidence and does not enter ordinary package, Product 1, platform, or browser inner loops.
