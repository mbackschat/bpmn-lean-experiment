# Plan

This document owns the current checkpoint, ordered next work, unresolved decisions, and exact resume point. Durable architecture belongs in [PROJECT-DESIGN.md](PROJECT-DESIGN.md); exact supported and absent surfaces belong in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md); test procedure belongs in [TESTING-SPEC.md](TESTING-SPEC.md).

## Current checkpoint

The hygiene review work is implemented: the differential harness declares and uses its Temporal adapter development dependency, `CLAUDE.md` contains only durable Mission guidance, portable Java 21 resolution replaces the Homebrew-only default, and the approved Ubuntu/macOS verification workflow preserves the existing feedback budgets.

The approved [production Temporal lifecycle](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) is implemented without a finite scenario-count lifetime or compatibility branch. It uses a semantic Process address, content-bound Update identity, retained-Update-first result resolution, adapter-owned lifecycle results, accepted-handler draining, explicit schedules, replay, and cleanup.

The sequential stale case now records the honest target relation: CIB Seven, Lean, and the TypeScript core retain semantic rejection; Temporal agrees through completion and returns adapter-owned `processClosed` for the explicitly post-terminal command. The parallel live-sibling stale case supplies exact four-target semantic rejection while the Process remains addressable, and the concurrent reversal is retained as an unordered one-commit/one-rejection race witness.

Harness-only Query extraction reconciles completion-command outcomes with completed Update results in Event History and the terminal state with the completed receipt. Failed Updates are named infrastructure failures, the start command is explicitly outside Update-result reconciliation, and intermediate Query observations remain independently compared with the pure core.

Lean now strictly decodes the same six answer-free scenario documents consumed by the other targets and echoes the decoded values. The extra-field mutation guards answer smuggling; retained CIB content binding owns disk-content drift detection now that there is no compiled Lean scenario copy.

The exact implementation and absence boundary, including the incomplete standalone Lean `programWellFormed` obligations, is recorded in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md). The checked-source experiment ended not adopted at its approved effort boundary with a provisional source account and discriminator retained; that successful stop outcome is frozen under explicit non-extension and reopening rules. The timer-then-service-task sequence is approved, the timer hosting/refinement preflight and capsule proposal are active, and the optional fuzz lane is deferred until that preflight is reviewed.

The active implementation boundary is [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).

## Last verified baseline

`env CI=true /opt/homebrew/bin/timeout 60 /usr/bin/time -p ./scripts/verify.sh` passed on 2026-07-26 in 25.94 seconds for the complete uncommitted review worktree. It passed thirteen contract tests, twenty-seven semantic-core tests, twelve BPMN-source tests, nine CIB tests, nine differential unit tests, twenty-six infrastructure guards, and fifteen Temporal tests; checked seven synchronized documentation fragments and the bounded CMOF manifest; and left all local services cleaned up.

The separately gated C2 experiment passed `lake build checkCheckedSourceRelationExperiment` and `lake exe checkCheckedSourceRelationExperiment`. That gate establishes the retained direct source account and mutation discriminator only; it does not establish the unresolved observational lowering-preservation theorem.

The prepared six-case pipeline completed in 4.72 seconds warm, established each explicit target relation, replayed all six primary histories, and rejected the definition-origin, scenario-extra-field, and parallel-provenance mutations. The focused Temporal gate separately passed all fifteen tests in 4.84 seconds, including failed-Update infrastructure classification, Worker restart, retained result lookup, the unordered race witness, and live replay.

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
- **C1 next-capsule sequence:** proceed with a bounded Intermediate Catch Timer capsule and then a bounded Service Task/Temporal Activity capsule. Approval currently extends through the timer hosting/refinement preflight and capsule proposal; production semantics still require approval of the resulting timer account.
- **D1 sequencing:** defer the optional dependency-free Lean/core fuzz experiment until after the timer preflight is reviewed so it does not delay the dominant adapter-feasibility discriminator.

## Approved next-capsule sequence

### C1 — next semantic capsules

**Owner decision:** approved for a timer capsule followed by a service-task Activity capsule. This sequence attacks the residual Temporal-adapter feasibility risk before adding more topology. No capsule has begun, and the decision does not yet approve either capsule's semantic profile.

**Timer first:** use one bounded `None Start Event → Intermediate Catch Timer Event → None End Event` discriminator with one reviewed literal duration form. The semantic core must own the timer occurrence, logical deadline, readiness, duplicate/stale firing behavior, and public observations. The adapter may translate one typed semantic timer wait into a durable Temporal timer and feed its recorded wakeup back as an explicit typed stimulus; Temporal time must not become implicit BPMN state or decide semantic firing. The mandatory preflight must settle the admitted BPMN timer-expression subset, logical-time input, timer identity, deadline comparison, Workflow completion, duplicate wakeup, Worker restart, replay, and whether the full-server plus time-skipping evidence can remain inside the feedback budgets. The nearest adapter counterexample is deriving the deadline independently in Workflow code or advancing the core merely because a Temporal timer fired.

**Service task second:** use one bounded `None Start Event → Service Task → None End Event` discriminator only after the timer result is closed. The semantic core must own the Service Task occurrence and external-effect lifecycle, emit a typed effect intent with a stable idempotency key, and receive typed success or failure results as explicit stimuli. A Temporal Activity is only the effect executor. Before implementation, the capsule preflight must select the exact BPMN/CIB execution binding and explicitly decide Activity timeouts, retry policy, idempotency or reconciliation, cancellation, exhausted-failure translation, and the boundary between hidden Temporal attempts and any CIB-visible retry or incident. The separating adapter witness must simulate an external side effect followed by lost Activity completion and require one logical effect plus replay-equivalent semantic observations.

**Why this order:** the timer introduces the first durable host Command driven by semantic waiting without also introducing nondeterministic I/O. The Service Task then reuses the proven wakeup/input loop while adding external effects and retry separation. Another pure-topology capsule would exercise the existing Query/Update host composition and would not reduce either risk.

**Authorized next action:** complete the timer hosting/refinement preflight and capsule proposal. Production Lean, semantic-core, source, wire, and Temporal changes remain unauthorized until that proposal is reviewed.

## Deferred assessment

### D1 — seeded Lean/core fuzz lane

**Deferred until the timer preflight is reviewed.** A hand-rolled seeded generator could compare well-formed stimulus sequences over the two admitted topologies in batches and report the exact seed on failure. Malformed documents require an explicit per-case admission-result envelope or isolated Lean invocations because the strict Lean decoder currently rejects an entire invocation while the TypeScript core classifies structural admission separately; do not coerce either into a semantic outcome. Estimated cost is 220–340 lines of JavaScript and protocol/test support with no new dependency. Its value compounds as capsules grow, but it must not delay the first timer/Temporal feasibility discriminator.

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

## Target slice

The approved production capsule model is:

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

The [parallel fork/join spec](capsules/PARALLEL-FORK-JOIN-SPEC.md) owns the semantic rules, observations, laws, non-law, witnesses, runtime-information invariants, evidence matrix, assurance boundary, and exclusions. The [Semantic Process IL spec](SEMANTIC-PROCESS-IL-SPEC.md) owns the checked source contract, `initiate`, `awaitUserTask`, `duplicate`, `synchronize`, and `terminate` operations, lowering, well-formedness, exact Lean proof boundary, event-growth policy, maintained obligations, and stop criteria.

## Ordered work

1. **Completed — review hygiene:** declare the differential test dependency, remove live status from `CLAUDE.md`, add portable Java resolution and the approved two-platform CI workflow, preserve feedback budgets, and add the capsule-amortization review question.
2. **Completed — close the approved production lifecycle:** the specification, implementation, evidence correction, six-case comparison, Query reconciliation, failure-outcome classification, focused gates, and complete repository gate are green.
3. **Completed — single-source Lean scenarios:** remove the hard-coded Lean scenario list, strictly decode the same admitted files, retain exact echo and identity checks, add the answer-smuggling mutation, and record the shifted disk-drift responsibility.
4. **Completed, not adopted — C2 checked-source experiment:** the direct graph relation and renamed discriminator are retained under the separate gate; the observational correspondence proof stopped at the approved effort boundary, with the exact remaining induction obligations recorded and no production change.
5. **In progress — timer preflight and capsule proposal:** map semantic time to durable wakeup, state the exact profile and source subset, record the separating host witness, and return the proposal for owner review before production implementation.
6. **Deferred — D1 seeded fuzz experiment:** revisit after the timer preflight is reviewed; do not add a dependency or weaken the structural/semantic result boundary.
7. **Approved sequence, not started — timer capsule implementation:** begin only after the timer proposal is approved.
8. **Approved sequence, not started — service-task Activity capsule:** begin after the timer capsule and first record the effect lifecycle, idempotency, retry, incident, and replay account.

Each item ends green at its applicable focused and complete gate before the next begins. No strategic assessment authorizes its implementation.

## Explicitly deferred

- assignment, users/groups, authorization, forms, variables, expressions, and data associations;
- global task discovery or Search Attributes;
- messages, timers, Activities, retries, cancellation, incidents, compensation, and event subprocesses;
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
- the current and new executable representations would coexist in production;
- the preservation obligation cannot be stated without assuming the desired result;
- a Temporal preflight cannot map a required public semantic outcome without adding host-defined semantics;
- source and executable CIB revisions diverge;
- the feedback budget cannot be met without weakening independence or evidence.

## Exact resume point

Complete ordered item 5 by writing the bounded timer capsule proposal and its Temporal hosting/refinement preflight. Stop at owner review before changing production Lean, semantic-core, source, wire, CIB, or Temporal behavior. D1 remains deferred until that review. C2 remains frozen under the non-extension and reopening rules in [the experiment record](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md); do not extend it with new capsules or silently treat the unresolved theorem as permanently waived.

Before beginning, run the applicable baseline in [TESTING-SPEC.md](TESTING-SPEC.md) and confirm `git status --short --branch`.
