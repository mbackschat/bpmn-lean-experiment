# BPMN Lean Experiment — Proto-MVP Reviewer's Guide

## Status

**Maintained navigational review aid. Only the sections retained below were verified, at repository revision `dfd2ac3`; the explanatory and evaluative material this guide previously carried was moved or removed on 2026-08-03 and is not re-verified here.**

> [!IMPORTANT]
> This file routes a reviewer to owners. It is not an implementation map, semantic specification, test catalog, or roadmap. For current truth, start with [PLAN.md](PLAN.md), [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md), and [TESTING-SPEC.md](TESTING-SPEC.md).

## Scope of this guide, and where the rest went

This guide deliberately contains **no inventory, no counts, and no architecture narrative**. Each of those has exactly one owner, and a second copy here drifted from its owner within a day of being written.

| What you want | Where it lives |
|---|---|
| Exact implemented and absent surfaces, with every count | [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) |
| The executable demonstration and its actual case, mutation, and replay results | [complete differential/refinement pipeline](TESTING-SPEC.md#complete-differentialrefinement-pipeline) |
| Current checkpoint, ordered work, and the outstanding mechanism queue | [PLAN.md](PLAN.md) |
| Mission, authority model, layering, and independence boundary | [PROJECT-DESIGN.md](PROJECT-DESIGN.md) |
| The governed review protocol, verdict contract, and receipts | [TESTING-SPEC.md](TESTING-SPEC.md#independent-cold-review-gate) |
| Architecture explanation, feasibility assessment, and an informal reviewer checklist | the separate [assessment record](https://github.com/mbackschat/bpmn-lean-experiment-assessment) |

The moved material has specific destinations in that assessment record:

| Moved from this guide | New location |
|---|---|
| Ten things to know before evaluating; the A–H evaluation framework; red flags that merit a required finding | [17 — How to review this project](https://github.com/mbackschat/bpmn-lean-experiment-assessment/blob/main/17-how-to-review.md) |
| Motivation, product direction, and layering background | [00 — Background for newcomers](https://github.com/mbackschat/bpmn-lean-experiment-assessment/blob/main/00-background.md) |
| Core design decisions, the IL, and the independent core | [05](https://github.com/mbackschat/bpmn-lean-experiment-assessment/blob/main/05-semantic-core-and-il.md) and [06](https://github.com/mbackschat/bpmn-lean-experiment-assessment/blob/main/06-typescript-core-correctness.md) |
| The bytes-to-replayed-evidence walkthrough | [10 — Case study](https://github.com/mbackschat/bpmn-lean-experiment-assessment/blob/main/10-case-study.md) and [07 — the Temporal adapter](https://github.com/mbackschat/bpmn-lean-experiment-assessment/blob/main/07-temporal-adapter.md) |
| Risks, challenges, and what the evidence establishes | [02](https://github.com/mbackschat/bpmn-lean-experiment-assessment/blob/main/02-evidence-and-lanes.md), [04](https://github.com/mbackschat/bpmn-lean-experiment-assessment/blob/main/04-feasibility.md), and [11](https://github.com/mbackschat/bpmn-lean-experiment-assessment/blob/main/11-open-questions.md) |

That record is explanatory and evaluative, maintained against a named commit of this tree, and **not authoritative**: the documents above own every claim.

## Who this guide is for

Reviewers and stakeholders who need to decide whether the project has established a credible semantic and durable-execution architecture, whether its available capabilities match its evidence, and whether the remaining work can safely reuse the current foundations. It assumes familiarity with BPMN concepts but not with Lean or Temporal internals.

A useful review answers four questions separately:

1. Is each selected BPMN meaning normatively defensible and honestly bounded?
2. Does the Lean account express that meaning and establish useful laws rather than only fixture equality?
3. Does the TypeScript core independently transcribe the selected account without importing host or vendor behavior?
4. Does the Temporal adapter preserve the core's public outcomes under durability, retry, restart, and replay rather than defining BPMN meaning itself?

## Suggested review route

For a management and architecture review:

1. Read [PROJECT-DESIGN.md](PROJECT-DESIGN.md), especially the layered architecture, authority model, Lean rationale, and independence boundary.
2. Read [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) for the exact implemented and absent surfaces.
3. Read the [Proto-MVP milestone](PLAN.md#reviewer-proto-mvp-milestone) and current checkpoint in [PLAN.md](PLAN.md).
4. Use the [capsule registry](capsules/README.md) to inspect the specifications governing any capability you probe; the representative walkthrough is owned by the [Call Activity specification](capsules/CALL-ACTIVITY-SPEC.md).
5. Inspect the complete target and mutation requirements in [TESTING-SPEC.md](TESTING-SPEC.md#complete-differentialrefinement-pipeline).

For an executable review from the repository root:

```bash
./scripts/doctor.sh verify
env CI=true ./scripts/pnpm.sh run test:infrastructure
env CI=true ./scripts/pnpm.sh run test:pipeline
```

The pipeline starts a disposable local Temporal server and therefore requires the environment's normal host port-binding authorization. Under known external CPU contention, an explicitly declared `BPMN_PIPELINE_WARM_BUDGET_MS` override may establish correctness but must not replace the default uncontended performance baseline.

For a complete release-style development gate:

```bash
./scripts/verify.sh
```

Reviewers should run focused semantic or adapter gates first when investigating a static finding, then run the complete wrapper once after corrections are integrated. Repeating full gates in every implementation or review lane wastes time and CPU without increasing independence.

## Repository map for deeper inspection

| Concern | Primary owner |
|---|---|
| Mission and architecture | [PROJECT-DESIGN.md](PROJECT-DESIGN.md) |
| Current implementation and absences | [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) |
| Current sequence and resume point | [PLAN.md](PLAN.md) |
| BPMN requirement dispositions | [BPMN-REQUIREMENT-LEDGER.md](BPMN-REQUIREMENT-LEDGER.md) |
| Shared checked graph and IL | [SEMANTIC-PROCESS-IL-SPEC.md](SEMANTIC-PROCESS-IL-SPEC.md) and [`semantic-process-contract.ts`](../packages/semantic-core/src/semantic-process-contract.ts) |
| Topology-independent admission and profile capability | [PROFILE-PARAMETERIZED-ADMISSION-SPEC.md](PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) |
| Lean semantics | [`BpmnSemantics/SemanticProcess`](../BpmnSemantics/SemanticProcess) |
| TypeScript semantic core | [`packages/semantic-core`](../packages/semantic-core) |
| BPMN ingestion | [`packages/bpmn-source`](../packages/bpmn-source) and [BPMN-XML-INGESTION-DECISION.md](BPMN-XML-INGESTION-DECISION.md) |
| Temporal lifecycle | [TEMPORAL-PROCESS-LIFECYCLE-SPEC.md](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) and [`packages/temporal-adapter`](../packages/temporal-adapter) |
| Runnable product command | [RUNNABLE-TEMPORAL-MVP-SPEC.md](RUNNABLE-TEMPORAL-MVP-SPEC.md) |
| Differential comparison | [`packages/differential`](../packages/differential) |
| Profiles and answer-free scenarios | [`profiles`](../profiles) and [`scenarios`](../scenarios) |
| Wire schemas | [`contracts`](../contracts) |
| CIB classifications | [CIB-BPMN-RELATION-REGISTER.md](CIB-BPMN-RELATION-REGISTER.md) |
| Test and review protocol | [TESTING-SPEC.md](TESTING-SPEC.md) |
| Commit-bounded capsule cost | [CAPSULE-COST-LEDGER.md](CAPSULE-COST-LEDGER.md) |

## What a positive review may and may not conclude

A positive review may approve **the demonstrated architecture and the exact implemented slices**. It may not infer general BPMN execution, broad CIB compatibility, Process Execution conformance, or production readiness.

Breadth remains profile-bounded, the requirement denominator is not exhaustive, and several evidence lanes share the TypeScript source producer. [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) states each of those boundaries exactly; this guide does not restate them.
