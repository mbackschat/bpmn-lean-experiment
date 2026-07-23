# Implementation map

This document is the sole detailed owner of current implementation, proof, and evidence status.

| Surface | Implemented | Explicitly absent |
|---|---|---|
| Project contract | Pinned Lean 4.31.0/Lake 5.0 setup; shared `CLAUDE.md`/`AGENTS.md` guidance; project and documentation ownership; command-versus-harness outcome vocabulary | License decision, release process, CI, packaging |
| Milestone 0 pipeline | Durable walking-skeleton scope, shared runner contract, performance budgets, work packages, dependency gates, acceptance criteria, and resume protocol | Scenario fixture, runners, comparator, timings, replay, end-to-end execution |
| BPMN 2.0.2 source | Official 532-page PDF downloaded; digital-first Markdown conversion with 333 linked figures; eleven normative machine-readable files; hashes, provenance, conformance digest, and Git-ignore boundary | Requirement-level coverage ledger, errata register, formalized metamodel, XML ingestion |
| BPMN conformance | Process Execution Conformance identified as the ultimate normative target; modeling/BPEL/choreography scope separated; import/admission and external-suite claim boundaries recorded | Any implemented conformance point or conformance claim |
| Semantic profile | Candidate choices and approval gate in [PLAN.md](PLAN.md); artifact policy in [profiles/README.md](../profiles/README.md) | Approved identity, immutable profile definition, feature matrix, interpretations, deviations, unsupported-feature register |
| Lean | `CommandOutcome`, `ScenarioOutcome`, `isCommit`, compile-time separating examples, executable `lake test` driver | BPMN model, static semantics, runtime state, microsteps, command closure, observation model, trace semantics, interpreter, proofs, model checking |
| TypeScript reducer | Architecture boundary documented | Node/pnpm workspace, types, reducer, effects, observations, tests |
| Temporal adapter | Architecture boundary documented; official TypeScript SDK source available read-only | SDK dependency, workflow code, timers, Activities, replay tests, refinement evidence |
| CIB Seven oracle | Exact investigated source checkout and `v2.2.0` tag provenance recorded; inherited Camunda baseline, byte-identical test trees, corpus size, harness pattern, and first extraction families characterized | Java oracle driver, pinned executable artifacts, H2 environment, controlled clock, scheduler, canonical projection, cleanup tests, converted neutral cases |
| Scenarios and observations | Neutral protocol requirements retained in the handoff; Milestone 0 scenario, observation, runner, and comparison contracts documented; artifact policy in [scenarios/README.md](../scenarios/README.md) | Machine-readable schema, BPMN cases, canonical observation implementation, comparator, traces, regressions |
| Assurance | Red/green Lean scaffold test; BPMN MIWG interchange corpus and Betsy historical execution benchmark pinned read-only; external evidence lanes and adoption policies documented | Executed interchange results, BPMN conformance evidence, CIB/Lean/TypeScript differential evidence, Temporal refinement evidence, replay evidence, compatibility report |

The current Lean examples prove only that the declared outcome constructors remain distinct and that `isCommit` recognizes only the `committed` constructor. They do not prove any BPMN, CIB Seven, reducer, or Temporal property.
