# CLAUDE.md

Guidance for working in **bpmn-lean-experiment**, a versioned CIB Seven semantic-profile, executable Lean reference-interpreter, pure TypeScript reducer, Temporal adapter, and continuous-assurance experiment.

## Start here

Read the complete [architecture and assurance handoff](docs/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md) and the project’s [BPMN conformance target](docs/BPMN-CONFORMANCE-TARGET.md) before changing semantic boundaries. Use [docs/README.md](docs/README.md) as the documentation registry, [docs/IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md) for exact implemented scope, and [docs/PLAN.md](docs/PLAN.md) for the current checkpoint and unresolved decisions.

## Current phase

The project is in Phase 0: profile and oracle calibration. The existing Lean code is only profile-independent contract vocabulary. It is not BPMN execution semantics and supplies no CIB Seven compatibility evidence.

The ultimate normative goal is full OMG BPMN 2.0.2 Process Execution Conformance for a Temporal-hosted adapter that imports BPMN Process diagrams, including their definitional Collaboration. Do not call this “BPMN Complete Conformance,” which also requires Process Modeling, BPEL Process Execution, and Choreography Modeling conformance.

Do not implement profile-dependent behavior until the relevant decision is approved and recorded. Never silently choose an oracle release, feature interpretation, expression subset, observation boundary, scheduling policy, listener scope, or external-effect contract.

## Authority and independence

1. BPMN 2.0.2 and its normative machine-readable artifacts are authoritative for BPMN syntax, metamodel, and Process Execution Conformance.
2. An approved immutable semantic profile is the compatibility authority for one declared target.
3. Lean is the formal semantic authority for that profile’s explicit operational meaning.
4. The pinned complete CIB Seven engine is the executable behavioral oracle for the declared CIB compatibility profile.
5. The pure TypeScript reducer must not depend on CIB Seven internals or Temporal.
6. The Temporal adapter may add hidden durable work but must not redefine BPMN behavior.

Read reference checkouts to learn behavior and architecture, but write an independent semantic account. Do not transplant CIB Seven PVM types, persistence entities, behavior classes, or engine algorithms into the Lean model or reducer. Do not modify sibling reference repositories from this project.

## Semantic invariants

- Commands distinguish commit, rollback, rejection, semantic failure, and unsupported operation.
- Harness and infrastructure failures remain separate from semantic command outcomes.
- Logical time and scheduler choices are explicit semantic inputs.
- Enabled external interactions are part of the observation contract.
- Collections preserve multiplicity, and variables preserve semantic scope and type.
- External-effect lifecycle remains distinct from internal state.
- Temporal retries remain distinct from CIB-visible retries.
- No public claim exceeds the declared profile, environment, observation boundary, and evidence.

## Workflow

Use red/green TDD for semantic code. Add the smallest separating executable example first, confirm that it fails for the intended missing behavior, implement the semantic root, then run the applicable gate in [docs/TESTING.md](docs/TESTING.md).

Keep dependencies at zero unless a concrete capability requires one. Obtain explicit user approval before adding, removing, upgrading, vendoring, or replacing a Lake, Java, Node, pnpm, Temporal, test, build, or runtime dependency.

Use one Markdown paragraph per line without hard wrapping. Link referenced Markdown documents with regular relative Markdown links. Update the owning document in the same change; do not duplicate live status or decision inventories.

Never commit absolute home paths, usernames, hostnames, credentials, or machine-specific state. Refer to sibling checkouts through the relative paths documented in [docs/SOURCES.md](docs/SOURCES.md).

The downloaded OMG PDF, its full Markdown conversion, extracted figures, and machine-readable source corpus are local research material and Git-ignored under [docs/reference/bpmn-2.0.2/](docs/reference/bpmn-2.0.2/README.md). Track project-authored digests, provenance, and hashes only; do not stage or redistribute the ignored corpus.

Use Conventional Commits in the form `type(scope): subject`, with a lowercase type and an imperative subject. Do not push without an explicit current request.

## Build

The Lean toolchain is pinned in [lean-toolchain](lean-toolchain) and currently has no external Lake packages.

```sh
lake build
lake test
git diff --check
git status --short
```
