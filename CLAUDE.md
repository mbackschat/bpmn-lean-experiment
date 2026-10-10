# CLAUDE.md / AGENTS.md

Shared guidance for Claude Code, OpenAI Codex, and human contributors working in **bpmn-lean-experiment**. [AGENTS.md](AGENTS.md) is a symlink to this file; keep one canonical guide and preserve the symlink.

**Project opt-in:** Use HIGH/MEDIUM model tiers. Read [Delegated implementation](#delegated-implementation) at session start for role selection and delegation rules.

## Rule 1: no routine GitHub-hosted macOS

Standard GitHub-hosted macOS runners are [free and unlimited for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions), so billing is not the reason for this rule. Their distinct evidence is a clean macOS machine and, on `macos-latest`, Apple Silicon compatibility. Do not add macOS to a push, pull-request, scheduled, matrix, ordinary release, or other routine workflow: this repository ships no macOS-native artifact, the development computer already owns proportionate local macOS validation, and Ubuntu supplies the independent routine portability lane with less duplicate feedback work. A focused macOS smoke job is allowed only when it has an explicit clean-machine or ARM compatibility purpose and the job itself is guarded by `github.event_name == 'workflow_dispatch'`; do not run the complete verification suite merely to duplicate Linux evidence. [Larger macOS runners remain billable](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) even for public repositories and require a separate owner decision. The executable GitHub-runner policy must reject every macOS label outside that manual-only boundary.

## Mission

Build two MIT products: a Temporal-hosted BPMN 2.0.2 execution engine bounded in element breadth and feature depth by CIB Seven `2.2.0` implementation, and a BPM platform on top of it. Treat [Practical CIB7 Coverage](docs/PROJECT-DESIGN.md#practical-cib7-coverage) as the sole delivery target for showing and releasing the product. MUE RC was sufficient; separate MUE completion or acceptance is not a prerequisite. Features or deeper variants absent from CIB7 are out of scope; establish implementation depth from pinned source, tests and documentation before selecting an increment. BPMN remains the semantic authority, and CIB differences require classification rather than automatic imitation. After normative dependencies, treat practical reach from CIB Seven `2.2.0` and the deduplicated executable whole-model corpus as co-equal with high semantic risk in element and mechanism families; a rare concurrency, cancellation, scope, liveness, identity, data, or Temporal-refinement risk may outrank a frequent low-risk mechanism. Keep selected CIB behavior as a classified compatibility overlay, and let the platform's next showcase milestone break ties only after standards value, reach, and risk are equal, using [the showcase milestone ladder](docs/SHOWCASE-MILESTONE-LADDER-DECISION.md#showcase-milestone-ladder). A12 Workflows replacement is a third product owned by A12 under EUPL-1.2 and is out of scope in this repository. The durable product division, layer boundaries, ordering rule, coverage measures, and Lean assurance-lane rule are owned by [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md#product-division).

Establish the semantic and hosting result through four components:

1. a versioned CIB Seven semantic profile;
2. an executable Lean reference interpreter;
3. a pure TypeScript semantic core;
4. a Temporal durability adapter checked through differential, refinement, and replay testing.

The engine's essential element set and depth are scoped by [the minimal engine research](docs/research/MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md) and its follow-up [extensions research](docs/research/HIGH-PRIORITY-BPMN-EXTENSIONS-RESEARCH.md). Neither disposes a BPMN requirement; [the requirement ledger](docs/BPMN-REQUIREMENT-LEDGER.md) owns dispositions and the owning capsule owns meaning.

Preserve the implemented [Temporal engine runner](docs/RUNNABLE-TEMPORAL-MVP-SPEC.md) as the engine-side product floor while advancing semantic breadth. Its simulated User Task actor is an explicit host simulation and defines no BPMN meaning; the real task inbox, forms, and identity belong to the BPM platform, which reaches them through the same published contract and content-bound commands.

The platform consumes only the engine's published contract: compile, start, observe committed state, submit a command. It takes occurrence identity from a publication and never constructs one, and a fact the engine does not publish is a stop condition routed to an engine requirement, never derived from Temporal Event History, a state difference, or the platform's own store.

The exact current implementation and evidence boundary belongs in the detail maps routed by [`implementation-status-router`](docs/IMPLEMENTATION-MAP.md), concrete repository and deployment architecture in [ARCHITECTURE.md](docs/ARCHITECTURE.md), and active sequencing in [PLAN.md](docs/PLAN.md); code under `BpmnSemantics/Experiments/` remains provisional and separately gated.

The preserved architecture handoff uses “reducer” for the TypeScript component. Current project terminology calls that same boundary the **semantic core** and its public transition operation `applyStimulus`; this is a naming clarification, not an authority or responsibility change.

The primary execution architecture is **an interpreter/evaluator in TypeScript, not a BPMN-to-TypeScript code generator**: exact BPMN XML bytes → private structural import → checked project-owned BPMN graph → [Semantic Process IL](docs/SEMANTIC-PROCESS-IL-SPEC.md) → semantic-core evaluation → Temporal hosting. Generated source may be a derived diagnostic or optimization only after equivalence evidence; it is never the profile or semantic authority.

Never claim BPMN conformance or CIB compatibility beyond the exact profile and evidence in the detail maps routed by [`implementation-status-router`](docs/IMPLEMENTATION-MAP.md).

## Start every session

1. Read [PLAN.md](docs/PLAN.md) completely.
2. Read root [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md) completely.
3. Determine whether the user request retains or overrides the active work item.
4. For retained work, read the detail maps `node scripts/what-binds.ts <path>...` resolves for the concrete target paths; read every detail map linked by the active item only while target paths are unknown. For overridden work, run `node scripts/what-binds.ts <path>...` for every named path and resolve every named area through the root routing table; read every reported detail map and every candidate map when scope is ambiguous.
5. Inspect `git status --short --branch` and `git log -5 --oneline`; preserve unrelated or pre-existing changes. Run `./scripts/doctor.sh verify`. It inventories every declared external pin, dependency owner, and cache even when the selected scope does not require all of them. On a fresh machine, follow [CONTRIBUTOR-SETUP-GUIDE.md](docs/CONTRIBUTOR-SETUP-GUIDE.md); provision missing inputs rather than weakening or skipping their lanes. Use the `research` scope before source-grounded work using registered research checkouts. Use the separate `adoption` scope only when the task explicitly requires optional A12 exact-source evidence; never infer that evidence from the complete MIT engine `verify` gate.
6. After discovering concrete target paths, run `node scripts/what-binds.ts <path>...` and read every newly reported detail map before editing.
7. Read every boundary-specific owner routed by the change table below.
8. Use [TESTING-SPEC.md](docs/TESTING-SPEC.md#select-the-task-owner) to select the applicable gate and focused policy owners; read those owners and run the gate, then take the selected work. Do not import every testing policy for ordinary work.

Use [docs/README.md](docs/README.md) as the documentation registry. Do not rely on chat history for project state.

Maintain the active task in [PLAN.md](docs/PLAN.md#exact-resume-point) by replacing its current result, decisive verification, blockers and next action in place. Replace those details when the active task changes; carry forward only still-relevant constraints and unresolved failures. Never append session, command or helper-proof diaries to the plan, proposals, specs or maps. Follow [active-task continuity](docs/DOC-DISCIPLINE.md#active-task-continuity) for durable evidence and review receipts.

For frontend architecture questions, comparisons, or recommendations, apply [Before frontend recommendations](#before-frontend-recommendations) before the first recommendation, even when no code change is requested.

## Read before changing a boundary

| Change | Required context |
|---|---|
| Documentation filename, role, lifecycle, placement, graduation, or archive | [Documentation discipline](docs/DOC-DISCIPLINE.md) |
| Repository layout, package ownership, modular-monolith boundary, composition root, or deployment shape | [ARCHITECTURE.md](docs/ARCHITECTURE.md), [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md#one-repository-for-products-1-and-2), and the applicable product proposal |
| Frontend architecture recommendation, React organization, routing, state management, or UI stack comparison | [Before frontend recommendations](#before-frontend-recommendations), including the existing stack research and adopted architecture decisions |
| Product 2 UI/UX surface, workflow, visualization, or interaction model | [BPM platform UI/UX and information-architecture research](docs/research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md), [UI design specification](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md#source-grounded-design-preflight), applicable current product documentation, and the pristine pinned source registered in [SOURCES.md](docs/SOURCES.md) |
| Mission, authority, compatibility, or assurance | [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md), [BPMN-CONFORMANCE-TARGET.md](docs/BPMN-CONFORMANCE-TARGET.md), and the applicable release/evidence gate in [TESTING-SPEC.md](docs/TESTING-SPEC.md) |
| BPMN import, conformance, CIB relationship, or semantic interpretation | [BPMN-CONFORMANCE-TARGET.md](docs/BPMN-CONFORMANCE-TARGET.md), [CIB-BPMN-RELATION-REGISTER.md](docs/CIB-BPMN-RELATION-REGISTER.md), [BPMN-XML-INGESTION-DECISION.md](docs/BPMN-XML-INGESTION-DECISION.md), the applicable [semantic capsule](docs/capsules/README.md), and applicable normative sources |
| Source model, normalization, checked BPMN graph, Semantic Process IL, scope, runtime identity, token/activation state, or command closure | [Semantic Process IL](docs/SEMANTIC-PROCESS-IL-SPEC.md), [semantic representations research](docs/research/SEMANTIC-REPRESENTATIONS-RESEARCH.md), and relevant [experiments](docs/experiments/README.md) |
| Scenario, profile, stimulus, observation, result, or other cross-language wire format | [Shared wire contracts](contracts/README.md) and the applicable [semantic capsule](docs/capsules/README.md) |
| Temporal adapter, interpreter hosting, production lifecycle, replay, messaging, Activities, retries, timers, cancellation, or deployment | [TEMPORAL-EXECUTION-RESEARCH.md](docs/research/TEMPORAL-EXECUTION-RESEARCH.md) and the [production lifecycle specification](docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) |
| Refinement, equivalence, liveness, fairness, TLA+, or auxiliary formal tools | [TLA-AND-BISIMULATION-RESEARCH.md](docs/research/TLA-AND-BISIMULATION-RESEARCH.md) |
| CIB Seven or Temporal source instrumentation/acceleration | [REFERENCE-INSTRUMENTATION-POLICY.md](docs/REFERENCE-INSTRUMENTATION-POLICY.md) |
| External checkout, clean-machine setup, or fixture provenance | [CONTRIBUTOR-SETUP-GUIDE.md](docs/CONTRIBUTOR-SETUP-GUIDE.md) and [SOURCES.md](docs/SOURCES.md) |

Read the complete selected document before acting on it. For routine ledger use, read its purpose/update rules and the selected complete records: the cost increment and comparator, the applicable resource measurement, or the self-assessment questions and matching findings. Read the whole ledger when changing its structure, denominator or rules. Testing detail is task-routed: select the relevant owner through [the testing entry point](docs/TESTING-SPEC.md#select-the-task-owner), not the entire verification-policy collection.

## Authority model

1. BPMN 2.0.2 and its normative machine-readable artifacts are authoritative for syntax, metamodel, and Process Execution Conformance.
2. An approved immutable semantic profile is the compatibility authority for one declared target.
3. Lean is the formal semantic authority for that profile’s explicit operational meaning.
4. The pinned complete CIB Seven engine is the executable behavioral oracle for its declared compatibility profile.
5. The pure TypeScript semantic core is a separately written realization of the semantic contract and has no CIB Seven or Temporal dependency. It is an independent transcription of the reviewed account, not an independent choice of account; see [the two kinds of independence](docs/PROJECT-DESIGN.md#two-kinds-of-independence).
6. The Temporal adapter provides durability and hidden orchestration work without defining BPMN behavior.

CIB Seven is presumed to implement BPMN faithfully, operationalize gaps or inconsistencies, and add explicit engine extensions. Greater specificity or extension is not a deviation. When sources appear to disagree, classify the relationship in [CIB-BPMN-RELATION-REGISTER.md](docs/CIB-BPMN-RELATION-REGISTER.md) against the standard, profile, configuration, observation boundary, and evidence. Do not use majority voting.

## Non-negotiable boundaries

- Preserve the dependency direction **BPMN execution core → selected CIB compatibility overlay → BPM platform**. Lower layers never import or encode assumptions from a higher layer, and the platform may consume only the engine's published contract.
- Track BPMN requirement coverage, CIB profile coverage, and platform milestone coverage as three separate denominators. Never combine them into one support percentage or use success in one layer as evidence for another.
- Downstream demand may prioritize the next standard mechanism or CIB relationship, but product bean names, façade APIs, data shapes, deployment assumptions, and license-bound source stay out of the BPMN core, Lean account, Semantic Process IL, and pure TypeScript semantic core.
- Declare each capsule's Lean lane shape at capsule start as proved, checked, or deliberately open under [the assurance-lane rule](docs/PROJECT-DESIGN.md#lean-assurance-lane). A lane that cannot close within its effort bound records its precise unresolved boundary; it never quietly becomes a weaker claim.
- Do not implement profile-dependent behavior until the relevant interpretation and scope are approved and recorded.
- Do not formalize a CIB/BPMN mismatch as profile behavior until it is classified as normative agreement, gap resolution, extension, configuration-specific realization, limitation, or evidence-backed deviation in [CIB-BPMN-RELATION-REGISTER.md](docs/CIB-BPMN-RELATION-REGISTER.md). Keep candidate and confirmed deviations prominent.
- Never silently choose an oracle release, feature meaning, expression subset, observation boundary, scheduling rule, listener scope, history contract, or external-effect contract.
- Do not transplant CIB PVM types, persistence entities, behavior classes, or engine algorithms into Lean or the semantic core.
- Do not make generated TypeScript the authoritative representation of a BPMN model; preserve admitted source/profile identity and execute the current project-owned definition data through the semantic core.
- Keep semantic `bpmn-moddle` and raw moddle objects inside `@bpmn-lean/bpmn-source`; Lean, the semantic core, and Temporal Workflow code consume only project-owned serializable contracts. The Product 2 definition-projection boundary is the sole permitted exception: it privately owns one exact parser graph, emits only validated DI bytes with closed provenance and a closed exact-source-bound Human Task catalog, never exports raw moddle values or generated non-DI XML, and has no admission or semantic authority. Its diagram responsibility follows the reviewed [diagram presentation decision](docs/BPMN-DIAGRAM-PRESENTATION-DECISION.md), while its Human Task catalog responsibility follows the implemented [structured Human Work specification](docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md).
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

### Root cause before fixes and workarounds

This rule applies to every issue: product behavior, UI/UX, semantics, dependencies, native runtimes, tests, builds, CI, infrastructure, and documentation. Investigate the causal mechanism before selecting a correction or establishing a workaround. Name the exact failing boundary and the invariant it breaks; distinguish observed evidence, a plausible hypothesis, and a demonstrated cause. A matching stack trace or upstream issue is a lead, not proof that the same cause applies here.

Reproduce the failure with the smallest separating witness, then test the proposed explanation against a second instance or an adversarial counterexample. Fix the responsible mechanism and verify both the original failure and the broader failure class. If the cause is still unknown, record it as unresolved and continue diagnosis; do not relabel symptom suppression as a repair.

Do not disable a compiler, runtime feature, validation, assertion, or test; reduce coverage; increase retries or deadlines; or substitute a dependency merely to obtain a green result. Before proposing any workaround, report the root-cause investigation, remaining uncertainty, why a direct repair is unavailable, and the workaround's consequences and removal condition. Establishing a workaround requires explicit owner approval; earlier use elsewhere and a passing rerun are not approval or evidence of a root-cause fix. Diagnostic experiments may vary settings to test a hypothesis, but must remain separate from accepted configuration and qualification evidence.

For an upstream defect, verify the applicable versions and source-level explanation or reproducer, identify an actual corrective patch when available, and validate it under the intended configuration while respecting dependency approval and age rules. If no demonstrated correction is available, report the blocker honestly. Keep affected release qualification open until the cause is corrected or the owner explicitly accepts a documented exception; continue independent authorized work.

**Owner direction: defer SDK defects.** Never initiate SDK repair, private SDK builds, patch qualification or an SDK-fix investigation on your own. Record the defect, impact and failed evidence in [the Temporal defects ledger](docs/TEMPORAL-DEFECTS-LEDGER.md), then continue project implementation. Reopen SDK work only when the owner explicitly directs that work; a general request to continue implementation or fix project failures does not reopen it. Preserve failed qualification and existing dependency-approval rules without making SDK repair a prerequisite for independent implementation.

### Balance semantic breadth and usable delivery

Advance Practical CIB7 Coverage through usable, evidence-closed business-process capabilities. After an approved semantic increment, prioritize its remaining Lean/TypeScript agreement, independent review, applicable Temporal recovery/replay, public registration and whole-model journey before opening another independent semantic family. Reuse valid evidence and established hosting mechanisms; run qualification proportionate to the changed behavior and preservation risks, without rebuilding every layer for each model. [PLAN.md](docs/PLAN.md) owns the selected increment and closure sequence.

Double-check recommendations against the owning evidence, then implement within the authorized scope without returning routine decisions to the owner. Never stop at an apparent blocker: reconsider its cause and attempt a concrete correction or alternative qualification path first, then record any remaining missing evidence and next action. If work drifts into case-by-case fixes, tell the owner immediately, revise the shared model or mechanism, and continue; never weaken quality gates or coverage claims to manufacture completion. Continue independent authorized semantic work when closure cannot presently advance; do not accumulate private checkpoints merely because breadth is easier than qualification. Keep semantic, hosted and user-facing evidence separate, and retain all quality gates and resource constraints. Measure progress by useful behavior whose applicable acceptance boundary is closed, not by proof volume or test counts.

Keep runtime investigation subordinate to the selected BPMN delivery increment. Once a defect has a demonstrated cause or a documented qualification limit and a concrete alternative has been evaluated, record the result and continue independent acceptance work; do not expand into repeated probes, private cross-platform builds or runtime maintenance. Reopen investigation only for new corrective evidence or a specific remaining acceptance decision, with the deciding witness and a bounded exit condition named first. A known upstream defect does not justify weaker gates, an unapproved workaround or claiming public readiness. [PLAN.md](docs/PLAN.md#exact-resume-point) owns any current investigation hold.

### Established practices

Default to common, established ecosystem practices and native tool mechanisms. Do not invent a bespoke abstraction, policy, manifest, workflow, or duplicate source of truth when the standard practice satisfies the requirement. When a concrete project constraint requires a deviation, explain the standard approach, the exact gap, and the tradeoff to the owner and obtain approval before implementing the deviation.

If ordinary work exposes a defect in the documentation control plane, surface it and treat it as a regular project defect: identify the root mechanism, reproduce the class with a separating guard, fix it proportionately, and continue the selected work. Do not silently route around the defect or automatically reopen a special documentation programme.

Follow the [database test selection and cadence](docs/PLATFORM-VERIFICATION-POLICY.md#database-test-selection): SQLite tests execute local persistence operations sequentially; real PostgreSQL tests own database concurrency and shared replicas. Retain concurrency coverage in the explicit PostgreSQL lane instead of introducing competing SQLite workers. Ordinary package tests require no PostgreSQL server. Run the focused affected PostgreSQL witness when its behavior changes, the complete shared-mode gate at integration, and the clean path-selected pre-push gate before a relevant push; do not require the full shared-mode suite after every local commit.

For Product 2 PostgreSQL runtime or migration work, run the explicit runtime witness with `./scripts/pnpm.sh run test:platform-postgresql:runtime:local`. Run the complete shared-mode witness with `./scripts/pnpm.sh run test:platform-postgresql:local`; after committing PostgreSQL-backed platform changes, run `./scripts/pnpm.sh run test:pre-push:platform-postgresql` against an explicit database or use the local disposable-cluster command.

Preserve cached Docker images needed for future builds, tests, or demos, especially the pinned Temporal image. Clean up task-owned containers without deleting reusable images; broad image or system pruning must not discard those dependencies.

### Before frontend recommendations

Consult the existing decisions before recommending a frontend library, routing approach, state owner, component system, or application structure. This applies to discussion and review as well as implementation. Read these owners in order:

1. [Platform stack research](docs/research/BPM-PLATFORM-STACK-RESEARCH.md): owner requirements, coherent-stack rationale, alternatives, recorded decisions, and open choices.
2. [Architecture](docs/ARCHITECTURE.md#user-interface): implemented ownership and the [decision register](docs/ARCHITECTURE.md#architecture-decision-register), especially ARC-010, ARC-012, and ARC-015 and their reopen conditions.
3. [Information architecture](docs/BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md) and [UI design](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md): user-facing terminology, navigation, draft and uncertain-command continuity, component ownership, and acceptance boundaries.

Explain which existing decision the recommendation preserves or reopens and why the current requirement meets its reopen condition. Distinguish adopted choices, research candidates, deferred scope, and new recommendations; mentioning a library in research does not authorize its adoption. Prefer the established coherent stack and maintained ecosystem mechanisms. Keep these owners authoritative rather than duplicating their decisions here; the source preflight below additionally applies before material UI implementation.

### Product 2 UI/UX source preflight

Apply [content-first presentation](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md#content-first-presentation) before choosing components: identify what users need to scan, read and do. Tables hold compact comparable summaries; long or structured record details need a separate reading area. An API-shaped layout and passing geometry checks do not establish a usable design.

Design from the user's complete journey before arranging screens: name the objective, primary action, visible outcome and next action in the owning information architecture. Make essential actions visible where their object is shown; tabs and technical selectors must not force users to discover the sequence. Across the product, use visibly styled, verb-labelled buttons for actions, links for navigation, and plain text for object names and descriptions. Never make an essential action depend on an unmarked clickable title, row, card or colored area. Follow [the UI control guideline](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md#components-and-patterns), including native tabs, disclosures and form controls. Verify the complete journey and visual button affordance as well as geometry, public prerequisites and keyboard behavior.

For every material Product 2 UI/UX surface, inspect CIB Seven first when it has an analogous capability, using its current product documentation and the pristine pinned source rather than memory or screenshots alone. Run the `research` doctor scope and complete the [source-grounded design preflight](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md#source-grounded-design-preflight) before production code. Use other established products to fill a gap or provide an independent comparison. Record what the project adopts, deliberately changes, and excludes, with the published engine or platform fact that justifies each deviation. This is design research, not permission to copy code, styling, assets, private data models, or product terminology.

Apply [disclosure and dialog design](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md#disclosures-and-dialogs) consistently: optional information expands inline with an explicit Show/Hide button; bounded forms and decisions use the shared modal with a backdrop, focus containment and obvious dismissal; long activities use a dedicated view. Never position a disclosure over unrelated content or present an overlay without a clear way to close it. Verify keyboard collapse/dismissal, focus return and pending/error states, not just the open screenshot.

### Semantic code

For Lean implementation and proof refactoring, follow [Lean proof design and review](docs/REVIEW-POLICY.md#lean-proof-design-and-review). Start from the composed guarantee and reusable invariants; reassess repeated implementation unfolding or growing prerequisite chains before adding more local lemmas. Keep the bounded next outcome in [PLAN.md](docs/PLAN.md#exact-resume-point).

#### Forward-compatible semantic restrictions

A bounded capsule may restrict the BPMN models, states, or schedules it admits, but it must not present that restriction as the general meaning of the BPMN construct. Before approving a representation or semantic rule, compare it with the complete applicable standard account and verify that later standards coverage can broaden admission or behavior without invalidating the representation or reinterpreting models already accepted under the capsule. Record conforming but deferred behavior explicitly, and redesign before implementation when the chosen representation would foreclose it.

Use red/green TDD:

1. run `node scripts/what-binds.ts <path>...` on every path the change will add or grow, and treat its guard, registry, and `OWNER` headroom lines as constraints on the plan rather than as output to skim;
2. identify the normative requirement, CIB probe, or explicit open interpretation;
3. add the smallest separating executable example;
4. complete the capsule's Temporal hosting/refinement preflight before production Lean or semantic-core implementation;
5. confirm failure for the intended missing mechanism;
6. implement the semantic root rather than a case-specific patch;
7. run the focused gate and then the complete applicable gate;
8. update the owning research, experiment, implementation, and plan documents.

For coverage work, begin from the BPMN requirement and reusable mechanism. Add CIB source admission, probes, profile rules, and retained evidence only when the standard is ambiguous, the selected compatibility profile differs or adds behavior, a real downstream model requires an extension, or the Temporal mapping needs an engine observation. Do not require a CIB extension merely to complete a vendor-neutral BPMN capsule.

The project-owned executable corpus co-evolves with the implemented engine. Every registered executable BPMN element or semantic variant must be covered by at least one retained project-owned whole model with a concrete business purpose. Add the model, exact pipeline binding, canonical capability/restriction row, generated corpus map, and Product 2 About-page disclosure atomically with the support change. The guard derives the supported set from registered scenario XML and must fail when the catalog or retained-model union drifts. Do not label an isolated element fixture “real-world” merely to satisfy coverage; use a credible business narrative, and keep browser-catalog eligibility separate until the complete user journey is green.

Use the BPM platform as a prioritization and later acceptance lane: first ask which standard mechanism its next milestone forces, then which CIB overlay is actually required, and only then which platform binding remains. A target-shaped feasibility fixture may test the full composition once; subsequent models using the same lower-layer contract belong in platform regression evidence rather than new semantic implementations.

The Temporal preflight is an early feasibility and information-preservation review, not evidence that the adapter already refines the core. It must distinguish a finite conformance-scenario host from the intended production lifecycle and must send unresolved mappings back to research or profile review before they become implicit adapter policy.

Prefer enum-based pattern matching or switch statements for semantic variants. Keep the Semantic Process program immutable and runtime state separate and serializable; keep effects explicit and perform no I/O in the pure semantic core.

### Delegated implementation

Model tiers are symbolic (HIGH, MEDIUM). Resolve them through the tier table in your global instructions; the maintainer's table is [Model tier mappings](https://github.com/mbackschat/coding-setup/blob/main/CLAUDE.md#model-tier-mappings). Without such a table, run HIGH on your most capable model and MEDIUM on a faster, cheaper one, and say which models you used.

The root integrator is HIGH. Delegate bounded work to MEDIUM when it repays the handoff cost; keep judgment, integration and acceptance with HIGH. Delegation within these rules is authorized without per-task permission.

Prefer reusing a completed MEDIUM agent for related follow-ups while its assumptions remain valid. Keep the same agent through implementation, assigned testing and corrections with explicit file ownership. While a delegated Lean lane is active, defer edits to its targets’ transitive dependencies. Confirm its prior work has stopped and replace its assignment explicitly. Use fresh context for unrelated work, changed assumptions or required independence.

Give each new agent a task-shaped name and a concise brief covering one complete bounded outcome, affected consumers and proofs, constraints, owned paths and validation. Batch related work through implementation, tests and corrections into one handback; avoid helper-sized assignments, repeated polling and idle waiting updates. Reserve cleanup within the timebox. Run focused checks during development and broader affected-consumer gates after related changes stabilize, preserving required acceptance gates. Start with one MEDIUM worker; add concurrency only for independent work with disjoint file ownership/build outputs and review capacity. HIGH takes over proof or design decisions after repeated failure; do not delegate another equivalent attempt.

HIGH checks handbacks and owns integration, [commit boundaries](docs/REVIEW-POLICY.md#commit-boundaries) and acceptance; inspect evidence without duplicating the worker's investigation. Follow the [delegation protocol](docs/REVIEW-POLICY.md#delegated-implementation-protocol) for limits and [independent-review rules](#independent-cold-review); implementers cannot review their own work. At each bounded outcome, assess accepted results against rework, context/handoff, polling and validation cost, using measured usage when available; self-correct task size, reuse, concurrency and gate cadence. Failed attempts count as rework. Do not claim unmeasured token savings. Report assessments only when asked.

### Independent cold review

For a Lean-bearing stage, apply [Lean proof design and review](docs/REVIEW-POLICY.md#lean-proof-design-and-review) during the static scan and retain its instruction in the review prompt. Compilation alone does not establish adequate modeling or proof composition.

Before a material proposal, semantic checkpoint, or closure, read and apply [the independent cold-review gate](docs/REVIEW-POLICY.md#independent-cold-review-gate). Materiality depends on changed BPMN meaning, profile/CIB relationship, checked-source/IL or runtime representation, admission, public observation, transition family, proof boundary, or Temporal refinement claim. Work changing none of these opens no review cycle; executable guards and the applicable complete gate govern it.

The owner defines stage timing, neutral prompts, the target-bound semantic review packet, receipts, and corrections. Commit the exact target and pause edits at the required boundary. Paste the generated packet verbatim; require the complete capsule, stage-specific owner context, an issue-first static scan and decisive adversarial probes before CPU-heavy gates. Required corrections block the stage. The exact same reviewer audits bounded corrections; material redesign requires a new cold review. A green independent verdict establishes approval and the proposal's `Lifecycle` transition without another human approval step. If the required review is unavailable, stop the affected stage rather than substituting self-review.

Spawn each cold reviewer with no forked turns and without a model or reasoning override (`fork-turns-none`). Cold or warm, every reviewer uses the root agent's same model and reasoning effort; never substitute a generic or general worker tier. Reviewers remain read-only, and implementation agents cannot review their own work. Author context, full-history forks, or prior review conversations do not satisfy cold isolation.

Use [the warm-review rules](docs/REVIEW-POLICY.md#when-a-warm-review-is-valid) for correction audits, non-governing preflights, non-material independent integration review, and guarded warm closure continuity. Closure is cold by default: the exact approved checkpoint reviewer may continue warm only when the executable manifest proves unchanged selected account, public contract, exclusions, and evidence strategy. The single-lane atomic closure exception requires the first green target to contain all closure evidence and no downstream lane to have crossed an unreviewed checkpoint.

Follow [the three-level verification policy](docs/TESTING-SPEC.md#three-level-verification-policy), reuse valid unchanged evidence, and name only decisive focused gates in review prompts. A review or commit alone does not require repository-wide verification. When due, that gate may run concurrently with read-only review because it changes no tracked files.

Maintain the required `## Status` and [Independent cold-review receipt](docs/REVIEW-POLICY.md#review-receipt), including immutable targets, isolation, verdicts and correction audits. Recorded commits must be ancestors of `HEAD`; isolation is an attestation, not something Git proves. Historical transitions and the grandfather selection remain owned by the review policy. Contributors may not approve, append, rebase, or replace the grandfather set fixed by `f1ef362`; changing it requires an owner-governance decision.

### Comments — document semantic surplus

Comments explain semantic surplus: non-obvious contracts and invariants that cannot be recovered reliably from names, types, and control flow. When a change introduces, relies on, or exposes such a fact, document it in the same change instead of deferring a later comment pass. This includes concurrency interleavings, fail-closed behavior, consistency or snapshot boundaries, ownership and mutability, deterministic ordering, resource limits, portability constraints, and tempting alternatives that would violate the contract. There is no target comment density; comment according to the source's role.

- Public API: Javadoc or TSDoc states the contract, defaults, failure behavior, ownership or mutability, portability constraints, and any non-obvious example. Do not expose implementation history.
- Semantic and evaluator code: document observable behavior, legal domain, ordering, degradation behavior, and the evidence or oracle behind surprising semantics. Comment a branch when its correct interpretation is not evident from the code or when a tempting alternative would be wrong.
- Boundary and infrastructure code: document trust boundaries, normalization, resource limits, deterministic ordering, cache lifetime and invalidation, concurrency, and host-specific behavior. Do not narrate ordinary plumbing.
- Algorithms and data structures: document representation invariants, convergence or concurrency assumptions, and material complexity or performance constraints. Comment a helper when its correctness depends on an invisible state transition or on rejecting a plausible alternative. Do not restate the type declaration or loop.
- Tests: class-level documentation names the contract and oracle. Test names describe cases. Inline comments are reserved for a discriminating fixture, intentional perturbation, provenance constraint, or otherwise invisible setup fact.
- Keep comments durable: release-set identifiers, chronology, implementation status, and “currently” claims belong in proposals, gap ledgers, or Git. Stable finding or specification identifiers are welcome when they provide traceable evidence.
- Delete or shorten a comment when refactoring makes it redundant. A stale or broader-than-evidence comment is a defect.
- Apply a deletion test to every added or materially changed Lean comment: if deletion loses no contract, invariant, ordering, failure distinction, ownership fact, evidence provenance, resource boundary, or realistic false alternative, improve the name, type, theorem, or module boundary and omit the comment.
- Never add or retain comments to satisfy a ratio, coverage count, minimum word count, or declaration quota, and never generate comment or docstring stubs. State a shared invariant once at its narrowest owner rather than repeating it across fields, helpers, fixtures, or proofs.
- In maintained non-experimental files named `Conformance.lean` or ending in `Conformance.lean`, give every durable checked fact a descriptive public `theorem` name. Reserve `private theorem` for supporting lemmas and do not add a docstring when the name and proposition already carry the contract.
- Keep routine private helpers, decoder plumbing, and tactics uncommented. A private helper with a non-obvious contract or invariant is not routine and must document that fact at its narrowest owner. Necessary comments count normally toward source-size review; split a crowded owner by semantic responsibility instead of compressing code or deleting useful explanation.

### Code hygiene and module boundaries

Keep each source file, class, namespace, and function at one semantic or infrastructure responsibility and one level of abstraction. A third independent responsibility, a function that combines validation, orchestration, mutation, and projection phases, or a class that owns unrelated lifecycle boundaries is a code smell even when its line count is below a threshold. Stop feature work, name the responsibilities, and extract cohesive owners before extending it.

Target at most 800 nonblank lines per hand-written Lean, TypeScript, JavaScript, or Java source file. Twelve hundred nonblank lines is a hard ceiling: do not commit a hand-written source file above it. A reviewed 800–1199-line file may remain only with explicit owner approval, while it has one cohesive responsibility, and while splitting it would expose private construction details without creating a useful independently testable or buildable owner. Record that narrow exception in the executable source-hygiene guard; an agent may not approve or add its own exception. Line compression, comment deletion, and moving code into an untyped utility bag do not satisfy the rule.

A nontrivial Lean module starts with `/-! ... -/` documentation naming its purpose, semantic scope, and boundary. Use `/-- ... -/` for public semantic declarations and main theorems when their contracts are not already evident from types and names. Every semantic family must remain independently buildable at its narrowest owning module. Umbrella modules only assemble imports; they contain no definitions, proofs, fixtures, or executable cases.

Lean leaf modules import their narrow semantic owners and never the aggregate `BpmnSemantics.SemanticProcess` umbrella. Put reusable fixture construction in a cohesive support module that imports only the representation it constructs; do not make a basic constructor depend on retained models, scenario execution, profile admission, or unrelated proofs merely because those artifacts once shared a fixture file. Keep [`lean-import-boundaries.test.ts`](scripts/lean-import-boundaries.test.ts) green when adding or moving a Lean module.

Split Lean code by semantic ownership, not into equal-sized chunks. Keep a family’s fixtures and laws with that family, and extract a shared helper or theorem when two concrete semantic consumers require exactly the same invariant and result domain, including a consumer in the current increment. Name both consumers and verify their distinct obligations through the shared contract; completion of duplicate implementations is not a prerequisite for sharing. Do not replace a monolith with an include chain, universal fixture module, registry, or new harness. During red/green work, build the narrow extracted module before the umbrella integration gate.

Before adding a semantic family, inventory its existing checked-source types, lowering, runtime state, evaluator clauses, relations, laws, fixtures, observations, and adapters. Reuse a representation only when its meaning matches exactly; derive family-specific theorems by specialization when the proposition genuinely agrees rather than accumulating renamed restatements.

For TypeScript and Java, prefer small typed collaborators over a runner or manager that parses, validates, schedules, mutates, projects, and cleans up in one class. Keep wire decoding, semantic orchestration, host lifecycle, evidence extraction, and canonical projection in separate owners. An extraction is complete only when the new owner has a narrow public contract and a focused test or compile target; forwarding every call through the old god object is not a completed split.

TypeScript data and wire contracts are deeply immutable at compile time. Use the single project-owned `DeepReadonly<T>` utility for nested immutable contract shapes instead of repeating `readonly` at every property, and keep that utility tuple-preserving, union-distributive, and transparent to function types. Use ordinary `readonly` for a shallow contract only when nested values are deliberately mutable and that ownership is documented. Lock the convention with compile-time negative checks covering top-level, nested-object, and array or tuple mutation.

For concrete TypeScript definitions and fixtures, prefer `as const satisfies Contract` so literals remain narrow while the complete shape is checked; do not use `as Contract` to silence incompatibility. Model semantic alternatives as closed discriminated unions, keep recurring concepts in one named type, and require exhaustive enum-based switches with a `never` check. Directly executed TypeScript must stay within Node's erasable-syntax subset: use an `as const` value object plus a derived union instead of constructs such as `enum` that require JavaScript emission, and keep the executable erasable-syntax guard green. Avoid optional-boolean mode bags, parallel near-duplicate object shapes, broad index signatures, and clever conditional-type machinery that makes public compiler errors harder to understand. A type abstraction must remove real repetition for at least two consumers without weakening exact field, tuple, or union information; target TypeScript contributors should be able to discover and use the contract from editor tooling without reading its implementation.

Write idiomatic TypeScript rather than Java translated into TypeScript. Prefer immutable data plus small pure functions and cohesive ES modules over stateful utility classes, factories, builders, bean accessors, namespaces, and nominal wrapper ceremony. Accept `unknown` at untrusted boundaries and narrow it with explicit validators or type guards; avoid `any`, non-null assertions, unchecked casts, and catch-all string dictionaries. Let local implementation types infer when the result remains obvious, but annotate exported contracts, semantic functions, recursion boundaries, and callback ownership. Keep async control flow explicit with `async`/`await`, propagate typed domain results separately from thrown infrastructure failures, and never hide ordering, cancellation, timeout, or resource lifetime behind a convenience abstraction.

Write idiomatic Lean rather than imperative evaluator code transliterated into theorem syntax. Represent semantic domains with distinct structures, inductive types, and propositions; use total pattern matching and structurally clear recursion; keep executable definitions separate from declarative relations and reusable laws. Prefer small named lemmas with meaningful hypotheses, library combinators, and readable `cases`/`induction`/`simp`/`rw` proofs over duplicated theorem bodies, giant tactic blocks, Boolean encodings of propositions, or proof-by-serialization. Default to `decide +kernel` for finite decidable facts, never plain `decide`; when reduction is obstructed, follow the decision-procedure guidance below before choosing equation lemmas or proof-producing `cbv`. Finite fixtures do not replace quantified laws. Before changing decision tactics or code reduced by kernel-decided fixtures, read [the decision-procedure measurement rules](docs/CONTRIBUTOR-SETUP-GUIDE.md#lean-decision-procedures-and-build-memory). Measure memory as well as CPU under an enforced bound and build one narrow target before the full gate. Preserve domain-specific identifier types, keep JSON and wire conversion at boundary modules, and do not weaken types or expose evaluator internals merely to shorten a proof.

When an enforced resource ceiling catches a real regression, treat the breach as design evidence and a checkpoint blocker rather than as a flaky build. Preserve the exact command, limit, exit status, peak measurement, affected target, and failing mechanism in the owning resource evidence; identify and correct the root amplification mechanism; lock the intended fast path or bound with an executable guard or quantified theorem; and rerun the deciding target under the unchanged ceiling. Because unrelated machine activity may perturb elapsed time and peak measurements, tolerate it and repeat an anomalous run, but never raise or bypass the limit merely to pass. Report the failure, correction, remaining margin, and measurement caveats together; do not shorten the account by dropping relevant failed attempts or intermediate evidence.

Before the first edit of an atomic change, run `node scripts/what-binds.ts <path>...` on every path the change will add or grow. It reports each owner's remaining size headroom, the executable guards whose assertions already constrain those paths, and the registries with a same-change obligation. Answer *what already binds this work?* from that output, never from recall: guards here constrain artifact shape by tree as often as by file, so a plan written from memory can name a change site whose oracle it never read. Do not let the compiler discover the shape of the work either: using type errors to enumerate change sites is efficient for finding them, but it means the plan is already mid-edit when a full owner forces an extraction. When an owner is nearly full, resolve its semantic ownership before adding more code. Keep supporting extraction with the coherent outcome under [commit boundaries](docs/REVIEW-POLICY.md#commit-boundaries); a separate commit is appropriate for an independently useful architectural repair, not automatically for crossing a size threshold.

The source-hygiene gate detects hard file-size violations and requires an explicit reviewed justification for every file above the 800-line target. It complements design review; it does not make a file, class, or function clean merely because the counters pass.

BPMN XML parsing, admission, and lowering run before Workflow start with an explicit byte limit and parser Promise-settlement deadline. The current timeout cannot preempt synchronous parser CPU; production untrusted uploads still require a bounded Worker or process. Every new Workflow execution must contain the admitted current executable definition; no fallback constructor may invent it.

Close each approved semantic capsule across distinct claim lanes: normative or profile clause, separating witness, executable Lean definition, useful law with exact hypotheses, nearest checked non-law, retained CIB observation at an explicit fidelity, independent TypeScript behavior, Temporal refinement/replay evidence, and exact status in every applicable detail map routed by [`implementation-status-router`](docs/IMPLEMENTATION-MAP.md). These dimensions may complete independently; never summarize them with one undifferentiated “supported” claim. [SEMANTIC-VERIFICATION-POLICY.md](docs/SEMANTIC-VERIFICATION-POLICY.md#evidence-lanes) owns the per-claim independence test and disclosure of shared failure modes.

Give every material semantic rule a stable capsule-owned identifier and a rule-to-evidence row. An editorial correction may retain an identifier; a materially different proposition requires a new identifier and, when already used by evidence or running instances, the applicable profile or artifact version change. Rule identifiers are traceability labels and do not enter runtime wire contracts without a concrete consumer and versioning decision.

For each new runtime-transition family, keep a declarative Lean relation distinct from the executable evaluator and prove that every evaluator-produced transition is permitted by the relation. That bridge counts as a dispatcher and constructor-selection check, and as an independent semantic evidence lane only where the relation arm states premises the evaluator does not supply; an arm whose premise is the evaluator's own result cannot fail apart from it, so cite runtime-state well-formedness preservation and monotonicity for those instead. Where that Lean preservation is an open lane, cite the executable core-side lane and say which it is; do not cite a quantified result that does not exist. Claim completeness, determinism, or equivalence only with exact checked hypotheses; nondeterministic semantics must receive an explicit semantic choice rather than inherit evaluator order. Keep the TypeScript semantic core independently implemented.

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
10. compare the capsule's commit-bounded nonblank code and documentation churn recorded in [CAPSULE-COST-LEDGER.md](docs/CAPSULE-COST-LEDGER.md) with the previous comparable capsule; use elapsed wall time only when explicit start and closure timestamps exist, otherwise record it as unknown rather than answering by impression, and remove one identified process weight before starting the next capsule when the measured cost did not fall. The removed weight must bear on the measure that rose, or the row states why no such weight exists; a removal on an axis that already improved leaves the growing cost unaddressed and satisfies the only subtractive rule in this process without subtracting anything;
11. answer the fixed [self-assessment questions](docs/PROCESS-ASSESSMENT-LEDGER.md#self-assessment-questions) and inspect matching findings through the [finding index](docs/PROCESS-ASSESSMENT-LEDGER.md#finding-index) and either add a row or record that none applied; this assesses how the work was carried out and is separate from the claim review above;
12. decide whether the result changes the next best step;
13. complete the applicable proposal, conditional semantic-checkpoint, and closure reviews under [the independent cold-review rule](#independent-cold-review) before crossing their stage boundaries.

Answer the same self-assessment questions at each session handoff, not only at a capsule boundary. A finding that already has a row gets its instance count incremented rather than a second near-duplicate row, because that count is what the escalation rule reads: recurrence requires an executable guard or an explicit explanation that the class is unguardable under the ledger’s closed dispositions. Assume your own fresh prose does not bind you.

Turn every escaped issue into either a reusable review question or an executable guard, and record it in [the process-assessment ledger](docs/PROCESS-ASSESSMENT-LEDGER.md) so a repeat is distinguishable from a first occurrence. Record each resulting correction in its existing owner: semantic meaning in the applicable [capsule](docs/capsules/README.md), durable product and semantic boundaries in [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md), concrete package and deployment architecture in [ARCHITECTURE.md](docs/ARCHITECTURE.md), evidence and guards in the focused owner selected by [TESTING-SPEC.md](docs/TESTING-SPEC.md#select-the-task-owner), implementation status in the applicable detail map routed by [`implementation-status-router`](docs/IMPLEMENTATION-MAP.md), immediate sequencing in [PLAN.md](docs/PLAN.md), and only reusable contributor behavior in this file. Do not create a retrospective diary per capsule.

### Architecture experiments

A bounded spike requires competing accounts and a witness capable of separating them. End it as:

- an adopted capsule through the normal profile/evidence process;
- a precisely recorded unresolved boundary;
- or a representation correction with affected semantics, proofs, serializers, and adapters re-audited.

An architecture experiment may measure an implementation choice only after a named consumer or standing proof/refinement obligation forces that choice. The existence of a product consumer is an input to the experiment, not an outcome that implementation can discover. Do not interpose a speculative architecture experiment ahead of approved capsule work when its deciding fact is an unmade product decision.

Do not generalize after one consumer. Retain a provisional implementation only while it remains a useful discriminator.

Before measuring a staged line ceiling, anchor the preceding stage to a commit or record a reproducible baseline of exact files and nonblank counts. Do not publish an exact per-stage delta that can be reconstructed only from prose or an uncommitted mixed-stage tree.

### Dependencies

**Routine npm updates must use stable releases at least 14 days old**, including transitive dependencies. Keep strict release-age enforcement, reject missing publication timestamps, verify frozen lockfiles and keep dependency install scripts disabled unless individually reviewed. An urgent security fix may bypass the waiting period only for an exact package version with a verified advisory, exposure assessment, reviewer, justification and expiry when the release reaches 14 days. Never exempt a whole package or scope, disable the policy globally, or suppress an advisory to make a build pass. Follow the [security update procedure and exception register](docs/CONTRIBUTOR-SETUP-GUIDE.md#dependency-security-procedure). Age reduces exposure to newly compromised releases; it does not establish safety.

Keep each component’s dependencies at the smallest approved set and add one only when a concrete capability requires it. Obtain explicit user approval before adding, removing, upgrading, vendoring, or replacing any Lake, Java, Node, pnpm, Temporal, parser, test, build, or runtime dependency. **This applies to the BPM platform exactly as it applies to the engine.** A platform dependency cannot reach the semantic core, but that is not what the rule protects: under [the platform's dependency posture](docs/PROJECT-DESIGN.md#dependency-posture) every resolved package is attack surface, while maintained MIT-compatible work is preferred over reimplementing a solved problem. Weigh a candidate against the whole alternative, including the defects we would own, not against its package count.

Record exact version, role, license, provenance, and removal cost before adoption.

Declare only direct production dependencies in the owning `package.json`, commit `pnpm-lock.yaml`, and require frozen-lockfile installation in CI so the lockfile remains the one exact resolution authority. Use `overrides` only for a documented transitive correction, not to duplicate the lockfile. Review the resolved production graph when adopting or upgrading a direct dependency and keep the whole graph inside the approved licence policy. Do not maintain a second hand-copied transitive-version inventory or an arbitrary resolved-package-count budget. The BPM platform uses pnpm's production licence report as its graph oracle; [`platform/license-policy.json`](platform/license-policy.json) owns only the permissive licence allowlist and exact non-standard licence exceptions. Prefer a built-in capability, a bounded hand-written owner, or doing without over a dependency whose value is convenience.

Every workspace package that publishes `dist/` owns its own `build` script. Root build commands select a target package and let pnpm derive and topologically build its transitive workspace closure from package manifests. Do not duplicate that graph with a root-level `tsc` chain or hand-maintained package order; such a chain is allowed only after explaining a concrete limitation of pnpm's graph and obtaining owner approval.

## Documentation ownership

Before editing the root README or its explanatory infographic copy, read and apply [the top-level README audience contract](docs/DOC-DISCIPLINE.md#top-level-readme-audience).

Use one owner for each fact and link to it elsewhere:

| Information | Owner |
|---|---|
| Document roles, suffix contracts, lifecycle, placement, and same-change triggers | [DOC-DISCIPLINE.md](docs/DOC-DISCIPLINE.md) |
| Infographic creation, revision, AVIF publication and ignored local PNG masters | [INFOGRAPHICS.md](docs/INFOGRAPHICS.md); use the linked infographic-bytebytego-style skill |
| Mission, authority, and approved durable boundaries | [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md) |
| Concrete repository layout, module ownership, dependency direction, and deployment shape | [ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Semantic Process IL contract, exact proof boundary, maintained obligations, and growth rules | [SEMANTIC-PROCESS-IL-SPEC.md](docs/SEMANTIC-PROCESS-IL-SPEC.md) |
| Reviewed BPMN Process Execution requirements and dispositions | [BPMN-REQUIREMENT-LEDGER.md](docs/BPMN-REQUIREMENT-LEDGER.md) |
| Downstream A12 model, delegate, façade, blueprint, and migration-adoption denominator | [A12-WORKFLOWS-COMPATIBILITY-LEDGER.md](docs/research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) |
| Route to exact current implementation, proof, test, and absence status | [`implementation-status-router`](docs/IMPLEMENTATION-MAP.md) and its registered detail maps |
| Current checkpoint, ordered work, blockers, and resume point | [PLAN.md](docs/PLAN.md) |
| Commit-bounded completed capsule and enabling-increment cost | [CAPSULE-COST-LEDGER.md](docs/CAPSULE-COST-LEDGER.md) |
| Retained Lean resource measurements and calibration evidence | [Resource evidence directory](docs/lean-resource-costs/README.md) |
| Self-assessment questions, retained process findings, and their dispositions | [PROCESS-ASSESSMENT-LEDGER.md](docs/PROCESS-ASSESSMENT-LEDGER.md) |
| CIB behavior relative to BPMN: agreements, operational details, interpretations, extensions, configuration, limitations, and deviations | [CIB-BPMN-RELATION-REGISTER.md](docs/CIB-BPMN-RELATION-REGISTER.md) |
| Bounded project-owned semantic meaning, laws, witnesses, and exclusions | [docs/capsules](docs/capsules/README.md) |
| External-system and semantic-background findings | [docs/research](docs/research/README.md) |
| Bounded executable questions and results | [docs/experiments](docs/experiments/README.md) |
| Gate selection and cadence | [TESTING-SPEC.md](docs/TESTING-SPEC.md) |
| Review, delegation and proof-design assessment | [REVIEW-POLICY.md](docs/REVIEW-POLICY.md) |
| Domain evidence and execution procedure | The relevant [task-selected testing owner](docs/TESTING-SPEC.md#select-the-task-owner) |
| Clean-machine and coding-agent setup | [CONTRIBUTOR-SETUP-GUIDE.md](docs/CONTRIBUTOR-SETUP-GUIDE.md) |
| External revisions, licenses, and checkout navigation | [SOURCES.md](docs/SOURCES.md) |

Before adding, renaming, moving, graduating, archiving, or deleting a document, follow [DOC-DISCIPLINE.md](docs/DOC-DISCIPLINE.md). `-SPEC` is reserved for an implemented current contract; approved but unimplemented intent remains `-PROPOSAL`. Write one Markdown paragraph per line without hard wrapping. Use regular relative Markdown links for other project documents. Update the owner and every index or inbound link in the same change, and avoid copying live inventories.

Keep every `README.md` human-facing: explain the component's purpose and user-visible capabilities, give the shortest useful quick start, and link to deeper material. Repository-wide contributor and agent instructions belong only in canonical `CLAUDE.md`, with `AGENTS.md` preserving its symlink. When dense contributor navigation is genuinely necessary, move it into a linked purpose-named document: use `SOURCE-MAP.md` for source-file ownership and implementation inventories, or another existing role suffix such as `-REGISTER.md` or `-GUIDE.md` only when that role contract matches. Do not create a generic `INDEX.md`; its name hides why the document exists. Keep normative contracts in their owning specifications and link them rather than duplicating them into a README or source map.

Treat feedback efficiency and development speed as non-negotiable engineering constraints. Keep test selection proportionate and nonduplicative: during development run the smallest separating oracle, before a regular commit run that focused oracle plus the complete affected package, before push run the exact clean-commit workflow selected by changed paths, and before a milestone or tag run complete verification and release acceptance. A composed gate builds a dependency graph once and reuses its artifacts; do not serially nest self-contained gates that rebuild the same packages, hide duplicate work behind package hooks, or make an unrelated expensive lane a prerequisite. Run independent selected workflows in parallel on GitHub. Repeat a test across operating systems, browsers, viewports, profiles, or targets only when that dimension has a distinct failure mode; do not multiply viewport-independent behavior merely because the harness can parameterize it. A time-budget breach requires root-cause correction rather than a longer timeout or weaker evidence. [The three-level verification policy](docs/TESTING-SPEC.md#three-level-verification-policy) owns the commands and exceptions.

Never activate the `linear-walkthrough` skill and never invoke `showboat` directly or indirectly. Author maintained Markdown directly and verify it only through the repository-owned documentation, infrastructure, and applicable complete gates.

Keep the top-level `README.md` as a durable project front door. Do not put live status, evidence counts, current support inventories, or next-work narration there; link to the detail maps routed by [`implementation-status-router`](docs/IMPLEMENTATION-MAP.md) and to [PLAN.md](docs/PLAN.md) instead. The sole non-semantic exception is governed by [the publication-statistics contract](docs/TESTING-SPEC.md#default-verification); follow that owner rather than restating its generated blocks or maintainer requirements here.

The rationale and transfer limits for the semantic-capsule workflow are recorded in [the `a12-kernel-lean` process-transfer study](docs/research/A12-KERNEL-LEAN-PROCESS-RESEARCH.md).

## Reference and source discipline

Reference checkouts are research inputs, never runtime dependencies of Lean or the semantic core. Navigate them through relative links recorded in [SOURCES.md](docs/SOURCES.md); never commit absolute home paths, usernames, hostnames, credentials, or machine-specific state.

External reference trees live by default under repository sibling `../oss`, with `BPMN_EXTERNAL_ROOT` as the portable override. Use the exact repository-owned setup and doctor workflow in [CONTRIBUTOR-SETUP-GUIDE.md](docs/CONTRIBUTOR-SETUP-GUIDE.md); never rely on a machine already containing the trees. Whenever an external implementation is relevant, inspect the applicable pinned checkout before relying on memory, generated summaries, or web search. An absent or mismatched registered input is an infrastructure failure, not permission to skip the lane. Cloning a reference repository does not approve it as a project dependency or semantic authority.

Project-authored code and documentation are released under the [MIT License](LICENSE). Do not copy, vendor, link, or redistribute external material under that license without verifying compatibility, preserving required notices and attribution, and recording the decision in [SOURCES.md](docs/SOURCES.md). The stricter A12 boundary in the non-negotiable rules applies even if another technical or licensing arrangement might otherwise be possible.

The downloaded OMG PDF, machine-readable files, examples, Markdown conversion, and extracted figures are external local research material described by [the tracked reference pointer](docs/reference/bpmn-2.0.2/README.md) and stored by default at sibling `../oss/omg-bpmn-2.0.2`. Track only project-authored digests, provenance, hashes, and fetch/verification tooling; do not stage or redistribute the external corpus.

Read specification material from existing Markdown, HTML, or other searchable text in the registered source location first. For PDF-only material, create and check one reusable Markdown extraction beside the external source, then use it for subsequent work. Consult the PDF only for an identified extraction gap or ambiguity, such as a missing diagram or damaged table; retain corrections so the same passage does not need repeated extraction. Follow the [BPMN reading workflow](docs/reference/bpmn-2.0.2/README.md#reading-workflow) for the existing conversion and figures.

Before opening a PDF, name the specific gap in the text or extracted figures and the page or clause needed to resolve it. Do not bypass the search exclusions for routine reading or re-extract a whole PDF when the reading copy already exists. After a justified fallback, repair the external reading copy or retain a source-linked correction beside it. Source-hash verification and initial conversion may access PDF bytes without being reading fallbacks.

For CIB or Temporal source changes, preserve a clean pinned evidence lane and follow the branch, provenance, noninterference, and shadow-equivalence rules in [REFERENCE-INSTRUMENTATION-POLICY.md](docs/REFERENCE-INSTRUMENTATION-POLICY.md).

## Verification

The Lean toolchain is pinned in [lean-toolchain](lean-toolchain) and currently has no external Lake packages.

In a managed sandbox, agents must request host port-binding authorization before the first attempt to run `./scripts/verify.sh`, `./scripts/pnpm.sh run test:infrastructure`, `./scripts/pnpm.sh run test:temporal`, `./scripts/pnpm.sh run test:pipeline`, or `./scripts/pnpm.sh run test:timer-time-skipping`. Do not probe by running one of these commands inside the restricted sandbox first. A loopback-listener error containing `Operation not permitted` or `EPERM` means the sandbox denied local binding; it is not evidence of a port collision or a failing infrastructure or semantic test.

**Never invoke `lake` or `lean` directly. Use [the Lean wrapper](scripts/lake.sh): `./scripts/lake.sh build`, `./scripts/lake.sh test`, `./scripts/lake.sh run <source.lean> [arguments...]`, `./scripts/lake.sh exe <target>`, `./scripts/lake.sh env lean <file>`.** It is the single owner of Lean's build parallelism; [package.json](package.json)'s `config.leanBuildThreads` owns the value, and the wrapper derives it through [the pin reader](scripts/pinned-toolchain.sh), replaces any inherited `LEAN_NUM_THREADS`, and exports the fixed value. The wrapper also holds one fail-closed host lock, so a second repository Lean process tree refuses to start. An explicit `BpmnSemantics` target is forbidden because `./scripts/lake.sh build` already owns the root-integrator-only full gate; a focused command must name only its narrow targets. Build a runnable module explicitly and use `run` when a verification witness needs its `main`; programmatic `exe` invocations are forbidden because they regenerate and native-compile an already elaborated dependency closure. Never override the thread pin or start another Lean command while one has yielded. A sub-agent runs Lean only under the narrow-target conditions in [the delegated implementation rules](docs/REVIEW-POLICY.md#delegated-implementation-protocol).

Before launching verification, apply [command deadline selection](docs/VERIFICATION-INFRASTRUCTURE-POLICY.md#command-deadline-selection): use the selected gate’s documented allowance and resume yielded commands; never apply a focused-build timeout to the full Lean library.

Before Lean cost measurements or changes that can increase kernel-reduction cost, follow [memory-bounded Lean measurements](docs/CONTRIBUTOR-SETUP-GUIDE.md#memory-bounded-lean-measurements), including the decision-procedure and build-memory guidance there.

Select gates using [the three-level verification policy](docs/TESTING-SPEC.md#three-level-verification-policy) and [focused gate matrix](docs/TESTING-SPEC.md#focused-gate-matrix); these own prerequisites, composition and evidence scope. The compact index below preserves discoverability, not a requirement to run every gate for every edit.

Full verification: `./scripts/verify.sh`, followed by `git status --short`.

| Scope | Command |
|---|---|
| Lean and TypeScript | `./scripts/pnpm.sh run test:semantic` |
| TypeScript semantic core | `./scripts/pnpm.sh run test:semantic-core` |
| Semantic compile-time contracts | `./scripts/pnpm.sh run check:semantic-types` |
| Temporal refinement/replay | `./scripts/pnpm.sh run test:temporal` |
| BPMN source/compiler/CMOF | `./scripts/pnpm.sh run test:bpmn-source` |
| Contracts and retained evidence | `./scripts/pnpm.sh run test:contracts` |
| Direct TypeScript harness types | `./scripts/pnpm.sh run check:harness-types` |
| Source ownership/module boundaries | `./scripts/pnpm.sh run check:source-hygiene` |
| Platform foundation | `./scripts/pnpm.sh run test:platform-foundation` |
| Complete M1 platform packages | `./scripts/pnpm.sh run test:platform-m1` |
| Evaluation structure (no database) | `./scripts/pnpm.sh run test:evaluation-distribution:structure` |
| M2 Process-instance search checkpoint | `./scripts/pnpm.sh run test:platform-process-search-checkpoint` |
| M3 Work checkpoint | `./scripts/pnpm.sh run test:platform-work-checkpoint` |
| M4 Operations checkpoint | `./scripts/pnpm.sh run test:platform-operations-checkpoint` |
| M1 deployment showcase | `./scripts/pnpm.sh run test:showcase:m1` |
| M2 scheduling showcase | `./scripts/pnpm.sh run test:showcase:m2` |
| M2 Process-instance search showcase | `./scripts/pnpm.sh run test:showcase:m2-process-instance-search` |
| M3 human-work showcase | `./scripts/pnpm.sh run test:showcase:m3-human-work` |
| M4 incident-operations showcase | `./scripts/pnpm.sh run test:showcase:m4-incident-operations` |
| MUE Preview Alpha showcase | `./scripts/pnpm.sh run test:showcase:mue-preview-alpha` |
| M3 release acceptance | `./scripts/pnpm.sh run test:release:m3` |
| M4 release acceptance | `./scripts/pnpm.sh run test:release:m4` |
| MUE Preview Alpha release acceptance | `./scripts/pnpm.sh run test:release:mue-preview-alpha` |
| Product 2 deterministic UI quality | `./scripts/pnpm.sh run test:ui-quality` |
| Optional wide-Diagram screenshot review | `./scripts/pnpm.sh run test:ui-quality:visual` |
| Scripts/documentation/infrastructure | `./scripts/pnpm.sh run test:infrastructure` |
| Pure differential comparator | `./scripts/pnpm.sh run test:differential` |
| Optional pinned MIWG observations | `./scripts/pnpm.sh run test:miwg` |
| Optional timer time-skipping calibration | `./scripts/pnpm.sh run test:timer-time-skipping` |
| Complete differential/refinement pipeline | `./scripts/pnpm.sh run test:pipeline` |
| Executable model corpus (research doctor first) | `./scripts/pnpm.sh run test:model-corpus` |

MUE Preview Beta release acceptance builds Product 2 once and reuses Alpha, correlated Message and UI-quality lanes:

```sh
./scripts/pnpm.sh run test:release:mue-preview-beta
```

Product 2 package/browser gates remain outside `verify.sh` and Product 1 feedback loops. Install pinned Playwright Chromium before browser acceptance; retain M1 as the unseen-source regression floor when running M2. The deterministic UI-quality lane is independent of Temporal and covers 1280/1600 desktop widths. Platform harnesses use `tsconfig.platform-harness.json`; the engine harness excludes `platform/` and `*.platform-test.ts`.

Before an authorized push, commit intended changes, require a clean worktree, and run `./scripts/pnpm.sh run test:pre-push`. It derives workflow equivalents from committed changed paths and fails closed on missing/malformed filters. Its PostgreSQL lane uses an explicit database or a disposable local PostgreSQL 18 cluster. For focused diagnosis, the exact equivalents are:

```sh
./scripts/pnpm.sh run test:pre-push:verify
./scripts/pnpm.sh run test:pre-push:platform
./scripts/pnpm.sh run test:pre-push:platform-postgresql
./scripts/pnpm.sh run test:pre-push:showcase
./scripts/pnpm.sh run test:pre-push:ui
```

Specialized commands require their owning context:

| Trigger | Command and owner |
|---|---|
| Explicit evaluation start | `./scripts/pnpm.sh run evaluation:start`; [evaluation setup](docs/CONTRIBUTOR-SETUP-GUIDE.md#evaluation-distribution) |
| Explicit walkthrough screenshot refresh | `./scripts/pnpm.sh run walkthrough:screenshots:refresh`; [evaluation setup](docs/CONTRIBUTOR-SETUP-GUIDE.md#evaluation-distribution); isolated Compose project and transient-volume cleanup |
| CIB calibration | `./scripts/test-cibseven-oracle.sh`; [CIB gate](docs/SEMANTIC-VERIFICATION-POLICY.md#current-cib-gate) |
| Provisional representation experiment | `./scripts/lake.sh exe checkSemanticRepresentationSpike`; [experiment registry](docs/experiments/README.md) |
| Checked-source relation experiment | `./scripts/lake.sh exe checkCheckedSourceRelationExperiment`; [experiment registry](docs/experiments/README.md) |

Evaluation and screenshot refresh start service dependencies and are outside ordinary verification. `test:infrastructure` includes a loopback-port allocation test, so it also requires host port-binding authorization in a managed sandbox.

Every helper process a contributor or agent starts must be able to terminate itself. Bound it with `timeout`, an explicit deadline, or a fixed iteration count, so that an exception, a tool timeout, an interrupt, or a forgotten cleanup step cannot leave it running. Do not rely on a later `kill` as the only exit: the parent may never reach it, and a background job whose parent exits is reparented to `init` and outlives the session.

Never recover those identities with `PIDS=$(jobs -p)`. Command substitution runs in a subshell that owns no jobs, so the variable is empty and the `kill` silently succeeds against nothing. Capture each `$!` immediately after its own `&` instead, and treat the bounded lifetime rather than the capture as the real guarantee. This rule exists because eight unbounded `while :; do :; done` load generators were started to measure a gate under CPU pressure, their `kill` matched nothing for exactly that reason, and they ran orphaned at ~80% CPU each until the owner noticed a load average above 100. Any measurement taken while they ran is contended and must be repeated. Sweep for strays before reporting a host measurement: a killed test run can also leave an ephemeral Temporal server behind.

Before starting any JavaScript or TypeScript test or build, follow the [long-running-command policy](docs/VERIFICATION-INFRASTRUCTURE-POLICY.md#long-running-javascript-and-typescript-commands). A command that may outlive one execution-tool yield or overflow transient output must retain recoverable evidence and be resumed after compaction rather than duplicated. Do not report such a command green until `node scripts/assert-command-receipt.ts <absolute-receipt-directory>` exits zero and prints its success verdict. Use pnpm, not npm. The adapter keeps strict checking for project source but sets `skipLibCheck: true` because the manifest-pinned Temporal declarations do not type-check under TypeScript 7.0.2; do not broaden that workaround to the semantic core.

Always run:

```sh
git diff --check
```

## Git and delivery

- Preserve unrelated user changes and avoid destructive Git operations.
- Commit only when explicitly requested in the current task.
- Use Conventional Commits: `type(scope): subject`, lowercase type and imperative subject. Add a concise body when non-obvious rationale, architectural consequences, or compatibility constraints would otherwise be lost.
- Do not push without an explicit current request.
- Keep [AGENTS.md](AGENTS.md) as a symlink to `CLAUDE.md`; never maintain divergent copies.
- The default branch requires the `verify-complete` hosted check, which passes only when the selected Ubuntu verification succeeded. Repository administrators may bypass it, so a red merge takes a deliberate override rather than an accident; never override to land unverified work.

### Project tags

The published `M1` through `M6` and `MVP` names are the closed functional-MVP history. For non-release completion points, use annotated `phase/<kebab-case>` tags with descriptive names. Preserve the published MUE Preview Alpha and Preview Beta phase tags at their original targets; do not retrospectively create `v0.2.0-alpha.*` or `v0.2.0-beta.*` aliases for distributions that were never released. For an actually qualified evaluation distribution, use an annotated `vMAJOR.MINOR.PATCH[-prerelease]` tag following Semantic Versioning. The version must equal the committed root `package.json` and browser `platform/apps/web/package.json` versions, and build metadata is excluded from tag names. The first selected MUE distribution version is `v0.2.0-rc.1`. The owner has explicitly directed RC phase-tag realignments, including the current review corrections; [PLAN.md](docs/PLAN.md#mue-release-candidate-critical-path) owns their targets and qualification limits. Before each authorized move, record the former target and verify the exact remote tag object before using a compare-and-swap forced update. Each direction authorizes only its named RC correction, never another tag or an ongoing moving alias. Neither tag closes final MUE acceptance. `engine/v0.2` records that separate owner-accepted maturity boundary; a final `v0.2.0` software release remains a separate decision.

Create tags only at a clean, completely verified committed `HEAD`. Pass one `--receipt <absolute-receipt-directory>` for every applicable gate named by the owning checkpoint or release specification, and require each receipt to name the exact target commit; creation refuses an empty receipt set or any failed, malformed, or wrong-commit receipt. Never force or move a published tag except for an explicitly owner-directed RC realignment above; never reuse the historical milestone namespace, and push only the exact intended tag rather than every local tag. Before first publication only, an owner-directed correction may replace a local tag after verifying that the exact remote reference is absent and rerunning every applicable gate into exact-HEAD receipts; this is a one-time evidence correction, never a moving alias for a branch.

Create a local tag, optionally pushing it in the same invocation:

```sh
node scripts/project-tags.ts create phase shared-persistence --message "Shared persistence phase complete" --receipt <absolute-receipt-directory>
node scripts/project-tags.ts create release 0.2.0-rc.1 --message "Release 0.2.0-rc.1" --receipt <absolute-pre-push-receipt-directory> --receipt <absolute-release-receipt-directory> --push
```

If creation succeeded but the push did not, retry only that exact tag:

```sh
node scripts/project-tags.ts push phase shared-persistence
node scripts/project-tags.ts push release 0.2.0-rc.1
```

Before handing off:

1. update every affected detail map routed by [`implementation-status-router`](docs/IMPLEMENTATION-MAP.md) with exact implemented and absent scope;
2. update [PLAN.md](docs/PLAN.md) with the last verified command and exact next action;
3. run the applicable gates and `git diff --check`;
4. leave a clean working tree, or explicitly document every unfinished file and failing command.
