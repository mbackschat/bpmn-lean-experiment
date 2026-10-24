# CLAUDE.md / AGENTS.md

Shared guidance for Claude Code, OpenAI Codex, and human contributors in **bpmn-lean-experiment**. [AGENTS.md](AGENTS.md) is a symlink to this one canonical file.

**Project opt-in:** Use HIGH/MEDIUM/LOW model tiers. Read [Delegated implementation](#delegated-implementation) at session start for role selection and delegation rules.

Triggers ("Before X, read Y") are mandatory before X; read the linked section, not the whole owner document.

## Rule 1: no routine GitHub-hosted macOS

Do not add macOS to a push, pull-request, scheduled, matrix, ordinary release, or other routine workflow: no macOS-native artifact ships, the development computer owns local macOS validation, and Ubuntu is the routine portability lane. Billing is not the reason ([free for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions)). A focused macOS smoke job is allowed only for an explicit clean-machine or ARM purpose, with the job itself guarded by `github.event_name == 'workflow_dispatch'`, never running the complete suite. [Larger macOS runners stay billable](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) and need a separate owner decision. The executable GitHub-runner policy must reject every macOS label outside that manual-only boundary.

## Mission

Build two MIT products: a Temporal-hosted BPMN 2.0.2 execution engine bounded in element breadth and feature depth by CIB Seven `2.2.0` implementation, and a BPM platform on top of it; the A12 Workflows replacement is a separate A12-owned EUPL-1.2 product, out of scope here. [Practical CIB7 Coverage](docs/PROJECT-DESIGN.md#practical-cib7-coverage) is the sole delivery target for showing and releasing the product (MUE RC was sufficient; no separate MUE acceptance). Variants absent from CIB7 are out of scope, and depth is established from pinned source, tests and documentation before selecting an increment ([breadth ordering](docs/PROJECT-DESIGN.md#cib-seven-220-breadth-ordering)). BPMN stays the semantic authority; CIB differences are classified, not imitated. After normative dependencies, practical reach (CIB Seven `2.2.0` and the deduplicated whole-model corpus) and high semantic risk are co-equal, so a rare concurrency, cancellation, scope, liveness, identity, data, or Temporal-refinement risk may outrank a frequent low-risk mechanism; the next [showcase milestone](docs/SHOWCASE-MILESTONE-LADDER-DECISION.md#showcase-milestone-ladder) breaks ties only when standards value, reach, and risk are equal.

[PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md#product-division) owns the product division, four assurance components, layering, ordering, coverage measures, Lean lane rule, [engine runner floor](docs/PROJECT-DESIGN.md#engine-runner-delivery-boundary), [platform consumption rules](docs/PROJECT-DESIGN.md#what-the-platform-may-consume), and the [interpreter architecture](docs/PROJECT-DESIGN.md#interpreter-architecture): never a BPMN-to-TypeScript generator, and the handoff's “reducer” is the **semantic core** (`applyStimulus`). The platform never constructs an occurrence identity; an unpublished fact is a stop condition routed to an engine requirement, never derived from Event History, state differences, or the platform store. [The requirement ledger](docs/BPMN-REQUIREMENT-LEDGER.md) owns dispositions (the [minimal engine](docs/research/MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md) and [extensions](docs/research/HIGH-PRIORITY-BPMN-EXTENSIONS-RESEARCH.md) research only scope breadth and depth), `BpmnSemantics/Experiments/` is provisional, and no claim exceeds the exact profile and evidence in the detail maps routed by [`implementation-status-router`](docs/IMPLEMENTATION-MAP.md).

## Start every session

1. For Practical CIB7 Coverage, use the [scoped lookup rule](#practical-cib7-coverage-lookup). For other work, read PLAN's [exact resume point](docs/PLAN.md#exact-resume-point) and [scheduled delivery batches](docs/PLAN.md#scheduled-delivery-batches); read the whole plan only when changing its structure.
2. Read root [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md) completely.
3. Determine whether the user request retains or overrides the active work item.
4. Once the concrete target paths are known, run `node scripts/what-binds.ts <path>...` and read every reported detail map before editing; treat its guard, registry and `OWNER` headroom lines as plan constraints. For overridden work, also resolve every named area through the root routing table, reading every candidate map when scope is ambiguous.
5. Inspect `git status --short --branch` and `git log -5 --oneline`; preserve unrelated changes. Run `./scripts/doctor.sh verify` on a fresh machine or when a lane reports a missing input, following [CONTRIBUTOR-SETUP-GUIDE.md](docs/CONTRIBUTOR-SETUP-GUIDE.md) and provisioning inputs rather than weakening lanes. Use the `research` scope before work on research checkouts, and `adoption` only when the task explicitly needs optional A12 exact-source evidence, never inferred from the MIT `verify` gate.
6. Read every boundary-specific owner section routed by the change table below. At family start, assess each active [assurance finding](docs/ASSURANCE-IMPROVEMENT-REGISTER.md#activation-and-ownership) the maps report: a met trigger needs a bounded action and acceptance; held/deferred work keeps its reviewed boundary.
7. Use [TESTING-SPEC.md](docs/TESTING-SPEC.md#select-the-task-owner) to select the acceptance gate and its focused policy owners, and run it at the acceptance boundary, not at session start. Do not import every testing policy for ordinary work.

Project state lives in [the documentation registry](docs/README.md), never chat history. Replace PLAN's resume point in place (result, decisive verification, blockers, next action) and never append session, command or proof diaries to plans, specs or maps ([active-task continuity](docs/DOC-DISCIPLINE.md#active-task-continuity)). Apply [Before frontend recommendations](#before-frontend-recommendations) before any frontend recommendation, even without a code change.

### Practical CIB7 Coverage lookup

Treat the [coverage checklist](docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) as an index: start with [PLAN's active outcome](docs/PLAN.md#exact-resume-point) and [delivery batch](docs/PLAN.md#scheduled-delivery-batches), find the task by stable ID, and follow only the dependency rows and owner sections the decision needs; consult the [state definitions](docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#how-a-task-closes) when interpreting or changing status. Retrieve bounded excerpts by ID or heading, never the whole checklist at startup or continuation. This overrides routine full-document reads for coverage planning and status lookup; required independent reviews still examine their complete capsule.

## Read before changing a boundary

| Change | Required context |
|---|---|
| Documentation filename, role, lifecycle, placement, graduation, or archive | [Documentation discipline](docs/DOC-DISCIPLINE.md) |
| Repository layout, package ownership, composition root, deployment | [ARCHITECTURE.md](docs/ARCHITECTURE.md), [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md#one-repository-for-products-1-and-2), product proposal |
| Frontend architecture, React organization, routing, state, or UI stack | [Before frontend recommendations](#before-frontend-recommendations) |
| Product 2 UI/UX surface, workflow, visualization, or interaction | [UI/UX research](docs/research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md), [UI design preflight](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md#source-grounded-design-preflight), product docs, pinned source |
| Mission, authority, compatibility, or assurance | [PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md), [BPMN-CONFORMANCE-TARGET.md](docs/BPMN-CONFORMANCE-TARGET.md), release gate in [TESTING-SPEC.md](docs/TESTING-SPEC.md) |
| BPMN import, conformance, CIB relationship, or semantic interpretation | [BPMN-CONFORMANCE-TARGET.md](docs/BPMN-CONFORMANCE-TARGET.md), [CIB-BPMN-RELATION-REGISTER.md](docs/CIB-BPMN-RELATION-REGISTER.md), [BPMN-XML-INGESTION-DECISION.md](docs/BPMN-XML-INGESTION-DECISION.md), the [capsule](docs/capsules/README.md), normative sources |
| Source model, normalization, checked graph, IL, scope, runtime identity, activation state, command closure | [Semantic Process IL](docs/SEMANTIC-PROCESS-IL-SPEC.md), [representations research](docs/research/SEMANTIC-REPRESENTATIONS-RESEARCH.md), [experiments](docs/experiments/README.md) |
| Scenario, profile, stimulus, observation, result, or other wire format | [Shared wire contracts](contracts/README.md) and the applicable [capsule](docs/capsules/README.md) |
| Temporal adapter, hosting, lifecycle, replay, messaging, Activities, retries, timers, cancellation, deployment | [TEMPORAL-EXECUTION-RESEARCH.md](docs/research/TEMPORAL-EXECUTION-RESEARCH.md), [production lifecycle specification](docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) |
| Refinement, equivalence, liveness, fairness, TLA+, auxiliary formal tools | [TLA-AND-BISIMULATION-RESEARCH.md](docs/research/TLA-AND-BISIMULATION-RESEARCH.md) |
| CIB Seven or Temporal source instrumentation/acceleration | [REFERENCE-INSTRUMENTATION-POLICY.md](docs/REFERENCE-INSTRUMENTATION-POLICY.md) |
| External checkout, clean-machine setup, or fixture provenance | [CONTRIBUTOR-SETUP-GUIDE.md](docs/CONTRIBUTOR-SETUP-GUIDE.md), [SOURCES.md](docs/SOURCES.md) |
| Lean, TypeScript, JavaScript or Java source, or comments | [Code hygiene](#code-hygiene-and-module-boundaries) |
| Dependency, manifest, lockfile, or package build script | [Dependencies](#dependencies) |

Read the linked section of a selected document before acting; read the whole document only when no section is linked or when changing its structure, denominator or rules. For ledgers, read the purpose/update rules and the selected complete records.

## Authority model

1. BPMN 2.0.2 and its normative machine-readable artifacts are authoritative for syntax, metamodel, and Process Execution Conformance.
2. An approved immutable semantic profile is the compatibility authority for one declared target.
3. Lean is the formal semantic authority for that profile’s explicit operational meaning.
4. The pinned complete CIB Seven engine is the executable behavioral oracle for its declared compatibility profile.
5. The pure TypeScript semantic core is a separately written realization of the semantic contract with no CIB Seven or Temporal dependency: an independent transcription of the reviewed account, not an independent choice of account ([two kinds of independence](docs/PROJECT-DESIGN.md#two-kinds-of-independence)).
6. The Temporal adapter provides durability and hidden orchestration work without defining BPMN behavior.

CIB Seven is presumed to implement BPMN faithfully, operationalize gaps or inconsistencies, and add explicit extensions; greater specificity or extension is not a deviation. When sources appear to disagree, classify the relationship in [CIB-BPMN-RELATION-REGISTER.md](docs/CIB-BPMN-RELATION-REGISTER.md) against the standard, profile, configuration, observation boundary, and evidence. Do not use majority voting.

## Non-negotiable boundaries

- Preserve the dependency direction **BPMN execution core → selected CIB compatibility overlay → BPM platform**. Lower layers never import or encode assumptions from a higher layer; the platform consumes only the engine's published contract.
- Track BPMN requirement, CIB profile, and platform milestone coverage as three separate denominators; never combine them or use success in one layer as evidence for another.
- Downstream demand may prioritize the next mechanism or CIB relationship, but product bean names, façade APIs, data shapes, deployment assumptions, and license-bound source stay out of the BPMN core, Lean, the IL, and the semantic core.
- Declare each capsule's Lean lane shape at capsule start as proved, checked, or deliberately open under [the assurance-lane rule](docs/PROJECT-DESIGN.md#lean-assurance-lane). A lane that cannot close within its effort bound records its precise unresolved boundary; it never quietly becomes a weaker claim.
- Implement profile-dependent behavior only after its interpretation and scope are approved and recorded. Formalize a CIB/BPMN mismatch as profile behavior only after classifying it in [the register](docs/CIB-BPMN-RELATION-REGISTER.md) as normative agreement, gap resolution, extension, configuration-specific realization, limitation, or evidence-backed deviation; keep candidate and confirmed deviations prominent.
- Never silently choose an oracle release, feature meaning, expression subset, observation boundary, scheduling rule, listener scope, history contract, or external-effect contract.
- Do not transplant CIB PVM types, persistence entities, behavior classes, or engine algorithms into Lean or the semantic core.
- Generated TypeScript is never the authoritative representation of a BPMN model; preserve admitted source/profile identity and execute current project-owned definition data through the semantic core.
- Keep semantic `bpmn-moddle` and raw moddle objects inside `@bpmn-lean/bpmn-source`; Lean, the semantic core, and Temporal Workflow code consume only project-owned serializable contracts. The sole exception is the Product 2 definition-projection boundary as constrained in [ARCHITECTURE user interface](docs/ARCHITECTURE.md#user-interface): no raw moddle export, only validated DI bytes and a closed exact-source-bound Human Task catalog, no admission or semantic authority.
- Every parser warning blocks admission until a profile rule explicitly proves it safe; preserve exact bytes and normalized evidence even when compilation is rejected.
- Never encode Temporal Workflow tasks, Activity attempts, retries, Run IDs, or Event History as BPMN semantic facts.
- Keep BPMN import/admission, executable normalization, runtime execution, public observation, and host persistence conceptually separate.
- Keep neutral scenario inputs physically separate from retained expected results. Target runners receive no oracle answer; evidence replacement is an explicit operation outside ordinary verification, bound to exact scenario content.
- Each semantic-profile artifact names its reviewed CIB–BPMN relationship IDs; add the register entry and verifier coverage together, never an unregistered placeholder ID.
- Keep the pinned reference baseline pristine; modified source belongs to an explicit experimental branch or worktree and is diagnostic until shadow-compared.
- Keep A12 source strictly outside the project dependency and distribution boundary. A12 is EUPL-1.2 and may be inspected only as an external research, compatibility, and optional exact-source evidence input recorded in [SOURCES.md](docs/SOURCES.md); never link it into this project, vendor it, use it as a build or runtime dependency, copy it into project-authored artifacts, or present it as MIT-licensed material. This repository must remain distributable under its MIT license. Any confirmed or potential violation is a blocker: stop, preserve the suspect material and provenance without redistributing it, and require an explicit owner resolution before continuing affected work.
- An experiment is not semantic authority merely because it compiles or passes a finite witness. Never broaden a semantic capsule beyond its approved feature, interpretation, and observation boundary.
- A first vertical slice may cross BPMN, CIB, Temporal, and downstream seams to prove feasibility; afterwards reuse the lower-layer mechanism, keep model/handler/client adaptation downstream, and open a full capsule only for a new BPMN proposition, newly selected CIB relationship, or material refinement risk.
- Implement no new semantic transition family in Lean or the production semantic core before its capsule records a [Temporal hosting/refinement preflight](docs/PROJECT-DESIGN.md#temporal-hostingrefinement-preflight) naming durable ingress, wait, timer, effect, cancellation, lifecycle, and projection mechanisms; the state relation they preserve; delivery, ordering, concurrency, deduplication, retry, and replay risks; and the smallest executable refinement witness. “Temporal has no matching concept” is no blocker; an unclassified gap in preserving a public semantic outcome is.

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

For every issue of any kind, find the causal mechanism before choosing a correction or workaround: name the failing boundary and the invariant it breaks, separate observed evidence, hypothesis, and demonstrated cause (a matching stack trace or upstream issue is a lead, not proof), reproduce with the smallest separating witness, test the explanation against a second instance or adversarial counterexample, fix the mechanism, and verify the original failure and its class. An unknown cause stays recorded as unresolved; symptom suppression is never a repair.

Never disable a compiler, runtime feature, validation, assertion, or test, reduce coverage, increase retries or deadlines, or substitute a dependency merely to get green. A workaround needs a report (investigation, uncertainty, why no direct repair, consequences, removal condition) and explicit owner approval; earlier use elsewhere or a passing rerun is neither. Diagnostic experiments stay separate from accepted configuration and qualification evidence. For an upstream defect, verify versions and a source-level explanation or reproducer and validate an actual corrective patch within dependency rules; otherwise report the blocker, keep affected release qualification open until corrected or an owner-accepted documented exception, and continue independent work.

**Owner direction: defer SDK defects.** Never initiate SDK repair, private SDK builds, patch qualification or an SDK-fix investigation on your own. Record the defect, impact and failed evidence in [the Temporal defects ledger](docs/TEMPORAL-DEFECTS-LEDGER.md) and continue implementation. Only an explicit owner direction reopens SDK work; a general request to continue or fix project failures does not. Keep failed qualification and dependency-approval rules without making SDK repair a prerequisite for independent work.

### Balance semantic breadth and usable delivery

Reaching the Practical CIB7 Coverage finish line outranks the governance cycle, at bare-minimum overhead (owner directions 2026-10-13 through 2026-10-23, consolidated here and superseding conflicting steps in policy owners and capsules); quality, gates, claims and review independence are never weakened.

- **Deliverable first.** [PLAN's exact resume point](docs/PLAN.md#exact-resume-point) states `Deliverable`, `Acceptance blockers` and `Effort budget` before supporting work. Tie every investigation, repair, proof, documentation change and delegation to a named blocker; record other findings in their owner without reprioritizing (explicit owner reprioritization wins and goes into PLAN). At the effort limit or when evidence invalidates the path, stop and record result, consumed budget and next decision; never automatically renew the budget, add proof owners or expand infrastructure.
- **Family cycle.** Deliver per checklist family and grow one cumulative profile per family in place ([profile identity](contracts/README.md)). After an approved increment, finish Lean/TypeScript agreement, public registration and the whole-model journey before opening another family, without rebuilding every layer per model; tier the Lean lane by risk ([assurance lane](docs/PROJECT-DESIGN.md#lean-assurance-lane)) and run Temporal refinement and a hosted witness only for a new hosting mechanism.
- **Reviews.** One cold design review of the family proposal and one cold code review at family closure, each with its correction audit. No stage, slice or checkpoint reviews, and no reflections or cost rows beyond what an executable guard requires.
- **Verification cadence.** While coding, run type checks, the narrowest focused test and the fast `scripts/*.test.ts` guards before each commit. Each heavy lane (complete pipeline, full Lean, `BpmnConformance`, hosted Temporal) runs once per family closure, plus once after a correction that touches its inputs; rerun only to test a named hypothesis, never to re-observe a known failure. Failing tests may be repaired in batches inside a family and are fixed before its closure review; a push lands on `main` only through the [branch push flow](docs/TESTING-SPEC.md#branch-push-flow) with green hosted checks.
- **Investigations.** Time-box a side investigation at three attempts, then record the limit and move on. Runtime investigation stays subordinate to the increment: once a defect has a demonstrated cause or documented qualification limit and an alternative was evaluated, record it and continue; reopen only for new corrective evidence or a named deciding witness with a bounded exit. A known upstream defect never justifies weaker gates, an unapproved workaround or a public-readiness claim; [PLAN.md](docs/PLAN.md#exact-resume-point) owns any investigation hold.
- **Documentation** changes only at family closure or handoff: PLAN's resume point, the affected map lines and the capsule's required facts, without narrative paragraphs.
- **Judgment.** Decide routine matters within authorized scope yourself. Never stop at an apparent blocker: reconsider its cause, try a correction or alternative qualification path, then record missing evidence and next action. If work drifts into case-by-case fixes, tell the owner and revise the shared mechanism. Progress is useful behavior with a closed acceptance boundary, not proof volume or test counts; keep semantic, hosted and user-facing evidence separate, measure accepted capability increments and elapsed time, and report stalls early.
- **Parallel workers.** Two or three MEDIUM or LOW workers may run in parallel on disjoint families for tests, scenarios and docs while HIGH keeps Lean, semantics and acceptance.

**Heavy lanes:** parallel workers never run a heavy lane. Lean, Docker, a Temporal server, `test:pipeline`, `test:temporal`, `verify.sh` and any other container- or Temporal-starting command run only from the root, one at a time across every checkout of this project (other projects' processes do not count), because concurrent heavy lanes exhaust the development machine; workers run only TypeScript type checks and TypeScript-only tests.

### Established practices

Default to established ecosystem practices and native tool mechanisms; invent no bespoke abstraction, policy, manifest, workflow, or duplicate source of truth when the standard practice suffices, and get owner approval for a deviation after explaining the standard approach, exact gap and tradeoff. A documentation control-plane defect found in ordinary work is a regular defect: find the root mechanism, guard the class, fix it proportionately, continue; never route around it silently.

Before Product 2 persistence or PostgreSQL work, follow the [database test selection and cadence](docs/PLATFORM-VERIFICATION-POLICY.md#database-test-selection). Preserve cached Docker images needed for builds, tests, or demos, especially the pinned Temporal image; clean up task-owned containers without broad image or system pruning. Before an architecture experiment or spike, read [experiment admission](docs/experiments/README.md#architecture-experiment-admission).

### Before frontend recommendations

Before recommending a frontend library, routing approach, state owner, component system, or application structure, in discussion and review as well as implementation, read the [frontend recommendation preflight](docs/ARCHITECTURE.md#frontend-recommendation-preflight) and its owners in order, and state which adopted decision the recommendation preserves or reopens.

### Product 2 UI/UX source preflight

For every material Product 2 UI/UX surface, inspect CIB Seven first when it has an analogous capability (current documentation and pristine pinned source), run the `research` doctor scope, and complete the [source-grounded design preflight](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md#source-grounded-design-preflight) before production code. Then apply [content-first presentation](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md#content-first-presentation), the journey and explicit-control rules in [components and patterns](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md#components-and-patterns), and [disclosures and dialogs](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md#disclosures-and-dialogs). Never copy code, styling, assets, private data models, or product terminology.

### Semantic code

For Lean implementation and proof refactoring, follow [Lean proof design and review](docs/REVIEW-POLICY.md#lean-proof-design-and-review). Use red/green TDD through the [red/green semantic workflow](docs/TESTING-SPEC.md#redgreen-semantic-workflow), implementing the semantic root rather than a case-specific patch. The Temporal preflight is a feasibility review, not refinement evidence; it separates a finite conformance-scenario host from the production lifecycle and returns unresolved mappings to research or profile review before they become implicit adapter policy. Before closing a capsule or adding claim lanes, rule identifiers, transition families or artifacts, read [capsule claim lanes](docs/capsules/README.md#capsule-claim-lanes-and-transition-family-rules).

Begin coverage work from the BPMN requirement and reusable mechanism; add CIB work only under [CIB evidence on demand](docs/PROJECT-DESIGN.md#cib-evidence-on-demand). The platform prioritizes (standard mechanism, then required CIB overlay, then platform binding); a target-shaped feasibility fixture may test the full composition once, later reusing models are platform regression evidence. Each supported element or variant needs a retained whole model with a credible business purpose, added atomically under the [model-corpus](model-corpus/README.md) guard; an isolated element fixture is never “real-world”.

Prefer enum-based pattern matching or switch statements for semantic variants. Keep the Semantic Process program immutable and runtime state separate and serializable; keep effects explicit and perform no I/O in the pure semantic core.

#### Forward-compatible semantic restrictions

A bounded capsule may restrict the BPMN models, states, or schedules it admits, but it must not present that restriction as the general meaning of the BPMN construct. Before approving a representation or semantic rule, compare it with the complete applicable standard account and verify that later standards coverage can broaden admission or behavior without invalidating the representation or reinterpreting models already accepted under the capsule. Record conforming but deferred behavior explicitly, and redesign before implementation when the chosen representation would foreclose it.

### Delegated implementation

Model tiers are symbolic (HIGH, MEDIUM, LOW); resolve them through the tier table in your global instructions (maintainer's table: [Model tier mappings](https://github.com/mbackschat/coding-setup/blob/main/CLAUDE.md#model-tier-mappings)). Without one, run HIGH on your most capable model, MEDIUM on a faster, cheaper one and LOW on the fastest, cheapest one, and say which you used. MEDIUM and LOW agents are fresh agents, never forks, because a fork inherits the root's model.

The root integrator is HIGH. Assign work by what its result is, not by subject or size:

- **HIGH decides and claims:** scope, meaning, design, bounds, oracles, status, acceptance, review verdicts and [commit boundaries](docs/REVIEW-POLICY.md#commit-boundaries); HIGH integrates and accepts every handback.
- **MEDIUM constructs against an exact contract** whose oracle and owned paths are given and a deterministic check settles: TypeScript test fixtures, cited source extractions, documentation and source-map sweeps. Lean code and proofs, semantic and design code, and production implementation stay with HIGH ([Finding 78](docs/PROCESS-ASSESSMENT-LEDGER.md#finding-78): delegated Lean and semantic work produced the wrong evidence and a 13 GB build).
- **LOW executes with no open choice:** a fully specified procedure settled by an exit code, guard, receipt or empty diff, such as read-only searches, named commands, or applying text HIGH supplies.

For an unfamiliar task, ask what an undetected mistake would change: a decision or claim means HIGH, something only a given oracle or reviewer catches means MEDIUM, something a deterministic check catches means LOW; when unsure, take the higher tier. Agents return work unchanged at the first choice their brief does not settle. Delegate only when it saves more root turns than it costs; it needs no per-task permission. Give each new agent a task-shaped name and a brief per the [delegation protocol](docs/REVIEW-POLICY.md#delegated-implementation-protocol); add concurrency only for independent subtasks with disjoint file ownership/build outputs, following the [delegation lifecycle](docs/REVIEW-POLICY.md#delegation-lifecycle). **Sub-agents never edit Lean, run a Lean command, or run a heavy lane.** Required reviewers follow [independent cold review](#independent-cold-review); implementers never review their own work.

### Independent cold review

For a Lean-bearing stage, apply [Lean proof design and review](docs/REVIEW-POLICY.md#lean-proof-design-and-review) in the static scan and the review prompt; compilation alone does not establish adequate modeling or proof composition.

Apply [the independent cold-review gate](docs/REVIEW-POLICY.md#independent-cold-review-gate) twice per family: to the material family proposal and at family closure, where the cold code review is the [capsule closure review](docs/REVIEW-POLICY.md#capsule-closure-review) after the closure gates are green. For Practical CIB7 Coverage a proposal belongs to a family batch: select the two to four related rows that share a mechanism, never one row alone when a sibling shares it (owner direction 2026-10-22). Only changes to BPMN meaning, profile/CIB relationship, checked-source/IL or runtime representation, admission, public observation, transition family, proof boundary, or Temporal refinement claim are material. Commit the target, pause edits, and paste the generated semantic review packet verbatim. Required corrections block; the same reviewer audits bounded corrections, and material redesign needs a new cold review. A green independent verdict establishes approval; an unavailable review stops the family, never replaced by self-review.

Spawn each cold reviewer with no forked turns and without a model or reasoning override (`fork-turns-none`). Cold or warm, every reviewer uses the root agent's same model and reasoning effort; never substitute a generic or general worker tier. Reviewers stay read-only. [Warm-review rules](docs/REVIEW-POLICY.md#when-a-warm-review-is-valid) cover correction audits, preflights, non-material integration review, and guarded warm closure continuity; the single-lane atomic closure exception follows [combined checkpoint and closure](docs/REVIEW-POLICY.md#combined-checkpoint-and-closure). Maintain `## Status` and the [review receipt](docs/REVIEW-POLICY.md#review-receipt). Contributors may not approve, append, rebase, or replace the grandfather set fixed by `f1ef362`; changing it requires an owner-governance decision.

### Comments — document semantic surplus

Comments carry non-obvious contracts and invariants that names, types and control flow cannot; add them in the change that introduces the fact. Before adding or materially changing comments, docstrings or test documentation, read [the comment rules](docs/CODE-STYLE-GUIDE.md#comments--document-semantic-surplus).

### Code hygiene and module boundaries

Keep each source file, class, namespace, and function at one responsibility and abstraction level; a third independent responsibility stops feature work until cohesive owners are extracted. Hand-written Lean, TypeScript, JavaScript, and Java files target 800 nonblank lines with a hard ceiling of 1,200; a file above 800 needs an owner-approved exception in the source-hygiene guard, never one an agent adds itself. Before writing or growing such source, read [the code style guide](docs/CODE-STYLE-GUIDE.md#code-hygiene-and-module-boundaries). Before changing decision tactics or measuring Lean cost, read [Lean decision procedures](docs/CONTRIBUTOR-SETUP-GUIDE.md#lean-decision-procedures-and-build-memory); when an enforced resource ceiling catches a regression, follow [resource-ceiling breaches](docs/CONTRIBUTOR-SETUP-GUIDE.md#resource-ceiling-breaches) and never raise or bypass the limit.

### Pre-release evolution

Keep exactly one current representation of every wire contract; a breaking change replaces every producer, consumer, fixture, schema and test atomically. Before an approved durable baseline add no format counters, legacy readers, compatibility switches, migrations, Workflow patch branches, retained Event History fixtures, or deployment fallbacks; every new Workflow execution carries the admitted current definition, never a fallback constructor's invention. [The pre-release evolution policy](docs/PROJECT-DESIGN.md#pre-release-evolution-policy) owns details and post-baseline obligations.

### Dependencies

**Routine npm updates must use stable releases at least 14 days old**, including transitive dependencies. Keep strict age enforcement, reject missing publication timestamps, verify frozen lockfiles, and keep install scripts disabled unless individually reviewed. An urgent security fix may bypass the wait only for an exact package version with a verified advisory, exposure assessment, reviewer, justification and expiry at 14 days, per the [security update procedure](docs/CONTRIBUTOR-SETUP-GUIDE.md#dependency-security-procedure). Never exempt a whole package or scope, disable the policy globally, or suppress an advisory to make a build pass. Age does not establish safety.

Keep each component’s dependencies at the smallest approved set. Obtain explicit user approval before adding, removing, upgrading, vendoring, or replacing any Lake, Java, Node, pnpm, Temporal, parser, test, build, or runtime dependency. **This applies to the BPM platform exactly as to the engine** ([dependency posture](docs/PROJECT-DESIGN.md#dependency-posture)): weigh a candidate against the whole alternative, including defects we would own. Record exact version, role, license, provenance, and removal cost before adoption. Before editing a manifest, lockfile or package build script, read [manifest and build-graph rules](docs/CONTRIBUTOR-SETUP-GUIDE.md#dependency-manifests-and-build-graph).

## Documentation ownership

Follow [DOC-DISCIPLINE.md](docs/DOC-DISCIPLINE.md) before adding, renaming, moving, graduating, archiving, or deleting a document, and its [README audience contract](docs/DOC-DISCIPLINE.md#top-level-readme-audience) before editing the root README or infographic copy. `-SPEC` means an implemented current contract; approved but unimplemented intent stays `-PROPOSAL`. One Markdown paragraph per line, no hard wrapping, regular relative links. Each fact has one owner, listed in [project document homes](docs/DOC-DISCIPLINE.md#project-document-homes); link to it instead of copying it.

Treat feedback efficiency and development speed as non-negotiable engineering constraints: a composed gate builds a dependency graph once and reuses its artifacts, and a budget breach needs root-cause correction, not a longer timeout or weaker evidence ([three-level verification](docs/TESTING-SPEC.md#three-level-verification-policy)). Never activate the `linear-walkthrough` skill and never invoke `showboat` directly or indirectly; author maintained Markdown directly and verify it only through repository-owned gates.

## Reference and source discipline

Reference checkouts are research inputs under sibling `../oss` (override `BPMN_EXTERNAL_ROOT`), provisioned by the setup/doctor workflow, never runtime dependencies of Lean or the semantic core; link them relatively via [SOURCES.md](docs/SOURCES.md) and never commit absolute home paths, usernames, hostnames, credentials, or machine state. Inspect the pinned checkout before relying on memory, summaries, or web search. A missing or mismatched input is an infrastructure failure, not permission to skip; cloning approves no dependency or authority.

Project-authored code and documentation are [MIT](LICENSE). Never copy, vendor, link, or redistribute external material under it without verifying compatibility, preserving notices and attribution, and recording the decision in [SOURCES.md](docs/SOURCES.md); the A12 boundary above applies regardless. For CIB or Temporal source changes, keep a clean pinned evidence lane per [REFERENCE-INSTRUMENTATION-POLICY.md](docs/REFERENCE-INSTRUMENTATION-POLICY.md).

The OMG BPMN corpus stays external ([reference pointer](docs/reference/bpmn-2.0.2/README.md)); track only project-authored digests, provenance, hashes and tooling, and read it through the [reading workflow](docs/reference/bpmn-2.0.2/README.md#reading-workflow). Before opening a PDF, name the specific gap in the text or extracted figures and the page or clause needed. Do not bypass the search exclusions for routine reading or re-extract a whole PDF when the reading copy exists; after a justified fallback, repair the reading copy or retain a source-linked correction. Hash verification and initial conversion are not reading fallbacks.

## Verification

In a managed sandbox, request host port-binding authorization before the first attempt to run `./scripts/verify.sh`, `./scripts/pnpm.sh run test:infrastructure`, `./scripts/pnpm.sh run test:temporal`, `./scripts/pnpm.sh run test:pipeline`, or `./scripts/pnpm.sh run test:timer-time-skipping`; never probe inside the sandbox first. A loopback `Operation not permitted`/`EPERM` is a sandbox denial, not a port collision or test failure.

**Never invoke `lake` or `lean` directly. Use [the Lean wrapper](scripts/lake.sh): `./scripts/lake.sh build`, `./scripts/lake.sh test`, `./scripts/lake.sh run <source.lean> [arguments...]`, `./scripts/lake.sh exe <target>`, `./scripts/lake.sh env lean <file>`.** The wrapper alone owns build parallelism (pin from [package.json](package.json) `config.leanBuildThreads` via [the pin reader](scripts/pinned-toolchain.sh), replacing inherited `LEAN_NUM_THREADS`) and holds one fail-closed project lock shared by every checkout of this repository, so a second Lean process tree of this project refuses to start. An explicit `BpmnSemantics` target is forbidden; every full-library build (`build` without a `BpmnSemantics.` submodule or declared executable, or any `test`) is refused unless `LEAN_FULL_GATE=<gate-or-batch-id>` names its gate or [Lean batch](docs/TESTING-SPEC.md#focused-gate-matrix); focused commands name only narrow targets. Never run a full build to warm caches, discover consumers or re-observe a known failure. The [memory brake](scripts/lean-memory-brake.sh) at `config.leanMemoryBrakeMiB` exits `70` on a resource-ceiling breach, never a reason to raise it, and is not the hard ceiling that [memory-bounded measurements](docs/CONTRIBUTOR-SETUP-GUIDE.md#memory-bounded-lean-measurements) and first builds of changed kernel-decided fixtures require. Build a runnable module explicitly and use `run` for its `main`; package tests run a driver's declared `[[lean_exe]]` binary through [the native-driver helper](scripts/lean-native-driver.ts), which builds it before any test deadline (a driver that binds proof-bearing fixtures stays interpreted), and programmatic `exe` invocations are forbidden because they re-native-compile an elaborated closure. Never override the pin or start another Lean command while one has yielded. Only the root runs Lean.

Local Lean commits use focused module/consumer builds and regression tests; affected-package qualification and review come at semantic-batch acceptance, before dependent work; milestones and tags need complete verification and release acceptance. Select gates via [three-level verification](docs/TESTING-SPEC.md#three-level-verification-policy) and the [focused gate matrix](docs/TESTING-SPEC.md#focused-gate-matrix), and deadlines via [command deadline selection](docs/VERIFICATION-INFRASTRUCTURE-POLICY.md#command-deadline-selection); never apply a focused-build timeout to the full Lean library. Full verification is `./scripts/verify.sh` then `git status --short`. Gate index (discoverability, not a run list; groups: engine, platform, showcase/release/UI outside `verify.sh`, pre-push, explicit service-starting):

```sh
./scripts/pnpm.sh run test:semantic
./scripts/pnpm.sh run test:semantic-core
./scripts/pnpm.sh run check:semantic-types
./scripts/pnpm.sh run test:temporal
./scripts/pnpm.sh run test:bpmn-source
./scripts/pnpm.sh run test:contracts
./scripts/pnpm.sh run test:differential
./scripts/pnpm.sh run test:pipeline
./scripts/pnpm.sh run test:miwg
./scripts/pnpm.sh run test:timer-time-skipping
./scripts/pnpm.sh run test:model-corpus
./scripts/pnpm.sh run check:harness-types
./scripts/pnpm.sh run check:source-hygiene
./scripts/pnpm.sh run test:infrastructure

./scripts/pnpm.sh run test:platform-foundation
./scripts/pnpm.sh run test:platform-m1
./scripts/pnpm.sh run test:platform-process-search-checkpoint
./scripts/pnpm.sh run test:platform-work-checkpoint
./scripts/pnpm.sh run test:platform-operations-checkpoint
./scripts/pnpm.sh run test:evaluation-distribution:structure
./scripts/pnpm.sh run test:platform-postgresql:runtime:local
./scripts/pnpm.sh run test:platform-postgresql:local

./scripts/pnpm.sh run test:showcase:m1
./scripts/pnpm.sh run test:showcase:m2
./scripts/pnpm.sh run test:showcase:m2-process-instance-search
./scripts/pnpm.sh run test:showcase:m3-human-work
./scripts/pnpm.sh run test:showcase:m4-incident-operations
./scripts/pnpm.sh run test:showcase:mue-preview-alpha
./scripts/pnpm.sh run test:release:m3
./scripts/pnpm.sh run test:release:m4
./scripts/pnpm.sh run test:release:mue-preview-alpha
./scripts/pnpm.sh run test:release:mue-preview-beta
./scripts/pnpm.sh run test:ui-quality
./scripts/pnpm.sh run test:ui-quality:visual

./scripts/pnpm.sh run test:pre-push
./scripts/pnpm.sh run test:pre-push:verify
./scripts/pnpm.sh run test:pre-push:platform
./scripts/pnpm.sh run test:pre-push:platform-postgresql
./scripts/pnpm.sh run test:pre-push:showcase
./scripts/pnpm.sh run test:pre-push:ui

./scripts/pnpm.sh run evaluation:start
./scripts/pnpm.sh run walkthrough:screenshots:refresh
./scripts/test-cibseven-oracle.sh
./scripts/lake.sh exe checkSemanticRepresentationSpike
./scripts/lake.sh exe checkCheckedSourceRelationExperiment
LEAN_FULL_GATE=<gate-or-batch-id> ./scripts/lake.sh build BpmnConformance
```

MUE Preview Beta builds Product 2 once and reuses the Alpha, correlated Message and UI-quality lanes; `BpmnConformance` builds at family closure and in CI; MIWG, timer time-skipping and visual review are optional; the model corpus needs the research doctor first. Install pinned Playwright Chromium per [the clean-clone path](docs/CONTRIBUTOR-SETUP-GUIDE.md#clean-clone-path) before browser acceptance and keep M1 as the unseen-source regression floor for M2. See [evaluation setup](docs/CONTRIBUTOR-SETUP-GUIDE.md#evaluation-distribution), [CIB gate](docs/SEMANTIC-VERIFICATION-POLICY.md#current-cib-gate), [experiments](docs/experiments/README.md).

Push authorized work through the [branch push flow](docs/TESTING-SPEC.md#branch-push-flow): commit, require a clean worktree and green focused gates, push a branch with a pull request, and fast-forward `main` only to the exact SHA whose hosted checks, including `verify-complete`, are green. `./scripts/pnpm.sh run test:pre-push` remains the complete local equivalent (derived from committed changed paths, fail-closed, explicit or disposable PostgreSQL 18) when hosted CI is unavailable or a boundary needs local macOS evidence.

Every helper process you start must terminate itself: bound it with `timeout`, an explicit deadline, or a fixed iteration count; a later `kill` is never the only exit. Capture each `$!` right after its own `&`, never `PIDS=$(jobs -p)` (its subshell owns no jobs, so the `kill` silently hits nothing; eight load generators once ran orphaned at a host load above 100). Sweep for strays, including ephemeral Temporal servers, before reporting a host measurement; a contended measurement must be repeated.

Before starting any JavaScript or TypeScript test or build, follow the [long-running-command policy](docs/VERIFICATION-INFRASTRUCTURE-POLICY.md#long-running-javascript-and-typescript-commands): retain recoverable evidence, resume after compaction instead of duplicating, and report green only after `node scripts/assert-command-receipt.ts <absolute-receipt-directory>` exits zero with its success verdict. Use pnpm, not npm. The adapter's `skipLibCheck: true` exists only for the pinned Temporal declarations under TypeScript 7.0.2; never broaden it to the semantic core. Always run `git diff --check`.

## Git and delivery

- Preserve unrelated user changes and avoid destructive Git operations.
- Make local commits autonomously for coherent, qualified changes, honoring required gates and explicit user instructions about committing.
- Use Conventional Commits: `type(scope): subject`, lowercase type, imperative subject, plus a concise body when non-obvious rationale, architectural consequences, or compatibility constraints would otherwise be lost.
- Do not push `main` or tags without an explicit current request. Feature branches may be pushed so that hosted CI runs full builds (owner direction 2026-10-23); `main` still moves only through the [branch push flow](docs/TESTING-SPEC.md#branch-push-flow).
- Keep [AGENTS.md](AGENTS.md) as a symlink to `CLAUDE.md`; never maintain divergent copies.
- The default branch requires the `verify-complete` hosted check (selected Ubuntu verification). Administrators may bypass it; never override to land unverified work.

Before handing off, update every affected detail map routed by [`implementation-status-router`](docs/IMPLEMENTATION-MAP.md) with exact implemented and absent scope, update [PLAN.md](docs/PLAN.md) with the last verified command and next action, run the fast guards and `git diff --check` (heavy lanes keep their [family cadence](#balance-semantic-breadth-and-usable-delivery)), and leave a clean tree or document every unfinished file and failing command.

### Project tags

Before creating, pushing, or moving any tag, read the [project tag procedure](docs/VERIFICATION-INFRASTRUCTURE-POLICY.md#project-tag-procedure). Non-release completion points use annotated `phase/<kebab-case>` tags and qualified distributions annotated `vMAJOR.MINOR.PATCH[-prerelease]` tags; never reuse the `M1`–`M6`/`MVP` namespace. Create tags only at a clean, completely verified committed `HEAD`, with one `--receipt <absolute-receipt-directory>` per applicable gate, each naming the exact target commit. Never force or move a published tag except an explicitly owner-directed RC realignment bounded by that procedure, and push only the exact intended tag:

```sh
node scripts/project-tags.ts create release 0.2.0-rc.1 --message "Release 0.2.0-rc.1" --receipt <absolute-pre-push-receipt-directory> --receipt <absolute-release-receipt-directory> --push
node scripts/project-tags.ts push phase shared-persistence
```
