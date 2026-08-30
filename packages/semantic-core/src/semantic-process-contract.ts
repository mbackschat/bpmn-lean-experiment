/**
 * The Semantic Process IL: the executable program a checked BPMN graph lowers to.
 *
 * BPMN elements have been resolved into operations and control places here, and the two namespaces
 * are separate: an operation names its BPMN provenance through `origin` rather than by reusing an
 * element identity as a place. The checked graph this is lowered from is owned by
 * `checked-process-contract.ts`, and the value shapes both carry unchanged by
 * `semantic-value-contract.ts`.
 *
 * The program is immutable; runtime state lives in `semantic-process-state.ts`.
 */
import type { DirectActivityDataInput } from "./activity-data-input-contract.js";
import type { DirectActivityDataOutput } from "./activity-data-output-contract.js";
import type { DirectCatchEventPayloadOutput } from "./catch-event-payload-contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import type { SourceOverlayIdentity } from "./source-overlay-identity.js";
import type { UserTaskMetadata } from "./user-task-metadata.js";
import type {
  SequentialMultiInstanceDataDefinition,
  SequentialMultiInstanceLimits,
} from "./sequential-multi-instance-contract.js";
import type {
  ParallelMultiInstanceCompletionCondition,
  ParallelMultiInstanceDataDefinition,
  ParallelMultiInstanceLimits,
} from "./parallel-multi-instance-contract.js";
import { MessageChannelKind } from "./semantic-value-contract.js";
import type {
  DefinitionScope,
  EffectDescriptor,
  ErrorReference,
  MessageChannel,
  SimpleBooleanExpression,
  VariableMapping,
} from "./semantic-value-contract.js";

export enum SemanticProcessKind {
  SemanticProcess = "semanticProcess",
}

export enum SemanticProcessCompilerId {
  BpmnSourceSemanticProcess = "bpmn-source-semantic-process",
}

export enum InternalSchedulingMode {
  RejectObservableChoice = "rejectObservableChoice",
  RequireChoiceSchedule = "requireChoiceSchedule",
}

export enum SemanticOperationKind {
  Initiate = "initiate",
  InitiateMessage = "initiateMessage",
  InitiateTimer = "initiateTimer",
  EnterScope = "enterScope",
  EnterBoundedScope = "enterBoundedScope",
  InvokeProcess = "invokeProcess",
  ReturnProcess = "returnProcess",
  AwaitUserTask = "awaitUserTask",
  AwaitDataInputUserTask = "awaitDataInputUserTask",
  AwaitDataOutputUserTask = "awaitDataOutputUserTask",
  AwaitSequentialMultiInstanceUserTask = "awaitSequentialMultiInstanceUserTask",
  AwaitParallelMultiInstanceUserTask = "awaitParallelMultiInstanceUserTask",
  CompleteParallelMultiInstanceUserTask = "completeParallelMultiInstanceUserTask",
  AwaitBoundedUserTask = "awaitBoundedUserTask",
  AwaitMessageBoundedUserTask = "awaitMessageBoundedUserTask",
  AwaitMonitoredUserTask = "awaitMonitoredUserTask",
  AwaitMessage = "awaitMessage",
  AwaitPayloadMessage = "awaitPayloadMessage",
  AwaitTimer = "awaitTimer",
  AwaitEffect = "awaitEffect",
  Duplicate = "duplicate",
  Synchronize = "synchronize",
  MergeExclusive = "mergeExclusive",
  Choose = "choose",
  SelectMany = "selectMany",
  SynchronizeSelected = "synchronizeSelected",
  AwaitEventRace = "awaitEventRace",
  ThrowError = "throwError",
  TerminateScope = "terminateScope",
  ReachNoneEnd = "reachNoneEnd",
  CompleteScope = "completeScope",
}

export enum SemanticOriginKind {
  BpmnElement = "bpmnElement",
  BpmnSequenceFlow = "bpmnSequenceFlow",
}

export type SemanticProcessIdentity = DeepReadonly<{
  compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess;
  semanticProfile: string;
  sourceId: string;
  sourceSha256: string;
  sourceOverlay: SourceOverlayIdentity | null;
}>;

export type BpmnElementOrigin = DeepReadonly<{
  kind: SemanticOriginKind.BpmnElement;
  elementId: string;
}>;

export type BpmnSequenceFlowOrigin = DeepReadonly<{
  kind: SemanticOriginKind.BpmnSequenceFlow;
  elementId: string;
}>;

export type ControlPlace = DeepReadonly<{
  id: string;
  origin: BpmnSequenceFlowOrigin;
}>;

export type OperationScopeOwnership = DeepReadonly<{
  operationId: string;
  scopeId: string;
}>;

export type ControlPlaceScopeOwnership = DeepReadonly<{
  controlPlaceId: string;
  scopeId: string;
}>;

export type BpmnErrorRoute = DeepReadonly<{
  code: string;
  output: string;
  origin: {
    kind: SemanticOriginKind.BpmnElement;
    boundaryEventId: string;
    errorDefinitionId: string;
    errorElementId: string;
    sequenceFlowId: string;
  };
}>;

export type InterruptingErrorHandler = DeepReadonly<{
  attachedScopeId: string;
  code: string;
  output: string;
  origin: {
    kind: SemanticOriginKind.BpmnElement;
    boundaryEventId: string;
    errorDefinitionId: string;
    errorElementId: string;
    sequenceFlowId: string;
  };
}>;

export type ConditionalCandidate = DeepReadonly<{
  condition: SimpleBooleanExpression;
  output: string;
  origin: BpmnSequenceFlowOrigin;
}>;

export type InclusiveCandidate = DeepReadonly<{
  condition: SimpleBooleanExpression;
  output: string;
  expectedJoinInput: string;
  origin: BpmnSequenceFlowOrigin;
}>;

export type InclusiveDefaultBranch = DeepReadonly<{
  output: string;
  expectedJoinInput: string;
  origin: BpmnSequenceFlowOrigin;
}>;

type OperationBase = DeepReadonly<{
  id: string;
  origin: BpmnElementOrigin;
}>;

/** One operation-addressed Message start with generic BPMN outgoing-flow multiplicity. */
export type InitiateMessageOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.InitiateMessage;
    channel: Extract<
      MessageChannel,
      { kind: typeof MessageChannelKind.OperationMessage }
    >;
    outputs: [string, ...string[]];
  }>;

/** One resolved Timer Start occurrence with no pre-Process wait state. */
export type InitiateTimerOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.InitiateTimer;
    timer: { durationMs: 1000 };
    outputs: [string, ...string[]];
  }>;

export type SelectManyOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.SelectMany;
    input: string;
    candidates: [InclusiveCandidate, InclusiveCandidate];
    defaultBranch: InclusiveDefaultBranch;
    selectionKey: string;
  }>;

export type SynchronizeSelectedOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.SynchronizeSelected;
    inputs: [string, string, string];
    output: string;
    selectionKey: string;
  }>;

export type MergeExclusiveOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.MergeExclusive;
    inputs: [string, ...string[]];
    output: string;
  }>;

export type AwaitEventRaceOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.AwaitEventRace;
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

/**
 * Every deadline any admitted profile gives a boundary Timer arm.
 *
 * This is the union across families, never the type of one family's arm: each family names one exact
 * source lexeme, so each carries one exact number. Using the union at an arm would let a program
 * carry another family's deadline and still be well formed, which the reference interpreter would
 * then reject, so an arm always instantiates {@link BoundaryTimerArm} at its own value instead.
 */
export type AdmittedBoundaryTimerDurationMs = 1000 | 5000;

/**
 * The boundary Timer deadline every deadline-owning operation carries alongside its own wait.
 *
 * The shape says nothing about interruption: whether firing ends the host is carried by the
 * operation kind, and before lowering by the checked node's own disposition.
 *
 * `elementId` is the Boundary Event and is the element published as the timer occurrence, while
 * `origin` carries the boundary Sequence Flow's BPMN provenance because control places and BPMN
 * elements are separate namespaces. A boundary-attached Timer is never represented as a standalone
 * `awaitTimer`. One owner because the wire schema and Lean's contract each share one arm shape too,
 * so a second spelling here would be a silent contract fork rather than a local style difference.
 */
export type BoundaryTimerArm<
  DurationMs extends AdmittedBoundaryTimerDurationMs,
> = DeepReadonly<{
  elementId: string;
  durationMs: DurationMs;
  output: string;
  origin: BpmnSequenceFlowOrigin;
}>;

/**
 * One User Task occurrence that owns an interrupting boundary Timer deadline.
 *
 * The arms are named rather than listed so candidate order is unrepresentable, and they are
 * deliberately asymmetric: only the Timer arm interrupts.
 */
export type AwaitBoundedUserTaskOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.AwaitBoundedUserTask;
    input: string;
    task: {
      elementId: string;
      name: string | null;
      output: string;
    };
    boundaryTimer: BoundaryTimerArm<1000>;
  }>;

/** One User Task occurrence that owns an interrupting payload-free Message subscription. */
export type AwaitMessageBoundedUserTaskOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.AwaitMessageBoundedUserTask;
    input: string;
    task: {
      elementId: string;
      name: string | null;
      output: string;
    };
    boundaryMessage: {
      elementId: string;
      channel: Extract<
        MessageChannel,
        { kind: typeof MessageChannelKind.OperationMessage }
      >;
      output: string;
      origin: BpmnSequenceFlowOrigin;
    };
  }>;

/**
 * One User Task occurrence that owns a non-interrupting boundary Timer deadline.
 *
 * The arm shape is `awaitBoundedUserTask`'s, and the operation kind is the whole difference: firing
 * this deadline spawns a branch on `boundaryTimer.output` and preserves the task occurrence, where
 * the interrupting family's firing removes it. The two are separate kinds rather than one kind with
 * a flag because their state invariants disagree — a task held without its deadline is invalid
 * there and is the normal post-firing state here.
 */
export type AwaitMonitoredUserTaskOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.AwaitMonitoredUserTask;
    input: string;
    task: {
      elementId: string;
      name: string | null;
      output: string;
    };
    boundaryTimer: BoundaryTimerArm<1000>;
  }>;

/**
 * One User Task occurrence whose entry both waits and fills one occupied Activity data input.
 *
 * Separate from `awaitUserTask` because enabledness differs: this arm is enabled only while the
 * Process binding named by `directInput.sourcePropertyId` exists, and firing it writes an
 * Activity-owned local scope and an Activity occurrence record that the plain arm never produces.
 * Its `output` is the sole normal outgoing route, taken by the completion command rather than here.
 */
export type AwaitDataInputUserTaskOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.AwaitDataInputUserTask;
    input: string;
    output: string;
    task: {
      elementId: string;
      name: string | null;
    };
    directInput: DirectActivityDataInput;
  }>;

/**
 * One User Task occurrence whose accepted completion writes one declared Activity data output.
 *
 * Separate from `awaitDataInputUserTask` because the two constrain opposite ends of the occurrence:
 * that arm decides whether the task may become active, while this one leaves entry token-only and
 * decides what an accepted completion must carry. Firing this arm arms an empty Activity-owned local
 * scope and an Activity occurrence record; the completion fills the scope under
 * `directOutput.sourceDataOutputId`, executes the association into the Process binding named by
 * `directOutput.targetPropertyId`, and disposes the scope in the same transition.
 */
export type AwaitDataOutputUserTaskOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.AwaitDataOutputUserTask;
    input: string;
    output: string;
    task: {
      elementId: string;
      name: string | null;
    };
    directOutput: DirectActivityDataOutput;
  }>;

/**
 * A Message subscription whose delivery must carry exactly one payload value.
 *
 * Arming is identical to `awaitMessage`: a declared `DataOutput` constrains the trigger's effect and
 * never the subscription, so nothing here delays or narrows what the Event waits for. The two arms
 * separate at delivery, where this one refuses a payload-free command and routes an accepted
 * payload into the Process binding named by `directOutput.targetPropertyId`.
 *
 * The delivered value is never bound under `directOutput.sourceDataOutputId`. That id names the
 * Event's own output, which has no lifetime a later state could observe, so materializing it would
 * be dead state; the association alone decides the surviving name.
 */
export type AwaitPayloadMessageOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.AwaitPayloadMessage;
    input: string;
    output: string;
    message: {
      elementId: string;
      channel: Extract<
        MessageChannel,
        { kind: typeof MessageChannelKind.OperationMessage }
      >;
    };
    directOutput: DirectCatchEventPayloadOutput;
  }>;

export type AwaitSequentialMultiInstanceUserTaskOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.AwaitSequentialMultiInstanceUserTask;
    input: string;
    task: {
      elementId: string;
      name: string | null;
    };
    data: SequentialMultiInstanceDataDefinition;
    normalOutput: string;
    boundaryTimer: BoundaryTimerArm<5000>;
    limits: SequentialMultiInstanceLimits;
  }>;

export type AwaitParallelMultiInstanceUserTaskOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.AwaitParallelMultiInstanceUserTask;
    input: string;
    task: {
      elementId: string;
      name: string | null;
    };
    data: ParallelMultiInstanceDataDefinition;
    completionCondition: ParallelMultiInstanceCompletionCondition;
    normalOutput: string;
    boundaryTimer: BoundaryTimerArm<5000>;
    limits: ParallelMultiInstanceLimits;
  }>;

/** The command-addressed child-completion half paired to one parallel entry operation. */
export type CompleteParallelMultiInstanceUserTaskOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.CompleteParallelMultiInstanceUserTask;
    entryOperationId: string;
    taskElementId: string;
    normalOutput: string;
  }>;

/**
 * One embedded Sub-Process occurrence that owns an interrupting boundary Timer deadline.
 *
 * Entry and deadline are one operation because neither is a resumable state without the other: a
 * live child scope with no deadline would run unbounded, and a deadline with no child scope would
 * have no region to cancel. That is why this is not an `enterScope` beside an `awaitTimer`.
 *
 * The deadline's normal withdrawal has no field here. It is the child scope's own `completeScope`,
 * which this operation is paired to by `childScopeId`, because withdrawal is decided by child
 * quiescence rather than by anything the entry could name.
 */
export type EnterBoundedScopeOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.EnterBoundedScope;
    input: string;
    childEntry: string;
    childScopeId: string;
    boundaryTimer: BoundaryTimerArm<1000>;
  }>;

export type InvokeProcessOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.InvokeProcess;
    input: string;
    calledProcessId: string;
    calledRootScopeId: string;
    calledEntry: string;
    returnOperationId: string;
  }>;

export type ReturnProcessOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.ReturnProcess;
    calledProcessId: string;
    calledRootScopeId: string;
    callerOutput: string;
  }>;

/** Consumes one End Event input and clears the live contents of its exact containing occurrence. */
export type TerminateScopeOperation = OperationBase &
  DeepReadonly<{
    kind: SemanticOperationKind.TerminateScope;
    input: string;
    scopeId: string;
  }>;

export type SemanticOperation =
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.Initiate;
        output: string;
      }>)
  | InitiateMessageOperation
  | InitiateTimerOperation
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.EnterScope;
        input: string;
        childEntry: string;
        childScopeId: string;
      }>)
  | EnterBoundedScopeOperation
  | InvokeProcessOperation
  | ReturnProcessOperation
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.AwaitUserTask;
        input: string;
        output: string;
        task: {
          elementId: string;
          name: string | null;
          metadata?: UserTaskMetadata;
        };
      }>)
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.AwaitTimer;
        input: string;
        output: string;
        timer: {
          elementId: string;
          durationMs: 1000;
        };
      }>)
  | AwaitDataInputUserTaskOperation
  | AwaitDataOutputUserTaskOperation
  | AwaitBoundedUserTaskOperation
  | AwaitMessageBoundedUserTaskOperation
  | AwaitMonitoredUserTaskOperation
  | AwaitSequentialMultiInstanceUserTaskOperation
  | AwaitParallelMultiInstanceUserTaskOperation
  | CompleteParallelMultiInstanceUserTaskOperation
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.AwaitMessage;
        input: string;
        output: string;
        message: {
          elementId: string;
          channel: MessageChannel;
        };
      }>)
  | AwaitPayloadMessageOperation
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.AwaitEffect;
        input: string;
        output: string;
        effect: {
          elementId: string;
          descriptor: EffectDescriptor;
          inputMappings: VariableMapping[];
          outputMappings: VariableMapping[];
        };
        bpmnErrorRoute: BpmnErrorRoute | null;
      }>)
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.Duplicate;
        input: string;
        outputs: string[];
      }>)
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.Synchronize;
        inputs: string[];
        output: string;
      }>)
  | MergeExclusiveOperation
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.Choose;
        input: string;
        candidates: [ConditionalCandidate, ConditionalCandidate];
        defaultOutput: string;
        defaultOrigin: BpmnSequenceFlowOrigin;
      }>)
  | SelectManyOperation
  | SynchronizeSelectedOperation
  | AwaitEventRaceOperation
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.ThrowError;
        input: string;
        error: ErrorReference;
        handler: InterruptingErrorHandler;
      }>)
  | TerminateScopeOperation
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.ReachNoneEnd;
        input: string;
      }>)
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.CompleteScope;
        scopeId: string;
        parentOutput: string | null;
      }>);

export type SemanticProcessProgram = DeepReadonly<{
  kind: SemanticProcessKind.SemanticProcess;
  identity: SemanticProcessIdentity;
  internalSchedulingMode: InternalSchedulingMode;
  processId: string;
  definitionScopes: DefinitionScope[];
  operationScopes: OperationScopeOwnership[];
  controlPlaceScopes: ControlPlaceScopeOwnership[];
  controlPlaces: ControlPlace[];
  operations: SemanticOperation[];
}>;
