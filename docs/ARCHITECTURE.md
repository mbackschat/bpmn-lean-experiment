# Architecture

## Status

**Owner-approved current implementation architecture.** This document owns the concrete repository layout, modular-monolith shape, package dependency direction, composition roots, and architecture decision register for products 1 and 2. It does not own product scope, BPMN meaning, implementation status, or work order.

## Responsibility split

[PROJECT-DESIGN.md](PROJECT-DESIGN.md) owns why the products, semantic authorities, and one-way product boundary exist. [The BPM platform proposal](BPM-PLATFORM-PROPOSAL.md) owns what the first platform product must provide. This document owns how source packages realize those decisions. [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) records which parts exist, and [PLAN.md](PLAN.md) records what comes next.

Local directory `README.md` files state only the ownership and dependency rules of their subtree. They link here instead of copying the complete layout or decision register.

## Architectural style

Product 2 begins as a modular monolith. Its services are logical modules with explicit package boundaries, composed into a small number of deployable applications. They are not independently deployed microservices merely because their source is separated.

The modular monolith keeps atomic engine-to-platform contract changes possible, permits a small self-hosted deployment, and leaves domain modules independently testable and extractable if measured scaling or deployment isolation later requires it. Network boundaries are introduced only for public HTTP clients, Temporal-hosted work, or independently deployed Workers whose lifecycle already differs.

## Repository map

```text
packages/                         product 1 TypeScript engine packages
BpmnSemantics/                    product 1 Lean reference
profiles/ scenarios/ contracts/   product 1 semantic artifacts
runners/                          product 1 adapters to external executable oracles

platform/                         product 2 modular monolith
  apps/                           deployable composition roots
  contracts/                      public transport and event contracts
  foundation/                     reusable product-2 infrastructure mechanisms
  modules/                        business-capability modules
  ui-kit/                         shared accessible visual components
  workers/                        independently deployed production Workers

showcase/                         product 2 executable milestone acceptance gates
```

`runners/` is reserved for evidence adapters to independent executable oracles. Production Workers belong under `platform/workers/`; in particular, the deferred JUEL evaluator belongs under `platform/workers/juel-evaluator/`, never beside the CIB Seven oracle runner.

## Product 2 dependency direction

```text
platform/apps/server
        |
        v
platform/modules/* ------> platform/foundation/*
        |                           |
        v                           v
platform/contracts       narrowed engine entry points

platform/apps/web -- HTTP only --> platform/apps/server
platform/workers/* ------ versioned contracts --> hosted effects
```

The rules are:

1. `apps/server` composes modules and adapters but owns no business rule.
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
| `platform/apps/server/` | Node composition root for the public HTTP API, module wiring, configuration, and optional static asset serving |
| `platform/apps/web/` | React SPA and API client; feature folders may mirror modules but communicate only through HTTP |

The first deployment is deliberately small. The server is one modular-monolith process. The web application is a static bundle that the server may serve or an adopter may host separately. Temporal Workers retain their own deployment lifecycle and are not hidden inside a UI framework or server-side meta-framework.

## Public contracts

`platform/contracts/` owns the transport-visible request, response, error, pagination, cursor, and event shapes of the public platform API. It contains no service implementation and no BPMN interpretation. A later OpenAPI description, typed SDK, or event-subscription contract belongs here or is generated from this owner.

## Foundation packages

Foundation packages provide reusable infrastructure mechanisms and must not become a generic utility layer.

| Package | Ownership |
|---|---|
| `engine-gateway` | The four permitted engine-consumption kinds: compile, start, observe committed state, and submit a command |
| `artifact-store` | Exact artifact byte storage and retrieval through content identity; no compilation or version policy |
| `projection-runtime` | Generic cursoring, ordering, deduplication, reconciliation, and rebuild mechanics; no domain projection |
| `identity-policy` | Pluggable identity and platform authorization mechanisms |
| `audit` | Platform-owned actor, policy, and wall-clock audit facts, kept distinct from BPMN semantic history |

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

Only `definitions` is instantiated for M1. The remaining names reserve ownership seams in this document; their directories and packages are created only when an accepted milestone or follow-on proposal needs them.

Each module owns its application service, domain-specific persistence ports, HTTP route contribution, and projections. `projection-runtime` supplies mechanics but never becomes the owner of every read model. This prevents `api/`, `projection/`, or `ui/` from becoming repository-wide catch-all packages as the product grows.

## User interface

`platform/ui-kit/` owns reusable accessible behavior and product styling, not business workflows. Business screens remain feature code in `apps/web` and call the same public HTTP API offered to external adopters.

The UI may share public contract types or a generated public client. It may not link a server service merely because both live in the same repository.

## Showcases

`showcase/` contains executable acceptance gates organized by milestone, beginning with `showcase/m1-definition-deployment/`. A showcase may configure and drive production packages but contains no reusable production behavior and no private alternative API.

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

## Verification

The product-boundary guard discovers current and future source files plus package manifests rather than comparing hand-maintained package lists or prefixes. It resolves exact workspace package names and subpaths to their owning repository paths before applying the same dependency matrix used for relative imports. It rejects platform source outside an approved owner; internal platform imports that violate the dependency graph, including a web-to-service import; product-1 imports into `platform/`; platform deep imports into engine internals; public engine imports outside the engine gateway; platform Event History imports; production imports of showcase evidence; and production JUEL placement under `runners/`. Malformed or duplicate package identities fail closed, and each prohibited class carries a planted violation in the guard's own tests.

The engine complete gate remains runnable without building the platform tree. Platform packages receive their own focused and showcase gates as implementation lands.
