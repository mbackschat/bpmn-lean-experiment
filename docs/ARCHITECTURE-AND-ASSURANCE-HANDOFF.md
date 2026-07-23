# Architecture and Assurance Handoff: A Versioned CIB-seven BPMN Semantic Profile with Lean, TypeScript, and Temporal

**Document status:** Architecture and assurance handoff
**Primary audience:** Coding agents and engineers responsible for formal semantics, workflow-runtime behavior, conformance infrastructure, and Temporal integration
**Purpose:** Define the motivation, boundaries, semantic contracts, component responsibilities, assurance strategy, and acceptance criteria for a BPMN execution system whose observable behavior is compatible with a pinned CIB-seven reference engine
**Deliberate exclusion:** This document does not prescribe implementation algorithms, code structures, APIs, data structures, libraries, repository layout, deployment topology, or other code-level design choices

---

## Executive summary

The project aims to create a BPMN execution system with four mutually reinforcing parts:

1. **A versioned CIB-seven semantic profile** that defines exactly which CIB-seven release, configuration, BPMN features, extensions, observable behaviors, ambiguity decisions, and known deviations constitute the compatibility target.
2. **An executable Lean reference interpreter** that gives the selected profile a precise operational meaning and supports machine-checked reasoning about runtime behavior.
3. **A pure TypeScript reducer** that implements the same semantic contract independently of both CIB seven and Temporal.
4. **A Temporal adapter** that provides durable execution while preserving the reducer’s externally observable BPMN behavior.

The central architectural principle is **independent semantic agreement rather than shared implementation**. CIB seven remains a complete, pinned production engine used as an executable behavioral oracle. The Lean model is the formal reference. The TypeScript reducer is the independently developed executable core. Temporal is a durability and orchestration substrate around that core, not the authority for BPMN semantics.

Compatibility is established continuously through two complementary forms of evidence:

- **Differential testing** compares CIB seven, the Lean interpreter, and the TypeScript reducer under identical models, profiles, inputs, time, and scheduler choices.
- **Refinement testing and proof obligations** establish that the TypeScript reducer implements the Lean semantics and that the Temporal adapter adds only permitted hidden execution steps while preserving visible BPMN behavior.

The target is not an unrestricted claim of “full BPMN 2.0 compliance” or “100% CIB-seven compatibility.” The defensible claim is versioned and bounded:

> For a declared BPMN execution profile, pinned CIB-seven release and configuration, and documented observation boundary, the system’s observable execution behavior is continuously checked against CIB seven and related to an executable Lean operational semantics. Unsupported constructs, specification ambiguities, CIB extensions, configuration dependencies, and known deviations are explicitly recorded.

The source investigation underlying this handoff established that CIB seven is suitable as an embedded behavioral oracle, but not as a small reusable semantic kernel. Its production behavior is distributed across BPMN parsing, behavior objects, Process Virtual Machine execution, persistent runtime entities, jobs, subscriptions, commands, and transaction infrastructure. Extracting those parts would create another engine requiring its own conformance effort and would reduce the independence of differential testing.

---

## 1. Problem statement

The project is motivated by a specific integration goal:

- BPMN 2.0 process models should have a precise executable meaning.
- That meaning should be close enough to CIB seven that existing models and users observe compatible behavior within a declared scope.
- The process logic should run durably on Temporal.
- The semantic core should remain understandable, testable, and formally analyzable independently of Temporal.
- Compatibility claims should be supported by reproducible evidence rather than informal similarity.

These goals create a difficult boundary problem. BPMN defines a broad notation and metamodel, but many execution details are underspecified, configurable, or interpreted differently by engines. CIB seven supplies concrete behavior, but it is a production engine whose semantics is intertwined with persistent infrastructure. Temporal supplies durable workflows, timers, message delivery, Activities, retry behavior, replay, and continuation, but its abstractions do not directly coincide with CIB-seven jobs, external tasks, incidents, transaction boundaries, activity instances, or BPMN event semantics.

A direct translation from BPMN XML into ad hoc TypeScript workflow code would therefore leave several unresolved questions:

- Which interpretation of BPMN is intended?
- Which CIB-seven behaviors are compatibility requirements rather than incidental internals?
- How are transaction boundaries and rollback represented when the runtime is Temporal?
- Which retries belong to BPMN/CIB semantics and which belong to Temporal transport?
- How are event races, cancellation, message subscriptions, timer visibility, and multi-instance destruction represented?
- How is deterministic replay kept separate from BPMN scheduling semantics?
- How can compatibility be checked when CIB seven and Temporal use fundamentally different internal representations?
- How can changes to the formal model, reducer, adapter, or CIB version be detected before they silently change behavior?

The proposed architecture answers these questions by separating the concerns into explicit semantic, executable, durable, and assurance layers.

---

## 2. Desired outcome

The completed system should provide a controlled semantic chain:

```text
BPMN model and semantic profile
            │
            ▼
Executable Lean operational semantics
            │
            ▼
Independent pure TypeScript reducer
            │
            ▼
Temporal durability adapter
            │
            ▼
CIB-compatible public observations
```

In parallel, the same BPMN models and scenario stimuli are executed against a pinned CIB-seven engine:

```text
BPMN model + profile + scenario
            │
     ┌──────┼───────────┐
     ▼      ▼           ▼
 CIB seven  Lean     TypeScript
  oracle   reference    reducer
     └──────┼───────────┘
            ▼
Canonical semantic comparison
```

The architecture should produce more than a running engine. It should produce an **auditable compatibility body of evidence** containing:

- a versioned semantic profile;
- a BPMN requirement matrix;
- an interpretation register;
- an unsupported-feature register;
- a CIB deviation register;
- an executable Lean model;
- proof results and bounded model-checking results;
- a neutral scenario and observation vocabulary;
- a differential conformance corpus;
- minimized regression cases;
- reducer-versus-Lean refinement evidence;
- Temporal replay and adapter-refinement evidence;
- a generated compatibility report for every supported profile version.

---

## 3. Foundational distinctions

Several distinctions must remain explicit throughout the project. Collapsing any of them would undermine the compatibility claim.

### 3.1 BPMN is normative; CIB seven is behavioral

The OMG BPMN specification is the normative source for BPMN semantics. CIB seven is an executable implementation whose behavior is valuable where the specification is ambiguous, underspecified, configuration-dependent, or extended by CIB-specific attributes.

The intended precedence is:

| Situation | Required treatment |
|---|---|
| BPMN is clear and CIB agrees | Treat the behavior as both normative and CIB-compatible. |
| BPMN is ambiguous or underspecified | Follow the pinned CIB behavior within the CIB compatibility profile and record the interpretation. |
| CIB does not support a construct | Mark it unsupported for that profile; do not infer behavior. |
| CIB behavior depends on configuration | Make the configuration part of the profile. |
| CIB clearly differs from BPMN | Preserve CIB behavior in the CIB compatibility profile and record the normative deviation. |
| The project intentionally chooses different behavior | Define a separate non-CIB profile rather than silently weakening compatibility. |

CIB seven must therefore never be described as the universal BPMN semantic authority. It is the behavioral oracle for a particular compatibility profile.

### 3.2 A semantic profile is not an engine build

An engine binary alone does not define behavior. Observable results can depend on:

- release and source revision;
- edition;
- database and transaction integration;
- history level;
- expression language and type conversion;
- serializer configuration;
- time zone and clock behavior;
- automatic job acquisition;
- retry policies;
- listener configuration;
- supported extensions;
- model-deployment rules;
- public observation boundary.

The compatibility target is therefore a **profile**, not merely “CIB seven.”

### 3.3 Internal representation is not the compatibility boundary

CIB seven uses a persistent execution tree and PVM activity graph. A Lean interpreter may use a mathematical transition system. The TypeScript reducer may use another immutable or mutable representation. Temporal introduces workflow histories, tasks, Activities, timers, messages, and runs.

These representations do not need to be structurally identical. Compatibility requires equivalent consequences at the declared observation boundary.

For example:

- Raw CIB execution-entity counts are normally internal.
- Active path multiplicity, scope instances, activity instances, waits, interruption, and completion are semantic.
- Database table layouts are internal unless database compatibility is explicitly promised.
- Literal job identifiers are usually opaque, but identity stability, association, due time, retries, failure, and addressability may be observable.
- Exact JDBC transaction nesting is internal, but visible commit, rollback, retry, and incident behavior is semantic.
- Temporal replay steps are internal, but their effect on externally visible BPMN state must be absent.

### 3.4 Microsteps are not commands

A BPMN engine may perform many internal lifecycle transitions in response to one external command. For example, completing a user task may leave the activity, invoke listeners, take sequence flows, traverse gateways, enter new scopes, create subscriptions, and finally reach a stable wait state.

The semantic model must distinguish:

- **Microsteps:** individual internal semantic transitions.
- **Commands:** externally initiated operations that may trigger multiple microsteps.
- **Commit or rollback:** the observable outcome of the command boundary.
- **Stable state:** a state in which no immediate internal semantic work remains.
- **External waiting:** a valid stable condition that requires a new stimulus.
- **Scheduler waiting:** a state containing jobs or timers that require an explicit scheduler action.
- **Deadlock:** a nonterminal state with no permitted internal or external progress.
- **Divergence:** an infinite internal execution that never reaches a stable state.

A generic “run until quiescent” instruction is insufficient unless these distinctions are formally defined.

### 3.5 Differential testing is not formal proof

Differential testing can establish strong empirical agreement over a carefully designed corpus and generated bounds. It cannot prove behavior for all possible models and input sequences.

Lean can prove properties of the formal semantics and the executable interpreter. It cannot automatically prove that CIB seven, the TypeScript compiler/runtime, Temporal Server, databases, external service implementations, and network infrastructure are correct.

The assurance story must state exactly which conclusions are proven, which are tested, and which components remain trusted.

---

## 4. Compatibility scope

### 4.1 Recommended target level

The recommended primary target is **public CIB execution compatibility**, not technical drop-in replacement.

This target includes, subject to the declared profile:

- control-flow behavior;
- activity and scope lifecycle;
- user tasks and receive waits;
- variables and variable visibility;
- messages, signals, timers, and event subscriptions;
- boundary events and event subprocesses;
- gateway behavior;
- subprocesses and call activities;
- multi-instance behavior;
- command commit and rollback;
- asynchronous continuations;
- jobs, retries, incidents, and external tasks;
- listener behavior where publicly included;
- activity-instance projections;
- supported CIB BPMN extensions.

### 4.2 Compatibility levels

The profile should state one or more cumulative levels.

#### Level 1: BPMN execution semantics

This level compares:

- process status;
- active elements;
- active scope and activity instances;
- path multiplicity;
- wait states;
- events;
- variables;
- process completion;
- interruption and termination;
- BPMN errors and failures.

Internal architecture is unrestricted.

#### Level 2: Public CIB execution compatibility

This level additionally compares:

- user-task lifecycle;
- timer and job behavior;
- message and signal correlation;
- asynchronous continuation boundaries;
- public listener callbacks and their relevant ordering;
- variable scoping and visibility;
- command rollback behavior;
- retries and incidents;
- external-task lifecycle;
- activity-instance and other declared public projections;
- supported CIB extension attributes.

This is the recommended product target.

#### Level 3: Technical drop-in replacement

This level would additionally require compatibility with:

- CIB database schemas;
- internal APIs;
- plugin contracts;
- history schemas;
- process modification and migration internals;
- cluster behavior;
- operational tooling;
- database upgrade procedures.

This level conflicts with the goal of a small, independently formalized semantic engine and is outside the proposed scope unless later introduced as a separate product initiative.

### 4.3 Explicit non-goals

Unless a future profile states otherwise, the semantic project excludes:

- authorization;
- multi-tenancy;
- batch administration;
- Cockpit and Tasklist integration;
- CIB database compatibility;
- database migration;
- CIB cluster topology;
- metrics;
- enterprise reporting history;
- internal PVM API compatibility;
- internal execution-entity identity or table-count compatibility;
- application-server integration;
- exact replication of incidental iteration order;
- arbitrary Java delegate compatibility;
- unrestricted expression or script execution;
- automatic support for every BPMN metamodel element.

Some excluded facilities may still be used by the CIB reference driver to observe behavior, but they are not part of the new engine’s semantic contract.

---

## 5. Terminology

### Semantic profile

A versioned, immutable declaration of the targeted CIB-seven release, environment, supported language subset, observable behavior, ambiguity resolutions, extensions, deviations, and exclusions.

### Static semantics

Rules applied before execution that determine whether a model is accepted and how it is normalized: reference resolution, scope ownership, start-event selection, event declarations, multi-instance structure, compensation wiring, extension validation, and supported construct combinations.

### Runtime semantics

Rules that determine how an accepted model changes state in response to internal transitions, external commands, timers, messages, service outcomes, failures, and administrative stimuli.

### Stimulus

An externally supplied semantic input such as process start, user-task completion, message correlation, signal delivery, logical time change, job execution, external-task response, or service result.

### Command

A stimulus processed as one public engine operation, including its resulting internal transitions and final commit, rollback, or rejection.

### Microstep

One internal semantic transition, such as entering or leaving an activity, taking a sequence flow, creating a subscription, completing a scope, selecting a race winner, or propagating an error.

### Stable state

A state in which no immediate internal semantic transition is enabled. A stable state may still await user input, a message, a timer, a job-execution decision, or an external service result.

### Observation

A normalized public projection of engine state and command outcome. It excludes implementation-specific identifiers and internal structures unless the selected profile declares them observable.

### Causal trace

A semantic history that records relevant events and dependency relationships without imposing arbitrary total order on independent concurrent behavior.

### Effect

A requested interaction with the external world whose lifecycle is distinct from purely internal state transitions. Examples include service invocation and publication of externally consumed state changes.

### Oracle

The pinned CIB-seven engine and configuration used as the executable behavioral reference for the selected profile.

### Reference interpreter

The executable Lean semantics used as the formal semantic reference.

### Reducer

The pure TypeScript semantic implementation that transforms process state in response to semantic inputs and produces semantic outcomes and external-effect requests.

### Adapter

The Temporal-facing layer that maps durable runtime capabilities to the reducer’s semantic contract without redefining BPMN behavior.

### Refinement

A relation showing that a lower-level system may perform additional hidden steps but preserves the visible behavior and enabled interactions of a higher-level semantic model.

---

## 6. Source-derived architectural constraints

The underlying CIB-seven source investigation established several constraints that shape this design.

### 6.1 CIB seven is suitable as an embedded oracle

The investigation demonstrated that the published engine can run as a normal Java dependency with H2 in memory and no application server. A prototype successfully deployed, started, observed, and completed a BPMN process through the production engine path.

This makes CIB seven practical for a warm, reusable differential-test oracle.

### 6.2 “In-memory” does not mean persistence-free

Even with H2 in memory, CIB seven uses its normal:

- command lifecycle;
- transaction infrastructure;
- MyBatis persistence;
- runtime entities;
- jobs;
- subscriptions;
- execution tree;
- commit and rollback behavior.

The database process is removed, but the database-oriented engine architecture remains.

### 6.3 CIB execution semantics is distributed

No single CIB component constitutes the BPMN semantic core. Relevant behavior spans:

- BPMN parsing and static validation;
- BPMN activity behavior objects;
- PVM atomic operations;
- runtime execution state;
- scope and concurrency handling;
- jobs and event subscriptions;
- command and transaction infrastructure;
- persistent task, variable, incident, and execution entities.

The semantic oracle must therefore be the complete engine, not a selected class or extracted subsystem.

### 6.4 The standalone PVM is not the BPMN oracle

CIB seven includes a database-free PVM and useful generic tests for activities, transitions, scopes, wait states, and concurrency. That facility is valuable for understanding and diagnostics, but it does not implement the full production BPMN semantics for messages, timers, user tasks, compensation, inclusive joins, multi-instance behavior, retries, or transactional failure.

### 6.5 A smaller CIB-derived engine would weaken assurance

Extracting or copying CIB’s semantic machinery would:

- create another implementation requiring its own validation;
- inherit CIB’s internal architectural coupling;
- create shared-defect risk between oracle and implementation;
- reduce the independence of differential testing;
- couple maintenance to unstable internal APIs.

The new engine must therefore remain semantically compatible but architecturally independent.

### 6.6 Static semantics is part of compatibility

CIB’s BPMN parsing stage determines more than XML validity. It selects runtime behaviors, assigns scopes, validates event combinations, wraps multi-instance activities, configures compensation, and creates event declarations.

The project must compare deployment and normalization behavior in addition to runtime behavior.

---

## 7. System architecture

The system consists of four product components and one assurance system.

```text
                      Versioned semantic profile
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
             ▼                  ▼                  ▼
       CIB-seven oracle    Lean reference    TypeScript reducer
             │             interpreter             │
             │                  │                  ▼
             │                  │          Temporal adapter
             │                  │                  │
             └──────────────────┼──────────────────┘
                                ▼
                 Canonical observations and traces
                                │
                                ▼
             Differential, refinement, and regression evidence
```

### 7.1 Versioned CIB-seven semantic profile

The profile states the compatibility contract. It is consumed by all other components and by the test infrastructure.

### 7.2 Executable Lean reference interpreter

Lean defines the normative operational semantics for the selected profile, supports execution of finite scenarios, and provides proof and model-checking foundations.

### 7.3 Pure TypeScript reducer

The reducer is the production semantic core. It is independently executable without CIB seven or Temporal and is directly comparable with Lean and the CIB oracle.

### 7.4 Temporal adapter

The adapter provides durability, event-history replay, input delivery, timers, Activities, cancellation, long-running execution, and operational recovery while preserving reducer semantics.

### 7.5 Assurance system

The assurance system supplies:

- neutral scenarios;
- canonical observations;
- profile-aware comparison;
- generated cases;
- regression management;
- trace analysis;
- mismatch classification;
- model and stimulus reduction;
- refinement checks;
- evidence reporting.

---

## 8. Independence and authority rules

The following authority boundaries are mandatory.

### 8.1 The profile is the compatibility authority

No component may infer behavior from its host runtime when the profile defines otherwise.

### 8.2 Lean is the formal semantic authority

Within a selected profile version, the Lean model defines the project’s explicit operational meaning. A disagreement between Lean and CIB is not automatically a CIB defect or a Lean defect; it triggers classification against the BPMN requirement, profile interpretation, configuration, and evidence.

### 8.3 CIB seven is the executable behavioral oracle

For CIB-compatibility questions and documented ambiguity decisions, the pinned CIB engine supplies empirical behavior.

### 8.4 The TypeScript reducer is not allowed to depend on CIB internals

The reducer must not inherit CIB PVM types, database entities, behavior classes, or internal tests as executable dependencies. Source-derived scenarios and behavior insights are allowed when provenance and licensing are recorded.

### 8.5 Temporal is not a BPMN semantic authority

Temporal runtime behavior must not silently determine BPMN gateway selection, retry counts, incidents, subscription lifetimes, variable scope, command rollback, or activity lifecycle.

### 8.6 The adapter may add hidden work, not visible behavior

Temporal may introduce replay, workflow tasks, activity attempts, durable timer events, internal message-delivery steps, persistence, and run continuation. These are permitted only when they refine to hidden steps and preserve the declared public observations.

---

## 9. Versioned CIB-seven semantic profile

The semantic profile is the central contract artifact. Every test result, proof result, engine instance, model artifact, and compatibility report must identify the profile version.

### 9.1 Profile identity and provenance

A profile must identify:

- profile name and semantic version;
- CIB product and edition;
- published engine version;
- source revision corresponding to the executable oracle;
- artifact provenance and integrity information;
- BPMN specification edition;
- investigation evidence and relevant source revisions;
- profile creation and amendment history.

The source report investigated the CIB repository at a `2.3.0-SNAPSHOT` revision while executing the published `2.2.0` engine in the prototype. That is useful architectural evidence, but the semantic profile must not merge those revisions implicitly. The initial implementation must choose one executable release and align normative source claims with that release. Snapshot-only observations must remain explicitly exploratory until verified against the oracle revision.

### 9.2 Environment declaration

The profile must declare all environment choices that may affect public behavior, including:

- database product and version;
- transaction integration mode;
- isolation and locking assumptions where relevant;
- Java/runtime environment of the oracle;
- history level;
- clock and time-zone behavior;
- job executor state;
- scheduler control;
- retry defaults;
- expression language;
- script or delegate restrictions;
- serializer and type-conversion behavior;
- enabled engine plugins or listeners;
- CIB extension handling.

Separate profiles should be used where H2 and PostgreSQL expose materially different behavior. The fast semantic profile may use H2 and explicit scheduling; database and concurrency profiles may use PostgreSQL and controlled multi-command races.

### 9.3 Supported language surface

The profile must enumerate:

- accepted BPMN elements;
- accepted event definitions;
- accepted gateway forms;
- scope and subprocess features;
- call-activity behavior;
- multi-instance forms;
- compensation and transaction support;
- supported CIB extension attributes;
- expression capabilities;
- supported variable types;
- unsupported or rejected constructs;
- features whose behavior is intentionally deferred.

The fluent CIB model builder is not the language definition. Test models should be ordinary BPMN XML because the builder does not expose the complete BPMN metamodel and modifies a DOM-backed model directly.

### 9.4 Static semantic rules

The profile must define or reference:

- model acceptance and rejection;
- identifier and reference validity;
- scope ownership;
- legal start-event configurations;
- default-flow and condition requirements;
- event-based gateway restrictions;
- multi-instance normalization;
- boundary-event attachment;
- compensation relationships;
- event-subprocess declarations;
- call-activity binding;
- extension validation;
- expression-language declarations;
- unsupported construct combinations.

Deployment failure is a semantic result, not merely a harness error.

### 9.5 Runtime semantic rules

The profile must define the intended behavior for:

- activity entry and completion;
- sequence-flow selection;
- gateway split and join;
- scope creation and destruction;
- variable reads, writes, shadowing, and propagation;
- message and signal subscription;
- timer creation and firing;
- event races and cancellation;
- interrupting and non-interrupting events;
- event subprocess lifetime;
- user tasks;
- receive tasks;
- service outcomes;
- asynchronous continuations;
- jobs;
- retries;
- incidents;
- external tasks;
- BPMN error, escalation, cancel, terminate, and compensation;
- multi-instance creation, completion conditions, and destruction;
- process completion;
- command rollback;
- suspension or administrative behavior when included.

### 9.6 Observation boundary

The profile must state which consequences are compared. It must distinguish:

- mandatory public observations;
- optional diagnostic observations;
- hidden implementation behavior;
- ignored incidental ordering;
- normalized identifiers and time;
- included listener and history events;
- included or excluded serialized-value metadata;
- included activity-instance or execution projections;
- enabled external interactions;
- command outcomes.

### 9.7 Nondeterminism and scheduling policy

The profile must define:

- which choices are semantically nondeterministic;
- which choices are controlled by scenario stimuli;
- which orders are guaranteed by CIB;
- which orders are considered incidental;
- when logically concurrent events may be reordered;
- when shared state, interruption, cancellation, or external effects make events dependent;
- fairness assumptions for liveness properties;
- treatment of simultaneous timers and messages;
- scheduler actions that require explicit authorization.

### 9.8 Interpretation and deviation registers

Every ambiguity or incompatibility decision should be recorded with:

- a stable identifier;
- relevant BPMN clauses;
- observed CIB behavior;
- profile decision;
- rationale;
- affected features;
- conformance cases;
- known limitations;
- review status.

The profile should never hide a CIB-specific interpretation behind a generic BPMN label.

### 9.9 Profile evolution

Profiles are immutable once used to start process instances or produce compatibility evidence. A change to any semantic or observational rule creates a new profile version.

Profile evolution must distinguish:

- editorial clarification with no semantic change;
- observation-model change;
- additional supported behavior;
- corrected formalization;
- CIB-version upgrade;
- environment change;
- intentional breaking semantic change.

Existing process instances and replay histories must retain the profile identity under which they were created.

---

## 10. Semantic model lifecycle

The architecture distinguishes four semantic phases.

### 10.1 Model ingestion

A BPMN resource is accepted as an external artifact. XML parsing itself may initially remain outside the formally verified core, but all semantic assumptions introduced during parsing must be exposed to validation.

### 10.2 Static validation and normalization

The raw model is checked against the selected profile and transformed into a stable semantic representation suitable for execution.

Normalization should remove irrelevant syntactic variation while retaining every property that can affect behavior. Examples include resolved references, scope relationships, event declarations, default-flow relationships, multi-instance characteristics, and extension settings.

The normalized result is versioned and identified by a semantic digest. A process instance is tied to the exact normalized model and profile.

### 10.3 Runtime execution

Runtime execution proceeds through semantic microsteps grouped into externally visible commands. The runtime state represents semantic facts rather than CIB database structures or Temporal history structures.

At a conceptual level, the runtime state must be capable of representing:

- process and scope instances;
- activity instances;
- active paths or equivalent control state;
- scoped variables;
- tasks and waits;
- messages and signal subscriptions;
- timer and job state;
- event races;
- multi-instance state;
- compensation state;
- external-effect lifecycle;
- command savepoints;
- failures and incidents;
- process status.

The project does not require a particular internal representation, only a faithful semantic projection.

### 10.4 Public projection

After a command commits, rolls back, or is rejected, the engine exposes a canonical observation. Speculative state inside an uncommitted command must not appear as committed public state.

---

## 11. Command semantics and stable execution

Command semantics is one of the most important compatibility boundaries because CIB execution is organized around commands and transactions.

### 11.1 Command lifecycle

A command conceptually consists of:

1. validating and accepting or rejecting a stimulus;
2. establishing the pre-command committed state;
3. performing zero or more internal semantic microsteps;
4. reaching a stable state, a handled semantic wait, or a failure;
5. committing the resulting public state or rolling back to the prior committed state;
6. exposing the command outcome and any committed semantic observations.

### 11.2 Stable state

A state is internally stable when no immediate internal semantic transition is enabled. Stability does not imply completion.

Examples of stable states include:

- waiting at a user task;
- waiting for a correlated message;
- waiting for a receive task completion;
- waiting for a timer whose scheduler action has not been authorized;
- waiting for an external service result;
- waiting with an external task available for a worker;
- waiting at multiple concurrent activities.

### 11.3 Explicit scheduler actions

Automatic job acquisition is disabled in the primary CIB reference profile so that job and timer choices are controlled by the scenario.

The following must be represented as explicit semantic stimuli where applicable:

- execution of a selected due job;
- advancement of logical time;
- completion or failure of an external task;
- delivery of a service result;
- delivery of one event among multiple simultaneously enabled events;
- administrative retry or incident resolution.

This prevents wall-clock scheduling and database acquisition order from being mistaken for BPMN semantics.

### 11.4 Rollback and external effects

The semantic contract must distinguish internal state changes from irreversible external side effects.

CIB database rollback can restore engine-managed state but cannot necessarily undo a nontransactional external system call. The new architecture must model this boundary honestly. It must never claim that Temporal can reverse an external side effect merely because BPMN-visible state rolled back.

The profile should define:

- which effects are considered transactional with the semantic state;
- which effects are external and potentially irreversible;
- when an effect request becomes visible;
- how repeated delivery is handled;
- how failed external effects affect jobs, retries, incidents, or BPMN errors;
- what compensation means and what it does not guarantee.

### 11.5 Divergence and limits

A model can contain an infinite sequence of synchronous automatic behavior. The formal semantics must permit or characterize divergence.

Test-harness bounds are operational safeguards, not semantic incidents. Exceeding a bound should be classified as possible divergence or a harness limit unless the profile explicitly defines another outcome.

---

## 12. High-risk semantic areas

The project should treat the following as first-class semantic topics rather than minor extensions.

### 12.1 Scope and activity instances

CIB distinguishes execution-tree internals from BPMN-oriented activity-instance state. The compatibility model should be organized around public semantic scopes and activity instances, even when each implementation uses different internal structures.

The profile must define:

- scope creation and destruction;
- parent-child relationships;
- activity-instance lifecycle;
- variable ownership;
- interrupting behavior;
- completion propagation;
- recursive cancellation of tasks, jobs, subscriptions, and child scopes.

### 12.2 Logical concurrency versus physical concurrency

Parallel BPMN paths are logically concurrent. CIB may execute them sequentially inside one command. Temporal may be capable of concurrent handlers and Activities.

The compatibility contract concerns semantic concurrency and causal relationships, not physical thread-level parallelism.

The project must prevent physical concurrency from introducing visible behavior that is absent from the selected CIB profile.

### 12.3 Gateway semantics

Exclusive, parallel, inclusive, and event-based gateways require separate profile rules.

Inclusive joins are particularly important because CIB behavior may depend on whether additional live paths can still reach the join, and CIB-specific behavior may differ from an idealized BPMN reading.

Event-based gateways require explicit race semantics: subscriptions are created, one event wins, and losing alternatives are canceled.

### 12.4 Subscription lifetime

Message, signal, timer, boundary-event, and event-subprocess subscriptions are owned by scopes and have defined creation and destruction points.

A Temporal message handler is only an input-delivery mechanism. It does not replace BPMN subscription state.

### 12.5 Multi-instance behavior

Multi-instance activities require explicit treatment of:

- instance creation;
- sequential versus parallel execution;
- active and completed counts;
- local variables;
- completion conditions;
- destruction of remaining instances;
- interaction with boundary events;
- interaction with external effects and cancellation.

### 12.6 Asynchronous continuations and listeners

CIB asynchronous-before and asynchronous-after boundaries occur at specific lifecycle positions. Listener ordering, sequence-flow taking, state persistence, and job creation may be publicly observable.

The profile must define these positions where listener or history compatibility is included.

### 12.7 Jobs, external tasks, retries, and incidents

CIB automatic jobs and external tasks have different lifecycles. Temporal Activity retries are not automatically equivalent to either.

CIB-visible retry counts, retry timeouts, job failures, external-task failures, lock behavior, and incidents belong to the semantic profile. Temporal may provide lower-level delivery retries only if they are observationally hidden or explicitly mapped.

---

## 13. Executable Lean reference interpreter

### 13.1 Purpose

The Lean component provides:

- a precise operational semantics for each supported profile;
- an executable reference for finite scenarios;
- a basis for invariant proofs;
- a basis for refinement statements;
- a source of generated semantic traces and test oracles;
- bounded exploration of nondeterministic choices;
- explicit documentation of assumptions and unsupported behavior.

It is not merely a collection of theorems and not merely a simulator. It is the bridge between formal meaning and executable evidence.

### 13.2 Semantic layers

The Lean model should conceptually distinguish:

1. raw or normalized model validity;
2. static semantic acceptance;
3. runtime microstep semantics;
4. command closure and commit or rollback;
5. observable projection;
6. trace semantics;
7. profile-specific compatibility overrides;
8. properties and refinement relations.

The normative definition should be relational enough to represent nondeterminism, races, and alternative schedules. The executable interpreter should be shown to agree with that relation for the executable subset.

### 13.3 Required semantic coverage

For every supported profile feature, Lean must represent:

- preconditions for transitions;
- state changes;
- generated semantic observations;
- scope ownership;
- cancellation and interruption;
- failure propagation;
- command outcome;
- permitted nondeterminism;
- stable-state conditions;
- enabled external stimuli.

A feature is not considered formally covered merely because a test exists.

### 13.4 Core proof obligations

The project should pursue at least the following classes of machine-checked claims.

#### Model well-formedness

Accepted normalized models satisfy the invariants required by runtime semantics.

#### Runtime preservation

Each valid transition preserves structural runtime invariants such as scope consistency, identity uniqueness, nonnegative multiplicities, and valid ownership of tasks and subscriptions.

#### Interpreter correspondence

Every transition produced by the executable interpreter is permitted by the normative semantics, and every normative transition within the executable scope can be represented by an interpreter choice.

#### Command atomicity

Committed observations arise from valid stable command outcomes; rolled-back commands do not expose speculative engine-managed state.

#### Race exclusivity

Event races select at most one winner and cancel or invalidate losing alternatives according to the profile.

#### Scope cleanup

Interrupting or terminating a scope removes or disables all owned semantic entities required by the profile.

#### Completion safety

A completed process instance has no remaining active semantic state except explicitly retained historical projections.

#### Refinement foundations

The formal observation and trace model supports comparison with the reducer and Temporal adapter.

### 13.5 Liveness and fairness

Liveness claims require explicit assumptions. The semantics must not claim eventual completion when progress depends on an environment that may never provide a message, task completion, job execution, or external result.

Fairness assumptions should be attached to each property, such as:

- due jobs are eventually selected;
- enabled external inputs are eventually delivered;
- external effects eventually return or fail;
- retry schedules are eventually executed;
- no enabled branch is permanently starved.

### 13.6 Trust boundary

Lean does not automatically verify:

- the BPMN XML parser;
- CIB seven;
- the TypeScript compiler or runtime;
- the Temporal SDK or server;
- databases;
- network delivery;
- external services;
- serialization libraries;
- deployment infrastructure.

These remain trusted or test-validated boundaries and must be named in assurance reports.

---

## 14. Pure TypeScript reducer

### 14.1 Purpose

The TypeScript reducer is the production semantic core. It should be executable independently of Temporal and should consume the same semantic profile and normalized model meaning as Lean.

Its responsibilities are:

- applying one semantic input to a process state;
- advancing internal BPMN behavior to the correct command boundary;
- producing the resulting committed or rolled-back semantic state;
- exposing canonical semantic observations;
- declaring required external effects without performing them;
- preserving profile-specific behavior.

### 14.2 Purity and determinism

The reducer must not depend on:

- wall-clock time;
- thread scheduling;
- network access;
- database access;
- Temporal history;
- ambient global state;
- nondeterministic random values;
- CIB engine internals.

Any nondeterministic semantic choice must be explicit in the scenario or in a controlled choice input so that it can be replayed and compared.

### 14.3 Separation from Temporal

The reducer must not contain Temporal-specific concepts as semantic facts. Temporal run identifiers, workflow tasks, replay events, Activity attempts, and continuation mechanics are adapter concerns.

Conversely, BPMN tasks, subscriptions, jobs, incidents, retries, scopes, and activity instances must not be delegated to implicit Temporal behavior.

### 14.4 Transaction and effect boundary

The reducer must expose the distinction between:

- speculative semantic changes within a command;
- committed semantic state;
- rolled-back semantic state;
- requested external effects;
- resolved or failed effects;
- retry and incident consequences.

This permits both a simple in-memory test host and a durable Temporal host to execute the same semantics.

### 14.5 Compatibility obligations

For every supported profile and scenario:

- the reducer’s deployment result must agree with Lean and the CIB oracle after canonicalization;
- command outcomes must agree;
- stable observations must agree;
- enabled future stimuli must agree;
- causal traces must be equivalent modulo permitted reordering;
- external effects must correspond to profile-defined semantic requests;
- no Temporal-specific behavior may be required to explain reducer correctness.

---

## 15. Temporal adapter

### 15.1 Purpose

The Temporal adapter supplies durable execution capabilities:

- persistence of long-running state;
- deterministic replay;
- delivery of external commands;
- durable timers;
- Activity execution;
- cancellation;
- workflow continuation;
- worker recovery;
- operational visibility.

It is not a second semantic engine.

### 15.2 Adapter responsibilities

The adapter is responsible for:

- storing and restoring reducer state;
- associating a workflow execution chain with a semantic process instance;
- delivering commands to the reducer in a controlled order;
- scheduling and resolving reducer-declared external effects;
- mapping logical time and timer events;
- preserving semantic identity across Temporal runs;
- exposing committed public projections;
- keeping replay deterministic;
- preventing duplicate semantic application of repeated delivery;
- recording profile and model identity;
- enforcing compatibility between running instances and reducer versions.

### 15.3 Replay and versioning

Temporal Workflow code is replayed from history. Changes to command-producing workflow logic can make existing histories incompatible.

The architecture must therefore separate:

- BPMN model version;
- semantic profile version;
- reducer semantic version;
- Temporal adapter version;
- running Temporal history version.

A process instance must retain the identities needed to reproduce its prior behavior. An adapter upgrade must not silently reinterpret existing histories or models.

### 15.4 Timers

Temporal durable timers may implement physical waiting, but the semantic model still owns:

- timer purpose;
- due time;
- associated scope and activity;
- race membership;
- cancellation state;
- job visibility;
- resulting BPMN transition.

A Temporal timer event without the corresponding semantic timer state is not sufficient for compatibility.

### 15.5 Activities and external effects

Temporal Activities may execute reducer-declared external effects. Activity retries and duplicate attempts are delivery behavior, not automatically CIB-visible retry semantics.

The adapter must preserve:

- effect identity;
- idempotency expectations;
- cancellation intent;
- semantic attempt and retry state;
- failure classification;
- distinction between transport retry and CIB job or external-task retry.

### 15.6 Signals, Updates, and command serialization

Temporal inputs may arrive concurrently at the runtime level. The selected CIB profile may require serialized command semantics.

The adapter must therefore ensure that handler concurrency does not create visible state interleavings absent from the semantic model. Message delivery is an input mechanism; acceptance, correlation, race resolution, and command commit are reducer decisions.

### 15.7 Continue-As-New and execution chains

Temporal may continue a workflow as a new run to control history size. That transition should normally be hidden from BPMN observations.

The semantic process-instance identity, profile, normalized model, committed state, and outstanding semantic entities must remain coherent across the execution chain.

### 15.8 Public projection

Raw Temporal Event History is not CIB process history. Any CIB-compatible runtime or history projection must be generated from committed semantic observations defined by the profile.

---

## 16. Canonical observation contract

Differential and refinement testing require a shared observation vocabulary independent of all internal representations.

### 16.1 Required observation categories

A complete public observation should be capable of expressing:

- profile identity;
- normalized model identity;
- process status;
- logical time;
- command outcome;
- commit sequence;
- active scope instances;
- active activity instances;
- active path multiplicity;
- waiting user and receive tasks;
- event subscriptions;
- timer and job state;
- external tasks and lock state where included;
- incidents and failures;
- scoped typed variables;
- enabled external stimuli;
- completed or canceled semantic entities where included;
- causal semantic trace where required.

### 16.2 Multiplicity

Collections must preserve multiplicity. Two concurrent instances of the same BPMN element are not one set entry.

Canonicalization must not collapse distinct multi-instance activities, tasks, subscriptions, or jobs merely because raw engine identifiers are removed.

### 16.3 Scope-qualified variables

Variables must be observed with their semantic scope. A flat name-to-value map cannot represent shadowing, local variables, or propagation correctly.

The profile must state which aspects of typed values are observable, such as:

- logical type;
- canonical value;
- serialized representation;
- serializer metadata;
- transient status.

### 16.4 Enabled stimuli

State equality alone is insufficient. Two engines can look similar while accepting different next inputs.

The observation must include or derive the currently enabled external interactions, such as:

- completable tasks;
- correlatable messages;
- deliverable signals;
- executable jobs;
- fireable timers;
- resolvable effects;
- external-task operations;
- administrative actions included in the profile.

This supports a refusal-style compatibility check and improves deadlock detection.

### 16.5 Command outcome

The observation must distinguish:

- committed command;
- rolled-back command;
- rejected command;
- semantic failure;
- unsupported operation;
- harness or infrastructure failure.

A rolled-back command can leave the same snapshot as the pre-command state, but it is not equivalent to no command having occurred.

### 16.6 Canonical identity

Generated engine identifiers and Temporal run identifiers should normally be normalized. Canonical identity must nevertheless be stable enough to correlate the same semantic entity across observations.

Canonical identity should derive from semantic ownership and lifecycle rather than arbitrary database or creation order wherever possible.

### 16.7 Time normalization

Wall-clock timestamps are normalized to logical test time unless exact timestamp behavior is explicitly part of the profile.

### 16.8 Failure normalization

Implementation-specific exception types and messages should map to profile-defined semantic failure categories. Raw diagnostic details may be retained separately.

---

## 17. Causal trace model

Snapshots are sufficient for many cases, but not for lifecycle ordering, rollback, listener behavior, races, or invisible completed paths.

### 17.1 Partial order rather than arbitrary total order

Independent parallel events should not be forced into a total order merely because an implementation executed one first.

A causal trace records:

- semantic events;
- ownership;
- command membership;
- dependencies;
- race relationships;
- shared-state conflicts;
- cancellation and interruption;
- external-effect relationships;
- commit or rollback outcome.

### 17.2 Dependence

Events are dependent when one or more of the following applies:

- one causally enables the other;
- they read and write conflicting variable state;
- they operate on the same semantic entity;
- they belong to the same race;
- one cancels, interrupts, or terminates the other;
- they affect the same scope lifecycle;
- they share an externally observable effect;
- listener ordering makes their sequence visible;
- an inclusive-join reachability decision depends on them.

Only independent events may be reordered during trace comparison.

### 17.3 Black-box and diagnostic traces

The primary reference lane should minimize instrumentation. A diagnostic lane may enable history, passive listeners, execution-tree inspection, or database inspection after a mismatch.

Instrumentation itself must be calibrated to ensure that it does not change the public result.

---

## 18. Differential testing

### 18.1 Purpose

Differential testing answers:

> Given the same profile, BPMN model, initial state, logical time, scheduler choices, and external stimuli, do CIB seven, Lean, and the TypeScript reducer produce equivalent public behavior?

### 18.2 Three-way comparison

The preferred architecture compares all three independent systems.

| Result | Primary interpretation |
|---|---|
| CIB = Lean = TypeScript | Conforming case |
| CIB = Lean ≠ TypeScript | Reducer defect or reducer-profile mismatch |
| CIB = TypeScript ≠ Lean | Lean formalization defect or missing CIB-profile override |
| Lean = TypeScript ≠ CIB | Harness/configuration difference, CIB-specific deviation, or incorrect profile assumption |
| All differ | Scenario ambiguity, canonicalization defect, multiple defects, or unsupported behavior |

This matrix is a localization aid, not majority voting. BPMN remains normative and CIB remains the compatibility oracle for the declared profile.

### 18.3 Neutral scenario protocol

A scenario should contain:

- profile identity;
- BPMN resource;
- initial variables;
- logical time;
- ordered external commands;
- explicit scheduler and race choices;
- expected capability or feature tags;
- source provenance;
- optional expected observations.

The protocol must not expose CIB-internal concepts unless the profile explicitly includes them.

### 18.4 Differential checkpoints

A comparison should occur after:

- deployment or deployment rejection;
- process start;
- each external command;
- each authorized scheduler action;
- each externally resolved effect;
- process completion;
- rollback or incident creation;
- selected lifecycle events where trace comparison is required.

### 18.5 Efficient execution strategy

The normal test lane should compare canonical observation digests and command outcomes. Full traces and white-box diagnostics should be collected only for:

- mismatches;
- tests whose purpose is ordering;
- automatically completed processes with no remaining runtime evidence;
- selected audit cases.

The CIB oracle should be warm and reused across cases, with strict isolation and cleanup between scenarios.

### 18.6 Test corpus sources

The corpus should contain four categories.

#### Specification-derived cases

Tests linked directly to BPMN requirements and semantic interpretation decisions.

#### CIB-derived cases

Neutralized scenarios derived from CIB upstream tests and BPMN resources. Each case records source revision, behavioral intent, and licensing/provenance.

#### Generated cases

Bounded, profile-valid BPMN models and scenario sequences used to explore state-space combinations.

#### Regression cases

Minimized examples preserving every previously observed semantic difference.

### 18.7 Generative properties

Generated testing should cover properties such as:

- parallel split creates the required paths;
- parallel join does not proceed too early;
- interrupting events remove owned active state;
- non-interrupting events preserve the attached instance;
- terminating a scope removes owned waits and paths;
- process completion leaves no active runtime state;
- multiplicities remain valid;
- an inclusive join does not wait for paths that cannot still reach it;
- an event race selects at most one winner;
- rolled-back commands expose no speculative engine-managed state.

Each generated property must state its preconditions.

### 18.8 Metamorphic relations

Potential transformations include:

- changing BPMN diagram coordinates;
- adding documentation;
- safe identifier renaming;
- reordering semantically unordered XML children;
- parse/serialize round trips;
- replacing a fragment with a proven equivalent fragment.

A transformation is valid only when explicit preconditions show that no expression, listener, API, correlation rule, default-order rule, or external observer depends on the changed representation.

### 18.9 Mismatch classification

Every mismatch should be classified as one of:

- harness error;
- configuration difference;
- canonicalization defect;
- permitted nondeterminism;
- specification ambiguity;
- CIB extension;
- CIB defect or normative deviation;
- Lean formalization defect;
- reducer defect;
- Temporal adapter defect;
- unsupported feature;
- possible divergence;
- unresolved.

No compatibility release should contain unclassified mismatches in its declared corpus.

### 18.10 Reduction and preservation

A failing scenario should be reduced by:

- locating the first divergent command;
- minimizing the stimulus sequence;
- simplifying the BPMN graph;
- removing irrelevant extensions;
- reducing variables and external outcomes;
- preserving the exact profile and scheduler choices.

The minimized case becomes a permanent regression artifact.

---

## 19. Refinement testing and proof strategy

Differential testing compares peer behavior. Refinement establishes that lower-level systems correctly realize higher-level semantics despite additional internal work.

### 19.1 Lean to executable Lean

The executable Lean interpreter must correspond to the normative transition relation.

This is the strongest machine-checked link in the chain.

### 19.2 Lean to TypeScript reducer

The reducer should be compared against Lean through:

- shared normalized scenarios;
- generated traces;
- state projections;
- command outcomes;
- enabled stimuli;
- property-based equivalence checks;
- serialized evidence artifacts.

Where practical, critical reducer algorithms may be accompanied by explicit refinement arguments or generated proof obligations. The project should not claim a machine-checked end-to-end TypeScript proof unless such a bridge actually exists.

### 19.3 Reducer to Temporal adapter

The adapter may perform many internal steps for one reducer transition. The appropriate notion is weak, stuttering-aware refinement.

The refinement contract should require:

- every visible reducer command can be realized by the Temporal-hosted system;
- every visible Temporal-hosted semantic outcome corresponds to a reducer outcome;
- hidden replay, workflow-task, persistence, timer-recording, and continuation steps do not change semantic observations;
- enabled external interactions agree;
- the adapter does not introduce new semantic deadlocks;
- duplicate delivery does not duplicate semantic effects;
- cancellation and retry behavior remains profile-compatible.

### 19.4 Visible and hidden steps

Visible steps may include, depending on the profile:

- process start or completion;
- activity-instance lifecycle;
- task creation and completion;
- subscription creation, consumption, and cancellation;
- timer or job creation and execution;
- variable writes;
- incidents;
- external-effect requests and outcomes;
- command commit or rollback.

Hidden steps may include:

- Temporal replay;
- workflow-task boundaries;
- persistence writes;
- internal serialization;
- worker routing;
- transport retries;
- Continue-As-New;
- internal projection delivery.

The profile determines the final partition.

### 19.5 Replay testing

Every adapter change that can affect Temporal command history must be tested against retained histories. Replay testing is a compatibility gate distinct from BPMN differential testing.

### 19.6 Refinement failure classification

A Temporal mismatch should be classified according to whether it arises from:

- nondeterministic workflow code;
- duplicate semantic command application;
- lost input;
- incorrect timer mapping;
- retry leakage;
- cancellation mismatch;
- continuation-state loss;
- profile or model version mismatch;
- projection inconsistency;
- reducer defect;
- infrastructure failure.

---

## 20. Continuous assurance pipeline

The assurance process is continuous because every semantic, runtime, or dependency change can alter behavior.

### 20.1 Profile change gate

A profile change requires:

- updated interpretation and requirement records;
- changed-feature review;
- regenerated Lean evidence;
- regenerated differential corpus results;
- compatibility report update;
- explicit version increment.

### 20.2 Lean change gate

A Lean semantic change requires:

- proof revalidation;
- interpreter correspondence revalidation;
- affected-case identification;
- regenerated reference traces;
- differential comparison against CIB and TypeScript;
- profile decision review when CIB behavior differs.

### 20.3 Reducer change gate

A reducer change requires:

- unit and property tests;
- Lean differential comparison;
- CIB differential comparison;
- regression corpus execution;
- state migration or compatibility review where persistent state formats are affected;
- Temporal adapter integration tests.

### 20.4 Temporal adapter change gate

An adapter change requires:

- reducer-equivalence tests;
- deterministic replay tests;
- timer and message tests;
- retry and duplicate-delivery tests;
- cancellation tests;
- continuation tests;
- projection consistency tests;
- selected end-to-end CIB comparisons.

### 20.5 CIB upgrade gate

A CIB version upgrade creates a new profile or profile revision and requires:

- source and artifact provenance;
- behavioral delta analysis;
- rerunning the complete maintained corpus;
- classification of all new differences;
- updating the interpretation register;
- preserving prior profile support where required.

### 20.6 Evidence outputs

Each pipeline run should produce:

- profile identity;
- exact component versions;
- model and scenario corpus digests;
- proof status;
- differential summary;
- mismatch classifications;
- replay-test status;
- refinement-test status;
- known limitations;
- generated compatibility statement.

---

## 21. Reference-engine operating modes

The CIB oracle should support distinct evidence lanes.

### 21.1 Fast semantic lane

Purpose:

- high-volume differential execution;
- deterministic scheduler control;
- low diagnostic overhead.

Characteristics:

- pinned CIB release;
- embedded engine;
- H2 in memory;
- automatic job execution disabled;
- controlled logical clock;
- minimal history;
- no behavior-changing instrumentation;
- canonical public snapshots.

### 21.2 Diagnostic lane

Purpose:

- explain an already detected mismatch.

Possible additional evidence:

- engine history;
- passive lifecycle listeners;
- execution-tree projection;
- job and subscription inspection;
- database state;
- detailed command failure information.

Diagnostic instrumentation must not define the compatibility boundary and must be tested for noninterference.

### 21.3 Database and concurrency lane

Purpose:

- selected transaction, locking, and scheduler behavior that H2 cannot faithfully represent.

Characteristics may include:

- PostgreSQL;
- controlled concurrent commands;
- selected job-acquisition behavior;
- optimistic locking;
- database-dialect edge cases.

These behaviors belong to separate profiles or profile extensions rather than being silently mixed into the core semantic lane.

---

## 22. Test-profile progression

Implementation and assurance should progress through cumulative semantic profiles.

### Phase 0: Profile and oracle calibration

Scope:

- choose the exact CIB release and source revision;
- define the first observation boundary;
- establish controlled time and scheduler policy;
- validate deployment, process start, user-task wait, completion, rollback, and cleanup;
- ensure canonical observations are stable.

Exit criterion:

- the oracle profile is reproducible and no unresolved version mismatch remains.

### Phase 1: Sequential core

Scope:

- none start and end;
- sequence flows;
- basic tasks;
- user-task and receive waits;
- variables;
- simple completion and failure.

Exit criterion:

- Lean, TypeScript, and CIB agree for the maintained sequential corpus.

### Phase 2: Gateway core

Scope:

- exclusive split and merge;
- parallel split and join;
- conditions;
- default flows;
- loops.

Exit criterion:

- stable-state and causal-order comparisons agree under bounded generated exploration.

### Phase 3: Events and time

Scope:

- messages;
- signals;
- timers;
- event-based gateways;
- boundary events;
- explicit race choices;
- subscription lifetime.

Exit criterion:

- race, cancellation, time, and enabled-input observations agree.

### Phase 4: Scopes

Scope:

- embedded subprocesses;
- event subprocesses;
- error propagation;
- terminate behavior;
- call activities;
- scope variables.

Exit criterion:

- scope cleanup and interruption properties are proven or checked and differential results agree.

### Phase 5: Advanced execution

Scope:

- inclusive gateways;
- multi-instance;
- compensation;
- transactions and cancel;
- escalation;
- complex interruption.

Exit criterion:

- all advanced constructs have explicit interpretation records and no unclassified corpus differences.

### Phase 6: CIB operational compatibility

Scope:

- asynchronous continuations;
- jobs;
- retries;
- incidents;
- external tasks;
- selected listeners;
- selected CIB extensions;
- declared activity-instance projections.

Exit criterion:

- the system meets the declared Level 2 compatibility claim.

These phases define semantic and assurance scope only. They do not prescribe code structure or delivery process.

---

## 23. Deliverables for the coding agent

The coding agent should treat the following artifacts as required outputs of the project, regardless of implementation choices.

### 23.1 Semantic-profile artifacts

- immutable profile definitions;
- release and environment provenance;
- supported-feature matrix;
- static-semantics rules;
- runtime-semantics rules;
- observation contract;
- nondeterminism policy;
- interpretation register;
- deviation register;
- unsupported-feature register.

### 23.2 Lean artifacts

- normalized semantic model;
- static validation semantics;
- runtime transition semantics;
- command semantics;
- executable interpreter;
- observation and trace semantics;
- invariant proofs;
- interpreter correspondence proofs;
- bounded exploration or model-checking support;
- exported evidence suitable for reducer comparison.

### 23.3 TypeScript semantic artifacts

- standalone reducer behavior;
- profile and normalized-model consumption;
- command outcome semantics;
- external-effect declarations;
- canonical observations;
- deterministic scenario execution;
- Lean and CIB differential compatibility evidence.

### 23.4 Temporal artifacts

- durable hosting of reducer state;
- controlled command delivery;
- effect execution and result delivery;
- timer and cancellation mapping;
- replay compatibility;
- version and profile pinning;
- continuation semantics;
- public projection consistency;
- reducer-refinement evidence.

### 23.5 Assurance artifacts

- neutral scenario vocabulary;
- canonical observation vocabulary;
- CIB reference driver;
- Lean driver;
- TypeScript driver;
- Temporal integration driver;
- comparator;
- trace analyzer;
- case minimizer;
- requirement-linked corpus;
- generated-case infrastructure;
- regression corpus;
- compatibility reports.

### 23.6 Documentation artifacts

- architecture decision records;
- trust-boundary statement;
- compatibility claim;
- operator-visible limitations;
- profile upgrade procedure;
- CIB version upgrade procedure;
- process-instance versioning rules;
- mismatch triage guide.

---

## 24. Acceptance criteria

A profile version is ready for release only when all of the following are true.

### 24.1 Profile completeness

- The exact CIB release, source revision, edition, and environment are pinned.
- Supported and unsupported BPMN features are explicit.
- Static and runtime semantic interpretations are documented.
- Observation and nondeterminism policies are explicit.
- Known CIB deviations and configuration dependencies are recorded.

### 24.2 Lean readiness

- Every supported feature has an explicit formal transition meaning.
- Required runtime invariants are machine-checked.
- The executable interpreter is related to the normative semantics.
- Stable state, divergence, deadlock, and enabled-input concepts are defined.
- Proof assumptions are documented.

### 24.3 Reducer readiness

- The reducer runs without Temporal or CIB dependencies.
- It is deterministic under explicit semantic choices.
- It distinguishes committed, rolled-back, and rejected commands.
- It exposes profile-defined observations and enabled stimuli.
- It agrees with Lean and CIB for the maintained corpus and generated bounds.

### 24.4 Temporal readiness

- The adapter preserves reducer-visible behavior.
- Replay tests pass for retained histories.
- Duplicate delivery cannot duplicate semantic effects.
- Timer, message, retry, cancellation, and continuation behavior are covered.
- Running instances retain their profile and model identities.
- Raw Temporal behavior is not exposed as CIB semantic state unless declared.

### 24.5 Differential readiness

- All maintained scenarios pass or have an approved classified deviation.
- No mismatch remains unclassified.
- Every fixed mismatch has a minimized regression case.
- Causal trace comparison uses an explicit dependency policy.
- CIB instrumentation has been calibrated for noninterference.
- Oracle cleanup and isolation are verified.

### 24.6 Reporting readiness

- The compatibility report identifies all component and corpus versions.
- Proof, differential, replay, and refinement status are included.
- Unsupported features and known limitations are visible.
- The published claim matches the actual profile and evidence.

---

## 25. Risks and required decisions

### 25.1 Exact initial CIB oracle

The source investigation used a published `2.2.0` executable prototype while inspecting a later `2.3.0-SNAPSHOT` source revision. Before implementation begins, the project must choose the exact initial oracle version and align source evidence with it.

### 25.2 H2 versus production databases

H2 is appropriate for the fast semantic lane but cannot be assumed to reproduce every transaction, locking, and concurrency behavior of PostgreSQL or other production databases.

The profile system must separate these concerns.

### 25.3 Expression and serialization compatibility

Expression evaluation, coercion, variable typing, serialization, null behavior, and errors can create observable differences. The initial profile must either define a restricted subset or treat the selected CIB behavior as an explicit compatibility domain.

### 25.4 Listener and history scope

Including listener order and history projections greatly expands the observation boundary. The project must choose which listener and history behaviors belong to the initial profile.

### 25.5 External side effects

No workflow engine can generally roll back an already committed nontransactional external side effect. The project must define the exact consistency and idempotency contract rather than implying stronger atomicity.

### 25.6 Concurrency equivalence

Overly aggressive order normalization can hide real defects; overly strict total-order comparison can report irrelevant differences. The causal dependency relation must be explicit and reviewed.

### 25.7 Canonical identity

Concurrent identical instances are difficult to match without exposing implementation IDs. The canonical identity and graph-matching policy require careful specification.

### 25.8 CIB defects and deviations

A CIB difference may be a product defect, a BPMN deviation, a configuration effect, or an undocumented contract relied upon by users. Classification requires an interpretation process, not an automatic decision.

### 25.9 Temporal retry leakage

Temporal transport retries can accidentally alter CIB-visible retry counts or repeat external side effects. The adapter must preserve the semantic distinction.

### 25.10 Process evolution

BPMN model updates, reducer changes, profile changes, and Temporal history changes are different versioning dimensions. Treating them as one version risks replay and semantic incompatibility.

### 25.11 Test-corpus provenance

Upstream CIB tests and BPMN resources are valuable source material. Adapted cases must preserve provenance and comply with applicable licensing.

### 25.12 Assurance overclaim

Finite differential testing cannot prove universal equivalence. Lean proofs do not automatically cover external runtimes. Public claims must remain bounded by the actual evidence.

---

## 26. Architectural invariants

The following principles are nonnegotiable unless changed by an explicit architecture decision.

1. **CIB seven remains an unforked, pinned behavioral oracle.**
2. **The TypeScript reducer has no runtime dependency on CIB internals.**
3. **The reducer can execute without Temporal.**
4. **Temporal does not define BPMN semantics.**
5. **Every running instance is bound to a semantic profile and normalized model identity.**
6. **Deployment behavior is part of semantic compatibility.**
7. **Commands expose commit, rollback, or rejection explicitly.**
8. **Scheduler choices and logical time are controlled in semantic tests.**
9. **Enabled external interactions are part of compatibility.**
10. **Collections preserve semantic multiplicity.**
11. **Variables are compared with scope and type.**
12. **Independent concurrency is compared causally, not by arbitrary total order.**
13. **External-effect lifecycle is distinct from internal semantic state.**
14. **Temporal retries are distinct from CIB-visible retries.**
15. **Continue-As-New is hidden unless a profile explicitly exposes it.**
16. **Every semantic difference is classified and preserved as evidence.**
17. **Profiles are immutable and versioned.**
18. **No claim exceeds the declared feature, environment, and observation boundary.**

---

## 27. Recommended compatibility statement

The project should avoid statements such as:

> Fully BPMN 2.0 compliant and 100% CIB-seven compatible.

A defensible release statement is:

> This engine implements the declared BPMN 2.0.2 Process Execution profile. For the pinned CIB-seven release, edition, configuration, and observation boundary identified by that profile, its observable execution behavior is continuously compared with CIB seven and related to an executable Lean operational semantics. Specification ambiguities, CIB-specific extensions, unsupported features, configuration-dependent behavior, and known deviations are listed in the compatibility report.

For a mature profile, the statement may add:

> All mandatory requirements in this profile version are linked to automated evidence, and no unclassified semantic difference is known within the maintained conformance corpus and documented generated-test bounds.

---

## 28. Guidance for implementation decisions

This handoff intentionally leaves code-level choices open. The coding agent may choose appropriate algorithms, libraries, data structures, module boundaries, serialization formats, and deployment topology, provided that the following outcomes are preserved:

- the formal and executable semantics remain independent of CIB implementation internals;
- the reducer remains independent of Temporal;
- the adapter does not redefine semantics;
- profiles are versioned and immutable;
- state and traces can be canonically compared;
- nondeterminism is explicit;
- CIB, Lean, and TypeScript can consume the same scenario meaning;
- all observable behavior is traceable to a profile rule;
- proof, differential, and replay evidence can be regenerated.

Any implementation choice that changes these outcomes is an architectural decision and requires explicit review.

---

## 29. Handoff completion checklist

Before coding starts, the project owners should approve:

- the exact initial CIB-seven release and source revision;
- the initial compatibility level;
- the initial BPMN feature subset;
- the initial CIB extensions;
- the database and scheduler profiles;
- the expression and variable-type subset;
- the observation boundary;
- listener and history inclusion;
- the nondeterminism and causal-order policy;
- the treatment of external services;
- the profile versioning policy;
- the evidence and release gates.

Coding may proceed incrementally after these decisions, but no component should silently invent an answer to an undecided semantic question. Such questions belong in the interpretation register and must be resolved through BPMN analysis, CIB observation, and profile review.

---

## 30. Conclusion

The proposed system is not merely a BPMN interpreter hosted on Temporal. It is a versioned semantic and assurance architecture.

CIB seven contributes a practical, production-grade executable reference. Lean contributes explicit operational meaning and machine-checked reasoning. The pure TypeScript reducer contributes an independent production semantic core. Temporal contributes durability and resilient orchestration. Differential and refinement testing connect the four without conflating their responsibilities.

The architecture deliberately avoids extracting or copying CIB’s internal PVM and persistence model. Instead, it defines the public semantic consequences that matter and permits each component to realize them through a suitable internal representation.

The key project artifact is therefore not one engine implementation. It is the complete compatibility chain:

```text
Pinned CIB-seven behavior
        +
Versioned semantic profile
        +
Executable Lean semantics
        +
Independent TypeScript reducer
        +
Refining Temporal adapter
        +
Continuous differential and refinement evidence
```

When those parts agree, the project can make a precise and auditable compatibility claim. When they disagree, the architecture provides the provenance, observations, traces, classifications, and minimized cases needed to determine whether the cause is BPMN ambiguity, CIB-specific behavior, formal-model error, reducer defect, adapter defect, configuration drift, or unsupported scope.

That is the intended foundation for a BPMN engine whose behavior is both durable in production and explainable at the level of formal operational semantics.

---

## Source basis and provenance

This handoff is derived primarily from the report **“Using CIB seven as a BPMN 2.0 Semantic Reference,”** investigated on 22–23 July 2026. That report examined the `cibseven/cibseven` repository at revision `5a45b47ea22688d774de97277c3ff7013f54fdd2` (`2.3.0-SNAPSHOT`) and reported an executable embedded prototype using CIB seven `2.2.0`, Java 17, and H2 `2.3.232`.

The source report supports the following key premises used here:

- CIB seven can be embedded and run with H2 without an application server.
- The embedded engine still uses the production command, transaction, persistence, job, subscription, and execution-tree infrastructure.
- The BPMN builder is a DOM-backed model facade rather than a detached semantic AST.
- Production BPMN behavior is distributed across parsing, behavior objects, PVM execution, runtime entities, jobs, subscriptions, and transactions.
- The standalone PVM is useful for understanding but is not the complete BPMN oracle.
- Extracting a small CIB semantic library is not recommended.
- A pinned complete engine, neutral scenarios, canonical observations, explicit scheduling, and a pure independent semantic core are the appropriate basis for differential compatibility testing.
- Compatibility claims must be scoped to a version, profile, configuration, and observation boundary.

This document expands those premises into a formal-semantics, reducer, Temporal-adapter, and continuous-assurance handoff. Where it introduces refinements such as three-way CIB/Lean/TypeScript comparison, enabled-input observations, stuttering refinement, or explicit Temporal trust boundaries, those are architectural elaborations consistent with the source report rather than claims directly demonstrated by the source investigation.
