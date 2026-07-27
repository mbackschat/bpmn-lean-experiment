# Semantic Process IL specification

## Status

**Implemented draft contract.** This document owns the project-authored checked BPMN graph, Semantic Process intermediate language, bounded lowering, operational meanings, proof boundary, and growth rules used by the sequential User Task, balanced two-branch parallel, Intermediate Catch Timer, payload-free Service Task effect, CreateDocument data, and interrupting boundary-error capsules.

The implemented language slice is deliberately bounded to the approved none Start Event, User Task, exact `PT1S` Intermediate Catch Timer Event, three exact Service Task source bindings, one exact attached interrupting Error route, diverging Parallel Gateway, converging Parallel Gateway, and none End Event semantics. This specification does not claim a universal lowering for BPMN 2.0.2.

The topology-specific executable representation and evaluator path are absent. No parallel production representation, compatibility reader, or delegated topology evaluator is permitted.

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
- source-to-IL preservation obligations are stated before the corresponding lowering mechanism is admitted;
- the language grows only through approved semantic capsules with separating witnesses.

If the maintained implementation violates one of these conditions, the project must stop and reconsider the boundary rather than preserve the name “IL” around an unsuitable representation.

## Boundaries

### Exact source

The source component retains the exact admitted BPMN XML bytes, content digest, parser evidence, and profile identity. Exact bytes remain the input to CIB Seven and the provenance root for every derived artifact.

### Checked BPMN graph

The checked BPMN graph is a project-owned, source-facing representation of the admitted subset. It preserves BPMN element and Sequence Flow identities and records only structural facts established during admission. It contains no runtime token counts, active User Task occurrences, commands, scheduler choices, or Temporal identity.

The first contract uses the project-owned `DeepReadonly<T>` utility so the shape stays readable while every nested object, array, and tuple remains immutable:

```ts
type CheckedProcess = DeepReadonly<{
  kind: "checkedProcess";
  identity: {
    semanticProfile: string;
    sourceId: string;
    sourceSha256: string;
  };
  processId: string;
  nodes: CheckedNode[];
  sequenceFlows: CheckedSequenceFlow[];
}>;

type MappingExpression = DeepReadonly<
  | { kind: "stringLiteral"; value: string }
  | { kind: "localVariable"; name: string }
>;

type VariableMapping = DeepReadonly<{
  target: string;
  expression: MappingExpression;
}>;

type CheckedBpmnErrorRoute = DeepReadonly<{
  boundaryEventId: string;
  boundaryEventName: string | null;
  attachedToRef: string;
  errorDefinitionId: string;
  errorElementId: string;
  errorName: string | null;
  code: string;
  outputFlowId: string;
}>;

type CheckedServiceTaskBase = DeepReadonly<{
  kind: "serviceTask";
  id: string;
  inputMappings: VariableMapping[];
  outputMappings: VariableMapping[];
  bpmnErrorRoute: CheckedBpmnErrorRoute | null;
}>;

type CheckedServiceTask =
  | (CheckedServiceTaskBase & DeepReadonly<{
      implementation: "urn:bpmn-lean:effect:probe-v1";
      sourceBinding: {
        delegateExpressionAttribute: {
          namespace: "http://camunda.org/schema/1.0/bpmn";
          value: "${bpmnLeanEffectHandler}";
        };
        asyncBeforeAttribute: {
          namespace: "http://camunda.org/schema/1.0/bpmn";
          value: "true";
        };
      };
    }>)
  | (CheckedServiceTaskBase & DeepReadonly<{
      implementation: "urn:bpmn-lean:a12-delegate:v1";
      sourceBinding: {
        delegateExpressionAttribute: {
          namespace: "http://camunda.org/schema/1.0/bpmn";
          value: "${createDocumentDelegate}";
        };
        protocolSource: "semanticProfile";
        inputOutputElement: {
          namespace: "http://camunda.org/schema/1.0/bpmn";
          inputParameter: {
            name: "documentModelName";
            body: "MyDocumentModel";
          };
          outputParameter: {
            name: "myDocumentReference";
            body: "${newDocRef}";
          };
        };
      };
    }>)
  | (CheckedServiceTaskBase & DeepReadonly<{
      implementation: "urn:bpmn-lean:a12-delegate:v1";
      sourceBinding: {
        delegateExpressionAttribute: {
          namespace: "http://camunda.org/schema/1.0/bpmn";
          value: "#{createRelationshipLinkDelegate}";
        };
        implementationAttribute: {
          value: "urn:bpmn-lean:a12-delegate:v1";
        };
        inputOutputElement: {
          namespace: "http://camunda.org/schema/1.0/bpmn";
          inputParameter: {
            name: "relationshipModel";
            body: "RelationshipModel";
          };
          outputParameter: {
            name: "relationshipLinkId";
            body: "${newLinkId}";
          };
        };
      };
    }>);

type CheckedNode = DeepReadonly<
  | {
      kind: "noneStartEvent";
      id: string;
    }
  | {
      kind: "userTask";
      id: string;
      name: string | null;
    }
  | {
      kind: "intermediateCatchTimerEvent";
      id: string;
      durationLiteral: "PT1S";
    }
  | CheckedServiceTask
  | {
      kind: "parallelGateway";
      id: string;
      direction: "diverging" | "converging";
    }
  | {
      kind: "noneEndEvent";
      id: string;
    }
>;

type CheckedSequenceFlow = DeepReadonly<{
  id: string;
  sourceId: string;
  targetId: string;
}>;
```

`CheckedProcess` means that parsing, supported-element admission, reference resolution, gateway-direction classification, profile membership, and bounded structural checks have succeeded. A rejected document does not produce this artifact.

### Semantic Process program

The Semantic Process program is an immutable, content-bound definition. It contains control places and operations but no mutable execution state.

```ts
type SemanticProcessProgram = DeepReadonly<{
  kind: "semanticProcess";
  identity: {
    compiler: "bpmn-source-semantic-process";
    semanticProfile: string;
    sourceId: string;
    sourceSha256: string;
  };
  processId: string;
  controlPlaces: ControlPlace[];
  operations: SemanticOperation[];
}>;

type ControlPlace = DeepReadonly<{
  id: string;
  origin: {
    kind: "bpmnSequenceFlow";
    elementId: string;
  };
}>;

type OperationBase = DeepReadonly<{
  id: string;
  origin: {
    kind: "bpmnElement";
    elementId: string;
  };
}>;

type EffectDescriptor = DeepReadonly<{
  protocol:
    | "urn:bpmn-lean:effect:probe-v1"
    | "urn:bpmn-lean:a12-delegate:v1";
  handler:
    | "bpmnLeanEffectHandler"
    | "createDocumentDelegate"
    | "createRelationshipLinkDelegate";
}>;

type BpmnErrorRoute = DeepReadonly<{
  code: string;
  output: string;
  origin: {
    kind: "bpmnElement";
    boundaryEventId: string;
    errorDefinitionId: string;
    errorElementId: string;
    sequenceFlowId: string;
  };
}>;

type SemanticOperation = DeepReadonly<
  | (OperationBase & {
      kind: "initiate";
      output: string;
    })
  | (OperationBase & {
      kind: "awaitUserTask";
      input: string;
      output: string;
      task: {
        elementId: string;
        name: string | null;
      };
    })
  | (OperationBase & {
      kind: "awaitTimer";
      input: string;
      output: string;
      timer: {
        elementId: string;
        durationMs: 1000;
      };
    })
  | (OperationBase & {
      kind: "awaitEffect";
      input: string;
      output: string;
      effect: {
        elementId: string;
        descriptor: EffectDescriptor;
        inputMappings: VariableMapping[];
        outputMappings: VariableMapping[];
      };
      bpmnErrorRoute: BpmnErrorRoute | null;
    })
  | (OperationBase & {
      kind: "duplicate";
      input: string;
      outputs: [string, string, ...string[]];
    })
  | (OperationBase & {
      kind: "synchronize";
      inputs: [string, string, ...string[]];
      output: string;
    })
  | (OperationBase & {
      kind: "terminate";
      input: string;
    })
>;
```

String identifiers are wire representations, not permission to treat distinct identifier domains interchangeably in Lean or implementation code. Lean must use distinct types for process, node, Sequence Flow, operation, control-place, task-definition, and task-occurrence identifiers where those domains can be confused.

Semantic operation payloads carry their own element identifier when runtime occurrence identity depends on that element. That identifier is deliberately redundant with `origin.elementId`: program validation requires exact equality, runtime construction reads the semantic payload field, and source traceability reads `origin`. `awaitUserTask`, `awaitTimer`, and `awaitEffect` establish this convention; future occurrence-producing operations must follow it rather than derive runtime identity directly from source provenance.

Array order has no semantic meaning. Canonical serialization sorts definitions and unordered references by their identifiers.

### Runtime state

Runtime state is not part of `SemanticProcessProgram`. It includes control-place token multiplicities, enabled external interactions, semantic task, timer, and effect occurrences, committed immutable effect arguments, Process variables, Activity-local mapping state, the logical clock, committed command outcomes, and any explicit semantic choices.

Lean and TypeScript may use different internal runtime representations. They must implement the same reviewed transition account and canonical observation contract; sharing an IL does not require sharing evaluator algorithms or runtime data structures.

Temporal state remains an adapter realization related to semantic state through refinement. Workflow tasks, Activity attempts, Event History records, Run IDs, and transport retries do not enter the Semantic Process program or semantic state.

## First lowering

The first lowering is total only over a valid `CheckedProcess` admitted by the bounded profile.

| Checked BPMN construct | Semantic Process construct |
|---|---|
| none Start Event | `initiate` |
| Sequence Flow | `ControlPlace` |
| User Task | `awaitUserTask` |
| exact `PT1S` Intermediate Catch Timer Event | `awaitTimer` with `durationMs: 1000` |
| exact payload-free Service Task binding | `awaitEffect` with the probe protocol/handler descriptor and empty mappings |
| exact A12-shaped CreateDocument binding and mappings | `awaitEffect` with the profile protocol, source handler, normalized literal input, and local-reference output mapping |
| exact A12-shaped interrupting boundary Error binding | `awaitEffect` with the profile protocol, deferred source handler, normalized mapping pair, and one committed `bpmnErrorRoute` |
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

### Relative timer wait

`awaitTimer` is enabled when its input control place contains at least one token and no occurrence for that firing already exists. Firing consumes exactly one input token and creates one timer occurrence with full Process-instance, element, and activation identity, an output control place, and deadline `logicalTimeMs + durationMs`.

Internal closure stops at the timer wait. An exact `fireTimer` stimulus commits only when its full occurrence identity is active and its submitted logical time equals the deadline. Commit removes the wait, advances logical time to the deadline, adds one token to the output control place, and resumes closure. Any occurrence-identity or logical-time mismatch is rejected with exact state preservation.

The exact `PT1S` lexical value remains in the checked graph; Lean and TypeScript lower it independently to `1000`. Physical clock origin, scheduler latency, CIB job identity, and Temporal timer identity do not enter the program or runtime semantics. The complete rule and race-free refinement boundary belong to the [Intermediate Catch Timer capsule](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md).

### External effect wait, bounded data mapping, and typed business error

`awaitEffect` is enabled when its input control place contains at least one token and no occurrence for that firing already exists. Firing consumes exactly one input token, evaluates the admitted pure input mappings, and commits one effect occurrence containing full identity, descriptor, immutable arguments, output mappings, and the output control place.

The payload-free Service Task has empty mappings and accepts only the empty successful result. The CreateDocument slice evaluates one string literal into Activity-local argument `documentModelName`. A matching successful `completeEffect` accepts only the exact typed local patch required by the active operation. It applies the operation's output mapping to Process scope, removes the effect wait and Activity-local state, adds one normal output token, and resumes closure. A malformed patch or mismatched occurrence rejects with exact state preservation.

The boundary-error slice extends the same operation with one immutable exact-code Error route and extends variable values with a closed `string`/`null` union. A matching `bpmnError` result carries a validated Activity-local patch and optional non-empty message. Under the selected CIB-specific profile, the evaluator atomically installs the patch, applies the program-owned output mapping, removes the effect wait and Activity-local state, abandons the normal output, adds the boundary-route token, and resumes closure. An occurrence mismatch, non-matching Error code, or malformed patch rejects with exact state preservation. The Error route stays definition-only; code and message do not enter canonical state.

The Worker never receives mutable Process state and never selects Process output names. Descriptor, arguments, result, output mapping, and Error route remain separate contracts. The exact bounded rules and host relations belong to the [Service Task effect spec](capsules/SERVICE-TASK-EFFECT-SPEC.md), [CreateDocument data spec](capsules/CREATE-DOCUMENT-DATA-SPEC.md), and [boundary-error spec](capsules/BOUNDARY-ERROR-SPEC.md).

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
- every operation payload element identifier matches its BPMN origin;
- every admitted `awaitTimer` has a timer element matching its BPMN origin and exact duration `1000`;
- every admitted `awaitEffect` has a profile-permitted descriptor and the exact mapping pair for that descriptor;
- mapping targets are nonempty and unique, literal inputs remain exact strings, and local-variable outputs refer only to the admitted result-local name;
- every non-null `bpmnErrorRoute` has a nonempty exact code, a distinct existing boundary output, complete source provenance, and the exact profile-permitted handler/mapping combination;
- the current profile has exactly one `initiate`;
- each control place has only the producer and consumer shapes permitted by the current lowering;
- every operation and control place is reachable from initiation and can reach termination under the structural graph;
- the current bounded graph is acyclic;
- every operation kind is permitted by the named semantic profile.

Lean's standalone `programWellFormed` currently omits reachability, acyclicity, and permitted producer/consumer-shape checks; admitted artifacts obtain those guarantees transitively through checked-source validation and exact lowering equality, and the standalone validator must be strengthened when admission widens. The separately gated checked-source experiment neither fixes nor depends on this gap.

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
8. a source-to-program preservation result whose statement begins at the checked BPMN graph and does not assume the program account it is intended to justify.

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

Lean implements items 1 through 7 and the exact per-artifact requirement above. It proves structural definition-identity and Sequence-Flow-origin preservation, but it does not claim `lower_preserves_supported_run`. The [bounded checked-source relation experiment](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md) produced a provisional direct source token game and a fixture-coincidental lowering discriminator, then stopped at the approved effort boundary before enabled-transition, closure, observation, and run-level correspondence were proved. The source account remains experimental and is not an independent BPMN authority. This is an explicit unresolved proof boundary rather than an admitted, circular, or permanently waived theorem.

These obligations establish bounded interpretation and execution claims. They do not prove the correctness of an arbitrary XML parser, arbitrary BPMN documents, CIB Seven, Temporal, or the independent TypeScript implementation. Those remain separate evidence lanes.

## Independence

The checked graph and Semantic Process program are shared contracts. The semantic account is also shared by review. The implementations remain independent transcriptions:

- Lean owns the declarative relation, reference evaluator, lowering check, and theorems;
- TypeScript implements lowering and evaluation without generated Lean code or reuse of Lean algorithms;
- CIB Seven executes exact source without consuming either project-owned artifact;
- Temporal hosts the TypeScript semantics without defining BPMN behavior.

Agreement between Lean and TypeScript is useful correspondence evidence, not evidence that two independent semantic accounts selected the same meaning. Normative clauses, approved profile decisions, separating witnesses, and CIB classification remain necessary.

## Growth across BPMN event diversity

BPMN’s large event surface is not a reason to add one IL operation per BPMN element. New capsules must first classify a construct by semantic mechanism, including:

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

## Supported slice

The maintained implementation supports exactly:

- one none Start Event;
- one or more User Tasks permitted by the two approved capsules;
- one exact `PT1S` Intermediate Catch Timer Event under its single-token linear capsule;
- one exact Service Task binding under its single-token success-only effect capsule;
- one exact A12-shaped CreateDocument Service Task with one literal string input and one local-reference output mapping;
- one exact A12-shaped Service Task with the same bounded mapping mechanism and one attached exact-code interrupting Error route;
- diverging and converging Parallel Gateways under the recorded direction and arity restrictions;
- none End Events permitted by the capsules;
- `initiate`, `awaitUserTask`, `awaitTimer`, `awaitEffect`, `duplicate`, `synchronize`, and `terminate`;
- token multiplicity per Sequence Flow;
- semantic task, timer, and effect occurrence identity, closed string-or-null Process/Activity-local data for the exact mapping slices, logical time, and command closure;
- the canonical observation boundary including `openTimers`, effect arguments in `openEffects`, and Process `variables`.

The sequential User Task, balanced parallel, Intermediate Catch Timer, payload-free Service Task, CreateDocument, and boundary-error fixtures must all lower through the same operation language and execute through the same generic semantic transition mechanism.

## Excluded surface

The following remain unsupported:

- general BPMN 2.0.2 import or conformance;
- event subtypes beyond the admitted none Start, exact normal-flow `PT1S` Intermediate Catch Timer, exact attached interrupting Error route, and none End Events;
- other timer forms, other boundary Events, catch-all or propagated Errors, Error throws, Error End Events, messages, signals, escalation, cancellation, compensation, and terminate semantics;
- subprocess scopes, call activities, transactions, event subprocesses, and propagation;
- exclusive, inclusive, complex, and event-based gateways;
- loops, multi-instance activities, conditions, general expressions, non-string/non-null data, general variables or scopes, and mappings beyond the two exact pairs;
- host-side external-effect execution and effect mechanisms beyond the approved success and typed boundary-error capsules;
- generated TypeScript as semantic authority;
- optimization, bytecode, code generation, migration, and durable-version compatibility;
- a separate CIB-compatible parallel profile.

## Maintained conformance obligations

This contract remains valid only while:

- the checked graph and Semantic Process program have current schemas and adversarial contract tests;
- sequential, parallel, timer, payload-free effect, CreateDocument, and boundary-error exact-source fixtures lower deterministically;
- the topology-specific executable IR and evaluator path are removed atomically;
- no IL operation delegates to a retained topology-specific evaluator;
- invalid source and invalid program mutations fail in their correct result classes;
- Lean checks exact lowering equality before evaluation;
- the reviewed preservation statement remains explicit and its achieved proof status is reported exactly;
- Lean evaluator soundness is checked;
- the independent TypeScript evaluator passes sequential, parallel, timer, payload-free effect, CreateDocument data/mapping, and boundary-error separating witnesses;
- the CIB lane still consumes exact XML and retained evidence remains content-bound;
- the Temporal lane consumes only admitted current Semantic Process programs;
- canonical observations contain no expected answers, future commands, host identifiers, or collection-order artifacts;
- meaningful mutations prove that every new evidence projection participates in verification;
- all evidence lanes and unsupported claims are recorded independently.

## Stop and reconsider criteria

Stop use or extension of this boundary and return to design if:

- lowering performs runtime scheduling, activation, completion, propagation, or other semantic work that the IL claims to own;
- the IL becomes a wrapper that selects an old topology evaluator;
- a new opcode mirrors a BPMN surface class without a reusable semantic mechanism;
- required source distinctions cannot be reconstructed from origins and the checked graph;
- structural invalidity is represented as an ordinary semantic outcome;
- the Lean account begins only after an unverified semantic translation;
- the old and new executable representations would need to coexist in production;
- a dependency change is required without the separately mandated approval;
- the preservation obligation cannot be stated without assuming the desired result.

## Ownership and change control

This specification owns the Semantic Process IL purpose, boundary, operation meanings, lowering obligations, and growth rules. [Shared wire contracts](../contracts/README.md) own the current schemas and artifact validation. Approved feature meaning remains in the applicable [semantic capsule](capsules/README.md), and exact implementation status remains in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).

During pre-release there is exactly one current checked-graph contract and one current Semantic Process program contract. A breaking change replaces all current producers, consumers, fixtures, schemas, and tests atomically. Compatibility readers, embedded format counters, and migration layers remain excluded until a durable baseline is explicitly approved.
