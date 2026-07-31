# Semantic capsules

This directory contains bounded project-owned semantic proposals and specifications. A capsule states one semantic question, its normative and oracle basis, admitted model and runtime distinctions, public observations, commands, laws, checked non-laws, separating witnesses, and explicit exclusions. An unimplemented capsule remains `-PROPOSAL`; it graduates to `-SPEC` only with its implemented current contract under [the documentation discipline](../DOC-DISCIPLINE.md#proposal-graduation).

A capsule does not own implementation sequencing, live completion status, test procedures, or host-specific transport mechanics. Those belong respectively to [the plan](../PLAN.md), [the implementation map](../IMPLEMENTATION-MAP.md), [the testing guide](../TESTING-SPEC.md), and the relevant adapter decision or research document.

Capsules are mechanism-led rather than model-led. Every rule must say whether it belongs to the vendor-neutral BPMN account, a selected CIB Seven compatibility overlay, or a downstream adoption fixture. A representative vertical capsule may contain all three when that is the smallest way to prove a new seam, but it must keep the rules and evidence separate. Once a mechanism is established, another target model that only reuses it belongs in profile/adoption configuration and regression evidence rather than a new semantic implementation.

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
11. the layer ownership of every rule and whether any target-shaped fixture is a one-time vertical feasibility witness or a reusable semantic mechanism;
12. exact unsupported claims, common-mode risks, and versioning consequences;
13. for any admission widening, the newly reachable stable-state resumption account and the separate adapter host-capability obligation for every reachable wait-set shape.

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
| [CreateDocument data and mapping](CREATE-DOCUMENT-DATA-SPEC.md) | Implemented vertical feasibility slice for reusable string-variable/mapping/effect-result mechanisms plus one exact A12 source-admission boundary; not a per-model adoption template |
| [Typed BPMN Error and interrupting boundary error](BOUNDARY-ERROR-SPEC.md) | Implemented bounded vertical slice separating standard exact-code interrupting Error behavior, a CIB-specific caught-path mapping extension, and an A12-shaped downstream fixture |
| [Scoped runtime data](SCOPED-DATA-SPEC.md) | Implemented atomic replacement of flat runtime variables with explicit Process and complete-effect-occurrence-owned Activity-local scopes, Process-only public observation, and targeted closure/selector guards |
| [Exclusive Gateway conditional routing](EXCLUSIVE-GATEWAY-CONDITION-SPEC.md) | Evidence-closed draft for two-condition-plus-default routing with strict explicit-language admission, dependency-free Simple Boolean evaluation in Lean and TypeScript, XML Sequence Flow declaration order, pure internal closure, and Temporal replay/bypass evidence |
| [Intermediate Catch Message](INTERMEDIATE-CATCH-MESSAGE-PROPOSAL.md) | Owner-approved implementation proposal for one directly addressed, payload-free Intermediate Catch Message subscription under profile-multiset/generic-graph admission, Signal result recovery, four-kind canonical ordering, and exact Signal history; throw, Message Flow, key correlation, and CIB message compatibility remain excluded |
