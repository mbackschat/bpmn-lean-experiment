# Plan

This document owns the current checkpoint, ordered next work, unresolved decisions, and exact resume point. Durable architecture belongs in [PROJECT-DESIGN.md](PROJECT-DESIGN.md); exact supported and absent surfaces belong in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md); test procedure belongs in [TESTING.md](TESTING.md).

## Current checkpoint

The bounded `None Start Event → User Task → None End Event` capsule is evidence-closed as a draft:

- exact BPMN bytes are admitted and compiled to current project-owned executable IR;
- the current profile and three answer-free scenarios use one structural contract with content-bound CIB evidence;
- CIB Seven, Lean, the TypeScript semantic core, and Temporal agree exactly for completion, wrong activation, and stale completion;
- Lean proves evaluator soundness for internal steps, exact completion, quantified full-occurrence mismatch rejection with state preservation, and the element-only identity non-law;
- Temporal uses Query plus acknowledged Update, checks duplicate logical delivery, and replays all current live histories on a fresh in-memory server;
- seeded task-activation disagreement, target isolation, CIB cleanup, process cleanup, and feedback budgets are executable;
- Lean echoes the exact scenario content it executed and the harness rejects any drift from the admitted scenario document, so matching scenario identity can no longer hide changed scenario content;
- each rule's CIB evidence carries an explicit `engine-observed`, `adapter-derived`, or `adapter-decided` fidelity, and the wrong-activation refusal is recorded as adapter-decided;
- Lean and the TypeScript semantic core are recorded as independent transcriptions of one reviewed account rather than independent accounts;
- pre-release prototype compatibility paths, embedded wire-format counters, old milestone artifacts, committed Temporal histories, Workflow patch branches, and legacy IR readers have been removed;
- the central [CIB–BPMN register](CIB-BPMN-RELATION.md) records all reviewed relationships and currently contains no candidate or confirmed deviation.

The active implementation boundary is [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).

## Last verified baseline

`/usr/bin/time -p env CI=true /opt/homebrew/bin/timeout 300 ./scripts/verify.sh` passed on 2026-07-24 in 21.03 seconds real time. Its prepared three-case four-target pipeline completed in 4.88 seconds warm and replayed three live histories. The separately gated representation experiment passed with `lake build checkSemanticRepresentationSpike && lake exe checkSemanticRepresentationSpike`.

The Lean scenario binding was additionally verified by a positive control outside the gate: changing the wrong-activation scenario's submitted activation from `2` to `3` on disk left CIB, the semantic core, and Temporal in agreement, and the pipeline failed with `lean executed different scenario content for user-task-wrong-activation: scenario.stimuli[1].taskId.activation expected 3 but was 2`. The seeded change was reverted. Its retained regression equivalents are the content-mismatch and missing-echo cases in [scenario-binding.test.mjs](../packages/differential/test/scenario-binding.test.mjs).

## Next proposed semantic capsule

Research and draft a minimal parallel fork/two User Task waits/parallel join capsule. Do not implement profile-dependent semantics until the owner approves the draft.

The capsule must separate at least these competing accounts:

1. one count-only join state versus incoming-flow provenance;
2. a single linear active-node state versus multiplicity-preserving concurrent tokens or activations;
3. evaluator branch order versus semantic completion-order independence;
4. echo-bound compiled-in Lean inputs versus admitted executable-IR correspondence.

The smallest candidate model is:

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

Required draft outputs:

- exact BPMN 2.0.2 clauses, figures, normative metamodel facts, and relevant open issues;
- the smallest pristine CIB probe and relationship classification;
- positive witnesses for `A then B` and `B then A`;
- a negative witness showing two arrivals through one incoming flow cannot satisfy the join;
- proposed source, executable-IR, runtime-token, scope, scheduler-choice, command, and observation distinctions;
- proposed stable rule IDs, useful Lean laws, nearest non-law, and mutation points;
- an explicit assessment of whether the provisional representation spike supplies useful candidate types or should be discarded;
- a concrete plan to make Lean consume the admitted executable IR without introducing a general semantic DSL; scenario content is already echo-bound and verifier-checked, so the remaining gap is the compiled-in executable definition itself;
- an explicit decision on whether the capsule specifies only its observable contract so that the Lean account and the TypeScript semantic core may choose different runtime representations, recorded per [the two kinds of independence](PROJECT-DESIGN.md#two-kinds-of-independence).

## Ordered work

1. Read the applicable normative clauses and current [representation research](research/SEMANTIC-REPRESENTATIONS.md).
2. Review the provisional [semantic-representation experiment](experiments/SEMANTIC-REPRESENTATION-SPIKES.md) against the concrete parallel consumer.
3. Create a capsule draft with competing accounts and separating witnesses; do not edit production semantics yet.
4. Run the smallest CIB probe on the pristine pinned lane and classify its relationship to BPMN.
5. Present the draft, profile expansion, any dependency implication, and unresolved interpretation to the owner for approval.
6. After approval, close the capsule lane by lane: contract red test, CIB evidence, Lean relation/evaluator/laws/non-law, independent TypeScript core, Temporal refinement/live replay, differential mutation, docs, and closure review.

## Explicitly deferred

- assignment, users/groups, authorization, forms, variables, expressions, and data associations;
- global task discovery or Search Attributes;
- messages, timers, Activities, retries, cancellation, incidents, compensation, and event subprocesses;
- multi-instance, loops, migration, and Continue-As-New;
- general BPMN source/IR generation or a semantic DSL;
- immutable profile or production Event History compatibility;
- public BPMN conformance or broad CIB compatibility claims.

## Stop conditions

Stop for owner direction if:

- BPMN and pinned CIB evidence leave multiple materially different semantic accounts;
- the profile feature or observation boundary would expand beyond the approved capsule;
- a dependency addition, removal, replacement, or upgrade is required;
- a representation would be generalized without a second concrete consumer and separating mutation;
- source and executable CIB revisions diverge;
- the feedback budget cannot be met without weakening independence or evidence;
- implementation would silently select CIB behavior over clear BPMN requirements or vice versa.

## Exact resume point

The pre-capsule corrections from the strategic review are landed: the Lean scenario binding, the per-rule oracle-evidence fidelity, the transcription-versus-account independence wording, and the evidence-lane definition. No semantic behavior changed.

Start with the parallel-capsule research draft. First read [BPMN-CONFORMANCE-TARGET.md](BPMN-CONFORMANCE-TARGET.md), [CIB-BPMN-RELATION.md](CIB-BPMN-RELATION.md), [research/SEMANTIC-REPRESENTATIONS.md](research/SEMANTIC-REPRESENTATIONS.md), [experiments/SEMANTIC-REPRESENTATION-SPIKES.md](experiments/SEMANTIC-REPRESENTATION-SPIKES.md), and the current [User Task capsule](capsules/USER-TASK-INTERACTION.md). Then identify the normative parallel-gateway join rule and design the smallest CIB probe that distinguishes incoming-flow provenance from arrival count.

Before beginning, run the applicable baseline in [TESTING.md](TESTING.md) and confirm `git status --short --branch`.
