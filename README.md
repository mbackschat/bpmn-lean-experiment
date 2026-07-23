# bpmn-lean-experiment

A versioned CIB Seven semantic profile, an executable Lean reference interpreter, a pure TypeScript reducer, and a Temporal adapter whose observable behavior is continuously checked through differential and refinement testing.

The ultimate goal is a Temporal adapter that imports BPMN 2.0.2 Process diagrams and fully satisfies OMG BPMN Process Execution Conformance, while a versioned CIB Seven profile supplies the narrower behavioral-compatibility target for real engine behavior. “BPMN Complete Conformance” is not the same goal: the standard uses that term for the combination of Process Modeling, Process Execution, BPEL Process Execution, and Choreography Modeling conformance.

The project is currently building its fast full-pipeline walking skeleton, not a BPMN engine and not a compatibility result. It preserves the complete [architecture and assurance handoff](docs/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md), ingests the official BPMN 2.0.2 sources through a local [reference corpus](docs/reference/bpmn-2.0.2/README.md), records the durable [Milestone 0 contract](docs/MILESTONE-0-FAST-PIPELINE.md), compiles the first implementation-neutral Lean scenario and observation vocabulary, and uses explicitly provisional [semantic-representation experiments](docs/experiments/SEMANTIC-REPRESENTATION-SPIKES.md) to test expensive foundational risks before choosing a production IR.

## Current boundary

| Surface | Current state |
|---|---|
| Normative BPMN target | BPMN 2.0.2 Process Execution Conformance is identified; its coverage ledger and semantics are not implemented |
| CIB semantic profile | Versioned Milestone 0 draft pins CIB Seven `v2.2.0`, the single slice, environment, observations, and exclusions; it is not compatibility evidence |
| Lean | Pinned Lean 4.31.0 project with profile-independent outcomes, neutral scenario/trace/runner types, executable contract locks, and a separately gated provisional representation spike |
| TypeScript reducer | Not initialized; it must follow the approved profile and remain independent of CIB Seven and Temporal |
| Temporal adapter | Not initialized; it must refine the reducer rather than define BPMN behavior |
| CIB Seven oracle | `v2.2.0` is selected for Milestone 0 and its public-API test precedents are recorded; no executable oracle runner exists yet |
| Assurance | M0.0 planning and M0.1 neutral contract are verified; no differential, refinement, replay, or BPMN conformance evidence exists yet |

## Quick start

```sh
./scripts/verify.sh
```

Start with the [documentation registry](docs/README.md), then read the [BPMN conformance target](docs/BPMN-CONFORMANCE-TARGET.md), [Milestone 0 contract](docs/MILESTONE-0-FAST-PIPELINE.md), [implementation map](docs/IMPLEMENTATION-MAP.md), and [current plan](docs/PLAN.md). Research and bounded experiment indexes route deeper work without expanding the required startup set.
