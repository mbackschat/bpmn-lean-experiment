# CLAUDE.md / AGENTS.md

Shared guidance for Claude Code, OpenAI Codex, and human contributors working in **bpmn-lean-experiment**. [AGENTS.md](AGENTS.md) is a symlink to this file; keep one canonical guide and preserve the symlink.

## Mission

Build a Temporal-hosted adapter that imports BPMN 2.0.2 Process diagrams and ultimately satisfies OMG Process Execution Conformance. Establish that result through four independent components:

1. a versioned CIB Seven semantic profile;
2. an executable Lean reference interpreter;
3. a pure TypeScript semantic core;
4. a Temporal durability adapter checked through differential, refinement, and replay testing.

The bounded `none Start Event → User Task → none End Event` MVP, first BPMN XML ingestion slice, and User Task Query/Update interaction are evidence-closed drafts. One command executes exact source through CIB Seven, compiles the checked BPMN graph and Semantic Process program once for the independent TypeScript semantic core and isolated Temporal executions, and gives those exact definition artifacts to the Lean reference interpreter; exact completion, wrong activation, and stale completion have exact canonical agreement, content-bound CIB evidence, classified mutations, duplicate-command handling, cleanup, live-history replay, provenance, timings, and feedback budgets. Lean strictly decodes the admitted definitions, recomputes canonical lowering, rejects inequality before evaluation, and executes the received program. The approved parallel discriminator now has checked source/lowering, independent Lean and TypeScript semantics, content-bound balanced CIB evidence, focused Temporal Query/Update/refinement/replay evidence, and a five-case four-target differential with projection and provenance mutations; its epistemic closure remains in [PLAN.md](docs/PLAN.md). Code under `BpmnSemantics/Experiments/` remains provisional and separately gated.

The preserved architecture handoff uses “reducer” for the TypeScript component. Current project terminology calls that same boundary the **semantic core** and its public transition operation `applyStimulus`; this is a naming clarification, not an authority or responsibility change.

The primary execution architecture is **an interpreter/evaluator in TypeScript, not a BPMN-to-TypeScript code generator**. The implemented path is exact BPMN XML bytes → bounded private structural import → checked project-owned BPMN graph → bounded [Semantic Process IL](docs/SEMANTIC-PROCESS-IL-PROPOSAL.md) → semantic-core evaluation → Temporal hosting. Generated source may be a derived diagnostic or optimization only after equivalence evidence; it is never the profile or semantic authority. The source compiler, lowerer, Lean interpreter, pure semantic core, CIB projection, focused Temporal host, and complete differential admit the current sequential and balanced two-branch parallel structures. This is not a general BPMN importer.

Never claim BPMN conformance or CIB compatibility beyond the exact profile and evidence recorded in [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md).

## Start every session

1. Read the current checkpoint and exact resume point in [PLAN.md](docs/PLAN.md).
2. Read the implemented/absent boundary in [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md).
3. Inspect `git status --short --branch` and `git log -5 --oneline`; preserve unrelated or pre-existing changes.
4. Run the current applicable gate from [TESTING-SPEC.md](docs/TESTING-SPEC.md).
5. Take the first incomplete work item unless the user explicitly changes scope.

Use [docs/README.md](docs/README.md) as the documentation registry. Do not rely on chat history for project state.

## Read before changing a boundary

| Change | Required context |
|---|---|
| Documentation filename, role, lifecycle, placement, graduation, or archive | [Documentation discipline](docs/DOC-DISCIPLINE.md) |
| Mission, authority, compatibility, or assurance | Complete [architecture and assurance handoff](docs/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md) and [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md) |
| BPMN import, conformance, CIB relationship, or semantic interpretation | [BPMN-CONFORMANCE-TARGET.md](docs/BPMN-CONFORMANCE-TARGET.md), [CIB-BPMN-RELATION-REGISTER.md](docs/CIB-BPMN-RELATION-REGISTER.md), [BPMN-XML-INGESTION-DECISION.md](docs/BPMN-XML-INGESTION-DECISION.md), the applicable [semantic capsule](docs/capsules/README.md), and applicable normative sources |
| Source model, normalization, checked BPMN graph, Semantic Process IL, scope, runtime identity, token/activation state, or command closure | [Semantic Process IL](docs/SEMANTIC-PROCESS-IL-PROPOSAL.md), [semantic representations research](docs/research/SEMANTIC-REPRESENTATIONS-RESEARCH.md), and relevant [experiments](docs/experiments/README.md) |
| Scenario, profile, stimulus, observation, result, or other cross-language wire format | [Shared wire contracts](contracts/README.md) and the applicable [semantic capsule](docs/capsules/README.md) |
| Temporal adapter, interpreter hosting, replay, messaging, Activities, retries, timers, cancellation, or deployment | [TEMPORAL-EXECUTION-RESEARCH.md](docs/TEMPORAL-EXECUTION-RESEARCH.md) |
| Refinement, equivalence, liveness, fairness, TLA+, or auxiliary formal tools | [TLA-AND-BISIMULATION-RESEARCH.md](docs/TLA-AND-BISIMULATION-RESEARCH.md) |
| CIB Seven or Temporal source instrumentation/acceleration | [REFERENCE-INSTRUMENTATION-POLICY.md](docs/REFERENCE-INSTRUMENTATION-POLICY.md) |
| External checkout or fixture provenance | [SOURCES.md](docs/SOURCES.md) |

Read the complete selected document before acting on it.

## Authority model

1. BPMN 2.0.2 and its normative machine-readable artifacts are authoritative for syntax, metamodel, and Process Execution Conformance.
2. An approved immutable semantic profile is the compatibility authority for one declared target.
3. Lean is the formal semantic authority for that profile’s explicit operational meaning.
4. The pinned complete CIB Seven engine is the executable behavioral oracle for its declared compatibility profile.
5. The pure TypeScript semantic core is a separately written realization of the semantic contract and has no CIB Seven or Temporal dependency. It is an independent transcription of the reviewed account, not an independent choice of account; see [the two kinds of independence](docs/PROJECT-DESIGN.md#two-kinds-of-independence).
6. The Temporal adapter provides durability and hidden orchestration work without defining BPMN behavior.

CIB Seven is presumed to implement BPMN faithfully, operationalize gaps or inconsistencies, and add explicit engine extensions. Greater specificity or extension is not a deviation. When sources appear to disagree, classify the relationship in [CIB-BPMN-RELATION-REGISTER.md](docs/CIB-BPMN-RELATION-REGISTER.md) against the standard, profile, configuration, observation boundary, and evidence. Do not use majority voting.

## Non-negotiable boundaries

- Do not implement profile-dependent behavior until the relevant interpretation and scope are approved and recorded.
- Do not formalize a CIB/BPMN mismatch as profile behavior until it is classified as normative agreement, gap resolution, extension, configuration-specific realization, limitation, or evidence-backed deviation in [CIB-BPMN-RELATION-REGISTER.md](docs/CIB-BPMN-RELATION-REGISTER.md). Keep candidate and confirmed deviations prominent.
- Never silently choose an oracle release, feature meaning, expression subset, observation boundary, scheduling rule, listener scope, history contract, or external-effect contract.
- Do not transplant CIB PVM types, persistence entities, behavior classes, or engine algorithms into Lean or the semantic core.
- Do not make generated TypeScript the authoritative representation of a BPMN model; preserve admitted source/profile identity and execute the current project-owned definition data through the semantic core.
- Keep `bpmn-moddle` and raw moddle objects inside `@bpmn-lean/bpmn-source`; Lean, the semantic core, and Temporal Workflow code consume only project-owned serializable contracts.
- Treat every parser warning as admission-blocking until a profile rule explicitly proves it safe; preserve exact bytes and normalized evidence even when compilation is rejected.
- Do not encode Temporal Workflow tasks, Activity attempts, retries, Run IDs, or Event History as BPMN semantic facts.
- Keep BPMN import/admission, executable normalization, runtime execution, public observation, and host persistence conceptually separate.
- Keep neutral scenario inputs physically separate from retained expected results. Target runners receive no oracle answer; evidence replacement is an explicit operation outside ordinary verification and is bound to exact scenario content.
- Require each semantic-profile artifact to name its reviewed CIB–BPMN relationship IDs. Add the register entry and verifier coverage together; never use an unregistered placeholder ID.
- Keep the pinned reference baseline pristine. Modified source belongs to an explicit experimental branch or worktree and is diagnostic until shadow-compared.
- An experiment is not semantic authority merely because it compiles or passes a finite witness.
- Do not broaden any semantic capsule beyond its approved feature, interpretation, and observation boundary.
- Do not implement a new semantic transition family in Lean or the production semantic core until its capsule records a Temporal hosting/refinement preflight. The preflight must name the durable ingress, wait, timer, effect, cancellation, lifecycle, and projection mechanisms needed by that family; the state relation they preserve; delivery, ordering, concurrency, deduplication, retry, and replay risks; and the smallest executable refinement witness. “Temporal has no matching concept” is not itself a blocker, but an unclassified gap in preserving a public semantic outcome is.

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
3. complete the capsule's Temporal hosting/refinement preflight before production Lean or semantic-core implementation;
4. confirm failure for the intended missing mechanism;
5. implement the semantic root rather than a case-specific patch;
6. run the focused gate and then the complete applicable gate;
7. update the owning research, experiment, implementation, and plan documents.

The Temporal preflight is an early feasibility and information-preservation review, not evidence that the adapter already refines the core. It must distinguish a finite conformance-scenario host from the intended production lifecycle and must send unresolved mappings back to research or profile review before they become implicit adapter policy.

Prefer enum-based pattern matching or switch statements for semantic variants. Keep the Semantic Process program immutable and runtime state separate and serializable; keep effects explicit and perform no I/O in the pure semantic core.

### Comments — document semantic surplus

Comments explain information that cannot be recovered reliably from names, types, and control flow. There is no target comment density; comment according to the source's role.

- Public API: Javadoc or TSDoc states the contract, defaults, failure behavior, ownership or mutability, portability constraints, and any non-obvious example. Do not expose implementation history.
- Semantic and evaluator code: document observable behavior, legal domain, ordering, degradation behavior, and the evidence or oracle behind surprising semantics. Comment a branch when its correct interpretation is not evident from the code or when a tempting alternative would be wrong.
- Boundary and infrastructure code: document trust boundaries, normalization, resource limits, deterministic ordering, cache lifetime and invalidation, concurrency, and host-specific behavior. Do not narrate ordinary plumbing.
- Algorithms and data structures: document representation invariants and material complexity or performance constraints. Do not restate the type declaration or loop.
- Tests: class-level documentation names the contract and oracle. Test names describe cases. Inline comments are reserved for a discriminating fixture, intentional perturbation, provenance constraint, or otherwise invisible setup fact.
- Keep comments durable: release-set identifiers, chronology, implementation status, and “currently” claims belong in proposals, gap ledgers, or Git. Stable finding or specification identifiers are welcome when they provide traceable evidence.
- Delete or shorten a comment when refactoring makes it redundant. A stale or broader-than-evidence comment is a defect.

BPMN XML parsing, admission, and lowering run before Workflow start with an explicit byte limit and parser Promise-settlement deadline. The current timeout cannot preempt synchronous parser CPU; production untrusted uploads still require a bounded Worker or process. Every new Workflow execution must contain the admitted current executable definition; no fallback constructor may invent it.

Close each approved semantic capsule across distinct claim lanes: normative or profile clause, separating witness, executable Lean definition, useful law with exact hypotheses, nearest checked non-law, retained CIB observation at an explicit fidelity, independent TypeScript behavior, Temporal refinement/replay evidence, and exact status in [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md). These dimensions may complete independently; never summarize them with one undifferentiated “supported” claim. [TESTING-SPEC.md](docs/TESTING-SPEC.md#evidence-lanes) owns the definition of an evidence lane, including the requirement that two lanes count as two only when their failure modes are uncorrelated.

Give every material semantic rule a stable capsule-owned identifier and a rule-to-evidence row. An editorial correction may retain an identifier; a materially different proposition requires a new identifier and, when already used by evidence or running instances, the applicable profile or artifact version change. Rule identifiers are traceability labels and do not enter runtime wire contracts without a concrete consumer and versioning decision.

For each new runtime-transition family, keep a declarative Lean relation distinct from the executable evaluator and prove that every evaluator-produced transition is permitted by the relation. Claim completeness, determinism, or equivalence only with exact checked hypotheses; nondeterministic semantics must receive an explicit semantic choice rather than inherit evaluator order. Keep the TypeScript semantic core independently implemented.

Each capsule must inventory runtime-only and synthetic constructs, their source or derivation, why they are necessary, which public projections may expose them, and their creation, ownership, and removal invariants. Keep neutral target scenarios answer-free; expected outcomes and portable assertions remain verifier-only artifacts bound to exact scenario and profile identity.

Name a concrete adapter consumer or refinement risk before generalizing a representation or semantic mechanism. Preserve content-bound CIB observations as immutable evidence and require a meaningful seeded mutation for every new evidence projection. During pre-release, capture and replay Temporal histories within one disposable gate; retain histories only after an explicit durable baseline is approved. Investigate a mismatch at the semantic or projection boundary; never refresh expected evidence merely to make a gate green.

### Pre-release evolution

Keep exactly one current representation of every wire contract. Stable document kinds discriminate artifact roles, JSON Schema `$id` identifies current schemas, and semantic profile `id` identifies reviewed meaning. A breaking shape change replaces all current producers, consumers, fixtures, schemas, and tests atomically.

Do not add embedded format counters, parallel legacy readers, compatibility switches, migration functions, Workflow patch branches, retained Event History fixtures, or deployment fallbacks before an immutable release/history baseline is explicitly approved. Local Temporal gates must start clean state, replay histories produced during that gate, and discard the server state afterward.

This pre-release policy does not waive production compatibility. When the first durable baseline is approved, add retained histories, explicit version/patch markers, migration and rollback evidence, support windows, and removal criteria from real persisted artifacts.

### Milestone and capsule reflection

After the technical gate is green but before marking a milestone or semantic capsule complete, perform a separate epistemic-closure review:

1. state the exact claim established and the closest claim that remains unsupported;
2. ask whether all targets could agree because they share one flawed assumption, fixture, projection, or calibration source;
3. confirm every canonical observation depends only on admitted definition/runtime state and explicit semantic inputs, never on future scenario commands, host IDs, or expected output;
4. identify the nearest realistic counterexample and require either a checked non-law or an executable negative witness;
5. assess whether each Lean theorem has useful hypotheses and reusable semantic content rather than only proving one concrete serialized result;
6. keep BPMN requirements, CIB evidence, Lean properties, TypeScript correspondence, and Temporal refinement/replay as distinct claims;
7. confirm the applicable pre-release or durable evolution/history policy, and require a meaningful mutation for every new evidence projection;
8. inspect feedback timing, duplicated builds, process cleanup, harness coupling, document placement, stale status, and removable complexity;
9. decide whether the result changes the next best step.

Turn every escaped issue into either a reusable review question or an executable guard. Record each resulting correction in its existing owner: semantic meaning in the applicable [capsule](docs/capsules/README.md), durable architecture in [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md), evidence and guards in [TESTING-SPEC.md](docs/TESTING-SPEC.md), implementation status in [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md), immediate sequencing in [PLAN.md](docs/PLAN.md), and only reusable contributor behavior in this file. Do not create a retrospective diary per capsule.

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
| Document roles, suffix contracts, lifecycle, placement, and same-change triggers | [DOC-DISCIPLINE.md](docs/DOC-DISCIPLINE.md) |
| Mission, authority, and approved durable boundaries | [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md) |
| Semantic Process IL contract, remaining semantic obligations, and growth rules before graduation | [SEMANTIC-PROCESS-IL-PROPOSAL.md](docs/SEMANTIC-PROCESS-IL-PROPOSAL.md) |
| Reviewed BPMN Process Execution requirements and dispositions | [BPMN-REQUIREMENT-LEDGER.md](docs/BPMN-REQUIREMENT-LEDGER.md) |
| Exact current implementation, proof, test, and absence status | [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md) |
| Current checkpoint, ordered work, blockers, and resume point | [PLAN.md](docs/PLAN.md) |
| CIB behavior relative to BPMN: agreements, operational details, interpretations, extensions, configuration, limitations, and deviations | [CIB-BPMN-RELATION-REGISTER.md](docs/CIB-BPMN-RELATION-REGISTER.md) |
| Bounded project-owned semantic meaning, laws, witnesses, and exclusions | [docs/capsules](docs/capsules/README.md) |
| External-system and semantic-background findings | [docs/research](docs/research/README.md) |
| Bounded executable questions and results | [docs/experiments](docs/experiments/README.md) |
| Gates, evidence lanes, and test procedure | [TESTING-SPEC.md](docs/TESTING-SPEC.md) |
| External revisions, licenses, and checkout navigation | [SOURCES.md](docs/SOURCES.md) |

Before adding, renaming, moving, graduating, archiving, or deleting a document, follow [DOC-DISCIPLINE.md](docs/DOC-DISCIPLINE.md). `-SPEC` is reserved for an implemented current contract; approved but unimplemented intent remains `-PROPOSAL`. Write one Markdown paragraph per line without hard wrapping. Use regular relative Markdown links for other project documents. Update the owner and every index or inbound link in the same change, and avoid copying live inventories.

Keep the [MVP walkthrough](docs/MVP-WALKTHROUGH.md) as ordinary Markdown; do not introduce Showboat for code walkthroughs. Canonical walkthrough excerpts come from tagged regions in compiling or executable source. After changing a tagged region, run `./scripts/pnpm.sh run sync:doc-fragments`, review the resulting prose and diff, and leave `./scripts/pnpm.sh run check:doc-fragments` green. Never hand-edit a synchronized fence merely to satisfy the checker.

The rationale and transfer limits for the semantic-capsule workflow are recorded in [the `a12-kernel-lean` process-transfer study](docs/research/A12-KERNEL-LEAN-PROCESS-RESEARCH.md).

## Reference and source discipline

Reference checkouts are research inputs, never runtime dependencies of Lean or the semantic core. Navigate them through relative links recorded in [SOURCES.md](docs/SOURCES.md); never commit absolute home paths, usernames, hostnames, credentials, or machine-specific state.

External reference trees are available under `~/Projects/oss`. Whenever an external implementation is relevant to the current question, inspect the applicable pinned checkout there before relying on memory, generated summaries, or web search; do not skip the local source lane merely because it sits outside this repository. If a relevant repository is absent, clone it there on demand so research can use efficient local source inspection such as `rg`; keep the checkout a read-only research input, pin the exact revision used, and record its remote, revision, license, and role in [SOURCES.md](docs/SOURCES.md). Cloning a reference repository does not approve it as a project dependency or semantic authority.

Project-authored code and documentation are released under the [MIT License](LICENSE). Do not copy, vendor, or redistribute external material under that license without verifying compatibility, preserving required notices and attribution, and recording the decision in [SOURCES.md](docs/SOURCES.md).

The downloaded OMG PDF, its Markdown conversion, extracted figures, and machine-readable corpus are local Git-ignored research material under [docs/reference/bpmn-2.0.2](docs/reference/bpmn-2.0.2/README.md). Track only project-authored digests, provenance, and hashes; do not stage or redistribute the ignored corpus.

For CIB or Temporal source changes, preserve a clean pinned evidence lane and follow the branch, provenance, noninterference, and shadow-equivalence rules in [REFERENCE-INSTRUMENTATION-POLICY.md](docs/REFERENCE-INSTRUMENTATION-POLICY.md).

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

Focused BPMN source, CMOF-fact, and compiler gate:

```sh
./scripts/pnpm.sh run test:bpmn-source
```

Focused shared-contract and retained-evidence gate:
```sh
./scripts/pnpm.sh run test:contracts
```

Source-synchronized walkthrough fragment gate:

```sh
./scripts/pnpm.sh run check:doc-fragments
```

Optional local pinned MIWG observation gate:

```sh
./scripts/pnpm.sh run test:miwg
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

For every JavaScript or TypeScript test/build, follow the global long-running-command policy and the gate definitions in [TESTING-SPEC.md](docs/TESTING-SPEC.md). Use pnpm, not npm. The adapter keeps strict checking for project source but sets `skipLibCheck: true` because the pinned Temporal 1.21.0 declarations do not type-check under TypeScript 7.0.2; do not broaden that workaround to the semantic core.

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
