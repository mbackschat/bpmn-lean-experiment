# Project design

The project’s durable goal is a Temporal adapter that imports BPMN 2.0.2 Process diagrams and fully satisfies OMG BPMN Process Execution Conformance. That normative goal is implemented and assured through a versioned CIB Seven semantic profile, an executable Lean reference interpreter, a pure TypeScript semantic core, and continuous differential and refinement testing.

The BPMN and CIB targets are related but not interchangeable. BPMN 2.0.2 defines the normative Process Execution Conformance obligation. A versioned CIB Seven profile defines a concrete behavioral-compatibility claim for a pinned release and observation boundary where the standard is ambiguous, non-operational, configuration-dependent, extended, or observably different.

The complete architecture contract is the [architecture and assurance handoff](ARCHITECTURE-AND-ASSURANCE-HANDOFF.md), and the exact standard-facing goal is owned by the [BPMN conformance target](BPMN-CONFORMANCE-TARGET.md). This document owns only the project-local constitution and the first delivery boundary.

The preserved handoff calls the TypeScript component a “reducer.” The project now calls the same component the **semantic core**, describes it formally as a semantic transition system, and names its public transition operation `applyStimulus`. This vocabulary change avoids an unnecessary Redux association and does not alter the component boundary.

## Decision

Build independent implementations that agree through a neutral profile, scenario vocabulary, canonical observations, and evidence. CIB Seven remains a complete external oracle rather than a reusable semantic kernel. Lean turns the standard, profile decisions, and observed behavior into an executable operational account with machine-checked properties. TypeScript provides the production semantic core without Temporal or CIB dependencies. Temporal provides durable hosting and hidden orchestration work without becoming a BPMN semantic authority.

Lean’s purpose is not merely to document an already finished adapter. It should accelerate implementation by making ambiguous rules, state distinctions, preservation obligations, counterexamples, generated traces, and refinement relations executable before they are duplicated in TypeScript and Temporal.

## Milestone 0 delivery boundary

Required now:

- retain the verified foundation and source boundaries;
- establish the complete fast walking-skeleton pipeline defined in [MILESTONE-0-FAST-PIPELINE.md](MILESTONE-0-FAST-PIPELINE.md);
- use actual BPMN XML for the none-start → User Task → none-end slice;
- calibrate pinned CIB Seven behavior through public APIs;
- execute the same neutral scenario in Lean and a pure TypeScript semantic core;
- host the semantic core through a Temporal adapter without moving semantics into Temporal;
- compare canonical traces and replay retained history;
- measure and meet the warm and cold feedback budgets.

Excluded from this first delivery:

- claims of BPMN conformance or CIB compatibility;
- BPMN features outside the single sequential User Task slice;
- CIB Seven extraction, forking, or runtime linkage from Lean or the semantic core;
- production Temporal deployment concerns;
- broad conformance, MIWG, or CIB-suite execution before the walking skeleton is fast.

## Success criteria

Milestone 0 is complete when:

1. a new contributor can resume from repository documentation without chat history;
2. the single scenario executes through CIB, Lean, the semantic core, and Temporal;
3. all targets agree through the canonical observation contract;
4. an injected semantic disagreement is classified correctly;
5. retained Temporal history replays deterministically;
6. repeated runs prove isolation and cleanup;
7. the measured semantic and full-pipeline feedback loops meet their budgets;
8. no public claim or dependency crosses its declared boundary.

The exact current state is maintained in the [implementation map](IMPLEMENTATION-MAP.md), while the next owner decisions and work sequence are maintained in the [plan](PLAN.md).
