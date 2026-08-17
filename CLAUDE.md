# CLAUDE.md / AGENTS.md

Shared guidance for Claude Code, OpenAI Codex, and human contributors working in **bpmn-lean-experiment**. [AGENTS.md](AGENTS.md) is a symlink to this file; keep one canonical guide and preserve the symlink.

## Rule 1: no routine GitHub-hosted macOS

Standard GitHub-hosted macOS runners are [free and unlimited for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions), so billing is not the reason for this rule. Their distinct evidence is a clean macOS machine and, on `macos-latest`, Apple Silicon compatibility. Do not add macOS to a push, pull-request, scheduled, matrix, ordinary release, or other routine workflow: this repository ships no macOS-native artifact, the development computer already owns proportionate local macOS validation, and Ubuntu supplies the independent routine portability lane with less duplicate feedback work. A focused macOS smoke job is allowed only when it has an explicit clean-machine or ARM compatibility purpose and the job itself is guarded by `github.event_name == 'workflow_dispatch'`; do not run the complete verification suite merely to duplicate Linux evidence. [Larger macOS runners remain billable](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) even for public repositories and require a separate owner decision. The executable GitHub-runner policy must reject every macOS label outside that manual-only boundary.

## Mission

Build two MIT products: a Temporal-hosted BPMN 2.0.2 execution engine that ultimately satisfies OMG Process Execution Conformance, and a BPM platform on top of it. Treat standards coverage as the primary engine roadmap. After normative dependencies, treat practical reach from CIB Seven `2.2.0` and the deduplicated executable whole-model corpus as co-equal with high semantic risk in element and mechanism families; a rare concurrency, cancellation, scope, liveness, identity, data, or Temporal-refinement risk may outrank a frequent low-risk mechanism. Keep selected CIB behavior as a classified compatibility overlay, and let the platform's next showcase milestone break ties only after standards value, reach, and risk are equal, using [the showcase milestone ladder](docs/PLAN.md#showcase-milestone-ladder). A12 Workflows replacement is a third product owned by A12 under EUPL-1.2 and is out of scope in this repository. The durable product division, layer boundaries, ordering rule, coverage measures, and Lean assurance-lane rule are owned by [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md#product-division).

Establish the semantic and hosting result through four components:

1. a versioned CIB Seven semantic profile;
2. an executable Lean reference interpreter;
3. a pure TypeScript semantic core;
4. a Temporal durability adapter checked through differential, refinement, and replay testing.

The engine's essential element set and depth are scoped by [the minimal engine research](docs/research/MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md) and its follow-up [extensions research](docs/research/HIGH-PRIORITY-BPMN-EXTENSIONS-RESEARCH.md). Neither disposes a BPMN requirement; [the requirement ledger](docs/BPMN-REQUIREMENT-LEDGER.md) owns dispositions and the owning capsule owns meaning.

Preserve the implemented [Temporal engine runner](docs/RUNNABLE-TEMPORAL-MVP-SPEC.md) as the engine-side product floor while advancing semantic breadth. Its simulated User Task actor is an explicit host simulation and defines no BPMN meaning; the real task inbox, forms, and identity belong to the BPM platform, which reaches them through the same published contract and content-bound commands.

The platform consumes only the engine's published contract: compile, start, observe committed state, submit a command. It takes occurrence identity from a publication and never constructs one, and a fact the engine does not publish is a stop condition routed to an engine requirement, never derived from Temporal Event History, a state difference, or the platform's own store.

The exact current implementation and evidence boundary belongs in [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md), concrete repository and deployment architecture in [ARCHITECTURE.md](docs/ARCHITECTURE.md), and active sequencing and decisions in [PLAN.md](docs/PLAN.md); code under `BpmnSemantics/Experiments/` remains provisional and separately gated.

The preserved architecture handoff uses “reducer” for the TypeScript component. Current project terminology calls that same boundary the **semantic core** and its public transition operation `applyStimulus`; this is a naming clarification, not an authority or responsibility change.

The primary execution architecture is **an interpreter/evaluator in TypeScript, not a BPMN-to-TypeScript code generator**: exact BPMN XML bytes → private structural import → checked project-owned BPMN graph → [Semantic Process IL](docs/SEMANTIC-PROCESS-IL-SPEC.md) → semantic-core evaluation → Temporal hosting. Generated source may be a derived diagnostic or optimization only after equivalence evidence; it is never the profile or semantic authority.

Never claim BPMN conformance or CIB compatibility beyond the exact profile and evidence recorded in [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md).

## Start every session

1. Read the current checkpoint and exact resume point in [PLAN.md](docs/PLAN.md).
2. Read the implemented/absent boundary in [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md).
3. Inspect `git status --short --branch` and `git log -5 --oneline`; preserve unrelated or pre-existing changes.
4. Run `./scripts/doctor.sh verify`. It inventories every declared external pin, dependency owner, and cache even when the selected scope does not require all of them. On a fresh machine, follow [CONTRIBUTOR-SETUP-GUIDE.md](docs/CONTRIBUTOR-SETUP-GUIDE.md); provision missing inputs rather than weakening or skipping their lanes. Use the `research` scope before source-grounded work using registered research checkouts. Use the separate `adoption` scope only when the task explicitly requires optional A12 exact-source evidence; never infer that evidence from the complete MIT engine `verify` gate.
5. Run the current applicable gate from [TESTING-SPEC.md](docs/TESTING-SPEC.md).
6. Take the first incomplete work item unless the user explicitly changes scope.

Use [docs/README.md](docs/README.md) as the documentation registry. Do not rely on chat history for project state.

## Read before changing a boundary

| Change | Required context |
|---|---|
| Documentation filename, role, lifecycle, placement, graduation, or archive | [Documentation discipline](docs/DOC-DISCIPLINE.md) |
| Repository layout, package ownership, modular-monolith boundary, composition root, or deployment shape | [ARCHITECTURE.md](docs/ARCHITECTURE.md), [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md#one-repository-for-products-1-and-2), and the applicable product proposal |
| Product 2 UI/UX surface, workflow, visualization, or interaction model | [BPM platform UI/UX and information-architecture research](docs/research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md), [UI design specification](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md#source-grounded-design-preflight), applicable current product documentation, and the pristine pinned source registered in [SOURCES.md](docs/SOURCES.md) |
| Mission, authority, compatibility, or assurance | [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md), [BPMN-CONFORMANCE-TARGET.md](docs/BPMN-CONFORMANCE-TARGET.md), and the applicable release/evidence gate in [TESTING-SPEC.md](docs/TESTING-SPEC.md) |
| BPMN import, conformance, CIB relationship, or semantic interpretation | [BPMN-CONFORMANCE-TARGET.md](docs/BPMN-CONFORMANCE-TARGET.md), [CIB-BPMN-RELATION-REGISTER.md](docs/CIB-BPMN-RELATION-REGISTER.md), [BPMN-XML-INGESTION-DECISION.md](docs/BPMN-XML-INGESTION-DECISION.md), the applicable [semantic capsule](docs/capsules/README.md), and applicable normative sources |
| Source model, normalization, checked BPMN graph, Semantic Process IL, scope, runtime identity, token/activation state, or command closure | [Semantic Process IL](docs/SEMANTIC-PROCESS-IL-SPEC.md), [semantic representations research](docs/research/SEMANTIC-REPRESENTATIONS-RESEARCH.md), and relevant [experiments](docs/experiments/README.md) |
| Scenario, profile, stimulus, observation, result, or other cross-language wire format | [Shared wire contracts](contracts/README.md) and the applicable [semantic capsule](docs/capsules/README.md) |
| Temporal adapter, interpreter hosting, production lifecycle, replay, messaging, Activities, retries, timers, cancellation, or deployment | [TEMPORAL-EXECUTION-RESEARCH.md](docs/research/TEMPORAL-EXECUTION-RESEARCH.md) and the [production lifecycle specification](docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) |
| Refinement, equivalence, liveness, fairness, TLA+, or auxiliary formal tools | [TLA-AND-BISIMULATION-RESEARCH.md](docs/research/TLA-AND-BISIMULATION-RESEARCH.md) |
| CIB Seven or Temporal source instrumentation/acceleration | [REFERENCE-INSTRUMENTATION-POLICY.md](docs/REFERENCE-INSTRUMENTATION-POLICY.md) |
| External checkout, clean-machine setup, or fixture provenance | [CONTRIBUTOR-SETUP-GUIDE.md](docs/CONTRIBUTOR-SETUP-GUIDE.md) and [SOURCES.md](docs/SOURCES.md) |

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

Default to common, established ecosystem practices and native tool mechanisms. Do not invent a bespoke abstraction, policy, manifest, workflow, or duplicate source of truth when the standard practice satisfies the requirement. When a concrete project constraint requires a deviation, explain the standard approach, the exact gap, and the tradeoff to the owner and obtain approval before implementing the deviation.

For Product 2 PostgreSQL runtime or migration work, keep the ordinary package loop database-free and run the explicit runtime witness with `./scripts/pnpm.sh run test:platform-postgresql:runtime:local`. Run the complete shared-mode witness with `./scripts/pnpm.sh run test:platform-postgresql:local`; after committing PostgreSQL-backed platform changes, run `./scripts/pnpm.sh run test:pre-push:platform-postgresql` against an explicit database or use the local disposable-cluster command.

### Product 2 UI/UX source preflight

For every material Product 2 UI/UX surface, inspect CIB Seven first when it has an analogous capability, using its current product documentation and the pristine pinned source rather than memory or screenshots alone. Run the `research` doctor scope and complete the [source-grounded design preflight](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md#source-grounded-design-preflight) before production code. Use other established products to fill a gap or provide an independent comparison. Record what the project adopts, deliberately changes, and excludes, with the published engine or platform fact that justifies each deviation. This is design research, not permission to copy code, styling, assets, private data models, or product terminology.

### Semantic code

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

Spawning a sub-agent for a review lane or a bounded implementation lane defined in this document is standing authorization; do not treat it as needing separate per-invocation permission, and do not substitute self-review because permission was not asked for. What bounds delegation is the worth-opening floor in [the delegated implementation protocol](docs/TESTING-SPEC.md#delegated-implementation-protocol), not an approval step.

Give each implementation sub-agent a task-shaped name and one bounded lane. Its prompt names the exact invariant algorithm, one adversarial counterexample that must fail before the correction, the cross-target invariant matrix of required facts and explicit non-requirements, the files it may own, the files it must not touch, the proportionate focused gates, and the `node scripts/what-binds.ts` output for the files it may own so the lane inherits the guard, registry, and headroom bounds instead of rediscovering them mid-edit. A desired outcome without the deciding algorithm and realistic wrong case is not a sufficient delegation contract.

Lean execution is root-integrator-only. A Lean implementation or review sub-agent may edit or inspect its assigned Lean files, but it must not start `lake`, `lean`, `./scripts/lake.sh`, a Lean gate, or another command that can elaborate Lean. Its final safe boundary is **Ready for root Lean gate**, naming the exact narrow wrapper command. The root first confirms no Lean gate is active, then runs that one command itself. Never start a replacement command because a Lean command yielded; resume the existing process or terminate it before any retry.

Assign disjoint file ownership to concurrent agents. The root integrator owns shared integration points, lifecycle and status documentation, commits, and the repository-wide full gate; do not ask two active agents to edit the same owner or use an implementation agent as its own independent reviewer.

Require three concise safe-boundary reports from every nontrivial implementation lane: **Red reproduced**, **Root mechanism implemented**, and **Focused gates green**. Each report states the observed evidence and any change to the invariant matrix. Do not poll a long-running build merely for activity; request a report only when a promised boundary has not arrived and the agent may be stalled.

Non-Lean implementation agents run only their focused gates. For a Lean lane, the root integrator runs the agent's exact narrow Lean gate once and reports the result back to the lane; the agent may run only non-Lean static checks. After reviewing and integrating every lane, the root integrator runs the complete applicable gate once. Use a new task-shaped agent for a new lane; preserve an existing agent thread only when the review protocol requires the same reviewer to audit its corrections.

### Independent cold review

Materiality is decided by what a change touches, not by its size or layer. A product, adapter, CLI, harness, or documentation increment that changes no BPMN meaning, profile or CIB relationship, checked-source or IL representation, runtime or public observation, admission capability, transition family, proof boundary, or Temporal refinement claim opens no review cycle and is governed by the executable guards plus the applicable complete gate; see [the negative case](docs/TESTING-SPEC.md#independent-cold-review-gate). Do not spend a governed cycle on work the guards already cover, and do not skip one for work that touches those claims.

Run the repository-wide gate concurrently with a review rather than after it: the gate mutates no tracked file, so only edits must wait for the verdict. Name only the decisive focused gates in a review prompt, because a reviewer that re-runs every gate the root already ran spends its budget on duplication instead of adversarial checks. Paste the generated review packet verbatim; hand-transcribing its digests has produced a wrong hash in a prompt and cost the reviewer a verification detour.

Every material semantic proposal-to-specification lifecycle requires a read-only cold proposal review before owner approval or implementation. Closure review is cold by default, but the exact approved semantic-checkpoint reviewer may perform warm closure continuity when the executable manifest proves that the selected account, public contract, exclusions, and evidence strategy are byte-identical. A genuinely single-lane atomic closure may instead use one context-cold review for both checkpoint and closure when its first green target already contains every evidence lane, full gate, reflection, cost record, and final status, and no downstream lane crossed an unreviewed checkpoint. Materiality is content-defined: the rule applies whether the document is a capsule or a cross-cutting root proposal/specification when it selects or changes BPMN meaning, a semantic profile or CIB relationship, checked-source/IL or runtime representation, admission, public observation, proof boundary, or Temporal refinement claim. Routine local refactors and corrections that do not change those claims do not open a review cycle.

Add a conditional semantic checkpoint review after the first green implementation checkpoint when the capsule changes a wire/schema contract, checked graph or IL, runtime/public observation, admission/profile capability, transition family or proof boundary, or scope/cancellation/concurrency behavior. Spawn every prospective cold reviewer with no forked turns and without a model or reasoning override, recorded as `fork-turns-none`, so it inherits the author agent's same model and reasoning effort while receiving none of the author conversation. A warm author thread, a full-history fork, an agent that helped implement the target, or an earlier review conversation does not count.

Cold or warm, every reviewer uses the root agent's same model and reasoning effort. Do not substitute a generic or general worker tier, a cheaper model, or a lower-effort configuration. Warm review is valid for the exact same reviewer auditing corrections, for a non-governing preflight before the immutable target exists, for routine non-material refactor and integration review by an agent that did not implement the reviewed files, or for guarded warm closure continuity by the exact approved checkpoint reviewer. Warm closure requires an approved checkpoint, a descendant closure target, the executable four-boundary manifest, and no change to the selected account, public contract, exclusions, or evidence strategy; otherwise spawn a new context-cold closure reviewer.

The author commits the exact review target, pauses work at the applicable boundary, and mints the neutral review prompt defined in [TESTING-SPEC.md](docs/TESTING-SPEC.md#independent-cold-review-gate). A target-bound semantic review packet carries the immutable diff inventory, routed section hashes, and root gate command/status/time/output digests without a diagnosis or suggested verdict. The prompt requires the full capsule, applies the stage-specific focus to other owner documents, carries a hash-bound continuity manifest when warm closure is eligible, and asks for an issue-first report. The reviewer completes the static claim scan and decisive adversarial probes before starting CPU-heavy gates; a blocking finding may defer routine focused gates to the warm correction audit. The sub-agent reviewer remains read-only. Required corrections block the stage; the exact same reviewer sub-agent audits the correction commit in a warm follow-up so finding continuity is preserved, while a material redesign starts a new cold sub-agent. If the required sub-agent review cannot be obtained, stop rather than substituting self-review.

Every active proposal and specification uses a `## Status` section, and every governed document created after the review-policy gate carries the short `Independent cold-review receipt` defined in [TESTING-SPEC.md](docs/TESTING-SPEC.md#review-receipt). The receipt records immutable targets, isolation, verdicts, and correction-audit targets; it does not copy the full review report into the repository. The executable infrastructure guard reads owner approval only from that Status section and requires every recorded commit to resolve to a commit object that is an ancestor of `HEAD`. For targets governed by the sub-agent transition, recording `fork-turns-none` or `fork-turns-none-combined` attests both context isolation and omission of model/reasoning overrides; Git cannot independently verify either runtime fact. Historical and already-started reviews retain the isolation valid for their immutable target under the transition rule in the testing specification.

The pre-policy grandfather set and its selection rule are fixed by immutable baseline commit `f1ef362`. It contains the active specifications and three legacy root proposals selected by the executable guard, but excludes the already-receipted Receive Task proposal. An agent or contributor may not approve, append, rebase, or replace that exception set; every later specification must carry approved proposal and closure receipts. Changing the baseline or selection rule is an owner-governance change, not a way to make a failing gate green.

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

Target at most 600 nonblank lines per hand-written Lean, TypeScript, JavaScript, or Java source file. One thousand nonblank lines is a hard ceiling: do not commit a hand-written source file above it. A reviewed 600–999-line file may remain only with explicit owner approval, while it has one cohesive responsibility, and while splitting it would expose private construction details without creating a useful independently testable or buildable owner. Record that narrow exception in the executable source-hygiene guard; an agent may not approve or add its own exception. Line compression, comment deletion, and moving code into an untyped utility bag do not satisfy the rule.

A nontrivial Lean module starts with `/-! ... -/` documentation naming its purpose, semantic scope, and boundary. Use `/-- ... -/` for public semantic declarations and main theorems when their contracts are not already evident from types and names. Every semantic family must remain independently buildable at its narrowest owning module. Umbrella modules only assemble imports; they contain no definitions, proofs, fixtures, or executable cases.

Lean leaf modules import their narrow semantic owners and never the aggregate `BpmnSemantics.SemanticProcess` umbrella. Put reusable fixture construction in a cohesive support module that imports only the representation it constructs; do not make a basic constructor depend on retained models, scenario execution, profile admission, or unrelated proofs merely because those artifacts once shared a fixture file. Keep [`lean-import-boundaries.test.ts`](scripts/lean-import-boundaries.test.ts) green when adding or moving a Lean module.

Split Lean code by semantic ownership, not into equal-sized chunks. Keep a family’s fixtures and laws with that family, and extract a shared helper or theorem only after two completed semantic users require exactly the same invariant and result domain. Do not replace a monolith with an include chain, universal fixture module, registry, or new harness. During red/green work, build the narrow extracted module before the umbrella integration gate.

Before adding a semantic family, inventory its existing checked-source types, lowering, runtime state, evaluator clauses, relations, laws, fixtures, observations, and adapters. Reuse a representation only when its meaning matches exactly; derive family-specific theorems by specialization when the proposition genuinely agrees rather than accumulating renamed restatements.

For TypeScript and Java, prefer small typed collaborators over a runner or manager that parses, validates, schedules, mutates, projects, and cleans up in one class. Keep wire decoding, semantic orchestration, host lifecycle, evidence extraction, and canonical projection in separate owners. An extraction is complete only when the new owner has a narrow public contract and a focused test or compile target; forwarding every call through the old god object is not a completed split.

TypeScript data and wire contracts are deeply immutable at compile time. Use the single project-owned `DeepReadonly<T>` utility for nested immutable contract shapes instead of repeating `readonly` at every property, and keep that utility tuple-preserving, union-distributive, and transparent to function types. Use ordinary `readonly` for a shallow contract only when nested values are deliberately mutable and that ownership is documented. Lock the convention with compile-time negative checks covering top-level, nested-object, and array or tuple mutation.

For concrete TypeScript definitions and fixtures, prefer `as const satisfies Contract` so literals remain narrow while the complete shape is checked; do not use `as Contract` to silence incompatibility. Model semantic alternatives as closed discriminated unions, keep recurring concepts in one named type, and require exhaustive enum-based switches with a `never` check. Directly executed TypeScript must stay within Node's erasable-syntax subset: use an `as const` value object plus a derived union instead of constructs such as `enum` that require JavaScript emission, and keep the executable erasable-syntax guard green. Avoid optional-boolean mode bags, parallel near-duplicate object shapes, broad index signatures, and clever conditional-type machinery that makes public compiler errors harder to understand. A type abstraction must remove real repetition for at least two consumers without weakening exact field, tuple, or union information; target TypeScript contributors should be able to discover and use the contract from editor tooling without reading its implementation.

Write idiomatic TypeScript rather than Java translated into TypeScript. Prefer immutable data plus small pure functions and cohesive ES modules over stateful utility classes, factories, builders, bean accessors, namespaces, and nominal wrapper ceremony. Accept `unknown` at untrusted boundaries and narrow it with explicit validators or type guards; avoid `any`, non-null assertions, unchecked casts, and catch-all string dictionaries. Let local implementation types infer when the result remains obvious, but annotate exported contracts, semantic functions, recursion boundaries, and callback ownership. Keep async control flow explicit with `async`/`await`, propagate typed domain results separately from thrown infrastructure failures, and never hide ordering, cancellation, timeout, or resource lifetime behind a convenience abstraction.

Write idiomatic Lean rather than imperative evaluator code transliterated into theorem syntax. Represent semantic domains with distinct structures, inductive types, and propositions; use total pattern matching and structurally clear recursion; keep executable definitions separate from declarative relations and reusable laws. Prefer small named lemmas with meaningful hypotheses, library combinators, and readable `cases`/`induction`/`simp`/`rw` proofs over duplicated theorem bodies, giant tactic blocks, Boolean encodings of propositions, or proof-by-serialization. Deciding a finite fact is appropriate for fixtures, decoder locks, and concrete counterexamples; it does not replace a quantified semantic theorem. Write it as `decide +kernel`, never as plain `decide`: the plain form reduces the `Decidable` instance in the elaborator and then discards that result so the kernel redoes the same reduction, which measured as half of this repository's Lean gate CPU. The kernel form proves the same proposition from the same instance, adds no axiom, and removes the elaborator's `whnf` from the trusted path; [the source-hygiene guard](scripts/source-hygiene.test.ts) rejects a tactic-position `decide` without it, in the combinator positions as well as after `by`. Prefer `decide +kernel` over `native_decide`, which moves trust to the compiler by adding a `native_decide` axiom to the proving theorem's footprint. Choose between the two by the proposition's shape rather than by either tactic's reputation. A fact whose evaluation walks a `String` cannot use `decide +kernel` at all: the kernel does not reduce `String` operations, so the tactic fails to elaborate with its instance "stuck", and restating that fixture over a non-`String` representation changes the proposition rather than the tactic and needs its own review. `native_decide` is also not simply the faster choice, because it pays to compile a decision procedure that a shallow fact never recovers. When converting existing sites, measure one module at a time against a fresh single-target build and invalidate the cache by content, since Lake keys on content and a bare `touch` measures a build that never ran; cost follows each proposition's reduction depth, never a module's site count. **Measure resident memory alongside CPU and never call a conversion affordable from CPU alone.** The kernel reduces in RAM, so `decide +kernel` trades memory as well as elaborator time, and a conversion that is cheap in CPU can still exhaust the machine. Run every Lean cost measurement and the first narrow build after a change that can increase kernel-reduction cost under an operating-system-enforced memory bound rather than a polling watchdog, which cannot stop a process that allocates gigabytes between samples. Ordinary development builds use the conservative thread pin in [`scripts/lake.sh`](scripts/lake.sh) and do not require a container. [The contributor setup guide](docs/CONTRIBUTOR-SETUP-GUIDE.md#memory-bounded-lean-measurements) owns the platform choice: native cgroups on Linux, a container fallback on macOS, and a verified native equivalent or container elsewhere. This repository reverted two large conversions after their builds repeatedly had to be killed for exhausting host memory, and when a change adds a branch to a dispatcher that kernel-decided fixtures reduce through, such as `fireTimer` and its siblings, build one narrow target before any full `./scripts/lake.sh build` or `./scripts/lake.sh test`, because that branch is re-reduced by every downstream decided fixture. [The Lean source-contracts guard](scripts/lean-source-contracts.test.ts) records every remaining site with its reason and rejects a new site or a new module. Preserve domain-specific identifier types, keep JSON and wire conversion at boundary modules, and do not weaken types or expose evaluator internals merely to shorten a proof.

Before the first edit of an atomic change, run `node scripts/what-binds.ts <path>...` on every path the change will add or grow. It reports each owner's remaining size headroom, the executable guards whose assertions already constrain those paths, and the registries with a same-change obligation. Answer *what already binds this work?* from that output, never from recall: guards here constrain artifact shape by tree as often as by file, so a plan written from memory can name a change site whose oracle it never read. Do not let the compiler discover the shape of the work either: using type errors to enumerate change sites is efficient for finding them, but it means the plan is already mid-edit when a full owner forces an extraction. When an owner is nearly full, land the extraction as its own behavior-preserving commit before adding semantics, so the new work is not written under a size squeeze.

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
10. compare the capsule's commit-bounded nonblank code and documentation churn recorded in [CAPSULE-COST-LEDGER.md](docs/CAPSULE-COST-LEDGER.md) with the previous comparable capsule; use elapsed wall time only when explicit start and closure timestamps exist, otherwise record it as unknown rather than answering by impression, and remove one identified process weight before starting the next capsule when the measured cost did not fall. The removed weight must bear on the measure that rose, or the row states why no such weight exists; a removal on an axis that already improved leaves the growing cost unaddressed and satisfies the only subtractive rule in this process without subtracting anything;
11. answer the fixed self-assessment questions in [PROCESS-ASSESSMENT-LEDGER.md](docs/PROCESS-ASSESSMENT-LEDGER.md) and either add a row or record that none applied; this assesses how the work was carried out and is separate from the claim review above;
12. decide whether the result changes the next best step;
13. complete the applicable proposal, conditional semantic-checkpoint, and closure reviews under [the independent cold-review rule](#independent-cold-review) before crossing their stage boundaries.

Answer the same self-assessment questions at each session handoff, not only at a capsule boundary. A finding that already has a row gets its instance count incremented rather than a second near-duplicate row, because that count is what the escalation rule reads: a mechanism seen twice has already refuted the prose meant to prevent it and requires an executable guard. Assume your own fresh prose does not bind you.

Turn every escaped issue into either a reusable review question or an executable guard, and record it in [the process-assessment ledger](docs/PROCESS-ASSESSMENT-LEDGER.md) so a repeat is distinguishable from a first occurrence. Record each resulting correction in its existing owner: semantic meaning in the applicable [capsule](docs/capsules/README.md), durable product and semantic boundaries in [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md), concrete package and deployment architecture in [ARCHITECTURE.md](docs/ARCHITECTURE.md), evidence and guards in [TESTING-SPEC.md](docs/TESTING-SPEC.md), implementation status in [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md), immediate sequencing in [PLAN.md](docs/PLAN.md), and only reusable contributor behavior in this file. Do not create a retrospective diary per capsule.

### Architecture experiments

A bounded spike requires competing accounts and a witness capable of separating them. End it as:

- an adopted capsule through the normal profile/evidence process;
- a precisely recorded unresolved boundary;
- or a representation correction with affected semantics, proofs, serializers, and adapters re-audited.

An architecture experiment may measure an implementation choice only after a named consumer or standing proof/refinement obligation forces that choice. The existence of a product consumer is an input to the experiment, not an outcome that implementation can discover. Do not interpose a speculative architecture experiment ahead of approved capsule work when its deciding fact is an unmade product decision.

Do not generalize after one consumer. Retain a provisional implementation only while it remains a useful discriminator.

Before measuring a staged line ceiling, anchor the preceding stage to a commit or record a reproducible baseline of exact files and nonblank counts. Do not publish an exact per-stage delta that can be reconstructed only from prose or an uncommitted mixed-stage tree.

### Dependencies

Keep each component’s dependencies at the smallest approved set and add one only when a concrete capability requires it. Obtain explicit user approval before adding, removing, upgrading, vendoring, or replacing any Lake, Java, Node, pnpm, Temporal, parser, test, build, or runtime dependency. **This applies to the BPM platform exactly as it applies to the engine.** A platform dependency cannot reach the semantic core, but that is not what the rule protects: under [the platform's dependency posture](docs/PROJECT-DESIGN.md#dependency-posture) every resolved package is attack surface, while maintained MIT-compatible work is preferred over reimplementing a solved problem. Weigh a candidate against the whole alternative, including the defects we would own, not against its package count.

Record exact version, role, license, provenance, and removal cost before adoption.

Declare only direct production dependencies in the owning `package.json`, commit `pnpm-lock.yaml`, and require frozen-lockfile installation in CI so the lockfile remains the one exact resolution authority. Use `overrides` only for a documented transitive correction, not to duplicate the lockfile. Review the resolved production graph when adopting or upgrading a direct dependency and keep the whole graph inside the approved licence policy. Do not maintain a second hand-copied transitive-version inventory or an arbitrary resolved-package-count budget. The BPM platform uses pnpm's production licence report as its graph oracle; [`platform/license-policy.json`](platform/license-policy.json) owns only the permissive licence allowlist and exact non-standard licence exceptions. Prefer a built-in capability, a bounded hand-written owner, or doing without over a dependency whose value is convenience.

Every workspace package that publishes `dist/` owns its own `build` script. Root build commands select a target package and let pnpm derive and topologically build its transitive workspace closure from package manifests. Do not duplicate that graph with a root-level `tsc` chain or hand-maintained package order; such a chain is allowed only after explaining a concrete limitation of pnpm's graph and obtaining owner approval.

## Documentation ownership

Use one owner for each fact and link to it elsewhere:

| Information | Owner |
|---|---|
| Document roles, suffix contracts, lifecycle, placement, and same-change triggers | [DOC-DISCIPLINE.md](docs/DOC-DISCIPLINE.md) |
| Mission, authority, and approved durable boundaries | [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md) |
| Concrete repository layout, module ownership, dependency direction, and deployment shape | [ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Semantic Process IL contract, exact proof boundary, maintained obligations, and growth rules | [SEMANTIC-PROCESS-IL-SPEC.md](docs/SEMANTIC-PROCESS-IL-SPEC.md) |
| Reviewed BPMN Process Execution requirements and dispositions | [BPMN-REQUIREMENT-LEDGER.md](docs/BPMN-REQUIREMENT-LEDGER.md) |
| Downstream A12 model, delegate, façade, blueprint, and migration-adoption denominator | [A12-WORKFLOWS-COMPATIBILITY-LEDGER.md](docs/research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) |
| Exact current implementation, proof, test, and absence status | [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md) |
| Current checkpoint, ordered work, blockers, and resume point | [PLAN.md](docs/PLAN.md) |
| Commit-bounded completed capsule and enabling-increment cost | [CAPSULE-COST-LEDGER.md](docs/CAPSULE-COST-LEDGER.md) |
| Self-assessment questions, retained process findings, and their dispositions | [PROCESS-ASSESSMENT-LEDGER.md](docs/PROCESS-ASSESSMENT-LEDGER.md) |
| CIB behavior relative to BPMN: agreements, operational details, interpretations, extensions, configuration, limitations, and deviations | [CIB-BPMN-RELATION-REGISTER.md](docs/CIB-BPMN-RELATION-REGISTER.md) |
| Bounded project-owned semantic meaning, laws, witnesses, and exclusions | [docs/capsules](docs/capsules/README.md) |
| External-system and semantic-background findings | [docs/research](docs/research/README.md) |
| Bounded executable questions and results | [docs/experiments](docs/experiments/README.md) |
| Gates, evidence lanes, and test procedure | [TESTING-SPEC.md](docs/TESTING-SPEC.md) |
| Clean-machine and coding-agent setup | [CONTRIBUTOR-SETUP-GUIDE.md](docs/CONTRIBUTOR-SETUP-GUIDE.md) |
| External revisions, licenses, and checkout navigation | [SOURCES.md](docs/SOURCES.md) |

Before adding, renaming, moving, graduating, archiving, or deleting a document, follow [DOC-DISCIPLINE.md](docs/DOC-DISCIPLINE.md). `-SPEC` is reserved for an implemented current contract; approved but unimplemented intent remains `-PROPOSAL`. Write one Markdown paragraph per line without hard wrapping. Use regular relative Markdown links for other project documents. Update the owner and every index or inbound link in the same change, and avoid copying live inventories.

Keep every `README.md` human-facing: explain the component's purpose and user-visible capabilities, give the shortest useful quick start, and link to deeper material. Repository-wide contributor and agent instructions belong only in canonical `CLAUDE.md`, with `AGENTS.md` preserving its symlink. When dense contributor navigation is genuinely necessary, move it into a linked purpose-named document: use `SOURCE-MAP.md` for source-file ownership and implementation inventories, or another existing role suffix such as `-REGISTER.md` or `-GUIDE.md` only when that role contract matches. Do not create a generic `INDEX.md`; its name hides why the document exists. Keep normative contracts in their owning specifications and link them rather than duplicating them into a README or source map.

Treat feedback efficiency and development speed as non-negotiable engineering constraints. Keep test selection proportionate and nonduplicative: during development run the smallest separating oracle, before a regular commit run that focused oracle plus the complete affected package, before push run the exact clean-commit workflow selected by changed paths, and before a milestone or tag run complete verification and release acceptance. A composed gate builds a dependency graph once and reuses its artifacts; do not serially nest self-contained gates that rebuild the same packages, hide duplicate work behind package hooks, or make an unrelated expensive lane a prerequisite. Run independent selected workflows in parallel on GitHub. Repeat a test across operating systems, browsers, viewports, profiles, or targets only when that dimension has a distinct failure mode; do not multiply viewport-independent behavior merely because the harness can parameterize it. A time-budget breach requires root-cause correction rather than a longer timeout or weaker evidence. [The three-level verification policy](docs/TESTING-SPEC.md#three-level-verification-policy) owns the commands and exceptions.

Never activate the `linear-walkthrough` skill and never invoke `showboat` directly or indirectly. Author maintained Markdown directly and verify it only through the repository-owned documentation, infrastructure, and applicable complete gates.

Keep the top-level `README.md` as a durable project front door. Do not put live status, evidence counts, current support inventories, or next-work narration there; link to [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md) and [PLAN.md](docs/PLAN.md) instead. The sole non-semantic exception is governed by [the publication-statistics contract](docs/TESTING-SPEC.md#default-verification); follow that owner rather than restating its generated blocks or maintainer requirements here.

The rationale and transfer limits for the semantic-capsule workflow are recorded in [the `a12-kernel-lean` process-transfer study](docs/research/A12-KERNEL-LEAN-PROCESS-RESEARCH.md).

## Reference and source discipline

Reference checkouts are research inputs, never runtime dependencies of Lean or the semantic core. Navigate them through relative links recorded in [SOURCES.md](docs/SOURCES.md); never commit absolute home paths, usernames, hostnames, credentials, or machine-specific state.

External reference trees live by default under repository sibling `../oss`, with `BPMN_EXTERNAL_ROOT` as the portable override. Use the exact repository-owned setup and doctor workflow in [CONTRIBUTOR-SETUP-GUIDE.md](docs/CONTRIBUTOR-SETUP-GUIDE.md); never rely on a machine already containing the trees. Whenever an external implementation is relevant, inspect the applicable pinned checkout before relying on memory, generated summaries, or web search. An absent or mismatched registered input is an infrastructure failure, not permission to skip the lane. Cloning a reference repository does not approve it as a project dependency or semantic authority.

Project-authored code and documentation are released under the [MIT License](LICENSE). Do not copy, vendor, link, or redistribute external material under that license without verifying compatibility, preserving required notices and attribution, and recording the decision in [SOURCES.md](docs/SOURCES.md). The stricter A12 boundary in the non-negotiable rules applies even if another technical or licensing arrangement might otherwise be possible.

The downloaded OMG PDF, machine-readable files, examples, Markdown conversion, and extracted figures are external local research material described by [the tracked reference pointer](docs/reference/bpmn-2.0.2/README.md) and stored by default at sibling `../oss/omg-bpmn-2.0.2`. Track only project-authored digests, provenance, hashes, and fetch/verification tooling; do not stage or redistribute the external corpus.

For CIB or Temporal source changes, preserve a clean pinned evidence lane and follow the branch, provenance, noninterference, and shadow-equivalence rules in [REFERENCE-INSTRUMENTATION-POLICY.md](docs/REFERENCE-INSTRUMENTATION-POLICY.md).

## Verification

The Lean toolchain is pinned in [lean-toolchain](lean-toolchain) and currently has no external Lake packages.

In a managed sandbox, agents must request host port-binding authorization before the first attempt to run `./scripts/verify.sh`, `./scripts/pnpm.sh run test:temporal`, `./scripts/pnpm.sh run test:pipeline`, or `./scripts/pnpm.sh run test:timer-time-skipping`. Do not probe by running one of these commands inside the restricted sandbox first. An ephemeral Temporal server startup error containing `Operation not permitted` or `EPERM` means the sandbox denied the local listener; it is not evidence of a port collision or a failing semantic test.

**Never invoke `lake` or `lean` directly. Use [the Lean wrapper](scripts/lake.sh): `./scripts/lake.sh build`, `./scripts/lake.sh test`, `./scripts/lake.sh exe <target>`, `./scripts/lake.sh env lean <file>`.** It is the single owner of Lean's build parallelism; [package.json](package.json)'s `config.leanBuildThreads` owns the value, and the wrapper derives it through [the pin reader](scripts/pinned-toolchain.sh), replaces any inherited `LEAN_NUM_THREADS`, and exports the fixed value. The wrapper also holds one fail-closed host lock, so a second repository Lean process tree refuses to start. An explicit `BpmnSemantics` target is forbidden because `./scripts/lake.sh build` already owns the root-integrator-only full gate; a focused command must name only its narrow targets. Never override the thread pin, run Lean from a sub-agent, or start another Lean command while one has yielded.

The pin exists because this repository decides finite fixtures in the kernel and kernel reduction holds its terms in resident memory. Lake sizes its build pool from that variable or from the logical processor count and offers no `--jobs` option, so an unpinned build scales its peak with core count: on an 8-core host it ran four concurrent `lean` processes above 2 GB each and peaked at 7978 MB, against 2411 MB at one thread and 4699 MB at two, at roughly double the wall time. The default is the most conservative value on purpose, because the peak grows with the number of kernel-decided fixtures and that number grows with every capsule; a GitHub-hosted runner for a private repository has 7 GB and the lightweight tier 5 GB, so an unpinned build already exceeds them. The wrapper exists rather than an exported pin on each gate because that earlier arrangement pinned the gates and nothing else: the documented experiment commands and every Lean build typed directly stayed at the host's core count behind a prose caveat asking the reader to remember. [The infrastructure guard](scripts/verification-entrypoint.test.ts) dynamically rejects a bare `lake` subcommand in every present tracked or pending command surface, including scripts, package manifests, CI workflows, and shell wrappers, plus the maintained instruction documents. Historical records such as [PLAN.md](docs/PLAN.md) and the ledgers can therefore retain an unpinned command as a measured fact without weakening executable coverage.

Current verification gate:

```sh
./scripts/verify.sh
git status --short
```

Fast semantic gate (Lean plus TypeScript semantic core):

```sh
./scripts/pnpm.sh run test:semantic
```

Focused TypeScript semantic-core gate, and its compile-time contract gate:

```sh
./scripts/pnpm.sh run test:semantic-core
./scripts/pnpm.sh run check:semantic-types
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

Focused source-ownership and module-boundary gate:

```sh
./scripts/pnpm.sh run check:source-hygiene
```

Focused M1 engine-gateway and platform-foundation gate:

```sh
./scripts/pnpm.sh run test:platform-foundation
```

Complete implemented M1 platform-package gate:

```sh
./scripts/pnpm.sh run test:platform-m1
```

This platform-only gate uses `tsconfig.platform-harness.json`; the default engine harness excludes `platform/` and `*.platform-test.ts`, so complete engine verification remains independent of platform package builds.

Database-free structure gate for the containerized evaluation distribution:

```sh
./scripts/pnpm.sh run test:evaluation-distribution:structure
```

Explicit evaluation start and maintained walkthrough screenshot refresh commands. Both start service dependencies and remain outside ordinary verification; screenshot refresh owns an isolated Compose project and removes its transient volumes:

```sh
./scripts/pnpm.sh run evaluation:start
./scripts/pnpm.sh run walkthrough:screenshots:refresh
```

M2 Process-instance search public-contract, durable-index, and producer-recording checkpoint gate:

```sh
./scripts/pnpm.sh run test:platform-process-search-checkpoint
```

Required M1 end-to-end showcase after installing Playwright's pinned Chromium:

```sh
./scripts/pnpm.sh run test:showcase:m1
```

Required M2 definition-scheduling showcase, including live Temporal evidence and headless-browser acceptance:

```sh
./scripts/pnpm.sh run test:showcase:m2
```

Focused M2 Process-instance search live and browser gate:

```sh
./scripts/pnpm.sh run test:showcase:m2-process-instance-search
```

M3 Work contract, identity, audit, persistence, HTTP, and web composition gate:

```sh
./scripts/pnpm.sh run test:platform-work-checkpoint
```

Required M3 human-work live Temporal and headless-browser gate:

```sh
./scripts/pnpm.sh run test:showcase:m3-human-work
```

Complete Product 2 M3 release acceptance, composing the real-host gate with the isolated deterministic UI-quality lane:

```sh
./scripts/pnpm.sh run test:release:m3
```

M4 incident contracts, confirmed-locator bootstrap, current aggregation, authorization, durable actions, audit, HTTP, server composition, and web workspace gate:

```sh
./scripts/pnpm.sh run test:platform-operations-checkpoint
```

Required M4 incident-operations real Temporal and headless-browser gate:

```sh
./scripts/pnpm.sh run test:showcase:m4-incident-operations
```

Complete Product 2 M4 release acceptance, composing the real-host gate with the isolated deterministic UI-quality lane:

```sh
./scripts/pnpm.sh run test:release:m4
```

Product 2 fixed-fixture responsive, focus, reduced-motion, and interaction gate at the supported 1280-pixel and 1600-pixel desktop widths:

```sh
./scripts/pnpm.sh run test:ui-quality
```

After committing a Product 1 or shared-repository change, require a clean worktree and run the exact ordinary GitHub verification entry point against that committed `HEAD`:

```sh
./scripts/pnpm.sh run test:pre-push:verify
```

After committing a Product 2 UI-facing change, require a clean worktree and run the same composed entry point used by the ordinary path-filtered GitHub workflow:

```sh
./scripts/pnpm.sh run test:pre-push:ui
```

Product 2 backend and showcase-compatibility changes have separate clean-commit entry points so neither becomes a serial prerequisite of the browser lane:

```sh
./scripts/pnpm.sh run test:pre-push:platform
./scripts/pnpm.sh run test:pre-push:platform-postgresql
./scripts/pnpm.sh run test:pre-push:showcase
```

The optional manually reviewed wide-Diagram screenshot has no blocking CI or release role:

```sh
./scripts/pnpm.sh run test:ui-quality:visual
```

These browser lanes are independent from Temporal and remain outside `verify.sh` and every Product 1 semantic feedback loop.

Keep the M1 gate as an independent unseen-source deployment regression floor when running M2.

Complete gate for scripts, documentation fragments, and the executable guards, and the only complete gate that needs no host port:

```sh
./scripts/pnpm.sh run test:infrastructure
```

Focused pure differential comparator gate:

```sh
./scripts/pnpm.sh run test:differential
```

Optional local pinned MIWG observation gate:

```sh
./scripts/pnpm.sh run test:miwg
```

Optional timer time-skipping calibration gate:

```sh
./scripts/pnpm.sh run test:timer-time-skipping
```

Complete fast differential/refinement gate:

```sh
./scripts/pnpm.sh run test:pipeline
```

Executable model corpus provenance, admission, ranking, and selected production-pipeline gate after `./scripts/doctor.sh research`:

```sh
./scripts/pnpm.sh run test:model-corpus
```

Focused CIB calibration gate:

```sh
./scripts/test-cibseven-oracle.sh
```

Provisional representation-spike gate:

```sh
./scripts/lake.sh exe checkSemanticRepresentationSpike
```

Bounded checked-source relation experiment gate:

```sh
./scripts/lake.sh exe checkCheckedSourceRelationExperiment
```

For every JavaScript or TypeScript test/build, follow the global long-running-command policy and the gate definitions in [TESTING-SPEC.md](docs/TESTING-SPEC.md). Use pnpm, not npm. The adapter keeps strict checking for project source but sets `skipLibCheck: true` because the manifest-pinned Temporal declarations do not type-check under TypeScript 7.0.2; do not broaden that workaround to the semantic core.

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
- The default branch requires the `verify-complete` hosted check, which passes only when the selected Ubuntu verification succeeded. Repository administrators may bypass it, so a red merge takes a deliberate override rather than an accident; never override to land unverified work.

### Project tags

The published `M1` through `M6` and `MVP` names are the closed functional-MVP history. For later non-release completion points, use annotated `phase/<kebab-case>` tags with descriptive names. For releases, use annotated `vMAJOR.MINOR.PATCH[-prerelease]` tags following Semantic Versioning; the version must equal the committed root `package.json` version, and build metadata is excluded from tag names. Create tags only at a clean, completely verified committed `HEAD`. Never force or move a published tag, never reuse the historical milestone namespace, and push only the exact intended tag rather than every local tag.

Create a local tag, optionally pushing it in the same invocation:

```sh
node scripts/project-tags.ts create phase shared-persistence --message "Shared persistence phase complete"
node scripts/project-tags.ts create release 0.2.0-rc.1 --message "Release 0.2.0-rc.1" --push
```

If creation succeeded but the push did not, retry only that exact tag:

```sh
node scripts/project-tags.ts push phase shared-persistence
node scripts/project-tags.ts push release 0.2.0-rc.1
```

Before handing off:

1. update [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md) with exact implemented and absent scope;
2. update [PLAN.md](docs/PLAN.md) with the last verified command and exact next action;
3. run the applicable gates and `git diff --check`;
4. leave a clean working tree, or explicitly document every unfinished file and failing command.
