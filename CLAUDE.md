# CLAUDE.md / AGENTS.md

Shared guidance for Claude Code, OpenAI Codex and human contributors in **bpmn-lean-experiment**. [AGENTS.md](AGENTS.md) is a symlink to this one file. The project uses the HIGH, MEDIUM and LOW model tiers of the maintainer's global instructions ([tier table](https://github.com/mbackschat/coding-setup/blob/main/CLAUDE.md#model-tier-mappings)); without them, HIGH is your most capable model, MEDIUM a faster one and LOW the fastest.

The project is being rewritten as a modular kernel by owner direction (2026-11-08). The [kernel rewrite proposal](docs/LEAN-KERNEL-REWRITE-PROPOSAL.md) owns the design, the guardrails, the delivery plan and the definition of done until it graduates to `docs/kernel/`. Old documents under `docs/` remain only as extraction sources until W0.4 and bind nothing; where one conflicts with this file or the proposal, this file and the proposal win.

## Start every session

1. Read [PLAN's exact resume point](docs/PLAN.md#exact-resume-point).
2. Read the proposal sections the task touches; for a coverage row, its row in the [coverage target](docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) by stable ID.
3. Inspect `git status --short --branch` and `git log -5 --oneline`; preserve unrelated changes.

## Mission

Build two MIT products: a Temporal-hosted BPMN 2.0.2 execution engine bounded in breadth and depth by CIB Seven `2.2.0`, and a BPM platform (Product 2) on top of it. [Practical CIB7 Coverage](docs/PRACTICAL-CIB7-COVERAGE-TARGET.md) is the delivery target. Variants absent from CIB7 are out of scope. BPMN stays the semantic authority; CIB differences are classified, not imitated. The A12 Workflows replacement is a separate A12-owned EUPL-1.2 product, out of scope here.

## Rule 1: no routine GitHub-hosted macOS

Do not add macOS to a push, pull-request, scheduled, matrix, ordinary release or other routine workflow: no macOS-native artifact ships, the development computer owns local macOS validation, and Ubuntu is the routine portability lane. A focused macOS smoke job is allowed only for an explicit clean-machine or ARM purpose, guarded by `github.event_name == 'workflow_dispatch'`, never running the complete suite. [Larger macOS runners stay billable](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) and need an owner decision. The executable runner policy rejects every macOS label outside that boundary.

## Rule 2: declare and check every bulk change

A script that creates, edits, moves or deletes repository files, a repeated mechanical pass, or a change touching more than 20 files declares in its header its scope (the exact file set or selector and what it must never touch) and its target effect (expected files and net lines, as limits), and stops when it exceeds them. After it runs, a post-run diff against the commit it started from is compared with the declaration before anything builds on the result. An effect beyond the declaration or a file outside the scope is reverted in full; the script is fixed after its root cause is named, never the result patched in place. A repository-owned generator whose complete output a guard verifies is exempt.

## Rule 3: no one-off scripts or tests in the repository

A script or test that serves one task (migration, repair, conversion, seeding, measurement, probe) lives in the session scratchpad and never enters the repository. A repository script stays only while a gate, package script, workflow or maintained procedure runs it; a repository test stays only while it protects a standing contract. The change that ends such a contract deletes its scripts, tests and fixtures.

## Authority model

1. BPMN 2.0.2 and its normative machine-readable artifacts are authoritative for syntax, metamodel and Process Execution Conformance.
2. An immutable semantic profile is the compatibility authority for one declared target; a profile is data (selected CIB relation options and the admitted field set).
3. Lean is the formal semantic authority for that profile's operational meaning.
4. The pinned complete CIB Seven engine is the executable behavioral oracle for its compatibility profile.
5. The TypeScript kernel is a separately written transcription of the Lean kernel with no CIB Seven or Temporal dependency.
6. The Temporal adapter provides durability and hidden orchestration work without defining BPMN behavior.

When sources appear to disagree, classify the relationship in the [CIB–BPMN relation register](docs/CIB-BPMN-RELATION-REGISTER.md) against the standard, profile, configuration, observation boundary and evidence; never by majority. A register entry lands in the same commit as the profile behavior it governs.

## Non-negotiable boundaries

- Dependency direction: BPMN execution kernel → selected CIB compatibility overlay → BPM platform. Lower layers never import or encode assumptions from a higher layer; the platform consumes only the engine's published contract and never constructs an occurrence identity.
- BPMN requirement, CIB profile and platform milestone coverage are three separate denominators.
- Product bean names, façade APIs, data shapes, deployment assumptions and license-bound source stay out of the kernel, Lean and the IL.
- Never silently choose an oracle release, feature meaning, expression subset, observation boundary, scheduling rule, listener scope, history contract or external-effect contract.
- Do not transplant CIB PVM types, persistence entities, behavior classes or engine algorithms into Lean or the kernel.
- Generated TypeScript is never the authoritative representation of a BPMN model; the kernel executes project-owned definition data.
- `bpmn-moddle` and raw moddle objects stay inside `@bpmn-lean/bpmn-source`; Lean, the kernel and Temporal Workflow code consume only project-owned serializable contracts. The sole exception is the Product 2 definition-projection boundary in [ARCHITECTURE](docs/ARCHITECTURE.md#user-interface).
- Every parser warning blocks admission until a profile rule proves it safe; preserve exact bytes and normalized evidence even when compilation is rejected.
- Never encode Temporal Workflow tasks, Activity attempts, retries, Run IDs or Event History as BPMN semantic facts.
- The TypeScript and Temporal solution never depends on a JVM, in its runtime, build or local test loop (owner decision 2026-11-08). The pinned CIB Seven oracle stays an external evidence input, run only in its hosted lane.
- Keep import and admission, normalization, runtime execution, public observation and host persistence separate.
- Keep neutral scenario inputs physically separate from retained expected results; target runners receive no oracle answer.
- Keep the pinned reference baseline pristine; modified reference source belongs to an explicit experimental branch.
- Keep A12 source strictly outside the dependency and distribution boundary. A12 is EUPL-1.2 and may be inspected only as an external research and optional evidence input recorded in [SOURCES](docs/SOURCES.md); never link, vendor, copy or present it as MIT material. A confirmed or potential violation is a blocker: stop, preserve provenance without redistributing, and get an owner resolution.
- A finite witness is not semantic authority, and no change broadens BPMN meaning beyond its reviewed interpretation.

## Semantic invariants

- Commands distinguish committed, rolled back, rejected, semantic failure and unsupported outcomes.
- Harness and infrastructure failures remain separate from semantic outcomes.
- Logical time, scheduler actions, races and other nondeterministic choices are explicit inputs.
- Enabled external interactions are part of the observation contract.
- Collections preserve multiplicity; variables preserve scope and semantic type.
- Definition identity, semantic instance identity and host-runtime identity remain distinct.
- External-effect lifecycle remains distinct from internal semantic state.
- Temporal transport retries remain distinct from CIB-visible retries and incidents.
- Speculative command state is not exposed as committed observation.
- No claim exceeds the declared profile, environment, feature surface, observation boundary and evidence.

### Forward-compatible restrictions

A track may restrict the models, states or schedules it admits, but never presents the restriction as the general meaning of the construct. The kernel IL carries the full shape for every row; a field outside the admitted surface is refused with a stable refusal code, never left out of the type, so later admission widens without reinterpreting accepted models.

## Working method

### Root cause before fixes

For every issue, find the causal mechanism before choosing a correction: name the failing boundary and the invariant it breaks, separate evidence from hypothesis, reproduce with the smallest separating witness, fix the mechanism and verify the class. Never disable a compiler feature, validation, assertion or test, reduce coverage, raise a bound, increase retries or deadlines, or substitute a dependency to get green. A workaround needs a report and explicit owner approval.

### SDK defects

Never initiate Temporal SDK repair, private SDK builds, patch qualification or an SDK-fix investigation. Record the defect in [the Temporal defects ledger](docs/TEMPORAL-DEFECTS-LEDGER.md) and continue; only an explicit owner direction reopens SDK work.

### Delivery

Deliver by mechanism track as the proposal plans. Report a missed budget to the owner at once with the boundary reached and the next decision; never renew it silently. Decide routine matters yourself. If work drifts into case-by-case fixes, revise the shared mechanism. `PLAN.md` and the kernel status map change only at a milestone or track closure, or at a stop. No work-in-progress or park commit lands on a track's mainline. A finding becomes a guard only for a defect class seen twice or a structural class; never turn a finding into a rule by default.

### Reviews

One cold review of the architecture checkpoint (W0.1); one combined review of meaning and structure per mechanism track, which also approves the rows it closes; one cold interpretation review before code for a row that needs a new BPMN or CIB interpretation. A correction gets at most one audit; the verdict goes into the correction commit's message. Cold reviewers are fresh agents on the root's model, read-only, briefed with the target and not the implementer's conclusion; implementers never review their own work.

### Delegation

The root is HIGH: it decides scope, meaning, design, bounds and acceptance, accepts kernel shape edits, runs full builds, the full runner and every hosted lane, and integrates. HIGH track agents author kernel feature, admission and laws modules in Lean and their TypeScript pairs on disjoint files, and run only narrow Lean builds of their own modules and `Kernel.Run` for their own scenarios, waiting and retrying when the project lock is held. MEDIUM agents build against an exact contract a deterministic check settles (fixtures, scenarios, models, documentation sweeps); LOW agents execute fully specified procedures. MEDIUM and LOW agents are fresh agents, never forks. Agents never run a heavy lane.

### Code

Follow the proposal's [guardrails](docs/LEAN-KERNEL-REWRITE-PROPOSAL.md#guardrails-against-degradation): one dispatch owner per guarded type, no catch-all over a guarded type, no mirror enumerations, layered imports, no profile identifier outside the catalog, Lean and TypeScript executable modules paired by name. Prefer enum-based pattern matching for semantic variants; keep the IL immutable and runtime state separate and serializable; perform no I/O in the kernel. Files target 800 nonblank lines with a ceiling of 1,200. Comments carry only non-obvious contracts and invariants, added in the change that introduces the fact. Use red/green TDD.

### Pre-release evolution

Keep exactly one current representation of every wire contract; a breaking change replaces every producer, consumer, fixture, schema and test atomically. Before an approved durable baseline add no format counters, legacy readers, compatibility switches, migrations, Workflow patch branches, retained Event History fixtures or deployment fallbacks.

### Dependencies

Obtain explicit owner approval before adding, removing, upgrading, vendoring or replacing any Lake, Java, Node, pnpm, Temporal, parser, test, build or runtime dependency, for the engine and the platform alike; record version, role, license, provenance and removal cost. Routine npm updates use stable releases at least 14 days old, including transitive dependencies, with strict age enforcement, frozen lockfiles and install scripts disabled unless individually reviewed. An urgent security fix follows the [security update procedure](docs/CONTRIBUTOR-SETUP-GUIDE.md#dependency-security-procedure). Use pnpm, not npm.

### Product 2

For a material Product 2 UI/UX surface, inspect CIB Seven's analogous capability first and follow the [UI design specification](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md); never copy code, styling, assets, private data models or product terminology. Before recommending a frontend library, routing approach, state owner or component system, read the [frontend recommendation preflight](docs/ARCHITECTURE.md#frontend-recommendation-preflight). Before PostgreSQL work, follow the [database test selection](docs/PLATFORM-VERIFICATION-POLICY.md#database-test-selection).

## Reference and source discipline

Reference checkouts live under sibling `../oss` (override `BPMN_EXTERNAL_ROOT`), provisioned by `./scripts/doctor.sh`, and are research inputs, never runtime dependencies of Lean or the kernel; link them via [SOURCES](docs/SOURCES.md) and never commit absolute home paths, usernames, hostnames or credentials. Inspect the pinned checkout before relying on memory or web search. Project-authored code and documentation are [MIT](LICENSE); never copy external material without verifying compatibility and recording it in SOURCES. The OMG BPMN corpus stays external; read it through the [reading workflow](docs/reference/bpmn-2.0.2/README.md#reading-workflow). Before opening a PDF, name the specific gap in the text or extracted figures and the page or clause needed. Do not bypass the search exclusions for routine reading.

## Verification

Locally: the Lean build of touched modules, the kernel runner, TypeScript type checks and unit tests, and the fast guard suite (`node --test scripts/*.test.ts`). No Docker, Temporal server, PostgreSQL, browser, CIB oracle or other long-running lane runs locally during the rewrite; they run in hosted CI on the pushed branch, once per milestone or track. A hosted failure is reproduced locally only by its narrowest command. Always run `git diff --check`.

**Never invoke `lake` or `lean` directly; use [the Lean wrapper](scripts/lake.sh)** (`build`, `test`, `run`, `exe`, `env lean`). It owns build parallelism, holds one fail-closed project lock shared by every checkout of this repository, and refuses a full-library build unless `LEAN_FULL_GATE=<gate>` names its gate. The [memory brake](scripts/lean-memory-brake.sh) exits `70` on a resource-ceiling breach; never raise it. Heavy lanes (full Lean, Docker, Temporal server, the complete pipeline, `verify.sh`) run one at a time across every checkout of this project, from the root only.

In a managed sandbox, request host port-binding authorization before the first attempt to run `./scripts/verify.sh`, `./scripts/pnpm.sh run test:infrastructure`, `./scripts/pnpm.sh run test:temporal`, `./scripts/pnpm.sh run test:pipeline` or `./scripts/pnpm.sh run test:timer-time-skipping`; never probe inside the sandbox first. A loopback `EPERM` is a sandbox denial, not a port collision or test failure. Every helper process you start must terminate itself (bounded by `timeout`, a deadline or a fixed iteration count); capture each `$!` right after its own `&`.

## Git and delivery

- Preserve unrelated user changes and avoid destructive Git operations.
- Commit coherent, verified changes autonomously, using Conventional Commits (`type(scope): subject`, lowercase type, imperative subject, a concise body when rationale would otherwise be lost).
- Push feature branches so hosted CI runs. `main` moves only by fast-forward to an exact SHA whose hosted checks, including `verify-complete`, are green, through a pull request and never through an administrator bypass; never push `main` or tags without an explicit current request.
- Create, push or move tags only on explicit owner request, with `node scripts/project-tags.ts`: annotated `phase/<kebab-case>` tags for completion points and `vMAJOR.MINOR.PATCH[-prerelease]` tags for qualified distributions; never force or move a published tag.
- Keep [AGENTS.md](AGENTS.md) a symlink to this file.
