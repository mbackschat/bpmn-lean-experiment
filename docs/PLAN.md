# Plan

This document owns the current checkpoint, ordered next work, unresolved decisions, and exact resume point. Durable architecture belongs in [PROJECT-DESIGN.md](PROJECT-DESIGN.md); exact supported and absent surfaces belong in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md); test procedure belongs in [TESTING-SPEC.md](TESTING-SPEC.md).

## Current checkpoint

The hygiene review work is implemented: the differential harness declares and uses its Temporal adapter development dependency, `CLAUDE.md` contains only durable Mission guidance, portable Java 21 resolution replaces the Homebrew-only default, and the approved Ubuntu/macOS verification workflow preserves the existing feedback budgets.

The approved [production Temporal lifecycle](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) is implemented without a finite scenario-count lifetime or compatibility branch. It uses a semantic Process address, content-bound Update identity, retained-Update-first result resolution, adapter-owned lifecycle results, accepted-handler draining, explicit schedules, replay, and cleanup.

The sequential stale case now records the honest target relation: CIB Seven, Lean, and the TypeScript core retain semantic rejection; Temporal agrees through completion and returns adapter-owned `processClosed` for the explicitly post-terminal command. The parallel live-sibling stale case supplies exact four-target semantic rejection while the Process remains addressable, and the concurrent reversal is retained as an unordered one-commit/one-rejection race witness.

Harness-only Query extraction reconciles completion-command outcomes with completed Update results in Event History and the terminal state with the completed receipt. Failed Updates are named infrastructure failures, the start command is explicitly outside Update-result reconciliation, and intermediate Query observations remain independently compared with the pure core.

Lean now strictly decodes the same eight answer-free scenario documents consumed by the other targets and echoes the decoded values. The extra-field mutation guards answer smuggling; retained CIB content binding owns disk-content drift detection now that there is no compiled Lean scenario copy.

The exact implementation and absence boundary, including the incomplete standalone Lean `programWellFormed` obligations, is recorded in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md). The checked-source experiment ended not adopted at its approved effort boundary with a provisional source account and discriminator retained; that successful stop outcome is frozen under explicit non-extension and reopening rules.

The approved [Intermediate Catch Timer specification](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md) is implemented under its exact `PT1S` account. The checked graph retains the literal for independent Lean normalization; the IL, Lean relation/evaluator, semantic core, controlled-clock CIB runner, and Temporal adapter implement the same timer occurrence and exact-deadline firing. CIB proves pre-due ineligibility and due-time eligibility before execution. Temporal derives the content-bound firing exclusively from committed core state, durably waits while the Worker is absent at the due boundary, completes after Worker replacement, and replays one exact timer pair. The eight-case differential pipeline and retained deadline/bypass mutations preserve the capsule's required evidence. The time-skipping lane remains optional because the full local-server witness is the mandatory refinement gate.

The family-level [CIB Seven extension research](research/CIB-SEVEN-EXTENSIONS-RESEARCH.md) shows that Service Task source binding, project handler registration, JUEL/beans, Java delegate APIs, scripts, FEEL, and external-task protocols are distinct compatibility claims. The owner-approved [compatibility scope proposal](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) selects the exact bounded handler pair. The [dual semantic-core architecture proposal](DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md) is owner-rejected because no non-Temporal JVM semantic-execution product exists; the single TypeScript semantic core and Workflow remain the production account, with JVM code behind Activity Worker or client-façade boundaries. The [Service Task effect spec](capsules/SERVICE-TASK-EFFECT-SPEC.md) closes namespace-aware checked-source admission and lowering, the shared occurrence/descriptor/`openEffects` contract, Lean and TypeScript semantic behavior, core-owned transport material, domain-separated adapter identities, Activity execution from committed intent, retry reconciliation, typed exhaustion, Worker replacement, bypass detection, cross-instance separation, ordinary CIB execution, content-bound evidence, and live replay. CIB's phase-zero and ordinary runner derive activity/protocol/handler fields from deployment state, reject independent protocol and handler perturbations, retain the adapter-decided activation classification, and expose retry decrement only as raw host evidence.

The driving product goal is recorded in [PROJECT-DESIGN.md](PROJECT-DESIGN.md): replace A12 Workflows `release/2025.06`, the main A12 Process product layered on CIB Seven, rather than one representative downstream application. The [A12 Workflows compatibility ledger](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) defines 62 physical and 50 distinct exact-byte BPMN models, the maintained extension/delegate/API surface, and the A12 Full Stack Project Template as the canonical downstream blueprint. The current bounded compiler admits 0 of those 50 models unchanged. Typed variables and mappings, the exact target expression subset, bean-token Service Task admission, `BpmnError`, a Java-friendly delegate bridge, task/message façades, and a materialized Workflows-enabled template integration are now target-backed priorities. The rejected-core review's wire exactness findings remain implemented through JavaScript-safe integers, language-neutral identifier ordering, and strict JSON edge behavior.

The [CIB Seven 2.0 A12 target baseline](research/CIB-SEVEN-A12-BASELINE-RESEARCH.md) keeps the A12-used `2.0.0` release distinct from the current `2.2.0` oracle profiles. The exact successful `CreateDocument` delegate-expression, string mapping, public delegate, and EL seam is source-identical across the tags, and seventeen of eighteen current packaged-oracle tests passed under a temporary `2.0.0` dependency override; the sole failure was the intentional committed `2.2.0` profile-version diagnostic. The broader engine has material configuration, scripting, serialization, database, and persistence changes, so no general equivalence follows. The owner-facing [CreateDocument data and mapping proposal](capsules/CREATE-DOCUMENT-DATA-PROPOSAL.md) now asks for the smallest distinct `2.0.0` target profile, string-only Process/Activity-local variable account, literal/simple-reference mappings, typed local effect patch, success-only transaction refinement, and license-safe exact-source evidence strategy.

The substantial pipeline, contract-artifact, retained-evidence replacement, Java-resolution, strict-JSON, and bounded-process harnesses now execute directly from TypeScript under Node 24. A mandatory strict no-emit gate resolves workspace packages to their source trees rather than ignored build output. Direct MIT-licensed Node declarations provide the host API types; their type-only `undici-types` dependency adds no runtime component. Small package tests and calibration/documentation utilities remain JavaScript where direct TypeScript would add extension churn without a material boundary check.

The source-hygiene root fix is implemented. The former 1800-line Temporal runner, 1600-line differential harness, oversized contract artifact owners, 900-line Temporal test, 690-line CIB runner, and monolithic Semantic Process Lean module are split by lifecycle or semantic responsibility. A dependency-free default gate now checks tracked and pending Lean, TypeScript, JavaScript, and Java source before commit, rejects files above 1000 nonblank lines, requires owner review above the 600-line target, and keeps the two Lean umbrella modules import-only. Every current hand-written source is at or below 600 nonblank lines and there are no reviewed exceptions.

The `../oss` root has been inspected and the project-created external research checkouts are explicitly navigable from [SOURCES.md](SOURCES.md). Unknown or unregistered repositories and folders are ignored. A12 Workflows is the product replacement target, A12 Full Stack Project Template is its canonical downstream blueprint, `cibseven/cibseven` is the pinned engine oracle, and the remaining registered trees are standards, SDK, corpus, or semantic-workbench references.

The active implementation boundary is [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).

## Last verified baseline

The complete repository gate passed on 2026-07-27 through `/opt/homebrew/bin/gtimeout 60 ./scripts/verify.sh` with no pnpm layout override. The first sandboxed attempt reached the focused Temporal tests after every preceding suite passed, then failed only because ephemeral-server creation was denied; the identical command passed with local-server permission and no source change. The green gate included the strict no-emit harness check against workspace source; four source-hygiene guards over tracked and pending source, both exact Lean umbrellas, the 600-line review target, and the 1000-line ceiling; twenty contract tests; the Lean gate plus thirty-seven semantic-core tests; seventeen BPMN-source tests; eighteen packaged-CIB `2.2.0` tests; nine differential unit tests; thirty-eight infrastructure guards including the bare-pnpm configuration regression; and thirty-three focused Temporal tests. The eight-case prepared pipeline executed through the responsibility-split direct `.ts` orchestrators in 5.437 seconds warm, inside the unchanged 15-second budget, with sixteen isolated Temporal executions and nine replayed histories.

The complete Service Task capsule gate passed on 2026-07-27. `./scripts/verify.sh` passed twenty contract tests, the Lean gate plus thirty-seven semantic-core tests, seventeen BPMN-source tests, eighteen packaged-CIB tests, nine differential unit tests, thirty-three infrastructure guards, and thirty-three focused Temporal tests in 12.887 seconds. The eight-case prepared pipeline completed in 6.001 seconds warm, ran sixteen isolated Temporal executions, replayed nine live histories, matched all current CIB executions with content-bound retained evidence, retained the raw-only CIB retry witness, and rejected the effect-handler, timer-deadline, parallel-provenance, scenario-answer, definition-origin, timer-bypass, and Activity-bypass mutations. The explicit Service Task evidence replacement added only the new scenario envelope; the seven prior envelopes remained byte-identical.

The first Service Task semantic checkpoint passed independent review and the complete repository gate on 2026-07-27. `test:contracts` passed nineteen tests, `test:bpmn-source` passed seventeen tests, `test:semantic` passed the Lean gate plus thirty-six semantic-core tests, the focused CIB gate passed sixteen tests, `test:differential` passed nine tests, and `test:infrastructure` passed thirty-two guards. The focused Temporal regression passed twenty-two tests in 6.962 seconds after the sandbox-denied local-server attempt was rerun with permission. The complete gate passed the same focused suites and the seven-case live pipeline in 6.665 seconds warm, with fourteen isolated Temporal executions, seven replayed histories, exact current CIB/retained-evidence agreement, and all existing mutations green. `lake build checkCheckedSourceRelationExperiment` and `lake exe checkCheckedSourceRelationExperiment` also passed after the frozen experiment gained only explicit unsupported/rejected cases for the new Service Task/effect variants and the required empty `openEffects` field; its five-operation source semantics were not extended. The seven existing retained CIB envelopes were regenerated only through `replace:cib-evidence` for the atomic empty-`openEffects` contract evolution. No Service Task Activity/refinement behavior was present in these gates.

The adapter-local Service Task transport and probe-store unit passed `test:semantic-core` with thirty-seven tests and the focused Temporal gate with twenty-eight tests in 7.214 seconds on 2026-07-27. The first sandboxed Temporal attempt was denied local-server creation and the identical command passed after permission was granted. Fixed typed encodings and digests, every definition/occurrence/descriptor field, the four retained omission mutations including `processId`, ordinary store isolation, two-instance shared-store separation, fail-after-mutation reconciliation, and host-derived over-inclusion are green. No Activity was scheduled by this checkpoint.

The focused Service Task Temporal refinement gate passed thirty-three tests in 14.216 seconds on 2026-07-27. It scheduled the Activity exclusively from committed intent, preserved canonical equality across plain and fail-after-mutation schedules, reconciled two invocations to one mutation, replayed both successful histories, kept two semantic instances distinct in one shared store, survived Worker replacement after a timed-out first attempt, failed exhausted attempts as `BPMN_EFFECT_EXECUTION_EXHAUSTED` with the active intent unchanged, and rejected the inline Activity-bypass mutation through durable history. The replacement completed within the approved ten-second schedule-to-close envelope. The pinned server records the successful retry as one final started event with attempt `2` and `lastFailure`; probe evidence independently records both invocations.

The first sandboxed verification attempt reached the focused Temporal gate but the environment denied creation of its local ephemeral server with `Operation not permitted`. Re-running the identical gate with local-server permission passed; no source or fixture changed between those attempts.

The separately gated C2 experiment passed `lake build checkCheckedSourceRelationExperiment` and `lake exe checkCheckedSourceRelationExperiment`. That gate establishes the retained direct source account and mutation discriminator only; it does not establish the unresolved observational lowering-preservation theorem.

In the final complete gate, the prebuilt seven-case pipeline completed in 5.775 seconds warm, ran fourteen isolated Temporal executions, replayed seven primary histories, and rejected the definition-origin, scenario-extra-field, parallel-provenance, timer-deadline, and durable-timer-bypass mutations. The separately measured build-inclusive pipeline completed in 4.996 seconds warm and 6.536 seconds cold, inside the unchanged 15-second and 45-second budgets. The focused Temporal gate passed twenty-two tests in 7.202 seconds, including the new canonical-encoding/SHA locks, failed-Update infrastructure classification, Worker restart, retained result lookup, the unordered command race, Worker absence at the timer due boundary, durable-timer history, bypass detection, and live replay. The separately named optional time-skipping calibration last passed in 7.989 seconds and remains outside default verification.

## Approved decisions

The owner approved the following on 2026-07-26:

- **Parallel meaning:** implement normative BPMN per-incoming-Sequence-Flow fork/join behavior under the approved bounded capsule.
- **CIB relationship:** retain `CIB-DEV-0001` as a visible candidate deviation; do not expand the current CIB profile to claim parallel compatibility.
- **Representation:** share the checked BPMN graph and Semantic Process program, while allowing Lean and TypeScript to use asymmetric internal runtime representations.
- **Definition boundary:** lower exact admitted source through a checked project-owned BPMN graph to the bounded Semantic Process IL; do not extend the topology-specific executable IR.
- **R5 — Temporal semantic-policy ownership:** completed by moving current-state task projection, stimulus well-formedness, command identity, and same-stimulus comparison behind semantic-core-owned operations; the Workflow now delegates instead of scanning trace history or maintaining policy copies.
- **R6 — multiple-task CIB observation:** before canonical parallel CIB evidence, remove the single-active-task guard together with deterministic semantic task sorting and per-element wait multiplicity.
- **R8 — default Temporal history gate:** retain `test:temporal` in `verify.sh` so Update acceptance/completion, zero-Signal, and live-replay assertions remain mandatory.
- **Production Temporal lifecycle:** use the semantic-lifetime Workflow, collision-resistant Process address mapping, content-bound Update identity, retention-bounded accepted-result recovery, typed adapter lifecycle results, and accepted-handler drain rule in [the production lifecycle specification](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md).
- **Production-lifecycle evidence correction:** retain sequential stale rejection as three-way CIB/Lean/core semantic evidence, require Temporal prefix agreement through completion plus a separate adapter-owned `processClosed` result under an explicit post-terminal delivery schedule, and add a parallel live-sibling stale scenario for exact four-target semantic rejection. Keep `UTASK-REFUSE-02`, update both capsule evidence rows, retain the concurrent reversal as an unordered race witness, and reconcile harness-only Query extraction with durable Update results and the completed receipt.
- **C2 — independent checked-source relation experiment:** execute the bounded current-five-operation source token game, renamed positional-lowering divergence witness, and projection-level observational preservation attempt under the owner conditions below. The relation is a transcription-correspondence account for reviewed meaning, not an independent BPMN authority. The experiment ended not adopted at the effort stop; the permanent-proof-boundary alternative remains rejected.
- **C2 freeze:** accept the not-adopted result as the intended stop outcome. Keep the five-operation experiment compiling without extending its source semantics. Reopen only before admission widens beyond the two fixture-pinned topologies, after another fixture-coincidental lowering defect surfaces, or when a future capsule independently needs source-level semantics.
- **C1 next-capsule sequence:** the approved bounded Intermediate Catch Timer and Service Task/Temporal Activity capsules are complete under their exact specifications.
- **Intermediate Catch Timer capsule:** the exact approved `PT1S` account is implemented and graduated to [the specification](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md). The answer-free scenario carries `fireTimer` for Lean, semantic core, and controlled-clock CIB realization; Temporal derives the identical content-bound stimulus exclusively from committed semantic state. Per-rule CIB fidelity labels, quantified full-identity/time refusal, the early-firing non-law, explicit retained-evidence replacement, mandatory full-server durability evidence, and optional time-skipping calibration are retained.
- **D1 sequencing:** defer the optional dependency-free Lean/core fuzz experiment until after the timer preflight is reviewed so it does not delay the dominant adapter-feasibility discriminator.
- **Semantic-core runtime language:** reject a second Java semantic core and retain one TypeScript semantic core hosted by the TypeScript Temporal Workflow. A JVM Worker or Spring/client façade is not a semantic-core consumer. Reopen only for a named non-Temporal embedded JVM product mode that must own and advance semantic Process state in-process.
- **Migration product goal:** optimize the bounded profile and compatibility work for replacing A12 Workflows `release/2025.06` as the A12 product layered on CIB Seven, using defined inventory-based measures for unchanged model admission, unmodified delegate bridging, supported API adaptation, downstream-blueprint integration, and classified migration of the remainder. Do not claim generic drop-in engine compatibility.
- **Cross-language wire hardening:** close the JavaScript-safe integer and strict JSON boundary gaps across current TypeScript and Lean lanes without introducing a Java core or compatibility reader. Canonical identifiers use lexicographic Unicode scalar-value order over well-formed exact strings with no normalization; reject unpaired surrogate encodings and exercise both BMP and supplementary-plane cases.
- **CreateDocument data and mapping capsule:** approve all eight selections in [the proposal](capsules/CREATE-DOCUMENT-DATA-PROPOSAL.md): distinct CIB Seven `2.0.0` target identity; unchanged source; profile-supplied protocol and source handler; string-only Process/Activity-local variables; literal/simple-reference mappings; committed arguments and typed local patch; content-bound argument/result identities; success-only transaction refinement; license-safe external-source evidence; and typed `BpmnError` immediately afterward.

## Current owner decision

The [Service Task effect spec](capsules/SERVICE-TASK-EFFECT-SPEC.md) records the implemented owner decision. Its seven selections remain binding: the success-only account and exclusions; green phase-zero `asyncBefore` delegate-expression binding; namespace-aware admission of exactly two Camunda attributes without general JUEL; `awaitEffect` with shared occurrence identity, committed protocol/handler intent, separate `openEffects`, and adapter-rendered transport key; the exact two-attempt Activity policy and typed adapter failure; separate host schedules with isolated stores and the eight-scenario/sixteen-execution/nine-replay matrix; and the named retry/fault/cancellation/external-task reopen conditions.

Implementation also must name the transport tuple's non-`SemanticProcessIdentity` definition group, retain a `processId`-drop mutation, keep storage constraints outside `EFFECT-INTENT-01`, record the non-independent CIB activation projection, and add a delegate-expression negative control. Stop at the first green Lean/core checkpoint for semantic review before beginning the Temporal lane.

The research corrects three tempting assumptions: CIB Seven retains the Camunda namespace rather than defining `cibseven:*` attributes; the async-continuation job is immediately executable rather than timer-like eligibility-gated; and FEEL is not the language used by CIB Service Task delegate expressions, which use JUEL. Manual public job execution uses the failed-job listener and default retry decrement in both pinned source and packaged `2.2.0` evidence. Exact bean resolution, prefix-independent namespace handling, immediate executability, null due date, deployment-derived binding projection, fail-once retry decrement, and clean public re-execution are locked by the phase-zero probe.

The owner approved the eight selections in [the CreateDocument data and mapping proposal](capsules/CREATE-DOCUMENT-DATA-PROPOSAL.md). Implementation proceeds under its exact scope and stop conditions; no Java Worker, general JUEL, `BpmnError`, failure/rollback equivalence, source redistribution, or new dependency is authorized.

## Approved next-capsule sequence

### C1 — next semantic capsules

**Owner decision:** approved for a timer capsule followed by a service-task Activity capsule. Both capsules are complete under their exact specifications.

**Timer first:** use one bounded `None Start Event → Intermediate Catch Timer Event → None End Event` discriminator with one reviewed literal duration form. The semantic core must own the timer occurrence, logical deadline, readiness, duplicate/stale firing behavior, and public observations. The adapter may translate one typed semantic timer wait into a durable Temporal timer and feed its recorded wakeup back as an explicit typed stimulus; Temporal time must not become implicit BPMN state or decide semantic firing. The mandatory preflight must settle the admitted BPMN timer-expression subset, logical-time input, timer identity, deadline comparison, Workflow completion, duplicate wakeup, Worker restart, replay, and whether the full-server plus time-skipping evidence can remain inside the feedback budgets. The nearest adapter counterexample is deriving the deadline independently in Workflow code or advancing the core merely because a Temporal timer fired.

**Service task second:** the bounded `None Start Event → Service Task → None End Event` discriminator is implemented in the [Service Task effect spec](capsules/SERVICE-TASK-EFFECT-SPEC.md). The semantic core owns the Service Task occurrence, structured effect intent, stable idempotency material, and closed success result while a Temporal Activity remains only the effect executor. Exact finite timeouts and retries, idempotent reconciliation, typed adapter failure on attempt exhaustion, and the boundary between hidden Temporal attempts and CIB-visible retry evidence are fixed; general JUEL, Java API compatibility, supported cancellation recovery, semantic faults, and incidents remain excluded.

**Why this order:** the timer introduces the first durable host Command driven by semantic waiting without also introducing nondeterministic I/O. The Service Task then reuses the proven wakeup/input loop while adding external effects and retry separation. Another pure-topology capsule would exercise the existing Query/Update host composition and would not reduce either risk.

**Authorized next action after checkpoint review:** the assessment and proposal are complete. Obtain owner review of [the CreateDocument data and mapping proposal](capsules/CREATE-DOCUMENT-DATA-PROPOSAL.md). Do not implement the target profile, variable system, expression evaluator, Java Worker, façade, or template integration without the applicable owner decision and dependency approval.

## Deferred assessment

### D1 — seeded Lean/core fuzz lane

**Deferred behind the next adapter-feasibility preflight.** A hand-rolled seeded generator could compare well-formed stimulus sequences over the admitted topologies in batches and report the exact seed on failure. Malformed documents require an explicit per-case admission-result envelope or isolated Lean invocations because the strict Lean decoder currently rejects an entire invocation while the TypeScript core classifies structural admission separately; do not coerce either into a semantic outcome. Estimated cost is 220–340 lines of JavaScript and protocol/test support with no new dependency. Its value compounds as capsules grow, but it is not the nearest Temporal-adapter risk.

## Approved C2 experiment

### Scope and recommendation

Define a declarative token-game relation directly over `CheckedProcess`, in BPMN vocabulary with tokens on Sequence Flows and per-incoming-Sequence-Flow synchronization, then relate its projected observations to the existing Semantic Process execution for every admitted source and supported stimulus sequence. Prove equality of projected public observations after each supported stimulus, not runtime-state equality. The source relation must not use `lowerCheckedProcess`, the IL evaluator, or IL operations.

The competing accounts are:

1. a direct checked-graph relation authored from the capsule clauses, which supplies an independent source-side account;
2. a source relation defined by lowering to or executing the Semantic Process program, which is circular and cannot support the claimed preservation result;
3. a permanent proof-boundary decision that retains artifact equality and structural lowering theorems but explicitly declines source-to-run preservation.

The separating witness must be quantified rather than fixture-specific. Mutate `lowerNode` so User Tasks are paired positionally with sorted input/output flow lists instead of selecting flows by source and target. Existing fixtures can keep passing when their task and flow identifier orders happen to align. An admitted renamed graph whose task-ID and flow-ID orders disagree then produces divergent behavior, and a universally quantified preservation theorem detects the defect. The earlier proposal to route Task A to Task B's join input is rejected as a witness because the fixture-defined Lean program laws and CIB differential already detect it before a preservation theorem contributes any independent assurance.

The expected experiment is approximately 400–700 lines of Lean: a source runtime, about six transition constructors, the `flowControlPlaceId` renaming relation and prefix-injectivity lemma, per-operation correspondence, and run-level stimulus/closure alignment. The difficult boundary is `enabledTransitions`/`closeSupported` list-order alignment; prove equality of public projections per stimulus rather than identical internal states.

The buy-now rationale is structural, not present mutation coverage: the direct graph account is the missing transcription-correspondence side of the stated proof obligation, the run-level induction skeleton becomes substantially more expensive after timers or Activities enlarge runtime state, and its universal quantifier gains further value as admission widens. Normative/profile review and CIB evidence remain the authorities for the BPMN account.

### Binding conditions

- Do not change `closeSupported`, `enabledTransitions`, observation projection, or any wire contract for proof convenience; stop and route any such need through the semantic-change process.
- Retain the positional-lowering counter-model as executable divergence in the separately gated experiments lane. Empirically require all retained fixture locks to remain green under the mutation and use theorem failure only during development, not as retained red evidence.
- Stop and record the precise unresolved boundary if the run-level proof does not close within approximately 700 lines of Lean or requires restructuring beyond the slice.
- On adoption, update the IL specification proof boundary, implementation map, and rule-to-evidence rows while retaining the witness. On non-adoption, record the unresolved boundary in the experiment document. In either end state, the experiment records all competing accounts and why the permanent-boundary account was rejected.
- `programWellFormed` independently omits reachability, acyclicity, and producer/consumer-shape checks; admitted artifacts currently obtain those guarantees transitively through checked-source validation and exact lowering equality. Strengthen it when admission widens. C2 neither fixes nor depends on this separate gap.

### Result

The experiment ended **not adopted** at the binding effort stop. Approximately 700 lines of separately gated Lean implement the direct checked-node relation and sound executable selector, source admission/closure/observation runner, six retained-fixture mutation controls, correct endpoint-lowering agreement on the renamed graph, and renamed public divergence under positional lowering. A flow-only branch permutation proved observationally symmetric at the current public boundary; the retained positional-record mutation additionally reads task metadata through the wrongly paired Flow target, which swaps task names only under the renamed graph.

The removed correspondence attempt reached the Sequence-Flow/control-place state mapping, prefix injectivity, and token-list lemmas. It had not yet proved nonempty-Flow facts from checked admission, wait and activation mapping, complete enabled-transition list correspondence, parallel supported closure, admission, observation, or the final stimulus induction. Continuing would exceed the owner-approved effort boundary or require proof-facing restructuring of production internals. [The experiment record](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md) owns the precise unresolved boundary and red/green evidence. No production semantics, wire contract, observation projection, or rule-to-evidence row changed.

## Implemented discriminator slices

The bounded parallel discriminator is:

```text
None Start
    ↓
parallel fork
   ↙   ↘
User A User B
   ↘   ↙
parallel join
    ↓
None End
```

The bounded timer discriminator is:

```text
None Start
    ↓
Intermediate Catch Timer PT1S
    ↓
None End
```

The [parallel fork/join spec](capsules/PARALLEL-FORK-JOIN-SPEC.md) and [Intermediate Catch Timer spec](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md) own their semantic rules, observations, laws, non-laws, witnesses, runtime-information invariants, evidence matrices, assurance boundaries, and exclusions. The [Semantic Process IL spec](SEMANTIC-PROCESS-IL-SPEC.md) owns the checked source contract, six admitted operations, lowering, well-formedness, exact Lean proof boundary, event-growth policy, maintained obligations, and stop criteria.

## Ordered work

1. **Completed — review hygiene:** declare the differential test dependency, remove live status from `CLAUDE.md`, add portable Java resolution and the approved two-platform CI workflow, preserve feedback budgets, and add the capsule-amortization review question.
2. **Completed — close the approved production lifecycle:** the specification, implementation, evidence correction, then-current differential comparison, Query reconciliation, failure-outcome classification, focused gates, and complete repository gate are green.
3. **Completed — single-source Lean scenarios:** remove the hard-coded Lean scenario list, strictly decode the same admitted files, retain exact echo and identity checks, add the answer-smuggling mutation, and record the shifted disk-drift responsibility.
4. **Completed, not adopted — C2 checked-source experiment:** the direct graph relation and renamed discriminator are retained under the separate gate; the observational correspondence proof stopped at the approved effort boundary, with the exact remaining induction obligations recorded and no production change.
5. **Completed — timer preflight and capsule implementation:** [the Intermediate Catch Timer spec](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md) fixes and implements the exact `PT1S` source subset, semantic occurrence/deadline account, controlled-clock CIB realization, durable Temporal wakeup, Worker-restart/replay witness, bypass mutation, and four-target evidence.
6. **Completed, rejected — second semantic core:** retain the [dual semantic-core proposal](DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md) as the rejected-account record. Keep one TypeScript production semantic core and Workflow; reopen only for the exact named non-Temporal embedded-JVM trigger.
7. **Completed — cross-language wire hardening:** every current JavaScript-number integer is bounded to the safe domain; exact strings use Unicode scalar-value order without normalization; strict readers reject duplicate decoded keys and unpaired surrogates; TypeScript and Lean lock unknown/missing fields, closed enums, `null` versus absence, unsafe/non-integral numbers, and canonical arrays; CIB uses matching numeric carriers and scalar ordering; and Process-address, Update, timer, and effect material share one Workflow-safe typed-tuple encoder. Deterministic SHA-256 is locked across padding boundaries, supplementary-plane UTF-8, and multi-block input against native crypto without changing current digest bytes. No compatibility reader or dependency was added.
8. **Completed — Service Task CIB binding:** the packaged engine accepts the unknown standard implementation URI without a parser warning, reads the two selected attributes by exact expanded QName under a different prefix, resolves the exact configured bean, creates one immediately executable async-before job with three retries and no due date, derives the activity and binding fields from public engine/deployment state, rejects a perturbed deployed protocol, decrements retries after the scripted first failure, and cleanly re-executes with two invocations but one test-local mutation and no administrative retry change. The project import lane separately locks exact bytes, warning absence, and retained raw attributes. This establishes neither a CIB semantic effect-in-flight state nor project transport-key reconciliation.
9. **Completed — Service Task Activity capsule:** [the Service Task effect spec](capsules/SERVICE-TASK-EFFECT-SPEC.md) closes checked source, shared contracts, Lean, the independent TypeScript core, transport identities, Activity execution, retry reconciliation, typed exhaustion, Worker replacement, bypass detection, ordinary CIB runner integration, content-bound evidence, the eight-scenario/sixteen-execution/nine-replay matrix, and capsule reflection.
10. **Completed — A12 Workflows product compatibility inventory:** the read-only `release/2025.06` product and full-stack-template checkouts are recorded in [SOURCES.md](SOURCES.md). The [compatibility ledger](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) defines the 62-file/50-model BPMN denominator, current 0-of-50 unchanged admission baseline, extension and expression surface, seven production delegates and used CIB APIs, product engine/REST/JMS integration, downstream-blueprint gap, CIB `2.0.0` mismatch, and target-backed priorities.
11. **Approved; implementation in progress — CIB target alignment and CreateDocument data capsule:** [the target baseline](research/CIB-SEVEN-A12-BASELINE-RESEARCH.md) preserves CIB Seven `2.0.0` and `2.2.0` as distinct accounts, identifies the exact source-identical successful `CreateDocument` seam and the broader non-equivalence boundary, and records the temporary `2.0.0` executable result. Implement [the approved proposal](capsules/CREATE-DOCUMENT-DATA-PROPOSAL.md) through its distinct profile, string variables, mappings, committed arguments, typed patch, success-only refinement, and license-safe external-source evidence. Typed `BpmnError` follows immediately after closure.
12. **Deferred — D1 seeded fuzz experiment:** reassess after the Service Task adapter preflight; do not add a dependency or weaken the structural/semantic result boundary.
13. **Completed — substantial directly executed TypeScript harnesses:** the substantial pipeline, artifact, evidence-replacement, Java-resolution, strict-JSON, and bounded-process harnesses execute directly as TypeScript under Node 24 and pass a strict no-emit gate against workspace source. The explicitly approved direct `@types/node` dependency supplies host typings; its locked type-only `undici-types` dependency is recorded in [SOURCES.md](SOURCES.md).
14. **Completed — source-hygiene root fix:** split the Semantic Process Lean monolith and the oversized Temporal, differential, contract-artifact, integration-test, and CIB runner owners by cohesive responsibility. The default dependency-free guard counts tracked and pending source, enforces the 600-line review target and 1000-line hard ceiling with owner-only exceptions, rejects stale exceptions, and keeps exact Lean umbrellas import-only. No current source requires an exception.

Each item ends green at its applicable focused and complete gate before the next begins. No strategic assessment authorizes its implementation.

## Explicitly deferred

- assignment, users/groups, authorization, forms, and data associations; the inventory makes them product requirements, but implementation remains deferred until the target-backed variable/expression and façade proposals select exact subsets;
- global task discovery or Search Attributes;
- messages, timer forms or races beyond the exact Intermediate Catch Timer capsule, Activities and retries beyond the bounded Service Task specification, cancellation, incidents, compensation, and event subprocesses;
- multi-instance, loops, migration, and Continue-As-New;
- a universal BPMN IL, general BPMN compiler, or general semantic assertion language;
- a separate CIB parallel-compatibility profile until it has a concrete consumer;
- immutable profile or production Event History compatibility;
- public BPMN conformance or broad CIB compatibility claims.

## Stop conditions

Stop for owner direction if:

- a new normative or pinned-CIB observation reopens the approved semantic account;
- the profile feature or observation boundary would expand beyond the approved capsule;
- a dependency addition, removal, replacement, or upgrade is required;
- lowering performs runtime scheduling, activation, completion, propagation, or other semantic work that the IL claims to own;
- an IL operation merely selects a retained topology-specific evaluator;
- a new operation mirrors a BPMN surface class without a reusable semantic mechanism and separating witness;
- required source distinctions are erased before Lean can check lowering;
- structural invalidity would become an ordinary semantic outcome;
- a second production semantic core or Workflow language is introduced without the exact reopen trigger and fresh owner approval recorded in the [dual semantic-core rejected-account record](DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md);
- the preservation obligation cannot be stated without assuming the desired result;
- a Temporal preflight cannot map a required public semantic outcome without adding host-defined semantics;
- source and executable CIB revisions diverge;
- the feedback budget cannot be met without weakening independence or evidence.

## Exact resume point

The first incomplete ordered item is implementation of [the approved CreateDocument data and mapping proposal](capsules/CREATE-DOCUMENT-DATA-PROPOSAL.md). Begin with the distinct CIB Seven `2.0.0` profile/evidence identity and exact external-source admission boundary, then close the string value, scope, mapping, patch, and success-only refinement account through the normal red/green capsule order. The missing materialized Workflows-enabled full-stack-template variant remains an integration input. Typed `BpmnError` is next after capsule closure. D1 remains unapproved and behind this product-forced work. Keep C2 frozen under the non-extension and reopening rules in [the experiment record](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md).

Before beginning, run the applicable baseline in [TESTING-SPEC.md](TESTING-SPEC.md) and confirm `git status --short --branch`.
