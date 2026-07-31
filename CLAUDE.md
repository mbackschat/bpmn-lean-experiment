# CLAUDE.md / AGENTS.md

Shared guidance for Claude Code, OpenAI Codex, and human contributors working in **bpmn-lean-experiment**. [AGENTS.md](AGENTS.md) is a symlink to this file; keep one canonical guide and preserve the symlink.

## Mission

Build a Temporal-hosted BPMN 2.0.2 execution engine that ultimately satisfies OMG Process Execution Conformance. Treat standards coverage as the primary engine roadmap, use the executable BPMN breadth of CIB Seven `2.2.0` to order the near-term standards schedule, keep selected CIB behavior as a classified compatibility overlay, and keep A12 Workflows replacement as a downstream adoption layer. The durable layer boundaries, ordering rule, and coverage measures are owned by [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md#layered-product-architecture).

Establish the semantic and hosting result through four components:

1. a versioned CIB Seven semantic profile;
2. an executable Lean reference interpreter;
3. a pure TypeScript semantic core;
4. a Temporal durability adapter checked through differential, refinement, and replay testing.

Use the maintained A12 Workflows product surface and its downstream full-stack blueprint to prioritize reusable BPMN mechanisms and necessary CIB overlays. A12 is the ultimate adoption target, but it does not define BPMN meaning and must not turn the engine into a collection of product-specific model paths.

Preserve the implemented [runnable Temporal MVP](docs/RUNNABLE-TEMPORAL-MVP-SPEC.md) as the product floor while advancing semantic breadth. Its dummy User Task actor is an explicit host simulation, not a UI, task inbox, form engine, identity layer, or human-resource semantic claim.

The exact current implementation and evidence boundary belongs in [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md), and active sequencing and decisions belong in [PLAN.md](docs/PLAN.md); code under `BpmnSemantics/Experiments/` remains provisional and separately gated.

The preserved architecture handoff uses “reducer” for the TypeScript component. Current project terminology calls that same boundary the **semantic core** and its public transition operation `applyStimulus`; this is a naming clarification, not an authority or responsibility change.

The primary execution architecture is **an interpreter/evaluator in TypeScript, not a BPMN-to-TypeScript code generator**: exact BPMN XML bytes → private structural import → checked project-owned BPMN graph → [Semantic Process IL](docs/SEMANTIC-PROCESS-IL-SPEC.md) → semantic-core evaluation → Temporal hosting. Generated source may be a derived diagnostic or optimization only after equivalence evidence; it is never the profile or semantic authority.

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
| Source model, normalization, checked BPMN graph, Semantic Process IL, scope, runtime identity, token/activation state, or command closure | [Semantic Process IL](docs/SEMANTIC-PROCESS-IL-SPEC.md), [semantic representations research](docs/research/SEMANTIC-REPRESENTATIONS-RESEARCH.md), and relevant [experiments](docs/experiments/README.md) |
| Scenario, profile, stimulus, observation, result, or other cross-language wire format | [Shared wire contracts](contracts/README.md) and the applicable [semantic capsule](docs/capsules/README.md) |
| Temporal adapter, interpreter hosting, production lifecycle, replay, messaging, Activities, retries, timers, cancellation, or deployment | [TEMPORAL-EXECUTION-RESEARCH.md](docs/research/TEMPORAL-EXECUTION-RESEARCH.md) and the [production lifecycle specification](docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) |
| Refinement, equivalence, liveness, fairness, TLA+, or auxiliary formal tools | [TLA-AND-BISIMULATION-RESEARCH.md](docs/research/TLA-AND-BISIMULATION-RESEARCH.md) |
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

- Preserve the dependency direction **BPMN execution core → selected CIB compatibility overlay → downstream A12 adoption adapter**. Lower layers never import or encode assumptions from a higher layer.
- Track BPMN requirement coverage, CIB profile coverage, and A12 adoption coverage as three separate denominators. Never combine them into one support percentage or use success in one layer as evidence for another.
- A12 inventory may prioritize the next standard mechanism or CIB relationship, but A12 bean names, façade APIs, data shapes, deployment assumptions, and license-bound source stay out of the BPMN core, Lean account, Semantic Process IL, and pure TypeScript semantic core.
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
- Keep A12 source strictly outside the project dependency and distribution boundary. A12 is EUPL-1.2 and may be inspected only as an external research, compatibility, and optional exact-source evidence input recorded in [SOURCES.md](docs/SOURCES.md); never link it into this project, vendor it, use it as a build or runtime dependency, copy it into project-authored artifacts, or present it as MIT-licensed material. This repository must remain distributable under its MIT license. Any confirmed or potential violation is a blocker: stop, preserve the suspect material and provenance without redistributing it, and require an explicit owner resolution before continuing affected work.
- An experiment is not semantic authority merely because it compiles or passes a finite witness.
- Do not broaden any semantic capsule beyond its approved feature, interpretation, and observation boundary.
- A first representative vertical slice may cross BPMN, CIB, Temporal, and downstream-adoption seams to establish feasibility. Once that seam is evidenced, do not repeat full-stack implementation for every model or variant: reuse the lower-layer mechanism and keep model/handler/client adaptation in the downstream component. Open another full semantic capsule only for a new BPMN proposition, a newly selected CIB relationship, or a material refinement risk.
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

For coverage work, begin from the BPMN requirement and reusable mechanism. Add CIB source admission, probes, profile rules, and retained evidence only when the standard is ambiguous, the selected compatibility profile differs or adds behavior, a real downstream model requires an extension, or the Temporal mapping needs an engine observation. Do not require a CIB extension merely to complete a vendor-neutral BPMN capsule.

Use A12 as a prioritization and later acceptance lane: first ask which standard mechanism its corpus forces, then which CIB overlay is actually required, and only then which A12 adapter binding remains. A target-shaped feasibility fixture may test the full composition once; subsequent A12 models using the same lower-layer contract belong in adoption regression evidence rather than new semantic implementations.

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

### Code hygiene and module boundaries

Keep each source file, class, namespace, and function at one semantic or infrastructure responsibility and one level of abstraction. A third independent responsibility, a function that combines validation, orchestration, mutation, and projection phases, or a class that owns unrelated lifecycle boundaries is a code smell even when its line count is below a threshold. Stop feature work, name the responsibilities, and extract cohesive owners before extending it.

Target at most 600 nonblank lines per hand-written Lean, TypeScript, JavaScript, or Java source file. One thousand nonblank lines is a hard ceiling: do not commit a hand-written source file above it. A reviewed 600–999-line file may remain only with explicit owner approval, while it has one cohesive responsibility, and while splitting it would expose private construction details without creating a useful independently testable or buildable owner. Record that narrow exception in the executable source-hygiene guard; an agent may not approve or add its own exception. Line compression, comment deletion, and moving code into an untyped utility bag do not satisfy the rule.

A nontrivial Lean module starts with `/-! ... -/` documentation naming its purpose, semantic scope, and boundary. Use `/-- ... -/` for public semantic declarations and main theorems when their contracts are not already evident from types and names. Every semantic family must remain independently buildable at its narrowest owning module. Umbrella modules only assemble imports; they contain no definitions, proofs, fixtures, or executable cases.

Split Lean code by semantic ownership, not into equal-sized chunks. Keep a family’s fixtures and laws with that family, and extract a shared helper or theorem only after two completed semantic users require exactly the same invariant and result domain. Do not replace a monolith with an include chain, universal fixture module, registry, or new harness. During red/green work, build the narrow extracted module before the umbrella integration gate.

Before adding a semantic family, inventory its existing checked-source types, lowering, runtime state, evaluator clauses, relations, laws, fixtures, observations, and adapters. Reuse a representation only when its meaning matches exactly; derive family-specific theorems by specialization when the proposition genuinely agrees rather than accumulating renamed restatements.

For TypeScript and Java, prefer small typed collaborators over a runner or manager that parses, validates, schedules, mutates, projects, and cleans up in one class. Keep wire decoding, semantic orchestration, host lifecycle, evidence extraction, and canonical projection in separate owners. An extraction is complete only when the new owner has a narrow public contract and a focused test or compile target; forwarding every call through the old god object is not a completed split.

TypeScript data and wire contracts are deeply immutable at compile time. Use the single project-owned `DeepReadonly<T>` utility for nested immutable contract shapes instead of repeating `readonly` at every property, and keep that utility tuple-preserving, union-distributive, and transparent to function types. Use ordinary `readonly` for a shallow contract only when nested values are deliberately mutable and that ownership is documented. Lock the convention with compile-time negative checks covering top-level, nested-object, and array or tuple mutation.

For concrete TypeScript definitions and fixtures, prefer `as const satisfies Contract` so literals remain narrow while the complete shape is checked; do not use `as Contract` to silence incompatibility. Model semantic alternatives as closed discriminated unions, keep recurring concepts in one named type, and require exhaustive enum-based switches with a `never` check. Directly executed TypeScript must stay within Node's erasable-syntax subset: use an `as const` value object plus a derived union instead of constructs such as `enum` that require JavaScript emission, and keep the executable erasable-syntax guard green. Avoid optional-boolean mode bags, parallel near-duplicate object shapes, broad index signatures, and clever conditional-type machinery that makes public compiler errors harder to understand. A type abstraction must remove real repetition for at least two consumers without weakening exact field, tuple, or union information; target TypeScript contributors should be able to discover and use the contract from editor tooling without reading its implementation.

Write idiomatic TypeScript rather than Java translated into TypeScript. Prefer immutable data plus small pure functions and cohesive ES modules over stateful utility classes, factories, builders, bean accessors, namespaces, and nominal wrapper ceremony. Accept `unknown` at untrusted boundaries and narrow it with explicit validators or type guards; avoid `any`, non-null assertions, unchecked casts, and catch-all string dictionaries. Let local implementation types infer when the result remains obvious, but annotate exported contracts, semantic functions, recursion boundaries, and callback ownership. Keep async control flow explicit with `async`/`await`, propagate typed domain results separately from thrown infrastructure failures, and never hide ordering, cancellation, timeout, or resource lifetime behind a convenience abstraction.

Write idiomatic Lean rather than imperative evaluator code transliterated into theorem syntax. Represent semantic domains with distinct structures, inductive types, and propositions; use total pattern matching and structurally clear recursion; keep executable definitions separate from declarative relations and reusable laws. Prefer small named lemmas with meaningful hypotheses, library combinators, and readable `cases`/`induction`/`simp`/`rw` proofs over duplicated theorem bodies, giant tactic blocks, Boolean encodings of propositions, or proof-by-serialization. `by decide` is appropriate for finite fixtures, decoder locks, and concrete counterexamples; it does not replace a quantified semantic theorem. Preserve domain-specific identifier types, keep JSON and wire conversion at boundary modules, and do not weaken types or expose evaluator internals merely to shorten a proof.

The source-hygiene gate detects hard file-size violations and requires an explicit reviewed justification for every file above the 600-line target. It complements design review; it does not make a file, class, or function clean merely because the counters pass.

BPMN XML parsing, admission, and lowering run before Workflow start with an explicit byte limit and parser Promise-settlement deadline. The current timeout cannot preempt synchronous parser CPU; production untrusted uploads still require a bounded Worker or process. Every new Workflow execution must contain the admitted current executable definition; no fallback constructor may invent it.

Close each approved semantic capsule across distinct claim lanes: normative or profile clause, separating witness, executable Lean definition, useful law with exact hypotheses, nearest checked non-law, retained CIB observation at an explicit fidelity, independent TypeScript behavior, Temporal refinement/replay evidence, and exact status in [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md). These dimensions may complete independently; never summarize them with one undifferentiated “supported” claim. [TESTING-SPEC.md](docs/TESTING-SPEC.md#evidence-lanes) owns the definition of an evidence lane, including the requirement that two lanes count as two only when their failure modes are uncorrelated.

Give every material semantic rule a stable capsule-owned identifier and a rule-to-evidence row. An editorial correction may retain an identifier; a materially different proposition requires a new identifier and, when already used by evidence or running instances, the applicable profile or artifact version change. Rule identifiers are traceability labels and do not enter runtime wire contracts without a concrete consumer and versioning decision.

For each new runtime-transition family, keep a declarative Lean relation distinct from the executable evaluator and prove that every evaluator-produced transition is permitted by the relation. Claim completeness, determinism, or equivalence only with exact checked hypotheses; nondeterministic semantics must receive an explicit semantic choice rather than inherit evaluator order. Keep the TypeScript semantic core independently implemented.

Each capsule must inventory runtime-only and synthetic constructs, their source or derivation, why they are necessary, which public projections may expose them, and their creation, ownership, and removal invariants. Keep neutral target scenarios answer-free; expected outcomes and portable assertions remain verifier-only artifacts bound to exact scenario and profile identity.

Adding a profile, scenario, or retained-evidence artifact requires the complete artifact registry and differential-catalog roundtrip in the same change. No profile may remain unreferenced, no scenario or evidence file may remain unregistered, every registered scenario must have exactly one pipeline case, CIB evidence routing must agree, and every pipeline case must retain a meaningful seeded semantic mutation. Derive aggregate counts from these catalogs instead of maintaining a second manual list.

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
5. confirm every claimed separating witness differs at the approved public observation boundary; a hidden microstep, storage order, or evaluator choice is not a discriminator unless the contract exposes it;
6. assess whether each Lean theorem has useful hypotheses and reusable semantic content rather than only proving one concrete serialized result;
7. keep BPMN requirements, CIB evidence, Lean properties, TypeScript correspondence, and Temporal refinement/replay as distinct claims;
8. confirm the applicable pre-release or durable evolution/history policy, and require a meaningful mutation for every new evidence projection;
9. inspect feedback timing, duplicated builds, process cleanup, harness coupling, document placement, stale status, and removable complexity;
10. compare the capsule's commit-bounded nonblank code and documentation churn recorded in [CAPSULE-COST-LEDGER.md](docs/CAPSULE-COST-LEDGER.md) with the previous comparable capsule; use elapsed wall time only when explicit start and closure timestamps exist, otherwise record it as unknown rather than answering by impression, and remove one identified process weight before starting the next capsule when the measured cost did not fall;
11. decide whether the result changes the next best step;
12. request an independent review before crossing a strategically material semantic, proof, admission, compatibility, or architecture checkpoint when correlated assumptions or claim-strength errors could survive the executable gates. Routine implementation does not require this extra review.

Turn every escaped issue into either a reusable review question or an executable guard. Record each resulting correction in its existing owner: semantic meaning in the applicable [capsule](docs/capsules/README.md), durable architecture in [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md), evidence and guards in [TESTING-SPEC.md](docs/TESTING-SPEC.md), implementation status in [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md), immediate sequencing in [PLAN.md](docs/PLAN.md), and only reusable contributor behavior in this file. Do not create a retrospective diary per capsule.

### Architecture experiments

A bounded spike requires competing accounts and a witness capable of separating them. End it as:

- an adopted capsule through the normal profile/evidence process;
- a precisely recorded unresolved boundary;
- or a representation correction with affected semantics, proofs, serializers, and adapters re-audited.

An architecture experiment may measure an implementation choice only after a named consumer or standing proof/refinement obligation forces that choice. The existence of a product consumer is an input to the experiment, not an outcome that implementation can discover. Do not interpose a speculative architecture experiment ahead of approved capsule work when its deciding fact is an unmade product decision.

Do not generalize after one consumer. Retain a provisional implementation only while it remains a useful discriminator.

Before measuring a staged line ceiling, anchor the preceding stage to a commit or record a reproducible baseline of exact files and nonblank counts. Do not publish an exact per-stage delta that can be reconstructed only from prose or an uncommitted mixed-stage tree.

### Dependencies

Keep each component’s dependencies at the smallest approved set and add one only when a concrete capability requires it. Obtain explicit user approval before adding, removing, upgrading, vendoring, or replacing any Lake, Java, Node, pnpm, Temporal, parser, test, build, or runtime dependency.

Record exact version, role, license, provenance, and removal cost before adoption.

## Documentation ownership

Use one owner for each fact and link to it elsewhere:

| Information | Owner |
|---|---|
| Document roles, suffix contracts, lifecycle, placement, and same-change triggers | [DOC-DISCIPLINE.md](docs/DOC-DISCIPLINE.md) |
| Mission, authority, and approved durable boundaries | [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md) |
| Semantic Process IL contract, exact proof boundary, maintained obligations, and growth rules | [SEMANTIC-PROCESS-IL-SPEC.md](docs/SEMANTIC-PROCESS-IL-SPEC.md) |
| Reviewed BPMN Process Execution requirements and dispositions | [BPMN-REQUIREMENT-LEDGER.md](docs/BPMN-REQUIREMENT-LEDGER.md) |
| Downstream A12 model, delegate, façade, blueprint, and migration-adoption denominator | [A12-WORKFLOWS-COMPATIBILITY-LEDGER.md](docs/research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) |
| Exact current implementation, proof, test, and absence status | [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md) |
| Current checkpoint, ordered work, blockers, and resume point | [PLAN.md](docs/PLAN.md) |
| Commit-bounded completed capsule and enabling-increment cost | [CAPSULE-COST-LEDGER.md](docs/CAPSULE-COST-LEDGER.md) |
| CIB behavior relative to BPMN: agreements, operational details, interpretations, extensions, configuration, limitations, and deviations | [CIB-BPMN-RELATION-REGISTER.md](docs/CIB-BPMN-RELATION-REGISTER.md) |
| Bounded project-owned semantic meaning, laws, witnesses, and exclusions | [docs/capsules](docs/capsules/README.md) |
| External-system and semantic-background findings | [docs/research](docs/research/README.md) |
| Bounded executable questions and results | [docs/experiments](docs/experiments/README.md) |
| Gates, evidence lanes, and test procedure | [TESTING-SPEC.md](docs/TESTING-SPEC.md) |
| External revisions, licenses, and checkout navigation | [SOURCES.md](docs/SOURCES.md) |

Before adding, renaming, moving, graduating, archiving, or deleting a document, follow [DOC-DISCIPLINE.md](docs/DOC-DISCIPLINE.md). `-SPEC` is reserved for an implemented current contract; approved but unimplemented intent remains `-PROPOSAL`. Write one Markdown paragraph per line without hard wrapping. Use regular relative Markdown links for other project documents. Update the owner and every index or inbound link in the same change, and avoid copying live inventories.

Keep the top-level `README.md` as a durable project front door. Do not put live status, evidence counts, current support inventories, or next-work narration there; link to [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md) and [PLAN.md](docs/PLAN.md) instead.

Keep the [MVP walkthrough](docs/MVP-WALKTHROUGH.md) as ordinary Markdown; do not introduce Showboat for code walkthroughs. Canonical walkthrough excerpts come from tagged regions in compiling or executable source. After changing a tagged region, run `./scripts/pnpm.sh run sync:doc-fragments`, review the resulting prose and diff, and leave `./scripts/pnpm.sh run check:doc-fragments` green. Never hand-edit a synchronized fence merely to satisfy the checker.

The rationale and transfer limits for the semantic-capsule workflow are recorded in [the `a12-kernel-lean` process-transfer study](docs/research/A12-KERNEL-LEAN-PROCESS-RESEARCH.md).

## Reference and source discipline

Reference checkouts are research inputs, never runtime dependencies of Lean or the semantic core. Navigate them through relative links recorded in [SOURCES.md](docs/SOURCES.md); never commit absolute home paths, usernames, hostnames, credentials, or machine-specific state.

External reference trees are available under `~/Projects/oss`. Whenever an external implementation is relevant to the current question, inspect the applicable pinned checkout there before relying on memory, generated summaries, or web search; do not skip the local source lane merely because it sits outside this repository. If a relevant repository is absent, clone it there on demand so research can use efficient local source inspection such as `rg`; keep the checkout a read-only research input, pin the exact revision used, and record its remote, revision, license, and role in [SOURCES.md](docs/SOURCES.md). Cloning a reference repository does not approve it as a project dependency or semantic authority.

Project-authored code and documentation are released under the [MIT License](LICENSE). Do not copy, vendor, link, or redistribute external material under that license without verifying compatibility, preserving required notices and attribution, and recording the decision in [SOURCES.md](docs/SOURCES.md). The stricter A12 boundary in the non-negotiable rules applies even if another technical or licensing arrangement might otherwise be possible.

The downloaded OMG PDF, its Markdown conversion, extracted figures, and machine-readable corpus are local Git-ignored research material under [docs/reference/bpmn-2.0.2](docs/reference/bpmn-2.0.2/README.md). Track only project-authored digests, provenance, and hashes; do not stage or redistribute the ignored corpus.

For CIB or Temporal source changes, preserve a clean pinned evidence lane and follow the branch, provenance, noninterference, and shadow-equivalence rules in [REFERENCE-INSTRUMENTATION-POLICY.md](docs/REFERENCE-INSTRUMENTATION-POLICY.md).

## Verification

The Lean toolchain is pinned in [lean-toolchain](lean-toolchain) and currently has no external Lake packages.

In a managed sandbox, agents must request host port-binding authorization before the first attempt to run `./scripts/verify.sh`, `./scripts/pnpm.sh run test:temporal`, `./scripts/pnpm.sh run test:pipeline`, or `./scripts/pnpm.sh run test:timer-time-skipping`. Do not probe by running one of these commands inside the restricted sandbox first. An ephemeral Temporal server startup error containing `Operation not permitted` or `EPERM` means the sandbox denied the local listener; it is not evidence of a port collision or a failing semantic test.

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

Strict no-emit gate for directly executed TypeScript harnesses:

```sh
./scripts/pnpm.sh run check:harness-types
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

Bounded checked-source relation experiment gate:

```sh
lake build checkCheckedSourceRelationExperiment
lake exe checkCheckedSourceRelationExperiment
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
- The default branch requires the `verify-complete` hosted check, which passes only when every platform in the verification matrix succeeded. Repository administrators may bypass it, so a red merge takes a deliberate override rather than an accident; never override to land unverified work.

Before handing off:

1. update [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md) with exact implemented and absent scope;
2. update [PLAN.md](docs/PLAN.md) with the last verified command and exact next action;
3. run the applicable gates and `git diff --check`;
4. leave a clean working tree, or explicitly document every unfinished file and failing command.
