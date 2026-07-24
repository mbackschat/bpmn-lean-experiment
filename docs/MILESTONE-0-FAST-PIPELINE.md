# Milestone 0: fast full-pipeline walking skeleton

**Status:** Complete

This document owns the durable design, work breakdown, acceptance criteria, and resume protocol for the first end-to-end milestone. Immediate sequencing and the exact resume point belong in [PLAN.md](PLAN.md); implemented facts belong in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).

## Objective

Establish the complete research-to-differential pipeline while the supported BPMN surface is still deliberately tiny:

```text
OMG research + CIB probe
          ↓
profile decision + neutral scenario
          ↓
executable Lean semantics
          ↓
pure TypeScript semantic core
          ↓
Temporal adapter
          ↓
differential + refinement + replay checks
          ↺
classified disagreement
```

The milestone is a walking skeleton rather than a throwaway prototype. Its semantic feature set is disposable if calibration disproves it, but the authority boundaries, neutral scenario protocol, canonical observation contract, runner boundary, comparison discipline, performance measurements, and verification lanes are intended to survive.

## Relation to the ultimate goal

The ultimate product imports BPMN 2.0.2 Process diagrams and satisfies OMG Process Execution Conformance while separately declaring compatibility with a versioned CIB Seven observation profile. Milestone 0 does not claim either result. It proves that the project can carry one standards-anchored semantic capsule through every intended assurance layer quickly enough for daily red/green work.

The milestone keeps three questions independent:

1. Does the interpretation have a defensible BPMN 2.0.2 basis?
2. Does the selected profile reproduce the observable behavior of pinned CIB Seven?
3. Does Temporal preserve the pure semantic core behavior under durable execution and replay?

## Locked milestone scope

The single BPMN model is:

```text
none start → user task → none end
```

Required behavior:

- ingest actual BPMN 2.0 XML with an explicitly executable private Process;
- deploy the model;
- start one Process instance;
- observe one active User Task by stable semantic identity;
- complete the User Task through an external command;
- observe Process completion;
- distinguish deployment, command, semantic, unsupported, harness, and infrastructure outcomes;
- cleanly repeat the scenario without leaked CIB or Temporal state.

Required runners:

- pinned CIB Seven `v2.2.0` black-box oracle;
- executable Lean reference interpreter;
- pure TypeScript semantic core;
- Temporal TypeScript adapter around the semantic core.

Explicit exclusions:

- variables and expressions;
- gateways;
- timers and messages;
- boundary Events and Event Sub-Processes;
- multi-instance and compensation;
- listeners and history compatibility;
- CIB extensions;
- external services;
- production deployment, scaling, and security.

These exclusions are milestone boundaries, not statements about the ultimate conformance surface.

## Shared contracts

### Scenario

A scenario supplies:

- schema version;
- scenario identity;
- draft profile identity;
- BPMN resource identity and hash;
- ordered external stimuli;
- explicit logical-time or scheduler choices when applicable;
- provenance linking the normative requirement and CIB probe;
- requested canonical observations.

The scenario must not expose CIB database identifiers, Lean constructors, TypeScript implementation objects, Temporal history event IDs, or host scheduling.

### Canonical observation

The first observation vocabulary covers:

- deployment result;
- command result;
- Process status;
- active semantic waits with multiplicity;
- enabled external stimuli;
- logical time;
- semantic model and instance identity.

Runtime-generated identifiers may be retained in runner diagnostics but are never comparison keys.

### Runner

Every target implements the same logical contract:

```ts
interface ScenarioRunner {
  run(scenario: Scenario): Promise<ScenarioResult>;
}

interface ScenarioResult {
  outcome: ScenarioOutcome;
  trace: CanonicalObservation[];
  diagnostics?: Diagnostics;
}
```

The transport is provisional JSON Lines so native Lean, Java, and Node runners can remain alive and process multiple isolated scenarios without per-case startup. Transport framing is not semantic and may change without a profile version change.

### Comparator

The comparator is pure. It receives canonical results and produces agreement or a classified disagreement. It must not query CIB, Temporal, a database, or engine-specific state and must not contain per-engine semantic patches.

Milestone 0 uses exact trace equality after projection because it contains no independent concurrency. Later capsules may introduce causal-order comparison only through an explicit profile decision.

## Fast feedback contract

Performance is an acceptance criterion from the first pipeline implementation.

| Gate | Contents | Initial budget |
|---|---|---:|
| Semantic loop | Lean, pure TypeScript semantic core, and diff | less than 2 seconds warm |
| Full-pipeline smoke | CIB, Lean, semantic core, Temporal, diff, and retained-history replay | less than 15 seconds warm |
| Cold full-pipeline smoke | Required builds and service startup plus the same smoke | less than 45 seconds |
| Extended assurance | Larger CIB, MIWG, conformance, exploration, and replay suites | measured and selective; may take minutes |

The first executable measurements may revise a budget only through a documented decision that names the limiting phase and remediation options.

Warm means toolchains are installed, dependencies and source builds are current, and reusable runner processes or services are already started. Cold means dependency caches may exist but no milestone runner or service is active.

The harness must record at least build, startup, scenario execution, observation projection, comparison, replay, and cleanup durations separately.

## Efficiency design

- Build each language only when its sources change.
- Keep compiled Lean and Java runners alive across scenario batches.
- Reuse one embedded CIB engine while isolating and cleaning every scenario.
- Reuse one Temporal test server and worker while assigning isolated Workflow identities.
- Run independent runners concurrently.
- Keep canonical comparison in memory.
- Emit compact traces by default and retain verbose target diagnostics only for failure.
- Select scenarios by semantic capsule and requirement identity.
- Cache toolchains, dependencies, and build products by exact version and source identity.
- Never trade deterministic semantics for host-level parallel speed.

## Work packages and checkpoints

Each completed package ends with updated [PLAN.md](PLAN.md), [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md), applicable verification, and a Conventional Commit.

| Package | Deliverable | Exit condition | Suggested commit |
|---|---|---|---|
| M0.0 | Durable milestone plan | Scope, budgets, contracts, dependencies, and resume protocol are reviewable | `docs: define fast full-pipeline milestone` |
| M0.1 | Neutral contract and fixture | Actual BPMN XML, draft profile identity, scenario/stimulus types, observation types, and separating Lean contract checks exist | `feat(contract): add walking-skeleton scenario protocol` |
| M0.2 | CIB calibration runner | Pinned embedded CIB deploy/start/wait/complete/cleanup probe emits canonical trace and reports timings | `test(cib): calibrate sequential user-task oracle` |
| M0.3 | Lean semantic capsule | Lean interpreter produces the calibrated trace and proves the first lifecycle invariants | `feat(lean): execute sequential user-task semantics` |
| M0.4 | Pure TypeScript semantic core | Independent semantic core matches Lean and CIB through the shared scenario without CIB or Temporal dependencies | `feat(core): implement sequential user-task semantics` |
| M0.5 | Temporal adapter | Workflow adapter hosts the semantic core, emits the same canonical trace, and replays retained history | `feat(temporal): run sequential user-task workflow` |
| M0.6 | Fast differential gate | One command runs targets concurrently, classifies an injected disagreement, reports phase timings, and meets the budgets | `test(pipeline): verify fast end-to-end differential` |

Package order protects calibration and independence. The repository should still gain the runner skeleton early: M0.1 defines it, M0.2 exercises one external runner, and every following package plugs into the same orchestrator boundary.

M0.0 through M0.6 are complete. The public `test:pipeline` gate builds the target boundaries, concurrently runs CIB Seven, Lean, the semantic core, and two isolated Temporal executions, compares canonical results, classifies a seeded disagreement, replays live and retained histories, records provenance and phase timings, proves cleanup, and enforces the budgets.

## Dependency decisions

No new dependency is added implicitly. Before the package that needs it, record and obtain approval for the exact dependency, version, role, license, and removal cost.

Known decisions still required:

| Capability | Candidate | Current constraint |
|---|---|---|
| Java runtime | Homebrew `openjdk@21` `21.0.12` | Approved; already installed at the Homebrew prefix; oracle commands must select Java 21 explicitly |
| Java build | Apache Maven Wrapper `3.2.0` running Maven `3.8.8`; Compiler Plugin `3.14.1`; Surefire Plugin `3.5.4` | Approved on 2026-07-24; Apache-2.0; isolated to the CIB runner and removable with that module |
| CIB oracle | `org.cibseven.bpm:cibseven-engine:2.2.0` | Approved on 2026-07-24; Apache-2.0; required only by the external oracle runner |
| CIB database | `com.h2database:h2:2.3.232` | Approved on 2026-07-24; MPL-2.0 or EPL-1.0; replaceable only with a recorded oracle-environment change |
| Java test harness | `junit:junit:4.13.2` | Approved on 2026-07-24; EPL-1.0; final JUnit 4 maintenance release, test-only, and independently replaceable |
| Java JSON transport | `com.fasterxml.jackson.core:jackson-databind:2.21.2` | Approved on 2026-07-24; Apache-2.0; transport-only and replaceable without changing canonical semantics |
| Node runtime | Node `24.18.0` through nvm/asdf or Homebrew `node@24` | Approved and implemented for M0.4; MIT Homebrew formula; current LTS, satisfies the inspected Temporal SDK `>=20.3.0` range, and is exercised as its current maximum CI runtime; replacing it affects TypeScript build/run scripts but no semantic contract |
| Package manager | pnpm `11.17.0` | Approved and implemented for M0.4; MIT; requires Node `>=22.13`; replacing it requires lockfile and workspace migration but no semantic change |
| TypeScript compiler | `typescript@7.0.2` | Approved M0.4 development dependency; Apache-2.0; the resolved platform graph contains only `typescript@7.0.2` and `@typescript/typescript-darwin-arm64@7.0.2`, both Apache-2.0; removable by replacing the compiler/toolchain, with no runtime semantic role |
| TypeScript test harness | Node `node:test` | Implemented with the approved Node runtime; no package dependency or additional license graph |
| BPMN ingestion | `bpmn-moddle` or a smaller standards-preserving XML front end | Dependency and preservation policy require approval |
| Temporal | `@temporalio/client@1.21.0`, `@temporalio/testing@1.21.0`, `@temporalio/worker@1.21.0`, `@temporalio/workflow@1.21.0`, and CLI `v1.8.1` through full-server `cached-download` | Approved and implemented for M0.5; direct packages and CLI are MIT, the graph audit is in [SOURCES.md](SOURCES.md), and the entire surface is removable with the private adapter package |
| Cross-language schema validation | Prefer generated or dependency-free validation until a concrete gap exists | The shared schema must not become a semantic implementation |

## Acceptance criteria

Milestone 0 is complete only when:

1. one actual BPMN XML model traverses import, CIB, Lean, semantic core, and Temporal boundaries;
2. all targets produce equal canonical traces after the declared projection;
3. an intentional semantic mutation fails with a classified disagreement;
4. retained Temporal history replays successfully;
5. repeated scenario runs prove CIB database and Temporal identity isolation;
6. semantic failures remain distinct from harness and infrastructure failures;
7. the semantic and full-pipeline feedback budgets are measured and met;
8. every result records scenario, profile, BPMN requirement, CIB revision, and implementation revision;
9. Lean and the semantic core remain free of CIB and Temporal dependencies;
10. no BPMN or CIB compatibility claim exceeds the single calibrated slice.

All ten criteria are satisfied for only the content-addressed sequential User Task capsule. The harness reads and hashes the actual XML, CIB parses and executes it, and the Lean, TypeScript, and Temporal boundaries admit the same recorded resource identity; general XML ingestion outside CIB remains absent. The first successful source-current pipeline measured 5.03 seconds warm and 6.19 seconds including its build phase, below the 15-second warm and 45-second cold budgets. This closes the walking skeleton without creating a broader BPMN or immutable CIB compatibility claim.

## Resume protocol

At the start of every session:

1. read [CLAUDE.md](../CLAUDE.md), [PLAN.md](PLAN.md), this milestone, and [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md);
2. inspect `git status --short --branch` and `git log -5 --oneline`;
3. run the current gate in [TESTING.md](TESTING.md);
4. take only the first incomplete work package and its first incomplete task;
5. preserve red/green evidence for semantic changes;
6. update implemented facts and the exact resume point before committing;
7. leave a clean working tree unless the handoff explicitly documents unfinished files and the failing command.

The exact resume point must name the current package, last verified command, next file or decision, and any blocker. It must never rely on chat history.

## Decision log

| Date | Decision | Status |
|---|---|---|
| 2026-07-23 | Establish the complete research → Lean → semantic core → Temporal → differential pipeline before expanding BPMN coverage | Approved for Milestone 0 |
| 2026-07-23 | Make fast feedback a milestone acceptance criterion with separate warm, cold, and extended lanes | Approved for Milestone 0 |
| 2026-07-23 | Use the none-start → User Task → none-end slice as the walking skeleton | Approved for Milestone 0 |
| 2026-07-23 | Use CIB Seven `v2.2.0` as the spike oracle because its core BPMN test trees match the investigated `main` revision | Approved for Milestone 0; M0.2 draft-profile trace calibrated, while immutable compatibility identity still awaits independent consumers |
| 2026-07-23 | Use provisional JSON Lines framing for persistent runner processes | Provisional until two independent runners consume it |
| 2026-07-23 | Use Java 21 for the embedded CIB oracle; Java remains test infrastructure and never enters Lean, the semantic core, or the Temporal adapter | Approved for Milestone 0; CIB Seven 2.2 supports Java 21 and publishes Java 21 Docker images |
| 2026-07-24 | Adopt the exact M0.2 Maven wrapper, build plugins, CIB engine, H2, Jackson, and JUnit coordinates recorded above | Approved; resolved runtime/test graph contains only Apache-2.0, MIT, MPL-2.0/EPL-1.0, EPL-1.0, and BSD-3-Clause licenses |
| 2026-07-24 | Keep CIB’s audit history default with a `P180D` default TTL while excluding history from the canonical M0.2 observation boundary | Implemented; the TTL satisfies CIB Seven 2.2 deployment validation and does not turn history into a comparison surface |
| 2026-07-24 | Keep PVM topology, behavior class, flow scope, optional event scope, and ordered transitions in runner diagnostics only | Implemented for the sequential model; public service observations remain the compatibility evidence |
| 2026-07-24 | Transfer only the external-command/internal-closure and definition/runtime distinctions from the representation spike into the M0.3 Lean capsule | Implemented; the capsule uses its own compressed sequential control state and does not adopt the experiment's provisional general IR or token model |
| 2026-07-24 | Adopt Node 24.18.0, pnpm 11.17.0, TypeScript 7.0.2, and built-in `node:test` for M0.4 | Approved and implemented; nvm/asdf pins and a Homebrew fallback coexist, the compiler graph is Apache-2.0, and the semantic core has no runtime package dependency |
| 2026-07-24 | Name the independent TypeScript component “semantic core” and its public transition `applyStimulus` | Approved; “semantic transition system” is the formal description, while the preserved handoff’s “reducer” term remains a historical alias |
| 2026-07-24 | Interpret/evaluate versioned executable BPMN IR data in TypeScript rather than generate authoritative TypeScript from each BPMN model | Approved as the production architecture; generated source may be a derived diagnostic or optimization only after equivalence and replay evidence |
| 2026-07-24 | Adopt the exact Temporal SDK `1.21.0` package set and CLI `v1.8.1` full local server for M0.5 | Approved and implemented; one Workflow loop owns semantic mutation, Signal is only the bounded runner transport, Query is diagnostic, and live plus retained histories replay |
| 2026-07-24 | Deny optional `@swc/core` and protobufjs install scripts and isolate Temporal’s TypeScript 7 declaration incompatibility with adapter-only `skipLibCheck` | Implemented; the native SWC binding works without its fallback script, project source remains strict, and the semantic core retains full library checking |
| 2026-07-24 | Keep the differential comparator pure and classify the first exact-result divergence without target-specific repairs or majority voting | Implemented; the CIB result is the declared reference only for the draft compatibility profile, and a seeded `trace[2].status` mutation is rejected |
| 2026-07-24 | Reuse Lean’s built-in JSON support and Surefire’s approved CIB classpath instead of adding pipeline dependencies | Implemented; the Lean boundary is a capsule-specific one-way emitter and the CIB bridge remains test scope |
