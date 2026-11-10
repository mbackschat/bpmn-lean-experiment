# CLAUDE.md / AGENTS.md

Keep [AGENTS.md](AGENTS.md) a symlink to this file. The [kernel architecture](docs/kernel/ARCHITECTURE-SPEC.md) owns design, guardrails and done criteria; [PLAN](docs/PLAN.md) owns delivery; [engineering policy](docs/kernel/ENGINEERING-POLICY.md) owns procedures. This file and the kernel architecture win over conflicting documents.

## Start every session

1. Read [PLAN's exact resume point](docs/PLAN.md#exact-resume-point).
2. Read the [kernel architecture](docs/kernel/ARCHITECTURE-SPEC.md) sections the task touches and any coverage row by stable ID in the [delivery target](docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list).
3. Inspect `git status --short --branch` and `git log -5 --oneline`; preserve unrelated changes.

## Mission

Build two MIT products: a Temporal-hosted BPMN 2.0.2 engine bounded in breadth and depth by CIB Seven `2.2.0`, and a BPM platform (Product 2) on top. [Practical CIB7 Coverage](docs/PRACTICAL-CIB7-COVERAGE-TARGET.md) is the target; variants absent from CIB7 are out of scope. BPMN is the semantic authority; classify CIB differences, never imitate them. The A12 Workflows replacement is a separate A12-owned EUPL-1.2 product, out of scope.

## Rule 1: no routine GitHub-hosted macOS

Never add routine macOS CI; use Ubuntu. Before changing runners, read the [hosted-lane policy](docs/kernel/ENGINEERING-POLICY.md#hosted-lanes-and-budgets).

## Rule 2: declare and check every bulk change

Before any script writes repository files, any repeated mechanical pass, or any change touching more than 20 files, follow the [bulk-change procedure](docs/kernel/ENGINEERING-POLICY.md#bulk-changes): declare scope and effect limits, stop on excess, and check the diff before building on it. Repository generators whose complete output a guard verifies are exempt.

## Rule 3: no one-off scripts or tests in the repository

Task-only scripts and tests belong in the session scratchpad. Retain a repository script only while a gate, package script, workflow or maintained procedure runs it; retain a test only while it protects a standing contract. Delete its scripts, tests and fixtures when that contract ends.

## Authority model

1. BPMN 2.0.2 and its normative machine-readable artifacts govern syntax, metamodel and Process Execution Conformance.
2. An immutable semantic profile governs compatibility for one target: selected CIB relation options and admitted fields, as data.
3. Lean defines that profile's formal operational meaning.
4. The pinned complete CIB Seven engine is its executable compatibility oracle.
5. TypeScript independently transcribes Lean, with no CIB Seven or Temporal dependency.
6. Temporal supplies durability and hidden orchestration, never BPMN meaning.

Classify disagreements in the [CIB–BPMN relation register](docs/CIB-BPMN-RELATION-REGISTER.md) against standard, profile, configuration, observation boundary and evidence; never by majority. Commit each entry with the profile behavior it governs.

## Non-negotiable boundaries

- Dependencies flow from BPMN kernel through selected CIB overlay to platform; lower layers never import or assume higher layers. The platform uses only the published engine contract and never constructs occurrence identities.
- Keep BPMN requirement, CIB profile and platform milestone coverage denominators separate.
- Keep product bean names, façade APIs, data shapes, deployment assumptions and license-bound source out of the kernel, Lean and IL. Never transplant CIB PVM types, persistence entities, behavior classes or algorithms.
- Never silently choose an oracle release, feature meaning, expression subset, observation boundary, scheduling rule, listener scope, history contract or external-effect contract.
- Execute project-owned definition data; generated TypeScript never owns a BPMN model. Confine `bpmn-moddle` and raw moddle objects to `@bpmn-lean/bpmn-source`, except the [Product 2 definition projection](docs/ARCHITECTURE.md#user-interface). Lean, kernel and Temporal Workflow code consume project-owned serializable contracts.
- Parser warnings block admission until a profile rule proves them safe. Preserve exact bytes and normalized evidence even on compilation rejection.
- Temporal tasks, Activity attempts, retries, Run IDs and Event History are never BPMN semantic facts.
- No JVM dependency in the TypeScript/Temporal runtime, build or local test loop. CIB remains external evidence; its local compile, experiments and single-scenario probes run one at a time under a timeout, its suites hosted.
- Separate import/admission, normalization, execution, public observation and host persistence. Keep neutral scenarios physically separate from retained answers; never give answers to target runners.
- Keep the pinned reference baseline pristine; reference modifications need an explicit experimental branch.
- A12 source stays outside dependency and distribution boundaries: external research/evidence only, recorded in [SOURCES](docs/SOURCES.md). Never link, vendor, copy or present it as MIT. On a potential or confirmed violation, stop, preserve provenance without redistributing, and obtain owner resolution.
- Finite witnesses are not semantic authority; never broaden BPMN meaning beyond its reviewed interpretation.

## Semantic invariants

Before changing semantics, contracts, scenarios or observations, read and preserve the [semantic invariants](docs/kernel/ENGINEERING-POLICY.md#semantic-invariants).

### Forward-compatible restrictions

A track's admission restriction is never the general meaning of a construct. The IL carries every row's full shape; refuse unadmitted fields with stable codes instead of omitting them, so later admission never reinterprets accepted models.

## Working method

### Root cause before fixes

Name the failing boundary and broken invariant, separate evidence from hypothesis, reproduce the smallest separating witness, fix the mechanism and verify the class. Never get green by disabling compiler features, validation, assertions or tests, reducing coverage, raising bounds, increasing retries/deadlines or substituting dependencies. Workarounds require a report and explicit owner approval. Use red/green TDD; for semantic changes follow the [semantic workflow](docs/kernel/ENGINEERING-POLICY.md#redgreen-semantic-workflow).

### SDK defects

Never initiate Temporal SDK repair, private builds, patch qualification or fix investigations. Record defects in the [ledger](docs/TEMPORAL-DEFECTS-LEDGER.md) and continue; only explicit owner direction reopens SDK work.

### Delivery

Follow [mechanism-track order](docs/PLAN.md#mechanism-tracks-then-rows). Report missed budgets immediately with boundary reached and next decision; never renew silently. Decide routine matters yourself. Replace case-by-case fixes with a shared mechanism. Update PLAN and the kernel status map only at milestone/track closure or a stop. No work-in-progress or park commits on track mainlines. Add guards only for a defect class seen twice or a structural class.

### Reviews

Before review or a new BPMN/CIB interpretation, follow the [review gates](docs/kernel/ARCHITECTURE-SPEC.md#review) and [procedure](docs/kernel/ENGINEERING-POLICY.md#reviews). Never review your own implementation.

### Delegation

Use the maintainer's [model tiers](https://github.com/mbackschat/coding-setup/blob/main/CLAUDE.md#model-tier-mappings); absent mappings, HIGH is most capable, MEDIUM faster, LOW fastest. The root is HIGH. Before delegating, read [responsibilities and briefing rules](docs/kernel/ENGINEERING-POLICY.md#commits-and-delegation). Agents never run heavy lanes.

### Code

Before coding, follow the [kernel guardrails](docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation) and [code-style rules](docs/kernel/ENGINEERING-POLICY.md#code-style). Prefer enum pattern matching for semantic variants. Keep IL immutable, runtime state separate and serializable, kernel I/O-free. Target 800 nonblank lines per file; ceiling 1,200.

### Pre-release evolution

Keep one current wire representation; replace producers, consumers, fixtures, schemas and tests atomically. Before an approved durable baseline, add no format counters, legacy readers, compatibility switches, migrations, Workflow patch branches, retained Event History fixtures or deployment fallbacks.

### Dependencies

Obtain explicit owner approval before adding, removing, upgrading, vendoring or replacing any engine/platform dependency, including Lake, Java, Node, pnpm, Temporal, parser, test, build and runtime dependencies. Record version, role, license, provenance and removal cost. Use pnpm, not npm. Before dependency work, read the [update policy](docs/kernel/ENGINEERING-POLICY.md#dependencies).

### Product 2

Before material UI/UX work, inspect CIB Seven's analogous capability and follow the [UI specification](docs/BPM-PLATFORM-UI-DESIGN-SPEC.md); never copy code, styling, assets, private data models or terminology. Before frontend recommendations, read the [preflight](docs/ARCHITECTURE.md#frontend-recommendation-preflight); before PostgreSQL work, read [database test selection](docs/kernel/ENGINEERING-POLICY.md#product-2).

## Reference and source discipline

Before external-source research, read the [source procedure](docs/kernel/ENGINEERING-POLICY.md#reference-and-source-discipline). Inspect pinned checkouts before memory or web search. Never copy external material without license verification and a [SOURCES](docs/SOURCES.md) record; never commit absolute home paths, usernames, hostnames or credentials. Keep the OMG corpus external; before opening a PDF, name the text/figure gap and needed page or clause. Respect search exclusions.

## Verification

Before running checks, read the [local-loop policy](docs/kernel/ENGINEERING-POLICY.md#local-loop). Local work is limited to touched Lean modules, kernel runner, TypeScript type checks/unit tests and fast guards (`node --test scripts/*.test.ts`). During the rewrite, Docker, Temporal server, PostgreSQL, browser, CIB suites and other long-running lanes run hosted once per milestone/track; reproduce hosted failures locally only with the narrowest command. Always run `git diff --check`.

Never invoke `lake` or `lean` directly: use [scripts/lake.sh](scripts/lake.sh). Never raise the memory brake. Heavy lanes run one at a time across all checkouts, from the root only. Before any port-binding gate in a managed sandbox, obtain host port-binding authorization under the local-loop policy; never probe first. Bound every helper process's lifetime and capture each `$!` immediately after its own `&`.

## Git and delivery

- Preserve unrelated changes; avoid destructive Git. Stage only named paths in a shared tree.
- Commit verified changes autonomously with Conventional Commits, a body for non-obvious rationale, and the [commit boundaries](docs/kernel/ENGINEERING-POLICY.md#commits-and-delegation).
- Push feature branches for hosted CI. Move `main` only by fast-forward through a PR to an exact SHA with all checks, including `verify-complete`, green; never administrator bypass. Never push `main` or tags without an explicit current request.
- Create, push or move tags only on explicit owner request; follow the [tag procedure](docs/kernel/ENGINEERING-POLICY.md#hosted-lanes-and-budgets). Never force or move a published tag.
- Before editing docs, follow the [documentation rules](docs/kernel/ENGINEERING-POLICY.md#documentation).
