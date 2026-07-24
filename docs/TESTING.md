# Testing and evidence

This document owns maintained gates, test procedure, evidence separation, mutation requirements, cleanup, and feedback budgets. It is not a chronological test diary.

## Default verification

Run from the repository root:

```sh
./scripts/verify.sh
git status --short
```

`verify.sh` validates contract artifacts and synchronized documentation fragments, checks the BPMN XML, builds and tests Lean, emits Lean results, tests the TypeScript core and BPMN importer, runs the pinned CIB oracle, tests the differential comparator and infrastructure guards, builds the Temporal adapter, and runs the prepared complete pipeline.

Always finish with:

```sh
git diff --check
```

## Focused gate matrix

| Change | Required focused gate |
|---|---|
| Semantic profile, scenario, evidence, or JSON Schema | `./scripts/pnpm.sh run test:contracts` |
| Lean semantic definition or law | `lake test` |
| TypeScript semantic core | `./scripts/pnpm.sh run test:semantic-core` |
| Lean plus TypeScript semantic loop | `./scripts/pnpm.sh run test:semantic` |
| BPMN source/import/compiler/CMOF facts | `./scripts/pnpm.sh run test:bpmn-source` |
| Optional pinned MIWG admission observation | `./scripts/pnpm.sh run test:miwg` |
| CIB oracle, projection, or cleanup | `./scripts/test-cibseven-oracle.sh` |
| Pure differential comparator | `./scripts/pnpm.sh run test:differential` |
| Temporal Workflow/runner/refinement/replay | `./scripts/pnpm.sh run test:temporal` |
| Pipeline orchestration or any cross-target contract | `./scripts/pnpm.sh run test:pipeline` |
| Scripts, documentation fragments, and pre-release architecture guards | `./scripts/pnpm.sh run test:infrastructure` |
| Provisional representation experiment | `lake build checkSemanticRepresentationSpike && lake exe checkSemanticRepresentationSpike` |

For JavaScript and TypeScript tests use the global long-running-command policy: pnpm, `CI=true`, tests bounded to 60 seconds, builds bounded to 120 seconds, and no indefinite watch process.

The Temporal focused and pipeline gates start a local server and may need authorization to bind ports in a managed sandbox. They use pinned CLI `v1.8.1` cached under ignored `.cache/temporal-cli/`.

## Red/green semantic workflow

For every new semantic mechanism:

1. identify the normative clause, reviewed profile choice, or explicit competing interpretation;
2. add the smallest positive or negative witness that separates the intended account from a realistic wrong one;
3. confirm the focused gate fails because the mechanism is absent or wrong;
4. implement the semantic root, not a fixture-specific branch;
5. make the focused gate green;
6. add or retain a mutation that demonstrates the observation/comparison boundary notices the claimed distinction;
7. run the complete applicable gate;
8. update the capsule, implementation map, plan, and this procedure only where each owns the changed fact.

A pile of feature/profile/format switches is evidence of an unsound boundary. During pre-release, replace the current contract atomically rather than adding compatibility branches.

## Current contract and artifact gate

```sh
./scripts/pnpm.sh run test:contracts
```

The gate:

- validates the current profile, three answer-free scenarios, canonical results, and CIB evidence with Ajv Draft 2020-12;
- requires stable document kinds and no embedded format counters;
- verifies scenario/profile SHA-256 bindings in retained CIB evidence;
- requires every profile relationship ID to exist in [CIB-BPMN-RELATION.md](CIB-BPMN-RELATION.md);
- rejects answer smuggling, stale evidence, unknown relationships, and invalid task activation.

Retained CIB evidence is verifier-only. Target runners never receive it, and ordinary green runs never regenerate it.

## Current Lean and semantic-core gate

```sh
./scripts/pnpm.sh run test:semantic
```

Lean and TypeScript independently derive exact completion, wrong activation, and stale completion. Lean additionally checks:

- the executable internal-step selector is sound with respect to the declared internal microstep relation;
- exact active-occurrence completion terminates the Process;
- any Process-instance, BPMN-element, or activation mismatch is rejected with exact state preservation;
- wrong activation is a corollary of the general mismatch law;
- element identity alone is insufficient;
- closure-bound exhaustion remains a harness failure and never exposes a committed semantic command.

The semantic core tests structural IR/scenario admission, pure state transitions, state-derived observations, exact identity rejection, stale completion, incremental hosting, and malformed identity/topology inputs.

## Current CIB gate

```sh
./scripts/test-cibseven-oracle.sh
```

The Java 21 runner deploys exact BPMN, starts a Process, queries the active task, completes or refuses the requested semantic occurrence, projects canonical results, and removes all deployments and runtime/history state after each scenario. Exact, wrong-activation, and stale-completion cases share one warm engine through the persistent JSON-lines boundary.

PVM definition data remains diagnostic. Generated engine IDs are excluded from canonical identity. Every scenario must report a clean projection after teardown.

## Current Temporal gate

```sh
./scripts/pnpm.sh run test:temporal
```

The gate starts one fresh in-memory Temporal server, compiles exact BPMN before Workflow start, runs all three current scenarios through one Worker, compares Query projections, Update outcomes, and final results with the pure core, checks duplicate logical delivery, inspects the exact completion Update in live history, replays every fetched history, and shuts the server down.

No Event History fixture is committed. No legacy IR reader, Workflow patch branch, or format migration path exists during pre-release. The pre-release infrastructure guard locks this policy.

When the owner approves the first immutable deployment/history baseline, retained histories and compatibility paths must be introduced through red replay tests with explicit provenance, version markers, support windows, and removal criteria.

## Complete differential/refinement pipeline

```sh
./scripts/pnpm.sh run test:pipeline
```

The pipeline:

1. builds the source importer, Lean emitter, CIB test boundary, TypeScript core/comparator, and Temporal adapter;
2. loads three answer-free scenarios and content-bound CIB evidence;
3. compiles the exact BPMN bytes once per source/profile identity;
4. starts one clean Temporal server and Worker;
5. runs one three-case CIB batch, one three-result Lean emitter, the pure core, and six Temporal Workflows concurrently;
6. requires Lean's echoed scenario to equal the admitted scenario document, rejecting a drifted stimulus, BPMN digest, or provenance at an exact structural path;
7. compares CIB with Lean, the core, and Temporal exactly by scenario identity;
8. compares fresh CIB output with retained CIB evidence;
9. checks exact Query/Update evidence, duplicate delivery, isolated Workflow equality, and clean CIB state;
10. mutates the observed activation ordinal and requires an exact disagreement path;
11. replays all three primary live histories;
12. shuts down the Worker/server and removes temporary files.

The warm budget is less than 15 seconds after prepared builds. The cold budget including measured builds is less than 45 seconds. Prepared mode reports cold time as unavailable rather than zero.

The final source-current repository verification on 2026-07-24 completed in 21.03 seconds and its prepared pipeline completed in 4.88 seconds warm. Both remain within their budgets; timings are diagnostic performance evidence, not semantic claims.

## Documentation-fragment gate

Code excerpts in the MVP walkthrough are synchronized from tagged source regions:

```sh
./scripts/pnpm.sh run sync:doc-fragments
./scripts/pnpm.sh run check:doc-fragments
```

Normal verification checks only. After changing a tagged region, test the source first and then run the explicit synchronization command.

## Pre-release architecture guard

`scripts/pre-release-architecture.test.mjs` prevents active code from reintroducing:

- embedded schema/trace format counters;
- milestone-era scenario identifiers and paths;
- version-suffixed compiler routing;
- committed Temporal history JSON fixtures;
- Temporal Workflow patch branches.

This guard intentionally applies to current source and executable tests, not preserved architecture handoffs or research discussing future production compatibility.

## Evidence lanes

An **evidence lane** is one source of assurance about a claim, identified by three things:

1. its producer — what actually generates the evidence;
2. what passage of that lane can establish;
3. what passage of that lane cannot establish.

A fourth requirement decides whether two lanes are genuinely two: **two lanes are distinct only if their failure modes are uncorrelated.** Two producers that share an account, an internal representation, a fixture, or a projection cannot fail apart, so they count once regardless of how many artifacts they produce. Record that judgement per capsule rather than inferring it from the number of targets that agreed.

This document owns the term. Related but different concepts keep their own names: a **work-stream** is an implementation activity that produces a lane's artifact, a **pinned baseline** is a reference checkout or execution configuration as defined in [REFERENCE-INSTRUMENTATION.md](REFERENCE-INSTRUMENTATION.md), and individual propositions inside one lane are **rules**, owned by the applicable [capsule](capsules/README.md).

| Lane | Passage can establish | Passage cannot establish |
|---|---|---|
| Normative BPMN/profile review | Selected requirement and interpretation are explicit | Any implementation performs them |
| CIB compatibility | Pinned CIB behaves as observed under the declared profile | Universal BPMN correctness |
| Lean | The explicit Lean account executes and its stated laws hold | Correctness of CIB, parser, TypeScript, Temporal, or effects |
| TypeScript differential | The independently written core agrees on maintained inputs | Universal Lean correspondence, or that the core chose its operational account independently |
| Temporal refinement | The tested durable host preserves core-visible results and replays | Unsupported BPMN meaning |
| MIWG interchange | Structural import/reference/encoding behavior for pinned models | Execution conformance |
| Seeded mutation | The current projection/comparator detects one claimed distinction | Projection completeness |

No agreement vote resolves a source disagreement. Classify mismatches against the standard, profile, CIB configuration, observation boundary, and evidence before changing semantics.

## Capsule closure review

After the full gate is green, independently review:

- exact established and nearest unsupported claims;
- possible shared flawed fixture, interpretation, projection, or calibration source;
- whether observations depend only on admitted state and explicit inputs;
- nearest realistic counterexample and checked non-law;
- usefulness and hypotheses of Lean laws;
- independence of BPMN, CIB, Lean, TypeScript, and Temporal claims;
- version/history policy and meaningful mutation coverage;
- duplicated builds, cleanup, harness coupling, dominant timing, document placement, stale status, and removable complexity.

Every escaped issue becomes either a reusable review question or an executable guard.
