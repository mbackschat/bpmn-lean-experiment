import {
  SemanticOperationKind,
  type SemanticOperation,
} from "./semantic-process-contract.js";
import type { RuntimeState } from "./semantic-process-state.js";

/** Semantic criterion selected for one complete operation variant. This census enables no transition. */
export enum InternalOperationFamily {
  ProcessInitiation = "processInitiation",
  OrdinaryWaitArming = "ordinaryWaitArming",
  CompositeWaitAndActivityArming = "compositeWaitAndActivityArming",
  ScopeCreationAndCallInvocation = "scopeCreationAndCallInvocation",
  LocalControlTransformation = "localControlTransformation",
  MergeAndOrdinaryEnd = "mergeAndOrdinaryEnd",
  ScopeReturnCompletionAndInterruption = "scopeReturnCompletionAndInterruption",
  ExternallyAddressedCompletion = "externallyAddressedCompletion",
}

/** Exhaustive classification only. Preparation remains unavailable until the selected family owner exists. */
export function semanticOperationInternalFamily(
  operation: SemanticOperation,
): InternalOperationFamily {
  switch (operation.kind) {
    case SemanticOperationKind.Initiate:
    case SemanticOperationKind.InitiateMessage:
    case SemanticOperationKind.InitiateTimer:
      return InternalOperationFamily.ProcessInitiation;
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.AwaitPayloadMessage:
    case SemanticOperationKind.AwaitTimer:
    case SemanticOperationKind.AwaitEffect:
      return InternalOperationFamily.OrdinaryWaitArming;
    case SemanticOperationKind.EnterBoundedScope:
    case SemanticOperationKind.AwaitDataInputUserTask:
    case SemanticOperationKind.AwaitDataOutputUserTask:
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask:
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
    case SemanticOperationKind.AwaitEventRace:
      return InternalOperationFamily.CompositeWaitAndActivityArming;
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.InvokeProcess:
      return InternalOperationFamily.ScopeCreationAndCallInvocation;
    case SemanticOperationKind.Duplicate:
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.Choose:
    case SemanticOperationKind.SelectMany:
    case SemanticOperationKind.SynchronizeSelected:
      return InternalOperationFamily.LocalControlTransformation;
    case SemanticOperationKind.MergeExclusive:
    case SemanticOperationKind.ReachNoneEnd:
      return InternalOperationFamily.MergeAndOrdinaryEnd;
    case SemanticOperationKind.ReturnProcess:
    case SemanticOperationKind.CompleteScope:
    case SemanticOperationKind.ThrowError:
    case SemanticOperationKind.TerminateScope:
      return InternalOperationFamily.ScopeReturnCompletionAndInterruption;
    case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
      return InternalOperationFamily.ExternallyAddressedCompletion;
    default:
      return assertNever(operation);
  }
}

/** State atom domain selected for one complete RuntimeState field. This census defines no footprint. */
export enum InternalRuntimeStateAtomDomain {
  RuntimeControl = "runtimeControl",
  InitiationPending = "initiationPending",
  ScopeOccurrence = "scopeOccurrence",
  ControlToken = "controlToken",
  UserTaskWait = "userTaskWait",
  MessageWait = "messageWait",
  TimerWait = "timerWait",
  EffectWait = "effectWait",
  EffectIncident = "effectIncident",
  SelectedBranch = "selectedBranch",
  EventRace = "eventRace",
  CallOccurrence = "callOccurrence",
  ActivityOccurrence = "activityOccurrence",
  SequentialController = "sequentialController",
  ParallelController = "parallelController",
  Variable = "variable",
  UserTaskActivation = "userTaskActivation",
  MessageActivation = "messageActivation",
  TimerActivation = "timerActivation",
  EventRaceActivation = "eventRaceActivation",
  CallActivation = "callActivation",
  EffectActivation = "effectActivation",
  ScopeActivation = "scopeActivation",
  ActivityActivation = "activityActivation",
  EndOccurrence = "endOccurrence",
  LogicalTime = "logicalTime",
}

export type InternalRuntimeStateFieldClassification = Readonly<{
  leanField: string;
  atomDomain: InternalRuntimeStateAtomDomain;
}>;

/** The exact representation-name bridge. Optional TypeScript collections use their property key. */
export const internalRuntimeStateFieldCensus = {
  control: { leanField: "control", atomDomain: InternalRuntimeStateAtomDomain.RuntimeControl },
  initiationPending: { leanField: "initiationPending", atomDomain: InternalRuntimeStateAtomDomain.InitiationPending },
  scopeOccurrences: { leanField: "scopeOccurrences", atomDomain: InternalRuntimeStateAtomDomain.ScopeOccurrence },
  controlTokens: { leanField: "tokens", atomDomain: InternalRuntimeStateAtomDomain.ControlToken },
  userTaskWaits: { leanField: "waits", atomDomain: InternalRuntimeStateAtomDomain.UserTaskWait },
  messageWaits: { leanField: "messageWaits", atomDomain: InternalRuntimeStateAtomDomain.MessageWait },
  timerWaits: { leanField: "timerWaits", atomDomain: InternalRuntimeStateAtomDomain.TimerWait },
  effectWaits: { leanField: "effectWaits", atomDomain: InternalRuntimeStateAtomDomain.EffectWait },
  effectIncidents: { leanField: "effectIncidents", atomDomain: InternalRuntimeStateAtomDomain.EffectIncident },
  selectedBranchSets: { leanField: "selectedBranchSets", atomDomain: InternalRuntimeStateAtomDomain.SelectedBranch },
  eventRaces: { leanField: "eventRaces", atomDomain: InternalRuntimeStateAtomDomain.EventRace },
  calledProcessOccurrences: { leanField: "calledProcessOccurrences", atomDomain: InternalRuntimeStateAtomDomain.CallOccurrence },
  activityOccurrences: { leanField: "activityOccurrences", atomDomain: InternalRuntimeStateAtomDomain.ActivityOccurrence },
  sequentialMultiInstanceControllers: { leanField: "sequentialMultiInstanceControllers", atomDomain: InternalRuntimeStateAtomDomain.SequentialController },
  parallelMultiInstanceControllers: { leanField: "parallelMultiInstanceControllers", atomDomain: InternalRuntimeStateAtomDomain.ParallelController },
  variables: { leanField: "variables", atomDomain: InternalRuntimeStateAtomDomain.Variable },
  taskActivations: { leanField: "activations", atomDomain: InternalRuntimeStateAtomDomain.UserTaskActivation },
  messageActivations: { leanField: "messageActivations", atomDomain: InternalRuntimeStateAtomDomain.MessageActivation },
  timerActivations: { leanField: "timerActivations", atomDomain: InternalRuntimeStateAtomDomain.TimerActivation },
  eventRaceActivations: { leanField: "eventRaceActivations", atomDomain: InternalRuntimeStateAtomDomain.EventRaceActivation },
  callActivations: { leanField: "callActivations", atomDomain: InternalRuntimeStateAtomDomain.CallActivation },
  effectActivations: { leanField: "effectActivations", atomDomain: InternalRuntimeStateAtomDomain.EffectActivation },
  scopeActivations: { leanField: "scopeActivations", atomDomain: InternalRuntimeStateAtomDomain.ScopeActivation },
  activityActivations: { leanField: "activityActivations", atomDomain: InternalRuntimeStateAtomDomain.ActivityActivation },
  endOccurrences: { leanField: "endOccurrences", atomDomain: InternalRuntimeStateAtomDomain.EndOccurrence },
  logicalTimeMs: { leanField: "logicalTimeMs", atomDomain: InternalRuntimeStateAtomDomain.LogicalTime },
} as const satisfies Readonly<Record<keyof RuntimeState, InternalRuntimeStateFieldClassification>>;

function assertNever(value: never): never {
  throw new Error(`Unclassified SemanticOperation: ${JSON.stringify(value)}`);
}
