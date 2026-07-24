# Implementation map

This document is the sole detailed owner of current implementation, proof, evidence, and absence status. It describes the repository now, not milestone history.

## Current claim

The repository has an evidence-closed **draft** semantic capsule for one private executable `None Start Event → User Task → None End Event` Process. Exact completion, wrong activation, and stale completion agree across pinned CIB Seven, the Lean reference interpreter, the independent TypeScript semantic core, and the Temporal adapter at the declared canonical observation boundary.

This is not a general BPMN engine, an OMG conformance result, or an immutable CIB compatibility profile.

## Implemented and absent surfaces

| Surface | Implemented | Explicitly absent |
|---|---|---|
| Project foundation | Lean 4.31.0/Lake 5.0; Node 24.18.0; pnpm 11.17.0; TypeScript 7.0.2; Ajv 8.20.0; Java 21; Temporal SDK 1.21.0 and CLI v1.8.1; MIT licensing for project-authored material; shared `CLAUDE.md`/`AGENTS.md`; documentation ownership; source-synchronized walkthrough; focused and full gates | CI/release packaging, published libraries, production deployment |
| Wire contracts | One current structural schema per semantic profile, scenario, canonical result, and CIB evidence; stable document kinds; semantic profile identity; exact scenario/profile content binding; answer-free target scenarios; mutation tests; pre-release guard against embedded format counters and milestone compatibility paths | Parallel legacy schemas, migration readers, compatibility switches, general assertion language |
| Semantic profile | One draft `cibseven-2.2.0-user-task-draft` profile pins oracle revision, Java/H2/history/job/clock environment, selected features, observation boundary, exclusions, and known CIB–BPMN relationship IDs | Immutable compatibility profile, full requirement classification, approved gap interpretations, selected CIB extensions, confirmed or candidate deviations |
| BPMN source | Exact byte capture and SHA-256; UTF-8/security preflight; private `bpmn-moddle@10.0.0` import; warning/reference-loss rejection; bounded compiler for one sequential topology; current project-owned IR with source/profile/compiler identity and User Task metadata; checked partial CMOF facts; optional MIWG admission observation | General BPMN compiler, synchronous parser CPU isolation, non-UTF-8 decoder, source locations, extension semantics, DI-preserving export, complete CMOF binding, deployment store |
| Lean | Profile-independent outcome/scenario vocabulary; sequential definition/runtime separation; exact task-occurrence identity; external admission plus bounded internal closure; declarative `InternalMicroStep` relation and evaluator soundness; exact-completion theorem; quantified mismatch rejection/state-preservation theorem; wrong-activation corollary; element-only identity non-law; exact/wrong/stale result emitter that echoes the exact scenario content it executed | BPMN parser, arbitrary executable-IR consumer, compiler correctness, general token/scope/concurrency/variable/effect model, TypeScript or Temporal correspondence proof, general input transport; the echo is a verifier-checked binding, not IR consumption |
| TypeScript semantic core | Dependency-free executable-IR and runtime contracts; structural admission; pure `applyStimulus`; deterministic internal closure; state-derived open tasks and enabled interactions; incremental deploy/advance and full scenario evaluation; exact/wrong/stale tests; identity/topology rejection | I/O, parser, Temporal SDK, CIB dependency, general BPMN state model, effects, timers, scheduling |
| CIB oracle | Pinned CIB Seven `2.2.0` embedded runner; exact deploy/start/query/complete; generated-task-to-semantic-occurrence mapping; exact/wrong/stale witnesses; content-bound evidence; persistent JSON-lines batch; PVM diagnostic projection; timings and full cleanup | Reused CIB PVM algorithms/types as project semantics, broad CIB corpus adoption, general compatibility claim |
| Temporal adapter | One generic Workflow receives current executable IR; one semantic loop calls the core; open-task Query; acknowledged completion Update; logical-command deduplication; three-case batch on one clean in-memory server; two isolated executions per case in the pipeline; exact Update-history inspection; same-gate live replay and cleanup | Signal compatibility path, committed Event History fixtures, patch branches, legacy IR fallback, production history baseline, Activities, timers, Search Attributes, Continue-As-New, Worker restart/versioning, fault injection, task inbox |
| Differential pipeline | Three answer-free cases; one CIB batch; one Lean result emitter; one core batch; six Temporal executions; exact four-target agreement; retained-CIB comparison; exact Query/Update evidence; seeded activation mutation; Lean scenario-binding rejection of any drift from the admitted scenario document, with retained content-mismatch and missing-echo mutations; live replay; isolation, cleanup, provenance, timings, and budgets | Universal equivalence, majority voting, general conformance suite; uncorrelated Lean and TypeScript account failure |
| BPMN conformance | Ultimate Process Execution Conformance target and evidence-lane discipline are explicit; MIWG and CIB/Betsy adoption strategies are researched | Any implemented OMG conformance point or conformance claim |

## Current evidence

Each rule's CIB evidence carries an explicit `engine-observed`, `adapter-derived`, or `adapter-decided` fidelity in [the User Task capsule](capsules/USER-TASK-INTERACTION.md#oracle-evidence-fidelity). The wrong-activation refusal is adapter-decided, so its four-target agreement is not four independent derivations of the ordinal rule.

The complete prepared pipeline currently requires:

- exact agreement for `user-task-discovery-completion`, `user-task-wrong-activation`, and `user-task-stale-completion`;
- equality between current CIB execution and content-bound retained CIB evidence;
- the same waiting projection for successful and wrong-activation inputs before completion;
- exact state preservation after wrong and stale completion rejection;
- equality between pure-core and both isolated Temporal results;
- correct Query projection and Update outcomes;
- duplicate logical-command stability;
- classified disagreement after activation `1` is mutated to `2`;
- a rejected Lean scenario binding when the admitted scenario content and Lean's echoed scenario differ;
- three fetched live histories replayed before server shutdown;
- clean CIB and Temporal teardown.

The current full pipeline is comfortably inside the 15-second warm and 45-second cold budgets. Exact latest measurements and commands belong in [TESTING.md](TESTING.md) and [PLAN.md](PLAN.md), not in this inventory.

## Nearest unsupported claim

The nearest structurally important unsupported claim is parallel execution: a fork creating two simultaneous User Task waits followed by a parallel join. It would force token multiplicity, incoming-flow provenance, completion-order independence, executable-IR generalization, Lean input correspondence, and Temporal refinement beyond a linear control-state machine.
