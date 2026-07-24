# Semantic capsules

This directory contains bounded project-owned semantic specifications. A capsule states one semantic question, its normative and oracle basis, admitted model and runtime distinctions, public observations, commands, laws, checked non-laws, separating witnesses, and explicit exclusions.

A capsule does not own implementation sequencing, live completion status, test procedures, or host-specific transport mechanics. Those belong respectively to [the plan](../PLAN.md), [the implementation map](../IMPLEMENTATION-MAP.md), [the testing guide](../TESTING.md), and the relevant adapter decision or research document.

## Required capsule structure

Every new capsule records:

1. its exact question, status, normative clauses, profile decisions, and exclusions;
2. stable identifiers for each material semantic rule;
3. the smallest separating positive and negative witnesses;
4. source/admission, definition, runtime, command, stable-state, and observation distinctions;
5. a declarative Lean transition relation and an executable evaluator for every new runtime-transition family;
6. a checked soundness bridge from every evaluator-produced transition to the relation;
7. useful laws with exact hypotheses and the nearest plausible checked non-law;
8. a rule-to-evidence matrix that keeps BPMN/profile, Lean, CIB, TypeScript, Temporal, negative-witness, and mutation claims separate;
9. an inventory of runtime-only or synthetic constructs, including derivation, ownership, public projection, and lifecycle invariants;
10. exact unsupported claims, common-mode risks, and versioning consequences.

Completeness, determinism, liveness, fairness, compiler correspondence, TypeScript correspondence, and Temporal refinement are never implied by evaluator soundness. Record and check each only when its exact scope is meaningful.

## Stable rule identities

A rule identifier uses a capsule-specific uppercase prefix, a semantic topic, and a two-digit sequence, for example `UTASK-COMPLETE-01`. It identifies one proposition, not a source location, theorem name, function, test, or serialized command.

Editorial clarification and evidence-link maintenance retain the identifier. A materially changed proposition receives a new identifier; do not renumber or reuse retired identifiers. Rule identifiers remain documentation traceability unless a concrete consumer justifies a separately versioned wire representation.

Start with a Markdown evidence matrix inside the owning capsule. Do not introduce a manifest, generator, or semantic DSL until at least a second structurally distinct capsule demonstrates measurable drift that such infrastructure would prevent.

## Registry

| Capsule | Status and scope |
|---|---|
| [User Task interaction](USER-TASK-INTERACTION.md) | Evidence-closed draft for one structured User Task occurrence, exact discovery projection, and exact completion admission; not an immutable compatibility profile |
