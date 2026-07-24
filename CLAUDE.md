# CLAUDE.md / AGENTS.md

Shared guidance for Claude Code, OpenAI Codex, and human contributors working in **bpmn-lean-experiment**. [AGENTS.md](AGENTS.md) is a symlink to this file; keep one canonical guide and preserve the symlink.

## Mission

Build a Temporal-hosted adapter that imports BPMN 2.0.2 Process diagrams and ultimately satisfies OMG Process Execution Conformance. Establish that result through four independent components:

1. a versioned CIB Seven semantic profile;
2. an executable Lean reference interpreter;
3. a pure TypeScript semantic core;
4. a Temporal durability adapter checked through differential, refinement, and replay testing.

Milestone 0 is complete for `none Start Event → User Task → none End Event`. One command runs CIB Seven, the Lean interpreter, the independent pure TypeScript semantic core, and isolated Temporal executions concurrently; exact canonical agreement, injected-disagreement classification, cleanup, live and retained replay, provenance, timings, and feedback budgets are executable. The next work is recorded in [PLAN.md](docs/PLAN.md). Code under `BpmnSemantics/Experiments/` remains provisional and separately gated.

The preserved architecture handoff uses “reducer” for the TypeScript component. Current project terminology calls that same boundary the **semantic core** and its public transition operation `applyStimulus`; this is a naming clarification, not an authority or responsibility change.

The primary execution architecture is **an interpreter/evaluator in TypeScript, not a BPMN-to-TypeScript code generator**. The intended path is BPMN XML → source-preserving model → validated, content-addressed executable IR as data → semantic-core evaluation → Temporal hosting. Generated source may be a derived diagnostic or optimization only after equivalence evidence; it is never the profile or semantic authority. Milestone 0 still uses an explicit capsule model and does not yet implement arbitrary BPMN XML ingestion.

Never claim BPMN conformance or CIB compatibility beyond the exact profile and evidence recorded in [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md).

## Start every session

1. Read the current checkpoint and exact resume point in [PLAN.md](docs/PLAN.md).
2. Read the implemented/absent boundary in [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md).
3. Read the active milestone contract in [MILESTONE-0-FAST-PIPELINE.md](docs/MILESTONE-0-FAST-PIPELINE.md).
4. Inspect `git status --short --branch` and `git log -5 --oneline`; preserve unrelated or pre-existing changes.
5. Run the current applicable gate from [TESTING.md](docs/TESTING.md).
6. Take the first incomplete work item unless the user explicitly changes scope.

Use [docs/README.md](docs/README.md) as the documentation registry. Do not rely on chat history for project state.

## Read before changing a boundary

| Change | Required context |
|---|---|
| Mission, authority, compatibility, or assurance | Complete [architecture and assurance handoff](docs/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md) and [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md) |
| BPMN import, conformance, or semantic interpretation | [BPMN-CONFORMANCE-TARGET.md](docs/BPMN-CONFORMANCE-TARGET.md), [BPMN-XML-INGESTION-DECISION.md](docs/BPMN-XML-INGESTION-DECISION.md), and applicable normative sources |
| Source model, normalization, executable IR, scope, runtime identity, token/activation state, or command closure | [Semantic representations research](docs/research/SEMANTIC-REPRESENTATIONS.md) and relevant [experiments](docs/experiments/README.md) |
| Temporal adapter, interpreter hosting, replay, messaging, Activities, retries, timers, cancellation, or deployment | [TEMPORAL-EXECUTION-MODEL.md](docs/TEMPORAL-EXECUTION-MODEL.md) |
| Refinement, equivalence, liveness, fairness, TLA+, or auxiliary formal tools | [TLA-AND-BISIMULATION-RESEARCH.md](docs/TLA-AND-BISIMULATION-RESEARCH.md) |
| CIB Seven or Temporal source instrumentation/acceleration | [REFERENCE-INSTRUMENTATION.md](docs/REFERENCE-INSTRUMENTATION.md) |
| External checkout or fixture provenance | [SOURCES.md](docs/SOURCES.md) |

Read the complete selected document before acting on it.

## Authority model

1. BPMN 2.0.2 and its normative machine-readable artifacts are authoritative for syntax, metamodel, and Process Execution Conformance.
2. An approved immutable semantic profile is the compatibility authority for one declared target.
3. Lean is the formal semantic authority for that profile’s explicit operational meaning.
4. The pinned complete CIB Seven engine is the executable behavioral oracle for its declared compatibility profile.
5. The pure TypeScript semantic core independently implements the semantic contract and has no CIB Seven or Temporal dependency.
6. The Temporal adapter provides durability and hidden orchestration work without defining BPMN behavior.

When sources disagree, classify the disagreement against the standard, profile, configuration, observation boundary, and evidence. Do not use majority voting.

## Non-negotiable boundaries

- Do not implement profile-dependent behavior until the relevant interpretation and scope are approved and recorded.
- Never silently choose an oracle release, feature meaning, expression subset, observation boundary, scheduling rule, listener scope, history contract, or external-effect contract.
- Do not transplant CIB PVM types, persistence entities, behavior classes, or engine algorithms into Lean or the semantic core.
- Do not make generated TypeScript the authoritative representation of a BPMN model; preserve the admitted source identity and execute versioned IR data through the semantic core.
- Do not encode Temporal Workflow tasks, Activity attempts, retries, Run IDs, or Event History as BPMN semantic facts.
- Keep BPMN import/admission, executable normalization, runtime execution, public observation, and host persistence conceptually separate.
- Keep the pinned reference baseline pristine. Modified source belongs to an explicit experimental branch or worktree and is diagnostic until shadow-compared.
- An experiment is not semantic authority merely because it compiles or passes a finite witness.
- Do not broaden any semantic capsule beyond its approved feature, interpretation, and observation boundary.

## Semantic invariants

- Commands distinguish committed, rolled back, rejected, semantic failure, and unsupported outcomes.
- Harness and infrastructure failures remain separate from semantic outcomes.
- Logical time, scheduler actions, races, and other nondeterministic choices are explicit inputs.
- Enabled external interactions are part of the observation contract.
- Collections preserve multiplicity; variables preserve scope and semantic type.
- Definition identity, semantic instance identity, and host-runtime identity remain distinct.
- External-effect lifecycle remains distinct from internal semantic state.
- Temporal transport retries remain distinct from CIB-visible retries and incidents.
- Speculative command state is not exposed as committed observation.
- No claim exceeds the declared profile, environment, feature surface, observation boundary, and evidence.

## Working method

### Semantic code

Use red/green TDD:

1. identify the normative requirement, CIB probe, or explicit open interpretation;
2. add the smallest separating executable example;
3. confirm failure for the intended missing mechanism;
4. implement the semantic root rather than a case-specific patch;
5. run the focused gate and then the complete applicable gate;
6. update the owning research, experiment, implementation, and plan documents.

Prefer enum-based pattern matching or switch statements for semantic variants. Keep executable IR and runtime state as serializable data; keep effects explicit and perform no I/O in the pure semantic core.

Close each approved semantic capsule across distinct claim lanes: normative or profile clause, separating witness, executable Lean definition, useful law with exact hypotheses, nearest checked non-law, retained CIB observation at an explicit fidelity, independent TypeScript behavior, Temporal refinement/replay evidence, and exact status in [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md). These dimensions may complete independently; never summarize them with one undifferentiated “supported” claim.

Name a concrete adapter consumer or refinement risk before generalizing a representation or semantic mechanism. Preserve retained CIB observations and Temporal histories as immutable evidence, and require a meaningful seeded mutation for every new evidence projection. Investigate a mismatch at the semantic or projection boundary; never refresh expected evidence merely to make a gate green.

### Architecture experiments

A bounded spike requires competing accounts and a witness capable of separating them. End it as:

- an adopted capsule through the normal profile/evidence process;
- a precisely recorded unresolved boundary;
- or a representation correction with affected semantics, proofs, serializers, and adapters re-audited.

Do not generalize after one consumer. Retain a provisional implementation only while it remains a useful discriminator.

### Dependencies

Keep each component’s dependencies at the smallest approved set and add one only when a concrete capability requires it. Obtain explicit user approval before adding, removing, upgrading, vendoring, or replacing any Lake, Java, Node, pnpm, Temporal, parser, test, build, or runtime dependency.

Record exact version, role, license, provenance, and removal cost before adoption.

## Documentation ownership

Use one owner for each fact and link to it elsewhere:

| Information | Owner |
|---|---|
| Mission, authority, and approved durable boundaries | [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md) |
| Exact current implementation, proof, test, and absence status | [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md) |
| Current checkpoint, ordered work, blockers, and resume point | [PLAN.md](docs/PLAN.md) |
| External-system and semantic-background findings | [docs/research](docs/research/README.md) |
| Bounded executable questions and results | [docs/experiments](docs/experiments/README.md) |
| Gates, evidence lanes, and test procedure | [TESTING.md](docs/TESTING.md) |
| External revisions, licenses, and checkout navigation | [SOURCES.md](docs/SOURCES.md) |

Write one Markdown paragraph per line without hard wrapping. Use regular relative Markdown links for other project documents. Update the owner in the same change and avoid copying live inventories.

The rationale and transfer limits for the semantic-capsule workflow are recorded in [the `a12-kernel-lean` process-transfer study](docs/research/A12-KERNEL-LEAN-PROCESS-TRANSFER.md).

## Reference and source discipline

Reference checkouts are research inputs, never runtime dependencies of Lean or the semantic core. Navigate them through relative links recorded in [SOURCES.md](docs/SOURCES.md); never commit absolute home paths, usernames, hostnames, credentials, or machine-specific state.

Project-authored code and documentation are released under the [MIT License](LICENSE). Do not copy, vendor, or redistribute external material under that license without verifying compatibility, preserving required notices and attribution, and recording the decision in [SOURCES.md](docs/SOURCES.md).

The downloaded OMG PDF, its Markdown conversion, extracted figures, and machine-readable corpus are local Git-ignored research material under [docs/reference/bpmn-2.0.2](docs/reference/bpmn-2.0.2/README.md). Track only project-authored digests, provenance, and hashes; do not stage or redistribute the ignored corpus.

For CIB or Temporal source changes, preserve a clean pinned evidence lane and follow the branch, provenance, noninterference, and shadow-equivalence rules in [REFERENCE-INSTRUMENTATION.md](docs/REFERENCE-INSTRUMENTATION.md).

## Verification

The Lean toolchain is pinned in [lean-toolchain](lean-toolchain) and currently has no external Lake packages.

Current verification gate:

```sh
./scripts/verify.sh
git status --short
```

Fast semantic gate (Lean plus TypeScript semantic core):

```sh
./scripts/pnpm.sh run test:semantic
```

Focused Temporal refinement and replay gate:

```sh
./scripts/pnpm.sh run test:temporal
```

Complete fast differential/refinement gate:

```sh
./scripts/pnpm.sh run test:pipeline
```

Focused CIB calibration gate:

```sh
./scripts/test-cibseven-oracle.sh
```

Provisional representation-spike gate:

```sh
lake build checkSemanticRepresentationSpike
lake exe checkSemanticRepresentationSpike
```

For every JavaScript or TypeScript test/build, follow the global long-running-command policy and the gate definitions in [TESTING.md](docs/TESTING.md). Use pnpm, not npm. The adapter keeps strict checking for project source but sets `skipLibCheck: true` because the pinned Temporal 1.21.0 declarations do not type-check under TypeScript 7.0.2; do not broaden that workaround to the semantic core.

Always run:

```sh
git diff --check
```

## Git and delivery

- Preserve unrelated user changes and avoid destructive Git operations.
- Commit only when explicitly requested in the current task.
- Use Conventional Commits: `type(scope): subject`, lowercase type, imperative subject, subject-only by default.
- Do not push without an explicit current request.
- Keep [AGENTS.md](AGENTS.md) as a symlink to `CLAUDE.md`; never maintain divergent copies.

Before handing off:

1. update [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md) with exact implemented and absent scope;
2. update [PLAN.md](docs/PLAN.md) with the last verified command and exact next action;
3. run the applicable gates and `git diff --check`;
4. leave a clean working tree, or explicitly document every unfinished file and failing command.
