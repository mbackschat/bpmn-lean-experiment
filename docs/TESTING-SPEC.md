# Testing and evidence specification

## Status

Implemented living gate contract.

This document owns maintained gates, test procedure, evidence separation, mutation requirements, cleanup, and feedback budgets. It is not a chronological test diary.

## Default verification

Run from the repository root:

```sh
./scripts/verify.sh
git status --short
```

`verify.sh` validates contract artifacts, strictly type-checks the directly executed TypeScript harnesses without emitting JavaScript, enforces source-hygiene boundaries, checks synchronized documentation fragments and the BPMN XML, builds and tests Lean, explicitly compiles the checked-source proof experiment, emits Lean results, tests the TypeScript core and BPMN importer, runs the pinned CIB oracle, tests the differential comparator and infrastructure guards, runs the focused Temporal refinement/history/replay gate, and runs the prepared complete pipeline.

The infrastructure guard enumerates maintained Markdown outside the ignored normative reference corpus, requires every document to appear in [the documentation registry](README.md), enforces the role suffixes and reserved singleton names from [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md), and resolves every project-authored local Markdown file and heading anchor. It also keeps the live surface inventory in reviewable per-surface implemented/absent sections: the inventory may not return to dense table cells, and no prose or list review unit in that section may exceed 120 words.

The A12 boundary guard inspects tracked and non-ignored pending material. It rejects A12/EUPL source headers outside Markdown research records, A12 package or build coordinates, the exact external `CreateDocument.bpmn` bytes, links into registered A12 checkouts, and known downstream A12 bean identities in Lean, the semantic core, or the Temporal adapter. It separately binds the maintained CreateDocument scenario to the SHA-256 and provenance declaration of its distinct project-authored MIT fixture. The guard is deliberately narrower than a ban on the words “A12” or “EUPL,” because source/profile research and provenance records must describe the boundary they enforce.

The source-hygiene guard counts nonblank lines in tracked and non-ignored pending hand-written Lean, TypeScript, JavaScript, and Java source, so a new oversized file fails before staging or commit. It fails above the 1000-line hard ceiling and requires every 600–999-line file to carry an owner-approved narrow cohesion rationale in the guard; agents may not add their own exceptions. It also keeps the exact Lean umbrella modules import-only. The guard additionally enforces a zero-JavaScript invariant: every hand-written `.js`, `.cjs`, or `.mjs` module fails without an allowlist, because JavaScript is an execution path no strict no-emit gate covers. It further requires the harness type gate to resolve no project build output: a `dist/` specifier in a file that gate includes would type-check against whatever declarations an earlier build happened to leave behind and cannot resolve at all in a clean checkout, so those files import a package entry point instead. A published dependency's own `dist` directory and a runtime bundler path built from `new URL` remain admissible, because neither places a resolution requirement on the gate. Its policy self-tests lock all of these regression classes, including that the JavaScript rejection admits no extension and no location, and that the build-output policy separates resolved specifiers from quoted fixture text and runtime paths. This measurement is a stop signal, not a substitute for the responsibility, class, and function review required by [CLAUDE.md](../CLAUDE.md#code-hygiene-and-module-boundaries).

BPMN XML validation has one owner, [`scripts/validate-bpmn-xml.sh`](../scripts/validate-bpmn-xml.sh), called by `verify.sh` and the CIB oracle gate. It preflights `xmllint` and names the resolved binary, because several libxml2 builds commonly coexist on one host and an absent tool otherwise surfaces as a bare exit 127 partway through a gate. The pinned `BPMN20.xsd` belongs to the Git-ignored OMG corpus, so a clean checkout and CI establish well-formedness only; the validator announces that reduction and states that it makes no schema conformance claim, and `BPMN_XSD_PATH` overrides the schema location. Its behavioral guard exercises tool absence, the announced reduction, malformed input under reduced validation, and schema rejection of a trailing argument against a temporary schema, so the guard keeps checking validation wherever the corpus is absent. [`scripts/check-bpmn-semantic-process-metamodel.ts`](../scripts/check-bpmn-semantic-process-metamodel.ts) invokes `xmllint --xpath` separately for bounded CMOF facts and announces its own skip when that corpus is absent.

Hosted verification caches `.lake` between runs, keyed on the exact Lean source state with a prefix fallback for incremental rebuilds, so a green CI run is an incremental Lean build rather than a from-scratch one. `lake` decides reuse by content, and every other lane still starts from a clean checkout.

The warm-pipeline assertion is a feedback budget, not a semantic invariant. Its 15000ms default targets a developer workstation, and a slower environment declares its own ceiling through `BPMN_PIPELINE_WARM_BUDGET_MS`; the gate announces the measurement against whichever budget applied. The hosted workflow declares a 40000ms ceiling without weakening the workstation default. Treat a workstation regression past 15000ms as a real finding.

`xmllint` is the only host tool verification expects the platform to provide. Node, pnpm, Java, and the Lean toolchain arrive at pinned versions through the workflow setup actions, Maven arrives through the committed `runners/cibseven/mvnw` wrapper, and `git` plus `sed` are present on every supported image; [`scripts/pnpm.sh`](../scripts/pnpm.sh) treats its Homebrew locations as a fallback after the PATH check, so it resolves the same pinned versions on a runner. The macOS images resolve an `xmllint` already, while the Ubuntu image has no libxml2 package, so the workflow installs `libxml2-utils` there. Adding another host tool to a verification script requires the same review: confirm an equivalent package exists on every supported image, or provide the tool through a pinned action or committed wrapper.

pnpm 11's implicit virtual-store choice is execution-context-sensitive: ordinary execution may select the shared global projection while `CI=true` selects the repository-local projection. This repository deliberately runs verification in CI mode and may reuse the same worktree for ordinary developer commands, so relying on that implicit choice would make one `node_modules` alternate between incompatible layouts. [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) therefore pins the supported CI-oriented `enableGlobalVirtualStore: false` mode, keeping the dependency projection isolated under the repository-local `node_modules/.pnpm` while the content-addressable package store remains shared. The infrastructure gate removes possible overrides, checks the effective value with and without `CI=true`, and executes a bare `./scripts/pnpm.sh run check:doc-fragments`; an unexpected install-state purge or reinstall attempt is a gate failure.

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
| TypeScript semantic contract or type abstraction | `./scripts/pnpm.sh run check:semantic-types` plus the owning runtime gate |
| BPMN source/import/compiler/CMOF facts | `./scripts/pnpm.sh run test:bpmn-source` |
| Optional pinned MIWG admission observation | `./scripts/pnpm.sh run test:miwg` |
| CIB oracle, projection, or cleanup | `./scripts/test-cibseven-oracle.sh` |
| Pure differential comparator | `./scripts/pnpm.sh run test:differential` |
| Temporal Workflow/runner/refinement/replay | `./scripts/pnpm.sh run test:temporal` |
| Optional timer time-skipping calibration | `./scripts/pnpm.sh run test:timer-time-skipping` |
| Pipeline orchestration or any cross-target contract | `./scripts/pnpm.sh run test:pipeline` |
| Directly executed TypeScript harness or utility | `./scripts/pnpm.sh run check:harness-types` plus its applicable runtime gate |
| Source ownership, module boundary, or structural refactor | `./scripts/pnpm.sh run check:source-hygiene` plus the narrow language gate |
| Scripts, documentation fragments, and pre-release architecture guards | `./scripts/pnpm.sh run test:infrastructure` |
| Provisional representation experiment | `lake build checkSemanticRepresentationSpike && lake exe checkSemanticRepresentationSpike` |
| Checked-source relation experiment | `lake build checkCheckedSourceRelationExperiment && lake exe checkCheckedSourceRelationExperiment` |

Default verification runs both checked-source experiment commands. The build kernel-checks the theorem declarations, including the Stage 3a witnesses; the executable then evaluates `stageTwoAdmissionChecks`, `stageThreeAFrontierChecks`, and the retained positional-lowering controls. `scripts/verification-entrypoint.test.ts` guards both exact commands plus the Stage 3a module imports, so neither theorem reachability nor executable negative-witness coverage can silently leave the default lane. Because the frozen experiment consumes the current checked-source contract, every closed-union widening must keep its exhaustive readers compiling and must explicitly reject any new variant outside the experiment's frozen semantic surface; the transitive build is the executable atomic-consumer guard.

For JavaScript and TypeScript tests use the global long-running-command policy: pnpm, `CI=true`, tests bounded to 60 seconds, builds bounded to 120 seconds, and no indefinite watch process.

## Direct TypeScript harnesses

Node 24 executes every project-authored harness — the pipeline, artifact, evidence-replacement, Java-resolution, strict-JSON, bounded-process, documentation, metamodel, and calibration entry points plus every package test — directly from `.ts` source through its built-in erasable-type stripping. Runtime execution does not perform type checking, so `./scripts/pnpm.sh run check:harness-types` is a separate mandatory no-emit gate. `tsconfig.harness.json` includes `scripts/*.ts` plus every package `test/` and `calibration/` directory, so a new harness file joins the gate without a configuration change. It maps every `@bpmn-lean/*` specifier to that package's source entry point, so the gate stays hermetic: it runs first in `verify.sh`, before any compilation, and depends on no generated declarations. The source-hygiene guard enforces that property.

The harness configuration keeps `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and NodeNext module resolution enabled. It permits `.ts` import suffixes because Node executes those paths directly. The source-hygiene gate parses the direct harness root files and rejects TypeScript constructs such as native enums, runtime namespaces, parameter properties, import aliases, and `export =` that need emitted JavaScript; directly executed harnesses use `as const` value objects and derived unions instead. This guard is scoped to executed roots because the no-emit configuration also type-checks imported workspace source through path mappings, while those packages execute from compiled output and may legitimately use enums. `skipLibCheck` applies only to imported declarations—including the pinned Temporal SDK declarations that do not type-check under TypeScript 7.0.2—while every included project source file remains strictly checked. The direct `@types/node` dependency supplies the Node 24 host API surface; its `undici-types` dependency supplies type declarations for Node's Fetch-compatible APIs and adds no runtime code.

The no-emit configuration resolves workspace package names to checked source entry points, so a clean checkout does not need ignored `dist/` output for type coverage. Runtime package self-references still use each package's ordinary built output after the applicable gate builds it.

There is no JavaScript exception left: every project-authored module is strict TypeScript inside this gate. Package tests import their subject through the workspace package name so the gate resolves checked source while Node resolves the package's own built output; a package's internal compiled-only module is loaded through a non-literal specifier and narrowed like any other untrusted boundary, keeping the gate independent of `dist/`.

The semantic-core type-test configuration compiles without emitting JavaScript and locks developer-facing contract properties that runtime tests cannot observe. Its `DeepReadonly<T>` witness requires top-level, nested, array-element, tuple-element, and discriminated-union payload mutation to fail at compile time while callback types remain callable and tuples retain exact positions. `test:semantic-core` and `test:semantic` both run this gate.

The Temporal gates start a local server. In a managed sandbox, request host port-binding authorization before the first attempt to run `./scripts/verify.sh`, `./scripts/pnpm.sh run test:temporal`, `./scripts/pnpm.sh run test:pipeline`, or `./scripts/pnpm.sh run test:timer-time-skipping`; do not run a restricted probe first. An ephemeral-server startup error containing `Operation not permitted` or `EPERM` identifies sandbox-denied local binding, not a port collision or semantic-test failure. The gates use pinned CLI `v1.8.1` cached under ignored `.cache/temporal-cli/`.

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

An admission, lowering, runtime-representation, or public-observation capsule must additionally state the exact source-to-result claim it can invalidate and retain the smallest theorem, typed check, or executable discriminator that detects the realistic wrong account. For every newly reachable structure, the capsule must executable-check its longest internal closure against the configured `semanticProcessClosureLimit`, including one over-limit negative witness; show that each newly reachable multiple-enabled state is an approved independent/order-invariant set, receives an explicit semantic choice, or is rejected consistently by Lean and TypeScript; and show that each stable `running` state is terminally complete or exposes an explicit semantic resumption surface. The resumability check is over the whole stable state, so a half-ready join beside a live wait is valid, while tokens without any possible semantic ingress are not mistaken for progress. A second capsule needing the same preservation proposition reopens the general theorem rather than duplicating an increasingly universal local proof.

Semantic program admission and host capability are separate gates. Before Workflow start, the adapter must deterministically accept every reachable wait-set shape or return a typed adapter admission failure. A capsule that makes concurrent waits or a mixed timer/effect/subscription set reachable must either prove the current single-host-wait restriction remains preserved or implement and evidence the required deterministic scheduler. A non-retryable throw from Workflow execution is not an admission result and does not satisfy this gate.

### CIB BPMN fixture construction

Use the pinned CIB Seven BPMN Model API for ordinary project-authored CIB behavioral probes when its typed model can preserve every fact the witness needs. A capsule-specific helper should make the admitted source shape structurally unavoidable rather than expose an arbitrary XML builder; the Exclusive Gateway helper therefore requires exactly two conditional branches and one conditionless default. Direct project use of the model API is declared as a test dependency even when the engine already resolves it transitively.

Keep literal BPMN XML when XML syntax, namespace spelling, declaration order, reference order, an omitted/defaulted attribute, parser rejection, or another lexical distinction is the discriminator. Do not route such a witness through a builder that may normalize, synthesize, validate, or reorder the deciding fact. A rare excluded model variant may use a private test helper over typed model and DOM APIs when the helper states the exact mutation and the generated XML shape is asserted.

Do not modify the pinned CIB source or fork its DSL merely to simplify project fixtures. If a modified reference branch is necessary for tracing or a deterministic fault point, follow the [reference instrumentation policy](REFERENCE-INSTRUMENTATION-POLICY.md), shadow-compare it with the pristine lane, and keep it diagnostic rather than counting it as oracle evidence.

## Current contract and artifact gate

```sh
./scripts/pnpm.sh run test:contracts
```

The gate:

- validates every registered draft profile and answer-free scenario, canonical results, retained CIB evidence where the declared target set includes CIB, checked BPMN graph, and Semantic Process program shapes with Ajv Draft 2020-12;
- discovers every profile, scenario, and retained-evidence artifact and requires an exact roundtrip through the artifact registry and differential catalog: no orphan profile, unregistered file, missing or duplicate pipeline case, mismatched CIB evidence route, accidental CIB target on a normative-only case, or case without a seeded semantic mutation is permitted;
- requires stable document kinds and no embedded format counters;
- verifies scenario/profile SHA-256 bindings in retained CIB evidence;
- requires every profile relationship ID to exist in [CIB-BPMN-RELATION-REGISTER.md](CIB-BPMN-RELATION-REGISTER.md);
- checks cross-artifact source/profile/process identity, source-origin references, unique definition identifiers, canonical unordered-array order, and raw CIB task-query, timer-job, effect-job, and effect-execution observations against their canonical projections, including an enforced empty Message-subscription projection because CIB is not a Message target;
- pins every schema integer to the JavaScript-safe range, checks Unicode scalar-value ordering across BMP and supplementary-plane identifiers without normalization, and rejects duplicate decoded keys and unpaired surrogates from exact JSON bytes;
- distinguishes unknown and missing fields, closed-enum violations, explicit `null` from absence, unsafe and non-integral numbers, answer smuggling, stale evidence, unknown relationships, invalid task, Message, timer, or effect activation, dangling graph/program references, invalid gateway arity, definition identity drift, order-dependent definitions, omitted raw producer observations, duplicate raw semantic task identities, unclaimed CIB Message-subscription drift, timer-deadline projection drift, raw Service Task binding drift, and neutral effect-operation drift.

Retained CIB evidence is verifier-only. Target runners never receive it, and ordinary green runs never regenerate it.

Replacing retained CIB evidence is an explicit content-bound operation:

```sh
./scripts/pnpm.sh run replace:cib-evidence
```

The package script supplies the exact `--replace` opt-in to the underlying replacement program. The program refuses direct execution without that flag, groups every CIB-backed registered scenario by its exact CIB release, executes each group through its pinned runner, verifies cleanup and producer identity, and rewrites only the registered retained CIB evidence. Every new evidence projection must first gain a meaningful verifier mutation.

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
- the profile-parameterized Timer/User Task composition is accepted under only its exact profile, lowers identically, covers both finite acyclic mechanism orders, never exposes more than one enabled internal operation at a stable boundary, remains resumable at each Timer or User Task wait, completes, and rejects zero-step closure limits plus a synthetic stranded-token state;
- the profile-parameterized Intermediate Catch Message capability admits both finite acyclic Message/User Task orders, preserves the resolved Interface/Operation/Message reference triple through lowering, creates one complete Process-owned subscription, consumes only the exact identity and channel once, rejects every identity/channel/pre-activation/stale mismatch with exact state preservation, stays below the closure limit, never exposes multiple enabled internal operations at a stable boundary, and rejects a synthetic stranded-token state;
- bounded parallel duplication creates exactly two task waits;
- exact completion removes only the named occurrence and both completion orders reach the same final state;
- synchronization requires every incoming flow, consumes one token from each, and retains excess multiplicity;
- token projection is independent of storage order, and a synthetic four-kind state with two reverse-ordered same-kind waits fixes `activeWaits` order as User Task, Message, Timer, then effect and by Unicode element ID within kind. Lean performs the element-ID sort directly, so `PAR-PROJECT-01` no longer depends on program operation order or same-kind unreachability; duplicate-left/no-right remains a checked non-law;
- exact Service Task lowering produces one structured effect intent, matching completion closes the Process, every full-identity mismatch preserves state, and the accept-arbitrary-result account is a checked non-law;
- closure-bound exhaustion or ambiguous internal choice remains a harness failure and never exposes a committed semantic command.

The reviewed full observational checked-source-to-program-run preservation proposition is not claimed. A provisional direct checked-source relation exists in the separately gated experiment lane. Stage 1 proves constant operation-prefix order preservation plus exact enabled-operation/successor agreement at four states of a two-segment serial chain. Stage 2 adds reusable finite-fuel reachability/co-reachability checks, exact producer/consumer program validation, an executable structured serial/balanced-pair parser with exact wait-surface checks, and kernel-checked witnesses. Stage 2b adds a declarative checked-graph tail relation, executable-tail-parser soundness, graph-derived uniqueness up to parallel-branch exchange, and positive path soundness. Stage 2c adds graph-derived whole-process unique Start/End, nonempty chain, complete distinct node and Sequence Flow coverage, unique Flow-source ownership, and an independently quantified canonical-chain law; parser state does not occur in the exported proposition. Stage 2d adds a post-search saturation certificate, proves every declarative path lies in the certified reached set, and derives declarative return-path exclusion and reachability antisymmetry. The retained fuel-one three-node cycle must remain accepted by the old negative bounded predicate and rejected by the certified predicate, while both reject it at vertex-count fuel; all seven accepted program witnesses must remain accepted. Revised Stage 3a adds a graph-derived, node-order-independent single-token enabled-list characterization and kernel witnesses for the fork and half-ready join frontiers. Stage 3b adds a multiplicity-preserving two-token characterization up to `List.Perm`; its kernel witnesses refute exact equality under node reordering and anchor exchange, instantiate both branch contributions, retain a one-contribution half-ready frontier, and show that distinct targets plus settled initiation are load-bearing. Each such exclusion must refute the theorem's own `List.Perm` conclusion at the hypothesis-violating arguments; a comparison of list lengths does not count, because it rests on an unstated length-preservation step rather than on the refuted proposition. The proof target must import both Stage 3a modules by exact name, its conformance module must import the Stage 3b parallel-frontier module, and `scripts/verification-entrypoint.test.ts` guards all three edges in addition to both `verify.sh` commands. No Stage 3b Boolean re-decides the kernel witnesses. Vertex-count fuel adequacy remains unproved and no uncertified negative bounded-search result is treated as proof that no path exists. Standalone checked-source validation also retains three kernel-checked regressions for empty, flowless, and dangling-reference graphs. Direct Timer/effect source clauses, closure-selector soundness, commutation, closure fuel stability, the four-step closure theorem, generalized correspondence, and run-level induction remain unresolved; the current experiment closure selector still chooses the head induced by `source.nodes` order, and the Stage 3b permutation theorem does not justify that choice.

The semantic core tests structural program/scenario admission, profile operation cardinalities, pure state transitions, state-derived observations, direct current-state task, Message, timer, and effect projection, exact structural stimulus well-formedness, same-stimulus identity, exact active-occurrence rejection, stale completion, incremental hosting, and malformed identity/topology inputs. Its parallel witnesses require exact two-task fork closure, both completion orders, equivalent final state and observation, public intermediate states, live-sibling stale rejection, per-incoming-flow join readiness and consumption, excess-token retention, storage-order-independent projection, operation-order-independent closure, bounded topology rejection, and semantic-kind-before-element ordering for a synthetic mixed wait state. Its timer witnesses require exact waiting projection, exact-deadline completion, full occurrence/time mismatch refusal, early/late refusal, and stale refusal. The Timer/User Task composition witness requires exact-profile admission, Timer-only/User-Task-only/unknown-profile rejection, topology-independent dangling-graph rejection, zero-step closure failures at all three internal boundaries, single-enabled stable states, explicit Timer/User Task resumability, completion, and stranded-state non-resumability. The Message witnesses require both legal mechanism orders, exact-profile admission, resolved-channel lowering, exact activation and consumption, complete identity/channel/pre-activation/stale state-preserving refusal, duplicate stability, one public Message interaction, four-kind canonical ordering, bounded closure, and stranded-state non-resumability. The ordinary embedded Sub-Process witnesses require exact scope-tree and ownership admission, order-invariant source lowering and enabled sets, both child completion orders, sibling survival, child-completion refusal before owned quiescence, one outer continuation, root completion, bounded closure, and child-stranded non-resumability. The Error-propagation witnesses require exact handler admission, one combined representative source declaration reordering, unique throw enabledness in the exact pre-closure state, both child-command orders, regional subtree cancellation, monotonic counter preservation, unreachable normal output, root-work survival, state-preserving stale refusal, bounded closure, and checked stable-state resumability. Its effect witnesses require one structured intent, matching completion, full mismatch and stale refusal, no caller interaction, and pure transport-material projection with no host identity. The CreateDocument witnesses require committed literal arguments, an exact one-field typed local patch, deterministic output mapping to Process scope, local-scope cleanup, malformed-patch state preservation, and a direct-local-patch-to-Process-scope discriminator. The boundary-error witnesses require a successful typed business-error Activity result, exact-code route selection, normal-route abandonment, discriminated null mapping, Activity-local cleanup, state-preserving occurrence/code/patch refusal, and a checked non-law that sends the same state to the normal path. The Simple Boolean witnesses require all five exact forms, present/null/absent discrimination, strict syntax and source-language rejection, declaration-ordered lowering, first-true tail irrelevance, second-true and all-false/default routing, exact three-step start closure, a smaller-bound failure, source-origin rejection, and exact profile cardinality that excludes a second simultaneously enabled internal operation. Lean's scenario closure additionally admits only the exact distinct two-task activation pair among multiple-enabled states, with checked activation-order observation equivalence and exact waiting-state closure. Lean strictly decodes the same admitted scenario documents supplied to the other targets and echoes the decoded values. This removes disk-versus-compiled-Lean scenario drift by construction; exact content drift relative to a CIB oracle lane remains detected by retained evidence binding, while the Lean extra-field mutation independently guards strict decoding against answer smuggling. The differential gate derives its complete case set and each case's target set from the guarded catalogs: CIB-backed cases compare the applicable CIB relation, while standards-only cases compare Lean, TypeScript, and Temporal without inventing CIB truth evidence.

The scoped-data replacement adds class guards in both pure implementations: activation must expose empty Process bindings plus one complete-effect-occurrence-owned Activity-local scope; completion must map Process output and remove only the matching owner; two same-shaped owners must remain distinct; missing or duplicate owners must refuse without state change; a private-only local binding must not enter canonical `variables` or `openEffects`; the TypeScript shape must remain deeply immutable; the mapped start must require exactly two internal steps, remain below `semanticProcessClosureLimit = 8`, and fail the one-step negative witness; and internal-operation enabledness must remain identical for states differing only in scoped data. These are targeted representation-preservation checks, not a general source-to-runtime preservation theorem.

## Current CIB gate

```sh
./scripts/test-cibseven-oracle.sh
```

The shell entry point validates the BPMN fixtures and then replaces itself with the directly executed TypeScript Maven orchestrator. Each release-specific Maven invocation owns a 60-second deadline and a detached process group; timeout or parent interruption terminates the complete Maven/Surefire descendant group, with a forced-kill grace period. The infrastructure test reproduces both timeout and parent-interruption cases with an escaping grandchild, so a stopped gate cannot leave hidden CIB work to contend with the next measurement.

The Java 21 runner deploys exact BPMN, starts a Process, queries active tasks and jobs, completes or refuses requested semantic occurrences, projects canonical results, and removes all deployments and runtime/history state after each scenario. Exact, wrong-activation, sequential stale-completion, parallel A-then-B, parallel B-then-A, parallel live-sibling stale, exact Intermediate Catch Timer, exact Service Task success, four ordinary embedded Sub-Process schedules, and three Sub-Process Error-propagation schedules share one warm CIB Seven `2.2.0` engine through the persistent JSON-lines boundary. The ordinary Sub-Process cases cover both child completion orders, stale rejection while the sibling remains live, stale rejection after child-scope completion, and absence of the outer User Task before child quiescence under `CIB-AGR-0007`. The Error cases cover Trigger-first and Sibling-first recovery lifecycle plus the stale schedule's pre-refusal recovery prefix under `CIB-AGR-0008`; mapping the removed generated task and its refusal to the project stale semantic occurrence/result belongs to `CIB-OP-0001`. The retained public Process/task projection establishes recovery-route selection and sibling disappearance without claiming visibility into hidden execution-tree microsteps. The exact-source phase-zero class remains the independent pre-profile probe. CreateDocument and boundary error run against packaged CIB Seven `2.0.0` as separate synchronous host relations. CreateDocument observes the mapped delegate input and local output, engine completion, and final Process variable inside the start transaction. Boundary error observes the exact boundary User Task, absence of normal completion, target-shaped Activity-local null write, committed output mapping, and final null Process variable; the adapter projects the semantic start/effect boundary into CIB's synchronous start command rather than claiming a CIB effect-in-flight state. The focused CIB gate also runs the seven-test boundary-error phase-zero class. That retained probe derives the profile from deployment state and locks the account-changing counterexample: caught Errors apply the configured output mapping before the boundary User Task, a target-shaped null local write creates a present null-valued Process variable, the complete unmatched fixture rolls back during output-mapping evaluation, and an empty `errorCodeVariable` is accepted and exposed under the empty variable name. The three-test User Task completion-data phase-zero class builds one project-owned two-task Process through the pinned Model API and locks public task-variable visibility, create/overwrite/preserve merge, present null, visibility before continuation and after completion, no-data preservation, and no write on unknown or stale generated task IDs. The timer probe fixes the engine clock, requires one job due at +1000 ms, proves the job ineligible before due time and eligible at the due date, and only then executes it. The Service Task path derives its activity and binding from public job-definition/deployed-model state, executes the async-before job under an explicit schedule, and keeps fail-once retry facts raw-only; its effect occurrence projection is adapter-decided. The multiple-task projector sorts distinct semantic occurrences independently of engine query order and preserves per-element active-wait multiplicity; repeated live instances of one BPMN element remain rejected because activation-ordinal derivation is outside the bounded profile. A bounded consistency probe captures a generated task ID, completes it, and requires pinned CIB Seven to reject that same host ID after it ceases to be live. A separate schema-valid research probe sends two executions through one Parallel Gateway incoming flow while the other incoming branch remains at a User Task and requires the observed downstream activation recorded by candidate `CIB-DEV-0001`.

Compatible tests reuse one class-owned embedded engine instead of rebuilding the same H2/CIB configuration per test. The shared boundary-error phase-zero fixture still deploys one definition per test and requires zero deployments, runtime Processes, tasks, jobs, incidents, historic Processes, historic Activities, and historic variables before and after every session. Probes that require a distinct engine configuration remain isolated.

PVM definition data remains diagnostic. Generated engine IDs are excluded from canonical identity. Raw state-query, task-query, timer-job, and effect-job snapshots are retained as producer observations. The evidence verifier reconstructs status, waits, open interactions, Process variables, and logical time from them, while binding semantic instance identity to the answer-free start stimulus. Its reconstruction deliberately reuses the adapter's element-ID ordering, profile translation, and constant activation/state/argument rules rather than deriving them independently. Process variables are read from runtime or history only for names introduced by already committed start or completion commands; names from future, rejected, wrong-activation, or stale commands cannot influence an earlier/current observation. Mutations cover Process status, logical time, start and completion Process variables, initial parallel tasks, live siblings after stale completion, and timer deadlines. The CIB wait, scheduler eligibility, due transition, and completion are engine-observed; timer occurrence identity and logical deadline mapping are adapter-derived. The consistency probe supports only the host-identity premise of `CIB-OP-0001`; it is not activation-ordinal evidence. The duplicate-same-flow probe is calibration evidence only: it does not enter the normative balanced target result or production semantic account. Every retained scenario must report a clean projection after teardown, and each bounded probe owns isolated deployment/runtime/history cleanup.

The owner-approved local feedback target for the complete two-release CIB gate is 10–15 seconds with compiled test classes. This is a diagnostic target, not a CI assertion: cold compilation and host contention remain visible rather than being hidden by a relaxed bound. Under competing background CPU work, record POSIX `time -p` `real`, `user`, and `sys`; `real` captures the experienced delay, while `user` and `sys` measure only the gate's process tree and therefore separate repository work from unrelated background CPU. Never compare a new run until an interrupted predecessor's process group is confirmed terminated.

## Canonical CIB observation fidelity

This table classifies the complete current field denominator of `scenario.schema.json#/$defs/stateObservation`: eleven top-level fields plus every nested occurrence, wait, Message subscription, timer, effect, interaction, and variable field. `engine-observed` means the raw producer value comes from pinned CIB deployment/runtime/history state; `adapter-derived` means a deterministic projection transforms retained engine facts; `adapter-decided` means project/profile policy supplies the value without a corresponding CIB semantic fact; and `not-claimed` means the field belongs to the project wire contract but the CIB lane makes no fidelity claim for it. A parent and child may differ because a composite collection or identity can mix observed, derived, decided, and unclaimed components.

| Canonical field path | Fidelity | Exact basis |
|---|---|---|
| `kind` | `not-claimed` | Canonical wire discriminator |
| `instanceId` | `not-claimed` | Scenario-supplied semantic identity, never a generated CIB Process-instance ID |
| `status` | `adapter-derived` | `running` or `completed` from retained public Process-instance query count |
| `activeWaits` | `adapter-derived` | Merge, semantic-kind rank, and Unicode element-ID sort over retained task/timer/effect facts; the retained CIB cases have no Message wait |
| `activeWaits[].elementId` | `engine-observed` | Task definition key or job-definition Activity ID |
| `activeWaits[].kind` | `adapter-derived` | Classification by the engine collection and admitted host relation |
| `activeWaits[].multiplicity` | `adapter-derived` | Count of retained live facts after unsupported repeated timer/effect identities are refused |
| `openUserTasks` | `adapter-derived` | Canonical projection and sort over retained public task-query rows |
| `openUserTasks[].id` | `adapter-derived` | Composite semantic occurrence identity |
| `openUserTasks[].id.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `openUserTasks[].id.elementId` | `engine-observed` | Public task definition key |
| `openUserTasks[].id.activation` | `adapter-decided` | Constant singleton ordinal `1`; repeated live elements are refused |
| `openUserTasks[].name` | `engine-observed` | Public task name, including `null` |
| `openUserTasks[].state` | `adapter-decided` | Canonical `active` stamp for rows returned by the live-task query |
| `openMessageSubscriptions` | `not-claimed` | The Message capsule has no CIB target; every retained CIB projection is explicitly empty |
| `openMessageSubscriptions[].id` | `not-claimed` | No retained CIB Message-subscription projection |
| `openMessageSubscriptions[].id.processInstanceId` | `not-claimed` | No retained CIB Message-subscription projection |
| `openMessageSubscriptions[].id.elementId` | `not-claimed` | No retained CIB Message-subscription projection |
| `openMessageSubscriptions[].id.activation` | `not-claimed` | No retained CIB Message-subscription projection |
| `openMessageSubscriptions[].channel` | `not-claimed` | No retained CIB Message-subscription projection |
| `openMessageSubscriptions[].channel.kind` | `not-claimed` | No retained CIB Message-subscription projection |
| `openMessageSubscriptions[].channel.interfaceId` | `not-claimed` | No retained CIB Message-subscription projection |
| `openMessageSubscriptions[].channel.interfaceOperationId` | `not-claimed` | No retained CIB Message-subscription projection |
| `openMessageSubscriptions[].channel.messageId` | `not-claimed` | No retained CIB Message-subscription projection |
| `openTimers` | `adapter-derived` | Canonical projection and sort over retained timer-job rows |
| `openTimers[].id` | `adapter-derived` | Composite semantic timer occurrence identity |
| `openTimers[].id.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `openTimers[].id.elementId` | `engine-observed` | Public job-definition Activity ID |
| `openTimers[].id.activation` | `adapter-decided` | Constant singleton ordinal `1`; repeated live elements are refused |
| `openTimers[].deadlineMs` | `adapter-derived` | Retained job due date relative to the controlled engine epoch |
| `openEffects` | `adapter-decided` | A CIB async-before job is only a host-realization fact, not an engine semantic effect intent |
| `openEffects[].id` | `adapter-decided` | Profile-owned projection to a semantic effect occurrence |
| `openEffects[].id.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `openEffects[].id.elementId` | `engine-observed` | Public job-definition Activity ID |
| `openEffects[].id.activation` | `adapter-decided` | Singleton host-job count projected as ordinal `1` |
| `openEffects[].descriptor` | `adapter-decided` | Profile registration maps retained raw source binding to neutral identity |
| `openEffects[].descriptor.protocol` | `adapter-decided` | Profile-registered opaque protocol identity |
| `openEffects[].descriptor.operation` | `adapter-decided` | Profile-registered opaque operation identity |
| `openEffects[].arguments` | `adapter-decided` | The only ordinary CIB effect profile stamps the approved payload-free list |
| `openEffects[].arguments[].name` | `not-claimed` | No retained ordinary CIB effect wait exposes a nonempty semantic argument |
| `openEffects[].arguments[].value` | `not-claimed` | No retained ordinary CIB effect wait exposes a nonempty semantic argument |
| `openEffects[].arguments[].value.kind` | `not-claimed` | No retained ordinary CIB effect wait exposes a nonempty semantic argument |
| `openEffects[].arguments[].value.value` | `not-claimed` | No retained ordinary CIB effect wait exposes a nonempty semantic argument |
| `variables` | `adapter-derived` | Canonical type projection and Unicode name sort over retained Process-variable runtime/history rows selected only by names from already committed start or completion commands |
| `variables[].name` | `engine-observed` | Historic Process-variable name within the adapter-selected committed-name boundary |
| `variables[].value` | `adapter-derived` | Raw nullable string projected into the canonical discriminated value |
| `variables[].value.kind` | `adapter-derived` | `string` or `null` selected from the raw host value |
| `variables[].value.value` | `engine-observed` | Exact host string when the value is non-null |
| `enabledInteractions` | `adapter-derived` | One completion interaction per retained live User Task |
| `enabledInteractions[].kind` | `adapter-decided` | Project command vocabulary selects `completeUserTaskInstance` |
| `enabledInteractions[].subscriptionId` | `not-claimed` | No retained CIB Message-delivery interaction |
| `enabledInteractions[].subscriptionId.processInstanceId` | `not-claimed` | No retained CIB Message-delivery interaction |
| `enabledInteractions[].subscriptionId.elementId` | `not-claimed` | No retained CIB Message-delivery interaction |
| `enabledInteractions[].subscriptionId.activation` | `not-claimed` | No retained CIB Message-delivery interaction |
| `enabledInteractions[].channel` | `not-claimed` | No retained CIB Message-delivery interaction |
| `enabledInteractions[].channel.kind` | `not-claimed` | No retained CIB Message-delivery interaction |
| `enabledInteractions[].channel.interfaceId` | `not-claimed` | No retained CIB Message-delivery interaction |
| `enabledInteractions[].channel.interfaceOperationId` | `not-claimed` | No retained CIB Message-delivery interaction |
| `enabledInteractions[].channel.messageId` | `not-claimed` | No retained CIB Message-delivery interaction |
| `enabledInteractions[].taskId` | `adapter-derived` | Reuses the projected User Task occurrence |
| `enabledInteractions[].taskId.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `enabledInteractions[].taskId.elementId` | `engine-observed` | Public task definition key |
| `enabledInteractions[].taskId.activation` | `adapter-decided` | Same unsupported singleton ordinal as the projected User Task |
| `logicalTimeMs` | `adapter-derived` | Retained controlled engine-clock reading relative to the fixed logical epoch |

Retained `stateQueries` bind canonical status, logical time, and the bounded Process-variable projection to raw public runtime/history queries and the controlled engine clock. The projector's set of eligible variable names is derived only from start or completion commands after the runner observes their committed semantic outcome; this prevents scenario look-ahead and rejected-command leakage while leaving each retained name and raw nullable value engine-observed. Task, timer, and effect snapshots continue to bind the five wait/interaction collections. `kind` remains schema-guarded, while every semantic instance component is checked against the answer-free start stimulus rather than a generated host ID. The verifier deliberately shares the Java projector's projection rules, so it establishes raw-to-canonical consistency and is not a third independent semantic producer.

The neutral layer repair did not increase source-binding independence. Lean independently recomputes and checks neutral checked-graph-to-program lowering. The raw Camunda binding to neutral protocol/operation translation is performed by the shared source/profile projection and rechecked by the CIB raw-binding mutation; Lean does not derive that translation from source bytes.

## Current Temporal gate

```sh
./scripts/pnpm.sh run test:temporal
```

The gate starts fresh in-memory Temporal servers, compiles exact BPMN before Workflow start, and runs the semantic-lifetime Workflow over the retained sequential, parallel, Intermediate Catch Timer, Timer/User Task composition, Intermediate Catch Message, Service Task, data-mapping, boundary-error, Simple Boolean Exclusive Gateway, ordinary embedded Sub-Process, and Sub-Process Error-propagation probes. It checks separate semantic and host-capability admission with typed pre-start rejection, the shared Workflow-safe typed-tuple encoder, fixed existing Process-address/Update/timer encodings and digests, deterministic SHA-256 known-answer vectors across padding boundaries, supplementary-plane UTF-8, a multi-block native-crypto cross-check outside Workflow code, content-bound Update and timer command IDs, collision-resistant Process-address Workflow IDs, duplicate logical delivery, accepted-handler draining, typed adapter lifecycle results, retained-Update-first recovery, Query evidence reconciliation, durable timer and Message Signal history, and replay before cleanup. The ordinary disposable test host compiles its Workflow bundle once per Node process and passes that exact bundle to initial Workers, replacement Workers, and replay Workers; a focused concurrent-request guard prevents duplicate builds, and successful Webpack progress is suppressed while compilation errors remain visible. The production external runtime and each bypass mutation retain separate bundle ownership because they are different consumers or deliberately different Workflow programs. A focused product-runtime witness loads the maintained accepted command config, starts the server only as test infrastructure, points the production command orchestration at its published address, polls an explicit caller-owned task queue, starts the compiled Process, reports the stable canonical wait, reads one exact selected-input User Task detail, observes that the same sole task remains active across a real host delay, submits configured form values through Update ingress, and reports the completed receipt before orderly shutdown. Dependency-free command tests prove exact config validation, pnpm argument forwarding, typed unsupported-model rejection, and zero connection attempts on source rejection. Pure actor tests refuse zero/multiple/changing tasks and malformed or widened configuration. The production runtime, command, and dummy actor never start a server or bind a port.

The sequential exact completion submits canonical string/null Process-variable bindings, requires the committed result, terminal Query state, and completed receipt to retain the same merged bindings, and replays the history. The sequential stale schedule awaits the completed receipt before submitting the distinct stale command. The gate requires CIB Seven, Lean, and the pure core to retain exact semantic rejection, Temporal to agree exactly through semantic completion, and the adapter to return `processClosed` separately. The parallel live-sibling schedule completes A and then repeats A while B remains active, requiring exact four-target semantic rejection. A retained concurrent same-occurrence race asserts one committed and one rejected result with identical final state without pinning the winner. Complete User Task Update identity includes the entire canonical submitted patch, so reuse under changed data reaches the identity-conflict boundary. A separately bundled completion-data bypass fabricates the final variables outside the core and omits the core command result; durable Query/Update reconciliation rejects it even though the terminal state alone was forged to match.

The Workflow must enqueue its admitted start stimulus before registering externally addressable handlers. Update handlers may run as soon as they are registered, including during replay after Worker restart; the focused restart witness guards against completion overtaking start. The harness-only post-completion Query trace must reconcile every completion-command outcome with its completed Update result in Event History and its terminal state with the validated completed receipt. A failed Update is classified as harness infrastructure failure rather than parsed as a malformed semantic outcome. The start command is excluded from durable Update-result reconciliation because it is a Workflow argument rather than an Update. Intermediate Query state remains independently checked against the core and does not become the production observation API.

For the timer capsule, the runner validates but never delivers the scenario's explicit `fireTimer` stimulus. The Workflow derives the identical stimulus only from committed `openTimers` state, schedules the exact remaining duration, and records one matching timer-started/timer-fired pair. The mandatory full-server witness stops the Worker before the due boundary, waits beyond due time without a poller, starts a replacement Worker, reconciles the completed receipt and history, and replays the history. A separately bundled mutation bypasses `Workflow.sleep`; the pure result stays equal while the durable-history assertion fails.

For the Timer/User Task composition, the runner waits for host-driven Timer progress before delivering the later User Task completion, but preserves immediate negative delivery for wrong/stale User Task scenarios that have no preceding host-driven stimulus. The focused witness requires exact core agreement, one durable Timer pair, the later open User Task, completion through Update ingress, and live replay.

For the Intermediate Catch Message capsule, the Signal handler only validates, records, and enqueues well-formed delivery; the main loop alone calls the core. The focused primary witness accepts a wrong-channel Signal as transport but returns semantic rejection, stops the Worker, accepts the exact Signal, restarts the Worker, observes the committed delivery and later User Task, proves stale and exact-duplicate behavior, records a conflicting-identity request failure without a Workflow Task failure, completes the Process, reconciles the ordered receipt ledger, requires five exact Signal payloads, fails a seeded payload substitution, and replays the history. The reverse User Task/Message order supplies independent host execution and replay under the same passive-ingress capability. Malformed input fails before Signal submission.

The optional `test:timer-time-skipping` command runs the same exact timer result and durable-history assertion on Temporal's time-skipping test server. It is calibration only and is excluded from `verify.sh`; it cannot replace or weaken the full-server duration, Worker absence, history, replay, or cleanup evidence.

The focused Service Task refinement witnesses derive the Activity request and content-bound completion only from committed `openEffects` state. They lock the exact two-attempt timeout/retry policy, one-invocation plain success, two-invocation/one-mutation fail-after-mutation reconciliation, two-instance shared-store separation, field omission and host-over-inclusion mutations, typed exhaustion with unchanged committed intent, Worker replacement after start-to-close expiry, live replay, and a separately bundled inline-bypass mutation that preserves the pure trace but lacks Activity history. The CreateDocument witnesses extend that same boundary with immutable typed arguments and one typed local result patch, require semantic-core output mapping to the final Process variable under retry and Worker replacement, and retain an Activity-bypass mutation whose final semantic result remains equal while durable evidence fails. The pinned server summarizes a successful retry as one final `ActivityTaskStarted` with `attempt: 2` and `lastFailure`; probe-service invocation evidence independently observes both attempts.

The boundary-error witnesses carry the business error as a successful typed Activity result rather than an Activity failure. The Workflow derives `completeEffect` from committed intent, the core selects the exact route and null mapping, caller delivery completes the resulting User Task, and the primary history replays. A returned unmatched code becomes typed adapter failure without retrying the completed Activity. An `ApplicationFailure` never opens the boundary route, and the separately bundled Activity-bypass mutation must preserve the canonical semantic result while failing the durable Activity-history assertion.

The Simple Boolean Exclusive Gateway witness starts the standards-profile Process, observes only `Task_First`, completes that occurrence, reaches semantic completion, and replays the live history without an evaluator Activity or expression-specific Temporal Event. A separately bundled schema-valid Workflow mutation swaps the two conditional routes while leaving the conditions intact; it exposes `Task_Second` at the public observation boundary and proves that bypassing the semantic core's selected route is detectable. Worker-restart safety is inherited from the existing User Task wait/Update mechanism and its focused restart witness because the gateway adds no durable host mechanism.

The ordinary embedded Sub-Process witness exposes the two child User Tasks through the existing passive Update mechanism, completes the first, replaces the Worker, recovers that accepted result, and proves that the sibling remains live while the outer task remains absent. Completing the sibling makes the child region quiescent, emits one outer continuation, and permits the trailing User Task and root completion. The history replays and contains zero Signals, Timers, Activities, Child Workflows, or cancellation events. A separately bundled scope-bypass mutation uses the real first core completion and then fabricates the outer continuation outside the core; the retained Update/state relation rejects it because the genuine observation still contains the sibling.

The Sub-Process Error-propagation witness commits Trigger Error through the existing passive Update mechanism, stops the Worker immediately after the core's atomic throw/catch/cancel closure, and requires a replacement Worker to recover both the accepted Update result and the Recover-only wait set. A fresh stale Sibling Work Update is then rejected without changing Recover, Recover completes the Process, and the history replays with zero Signals, Timers, Activities, Child Workflows, or cancellation events. A separately bundled bypass fabricates the identical post-cancellation prefix without invoking the core; because it retains pre-throw semantic state, the next stale Sibling Work Update durably commits and creates a canonical suffix that differs from the genuine rejection and preserved Recover state.

No Event History fixture is committed. No legacy IR reader, Workflow patch branch, or format migration path exists during pre-release. The pre-release infrastructure guard locks this policy.

When the owner approves the first immutable deployment/history baseline, retained histories and compatibility paths must be introduced through red replay tests with explicit provenance, version markers, support windows, and removal criteria.

## Complete differential/refinement pipeline

```sh
./scripts/pnpm.sh run test:pipeline
```

The pipeline:

1. builds the source importer, Lean emitter, CIB test boundary, TypeScript core/comparator, and Temporal adapter;
2. loads every registered answer-free scenario and content-bound CIB evidence only for scenarios whose declared target set includes CIB;
3. compiles the exact BPMN bytes once per source/profile identity;
4. starts one clean Temporal server and Worker;
5. writes the actual checked graph and Semantic Process program for each retained scenario to a private definition-input batch;
6. groups every CIB-backed case by exact release and runs each release batch, runs the raw-only CIB Service Task fail-once execution only against `2.2.0`, emits one Lean result and executes the pure core once per registered scenario, and runs two isolated Temporal Workflows per scenario; the two executions for each effect schedule-substitution case and the two plain boundary-error executions are serialized because their probe stores are intentionally per execution, while ordinary Workflows remain batched;
7. requires Lean's decoded-and-echoed scenario to equal the admitted scenario document and injects an extra answer field that the strict Lean decoder must reject; because Lean consumes the admitted file directly, retained CIB content binding rather than a second compiled scenario copy detects disk-content drift;
8. requires Lean's echoed definition identity and lowering-equality result to match the admitted artifacts;
9. mutates one operation origin without making the program structurally invalid and requires Lean to reject the program as unequal to its lowering;
10. compares every target by scenario identity under its explicit relation: exact semantic relations for the existing bounded cases; the sequential-stale Temporal prefix plus separate `processClosed`; exact Lean/core/Temporal semantic agreement plus separate synchronous CIB final-state host relations for CreateDocument and boundary error; exact four-target agreement for the four ordinary embedded Sub-Process schedules under `CIB-AGR-0007`; Error-propagation recovery lifecycle under `CIB-AGR-0008` plus stale host-task refusal mapping under `CIB-OP-0001`; Lean/core/Temporal agreement with CIB explicitly absent for Simple Boolean and Intermediate Catch Message; and no false CIB claim for semantic effect intent, typed result, Message subscription, or project-language truth;
11. compares fresh CIB output with retained CIB evidence;
12. checks exact Query/Update evidence, duplicate delivery, isolated Workflow equality, and clean CIB state;
13. mutates the observed activation ordinal in sequential cases, omits one initial parallel open task, drops the live sibling after stale A, changes the timer deadline, changes the Message subscription channel, substitutes the selected Simple Boolean branch, changes the Service Task operation, changes the CreateDocument final Process variable, changes the boundary-error mapped null to a string, exits the child scope before its sibling completes, substitutes the Error route, retains the canceled Error sibling, changes the stale-Error state, and requires exact disagreement paths; each comparator mutation is applied to an immutable clone of the semantic core's canonical result before comparison, while the gateway route substitution, Message Signal payload substitution, scope bypass, and Error-propagation bypass are also exercised at the Workflow definition/history boundary; raw-to-canonical CIB evidence projection remains separately exercised by verifier-side mutations in the contract gate;
14. erases the parallel control-place Sequence-Flow provenance while preserving structural validity and requires Lean's lowering-equality gate to reject it;
15. replays every primary live history plus the Service Task and CreateDocument failure-schedule histories;
16. shuts down the Worker/server and removes temporary files.

### Effect schedule substitutions

The [Service Task effect spec](capsules/SERVICE-TASK-EFFECT-SPEC.md) and [CreateDocument data spec](capsules/CREATE-DOCUMENT-DATA-SPEC.md) each retain one answer-free semantic scenario while substituting that case's ordinary second plain Temporal isolation execution with `FailAfterMutationOnce`. Each pair uses separate stores that are asserted empty and produces identical canonical results, so isolation remains checked while the substituted run adds retry/reconciliation evidence.

The matrix dimensions are derived from the guarded catalogs: one Lean and core execution, two isolated Temporal executions, and one primary replay per registered scenario, plus one retry replay for each configured effect-schedule substitution. CIB executes exactly the cases with registered CIB evidence using `PlainSuccess` for content-bound comparison and executes `FailAfterMutationOnce` separately only for the payload-free Service Task's raw retry/re-execution facts; it does not execute or retain expected evidence for standards-only cases. Each CIB execution uses fresh test-local state and computes no project transport key. The boundary-error scenario uses two plain, per-execution-isolated Activity executions because its purpose is typed-result refinement rather than retry substitution; only its primary history is replayed. Retained CIB evidence binds explicitly to each ordinary plain-success host execution. The adapter-local two-semantic-instance/shared-store key discriminator remains outside the scenario matrix because it exercises a non-canonical adapter rendering with no Lean or CIB consumer.

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

`scripts/pre-release-architecture.test.ts` prevents active code from reintroducing:

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
| Seeded mutation | Comparator-side mutations (applied to a clone of a target's canonical result) establish that the comparator detects one claimed field distinction; verifier-side mutations (applied to retained raw producer observations) establish that the raw-to-canonical evidence projection detects it | Projection completeness; a comparator-side mutation establishes nothing about the evidence projection |

No agreement vote resolves a source disagreement. Classify mismatches against the standard, profile, CIB configuration, observation boundary, and evidence before changing semantics.

The CIB evidence owner must classify every field of `scenario.schema.json#/$defs/stateObservation` and every nested occurrence, wait, timer, effect, and variable field as `engine-observed`, `adapter-derived`, `adapter-decided`, or not claimed. The classification follows the complete schema rather than a prose field count and explicitly includes activation, multiplicity, lifecycle state, and timer deadline. A raw observation may be added only when the pinned engine exposes the fact. A verifier that reuses producer projection rules remains a raw-to-canonical consistency check and does not become another independent evidence lane.

## Independent cold-review gate

A document is material for this gate when it selects or changes BPMN meaning, a semantic profile or CIB relationship, checked-source or Semantic Process IL representation, runtime or public observation, admission capability, transition family, proof boundary, or Temporal refinement claim. Most such documents are semantic capsules, but cross-cutting root proposals and specifications are governed by the same content rule. Routine implementation cleanup, mechanical correction, and infrastructure work that cannot change one of those claims does not create a review cycle, although an architecture checkpoint may still receive an independent review when the milestone reflection identifies a correlated risk.

Each material proposal-to-specification lifecycle has two mandatory external reviews and one conditional intermediate review:

| Stage | Review target and timing | Required isolation | Boundary |
|---|---|---|---|
| Proposal | One committed proposal after its normative basis, scope, preflight, rules, exclusions, versioning consequences, and owner question are complete | `external-fresh-session` | Before owner approval and implementation |
| Semantic checkpoint | The first committed green checkpoint after a wire/schema, checked graph/IL, runtime/public-observation, admission/profile, transition/proof, scope, cancellation, or concurrency change | `external-fresh-session` or `fork-turns-none` | Before the next implementation lane |
| Closure | One committed implementation and documentation closure after focused/full gates, evidence matrices, epistemic closure, cost record, and exact implemented/absent status are complete | `external-fresh-session` | Before `-PROPOSAL` → `-SPEC` graduation or beginning the next material capsule |

Proposal and closure review are performed like the established external handoff workflow: the author mints a prompt, and the user gives it to an external coding agent in a new session that receives no author chat history, author findings, previous review report, or suggested verdict. A new session with the same service or model is acceptable; the isolation requirement concerns inherited context, not vendor diversity. A warm author thread, a full-history sub-agent fork, or an agent that helped implement the target cannot satisfy either mandatory review.

The conditional semantic checkpoint may use the same external workflow or a sub-agent created with no forked turns. Its prompt must still contain only the objective review contract and exact repository targets. The reviewer learns the implementation from the committed repository, not from an author summary. The current Message-addressed Receive Task checkpoint is an example: the closed channel, source/IL, profile admission, and proof-facing changes make the intermediate review mandatory before profile/evidence/Temporal work.

The author must commit the review target and pause writes at the stage boundary. The reviewer works read-only against that immutable commit or exact baseline-to-target range. Parallel agents that could change the reviewed files remain stopped. A correction is committed separately and returned to the same reviewer thread for a correction audit; that audit is intentionally not cold because it must track the original required findings. A correction that changes the selected account, public contract, exclusions, or evidence strategy materially invalidates the review and requires a new fresh-session review of the redesigned stage.

The neutral prompt names the stage, exact target commit and optional baseline, capsule, required owner documents and normative sources, applicable gates, and fixed output contract. It must not disclose the author's diagnosis, preferred verdict, or expected findings. Use this skeleton and specialize only the required-document and claim lists:

```text
Review stage: <proposal | semantic checkpoint | closure>
Target commit: <immutable SHA>
Baseline commit or range: <SHA or not applicable>
Capsule: <relative link/path>

Work read-only. Read the capsule and every listed owner/source document in full, inspect the exact target diff and implementation, and verify material claims against executable evidence. Do not modify files and do not infer implementation from prose.

Required output:
VERDICT: APPROVE | APPROVE WITH REQUIRED EDITS | REJECT
Decisive reason
Findings, each with classification, exact locus, unsupported or violated claim, evidence, and smallest sufficient correction
Claims checked without issue
Common-mode risks and the nearest unsupported claim
```

`APPROVE WITH REQUIRED EDITS` and `REJECT` block the stage. The correction audit in the same reviewer thread must name the correction target and explicitly close or retain every required finding. Advisory findings do not block unless applying one changes the selected account or reviewed boundary. No repository receipt records approval until required findings are closed.

### Review receipt

The governed proposal or specification records a concise receipt rather than copying a chat transcript or full review report:

```markdown
## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `<commit>` or `not-recorded` | `external-fresh-session` or `not-recorded` | `approve`, `approve-with-required-edits`, `reject`, or `pending` | matching audit state |
| Semantic checkpoint | `<commit>` or `not-applicable` | `external-fresh-session`, `fork-turns-none`, `not-recorded`, or `not-applicable` | `approve`, `approve-with-required-edits`, `reject`, `pending`, `not-required`, or `not-reached` | matching audit state |
| Closure | `<commit>` or `not-applicable` | `external-fresh-session`, `not-recorded`, or `not-applicable` | `approve`, `approve-with-required-edits`, `reject`, `pending`, or `not-reached` | matching audit state |
```

Completed review targets and correction audits use 7–40 lowercase hexadecimal Git commit IDs that resolve to commit objects and are ancestors of `HEAD`; a plausible hexadecimal token alone is not an immutable receipt. The required CI workflow therefore checks out full Git history rather than a depth-one snapshot, and the infrastructure guard locks that prerequisite. `approve` and `reject` use `not-required` for their correction audit; `approve-with-required-edits` names the audited correction commit. A new draft proposal may initially use `not-recorded | not-recorded | pending | not-applicable`, because a commit cannot contain its own Git identity; a docs-only follow-up records the immutable proposal target before the prompt is handed off. Other pending stages name their committed target, use `not-recorded` isolation, and use `not-applicable` for the audit. A semantically unnecessary intermediate review uses `not-applicable` in the other three cells and `not-required` as verdict; otherwise it and closure use `not-reached` until their immutable targets exist. The receipt-update commit is not itself the target unless its substantive content is expressly included in the reviewed range.

[`scripts/independent-review-policy.test.ts`](../scripts/independent-review-policy.test.ts) recursively governs active `-PROPOSAL.md` and `-SPEC.md` documents under `docs/` regardless of directory, excluding archived and locally ingested reference material. It requires receipts on every governed proposal and every post-policy specification, reads owner approval from the proposal's required `## Status` section, requires externally approved proposal state before owner-approved status, and requires externally approved proposal and closure states before a post-policy spec can graduate. The exact pre-policy grandfather set is selected and fixed by immutable baseline commit `f1ef362`: active specifications plus the three legacy root proposals present there are grandfathered, while the already-receipted Receive Task capsule proposal is not. An agent or contributor may not extend, append, or rebase that selection rule or its expected membership, and every later specification is post-policy. While the Receive Task semantic checkpoint remains pending, the guard requires its target to remain the plan/map blocker and requires the blocked profile, scenario, CIB runner, differential, and Temporal roots to stay byte-identical to that target regardless of file type or path naming. Source/Lean/core corrections remain possible for the same-reviewer audit; no next-lane work does. Recording approval must delete the capsule-specific pending barrier in the same change, so its provisional path inventory cannot become dead enforcement code.

The executable gate validates repository facts, not the truth of an external UI session. A contributor who records `external-fresh-session` is attesting that the prompt was handed to a context-isolated external agent and that the recorded verdict reflects its report. Branch protection can require the infrastructure gate, but Git cannot cryptographically prove reviewer coldness; review receipts, exact immutable targets, and the no-inherited-context protocol make that remaining trust boundary explicit.

## Capsule closure review

After the full gate is green, independently review:

- exact established and nearest unsupported claims;
- possible shared flawed fixture, interpretation, projection, or calibration source;
- whether observations depend only on admitted state and explicit inputs;
- nearest realistic counterexample and checked non-law;
- usefulness and hypotheses of Lean laws;
- whether every prose quantifier is backed by a quantified theorem or an explicit exhaustive enumeration rather than a finite fixture or representative permutation;
- independence of BPMN, CIB, Lean, TypeScript, and Temporal claims;
- version/history policy and meaningful mutation coverage, including whether each named mutation describes the actual injected defect and reaches a public or durable discriminator instead of stopping at an indistinguishable prefix;
- duplicated builds, cleanup, harness coupling, dominant timing, document placement, stale status, and removable complexity.
- the capsule's baseline and closure commits plus reproducible nonblank code and documentation churn recorded in the [capsule cost ledger](CAPSULE-COST-LEDGER.md); compare those two measures with the nearest completed capsule and do not substitute an impression of wall time.

Count nonblank added and removed lines from the commit-bounded capsule diff, classify hand-written Lean/TypeScript/Java/JavaScript as code and Markdown as documentation, and record both `+added/-removed` figures. The dependency-free measurement command is `node scripts/capsule-cost.ts <baseline-commit> <closure-commit>`; its parser and blank-line exclusions are infrastructure-tested. If explicit start and closure timestamps were retained, elapsed time may be recorded separately; otherwise mark it unknown and do not reconstruct it from commit dates. A capsule cannot close from an uncommitted mixed worktree because its cost boundary would not be reproducible.

Every escaped issue becomes either a reusable review question or an executable guard.
