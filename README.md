# bpmn-lean-experiment

A versioned CIB Seven semantic profile, an executable Lean reference interpreter, a pure TypeScript reducer, and a Temporal adapter whose observable behavior is continuously checked through differential and refinement testing.

The ultimate goal is a Temporal adapter that imports BPMN 2.0.2 Process diagrams and fully satisfies OMG BPMN Process Execution Conformance, while a versioned CIB Seven profile supplies the narrower behavioral-compatibility target for real engine behavior. “BPMN Complete Conformance” is not the same goal: the standard uses that term for the combination of Process Modeling, Process Execution, BPEL Process Execution, and Choreography Modeling conformance.

The project is currently a verified foundation, not a BPMN engine and not a compatibility result. It preserves the complete [architecture and assurance handoff](docs/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md), ingests the official BPMN 2.0.2 sources through a local [reference corpus](docs/reference/bpmn-2.0.2/README.md), exposes the unresolved profile decisions, and compiles a deliberately small Lean vocabulary for command and harness outcomes.

## Current boundary

| Surface | Current state |
|---|---|
| Normative BPMN target | BPMN 2.0.2 Process Execution Conformance is identified; its coverage ledger and semantics are not implemented |
| CIB semantic profile | Candidate decisions are recorded; no profile is approved or versioned |
| Lean | Pinned Lean 4.31.0 project with profile-independent outcome distinctions and executable conformance locks |
| TypeScript reducer | Not initialized; it must follow the approved profile and remain independent of CIB Seven and Temporal |
| Temporal adapter | Not initialized; it must refine the reducer rather than define BPMN behavior |
| CIB Seven oracle | Source reference cloned at the handoff’s investigated revision; executable oracle release remains an owner decision |
| Assurance | Documentation and test boundaries exist; no differential, refinement, replay, or BPMN conformance evidence exists yet |

## Quick start

```sh
lake build
lake test
```

Start with the [documentation registry](docs/README.md), then read the [BPMN conformance target](docs/BPMN-CONFORMANCE-TARGET.md), [project design](docs/PROJECT-DESIGN.md), [implementation map](docs/IMPLEMENTATION-MAP.md), and [current plan](docs/PLAN.md).
