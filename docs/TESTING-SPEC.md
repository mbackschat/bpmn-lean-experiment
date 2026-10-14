# Testing specification

## Status

Implemented verification entry point. This document owns cadence, gate selection and acceptance boundaries. Detailed contracts have one task-specific owner; implementation status belongs in the detail maps routed by [`implementation-status-router`](IMPLEMENTATION-MAP.md), and current work belongs in [PLAN.md](PLAN.md).

## Select the task owner

Read this entry point, then only the complete owners required by the changed boundary. Follow their applicable capsule/source links; do not load every testing policy for ordinary work.

| Task | Required focused owner |
|---|---|
| Delegate work, design/review Lean proofs, prepare a review, record approval or close a capsule | [Review and delegation policy](REVIEW-POLICY.md) |
| Change schemas, Lean/core behavior, CIB probes, differential comparison or claim classification | [Semantic verification policy](SEMANTIC-VERIFICATION-POLICY.md) |
| Change the CIB observer or an observation field/disposition | [CIB observation fidelity policy](CIB-OBSERVATION-POLICY.md) |
| Change Temporal hosting, recovery, refinement or replay | [Temporal verification policy](TEMPORAL-VERIFICATION-POLICY.md) and its linked evidence map |
| Change Product 2 persistence, browser behavior or release/distribution acceptance | [Platform verification policy](PLATFORM-VERIFICATION-POLICY.md) |
| Change gates, harnesses, CI/resources, source/document guards, or run a command needing durable capture | [Verification infrastructure policy](VERIFICATION-INFRASTRUCTURE-POLICY.md) |

Keep each obligation in its owner and link to it. Add a gate-selection row here only when contributors need a distinct entry point; do not add feature inventories, incident narration, command diaries or proof progress. Replace current work and decisive verification in [PLAN.md](PLAN.md#exact-resume-point). Preserve material rationale and required target-bound review receipts in their established owners under [documentation discipline](DOC-DISCIPLINE.md#active-task-continuity).

## Default verification

Run from the repository root:

```sh
./scripts/verify.sh
git status --short
git diff --check
```

The default gate covers the MIT engine: prerequisite inventory; contracts and publication schemas before package builds; strict harness types and source/document guards; normative XML; Lean library, checked-source experiment and result emission; source importer and TypeScript core; pinned CIB oracle; infrastructure, differential and Temporal refinement/history/replay; and the complete prepared pipeline. Publication-schema fixtures must remain runtime-free and pass the loader-isolation guard. Private Lean/core parity cannot stand in for registered CIB or Temporal evidence.

Product 2 and optional source/adoption lanes are separately selected below. Missing inputs fail the selected lane rather than silently reducing coverage. [Contributor setup](CONTRIBUTOR-SETUP-GUIDE.md) owns provisioning; [infrastructure policy](VERIFICATION-INFRASTRUCTURE-POLICY.md#prerequisites-and-structural-guards) owns reproducibility, structural guards and scope exclusions.

In a managed sandbox, request host port-binding authorization before the first attempt to run `./scripts/verify.sh`, `./scripts/pnpm.sh run test:infrastructure`, `./scripts/pnpm.sh run test:temporal`, `./scripts/pnpm.sh run test:pipeline`, or `./scripts/pnpm.sh run test:timer-time-skipping`. `Operation not permitted`/`EPERM` on a loopback listener is a sandbox denial, not a semantic failure or port collision. Use [durable command capture](VERIFICATION-INFRASTRUCTURE-POLICY.md#long-running-javascript-and-typescript-commands) when output can outlive one tool yield or be truncated; resume the same process and independently assert its receipt before claiming green.

## Three-level verification policy

During development, run the smallest executable oracle separating the changed mechanism, with only its necessary build. Rerun after material edits while red or stabilizing; broaden when green or when failure reveals a wider boundary.

| Decision boundary | Required verification |
|---|---|
| Before a regular commit | Reproduce the intended red and pass the focused oracle. Local Lean commits require focused module/consumer builds and regression tests; the full library is not a commit prerequisite. Other affected package gates retain their current requirements. |
| Before semantic-batch acceptance | Complete the affected package gates, including `LEAN_FULL_GATE=<batch-id> ./scripts/lake.sh test` for a Lean-bearing batch, and required independent review against the exact candidate. Neither a local commit nor review alone establishes acceptance. |
| Before push | Commit the intended changes, require a clean tree, then run `./scripts/pnpm.sh run test:pre-push` against that exact `HEAD`. A pre-commit run does not substitute: tests may inspect committed ancestry or tracked state. |
| Before milestone or tag | Complete repository verification and every applicable release-acceptance gate, regardless of earlier focused passes. |

For a Lean-bearing batch, name its coherent outcome and narrow changed modules, proof consumers and separating regressions in PLAN before work. Include relevant isolated Docker correctness/resource checks at the focused boundary. Local commits may preserve that checked work while complete qualification remains explicitly open. Stabilize related repairs before one full-library qualification; do not launch it merely because another local commit, helper or review handoff occurred. Independent review and full qualification may run concurrently on the same frozen target, within the single-Lean-process limit. Both must pass before acceptance or dependent implementation crosses the checkpoint. Reuse exact-input evidence; rerun a failed or affected gate when source changes invalidate it. Pre-push and release gates remain unchanged.

Pre-push runs `test:dependency-security` unconditionally, because advisory data changes independently of source; high-severity runtime/development advisories and registry failures stop qualification. Product 1 uses the same diff classifier as CI. Product 2 derives every path-filtered workflow's exact command and requires equality with the independent `test:pre-push:*` inventory; missing/malformed filters, duplicate/absent bindings and inventory mismatches fail closed. Every selected boundary runs its complete clean-HEAD local equivalent, including the disposable PostgreSQL command when no database URL is supplied. No blocking hosted behavior may lack a local counterpart.

Feedback latency is a maintained engineering invariant. A composed gate builds each dependency graph at most once and reuses its artifacts for explicit type, unit and browser phases. Child wrappers/hooks must not rebuild an already supplied graph. Distinct platform, showcase and browser boundaries remain path-selected; GitHub runs those jobs in parallel when several apply. Repeat work only for distinct evidence such as portability or responsive geometry. Correct a budget breach through selection, deduplication, independent jobs or the mechanism; never raise a timeout or remove evidence merely to obtain green. [Infrastructure policy](VERIFICATION-INFRASTRUCTURE-POLICY.md#feedback-budgets) owns measurement versus hang limits.

Complete infrastructure runtime uses test-file concurrency two; Temporal testkit uses four, preserving each file's internal ordering. Increasing either requires new CPU, memory, isolation and wall-time measurements. `what-binds` classifies named, import-bound and scanning guards for planning; its scan tier is lexical and over-reports, and it follows only relative imports to depth two, so it is not a complete dependency set: infrastructure guard selection remains unadopted. Keep the complete infrastructure gate until retained input snapshots and a conservative dependency model have been checked against complete-suite failures; unknown dependencies must select all guards.

[Database selection](PLATFORM-VERIFICATION-POLICY.md#database-test-selection) keeps SQLite sequential and concurrency/shared-replica evidence in opt-in real PostgreSQL. Run affected database witnesses when changed, the complete shared-mode gate at integration and clean path-selected pre-push before a relevant push; ordinary packages do not require a PostgreSQL server. [Browser selection](PLATFORM-VERIFICATION-POLICY.md#browser-acceptance) repeats only layout-sensitive tests at both widths.

Owner-authorized milestone push cadence may accumulate unpushed commits within one governed path-selected boundary. At that boundary, after selected pre-push gates pass, propose or perform the push according to current authorization; propose earlier when a practical oracle exists only in hosted/database execution. No policy here independently authorizes a push.

GitHub supplies clean-checkout portability, not the first oracle for ordinary defects. Reproduce a locally reproducible failure, test its mechanism against a second instance, correct it and retain a class guard before pushing again. Do not rerun unchanged failures seeking a favorable result. Reuse valid unchanged evidence; distinguish running, failed, interrupted and missing results from green.

## Focused gate matrix

Commands below select the affected boundary; [cadence](#three-level-verification-policy) determines when to broaden. Domain owners above define exact acceptance and negative witnesses. Product 2 release gates remain outside `verify.sh` and Product 1 feedback loops.

| Change | Required focused gate |
|---|---|
| Semantic profile, scenario, evidence, or JSON Schema | `./scripts/pnpm.sh run test:contracts` |
| Lean semantic definition or law | Local: `./scripts/lake.sh build <module target>...` for changed owners and the direct importers of every module whose exported statements change, plus the separating regression. Batch acceptance: `LEAN_FULL_GATE=<batch-id> ./scripts/lake.sh test`. PLAN's effort budget names the Lean batch, whose ID is that label, and its full-build allowance: one at batch close plus at most one after a correction. |
| TypeScript semantic core | `./scripts/pnpm.sh run test:semantic-core` |
| Lean plus TypeScript semantic loop | `./scripts/pnpm.sh run test:semantic` |
| TypeScript semantic contract or type abstraction | `./scripts/pnpm.sh run check:semantic-types` plus its owning runtime/package gate. |
| BPMN source/import/compiler/CMOF facts | `./scripts/pnpm.sh run test:bpmn-source` |
| Optional exact A12 source-adoption facts | `./scripts/test-a12-adoption.sh` after `./scripts/setup-external-sources.sh adoption` |
| Optional pinned MIWG admission observation | `./scripts/pnpm.sh run test:miwg` |
| CIB oracle, projection, or cleanup | `./scripts/test-cibseven-oracle.sh` |
| Pure differential comparator | `./scripts/pnpm.sh run test:differential` |
| Temporal Workflow/runner/refinement/replay | `./scripts/pnpm.sh run test:temporal` |
| Optional timer time-skipping calibration | `./scripts/pnpm.sh run test:timer-time-skipping` |
| Pipeline orchestration or any cross-target contract | `./scripts/pnpm.sh run test:pipeline` |
| Executable model corpus identity, ranking, execution or catalog claim | `gtimeout 60s node --test --test-concurrency=1 model-corpus/test/executable-model-corpus.test.ts`; before execution/readiness claims, `./scripts/doctor.sh research` and `./scripts/pnpm.sh run test:model-corpus`; catalog eligibility also needs its production Chromium journey. |
| Directly executed TypeScript harness or utility | `./scripts/pnpm.sh run check:harness-types` plus its owning runtime/package gate. |
| Source ownership, module boundary, or structural refactor | `./scripts/pnpm.sh run check:source-hygiene` plus its owning runtime/package gate. |
| Product boundary or platform package dependency direction | `node --test scripts/platform-product-boundary.test.ts` plus its owning package gate. |
| Evaluation Dockerfile, Compose topology, project runtime entry point, or evaluation workflow | `./scripts/pnpm.sh run test:evaluation-distribution:structure`; `./scripts/pnpm.sh run evaluation:start`; public-origin smoke before release/tag. |
| Browser walkthrough/capture catalog and screenshots | `gtimeout 60s node --test showcase/platform-browser-walkthrough/test/*.test.ts scripts/walkthrough-screenshot-refresh.platform-test.ts` and `gtimeout 120s ./node_modules/.bin/tsc -p showcase/platform-browser-walkthrough/tsconfig.json --noEmit`; explicit `./scripts/pnpm.sh run walkthrough:screenshots:refresh` after material UI change or before RC. |
| M1 engine gateway or platform foundation storage | `./scripts/pnpm.sh run test:platform-foundation` |
| Product 2 PostgreSQL runtime or checksum-bound migration mechanics | `./scripts/pnpm.sh run test:platform-foundation`; `./scripts/pnpm.sh run test:platform-postgresql:runtime:local` |
| Product 2 PostgreSQL business repository slice | Owning ordinary SQLite package gate plus its explicit `test:postgresql`; follow [database selection](PLATFORM-VERIFICATION-POLICY.md#database-test-selection). |
| Complete Product 2 PostgreSQL shared-mode boundary | `./scripts/pnpm.sh run test:platform-postgresql:local`; `./scripts/pnpm.sh run test:pre-push:platform-postgresql`; integration first, then clean-HEAD pre-push with `BPMN_TEST_POSTGRES_URL`. |
| M1 public definition contract, deployment/versioning module, HTTP route, server composition, production licence policy, or platform harness | `./scripts/pnpm.sh run test:platform-m1` |
| M1 deployment, versioning, exact-source rendering, attribution, exact-version start, real Temporal hosting, or rejection acceptance | `./scripts/pnpm.sh run test:showcase:m1` |
| M2 exact-version Timer Start scheduling or Message Start publication and its owned acceptance boundary | `./scripts/pnpm.sh run test:showcase:m2`; `test:showcase:m2-message-start-ingress` |
| M2 Process-instance search public contract, durable index, or producer recording checkpoint | `./scripts/pnpm.sh run test:platform-process-search-checkpoint` |
| M2 Process-instance search HTTP, UI, three-producer live evidence, restart/paging, or browser acceptance | `./scripts/pnpm.sh run test:showcase:m2-process-instance-search` |
| M3 Work contract, identity, audit, persistence, HTTP, or web composition | `./scripts/pnpm.sh run test:platform-work-checkpoint` |
| M3 cross-instance inbox, claim, typed completion, response-loss recovery, audit, live Temporal, replay, or browser acceptance | `./scripts/pnpm.sh run test:showcase:m3-human-work` |
| Complete M3 Product 2 release acceptance | `./scripts/pnpm.sh run test:release:m3` |
| M4 Product 2 incident contracts and its owned acceptance boundary | `./scripts/pnpm.sh run test:platform-operations-checkpoint` |
| M4 current incident discovery and its owned acceptance boundary | `./scripts/pnpm.sh run test:showcase:m4-incident-operations` |
| Complete M4 Product 2 release acceptance | `./scripts/pnpm.sh run test:release:m4` |
| MUE Preview Alpha exact start and its owned acceptance boundary | `./scripts/pnpm.sh run test:showcase:mue-preview-alpha` |
| Complete MUE Preview Alpha release acceptance | `./scripts/pnpm.sh run test:release:mue-preview-alpha` |
| Complete MUE Preview Beta release acceptance | `./scripts/pnpm.sh run test:release:mue-preview-beta` |
| M5 E1 public execution contract and its owned acceptance boundary | `./scripts/pnpm.sh run test:platform-operations-checkpoint` |
| E1/E2 retained publication selection, paging and replay | `./scripts/pnpm.sh run test:temporal` |
| Workflow-chain capacity, continuation, deployment and replay | `./scripts/pnpm.sh run test:temporal` |
| M5 E1 History, multi-position Diagram, canonical export, stale-current suppression, focus, or responsive geometry | `./scripts/pnpm.sh run test:ui-quality` |
| Complete path-selected pre-push boundary | `./scripts/pnpm.sh run test:pre-push` |
| Product 1 or shared-repository pre-push boundary | `./scripts/pnpm.sh run test:pre-push:verify` |
| Product 2 platform pre-push boundary | `./scripts/pnpm.sh run test:pre-push:platform` |
| Product 2 PostgreSQL pre-push boundary | `./scripts/pnpm.sh run test:pre-push:platform-postgresql` with `BPMN_TEST_POSTGRES_URL`. |
| Product 2 showcase-compatibility pre-push boundary | `./scripts/pnpm.sh run test:pre-push:showcase` |
| Product 2 UI-facing pre-push boundary | `./scripts/pnpm.sh run test:pre-push:ui` |
| Product 2 BPMN diagram presentation contract, generated sidecar, durable reuse, public route, rendering, task highlight, or modeller download | `./scripts/pnpm.sh run test:platform-m1` |
| Product 2 information architecture, Operations and Work interaction states, visual foundation, responsive geometry, focus, or reduced motion | `./scripts/pnpm.sh run test:ui-quality`; `./scripts/pnpm.sh run test:ui-quality:visual` |
| Scripts, documentation fragments, and pre-release architecture guards | `./scripts/pnpm.sh run test:infrastructure` |
| Provisional representation experiment | `./scripts/lake.sh exe checkSemanticRepresentationSpike` |
| Checked-source relation experiment | `./scripts/lake.sh exe checkCheckedSourceRelationExperiment` |

## Red/green semantic workflow

For every new semantic mechanism:

0. enumerate the bounds that already exist with `node scripts/what-binds.ts <path>...` for every path the change will add or grow. It reports the executable guards whose assertions constrain those paths, the registries carrying a same-change obligation, and each owner's remaining nonblank headroom. Guards here constrain artifact shape by tree as often as by file, so a plan derived from recall can name a change site whose oracle it never read; an owner already at the review target requires resolving cohesive ownership before growth. [Commit boundaries](REVIEW-POLICY.md#commit-boundaries) determine whether that correction belongs with the selected outcome or is an independently useful architectural repair; headroom alone does not create a separate commit.
1. identify the normative clause, reviewed profile choice, or explicit competing interpretation;
2. add the smallest positive or negative witness that separates the intended account from a realistic wrong one;
3. record the Temporal hosting/refinement preflight before production Lean or semantic-core implementation;
4. confirm the focused gate fails because the mechanism is absent or wrong;
5. implement the semantic root, not a fixture-specific branch;
6. make the focused gate green;
7. add or retain a mutation that demonstrates the observation/comparison boundary notices the claimed distinction;
8. run the complete applicable gate;
9. update the capsule, implementation map, plan, and this procedure only where each owns the changed fact.

A pile of feature/profile/format switches is evidence of an unsound boundary. During pre-release, replace the current contract atomically rather than adding compatibility branches.

The preflight must identify each semantic stimulus, wait, timer, subscription, effect, cancellation, and lifecycle boundary introduced by the mechanism; map it to a durable Temporal transport or host composition; state command ordering, handler-interleaving, duplicate-delivery, idempotency, retry, closure, projection, and replay risks; and name the smallest live-history witness plus the nearest adapter counterexample. The review passes only when every required public semantic outcome has a plausible host realization. It does not count as Temporal evidence until the focused live gate exercises the mapping and replays its history.

An admission, lowering, runtime-representation, or public-observation capsule must additionally state the exact source-to-result claim it can invalidate and retain the smallest theorem, typed check, or executable discriminator that detects the realistic wrong account. For every newly reachable structure, the capsule must executable-check its longest internal closure against the configured `semanticProcessClosureLimit`, including one over-limit negative witness; show that each newly reachable multiple-enabled state is an approved independent/order-invariant set, receives an explicit semantic choice, or is rejected consistently by Lean and TypeScript; and show that each stable `running` state is terminally complete or exposes an explicit semantic resumption surface. The resumability check is over the whole stable state, so a half-ready join beside a live wait is valid, while tokens without any possible semantic ingress are not mistaken for progress. A second capsule needing the same preservation proposition reopens the general theorem rather than duplicating an increasingly universal local proof.

Semantic program admission and host capability are separate gates. Before Workflow start, the adapter must deterministically accept every reachable wait-set shape or return a typed adapter admission failure. A capsule that makes concurrent waits or a mixed timer/effect/subscription set reachable must either prove the current single-host-wait restriction remains preserved or implement and evidence the required deterministic scheduler. A non-retryable throw from Workflow execution is not an admission result and does not satisfy this gate.

For Lean work, apply [Lean proof design and review](REVIEW-POLICY.md#lean-proof-design-and-review). [Review policy](REVIEW-POLICY.md#independent-cold-review-gate) owns materiality, stage timing, reviewer isolation, prompt/packet and durable approval receipts; use it before crossing a governed checkpoint.

## Profile release-readiness gate

This is the release gate for a declared semantic or compatibility profile, not a substitute for per-capsule closure. A profile is release-ready only when all six blocks below are satisfied or every remaining item is visibly classified as unsupported.

### Profile readiness

- Pin the exact normative or CIB release, source revision, edition, environment, and configuration.
- State supported and unsupported BPMN features, static and runtime interpretations, observation and nondeterminism policies, known deviations, and configuration dependencies.

### Lean readiness

- Give every supported semantic feature an explicit transition meaning and document all proof assumptions.
- Machine-check the required runtime invariants and relate the executable interpreter to its declarative semantics.
- Define the relevant stable-state, divergence, stuck/deadlock, and enabled-input concepts at the exact claimed boundary.

### Semantic-core readiness

- Keep the core free of Temporal and CIB dependencies and deterministic under explicit semantic choices.
- Preserve the complete command-outcome distinctions and expose the profile-defined observations and enabled interactions.
- Establish the declared Lean, CIB, and generated-bound correspondence without upgrading finite evidence into a universal claim.

### Temporal readiness

- Establish adapter refinement for the declared public behavior, duplicate-delivery safety, identity retention, and covered timer, Message, retry, cancellation, and continuation paths.
- Replay histories produced by the disposable pre-release gate; after an immutable baseline is approved, replay the retained histories with their approved provenance and version markers.
- Keep raw Temporal behavior out of semantic observations unless the profile explicitly declares it.

### Differential readiness

- Pass every maintained scenario or record an approved classified deviation; leave no mismatch unclassified and retain a minimized regression for each fix.
- State causal-trace dependency policy, calibrate any CIB instrumentation for noninterference, and verify oracle isolation and cleanup.

### Reporting readiness

- Identify every component, profile, environment, and corpus version and report proof, differential, refinement, and replay status separately.
- Make unsupported features and limitations prominent and keep the published claim no broader than the actual profile and evidence.
