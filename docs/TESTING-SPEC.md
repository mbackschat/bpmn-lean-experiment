# Testing and evidence specification

This document owns maintained gates, test procedure, evidence separation, mutation requirements, cleanup, and feedback budgets. It is not a chronological test diary.

## Default verification

Run from the repository root:

```sh
./scripts/verify.sh
git status --short
```

`verify.sh` validates contract artifacts and synchronized documentation fragments, checks the BPMN XML, builds and tests Lean, emits Lean results, tests the TypeScript core and BPMN importer, runs the pinned CIB oracle, tests the differential comparator and infrastructure guards, runs the focused Temporal refinement/history/replay gate, and runs the prepared complete pipeline.

The infrastructure guard enumerates maintained Markdown outside the ignored normative reference corpus, requires every document to appear in [the documentation registry](README.md), enforces the role suffixes and reserved singleton names from [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md), and resolves every project-authored local Markdown link.

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
| Optional timer time-skipping calibration | `./scripts/pnpm.sh run test:timer-time-skipping` |
| Pipeline orchestration or any cross-target contract | `./scripts/pnpm.sh run test:pipeline` |
| Scripts, documentation fragments, and pre-release architecture guards | `./scripts/pnpm.sh run test:infrastructure` |
| Provisional representation experiment | `lake build checkSemanticRepresentationSpike && lake exe checkSemanticRepresentationSpike` |
| Checked-source relation experiment | `lake build checkCheckedSourceRelationExperiment && lake exe checkCheckedSourceRelationExperiment` |

For JavaScript and TypeScript tests use the global long-running-command policy: pnpm, `CI=true`, tests bounded to 60 seconds, builds bounded to 120 seconds, and no indefinite watch process.

The Temporal focused and pipeline gates start a local server and may need authorization to bind ports in a managed sandbox. They use pinned CLI `v1.8.1` cached under ignored `.cache/temporal-cli/`.

## Red/green semantic workflow

For every new semantic mechanism:

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

## Current contract and artifact gate

```sh
./scripts/pnpm.sh run test:contracts
```

The gate:

- validates the three draft profiles, seven answer-free scenarios, canonical results, CIB evidence, checked BPMN graph, and Semantic Process program shapes with Ajv Draft 2020-12;
- requires stable document kinds and no embedded format counters;
- verifies scenario/profile SHA-256 bindings in retained CIB evidence;
- requires every profile relationship ID to exist in [CIB-BPMN-RELATION-REGISTER.md](CIB-BPMN-RELATION-REGISTER.md);
- checks cross-artifact source/profile/process identity, source-origin references, unique definition identifiers, canonical unordered-array order, and raw CIB task-query and timer-job observations against their canonical projections;
- pins every schema integer to the JavaScript-safe range, checks Unicode scalar-value ordering across BMP and supplementary-plane identifiers without normalization, and rejects duplicate decoded keys and unpaired surrogates from exact JSON bytes;
- distinguishes unknown and missing fields, closed-enum violations, explicit `null` from absence, unsafe and non-integral numbers, answer smuggling, stale evidence, unknown relationships, invalid task or timer activation, dangling graph/program references, invalid gateway arity, definition identity drift, order-dependent definitions, omitted raw producer observations, duplicate raw semantic task identities, and timer-deadline projection drift.

Retained CIB evidence is verifier-only. Target runners never receive it, and ordinary green runs never regenerate it.

Replacing retained CIB evidence is an explicit content-bound operation:

```sh
./scripts/pnpm.sh run replace:cib-evidence
```

The package script supplies the exact `--replace` opt-in to the underlying replacement program. The program refuses direct execution without that flag, executes all seven answer-free scenarios through the pinned runner, verifies cleanup and producer identity, and rewrites only their retained CIB evidence. Every new evidence projection must first gain a meaningful verifier mutation.

## Current Lean and semantic-core gate

```sh
./scripts/pnpm.sh run test:semantic
```

Lean and TypeScript independently derive exact completion, wrong activation, and stale completion. Before evaluation, Lean uses a project-owned strict JSON parser, strictly decodes the actual checked graph and Semantic Process program, independently validates both, recomputes canonical lowering, and rejects any inequality. Compile-time locks reject duplicate keys including escape-equivalent names, unpaired surrogate escapes, unsafe integers, unknown and missing fields, closed enums, and absent required nullable fields; they also lock Unicode scalar ordering without normalization. Lean additionally checks:

- the executable operation-identified `step` is universally sound with respect to the declarative `OperationStep`/`ProgramStep` relation;
- lowering preserves definition identity and Sequence-Flow origins;
- exact active-occurrence completion terminates the Process;
- any Process-instance, BPMN-element, or activation mismatch is rejected with exact state preservation;
- wrong activation is a corollary of the general mismatch law;
- element identity alone is insufficient;
- exact `PT1S` lowering produces one 1000-millisecond `awaitTimer`;
- exact timer firing consumes the full occurrence, advances logical time to its deadline, and completes the admitted Process;
- one quantified timer law rejects every Process-instance, element, activation, or logical-time mismatch with exact state preservation; early firing is the named checked non-law and late firing is an instance of that law;
- bounded parallel duplication creates exactly two task waits;
- exact completion removes only the named occurrence and both completion orders reach the same final state;
- synchronization requires every incoming flow, consumes one token from each, and retains excess multiplicity;
- token projection is independent of storage order and duplicate-left/no-right is a checked non-law;
- closure-bound exhaustion or ambiguous internal choice remains a harness failure and never exposes a committed semantic command.

The reviewed full observational checked-source-to-program-run preservation proposition is not claimed: there is no independent checked-source operational relation from which to establish it without assuming the program account. Structural lowering preservation and exact artifact equality are the current proved boundary.

The semantic core tests structural program/scenario admission, pure state transitions, state-derived observations, direct current-state task and timer projection, exact structural stimulus well-formedness, same-stimulus identity, exact active-occurrence rejection, stale completion, incremental hosting, and malformed identity/topology inputs. Its parallel witnesses require exact two-task fork closure, both completion orders, equivalent final state and observation, public intermediate states, live-sibling stale rejection, per-incoming-flow join readiness and consumption, excess-token retention, storage-order-independent projection, operation-order-independent closure, and bounded topology rejection. Its timer witnesses require exact waiting projection, exact-deadline completion, full occurrence/time mismatch refusal, early/late refusal, and stale refusal. Lean's scenario closure additionally admits only the exact distinct two-task activation pair among multiple-enabled states, with checked activation-order observation equivalence and exact waiting-state closure. Lean strictly decodes the same admitted scenario documents supplied to the other targets and echoes the decoded values. This removes disk-versus-compiled-Lean scenario drift by construction; exact content drift relative to the oracle lane remains detected by retained CIB evidence binding, while the Lean extra-field mutation independently guards strict decoding against answer smuggling. The seven-case differential gate connects the independent CIB, Lean, TypeScript, and Temporal lanes under explicit per-case relations.

## Current CIB gate

```sh
./scripts/test-cibseven-oracle.sh
```

The Java 21 runner deploys exact BPMN, starts a Process, queries active tasks and timer jobs, completes or refuses requested semantic occurrences, projects canonical results, and removes all deployments and runtime/history state after each scenario. Exact, wrong-activation, sequential stale-completion, parallel A-then-B, parallel B-then-A, parallel live-sibling stale, and exact Intermediate Catch Timer cases share one warm engine through the persistent JSON-lines boundary. The timer probe fixes the engine clock, requires one job due at +1000 ms, proves the job ineligible before due time and eligible at the due date, and only then executes it. The multiple-task projector sorts distinct semantic occurrences independently of engine query order and preserves per-element active-wait multiplicity; repeated live instances of one BPMN element remain rejected because activation-ordinal derivation is outside the bounded profile. A bounded consistency probe captures a generated task ID, completes it, and requires pinned CIB Seven to reject that same host ID after it ceases to be live. A separate schema-valid research probe sends two executions through one Parallel Gateway incoming flow while the other incoming branch remains at a User Task and requires the observed downstream activation recorded by candidate `CIB-DEV-0001`.

PVM definition data remains diagnostic. Generated engine IDs are excluded from canonical identity. Raw task-query and timer-job snapshots are retained as producer observations, while the evidence verifier independently reconstructs canonical task and timer projections and includes mutations that drop one initial parallel task, drop the live B sibling after stale A, or change the timer deadline. The CIB wait, scheduler eligibility, due transition, and completion are engine-observed; timer occurrence identity and logical deadline mapping are adapter-derived. The consistency probe supports only the host-identity premise of `CIB-OP-0001`; it is not activation-ordinal evidence. The duplicate-same-flow probe is calibration evidence only: it does not enter the normative balanced target result or production semantic account. Every retained scenario must report a clean projection after teardown, and each bounded probe owns isolated engine cleanup.

## Current Temporal gate

```sh
./scripts/pnpm.sh run test:temporal
```

The gate starts fresh in-memory Temporal servers, compiles exact BPMN before Workflow start, and runs the semantic-lifetime Workflow over the retained sequential, parallel, and Intermediate Catch Timer probes. It checks the shared Workflow-safe typed-tuple encoder, fixed existing Process-address/Update/timer encodings and digests, deterministic SHA-256 known-answer vectors across padding boundaries, supplementary-plane UTF-8, a multi-block native-crypto cross-check outside Workflow code, content-bound Update and timer command IDs, collision-resistant Process-address Workflow IDs, duplicate logical delivery, accepted-handler draining, typed adapter lifecycle results, retained-Update-first recovery, Query evidence reconciliation, durable timer history, and replay before cleanup.

The sequential stale schedule awaits the completed receipt before submitting the distinct stale command. The gate requires CIB Seven, Lean, and the pure core to retain exact semantic rejection, Temporal to agree exactly through semantic completion, and the adapter to return `processClosed` separately. The parallel live-sibling schedule completes A and then repeats A while B remains active, requiring exact four-target semantic rejection. A retained concurrent same-occurrence race asserts one committed and one rejected result with identical final state without pinning the winner.

The Workflow must enqueue its admitted start stimulus before registering externally addressable handlers. Update handlers may run as soon as they are registered, including during replay after Worker restart; the focused restart witness guards against completion overtaking start. The harness-only post-completion Query trace must reconcile every completion-command outcome with its completed Update result in Event History and its terminal state with the validated completed receipt. A failed Update is classified as harness infrastructure failure rather than parsed as a malformed semantic outcome. The start command is excluded from durable Update-result reconciliation because it is a Workflow argument rather than an Update. Intermediate Query state remains independently checked against the core and does not become the production observation API.

For the timer capsule, the runner validates but never delivers the scenario's explicit `fireTimer` stimulus. The Workflow derives the identical stimulus only from committed `openTimers` state, schedules the exact remaining duration, and records one matching timer-started/timer-fired pair. The mandatory full-server witness stops the Worker before the due boundary, waits beyond due time without a poller, starts a replacement Worker, reconciles the completed receipt and history, and replays the history. A separately bundled mutation bypasses `Workflow.sleep`; the pure result stays equal while the durable-history assertion fails.

The optional `test:timer-time-skipping` command runs the same exact timer result and durable-history assertion on Temporal's time-skipping test server. It is calibration only and is excluded from `verify.sh`; it cannot replace or weaken the full-server duration, Worker absence, history, replay, or cleanup evidence.

The focused Service Task refinement witnesses derive the Activity request and content-bound completion only from committed `openEffects` state. They lock the exact two-attempt timeout/retry policy, one-invocation plain success, two-invocation/one-mutation fail-after-mutation reconciliation, two-instance shared-store separation, field omission and host-over-inclusion mutations, typed exhaustion with unchanged committed intent, Worker replacement after start-to-close expiry, live replay, and a separately bundled inline-bypass mutation that preserves the pure trace but lacks Activity history. The pinned server summarizes a successful retry as one final `ActivityTaskStarted` with `attempt: 2` and `lastFailure`; probe-service invocation evidence independently observes both attempts.

No Event History fixture is committed. No legacy IR reader, Workflow patch branch, or format migration path exists during pre-release. The pre-release infrastructure guard locks this policy.

When the owner approves the first immutable deployment/history baseline, retained histories and compatibility paths must be introduced through red replay tests with explicit provenance, version markers, support windows, and removal criteria.

## Complete differential/refinement pipeline

```sh
./scripts/pnpm.sh run test:pipeline
```

The pipeline:

1. builds the source importer, Lean emitter, CIB test boundary, TypeScript core/comparator, and Temporal adapter;
2. loads seven answer-free scenarios and content-bound CIB evidence;
3. compiles the exact BPMN bytes once per source/profile identity;
4. starts one clean Temporal server and Worker;
5. writes the actual checked graph and Semantic Process program for each retained scenario to a private definition-input batch;
6. runs one seven-case CIB batch, one seven-result Lean emitter over that definition batch, the pure core, and fourteen Temporal Workflows concurrently;
7. requires Lean's decoded-and-echoed scenario to equal the admitted scenario document and injects an extra answer field that the strict Lean decoder must reject; because Lean consumes the admitted file directly, retained CIB content binding rather than a second compiled scenario copy detects disk-content drift;
8. requires Lean's echoed definition identity and lowering-equality result to match the admitted artifacts;
9. mutates one operation origin without making the program structurally invalid and requires Lean to reject the program as unequal to its lowering;
10. compares CIB, Lean, and the core exactly by scenario identity; requires exact four-target agreement for ordinary cases including the live-sibling stale witness; and for sequential stale requires exact Temporal prefix agreement plus a separate `processClosed` adapter assertion;
11. compares fresh CIB output with retained CIB evidence;
12. checks exact Query/Update evidence, duplicate delivery, isolated Workflow equality, and clean CIB state;
13. mutates the observed activation ordinal in sequential cases, omits one initial parallel open task, drops the live sibling after stale A, changes the timer deadline, and requires exact disagreement paths;
14. erases the parallel control-place Sequence-Flow provenance while preserving structural validity and requires Lean's lowering-equality gate to reject it;
15. replays all seven primary live histories;
16. shuts down the Worker/server and removes temporary files.

### Conditional Service Task schedule substitution

The approved [Service Task effect proposal](capsules/SERVICE-TASK-EFFECT-PROPOSAL.md) requires its pending pipeline change to retain one answer-free semantic scenario while substituting the Service Task's ordinary second plain Temporal isolation execution with `FailAfterMutationOnce`. The two executions still use separate stores that are asserted empty and must produce identical canonical results, so isolation remains checked while the substituted run adds retry/reconciliation evidence.

The resulting conditional matrix is eight scenarios, sixteen Temporal executions, and nine replayed histories: eight primary histories plus the Service Task failure-schedule history. Lean and the core execute the semantic scenario once. CIB executes `PlainSuccess` for content-bound retained evidence and `FailAfterMutationOnce` separately for raw retry/re-execution facts; each uses fresh test-local state and CIB computes no project transport key. The adapter-local two-semantic-instance/shared-store key discriminator is not a ninth scenario.

This substitution does not change either budget. The 15-second bound applies only to the prepared warm pipeline; focused Temporal tests remain subject to the repository-wide 60-second test limit.

The warm budget is less than 15 seconds after prepared builds. The cold budget including measured builds is less than 45 seconds. Prepared mode reports cold time as unavailable rather than zero.

## Continuous integration

[The verification workflow](../.github/workflows/verify.yml) runs `./scripts/verify.sh` on `ubuntu-latest` and `macos-latest` with the repository-pinned Node and pnpm versions, Java 21, and the Lean toolchain selected by `lean-toolchain`. It installs the frozen pnpm lockfile and relies on the Maven wrapper and Temporal test environment for their pinned artifacts.

The 15-second prepared-pipeline warm budget remains a hard assertion on both CI operating systems. Dependency installation and compilation occur before the prepared pipeline measurement, so runner provisioning does not consume that budget. The 45-second cold budget remains a measured local `test:pipeline` assertion and is not reported as zero in prepared CI mode. If a hosted runner repeatedly exceeds the warm budget, treat that as evidence to classify runner variance or optimize the gate; changing, suppressing, or conditionally weakening either budget requires an explicit owner decision.

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

This document owns the term. Related but different concepts keep their own names: a **work-stream** is an implementation activity that produces a lane's artifact, a **pinned baseline** is a reference checkout or execution configuration as defined in [REFERENCE-INSTRUMENTATION-POLICY.md](REFERENCE-INSTRUMENTATION-POLICY.md), and individual propositions inside one lane are **rules**, owned by the applicable [capsule](capsules/README.md).

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
