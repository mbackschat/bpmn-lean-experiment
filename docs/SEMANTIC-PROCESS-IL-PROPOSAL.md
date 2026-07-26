# Semantic Process IL proposal

## Status

This document is the owner-approved proposal for the project-owned Semantic Process intermediate language. The wire schemas, adversarial boundary validation, bounded checked-graph producer, canonical TypeScript lowerer, strict Lean decoders and validators, independent Lean lowerer, exact per-artifact lowering check, generic Lean program relation and evaluator, evaluator-soundness theorem, structural lowering laws, and independent TypeScript evaluator for the sequential and bounded parallel structures are implemented. Both semantic implementations check the bounded parallel laws and non-law. The stronger reviewed observational source-to-program preservation proposition is not proved because no independent checked-source operational relation exists yet; canonical CIB evidence, Temporal refinement, and complete correspondence remain pending. Under [the documentation lifecycle](DOC-DISCIPLINE.md#proposal-graduation), the complete stable implemented contract will graduate to `SEMANTIC-PROCESS-IL-SPEC.md`; partial implementation does not make the current document a spec.

The first proposed language slice is deliberately bounded to the approved none Start Event, User Task, diverging Parallel Gateway, converging Parallel Gateway, and none End Event semantics. This proposal does not claim a universal lowering for BPMN 2.0.2.

The topology-specific executable representation and evaluator path were removed atomically when the first Semantic Process implementation was admitted. They do not remain as a parallel production representation, compatibility reader, or delegated evaluator.

## Decision

The production interpretation path is:

```text
exact BPMN XML bytes
  → checked project-owned BPMN graph
  → Semantic Process IL
  → independently implemented Lean and TypeScript semantics
  → Temporal durability adapter
```

CIB Seven remains an independent source-level observation lane and continues to execute the exact BPMN XML. It does not consume the Semantic Process IL and does not define its structure.

The Semantic Process IL is a small language of semantic mechanisms rather than a mirror of BPMN element classes. Lowering removes admitted surface diversity while preserving every distinction required by the approved semantic profile, public observations, proof obligations, and later source diagnosis.

## Why this boundary exists

The bounded sequential capsule had only one topology, so a topology-specific executable representation was sufficient. Parallel fork and join introduce the second topology and the first reusable control-flow mechanisms. That creates named consumers for a shared checked definition: the Lean reference semantics, the independent TypeScript semantic core, and the Temporal adapter.

The IL supports the Lean-based specification by giving Lean a small, typed, serializable definition language over which to define a declarative transition relation, an executable evaluator, and useful laws. Lean must also check the lowering boundary; proving only the already-lowered program would leave the BPMN interpretation outside the formal account.

The IL adds an explicit translation boundary and corresponding proof obligations. That cost is intentional and bounded. It is justified only while the language replaces topology-specific structures, centralizes semantic mechanisms, and improves the source-to-runtime assurance chain.

## Lessons applied from the rejected A12 Core IL

The archived A12 Core IL proposal was correctly rejected for that project because it began after material semantic work, erased typed domain structure into numeric slots, delegated execution to existing family evaluators, conflated malformed structure with semantic uncertainty, duplicated algorithms without a named consumer, and lacked a predeclared preservation obligation.

This design does not transfer that rejected architecture. It applies its decision criteria:

- lowering starts from a checked source-facing graph before runtime token, activation, scheduling, or completion behavior;
- identifiers and variants remain domain-typed in Lean and explicitly discriminated on the wire;
- the IL evaluator replaces topology-specific evaluators instead of delegating to them;
- structural rejection is distinct from semantic execution outcomes;
- every current consumer is named;
- source-to-IL preservation obligations are stated before implementation;
- the language grows only through approved semantic capsules with separating witnesses.

If implementation violates one of these conditions, the project must stop and reconsider the boundary rather than preserve the name “IL” around an unsuitable representation.

## Boundaries

### Exact source

The source component retains the exact admitted BPMN XML bytes, content digest, parser evidence, and profile identity. Exact bytes remain the input to CIB Seven and the provenance root for every derived artifact.

### Checked BPMN graph

The checked BPMN graph is a project-owned, source-facing representation of the admitted subset. It preserves BPMN element and Sequence Flow identities and records only structural facts established during admission. It contains no runtime token counts, active User Task occurrences, commands, scheduler choices, or Temporal identity.

The first contract is:

```ts
interface CheckedProcess {
  readonly kind: "checkedProcess";
  readonly identity: {
    readonly semanticProfile: string;
    readonly sourceId: string;
    readonly sourceSha256: string;
  };
  readonly processId: string;
  readonly nodes: ReadonlyArray<CheckedNode>;
  readonly sequenceFlows: ReadonlyArray<CheckedSequenceFlow>;
}

type CheckedNode =
  | {
      readonly kind: "noneStartEvent";
      readonly id: string;
    }
  | {
      readonly kind: "userTask";
      readonly id: string;
      readonly name: string | null;
    }
  | {
      readonly kind: "parallelGateway";
      readonly id: string;
      readonly direction: "diverging" | "converging";
    }
  | {
      readonly kind: "noneEndEvent";
      readonly id: string;
    };

interface CheckedSequenceFlow {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
}
```

`CheckedProcess` means that parsing, supported-element admission, reference resolution, gateway-direction classification, profile membership, and bounded structural checks have succeeded. A rejected document does not produce this artifact.

### Semantic Process program

The Semantic Process program is an immutable, content-bound definition. It contains control places and operations but no mutable execution state.

```ts
interface SemanticProcessProgram {
  readonly kind: "semanticProcess";
  readonly identity: {
    readonly compiler: "bpmn-source-semantic-process";
    readonly semanticProfile: string;
    readonly sourceId: string;
    readonly sourceSha256: string;
  };
  readonly processId: string;
  readonly controlPlaces: ReadonlyArray<ControlPlace>;
  readonly operations: ReadonlyArray<SemanticOperation>;
}

interface ControlPlace {
  readonly id: string;
  readonly origin: {
    readonly kind: "bpmnSequenceFlow";
    readonly elementId: string;
  };
}

interface OperationBase {
  readonly id: string;
  readonly origin: {
    readonly kind: "bpmnElement";
    readonly elementId: string;
  };
}

type SemanticOperation =
  | (OperationBase & {
      readonly kind: "initiate";
      readonly output: string;
    })
  | (OperationBase & {
      readonly kind: "awaitUserTask";
      readonly input: string;
      readonly output: string;
      readonly task: {
        readonly elementId: string;
        readonly name: string | null;
      };
    })
  | (OperationBase & {
      readonly kind: "duplicate";
      readonly input: string;
      readonly outputs: readonly [string, string, ...string[]];
    })
  | (OperationBase & {
      readonly kind: "synchronize";
      readonly inputs: readonly [string, string, ...string[]];
      readonly output: string;
    })
  | (OperationBase & {
      readonly kind: "terminate";
      readonly input: string;
    });
```

String identifiers are wire representations, not permission to treat distinct identifier domains interchangeably in Lean or implementation code. Lean must use distinct types for process, node, Sequence Flow, operation, control-place, task-definition, and task-occurrence identifiers where those domains can be confused.

Array order has no semantic meaning. Canonical serialization sorts definitions and unordered references by their identifiers.

### Runtime state

Runtime state is not part of `SemanticProcessProgram`. It includes control-place token multiplicities, enabled external interactions, semantic task occurrences, committed command outcomes, and any explicit semantic choices.

Lean and TypeScript may use different internal runtime representations. They must implement the same reviewed transition account and canonical observation contract; sharing an IL does not require sharing evaluator algorithms or runtime data structures.

Temporal state remains an adapter realization related to semantic state through refinement. Workflow tasks, Activity attempts, Event History records, Run IDs, and transport retries do not enter the Semantic Process program or semantic state.

## First lowering

The first lowering is total only over a valid `CheckedProcess` admitted by the bounded profile.

| Checked BPMN construct | Semantic Process construct |
|---|---|
| none Start Event | `initiate` |
| Sequence Flow | `ControlPlace` |
| User Task | `awaitUserTask` |
| diverging Parallel Gateway | `duplicate` |
| converging Parallel Gateway | `synchronize` |
| none End Event | `terminate` |

Operation identifiers are deterministically derived from the source element identity without erasing the `origin`. Control-place identifiers are deterministically derived from Sequence Flow identity. The compiler identity, profile identity, exact source identity, and exact source digest are copied into the program identity.

Lowering must not resolve token races, choose an execution order, create runtime task occurrences, inspect future scenario commands, or encode expected observations.

For the approved parallel graph:

```text
start → fork → task A ─┐
               task B ─┴→ join → end
```

lowering produces one `initiate`, one `duplicate`, two `awaitUserTask` operations, one `synchronize`, one `terminate`, and one control place for every admitted Sequence Flow.

## Operational semantics

### Initiation

An accepted start stimulus enables `initiate` exactly once for the process instance. Firing it adds one token to its output control place.

### User Task wait

`awaitUserTask` is enabled when its input control place contains at least one token and no occurrence for that firing already exists. Firing consumes exactly one input token and creates one semantic task occurrence bound to the task definition and occurrence identity.

An accepted completion for that occurrence removes the wait and adds one token to the output control place. A completion for an unknown, stale, duplicate, or otherwise ineligible occurrence follows the capsule-owned command outcome rules and does not invent control-flow progress.

### Parallel duplication

`duplicate` is enabled when its input control place contains at least one token. Firing consumes exactly one input token and adds exactly one token to every distinct output control place.

### Parallel synchronization

`synchronize` is enabled if and only if every named input control place contains at least one token. Firing consumes exactly one token from every named input and adds exactly one token to its output.

Excess multiplicity on any input remains available for later firings. Multiple tokens arriving through one input do not compensate for a missing token on another input. This is the approved normative per-incoming-Sequence-Flow interpretation for the parallel capsule.

### Termination

`terminate` is enabled when its input control place contains at least one token. Firing consumes exactly one input token and records the corresponding end occurrence.

The process instance is complete only when no control tokens, active semantic waits, or enabled internal operations remain. Reaching one none End Event does not by itself discard unrelated live work.

### Internal scheduling

The relation may permit more than one internal operation. Any semantically material choice must be explicit input or proven observationally irrelevant under exact hypotheses. The executable evaluator must not turn collection order into an undeclared scheduling rule.

## Well-formedness

`WellFormedProgram` must establish at least:

- process, operation, and control-place identifiers are nonempty and unique in their domains;
- every referenced control place exists;
- every source origin required by the current profile is present and nonempty;
- every `duplicate` has at least two distinct outputs;
- every `synchronize` has at least two distinct inputs;
- the current profile has exactly one `initiate`;
- each control place has only the producer and consumer shapes permitted by the current lowering;
- every operation and control place is reachable from initiation and can reach termination under the structural graph;
- the current bounded graph is acyclic;
- every operation kind is permitted by the named semantic profile.

Malformed structure, unsupported source, lowering failure, invalid program, semantic rejection, semantic failure, and harness failure are distinct result classes. `UNKNOWN` or an equivalent semantic value must never stand in for invalid program structure.

## Lean specification and proof obligations

Lean is the formal semantic authority for the approved profile. The Lean lane must contain:

1. typed decoders and validators for the checked BPMN graph and Semantic Process program;
2. a deterministic bounded `lower` function from the checked graph to the program;
3. an exact per-artifact check that the received program equals Lean’s canonical lowering of the received checked graph;
4. a declarative `ProgramStep` relation over program, runtime state, explicit semantic input, and successor state;
5. a separately executable `step` evaluator;
6. a soundness theorem showing that every evaluator-produced transition is permitted by `ProgramStep`;
7. useful capsule laws and checked non-laws with exact hypotheses;
8. a source-to-program preservation result whose statement is reviewed before the lowerer is implemented.

The initial preservation obligation is observational:

```lean
theorem lower_preserves_supported_run
    (source : CheckedProcess)
    (scenario : Scenario)
    (hChecked : CheckedProcess.WellFormed source)
    (hScenario : SupportedScenario source scenario) :
    ∃ programTrace,
      ProgramRun (lower source) scenario programTrace ∧
      projectSource source scenario = projectProgram programTrace
```

The implemented statement may use a state relation rather than identical source and program state types, but it must begin at the checked BPMN graph and relate the same explicit scenario and public observation. A converse or exact equivalence claim requires a separate checked theorem; it must not be inferred from soundness.

For each retained program emitted by TypeScript, Lean must decode both the checked graph and emitted program, recompute `lower source`, reject inequality, and only then evaluate or prove program properties. A scenario identifier or fixture name is not a substitute for this content equality.

The current Lean lane implements items 1 through 7 and the exact per-artifact requirement above. It proves structural definition-identity and Sequence-Flow-origin preservation, but it does not claim `lower_preserves_supported_run`: the repository has no independent checked-source operational relation, so instantiating `projectSource` with the program semantics would assume the result being pursued. This is an explicit proof boundary rather than an admitted or circular theorem.

These obligations establish bounded interpretation and execution claims. They do not prove the correctness of an arbitrary XML parser, arbitrary BPMN documents, CIB Seven, Temporal, or the independent TypeScript implementation. Those remain separate evidence lanes.

## Independence

The checked graph and Semantic Process program are shared contracts. The semantic account is also shared by review. The implementations remain independent transcriptions:

- Lean owns the declarative relation, reference evaluator, lowering check, and theorems;
- TypeScript implements lowering and evaluation without generated Lean code or reuse of Lean algorithms;
- CIB Seven executes exact source without consuming either project-owned artifact;
- Temporal hosts the TypeScript semantics without defining BPMN behavior.

Agreement between Lean and TypeScript is useful correspondence evidence, not evidence that two independent semantic accounts selected the same meaning. Normative clauses, approved profile decisions, separating witnesses, and CIB classification remain necessary.

## Growth across BPMN event diversity

BPMN’s large event surface is not a reason to add one IL operation per BPMN element. New capsules should first classify a construct by semantic mechanism, including:

- trigger source and delivery condition;
- catching or throwing direction;
- start, intermediate, boundary, or end locus;
- interrupting or non-interrupting behavior;
- scope ownership and propagation;
- subscription cardinality and consumption;
- correlation and payload rules;
- time, cancellation, compensation, or external-effect lifecycle.

The IL may grow in bounded layers such as control, interaction, subscription, scope, propagation, and effects. A source element may lower to several typed operations when that is the smallest semantics-preserving account.

The project must not create a universal `event` operation with a bag of flags, duplicate the BPMN metamodel as opcodes, or erase distinctions merely because two constructs look similar in one witness. A new operation or field requires an approved capsule, a named consumer or refinement risk, a separating witness, source-origin rules, well-formedness rules, observation consequences, and Lean preservation obligations.

## Required first slice

The complete first implementation must support exactly:

- one none Start Event;
- one or more User Tasks permitted by the two approved capsules;
- diverging and converging Parallel Gateways under the recorded direction and arity restrictions;
- none End Events permitted by the capsules;
- `initiate`, `awaitUserTask`, `duplicate`, `synchronize`, and `terminate`;
- token multiplicity per Sequence Flow;
- semantic task occurrence identity and command closure;
- the existing canonical observation boundary.

The sequential and balanced parallel fixtures must both lower through the same operation language and execute through the same generic semantic transition mechanism.

## Excluded from the first slice

The following remain unsupported:

- general BPMN 2.0.2 import or conformance;
- event subtypes beyond the admitted none Start and none End Events;
- boundary events, timers, messages, signals, errors, escalation, cancellation, compensation, and terminate semantics;
- subprocess scopes, call activities, transactions, event subprocesses, and propagation;
- exclusive, inclusive, complex, and event-based gateways;
- loops, multi-instance activities, conditions, expressions, data, and variables;
- external-effect execution;
- generated TypeScript as semantic authority;
- optimization, bytecode, code generation, migration, and durable-version compatibility;
- a separate CIB-compatible parallel profile.

## Acceptance criteria

The first implementation is acceptable only when:

- the checked graph and Semantic Process program have current schemas and adversarial contract tests;
- sequential and parallel exact-source fixtures lower deterministically;
- the topology-specific executable IR and evaluator path are removed atomically;
- no IL operation delegates to a retained topology-specific evaluator;
- invalid source and invalid program mutations fail in their correct result classes;
- Lean checks exact lowering equality before evaluation;
- the reviewed preservation statement exists before production lowering code and its achieved proof status is reported exactly;
- Lean evaluator soundness is checked;
- the independent TypeScript evaluator passes sequential and parallel separating witnesses;
- the CIB lane still consumes exact XML and retained evidence remains content-bound;
- the Temporal lane consumes only admitted current Semantic Process programs;
- canonical observations contain no expected answers, future commands, host identifiers, or collection-order artifacts;
- meaningful mutations prove that every new evidence projection participates in verification;
- all evidence lanes and unsupported claims are recorded independently.

## Stop and reconsider criteria

Stop implementation and return to design if:

- lowering performs runtime scheduling, activation, completion, propagation, or other semantic work that the IL claims to own;
- the IL becomes a wrapper that selects an old topology evaluator;
- a proposed opcode mirrors a BPMN surface class without a reusable semantic mechanism;
- required source distinctions cannot be reconstructed from origins and the checked graph;
- structural invalidity is represented as an ordinary semantic outcome;
- the Lean account begins only after an unverified semantic translation;
- the old and new executable representations would need to coexist in production;
- a dependency change is required without the separately mandated approval;
- the preservation obligation cannot be stated without assuming the desired result.

## Ownership and change control

Until graduation, this proposal owns the approved Semantic Process IL purpose, boundary, operation meanings, lowering obligations, and growth rules. [Shared wire contracts](../contracts/README.md) own the current schemas and artifact validation once implemented. Approved feature meaning remains in the applicable [semantic capsule](capsules/README.md), and exact implementation status remains in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).

During pre-release there is exactly one current checked-graph contract and one current Semantic Process program contract. A breaking change replaces all current producers, consumers, fixtures, schemas, and tests atomically. Compatibility readers, embedded format counters, and migration layers remain excluded until a durable baseline is explicitly approved.
