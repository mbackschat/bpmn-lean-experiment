# Plan

This document owns the current checkpoint, ordered next work, unresolved decisions, and exact resume point. Durable architecture belongs in [PROJECT-DESIGN.md](PROJECT-DESIGN.md); exact supported and absent surfaces belong in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md); test procedure belongs in [TESTING-SPEC.md](TESTING-SPEC.md).

## Current checkpoint

The hygiene review work is implemented: the differential harness declares and uses its Temporal adapter development dependency, `CLAUDE.md` contains only durable Mission guidance, portable Java 21 resolution replaces the Homebrew-only default, and the approved Ubuntu/macOS verification workflow preserves the existing feedback budgets.

The approved [production Temporal lifecycle](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) is implemented without a finite scenario-count lifetime or compatibility branch. It uses a semantic Process address, content-bound Update identity, retained-Update-first result resolution, adapter-owned lifecycle results, accepted-handler draining, explicit schedules, replay, and cleanup.

The sequential stale case now records the honest target relation: CIB Seven, Lean, and the TypeScript core retain semantic rejection; Temporal agrees through completion and returns adapter-owned `processClosed` for the explicitly post-terminal command. The parallel live-sibling stale case supplies exact four-target semantic rejection while the Process remains addressable, and the concurrent reversal is retained as an unordered one-commit/one-rejection race witness.

Harness-only Query extraction reconciles completion-command outcomes with completed Update results in Event History and the terminal state with the completed receipt. Failed Updates are named infrastructure failures, the start command is explicitly outside Update-result reconciliation, and intermediate Query observations remain independently compared with the pure core.

Lean now strictly decodes the same seven answer-free scenario documents consumed by the other targets and echoes the decoded values. The extra-field mutation guards answer smuggling; retained CIB content binding owns disk-content drift detection now that there is no compiled Lean scenario copy.

The exact implementation and absence boundary, including the incomplete standalone Lean `programWellFormed` obligations, is recorded in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md). The checked-source experiment ended not adopted at its approved effort boundary with a provisional source account and discriminator retained; that successful stop outcome is frozen under explicit non-extension and reopening rules.

The approved [Intermediate Catch Timer specification](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md) is implemented under its exact `PT1S` account. The checked graph retains the literal for independent Lean normalization; the IL, Lean relation/evaluator, semantic core, controlled-clock CIB runner, and Temporal adapter implement the same timer occurrence and exact-deadline firing. CIB proves pre-due ineligibility and due-time eligibility before execution. Temporal derives the content-bound firing exclusively from committed core state, durably waits while the Worker is absent at the due boundary, completes after Worker replacement, and replays one exact timer pair. The seven-case differential pipeline and retained deadline/bypass mutations close the capsule's required evidence. The time-skipping lane remains optional because the full local-server witness is the mandatory refinement gate.

The family-level [CIB Seven extension research](research/CIB-SEVEN-EXTENSIONS-RESEARCH.md) shows that Service Task source binding, project handler registration, JUEL/beans, Java delegate APIs, scripts, FEEL, and external-task protocols are distinct compatibility claims. The owner-approved [compatibility scope proposal](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) selects the exact bounded handler pair. The [dual semantic-core architecture proposal](DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md) is owner-rejected because no non-Temporal JVM semantic-execution product exists; the single TypeScript semantic core and Workflow remain the production account, with JVM code behind Activity Worker or client-façade boundaries. The [Service Task effect proposal](capsules/SERVICE-TASK-EFFECT-PROPOSAL.md) remains unapproved. Its phase-zero CIB probe is green: the exact paired binding deploys without warnings, resolves by expanded namespace QName, creates an immediately executable async-before job with three retries and no due date, decrements retries `3 → 2` after the first public failed execution, and completes on the second execution with two invocations but one external mutation and no administrative retry edit.

The driving product goal is recorded in [PROJECT-DESIGN.md](PROJECT-DESIGN.md): replace an actual CIB Seven solution, including its used BPMN, selected Java delegates, expressions, and integration code, with an explicit and preferably adapter-based migration path to the Temporal-hosted, Lean-assured system. The next planning input is a read-only inventory of that target solution once its checkout is supplied. The rejected-core review's wire exactness findings are implemented through JavaScript-safe integers, language-neutral identifier ordering, and strict JSON edge behavior.

The active implementation boundary is [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).

## Last verified baseline

`pnpm_config_enable_global_virtual_store=false pnpm_config_verify_deps_before_run=error ./scripts/verify.sh` passed on 2026-07-26 after the Service Task phase-zero probe. It passed eighteen contract tests, thirty-two semantic-core tests, fifteen BPMN-source tests, fourteen CIB tests, nine differential unit tests, thirty-one infrastructure guards, eighteen Temporal tests, and the complete seven-case pipeline; checked the strict Lean decoder locks, seven synchronized documentation fragments, the bounded CMOF manifest, and the schema-valid phase-zero source; replayed seven live histories; and left all local services cleaned up.

The explicit pnpm setting matches the unchanged installed workspace state. A bare `./scripts/pnpm.sh run ...` currently sees pnpm’s `enableGlobalVirtualStore` default differ from that recorded state and attempts an unnecessary reinstall; no dependency or lockfile changed in this assessment. A wrapper/config reproducibility correction is separate infrastructure work and is not authorized by the compatibility-scope proposal.

The first sandboxed verification attempt reached the focused Temporal gate but the environment denied creation of its local ephemeral server with `Operation not permitted`. Re-running the identical gate with local-server permission passed; no source or fixture changed between those attempts.

The separately gated C2 experiment passed `lake build checkCheckedSourceRelationExperiment` and `lake exe checkCheckedSourceRelationExperiment`. That gate establishes the retained direct source account and mutation discriminator only; it does not establish the unresolved observational lowering-preservation theorem.

In the final complete gate, the prebuilt seven-case pipeline completed in 4.817 seconds warm, ran fourteen isolated Temporal executions, replayed seven primary histories, and rejected the definition-origin, scenario-extra-field, parallel-provenance, timer-deadline, and durable-timer-bypass mutations. The latest separately measured build-inclusive pipeline completed in 5.074 seconds warm and 6.649 seconds cold, inside the unchanged 15-second and 45-second budgets. The focused Temporal gate passed eighteen tests in 6.690 seconds, including failed-Update infrastructure classification, Worker restart, retained result lookup, the unordered command race, Worker absence at the timer due boundary, durable-timer history, bypass detection, and live replay. The separately named optional time-skipping calibration passed in 7.989 seconds and remains outside default verification.

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
- **C1 next-capsule sequence:** proceed with the approved bounded Intermediate Catch Timer capsule and then a bounded Service Task/Temporal Activity capsule. The Service Task account still requires its own proposal and owner decision.
- **Intermediate Catch Timer capsule:** the exact approved `PT1S` account is implemented and graduated to [the specification](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md). The answer-free scenario carries `fireTimer` for Lean, semantic core, and controlled-clock CIB realization; Temporal derives the identical content-bound stimulus exclusively from committed semantic state. Per-rule CIB fidelity labels, quantified full-identity/time refusal, the early-firing non-law, explicit retained-evidence replacement, mandatory full-server durability evidence, and optional time-skipping calibration are retained.
- **D1 sequencing:** defer the optional dependency-free Lean/core fuzz experiment until after the timer preflight is reviewed so it does not delay the dominant adapter-feasibility discriminator.
- **Semantic-core runtime language:** reject a second Java semantic core and retain one TypeScript semantic core hosted by the TypeScript Temporal Workflow. A JVM Worker or Spring/client façade is not a semantic-core consumer. Reopen only for a named non-Temporal embedded JVM product mode that must own and advance semantic Process state in-process.
- **Migration product goal:** optimize the bounded profile and compatibility work for replacing the actual target CIB Seven solution, using defined inventory-based measures for unchanged model admission, unmodified delegate bridging, supported API adaptation, and classified migration of the remainder. Do not claim generic drop-in engine compatibility.
- **Cross-language wire hardening:** close the JavaScript-safe integer and strict JSON boundary gaps across current TypeScript and Lean lanes without introducing a Java core or compatibility reader. Canonical identifiers use lexicographic Unicode scalar-value order over well-formed exact strings with no normalization; reject unpaired surrogate encodings and exercise both BMP and supplementary-plane cases.

## Pending owner decisions

After a green phase-zero probe, approve or correct the revised [Service Task effect proposal](capsules/SERVICE-TASK-EFFECT-PROPOSAL.md). Its exact success-only effect account, closed result union, structured core-owned intent, adapter-rendered SHA-256 transport identity, two finite Temporal Activity attempts, and separate explicit host schedules remain proposed. The packaged-CIB binding and retry/re-execution probe is already authorized because it establishes source/oracle facts; production `awaitEffect` work still requires the capsule decision.

The research corrects three tempting assumptions: CIB Seven retains the Camunda namespace rather than defining `cibseven:*` attributes; the async-continuation job is immediately executable rather than timer-like eligibility-gated; and FEEL is not the language used by CIB Service Task delegate expressions, which use JUEL. Manual public job execution uses the failed-job listener and default retry decrement in both pinned source and packaged `2.2.0` evidence. Exact bean resolution, prefix-independent namespace handling, immediate executability, null due date, fail-once retry decrement, and clean re-execution are locked by the phase-zero probe.

## Approved next-capsule sequence

### C1 — next semantic capsules

**Owner decision:** approved for a timer capsule followed by a service-task Activity capsule. This sequence attacks the residual Temporal-adapter feasibility risk before adding more topology. The Intermediate Catch Timer capsule is complete; the Service Task capsule has not begun and still requires its own proposal and owner approval before production implementation.

**Timer first:** use one bounded `None Start Event → Intermediate Catch Timer Event → None End Event` discriminator with one reviewed literal duration form. The semantic core must own the timer occurrence, logical deadline, readiness, duplicate/stale firing behavior, and public observations. The adapter may translate one typed semantic timer wait into a durable Temporal timer and feed its recorded wakeup back as an explicit typed stimulus; Temporal time must not become implicit BPMN state or decide semantic firing. The mandatory preflight must settle the admitted BPMN timer-expression subset, logical-time input, timer identity, deadline comparison, Workflow completion, duplicate wakeup, Worker restart, replay, and whether the full-server plus time-skipping evidence can remain inside the feedback budgets. The nearest adapter counterexample is deriving the deadline independently in Workflow code or advancing the core merely because a Temporal timer fired.

**Service task second:** use one bounded `None Start Event → Service Task → None End Event` discriminator after the completed timer and the owner-approved [CIB Seven compatibility scope](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md). The [prepared capsule proposal](capsules/SERVICE-TASK-EFFECT-PROPOSAL.md) recommends that the semantic core own the Service Task occurrence, structured effect intent, stable idempotency material, and closed success result while a Temporal Activity remains only the effect executor. It selects exact finite timeouts and retries, idempotent reconciliation, and the boundary between hidden Temporal attempts and CIB-visible retry evidence; it excludes general JUEL, Java API compatibility, cancellation, exhausted-failure translation, faults, and incidents. The separating adapter witness simulates an external side effect followed by lost Activity completion and requires one logical effect plus replay-equivalent semantic observations.

**Why this order:** the timer introduces the first durable host Command driven by semantic waiting without also introducing nondeterministic I/O. The Service Task then reuses the proven wakeup/input loop while adding external effects and retry separation. Another pure-topology capsule would exercise the existing Query/Update host composition and would not reduce either risk.

**Authorized next action:** harden the cross-language wire contract atomically, then run the packaged CIB Seven Service Task phase-zero probe. Do not begin production `awaitEffect` implementation before that probe is green and the capsule is separately approved. Begin the read-only target-solution inventory as soon as the owner supplies its checkout; it does not delay the phase-zero probe.

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
7. **Completed — cross-language wire hardening:** every current JavaScript-number integer is bounded to the safe domain; exact strings use Unicode scalar-value order without normalization; strict readers reject duplicate decoded keys and unpaired surrogates; TypeScript and Lean lock unknown/missing fields, closed enums, `null` versus absence, unsafe/non-integral numbers, and canonical arrays; and CIB uses matching numeric carriers and scalar ordering. No compatibility reader or dependency was added.
8. **Completed — Service Task CIB binding:** the packaged engine accepts the unknown standard implementation URI without a parser warning, reads the two selected attributes by exact expanded QName under a different prefix, resolves the exact configured bean, creates one immediately executable async-before job with three retries and no due date, decrements retries after the scripted first failure, and cleanly re-executes with two invocations but one mutation and no administrative retry change. The project import lane separately locks exact bytes, warning absence, and retained raw attributes.
9. **Owner decision pending — Service Task Activity capsule:** after the green phase-zero record, approve or correct the [Service Task effect proposal](capsules/SERVICE-TASK-EFFECT-PROPOSAL.md), then implement only its approved success-only account.
10. **Owner checkout pending, non-blocking — migration-target inventory:** as soon as the actual target solution is identified, record its read-only checkout in [SOURCES.md](SOURCES.md) and produce a defined-denominator ledger of BPMN and extension usage, binding styles, exact delegate APIs, variables, expressions, errors, listeners/forms/retries/incidents, external tasks, and engine API consumers. Use it to re-prioritize later capsules.
11. **After inventory — variable and expression research:** assess the smallest typed variable/effect-patch and exact expression subset that covers the target solution. Let observed `BpmnError` usage decide whether semantic error and boundary-event work moves earlier.
12. **Deferred — D1 seeded fuzz experiment:** reassess after the Service Task adapter preflight; do not add a dependency or weaken the structural/semantic result boundary.
13. **Deferred tooling cleanup — substantial directly executed TypeScript harnesses:** migrate substantial `.mjs` harnesses only after the current semantic work is committed, without mixing the change into semantic work. Proper Node typing requires an explicit direct dependency decision before implementation; do not rely on a transitive `@types/node`.

Each item ends green at its applicable focused and complete gate before the next begins. No strategic assessment authorizes its implementation.

## Explicitly deferred

- assignment, users/groups, authorization, forms, and data associations; variable/expression implementation remains deferred until the target inventory and bounded research select an exact subset;
- global task discovery or Search Attributes;
- messages, timer forms or races beyond the exact Intermediate Catch Timer capsule, Activities and retries beyond the proposed bounded Service Task capsule, cancellation, incidents, compensation, and event subprocesses;
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

Seek the owner decision on the green [Service Task effect proposal](capsules/SERVICE-TASK-EFFECT-PROPOSAL.md) before beginning checked-source, Lean, TypeScript, or Temporal `awaitEffect` work. If the owner supplies the target-solution checkout meanwhile, record it in [SOURCES.md](SOURCES.md) and run the read-only inventory. Keep D1 behind the Service Task adapter-feasibility work. Keep C2 frozen under the non-extension and reopening rules in [the experiment record](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md); do not extend it with new capsules or silently treat the unresolved theorem as permanently waived. The requested substantial `.mjs`-to-direct-`.ts` harness migration is the next independent cleanup only after an explicit direct Node typing dependency decision.

Before beginning, run the applicable baseline in [TESTING-SPEC.md](TESTING-SPEC.md) and confirm `git status --short --branch`.
