# Project design

The project’s durable goal is a Temporal adapter that imports BPMN 2.0.2 Process diagrams and fully satisfies OMG BPMN Process Execution Conformance. That normative goal is implemented and assured through a versioned CIB Seven semantic profile, an executable Lean reference interpreter, a pure TypeScript reducer, and continuous differential and refinement testing.

The BPMN and CIB targets are related but not interchangeable. BPMN 2.0.2 defines the normative Process Execution Conformance obligation. A versioned CIB Seven profile defines a concrete behavioral-compatibility claim for a pinned release and observation boundary where the standard is ambiguous, non-operational, configuration-dependent, extended, or observably different.

The complete architecture contract is the [architecture and assurance handoff](ARCHITECTURE-AND-ASSURANCE-HANDOFF.md), and the exact standard-facing goal is owned by the [BPMN conformance target](BPMN-CONFORMANCE-TARGET.md). This document owns only the project-local constitution and the first delivery boundary.

## Decision

Build independent implementations that agree through a neutral profile, scenario vocabulary, canonical observations, and evidence. CIB Seven remains a complete external oracle rather than a reusable semantic kernel. Lean turns the standard, profile decisions, and observed behavior into an executable operational account with machine-checked properties. TypeScript provides the production semantic reducer without Temporal or CIB dependencies. Temporal provides durable hosting and hidden orchestration work without becoming a BPMN semantic authority.

Lean’s purpose is not merely to document an already finished adapter. It should accelerate implementation by making ambiguous rules, state distinctions, preservation obligations, counterexamples, generated traces, and refinement relations executable before they are duplicated in TypeScript and Temporal.

## Initial delivery boundary

Required now:

- preserve the handoff inside the repository;
- ingest the normative BPMN 2.0.2 sources and identify the exact conformance target;
- establish project-specific contributor and documentation rules;
- pin a dependency-free Lean toolchain;
- encode only profile-independent distinctions already required by the handoff;
- make the initial profile decisions explicit and owner-reviewable;
- retain exact provenance for reference checkouts;
- provide repeatable build and test commands.

Optional after owner approval:

- calibrate an embedded CIB Seven oracle against the selected release and environment;
- define the first immutable semantic profile;
- implement the Phase 1 sequential Lean semantics and neutral scenarios;
- introduce the pure TypeScript reducer against the same approved contract;
- introduce Temporal only after reducer behavior is independently executable and comparable.

Excluded from this first delivery:

- claims of BPMN conformance or CIB compatibility;
- profile-dependent BPMN execution behavior;
- a machine-readable profile or scenario format chosen without a consumer;
- CIB Seven extraction, forking, or runtime linkage from the semantic core;
- TypeScript, Temporal, Java, database, or test dependencies;
- differential, refinement, replay, or generated-test infrastructure.

## Success criteria

The initial setup is complete when:

1. a new contributor can identify the authority boundaries, current scope, sources, and next decisions without external context;
2. `lake build` and `lake test` pass with the pinned toolchain and no external Lake package;
3. the Lean vocabulary distinguishes semantic command outcomes from harness failure without claiming BPMN behavior;
4. no unapproved semantic-profile choice is encoded as fact;
5. exact reference revisions and the handoff’s source/executable revision mismatch are visible;
6. the repository contains no machine-specific paths, redistributed full OMG specification conversion, or copied reference implementation code.

The exact current state is maintained in the [implementation map](IMPLEMENTATION-MAP.md), while the next owner decisions and work sequence are maintained in the [plan](PLAN.md).
