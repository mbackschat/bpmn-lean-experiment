# Plan

This document owns the current checkpoint, ordered next work, unresolved decisions, and exact resume point. Durable architecture belongs in [PROJECT-DESIGN.md](PROJECT-DESIGN.md); exact supported and absent surfaces belong in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md); test procedure belongs in [TESTING-SPEC.md](TESTING-SPEC.md).

## Current checkpoint

The bounded `None Start Event → User Task → None End Event` capsule is evidence-closed as a draft:

- exact BPMN bytes are admitted and compiled to the current transitional project-owned executable IR;
- the current profile and three answer-free scenarios use one structural contract with content-bound CIB evidence;
- CIB Seven, Lean, the TypeScript semantic core, and Temporal agree exactly for completion, wrong activation, and stale completion;
- Lean proves evaluator soundness for internal steps, exact completion, quantified full-occurrence mismatch rejection with state preservation, and the element-only identity non-law;
- Temporal uses Query plus acknowledged Update, checks duplicate logical delivery, and replays all current live histories on a fresh in-memory server;
- seeded task-activation disagreement, target isolation, CIB cleanup, process cleanup, and feedback budgets are executable;
- Lean echoes the exact scenario content it executed and the harness rejects drift from the admitted scenario document;
- each rule's CIB evidence carries an explicit `engine-observed`, `adapter-derived`, or `adapter-decided` fidelity;
- pre-release compatibility paths, embedded wire-format counters, committed Temporal histories, Workflow patch branches, and legacy IR readers are absent.

Preparation and owner decisions for the next slice are complete:

- R8 makes the focused Temporal history/refinement/replay gate part of default verification, protected by an infrastructure test;
- the bounded generated-ID consistency probe strengthens only the host-identity premise of `CIB-OP-0001`;
- the disposition-only [BPMN requirement ledger](BPMN-REQUIREMENT-LEDGER.md) is seeded without an exhaustive denominator or conformance percentage;
- the [parallel fork/join capsule](capsules/PARALLEL-FORK-JOIN-PROPOSAL.md) is approved for normative per-incoming-Sequence-Flow synchronization, two simultaneous distinct User Tasks, deterministic semantic projection order, per-element wait multiplicity, completion-order independence, excess-token retention, and asymmetric internal runtime representations;
- the current `cibseven-2.2.0-user-task-draft` profile will not claim parallel compatibility;
- observed pinned-CIB count-based join behavior may be retained later only in a separate compatibility profile with a concrete consumer;
- candidate deviation `CIB-DEV-0001` remains candidate until immutable content-bound evidence, mutation, and cross-lane impact evidence close it;
- the bounded [Semantic Process IL proposal](SEMANTIC-PROCESS-IL-PROPOSAL.md) is owner-approved as the future definition boundary for the sequential and parallel capsules;
- the repository now follows the [documentation discipline](DOC-DISCIPLINE.md): implemented current contracts use `-SPEC`, unimplemented intent uses `-PROPOSAL`, research and experiments carry explicit roles, and completed milestone intent is archived;
- no checked BPMN graph, Semantic Process program, parallel production semantics, or cross-lane parallel evidence is implemented.

The active implementation boundary is [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).

## Last verified baseline

`env CI=true /opt/homebrew/bin/timeout 60 ./scripts/verify.sh` passed on 2026-07-26 after the A12-aligned document-role migration. The full command completed in 19.92 seconds, validated both bounded BPMN fixtures, passed five CIB tests and fourteen infrastructure guards including documentation index and role enforcement, ran the mandatory focused Temporal gate in 1.72 seconds with live replay, and completed the prepared three-case four-target pipeline in 4.52 seconds with three replayed histories. The separately gated representation experiment previously passed with `lake build checkSemanticRepresentationSpike && lake exe checkSemanticRepresentationSpike`.

The Lean scenario binding was additionally verified by a positive control outside the gate: changing the wrong-activation scenario's submitted activation from `2` to `3` on disk left CIB, the semantic core, and Temporal in agreement, and the pipeline failed with `lean executed different scenario content for user-task-wrong-activation: scenario.stimuli[1].taskId.activation expected 3 but was 2`. The seeded change was reverted. Its retained regression equivalents are the content-mismatch and missing-echo cases in [scenario-binding.test.mjs](../packages/differential/test/scenario-binding.test.mjs).

## Approved decisions

The owner approved the following on 2026-07-26:

- **Parallel meaning:** implement normative BPMN per-incoming-Sequence-Flow fork/join behavior under the approved bounded capsule.
- **CIB relationship:** retain `CIB-DEV-0001` as a visible candidate deviation; do not expand the current CIB profile to claim parallel compatibility.
- **Representation:** share the checked BPMN graph and Semantic Process program, while allowing Lean and TypeScript to use asymmetric internal runtime representations.
- **Definition boundary:** lower exact admitted source through a checked project-owned BPMN graph to the bounded Semantic Process IL; do not extend the topology-specific executable IR.
- **R5 — Temporal semantic-policy ownership:** before parallel Temporal hosting, move current-state task projection, stimulus well-formedness, and stimulus identity comparison behind semantic-core-owned operations instead of extending the Workflow's trace scan and hand-maintained policy copies.
- **R6 — multiple-task CIB observation:** before canonical parallel CIB evidence, remove the single-active-task guard together with deterministic semantic task sorting and per-element wait multiplicity.
- **R8 — default Temporal history gate:** retain `test:temporal` in `verify.sh` so Update acceptance/completion, zero-Signal, and live-replay assertions remain mandatory.

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

The [parallel proposal](capsules/PARALLEL-FORK-JOIN-PROPOSAL.md) owns the approved semantic rules, observations, laws, non-law, witnesses, runtime-information invariants, and exclusions before implementation. The [Semantic Process IL proposal](SEMANTIC-PROCESS-IL-PROPOSAL.md) owns the approved checked source contract, `initiate`, `awaitUserTask`, `duplicate`, `synchronize`, and `terminate` operations, lowering, well-formedness, Lean proof obligations, event-growth policy, acceptance criteria, and stop criteria before graduation.

## Ordered work

1. **Completed — consolidate decisions and documentation roles:** record the approved parallel meaning, CIB profile boundary, asymmetric representation decision, bounded Semantic Process IL proposal, implementation absence, A12-aligned document lifecycle, and documentation ownership.
2. **Next — freeze executable obligations before code:** add red contract tests for `checkedProcess` and `semanticProcess`, add adversarial invalid-reference/arity/identity/order mutations, and state the reviewed Lean `lower_preserves_supported_run` obligation and evaluator-soundness signatures before implementing the lowerer.
3. **Move R5 into the semantic core:** add semantic-core-owned current-state projection, stimulus well-formedness, and same-stimulus identity operations behind red tests; make the current Temporal Workflow delegate to them without changing sequential canonical results.
4. **Implement checked source and lowering:** add the bounded checked BPMN graph and deterministic lowerer for both the existing sequential and approved balanced parallel models; preserve exact source/profile/compiler identity and source origins; replace the topology-specific executable IR and all current producers and consumers atomically.
5. **Implement the Lean definition lane:** decode the checked graph and Semantic Process program, recompute and require exact lowering equality, define the declarative program relation and executable evaluator, prove evaluator soundness, pursue the reviewed source-to-program preservation statement, and add the parallel laws and duplicate-left/no-right non-law.
6. **Implement the independent TypeScript lane:** add the generic Semantic Process evaluator with explicit flow-identified token multiplicity and semantic task occurrences; retain enum-based operation dispatch; pass sequential behavior, A-then-B, B-then-A, duplicate-left/no-right, excess-token, projection-permutation, and invalid-program tests.
7. **Complete R6 and CIB evidence:** generalize the CIB adapter to multiple active tasks with semantic sorting and per-element wait multiplicity; add answer-free A-then-B and B-then-A scenarios; retain content-bound raw/canonical evidence and a meaningful projection mutation; preserve the negative deviation probe outside the normative target result.
8. **Refine through Temporal and differential comparison:** pass only admitted Semantic Process programs to the Workflow, host parallel semantics through the core, verify Query/Update behavior and duplicate commands, replay all same-gate histories, and add definition-binding and provenance-erasure mutations.
9. **Close and graduate the capsule epistemically:** complete the rule-to-evidence matrix, state exact established and unsupported claims, review common-mode assumptions and the nearest counterexample, graduate the Semantic Process IL and parallel proposals into `-SPEC` contracts, archive the resolved proposals when their rationale remains useful, update the implementation map and walkthrough fragments, run focused and full gates, and reassess the next semantic discriminator.

Each numbered step must end green at its applicable focused gate before the next step begins. Steps 4 through 8 must not create a compatibility reader or keep the old executable path alongside the new one.

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
- source and executable CIB revisions diverge;
- the feedback budget cannot be met without weakening independence or evidence.

## Exact resume point

The semantic decisions and bounded Semantic Process IL proposal are recorded, but production code remains on the verified sequential executable-IR baseline.

Resume at ordered work item 2. Read [SEMANTIC-PROCESS-IL-PROPOSAL.md](SEMANTIC-PROCESS-IL-PROPOSAL.md), the [parallel proposal](capsules/PARALLEL-FORK-JOIN-PROPOSAL.md), the current [shared contracts](../contracts/README.md), and the applicable Lean and TypeScript package guides. Add failing schema/contract mutations and write the Lean preservation and evaluator-soundness signatures before implementing lowering or production parallel semantics.

Before beginning, run the applicable baseline in [TESTING-SPEC.md](TESTING-SPEC.md) and confirm `git status --short --branch`.
