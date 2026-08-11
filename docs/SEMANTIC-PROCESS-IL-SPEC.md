# Semantic Process IL specification

## Status

**Implemented draft contract.** This document owns the project-authored checked BPMN graph, Semantic Process intermediate language, bounded lowering, operational meanings, proof boundary, and growth rules used by the sequential User Task, balanced two-branch parallel, Intermediate Catch Timer, direct payload-free Intermediate Catch Message, payload-free and mapped Service Task effects, interrupting boundary Error, Simple Boolean Exclusive Gateway, structured Inclusive Gateway selected-branch synchronization, bounded Event-Based Gateway Message/Timer deferred choice, ordinary embedded Sub-Process completion, direct-parent Sub-Process Error propagation, bounded called-Process Call Activity, the evidence-closed resumption-bounded cyclic-control-flow specification, the evidence-closed Message Start Event specification, the registered Timer Start Event capability, the registered Terminate End capability, and the registered configured Task capability. The configured Task retains a distinct checked constructor and lowers to the existing neutral effect operation without widening runtime or public contracts.

The implemented language slice is deliberately bounded to the approved none Start Event, one exact top-level Message Start Event, one exact top-level `PT1S` Timer Start Event in its registered profile, User Task, exact `PT1S` Intermediate Catch Timer Event, one directly addressed payload-free Intermediate Catch Message Event, one exact non-instantiating Exclusive Event-Based Gateway configuration containing those Message and Timer catches, three profile-mapped Service Task source shapes, one exact versioned configured Task extension under its registered profile, one exact attached interrupting Service Task Error route, one exact-code Error End Event with a direct interrupting boundary handler on its enclosing embedded Sub-Process, one identity-only Terminate End under its registered profile, diverging and converging Parallel Gateways, one exact divergent Exclusive Gateway shape under Simple Boolean v1, one identity-only converging Exclusive Gateway shape within the evidence-closed cycle profile, one exact structured Inclusive split/task/join region under the same expression language, one level of embedded Sub-Process scope, one exact in-document called-Process Call Activity, and none End Event semantics. This specification does not claim a universal lowering for BPMN 2.0.2.

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
    sourceOverlay: SourceOverlayIdentity | null;
    sourceSha256: string;
  };
  processId: string;
  definitionScopes: DefinitionScope[];
  nodeScopes: NodeScopeOwnership[];
  sequenceFlowScopes: SequenceFlowScopeOwnership[];
  nodes: CheckedNode[];
  sequenceFlows: CheckedSequenceFlow[];
}>;

type SourceOverlayIdentity = DeepReadonly<{
  id: string;
  sha256: string;
}>;

type DefinitionScope = DeepReadonly<{
  id: string;
  parentScopeId: string | null;
  originElementId: string;
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

type ErrorReference = DeepReadonly<{
  errorDefinitionId: string;
  errorElementId: string;
  code: string;
}>;

type EffectDescriptor = DeepReadonly<{
  protocol: string;
  operation: string;
}>;

type CheckedCondition = DeepReadonly<{
  language: string;
  body: string;
}>;

const MessageChannelKind = {
  OperationMessage: "operationMessage",
  DirectMessage: "directMessage",
} as const;

type MessageChannel = DeepReadonly<
  | {
      kind: typeof MessageChannelKind.OperationMessage;
      interfaceId: string;
      interfaceOperationId: string;
      messageId: string;
    }
  | {
      kind: typeof MessageChannelKind.DirectMessage;
      messageId: string;
    }
>;

type CheckedServiceTask = DeepReadonly<{
  kind: "serviceTask";
  id: string;
  descriptor: EffectDescriptor;
  inputMappings: VariableMapping[];
  outputMappings: VariableMapping[];
  bpmnErrorRoute: CheckedBpmnErrorRoute | null;
}>;

type CheckedConfiguredTask = DeepReadonly<{
  kind: "configuredTask";
  id: string;
  descriptor: EffectDescriptor;
}>;

type CheckedNode = DeepReadonly<
  | {
      kind: "noneStartEvent";
      id: string;
    }
  | {
      kind: "messageStartEvent";
      id: string;
      channel: Extract<
        MessageChannel,
        { kind: typeof MessageChannelKind.OperationMessage }
      >;
    }
  | {
      kind: "timerStartEvent";
      id: string;
      durationLiteral: "PT1S";
    }
  | {
      kind: "embeddedSubProcess";
      id: string;
      childScopeId: string;
    }
  | {
      kind: "callActivity";
      id: string;
      calledProcessId: string;
    }
  | {
      kind: "boundaryErrorEvent";
      id: string;
      attachedToRef: string;
      error: ErrorReference;
      outputFlowId: string;
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
  | {
      kind: "intermediateCatchMessageEvent";
      id: string;
      channel: Extract<
        MessageChannel,
        { kind: typeof MessageChannelKind.OperationMessage }
      >;
    }
  | {
      kind: "receiveTask";
      id: string;
      channel: Extract<
        MessageChannel,
        { kind: typeof MessageChannelKind.DirectMessage }
      >;
    }
  | CheckedServiceTask
  | CheckedConfiguredTask
  | {
      kind: "parallelGateway";
      id: string;
      direction: "diverging" | "converging";
    }
  | {
      kind: "exclusiveGateway";
      id: string;
      direction: "diverging";
      candidateFlowIds: [string, string];
      defaultFlowId: string;
    }
  | {
      kind: "inclusiveGateway";
      id: string;
      direction: "diverging";
      candidateFlowIds: [string, string];
      defaultFlowId: string;
    }
  | {
      kind: "inclusiveGateway";
      id: string;
      direction: "converging";
      pairedGatewayId: string;
    }
  | {
      kind: "eventBasedGateway";
      id: string;
      direction: "diverging";
    }
  | {
      kind: "errorEndEvent";
      id: string;
      error: ErrorReference;
    }
  | {
      kind: "terminateEndEvent";
      id: string;
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
  condition: CheckedCondition | null;
}>;

type NodeScopeOwnership = DeepReadonly<{
  nodeId: string;
  scopeId: string;
}>;

type SequenceFlowScopeOwnership = DeepReadonly<{
  sequenceFlowId: string;
  scopeId: string;
}>;
```

`MappingExpression.localVariable` is the implemented direct-lookup representation for two exact admitted JUEL-shaped output tokens; it is not a general expression language. It must not grow operators, paths, coercion, conditions, or other JUEL syntax. A future CIB JUEL mapping capsule must atomically replace this shortcut with pinned-runtime evaluation or retain one explicit exact-token equivalence under a single owner; pre-release production code must not expose two selectable evaluation accounts for the same source.

`CheckedProcess` means that parsing, supported-element admission, reference resolution, gateway-direction classification, profile membership, and bounded structural checks have succeeded. A rejected document does not produce this artifact.

The source/profile boundary validates each admitted Camunda binding and maps it to a registered neutral `protocol`/`operation` descriptor before producing the checked graph. Exact namespaces and lexical source tokens do not enter the checked graph. A nullable content-bound source-overlay identity records when alternate source bindings or exact inert attributes contributed to admission, but Lean, the semantic core, and Temporal never branch on its ID. Mapping names and literal bodies remain ordinary source-derived data because the checked graph and Lean lowering need them for the generic typed mapping mechanism; they are not lower-layer admission discriminators.

### Semantic Process program

The Semantic Process program is an immutable, content-bound definition. It contains control places and operations but no mutable execution state.

```ts
type SemanticProcessProgram = DeepReadonly<{
  kind: "semanticProcess";
  identity: {
    compiler: "bpmn-source-semantic-process";
    semanticProfile: string;
    sourceId: string;
    sourceOverlay: SourceOverlayIdentity | null;
    sourceSha256: string;
  };
  processId: string;
  definitionScopes: DefinitionScope[];
  operationScopes: OperationScopeOwnership[];
  controlPlaceScopes: ControlPlaceScopeOwnership[];
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

type OperationScopeOwnership = DeepReadonly<{
  operationId: string;
  scopeId: string;
}>;

type ControlPlaceScopeOwnership = DeepReadonly<{
  controlPlaceId: string;
  scopeId: string;
}>;

type OperationBase = DeepReadonly<{
  id: string;
  origin: {
    kind: "bpmnElement";
    elementId: string;
  };
}>;

type SimpleBooleanExpression = DeepReadonly<
  | { kind: "literal"; value: boolean }
  | { kind: "isPresent"; variable: string }
  | { kind: "isNull"; variable: string }
  | { kind: "stringEquals"; variable: string; value: string }
>;

type BpmnSequenceFlowOrigin = DeepReadonly<{
  kind: "bpmnSequenceFlow";
  elementId: string;
}>;

type ConditionalCandidate = DeepReadonly<{
  condition: SimpleBooleanExpression;
  output: string;
  origin: {
    kind: "bpmnSequenceFlow";
    elementId: string;
  };
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

type InterruptingErrorHandler = DeepReadonly<{
  attachedScopeId: string;
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

type InclusiveCandidate = DeepReadonly<{
  condition: SimpleBooleanExpression;
  output: string;
  expectedJoinInput: string;
  origin: BpmnSequenceFlowOrigin;
}>;

type AwaitEventRaceOperation = OperationBase & DeepReadonly<{
  kind: "awaitEventRace";
  input: string;
  message: {
    configurationOrigin: BpmnSequenceFlowOrigin;
    elementId: string;
    channel: Extract<
      MessageChannel,
      { kind: typeof MessageChannelKind.OperationMessage }
    >;
    output: string;
  };
  timer: {
    configurationOrigin: BpmnSequenceFlowOrigin;
    elementId: string;
    durationMs: 1000;
    output: string;
  };
}>;

type InvokeProcessOperation = OperationBase & DeepReadonly<{
  kind: "invokeProcess";
  input: string;
  calledProcessId: string;
  calledRootScopeId: string;
  calledEntry: string;
  returnOperationId: string;
}>;

type ReturnProcessOperation = OperationBase & DeepReadonly<{
  kind: "returnProcess";
  calledProcessId: string;
  calledRootScopeId: string;
  callerOutput: string;
}>;

type SemanticOperation = DeepReadonly<
  | (OperationBase & {
      kind: "initiate";
      output: string;
    })
  | (OperationBase & {
      kind: "initiateMessage";
      channel: Extract<
        MessageChannel,
        { kind: typeof MessageChannelKind.OperationMessage }
      >;
      outputs: [string, ...string[]];
    })
  | (OperationBase & {
      kind: "initiateTimer";
      timer: { durationMs: 1000 };
      outputs: [string, ...string[]];
    })
  | (OperationBase & {
      kind: "enterScope";
      input: string;
      childEntry: string;
      childScopeId: string;
    })
  | InvokeProcessOperation
  | ReturnProcessOperation
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
      kind: "awaitMessage";
      input: string;
      output: string;
      message: {
        elementId: string;
        channel: MessageChannel;
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
      kind: "choose";
      input: string;
      candidates: [ConditionalCandidate, ConditionalCandidate];
      defaultOutput: string;
      defaultOrigin: {
        kind: "bpmnSequenceFlow";
        elementId: string;
      };
    })
  | (OperationBase & {
      kind: "selectMany";
      input: string;
      candidates: [InclusiveCandidate, InclusiveCandidate];
      defaultBranch: {
        output: string;
        expectedJoinInput: string;
        origin: BpmnSequenceFlowOrigin;
      };
      selectionKey: string;
    })
  | (OperationBase & {
      kind: "synchronizeSelected";
      inputs: [string, string, string];
      output: string;
      selectionKey: string;
    })
  | AwaitEventRaceOperation
  | (OperationBase & {
      kind: "throwError";
      input: string;
      error: ErrorReference;
      handler: InterruptingErrorHandler;
    })
  | (OperationBase & {
      kind: "reachNoneEnd";
      input: string;
    })
  | (OperationBase & {
      kind: "terminateScope";
      input: string;
      scopeId: string;
    })
  | (OperationBase & {
      kind: "completeScope";
      scopeId: string;
      parentOutput: string | null;
    })
>;
```

String identifiers are wire representations, not permission to treat distinct identifier domains interchangeably in Lean or implementation code. Lean must use distinct types for process, node, Sequence Flow, operation, control-place, task-definition, and task-occurrence identifiers where those domains can be confused.

Semantic operation payloads carry their own element identifier when runtime occurrence identity depends on that element. For the single-occurrence `awaitUserTask`, `awaitTimer`, `awaitMessage`, and `awaitEffect` operations, that identifier is deliberately redundant with `origin.elementId`: program validation requires exact equality, runtime construction reads the semantic payload field, and source traceability reads `origin`. `awaitEventRace` instead originates at the Gateway and carries the distinct Message and Timer catch identities in its named arms; checked-definition binding requires each identity and configuration origin to match the corresponding checked branch. Future occurrence-producing operations must state which of these identity patterns they implement rather than derive runtime identity implicitly from provenance.

Definition scopes form one canonical acyclic ownership forest with one unique entry root whose `originElementId` equals `processId`. Existing profiles retain one rooted tree. The bounded Call Activity profile additionally has one distinct parentless called root selected by `calledProcessId`; `invokeProcess` and `returnProcess`, not a parent pointer or declaration order, connect it to the caller. Every checked node, Sequence Flow, operation, and control place has exactly one definition-scope owner. Scope ownership is definition data rather than runtime state, and embedded-scope entry, called-Process invocation, and their distinct completion strategies are explicit operations rather than implicit traversal of BPMN containment.

Definition arrays and unordered references are canonically sorted by identifier. `choose.candidates` is the deliberate exception: its tuple order is semantic evaluation order derived from process-level XML Sequence Flow declaration order. `selectMany.candidates` is canonically sorted by Sequence Flow origin because Inclusive evaluation order is non-semantic; `synchronizeSelected.inputs` is likewise sorted by Sequence Flow identity. Gateway `<outgoing>` reference order determines neither tuple.

### Runtime state

Runtime state is not part of `SemanticProcessProgram`. It includes definition-scope occurrences, scope-owned control-place token multiplicities, enabled external interactions, scope-owned semantic task, Message-subscription, timer, and effect occurrences, committed immutable effect arguments, explicitly scoped variables, the logical clock, committed command outcomes, and any explicit semantic choices.

Each runtime definition-scope occurrence has the complete identity `(processInstanceId, definitionScopeId, activation)` and either one parent occurrence or no parent for the root. Every token and wait carries exactly one occurrence owner. This prevents tokens or waits in one child activation from satisfying or blocking another scope and lets quiescence be checked against the complete owned region.

The implemented runtime contains one `ScopedVariables` value. Its `process.bindings` survive Activity completion and alone project to canonical `variables`. Each entry in `activities` contains `owner` plus `bindings`, where `owner` is the complete semantic effect occurrence `(processInstanceId, elementId, activation)`. Effect activation creates exactly one owned local scope from evaluated inputs. Matching completion requires exactly one matching owner, evaluates the validated patch and output mappings against that scope, updates Process bindings, and removes only that scope atomically. Missing or duplicate owners reject completion with exact state preservation. The complete replacement contract and discriminators belong to the [scoped runtime data specification](capsules/SCOPED-DATA-SPEC.md).

Structured Inclusive Gateway execution adds a hidden `selectedBranchSets` collection. Each record carries one scope-occurrence owner, the paired split identity as `selectionKey`, and a canonical nonempty one- or two-element tuple of expected join-input control places. The collection is canonically ordered by Process instance, definition scope, activation, and selection key. It is created only by `selectMany`, removed by the matching `synchronizeSelected` or owner-scope interruption, blocks owner-scope quiescence while live, and never enters canonical public observation. The complete bounded account belongs to the [Inclusive Gateway specification](capsules/INCLUSIVE-GATEWAY-SPEC.md).

Event-Based Gateway execution adds a hidden `eventRaces` collection and monotonic `eventRaceActivations`. Each race record contains the Gateway occurrence identity, its scope-occurrence owner, and the complete Message-subscription and Timer-occurrence identities armed together. The collection is canonically ordered by Process instance, Gateway element, activation, and owner. It is created only by `awaitEventRace`, removed by one matching winner or owner-scope interruption, blocks owner-scope quiescence while live, and never enters canonical public observation. A record without both owner-matching waits is invalid and is not a resumption surface. The complete bounded account belongs to the [Event-Based Gateway specification](capsules/EVENT-BASED-GATEWAY-SPEC.md).

Called-Process execution adds a hidden `calledProcessOccurrences` collection and monotonic `callActivations`. Each record links one caller scope occurrence and Call Activity occurrence to one distinct parentless called root, exact called Process definition, and immutable `returnProcess` identity. The called semantic instance ID is the capsule-owned UTF-8-byte-length-prefixed encoding; wait occurrence IDs derive from their owner rather than top-level control identity. A live record blocks caller quiescence, a nonquiescent called root blocks return, and interruption removes the complete called-instance subtree even though its root has no runtime parent. The record and definition forest never enter canonical public observation. The complete bounded account belongs to the [Call Activity specification](capsules/CALL-ACTIVITY-SPEC.md).

Lean and TypeScript may use different internal runtime representations. They must implement the same reviewed transition account and canonical observation contract; sharing an IL does not require sharing evaluator algorithms or runtime data structures.

Temporal state remains an adapter realization related to semantic state through refinement. Workflow tasks, Activity attempts, Event History records, Run IDs, and transport retries do not enter the Semantic Process program or semantic state.

## First lowering

The first lowering is total only over a valid `CheckedProcess` admitted by the bounded profile.

| Checked BPMN construct | Semantic Process construct |
|---|---|
| none Start Event | `initiate` |
| exact top-level operation-addressed Message Start Event | `initiateMessage` with the Start Event origin, complete Interface/Operation/Message channel, and canonical nonempty outgoing control-place collection |
| exact top-level `PT1S` Timer Start Event | `initiateTimer` with the Start Event origin, normalized `durationMs: 1000`, and canonical nonempty outgoing control-place collection |
| ordinary Sequence Flow | `ControlPlace` |
| Event-Based Gateway-to-catch configuration Flow | retained exactly once as one `awaitEventRace.configurationOrigin`; no control place |
| ordinary embedded Sub-Process | `enterScope` with the child definition scope and child entry place |
| exact in-document called-Process Call Activity | caller-owned `invokeProcess` with the distinct called root and called entry, plus called-owned `returnProcess` to the caller output |
| User Task | `awaitUserTask` |
| exact `PT1S` Intermediate Catch Timer Event | `awaitTimer` with `durationMs: 1000` |
| exact directly addressed payload-free Intermediate Catch Message Event | `awaitMessage` with Catch Event identity and resolved Interface/Operation/Message channel |
| exact payload-free direct-Message Receive Task | `awaitMessage` with Receive Task identity and the resolved direct Message arm; no Interface or Operation is synthesized |
| exact payload-free Service Task source shape | `awaitEffect` with the registered neutral Activity/probe descriptor and empty mappings |
| exact configured Task extension profile | `awaitEffect` with the Activity/probe descriptor, empty mappings, no BPMN Error route, and endpoint-derived control places; distinct checked Task identity is retained before lowering |
| bounded mapped-success Service Task source shape | `awaitEffect` with the registered neutral Activity/mapped-success descriptor, one literal input, and one local-reference output mapping |
| bounded mapped-boundary-Error Service Task source shape | `awaitEffect` with the registered neutral Activity/mapped-boundary-error descriptor, one literal/local-reference mapping pair, and one committed `bpmnErrorRoute` |
| exact-code Error End Event with one direct enclosing Sub-Process boundary Error | `throwError` with the throwing Error identity and the checked, resolved interrupting handler |
| identity-only Terminate End Event | `terminateScope` with the exact End origin, incoming control place, and containing definition scope; no continuation output |
| explicit Sub-Process boundary Error Event | no independent operation; its checked attachment, matching Error, and outgoing parent flow are retained in the resolved `throwError.handler` |
| diverging Parallel Gateway | `duplicate` |
| converging Parallel Gateway | `synchronize` |
| exact divergent Exclusive Gateway under Simple Boolean v1 | `choose` with two declaration-ordered candidates and one default |
| identity-only converging Exclusive Gateway | `mergeExclusive` with one canonical nonempty input collection and one output derived only from checked Sequence Flow endpoints |
| exact structured divergent Inclusive Gateway under Simple Boolean v1 | `selectMany` with two canonical candidates, one default, branch-local expected join inputs, and the split identity as selection key |
| paired converging Inclusive Gateway | `synchronizeSelected` with the three canonical model inputs and the paired split identity |
| exact non-instantiating Exclusive Event-Based Gateway with one operation-addressed Message catch and one exact `PT1S` Timer catch | one `awaitEventRace`; configured catches produce no separate `awaitMessage` or `awaitTimer` operation |
| none End Event | `reachNoneEnd` |
| every embedded definition scope and the entry root | one synthetic `completeScope`; child completion emits the Sub-Process outgoing token and entry-root completion marks the aggregate Process complete |
| called Process root | no `completeScope`; its unique `reachNoneEnd` has a virtual structural edge to the paired `returnProcess` |

Operation identifiers are deterministically derived from the source element identity without erasing the `origin`. Control-place identifiers are deterministically derived from Sequence Flow identity. The compiler identity, profile identity, exact source identity, nullable source-overlay identity, and exact source digest are copied into the program identity.

For the structured Inclusive region, lowering follows each split Sequence Flow through its sole direct User Task to the exact input Sequence Flow of the paired join. That branch-local input becomes `expectedJoinInput`; the split BPMN element ID becomes `selectionKey`. Checked-definition binding requires each mapping and key to equal this structural derivation, so merely permuting the three expected-input values while retaining the same set is a standalone-program-valid shape but not a valid checked-definition binding.

For the Event-Based Gateway region, lowering classifies each of the two Gateway-to-catch Sequence Flows as configuration rather than token flow. The Gateway incoming Flow becomes `awaitEventRace.input`; each configured catch's outgoing Flow becomes its named arm output; the Gateway, configuration Flow, catch, channel, and output identities remain explicit. Every checked Sequence Flow is represented exactly once as either one control-place origin or one race configuration origin. Swapping the two configuration origins while preserving their set can remain a standalone-program-valid shape, but exact checked-definition binding and independent Lean lowering reject it.

For an identity-only converging Exclusive Gateway, lowering derives every merge input and the sole output from checked Sequence Flow endpoints and canonicalizes only the merge input collection. Conditional Sequence Flows remain owned by the upstream divergent Gateway, and their process declaration order remains exact in `choose.candidates`; the merge does not re-evaluate those conditions or acquire input priority.

Lowering must not resolve token races, choose an execution order, create runtime task occurrences, inspect future scenario commands, or encode expected observations.

For the bounded Call Activity, lowering selects the caller root by exact `processId`, emits the only `initiate` for its None Start, and erases the called None Start into `invokeProcess.calledEntry`. The invoke is owned by the caller root; its paired return is owned by the called root. Checked-definition binding independently locks the resolved called Process/root/entry, caller input/output, operation ownership, common Call Activity origin, and return identity. Declaration order and a structurally valid target/root/entry permutation cannot alter or bypass that binding.

For the approved parallel graph:

```text
start → fork → task A ─┐
               task B ─┴→ join → end
```

lowering produces one `initiate`, one `duplicate`, two `awaitUserTask` operations, one `synchronize`, one `reachNoneEnd`, one root `completeScope`, and one control place for every admitted Sequence Flow.

## Operational semantics

### Initiation

An accepted manual start stimulus enables `initiate` exactly once for the process instance. Firing it adds one token to its output control place.

An accepted `triggerMessageStart` stimulus must match the program Process, Message Start Event, Interface, Interface Operation, and input Message exactly. Admission creates the ordinary fresh root occurrence without installing a Message subscription or payload. Firing `initiateMessage` clears pending initiation and adds one root-owned token to every canonical output control place. The reusable operation admits a nonempty output collection; the registered Message Start profile requires exactly one output.

An accepted `triggerTimerStart` stimulus must match the program Process and Timer Start Event exactly while the registered profile binds the operation to normalized duration `1000`. Admission creates the ordinary fresh root occurrence without installing a running Timer, schedule, due time, or logical-clock change. Firing `initiateTimer` clears pending initiation and adds one root-owned token to every canonical output control place. The reusable operation admits a nonempty output collection; the registered Timer Start capability requires exactly one output.

### User Task wait

`awaitUserTask` is enabled when its input control place contains at least one token and no occurrence for that firing already exists. Firing consumes exactly one input token and creates one semantic task occurrence bound to the task definition and occurrence identity.

An accepted completion for that occurrence removes the wait and adds one token to the output control place. A completion for an unknown, stale, duplicate, or otherwise ineligible occurrence follows the capsule-owned command outcome rules and does not invent control-flow progress.

### Relative timer wait

`awaitTimer` is enabled when its input control place contains at least one token and no occurrence for that firing already exists. Firing consumes exactly one input token and creates one timer occurrence with full Process-instance, element, and activation identity, an output control place, and deadline `logicalTimeMs + durationMs`.

Internal closure stops at the timer wait. An exact `fireTimer` stimulus commits only when its full occurrence identity is active and its submitted logical time equals the deadline. Commit removes the wait, advances logical time to the deadline, adds one token to the output control place, and resumes closure. Any occurrence-identity or logical-time mismatch is rejected with exact state preservation.

The exact `PT1S` lexical value remains in the checked graph; Lean and TypeScript lower it independently to `1000`. Physical clock origin, scheduler latency, CIB job identity, and Temporal timer identity do not enter the program or runtime semantics. The complete rule and race-free refinement boundary belong to the [Intermediate Catch Timer capsule](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md).

### Message subscription wait

`awaitMessage` is enabled when its input control place contains at least one token and no subscription for that firing already exists. Firing consumes exactly one input token and creates one Process-owned subscription containing the full Process-instance, Message-wait element, and activation identity plus one complete closed channel arm. An Intermediate Catch Message Event uses `operationMessage` with resolved Interface, Interface Operation, and Message identities; a direct-Message Receive Task uses `directMessage` with only the resolved Message identity. Internal closure stops at that public resumption surface.

An exact `deliverMessage` stimulus commits only when its full subscription identity and complete discriminated channel equal the active subscription. Arm kind and every field in that arm participate in equality; matching `messageId` under different arms is not equality. Commit removes the subscription, adds one token to the operation output, and resumes closure. A pre-activation, wrong-identity, wrong-channel, stale, or repeated well-formed delivery is rejected with exact state preservation. The operation carries no payload and does not perform key-based correlation, global routing, or modeled Message throw. The operation-addressed rules and Signal refinement belong to the [Intermediate Catch Message specification](capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md); the direct-Message specialization belongs to the [Receive Task specification](capsules/RECEIVE-TASK-MESSAGE-SPEC.md).

### Event race arming and winner commitment

`awaitEventRace` is enabled by one owner-matching Gateway input token. Firing consumes exactly that token and atomically creates one ordinary operation-addressed Message wait, one ordinary exact-duration Timer wait, and one hidden race occurrence that identifies both members and their owner. The firing increments the Gateway-race, Message, and Timer activation counters together. No configuration-flow or branch-output token exists while armed, and no half-armed state is stable.

An exact matching `deliverMessage` or `fireTimer` stimulus can commit only when exactly one live race associates the submitted occurrence with both complete owner-matching waits and the immutable operation definition. Message commitment also requires complete channel equality; Timer commitment requires the exact active deadline. One successful stimulus atomically removes both waits and the race record, adds one owner-matching token only to the winner output, and resumes closure. Message victory preserves logical time; Timer victory advances it to the deadline. A wrong identity, channel, or deadline; an incomplete or erased association; or the losing stimulus after commitment is rejected with exact state preservation.

The semantic evaluator receives one explicit stimulus at a time and does not define a simultaneous-trigger priority. Temporal readiness ordering and the fail-closed coalesced-activation boundary remain adapter refinement obligations owned by the [Event-Based Gateway specification](capsules/EVENT-BASED-GATEWAY-SPEC.md).

### External effect wait, bounded data mapping, and typed business error

`awaitEffect` is enabled when its input control place contains at least one token and no occurrence for that firing already exists. Firing consumes exactly one input token, evaluates the admitted pure input mappings, and commits one effect occurrence containing full identity, descriptor, immutable arguments, output mappings, and the output control place.

The payload-free Service Task and configured Task profile have empty mappings and accept only the empty successful result. The configured source remains distinct through checked admission and specializes to the same neutral Activity/probe operation. The mapped-success slice evaluates one admitted string literal into the one source-named Activity-local argument. A matching successful `completeEffect` accepts only the exact typed local patch required by the active operation. It applies the operation's source-named output mapping to Process scope, removes the effect wait and Activity-local state, adds one normal output token, and resumes closure. A malformed patch or mismatched occurrence rejects with exact state preservation.

The mapped-boundary-Error slice extends the same operation with one immutable exact-code Error route and extends variable values with a closed `string`/`null` union. A matching `bpmnError` result carries a validated Activity-local patch and optional non-empty message. Under the selected CIB-specific profile, the evaluator atomically installs the patch, applies the program-owned output mapping, removes the effect wait and Activity-local state, abandons the normal output, adds the boundary-route token, and resumes closure. An occurrence mismatch, non-matching Error code, or malformed patch rejects with exact state preservation. The Error route stays definition-only; code and message do not enter canonical state.

The Worker never receives mutable Process state and never selects Process output names. Descriptor, arguments, result, output mapping, Error route, Process scope, and occurrence-owned Activity-local scope remain separate contracts. The exact bounded mechanisms and their provenance belong to the [Service Task effect spec](capsules/SERVICE-TASK-EFFECT-SPEC.md), the retained [CreateDocument data spec](capsules/CREATE-DOCUMENT-DATA-SPEC.md), the retained [boundary-error spec](capsules/BOUNDARY-ERROR-SPEC.md), the [A12 product-boundary specification](A12-ADD-ON-BOUNDARY-SPEC.md), and the [scoped runtime data spec](capsules/SCOPED-DATA-SPEC.md). Current engine profiles and fixtures are product-neutral; A12 source bindings are optional adoption evidence supplied only through the data-only overlay.

### Parallel duplication

`duplicate` is enabled when its input control place contains at least one token. Firing consumes exactly one input token and adds exactly one token to every distinct output control place.

### Parallel synchronization

`synchronize` is enabled if and only if every named input control place contains at least one token. Firing consumes exactly one token from every named input and adds exactly one token to its output.

Excess multiplicity on any input remains available for later firings. Multiple tokens arriving through one input do not compensate for a missing token on another input. This is the approved normative per-incoming-Sequence-Flow interpretation for the parallel capsule.

### Exclusive merge

`mergeExclusive` has one canonical nonempty collection of distinct input places and one distinct output. Its declarative relation permits one owner-preserving pass-through for each offered token occurrence without synchronization or input priority. This is the reusable BPMN Multi-Merge relation, not a three-input or one-token definition.

The executable evaluator implements only the selected cycle profile's proven unique-offer subset: it advances when total offered multiplicity is exactly one and otherwise returns no successor. Zero or multiple offers record evaluator incompleteness outside that profile, not a declarative BPMN refusal. The cycle profile independently requires exactly three inputs and proves its admitted execution cannot reach a multiple-offer state.

### Conditional choice

`choose` is enabled when its input control place contains at least one token. It evaluates its typed Simple Boolean candidates against the complete committed Process-scope string/null bindings in tuple order, consumes exactly one input token, and adds exactly one token to the first true candidate output. If every candidate is false, it adds exactly one token to the default output. It creates no wait, command, receipt, continuation, or host effect.

Simple Boolean v1 is total after admission. The operation therefore has no semantic evaluation-error arm. The language URI, five exact source forms, bounds, and truth table belong to the [Simple Boolean expression decision](SIMPLE-BOOLEAN-EXPRESSION-DECISION.md); the source topology and routing laws belong to the [Exclusive Gateway condition specification](capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md).

### Inclusive multi-selection and selected synchronization

`selectMany` is enabled by one owner-matching input token. It evaluates both canonical candidates against the same complete committed Process bindings, consumes exactly one input token, and adds one token to every true candidate output. When neither candidate is true it adds one token only to the conditionless default output. The firing atomically creates one owner- and split-keyed record containing exactly the selected branches' corresponding join inputs; an empty record and a second live record with the same owner and key are impossible.

`synchronizeSelected` is enabled only when exactly one matching live record exists and every input named by that record has one token with the same owner. It consumes exactly one token from each recorded input, consumes no unselected model input, removes the record, and adds exactly one owner-matching output token. A missing record, one selected arrival missing from a two-input record, or tokens owned by another scope occurrence disable the operation. This is the bounded WCP-7 interpretation for the approved closed acyclic region, not a general Inclusive Gateway reachability algorithm.

### Definition-scope entry and completion

`enterScope` is enabled by one token owned by its parent occurrence. Firing consumes that token, creates one fresh child occurrence under that parent, and adds one child-owned token to the child entry place. The child None Start Event is source structure used to derive that entry; it does not lower to a second `initiate`.

`reachNoneEnd` is enabled by one token owned by the operation's scope occurrence. Firing consumes exactly that token and records the corresponding end occurrence. It emits no parent token and does not complete the scope by itself.

`terminateScope` is enabled by exactly one offered token whose owner is one exact live occurrence of the operation's `scopeId`. Firing consumes that token, removes every other represented live owner in that occurrence subtree including transitive called-Process ownership and Activity-local effect state, retains the selected occurrence quiescent, and increments the existing aggregate End occurrence counter exactly once. Activation counters, Process variables, logical time, parent ownership, and higher-level work are preserved. The operation emits no continuation token. The unchanged matching `completeScope` remains the only producer of one nested parent continuation or root completion.

`completeScope` is enabled only when exactly one occurrence of its definition scope exists and that complete owned region is quiescent: it owns no token, task, Message, Timer, or effect wait, no selected-branch or event-race record, and no live child occurrence. Child completion removes the child occurrence and emits exactly one token to the parent-owned Sub-Process output. Root completion requires no initiation work and marks the Process complete. Nonquiescent, missing, or duplicate occurrences refuse the internal step without state change.

The process instance is complete only through root-scope completion. Reaching one none End Event does not by itself discard unrelated work in the same scope, and completing one child branch does not complete its containing scope while a sibling wait remains live.

### Called-Process invocation and normal return

`invokeProcess` is enabled by exactly one caller-owned input token, one unique caller root occurrence, and no live record for that caller/Call Activity identity. Firing consumes the caller token, increments the call activation, derives a distinct semantic called-instance ID from the caller ID and Call Activity ID using decimal UTF-8 byte lengths, creates one parentless called root plus one hidden association record, and places one called-owned token at `calledEntry`. It emits no caller output token.

`returnProcess` first counts every record associated with its return and Call Activity identity, then requires exactly one before validating the immutable called Process/root fields. It is enabled only when exactly one matching parentless called root exists, the caller still exists, and the complete called-instance region is quiescent. Firing removes the called root, record, and every runtime object owned by that called-instance subtree, then adds one caller-owned token to `callerOutput`. Missing, duplicate, aliased, mismatched, or nonquiescent associations disable the internal step without mutation. The externally committed command that exposed such a synthetic malformed state is not rolled back; that state is non-resumable.

### Error throw and direct-parent interruption

`throwError` is enabled by one token on the Error End Event input in the operation's child scope occurrence. Firing consumes that token, selects the already checked exact-code handler attached to the directly enclosing embedded Sub-Process, removes every token, task, Message subscription, Timer, effect wait, selected-branch record, event-race record, Activity-local scope, and descendant occurrence owned by that interrupted child occurrence, removes the child occurrence itself, and emits exactly one parent-owned token on the boundary route.

Task, Message, Timer, event-race, effect, scope, and End activation counters are monotonic historical state and survive regional interruption. Root-owned runtime work survives. The transition is one internal closure step: no pending Error or half-canceled scope is stable or public, and the structurally retained normal Sub-Process output cannot be emitted after the occurrence is removed.

### Internal scheduling

The relation may permit more than one internal operation. Any semantically material choice must be explicit input or proven observationally irrelevant under exact hypotheses. The executable evaluator must not turn collection order into an undeclared scheduling rule.

## Well-formedness

`WellFormedProgram` must establish at least:

- process, definition-scope, operation, and control-place identifiers are nonempty and unique in their domains;
- definition scopes form one canonical acyclic forest with exactly one entry root selected by `processId`; every node, Sequence Flow, operation, and control place has exactly one existing owner; every non-root scope is owned by exactly one `embeddedSubProcess`/`enterScope` pair; and every additional parentless root belongs to one exact `invokeProcess`/`returnProcess` pair;
- every referenced control place exists;
- every source origin required by the current profile is present and nonempty;
- every `duplicate` has at least two distinct outputs;
- every `synchronize` has at least two distinct inputs;
- every `initiateMessage` has one complete operation-addressed channel and a canonical nonempty collection of distinct existing outputs; the registered Message Start profile has exactly one output;
- every `initiateTimer` has exact duration `1000` and a canonical nonempty collection of distinct existing outputs; the registered Timer Start capability has exactly one output;
- every `mergeExclusive` has a canonical nonempty collection of distinct inputs, one distinct existing output, and the selected cycle profile has exactly three inputs;
- every `choose` has exactly two distinct candidate outputs, a distinct existing default output, valid Simple Boolean expressions, and exact Sequence Flow origin/output agreement;
- every `selectMany` has exactly two canonical distinct candidate outputs, one distinct default output, three distinct existing branch-local expected join inputs, valid Simple Boolean expressions, exact Sequence Flow origin/output agreement, and one nonempty selection key;
- every `synchronizeSelected` has exactly three canonical distinct inputs, one existing output, and the same nonempty selection key as exactly one `selectMany`; its input set equals that selection's three candidate/default expected inputs;
- every ordinary single-occurrence operation payload element identifier matches its BPMN origin;
- every `awaitEventRace` has one existing input, two distinct existing outputs, distinct nonempty Message and Timer catch identities, distinct nonempty configuration-flow origins absent from the control-place origin set, one complete `operationMessage` channel, and exact Timer duration `1000`; its Gateway origin is distinct from both catches;
- every admitted `awaitTimer` has a timer element matching its BPMN origin and exact duration `1000`;
- every admitted `awaitMessage` has a Message-wait element matching its BPMN origin and exactly one closed channel arm: `operationMessage` requires nonempty Interface, Interface Operation, and Message identities, while `directMessage` requires only a nonempty Message identity and forbids Interface fields;
- every admitted `awaitEffect` has a profile-permitted descriptor and the exact mapping pair for that descriptor;
- mapping targets are nonempty and unique, literal inputs remain exact strings, and local-variable outputs refer only to the admitted result-local name;
- every non-null `bpmnErrorRoute` has a nonempty exact code, a distinct existing boundary output, complete source provenance, and the exact profile-permitted handler/mapping combination;
- every `throwError` has a valid Error reference, an input owned by its throwing child scope, exactly one direct-parent handler with the same Error element and code but a distinct catching ErrorEventDefinition, and a handler output owned by that parent and originating from the recorded boundary Sequence Flow;
- every `terminateScope` has one existing input owned by its exact existing `scopeId`, an End Event origin, no output, and one virtual structural edge to that scope's unique `completeScope`;
- every `invokeProcess` crosses from the entry root to one distinct called root and carries one exact paired `returnProcess`; the return is owned by that called root, crosses only to the caller output, shares the Call Activity origin and called definition, and the called root has one virtual End-to-return edge;
- the current profile has exactly one entry-root-owned Process initiation, `initiate`, `initiateMessage`, or `initiateTimer`, and its start stimulus kind must match; every embedded scope and the entry root have one `completeScope`; a called root instead has exactly one `returnProcess`; and no `enterScope` targets a parentless root;
- each control place has only the producer and consumer shapes permitted by the current lowering;
- every operation and control place is reachable from initiation and can reach the root completion under the full structural graph, including explicit end-to-scope-completion edges;
- every existing profile is acyclic; the selected cycle profile alone removes outgoing edges from its exact `awaitUserTask` resumption operation before saturation-certified acyclicity, while full-graph reachability and co-reachability remain mandatory;
- the exact multiset of operation kinds is permitted by the named semantic profile;
- the Simple Boolean Exclusive Gateway profile has exactly one initiation, one choice, three User Task waits, three end-reaching operations, one root completion, seven control places, and the exact producer/consumer chain that makes an independent simultaneous internal operation unreachable.
- the structured Inclusive Gateway profile has exactly one initiation, one multi-selection, three User Task waits, one selected synchronization, one end-reaching operation, one root completion, eight control places, one branch-local split-to-task-to-join pairing for each output, and no alternate entry or exit;
- the Event-Based Gateway profile has exactly one initiation, one event race, two User Task waits, two end-reaching operations, one root completion, five control places, two distinct configuration-flow origins, and no separate `awaitMessage` or `awaitTimer` operation for its configured catches;
- the registered Message Start capability has exactly one `initiateMessage`, one User Task wait, one end-reaching operation, one root completion, two control places, and one root scope;
- the registered Timer Start capability has exactly one `initiateTimer`, one User Task wait, one end-reaching operation, one root completion, two control places, and one root scope;
- the registered Terminate End capability has two definition scopes, one initiation, one scope entry, one parallel duplication, three User Task waits, one containing-scope termination, two end-reaching operations, two scope completions, eight control places, and no termination output;
- the User Task cycle profile has exactly one initiation, one three-input Exclusive Merge, one User Task wait, one declaration-ordered conditional choice, one end-reaching operation, one root completion, six control places, one root scope, and no cycle remaining after the User Task continuation cut;
- the bounded Call Activity profile has exactly two parentless definitions, one caller initiation, one invocation, two User Task waits, two end-reaching operations, one called return, one caller-root completion, five control places, and no called-root initiation or completion operation;

Lean's standalone `programWellFormed` independently checks the canonical scope forest and ownership maps, exact one-producer/one-consumer control-place shape, one entry root plus the profile-selected completion strategy for every scope, reachability of every operation from the single initiation operation, co-reachability of every operation to entry-root completion, and the selected profile's whole-graph or resumption-cut acyclicity within the finite operation-vertex fuel. Exact lowering equality remains an additional artifact requirement. Production admission then applies the separate exact profile mechanism/cardinality capability. The checked-source validator performs the corresponding scope-local reachability, co-reachability, and selected graph-policy checks before lowering. The implemented split and composed profiles are owned by the [profile-parameterized admission specification](PROFILE-PARAMETERIZED-ADMISSION-SPEC.md); the resumption-cut exception is owned by the [cyclic-control-flow specification](capsules/CYCLIC-CONTROL-FLOW-SPEC.md).

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
8. a capsule-local source-to-program preservation result or executable discriminator for every material admission, lowering, runtime-representation, or public-observation change, whose statement begins before the changed boundary and does not assume the account it is intended to justify.

The strongest reusable preservation target remains observational:

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

An implemented preservation statement may use a state relation rather than identical source and program state types, but it must begin at the earliest project-owned representation affected by the capsule and relate the same explicit scenario and public observation. A converse or exact equivalence claim requires a separate checked theorem; it must not be inferred from soundness. The universal `lower_preserves_supported_run` theorem is not a standing prerequisite for all admission. It becomes mandatory when a second capsule needs the same proposition or when the targeted proof cannot isolate the material risk without reconstructing the general bridge.

For each retained program emitted by TypeScript, Lean must decode both the checked graph and emitted program, recompute `lower source`, reject inequality, and only then evaluate or prove program properties. A scenario identifier or fixture name is not a substitute for this content equality.

Lean implements items 1 through 7 and the exact per-artifact requirement above. It proves structural definition-identity and Sequence-Flow-origin preservation, but it does not claim `lower_preserves_supported_run`. The [bounded checked-source relation experiment](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md) produced a provisional direct source token game and fixture-coincidental lowering discriminator. Stage 1 proves the operation-prefix ordering substrate and bounded two-segment selector correspondence. Stage 2 adds executable finite graph checks and the stronger standalone program graph validator. Stage 2b adds declarative tail decomposition, executable-tail-parser soundness, graph-derived uniqueness up to parallel-branch exchange, and positive executable-reachability soundness. Stage 2c adds graph-derived whole-process unique Start/End, a nonempty chain, complete distinct node coverage, complete Sequence Flow coverage, unique Flow-source ownership, and canonical-chain comparison without parser state in the exported proposition. Stage 2d adds saturation-certified path completeness, declarative return-path exclusion, and reachability antisymmetry. Stages 3a and 3b add graph-derived single- and two-token frontier localization without selector or closure soundness. These results are frozen experiments rather than a production admission programme. Optional vertex-count fuel adequacy, direct Timer/effect source clauses, closure-selector soundness, the four-step closure theorem, generalized state/transition/observation correspondence, and run-level induction remain unproved. The source account remains experimental and is not an independent BPMN authority.

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

The project must not create a universal `event` operation with a bag of flags, duplicate the BPMN metamodel as opcodes, or erase distinctions merely because two constructs look similar in one witness. A new operation or field requires an approved capsule, a named consumer or refinement risk, a separating witness, source-origin rules, well-formedness rules, observation consequences, and targeted Lean preservation obligations. A capsule that changes admission or replaces lowering, runtime state, or observation must also executable-check that every newly reachable internal closure remains within the configured production closure limit. Every newly reachable multiple-enabled state must be an approved independent/order-invariant set, carry an explicit semantic choice, or be rejected consistently by Lean and TypeScript. Every newly reachable stable running state must expose a Timer, task, effect, subscription, or other explicit semantic resumption surface; a stranded token state blocks admission rather than silently remaining `running`.

## Supported slice

The maintained implementation supports exactly:

- one profile-selected Process Start Event: one exact top-level operation-addressed Message Start Event in the registered Message Start profile, one exact top-level `PT1S` Timer Start Event in the registered Timer Start profile, and one none Start Event in every other registered profile;
- one or more User Tasks permitted by the two approved capsules;
- one exact `PT1S` Intermediate Catch Timer Event under its single-token linear capsule;
- one finite acyclic linear composition containing exactly one exact `PT1S` Intermediate Catch Timer Event and one User Task under the profile-parameterized admission specification;
- one directly addressed payload-free Intermediate Catch Message Event plus one User Task in either finite acyclic linear order under the profile-parameterized admission specification;
- one exact Service Task binding under its single-token success-only effect capsule;
- one registered exact configured Task extension in the linear Start-to-configured-to-User-to-End profile, retained as distinct checked source and lowered to the existing payload-free Activity/probe effect operation;
- one bounded mapped-success Service Task with arbitrary exact source identities, one literal string input, and one local-reference output mapping;
- one bounded mapped-boundary-Error Service Task with arbitrary exact source identities, the same mapping forms, and one attached exact-code interrupting Error route;
- diverging and converging Parallel Gateways under the recorded direction and arity restrictions;
- one divergent Exclusive Gateway with exactly two Simple Boolean v1 conditions and one conditionless default under process-level Sequence Flow declaration order;
- one root-scope resumption-bounded cycle containing one identity-only converging Exclusive Gateway, one User Task, one declaration-ordered two-condition-plus-default divergent Exclusive Gateway, and one None End Event under the closed cycle profile;
- one structured Inclusive Gateway region with one two-condition-plus-default split, three direct User Task branches, one paired selected-input join, and one None End Event under Simple Boolean v1;
- one non-instantiating Exclusive Event-Based Gateway with one operation-addressed payload-free Message catch, one exact `PT1S` Timer catch, two direct User Task continuations, and two None End Events;
- one exact in-document Call Activity from one caller root to one distinct called Process root, with one User Task in each Process, empty data, distinct semantic instance identity, and normal quiescent return;
- one ordinary one-level embedded Sub-Process with two independent child User Tasks and two child None End Events, followed by one outer User Task and root None End Event;
- one one-level embedded Sub-Process with two independent child User Tasks, one child Error End Event, one child None End Event, one exact matching interrupting boundary Error in the parent, one outer recovery User Task, and a structurally present but unreachable normal continuation;
- one registered one-level embedded Sub-Process with two parallel child User Tasks, one child Terminate End Event, one child None End Event, one outer User Task, selected-occurrence-retaining regional cancellation, and ordinary parent continuation;
- none End Events permitted by the capsules;
- `initiate`, `initiateMessage`, `initiateTimer`, `enterScope`, `invokeProcess`, `returnProcess`, `awaitUserTask`, `awaitTimer`, `awaitMessage`, `awaitEffect`, `awaitEventRace`, `duplicate`, `synchronize`, `mergeExclusive`, `choose`, `selectMany`, `synchronizeSelected`, `throwError`, `terminateScope`, `reachNoneEnd`, and `completeScope`;
- definition-scope ownership and occurrence identity plus token multiplicity per Sequence Flow and scope occurrence;
- semantic task, Message-subscription, timer, and effect occurrence identity, hidden occurrence-owned Inclusive selected-branch and Event-Based Gateway race records, closed string-or-null Process/Activity-local data for the exact mapping slices, logical time, and command closure;
- the canonical observation boundary including `openMessageSubscriptions`, `openTimers`, effect arguments in `openEffects`, and Process `variables`.

The sequential User Task, balanced parallel, Intermediate Catch Timer, Timer/User Task composition, Intermediate Catch Message, payload-free Service Task, mapped-success Service Task, mapped-boundary-Error Service Task, Simple Boolean Exclusive Gateway, structured Inclusive Gateway, bounded Event-Based Gateway, ordinary embedded Sub-Process, and Sub-Process Error-propagation fixtures must all lower through the same operation language and execute through the same generic semantic transition mechanism.

## Excluded surface

The following remain unsupported:

- general BPMN 2.0.2 import or conformance;
- event subtypes beyond the admitted none Start, exact top-level payload-free Message Start, exact top-level `PT1S` Timer Start, exact normal-flow and Event-Based-Gateway-configured `PT1S` Intermediate Catch Timer, exact normal-flow and Event-Based-Gateway-configured payload-free Intermediate Catch Message, exact attached interrupting Error route, and none End Events;
- other timer forms, other Message forms, Message payloads, key-based or global correlation, modeled Message throw, Message Flow, boundary Events beyond the exact Task-attached and Sub-Process-attached Error slices, catch-all or unmatched Errors, handler search beyond one direct parent, Error payloads, Intermediate Throw Errors, signals as BPMN semantics, escalation, cancellation Events, compensation, and Terminate End outside the exact registered topology and generic root-capable checked/IL representation;
- arbitrary Sub-Process nesting, Call Activities outside the exact two-Process empty-data normal-return slice, external/deployed called definitions, Global Tasks, recursion, repeated/concurrent calls, transactions, event Sub-Processes, and exceptional scope cancellation or event propagation beyond the exact direct-parent Error slice;
- converging or mixed data-based Exclusive Gateways outside the exact identity-only cycle merge, missing-default or non-binary Exclusive routing, Inclusive Gateways outside the exact paired structured region, general Inclusive reachability, complex gateways, and Event-Based Gateways outside the exact non-instantiating Message/`PT1S` Timer profile;
- cycles outside the exact root-scope User Task profile, concurrent Exclusive Multi-Merge execution, Standard Loop Characteristics, multi-instance activities, condition consumers beyond the admitted Exclusive and Inclusive Gateway profiles, general expressions, non-string/non-null data, general variables or scopes, and mappings beyond one literal-string input plus one simple Activity-local-variable output per mapped Service Task;
- XPath, JUEL, FEEL, script parsing or evaluation, conditional-evaluation receipts, and every expression runtime beyond Simple Boolean v1;
- host-side external-effect execution and effect mechanisms beyond the approved success and typed boundary-error capsules;
- generated TypeScript as semantic authority;
- optimization, bytecode, code generation, migration, and durable-version compatibility;
- a separate CIB-compatible parallel profile.

## Maintained conformance obligations

This contract remains valid only while:

- the checked graph and Semantic Process program have current schemas and adversarial contract tests;
- sequential, Message Start, Timer Start, parallel, timer, Timer/User Task composition, Intermediate Catch Message, payload-free effect, registered configured Task, mapped-success, mapped-boundary-Error, Simple Boolean Exclusive Gateway, structured Inclusive Gateway, bounded Event-Based Gateway, ordinary embedded Sub-Process, Sub-Process Error propagation, bounded Call Activity, and registered Terminate End exact-source fixtures lower deterministically;
- the topology-specific executable IR and evaluator path are removed atomically;
- no IL operation delegates to a retained topology-specific evaluator;
- invalid source and invalid program mutations fail in their correct result classes;
- Lean checks exact lowering equality before evaluation;
- the targeted preservation statement or discriminator for each material capsule remains explicit and its achieved proof status is reported exactly;
- Lean evaluator soundness is checked;
- the independent TypeScript evaluator passes sequential, exact-target Message Start admission/initiation/refusal/observation, exact-target Timer Start admission/initiation/refusal/observation/closure, parallel, timer, Timer/User Task composition, direct Message subscription/delivery, payload-free effect, configured Task descriptor/closure/refusal/continuation, mapped-success data/mapping, mapped-boundary-Error, Simple Boolean conditional-choice, structured Inclusive selected-branch synchronization, bounded Event-Based Gateway arming/winner/withdrawal/refusal, ordinary child-scope quiescence/completion, direct-parent Error interruption, bounded called-Process invocation/return, and registered containing-scope termination separating witnesses;
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
- required neutral semantic distinctions cannot be reconstructed from origins and the checked graph, or source/profile normalization is reported as independently rechecked by Lean when Lean receives only its normalized result;
- structural invalidity is represented as an ordinary semantic outcome;
- the Lean account begins only after an unverified semantic translation;
- the old and new executable representations would need to coexist in production;
- a dependency change is required without the separately mandated approval;
- the preservation obligation cannot be stated without assuming the desired result.

## Ownership and change control

This specification owns the Semantic Process IL purpose, boundary, operation meanings, lowering obligations, and growth rules. [Shared wire contracts](../contracts/README.md) own the current schemas and artifact validation. Approved feature meaning remains in the applicable [semantic capsule](capsules/README.md), and exact implementation status remains in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).

During pre-release there is exactly one current checked-graph contract and one current Semantic Process program contract. A breaking change replaces all current producers, consumers, fixtures, schemas, and tests atomically. Compatibility readers, embedded format counters, and migration layers remain excluded until a durable baseline is explicitly approved.
