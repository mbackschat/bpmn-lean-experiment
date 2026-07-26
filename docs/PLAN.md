# Plan

This document owns the current checkpoint, ordered next work, unresolved decisions, and exact resume point. Durable architecture belongs in [PROJECT-DESIGN.md](PROJECT-DESIGN.md); exact supported and absent surfaces belong in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md); test procedure belongs in [TESTING-SPEC.md](TESTING-SPEC.md).

## Current checkpoint

The bounded `None Start Event → User Task → None End Event` capsule is evidence-closed as a draft:

- exact BPMN bytes are admitted through a canonical checked BPMN graph and lowered to the current project-owned Semantic Process program;
- the current profile and three answer-free scenarios use one structural contract with content-bound CIB evidence;
- CIB Seven, Lean, the TypeScript semantic core, and Temporal agree exactly for completion, wrong activation, and stale completion;
- Lean strictly decodes and validates the actual checked graph and Semantic Process program, independently recomputes canonical lowering, rejects inequality before evaluation, and executes the received program;
- Lean proves generic evaluator soundness, structural definition and origin preservation, exact completion, quantified full-occurrence mismatch rejection with state preservation, the element-only identity non-law, and bounded parallel fork/join laws and non-law;
- Temporal uses Query plus acknowledged Update, checks duplicate logical delivery, and replays all current live histories on a fresh in-memory server;
- seeded task-activation disagreement, target isolation, CIB cleanup, process cleanup, and feedback budgets are executable;
- Lean echoes the exact scenario content and definition binding it executed; the harness rejects scenario drift and a schema-valid operation-origin mutation;
- each rule's CIB evidence carries an explicit `engine-observed`, `adapter-derived`, or `adapter-decided` fidelity;
- pre-release compatibility paths, embedded wire-format counters, committed Temporal histories, Workflow patch branches, and legacy IR readers are absent.

The parallel slice is evidence-closed as a draft:

- R8 makes the focused Temporal history/refinement/replay gate part of default verification, protected by an infrastructure test;
- the bounded generated-ID consistency probe strengthens only the host-identity premise of `CIB-OP-0001`;
- the disposition-only [BPMN requirement ledger](BPMN-REQUIREMENT-LEDGER.md) is seeded without an exhaustive denominator or conformance percentage;
- the [parallel fork/join spec](capsules/PARALLEL-FORK-JOIN-SPEC.md) owns normative per-incoming-Sequence-Flow synchronization, two simultaneous distinct User Tasks, deterministic semantic projection order, per-element wait multiplicity, completion-order independence, excess-token retention, and asymmetric internal runtime representations;
- the current `cibseven-2.2.0-user-task-draft` profile will not claim parallel compatibility;
- observed pinned-CIB count-based join behavior may be retained later only in a separate compatibility profile with a concrete consumer;
- candidate deviation `CIB-DEV-0001` remains candidate until the duplicate-left/no-right probe itself becomes immutable answer-free evidence with complete compatibility-impact treatment;
- the bounded [Semantic Process IL spec](SEMANTIC-PROCESS-IL-SPEC.md) is the implemented definition boundary for the sequential and parallel capsules;
- the repository now follows the [documentation discipline](DOC-DISCIPLINE.md): implemented current contracts use `-SPEC`, unimplemented intent uses `-PROPOSAL`, research and experiments carry explicit roles, and completed milestone intent is archived;
- current schemas and boundary guards freeze the checked BPMN graph and Semantic Process program wire shapes, and the bounded source path produces both sequential and parallel artifacts;
- R5 is complete: the semantic core owns current-task projection, stimulus well-formedness, command identity, and same-stimulus comparison, and the Temporal Workflow delegates instead of scanning trace history or copying policy;
- the topology-specific executable representation and evaluator are removed; the semantic core, Temporal adapter, and differential pipeline consume the Semantic Process program for the existing sequential evidence;
- the Lean definition lane is complete at its exact current proof boundary: strict decoding, independent validation and lowering, equality-before-evaluation, generic relation/evaluator, soundness, structural preservation, parallel laws, and parallel non-law are implemented; full observational source-to-run preservation remains open because there is no independent checked-source operational relation;
- the independent TypeScript semantic core executes `duplicate` and normative per-incoming-flow `synchronize` over explicit flow-identified token multiplicities, reaches both simultaneous waits, accepts both completion orders, retains excess tokens, rejects duplicate-left/no-right join readiness, projects tasks independently of storage order, and admits only the exact sequential or balanced parallel operation graph;
- a mandatory per-capsule Temporal hosting/refinement preflight now separates Lean-to-TypeScript correspondence from adapter feasibility before production implementation, and focused parallel evidence establishes the bounded Query/Update/single-loop host composition for two initial waits, both completion orders, exact intermediate Queries, duplicate delivery, concurrent submission, Update-before-Workflow completion, and live replay;
- the current Temporal Workflow is explicitly classified as a finite conformance-scenario host because its lifetime uses the scenario stimulus count; the production lifecycle and typed outcome for commands addressed after Workflow closure remain unresolved;
- R6 is complete: the CIB adapter projects multiple distinct active tasks with deterministic semantic sorting and per-element wait multiplicity while rejecting repeated live instances of one element whose activation ordinal cannot yet be derived semantically;
- the normative parallel draft profile and answer-free A-then-B/B-then-A scenarios have content-bound raw producer observations and canonical CIB evidence, and the verifier detects a dropped parallel task while accepting raw query-order reversal;
- the five-case prepared pipeline establishes exact four-target agreement for both parallel completion orders, exact intermediate task projections, five live-history replays, omitted-task projection sensitivity, and rejection of erased parallel Sequence-Flow provenance;
- the parallel rule-to-evidence matrix and assurance boundary keep the exact established claim, common-mode risks, nearest counterexamples, and unsupported production lifecycle explicit.

The active implementation boundary is [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).

## Last verified baseline

`env CI=true /opt/homebrew/bin/timeout 60 ./scripts/verify.sh` passed on 2026-07-26 after the epistemic-closure review and proposal-to-spec graduation. The full command completed in 22.04 seconds, passed twelve focused contract tests, twenty-seven semantic-core tests, twelve BPMN-source/lowering tests, nine CIB tests, nine differential unit tests, twenty-one infrastructure guards, and four Temporal integration tests; it checked seven synchronized documentation fragments and the fourteen-class/nine-property bounded CMOF manifest. The mandatory focused Temporal gate completed in 2.29 seconds and replayed the three sequential histories plus two ordered parallel histories and one concurrent-submission parallel history. The five-case four-target pipeline completed in 4.44 seconds warm with five replayed histories, exact initial and intermediate task projections, exact checked/program provenance, exact Lean lowering equality, rejection of the seeded operation-origin and parallel provenance-erasure mutations, and detection of an omitted parallel task. The separately gated representation experiment previously passed with `lake build checkSemanticRepresentationSpike && lake exe checkSemanticRepresentationSpike`.

The Lean scenario binding was additionally verified by a positive control outside the gate: changing the wrong-activation scenario's submitted activation from `2` to `3` on disk left CIB, the semantic core, and Temporal in agreement, and the pipeline failed with `lean executed different scenario content for user-task-wrong-activation: scenario.stimuli[1].taskId.activation expected 3 but was 2`. The seeded change was reverted. Its retained regression equivalents are the content-mismatch and missing-echo cases in [scenario-binding.test.mjs](../packages/differential/test/scenario-binding.test.mjs).

## Approved decisions

The owner approved the following on 2026-07-26:

- **Parallel meaning:** implement normative BPMN per-incoming-Sequence-Flow fork/join behavior under the approved bounded capsule.
- **CIB relationship:** retain `CIB-DEV-0001` as a visible candidate deviation; do not expand the current CIB profile to claim parallel compatibility.
- **Representation:** share the checked BPMN graph and Semantic Process program, while allowing Lean and TypeScript to use asymmetric internal runtime representations.
- **Definition boundary:** lower exact admitted source through a checked project-owned BPMN graph to the bounded Semantic Process IL; do not extend the topology-specific executable IR.
- **R5 — Temporal semantic-policy ownership:** completed by moving current-state task projection, stimulus well-formedness, command identity, and same-stimulus comparison behind semantic-core-owned operations; the Workflow now delegates instead of scanning trace history or maintaining policy copies.
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

The [parallel fork/join spec](capsules/PARALLEL-FORK-JOIN-SPEC.md) owns the semantic rules, observations, laws, non-law, witnesses, runtime-information invariants, evidence matrix, assurance boundary, and exclusions. The [Semantic Process IL spec](SEMANTIC-PROCESS-IL-SPEC.md) owns the checked source contract, `initiate`, `awaitUserTask`, `duplicate`, `synchronize`, and `terminate` operations, lowering, well-formedness, exact Lean proof boundary, event-growth policy, maintained obligations, and stop criteria.

## Ordered work

1. **Completed — consolidate decisions and documentation roles:** record the approved parallel meaning, CIB profile boundary, asymmetric representation decision, bounded Semantic Process IL proposal, implementation absence, A12-aligned document lifecycle, and documentation ownership.
2. **Completed — freeze executable obligations before code:** current `checkedProcess` and `semanticProcess` schemas and boundary validation reject invalid references, gateway arity, cross-artifact identity, and canonical order; Lean domain types stated the reviewed observational lowering-preservation and evaluator-soundness propositions before implementation.
3. **Completed — move R5 into the semantic core:** direct current-state task projection, exact stimulus well-formedness, command identity, and same-stimulus comparison are core operations behind focused tests; the Temporal Workflow delegates all four policies while preserving sequential Query, Update, deduplication, result, and live-replay evidence.
4. **Completed — implement checked source and lowering:** the bounded compiler projects canonical checked BPMN graphs for the existing sequential and approved balanced parallel models; deterministic lowering preserves exact source/profile/compiler identity and source origins; the topology-specific executable representation and all of its producers and consumers were replaced atomically without a legacy reader.
5. **Completed — implement the Lean definition lane:** strict decoders and independent validators accept the actual checked graph and Semantic Process program; Lean recomputes and requires exact lowering equality before evaluation; the generic program relation and explicit-choice evaluator cover all current operations with a universal soundness theorem; structural definition/origin preservation, exact parallel waits, named completion, completion-order independence, per-incoming synchronization with excess retention, token-projection permutation, and duplicate-left/no-right are checked. The stronger reviewed observational source-to-program-run proposition remains unproved because no independent checked-source operational relation exists to instantiate it without circularity.
6. **Completed — implement the independent TypeScript lane:** the generic Semantic Process evaluator executes `duplicate` and per-incoming-flow `synchronize` over explicit flow-identified token multiplicity and sorted semantic task occurrences; enum-based operation dispatch and operation-ID-stable closure avoid program collection order; sequential behavior, both completion orders, exact public intermediate/final observations, duplicate-left/no-right, excess-token, storage-order projection, operation-order closure, and invalid-program tests pass.
7. **Completed — exercise the Temporal preflight:** exact parallel source reaches both waits; A-then-B and B-then-A Updates expose the symmetric intermediate Query projections; duplicate delivery is stable; concurrent client submission realizes one permitted order recorded in history; every Update completes before Workflow completion; and all three histories replay. The finite scenario-host lifecycle remains explicit and no production post-completion command policy was silently selected.
8. **Completed — complete R6 and CIB evidence:** the CIB adapter projects multiple distinct active tasks with semantic sorting and per-element wait multiplicity; answer-free A-then-B and B-then-A scenarios retain content-bound raw/canonical evidence; the verifier accepts raw-order reversal and rejects a dropped task; the explicit replacement command cannot run accidentally; and the negative deviation probe remains outside the normative target result.
9. **Completed — complete differential comparison:** both parallel completion orders run through one five-case CIB batch, one five-result definition-bound Lean emitter, the independent TypeScript core, and ten isolated Temporal Workflows; exact intermediate task projections agree; all five primary histories replay; the comparator detects an omitted parallel task; and Lean rejects erased parallel control-place Sequence-Flow provenance.
10. **Completed — close and graduate the capsule epistemically:** the stable rule-to-evidence matrix separates normative/profile, Lean, CIB, TypeScript, Temporal, negative-witness, and mutation claims; the assurance boundary records common-mode risks and nearest counterexamples; the Semantic Process IL and parallel contracts are current `-SPEC` owners; and the production Temporal lifecycle plus full observational lowering proof remain explicit unsupported claims.
11. **Next — decide the production Temporal lifecycle before expanding BPMN scope:** research and compare host compositions that derive Workflow lifetime from semantic state, return a typed result for commands addressed after semantic completion or Workflow closure, preserve command deduplication and semantic/host identity separation, and replay under the smallest separating live-history witnesses. Record the selected contract before changing production Workflow behavior or admitting another semantic capsule.

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
- a Temporal preflight cannot map a required public semantic outcome without adding host-defined semantics;
- source and executable CIB revisions diverge;
- the feedback budget cannot be met without weakening independence or evidence.

## Exact resume point

The bounded Semantic Process IL and parallel fork/join specs, current wire contracts, contract mutations, semantic-policy ownership correction, canonical checked graph, deterministic TypeScript lowerer, Lean definition lane, independent TypeScript parallel evaluator, mandatory Temporal hosting/refinement preflight, focused parallel Temporal evidence, multiple-task CIB projection, normative parallel draft profile, content-bound balanced CIB evidence, five-case four-target differential, rule-to-evidence matrix, and assurance boundary are recorded. Lean independently checks exact lowering before evaluating the received program and closes only the checked disjoint two-task activation pair among multiple-enabled states. The parallel pipeline binds exact definitions, compares both completion orders and intermediate projections, detects one omitted projected task, rejects erased Sequence-Flow provenance, and replays five live histories. The current Workflow remains a finite scenario host rather than the production lifecycle.

Resume at ordered work item 11. Read [the Temporal execution research](TEMPORAL-EXECUTION-RESEARCH.md), [the project design](PROJECT-DESIGN.md), [the User Task interaction spec](capsules/USER-TASK-INTERACTION-SPEC.md), [the parallel fork/join spec](capsules/PARALLEL-FORK-JOIN-SPEC.md), and the adapter Workflow/runner source. Compare at least a long-lived semantic Workflow, a durable command-router or entity composition, and a closed-result/tombstone lookup boundary. Require typed post-completion command behavior, replay, duplicate delivery, Worker restart, cleanup, and identity-separation witnesses before recommending one account for owner approval.

Before beginning, run the applicable baseline in [TESTING-SPEC.md](TESTING-SPEC.md) and confirm `git status --short --branch`.
