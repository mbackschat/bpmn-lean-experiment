# Implementation map

This repository-wide map is the mandatory implementation-status router. Read it after [PLAN.md](PLAN.md), then read every detail map named by the active work item or resolved target paths. Exact family status, evidence, and absences live only in the routed detail maps.

## Current claim

The repository contains two separate MIT products: a bounded BPMN 2.0.2 execution engine hosted on Temporal and a downstream BPM platform. M1 through M6 and Horizon 1 shared Product 2 persistence are closed. Horizon 2 Workflow-chain bounds are active. The engine admits exact BPMN bytes only through guarded profiles, executes project-owned Semantic Process programs through Lean and an independently written pure TypeScript core, and uses Temporal only for durable hosting.

The platform consumes the engine's published compile, start, observation, and command contracts. It does not derive BPMN facts from Temporal Event History or its own store. Local platform mode remains single-node; shared mode uses PostgreSQL 18 with replicated API and bounded recovery-worker composition. The evaluation distribution is not a production-capacity claim.

This is not a general BPMN engine, an OMG Process Execution Conformance result, a broad CIB compatibility claim, a production CIB deployment baseline, or a production scale result. Exact implemented and absent surfaces are routed below.

## Routing

| Area ID | State | Detail map | Source-path families |
|---|---|---|---|
| `ENGINE-CONTRACTS-SOURCE` | `implemented` | [Engine contracts and source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md) | `contracts/`, `profiles/`, `packages/contract-types/`, `packages/bpmn-source/`, `packages/engine-api/`, routed `docs/` and root documentation |
| `ENGINE-RUNTIME-PROOF` | `implemented` | [Engine runtime and proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md) | `BpmnSemantics/`, `packages/semantic-core/`, root Lean entry points, routed `docs/` and root documentation |
| `TEMPORAL-HOSTING` | `active` | [Temporal hosting](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) | `packages/temporal-adapter/`, `packages/engine-api/`, `examples/temporal-mvp/`, deployment roots, routed `docs/` and root documentation |
| `BPM-PLATFORM` | `implemented` | [BPM platform](BPM-PLATFORM-IMPLEMENTATION-MAP.md) | `platform/`, `showcase/`, `workers/`, deployment roots, routed `docs/` and root documentation |
| `ASSURANCE-ADOPTION` | `implemented` | [Assurance and adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) | `adoption/`, `model-corpus/`, `packages/differential/`, `runners/`, `scenarios/`, `scripts/`, root tooling, root Lean entry points, routed `docs/` and root documentation |

The executable inventory conservatively routes an overridden or newly named `docs/` path to all five maps; an active work entry or an explicitly named area may narrow that set by subject. It independently covers tracked and pending implementation-bearing paths and must agree with this table.

## Cross-area invariants

- BPMN execution core, selected CIB compatibility overlay, and BPM platform remain dependency-ordered. Lower layers never import or encode a higher-layer product assumption.
- BPMN requirement coverage, selected CIB profile coverage, executable-corpus reach, and platform milestone coverage remain separate measures. No successful lane is evidence for another.
- Exact source, profile, definition, semantic-instance, and host-runtime identities remain distinct. Temporal Workflow and Run identity are private hosting facts.
- The pure semantic core performs no I/O and imports no Temporal, CIB, or platform code. Temporal adds durability without defining BPMN-visible behavior.
- Product 2 consumes only published engine facts and occurrence identities. A missing fact is routed to an engine requirement rather than reconstructed downstream.
- A12 Workflows remains an optional external adoption input under EUPL-1.2. No A12 source, runtime, dependency, or product decision enters the MIT engine or platform.
- No implementation or evidence claim exceeds its exact profile, environment, observation boundary, retained oracle, and executable gate.
