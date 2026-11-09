/**
 * Profile options, transcribed from `Kernel/IL/Types/Options.lean`: one enumerated field per decision point the
 * kernel's behaviour branches on, plus the relation identifiers as provenance; every default is the standards reading.
 * The kernel never reads a profile identifier. Part of `il/types.ts`, which re-exports it.
 */
export enum SubmissionRule {
  /** BPMN 2.0.2 §10.4.1. */
  OutputSet = "outputSet",
  /** CIB-EXT-0005, CIB-EXT-0010. */
  InstallsVariables = "installsVariables",
}

export enum UndeclaredWrite {
  /** BPMN 2.0.2 §10.4.1: a target is a declared item. */
  Refused = "refused",
  /**
   * CIB-EXT-0005, CIB-EXT-0007, CIB-EXT-0009, CIB-EXT-0020: each selects a CIB write that creates an undeclared name as
   * a process variable (`AbstractVariableScope.setVariable`).
   */
  AtInstanceRoot = "atInstanceRoot",
}

export enum ErrorPathOutputs {
  /** BPMN 2.0.2 §13.3.2. */
  None = "none",
  /** CIB-EXT-0004, CIB-EXT-0009, CIB-EXT-0016. */
  Mapped = "mapped",
}

export enum TechnicalFailure {
  /** No BPMN meaning (§13.3.3 defines only a fault). */
  HostFailure = "hostFailure",
  /** CIB-EXT-0013, CIB-OP-0008, CIB-CFG-0008. */
  Incident = "incident",
}

export enum ContinuationFailure {
  /** CIB-OP-0004. */
  RolledBack = "rolledBack",
  /** Proposed CIB-EXT-0026. */
  Incident = "incident",
}

export enum MessageCorrelation {
  /** BPMN 2.0.2 §8.4.2, CIB-LIM-0002. */
  ModeledKey = "modeledKey",
  /** PC-MESSAGE-08. */
  ApiCriteria = "apiCriteria",
}

export enum DeliveryVariables { MappedOnly = "mappedOnly", Installs = "installs" }

export enum MultiInstanceFinalBody {
  /** BPMN 2.0.2 §13.3.7. */
  ConditionEveryCompletion = "conditionEveryCompletion",
  ModeSpecific = "modeSpecific",
}

export enum MultiInstanceOutputs {
  /** BPMN 2.0.2 §13.3.7. */
  Aggregates = "aggregates",
  /** CIB-LIM-0001. */
  None = "none",
}

export enum CompensationOrder {
  /** BPMN 2.0.2 §13.5.5. */
  Dependency = "dependency",
  ReverseCreation = "reverseCreation",
}

export enum CompensationHandlerFailureTag {
  /** COMPH-FAIL-01. */
  FailsInstance = "failsInstance",
  Selected = "selected",
}

export type CompensationHandlerFailure =
  | { readonly tag: CompensationHandlerFailureTag.FailsInstance }
  | { readonly tag: CompensationHandlerFailureTag.Selected; readonly code: string };

export enum AbnormalScopeEnd {
  /** BPMN 2.0.2 §13.3.4, §13.5.6. */
  WithoutOutflow = "withoutOutflow",
  CompletesNormally = "completesNormally",
}

export enum UnhandledError {
  Refused = "refused",
  /** CIB-CFG-0004. */
  EndsThrowingPath = "endsThrowingPath",
}

/** When a completing occurrence's outgoing conditions are evaluated relative to its own output writes. */
export enum ConditionOrder {
  /** BPMN 2.0.2 §13.3: an Activity's outputs are written before it leaves. */
  AfterOutputs = "afterOutputs",
  /** CIB-INT-0011, `BpmnActivityBehavior#performOutgoingBehavior:81-92`. */
  BeforeOutputs = "beforeOutputs",
}

export enum CallBindingTime { ProgramAssembly = "programAssembly", Invocation = "invocation" }

export enum Evaluator { SimpleBoolean = "simpleBoolean", Juel = "juel" }

export interface ProfileOptions {
  readonly relations: readonly string[];
  readonly evaluator: Evaluator;
  readonly submission: SubmissionRule;
  /**
   * When set, a User Task submission may name only variables a scope occurrence on the task's chain declares, each
   * once, and its canonical JSON may take at most this many UTF-8 bytes (CIB-EXT-0020, `NSD-TASK-01`).
   */
  readonly scopeChainSubmissionBytes: number | null;
  readonly undeclaredWrite: UndeclaredWrite;
  readonly errorPathOutputs: ErrorPathOutputs;
  readonly technicalFailure: TechnicalFailure;
  /** An effect incident offers `cancelIncidentProcess` (CIB-OP-0009). */
  readonly incidentProcessCancellation: boolean;
  readonly continuationFailure: ContinuationFailure;
  readonly conditionOrder: ConditionOrder;
  readonly messageCorrelation: MessageCorrelation;
  readonly deliveryVariables: DeliveryVariables;
  readonly multiInstanceFinalBody: MultiInstanceFinalBody;
  readonly multiInstanceOutputs: MultiInstanceOutputs;
  readonly compensationOrder: CompensationOrder;
  readonly compensationHandlerFailure: CompensationHandlerFailure;
  readonly abnormalScopeEnd: AbnormalScopeEnd;
  readonly unhandledError: UnhandledError;
  readonly callBindingTime: CallBindingTime;
  readonly timerZone: string | null;
}
