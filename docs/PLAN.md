# Plan

This file owns immediate execution order, blockers, current measured evidence, and the exact resume action. Durable decisions, implementation detail, semantic meaning, and test procedure belong in their linked owners. Completed work leaves this file after its current consequence has an owner; Git retains history.

## Current checkpoint

M0 through M6 and Horizon 1 are closed. Horizon 2 Product 1 Workflow-chain work has implemented production enrollment, handle-free start, content-bound recovery, closed v1 terminal receipts, private paired E1/E2 traversal, and recovery, semantic-candidate, command-ingress, effect, retained-Run, and pending-Timer capacity. Query, terminal, Event History, aggregate, Run, deployment, forced Message/Timer/effect rollover, and closure evidence remain open in the [Workflow-chain proposal](TEMPORAL-WORKFLOW-CHAIN-BOUNDS-PROPOSAL.md) and [Temporal hosting map](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md).

The owner has temporarily overridden that sequence to implement the approved agent documentation control plane. This documentation-only increment changes no Horizon 2 order, capacity policy, BPMN meaning, product contract, proof boundary, runtime behavior, or evidence claim.

## Ordered work

Exactly one stable work ID is active. Required maps are part of the routing contract, not descriptive tags.

1. `DOC-CONTROL-PLANE` · **active** · Owner: [approved proposal](AGENT-DOCUMENTATION-CONTROL-PLANE-PROPOSAL.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [platform](BPM-PLATFORM-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md). Split the two universal documents without changing claims, prove the migration, obtain cold closure review, delete the one-off proposal, then restore Horizon 2 as active.
2. `H2-WORKFLOW-CHAIN` · **queued** · Owner: [Workflow-chain proposal](TEMPORAL-WORKFLOW-CHAIN-BOUNDS-PROPOSAL.md) · Map: [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md). Complete the remaining Query, terminal, Event History, aggregate, Run, deployment, forced-rollover, and closure matrix.
3. `INTERCHANGE-ADMISSION` · **queued** · Owners: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [corpus research](research/EXECUTABLE-BPMN-MODEL-CORPUS-RESEARCH.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md). Admit high-leverage standard DI, lanes, Collaboration presentation, documentation, and safe inert metadata as execute, preserve, or reject.
4. `SEQUENTIAL-MULTI-INSTANCE` · **queued** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md). Specify bounded sequential iteration, identity, data, completion, cancellation, progress, replay, and output aggregation.
5. `PARALLEL-MULTI-INSTANCE` · **queued** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md). Add bounded concurrent ownership, completion conditions, deterministic aggregation, races, cancellation, replacement, and replay.
6. `DATA-AND-TASK-MECHANISMS` · **queued** · Owners: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [minimal engine research](research/MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md). Broaden standard data lifetime and mappings before selecting executable Task profiles and host effects.
7. `EVENT-SUBSCRIPTIONS` · **queued** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md). Generalize subscription lifetime, correlation, payload, cancellation, deterministic races, and scope handlers.
8. `COMPENSATION-TRANSACTIONS` · **queued** · Owner: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md). Specify completed-work registration, snapshots, handler ordering, cancellation, failure, and replay.
9. `H3-WORKLOAD-ISOLATION` · **queued** · Owner: [scalability roadmap](TEMPORAL-BPMN-EXECUTION-SCALABILITY-PROPOSAL.md) · Maps: [Temporal](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [platform](BPM-PLATFORM-IMPLEMENTATION-MAP.md). Prove queue and Worker isolation, backpressure, fairness, failover, observability, capacity, and cost.
10. `CONFORMANCE-CLOSURE` · **later** · Owners: [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [conformance target](BPMN-CONFORMANCE-TARGET.md) · Maps: [contracts/source](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [runtime/proof](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [assurance/adoption](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md). Continue Process Execution closure by normative dependency, semantic risk, practical reach, and the adopted [showcase ladder](SHOWCASE-MILESTONE-LADDER-DECISION.md#showcase-milestone-ladder).

## Current evidence

The latest complete repository gate is the 2026-08-16 M6 closure run at exit 0. It covered Lean, the semantic core, BPMN source, shared contracts and canonical bytes, CIB targets, differential comparison, Temporal adapter tests and history replay, Product 2 package evidence, and the registered pipeline. This correctness result does not establish production scalability.

The last uncontended comparable warm-pipeline baselines remain 15,986.670 ms for 30 cases at `13cdec8` and 13,476 ms for 28 cases at `ac2813c`. No uncontended baseline exists for the later catalogs, so a new measurement must be interpreted against the per-case trend and must not replace these merely because it passed.

For the active documentation increment, the immutable proposal target is `be62f0c`; two correction rounds closed at `3b58c68`, and owner adoption is recorded at `4964b83`. The focused pre-implementation governance gate passed 39/39. The complete wrapper attempt was bounded at 60 seconds and reached later package tests before the outer bound expired, so it is not recorded as a complete green result.

## Exact resume point

Active work ID: `DOC-CONTROL-PLANE`.

Next action: finish the five-map claim migration and executable routing/status/matrix guards, then validate the claim-granular matrix against baseline `b5a2f1a` and the committed closure target. The required oracle is the focused documentation suite, matrix validator, `./scripts/verify.sh`, `git diff --check`, and a context-cold closure review.

Stop if a baseline implementation, absence, proof, evidence, product, or semantic claim has no single verified destination; if routing cannot cover a tracked or pending implementation-bearing path without hidden agent knowledge; if a new dependency is required; or if the migration would change Horizon 2 ordering or any governed product or semantic contract.
