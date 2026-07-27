# Semantic capsules

This directory contains bounded project-owned semantic proposals and specifications. A capsule states one semantic question, its normative and oracle basis, admitted model and runtime distinctions, public observations, commands, laws, checked non-laws, separating witnesses, and explicit exclusions. An unimplemented capsule remains `-PROPOSAL`; it graduates to `-SPEC` only with its implemented current contract under [the documentation discipline](../DOC-DISCIPLINE.md#proposal-graduation).

A capsule does not own implementation sequencing, live completion status, test procedures, or host-specific transport mechanics. Those belong respectively to [the plan](../PLAN.md), [the implementation map](../IMPLEMENTATION-MAP.md), [the testing guide](../TESTING-SPEC.md), and the relevant adapter decision or research document.

## Required capsule structure

Every new capsule records:

1. its exact question, status, normative clauses, profile decisions, and exclusions;
2. the applicable normative-agreement, permitted-operational-detail, interpretation, extension, configuration, limitation, or deviation classification from the [CIB–BPMN relationship register](../CIB-BPMN-RELATION-REGISTER.md);
3. stable identifiers for each material semantic rule;
4. the smallest separating positive and negative witnesses;
5. source/admission, definition, runtime, command, stable-state, and observation distinctions;
6. a declarative Lean transition relation and an executable evaluator for every new runtime-transition family;
7. a checked soundness bridge from every evaluator-produced transition to the relation;
8. useful laws with exact hypotheses and the nearest plausible checked non-law;
9. a rule-to-evidence matrix that keeps BPMN/profile, Lean, CIB, TypeScript, Temporal, negative-witness, and mutation claims separate;
10. an inventory of runtime-only or synthetic constructs, including derivation, ownership, public projection, and lifecycle invariants;
11. exact unsupported claims, common-mode risks, and versioning consequences.

Completeness, determinism, liveness, fairness, compiler correspondence, TypeScript correspondence, and Temporal refinement are never implied by evaluator soundness. Record and check each only when its exact scope is meaningful.

## Stable rule identities

A rule identifier uses a capsule-specific uppercase prefix, a semantic topic, and a two-digit sequence, for example `UTASK-COMPLETE-01`. It identifies one proposition, not a source location, theorem name, function, test, or serialized command.

Editorial clarification and evidence-link maintenance retain the identifier. A materially changed proposition receives a new identifier; do not renumber or reuse retired identifiers. Rule identifiers remain documentation traceability unless a concrete consumer justifies a separately versioned wire representation.

Start with a Markdown evidence matrix inside the owning capsule. Do not introduce a manifest, generator, or universal semantic language without named consumers and evidence that the boundary replaces repeated semantic structure. The bounded [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md) is justified by the sequential and parallel topologies and remains governed by its stop criteria.

## Registry

| Capsule | Status and scope |
|---|---|
| [User Task interaction](USER-TASK-INTERACTION-SPEC.md) | Evidence-closed draft for one structured User Task occurrence, exact discovery projection, and exact completion admission; not an immutable compatibility profile |
| [Parallel fork/join](PARALLEL-FORK-JOIN-SPEC.md) | Evidence-closed draft contract for two concurrent distinct User Tasks and normative per-incoming-flow synchronization; the production Temporal lifecycle and immutable negative evidence for candidate `CIB-DEV-0001` remain outside its claim |
| [Intermediate Catch Timer](INTERMEDIATE-CATCH-TIMER-SPEC.md) | Exact `PT1S` normal-flow timer wait, logical deadline and occurrence identity, full-identity/time refusal, controlled-clock CIB evidence, durable Temporal wakeup, Worker restart, and replay |
| [Service Task effect](SERVICE-TASK-EFFECT-SPEC.md) | Evidence-closed draft for one payload-free extension-bound Service Task, structured effect intent, success completion, retry reconciliation, durable Temporal Activity execution, and explicit CIB host-realization fidelity |
| [CreateDocument data and mapping](CREATE-DOCUMENT-DATA-PROPOSAL.md) | Proposed A12 target capsule for one string literal input, Activity-local result patch, output mapping, Process-variable projection, and success-only CIB/Temporal transaction classification; owner decision required |
