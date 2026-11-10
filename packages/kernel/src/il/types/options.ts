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

/** What an Error that finds no catcher does. */
export enum UnhandledError {
  /** BPMN 2.0.2 Table 10.88 leaves it unspecified, "a common one being termination of the Process instance". */
  FailsInstance = "failsInstance",
  /** CIB-INT-0013, CIB-CFG-0010. */
  EndsThrowingPath = "endsThrowingPath",
}

/** Whether an Error catcher may name variables for the caught code and message. */
export enum ErrorCatchVariables {
  /** BPMN 2.0.2 defines no such variables. */
  Refused = "refused",
  /** CIB-EXT-0028: written from the catcher's event scope, outward. */
  EventScope = "eventScope",
}

/** When a completing occurrence's outgoing conditions are evaluated relative to its own output writes. */
export enum ConditionOrder {
  /** BPMN 2.0.2 §13.3: an Activity's outputs are written before it leaves. */
  AfterOutputs = "afterOutputs",
  /** CIB-INT-0011, `BpmnActivityBehavior#performOutgoingBehavior:81-92`. */
  BeforeOutputs = "beforeOutputs",
}

export enum CallBindingTime { ProgramAssembly = "programAssembly", Invocation = "invocation" }

/** The expression language the kernel evaluates. */
export enum Evaluator {
  /** The standards profile's Simple Boolean ([decision](../../../../../docs/SIMPLE-BOOLEAN-EXPRESSION-DECISION.md)). */
  SimpleBoolean = "simpleBoolean",
  /**
   * CIB-CFG-0011: the Core JUEL level of the pinned CIB Seven 2.2.0 environment
   * ([expression semantics](../../../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md)).
   */
  Juel = "juel",
}

/** Which variables a Multi-Instance loop reads its collection from and gives each instance its item in. */
export enum MultiInstanceBinding {
  /** BPMN 2.0.2 §10.2.8, §10.4.1: the Data Associations into the loop's Data Inputs. */
  DataAssociations = "dataAssociations",
  /** CIB-INT-0014: the variable `loopDataInputRef` names and the `inputDataItem`'s `name`. */
  LoopReferences = "loopReferences",
}

/** What becomes of an effect result value that no output mapping consumes. */
export enum ResultValues {
  /** BPMN 2.0.2 §10.4.1: the result is the Activity's OutputSet, so such a value is rejected (`undeclared-output`). */
  OutputSet = "outputSet",
  /** CIB-EXT-0015: the delegate writes it as an Activity local, which ends with the Activity. */
  ActivityLocals = "activityLocals",
}

/** Which names a Multi-Instance completion condition reads besides the instance's own locals. */
export enum MultiInstanceCounters {
  /** BPMN 2.0.2 Table 10.30 names no expression variable: no counter name resolves. */
  None = "none",
  /** CIB-INT-0018: the four counters with CIB's values, each a Java `Integer`. */
  CibLocals = "cibLocals",
}

/**
 * The names CIB-INT-0018 binds, in `CibLocals`' order: the instance's index, the count, the active and the completed
 * instances (`MultiInstanceActivityBehavior.java:49-54`).
 */
export const multiInstanceCounterNames: readonly [string, string, string, string] = ["loopCounter", "nrOfInstances", "nrOfActiveInstances", "nrOfCompletedInstances"];

/** What a Multi-Instance count or collection that is unavailable or of the wrong kind does. */
export enum MultiInstanceInputFailure {
  /** BPMN 2.0.2 §10.4.2: an unavailable input holds the occurrence; a wrong kind is a semantic failure. */
  Hold = "hold",
  /** CIB-INT-0019: the operation fails, following the stimulus table. */
  Rollback = "rollback",
}

/** Which values a Multi-Instance cardinality counts by. */
export enum MultiInstanceCount {
  /** BPMN 2.0.2 Table 10.29: the expression "MUST evaluate to an integer". */
  Integer = "integer",
  /** CIB-EXT-0033: CIB's `resolveLoopCardinality`, which also counts parsed text and an integral Decimal, at `int` width. */
  JavaInt = "javaInt",
}

/** What an Activity's output mappings read besides the values its completion or effect result submits. */
export enum OutputContext {
  /** BPMN 2.0.2 §10.4.2: nothing; the outputs map the submitted values alone. */
  Submission = "submission",
  /** CIB-EXT-0031: the variables visible from the Activity's own scope, its captured inputs first. */
  ActivityScope = "activityScope",
}

/** What a Business Rule Task executes. */
export enum BusinessRuleTask {
  /** BPMN 2.0.2 §10.3.3 leaves the rule engine open, so a Business Rule Task has no meaning the kernel executes. */
  Refused = "refused",
  /** CIB-EXT-0032: `camunda:decisionRef` names a DMN 1.3 decision table the program carries. */
  DecisionTable = "decisionTable",
}

/**
 * Where a position held by an element continues when a converging Inclusive Gateway asks whether it can still reach one
 * of its empty inputs.
 */
export enum InclusiveJoinReach {
  /** BPMN 2.0.2 Table 13.3 leaves it open; the standards reading also follows the host's Boundary Events (§10.5.4). */
  WithBoundaries = "withBoundaries",
  /** CIB-INT-0020: `InclusiveGatewayActivityBehavior#isReachable` follows only outgoing transitions. */
  OutgoingOnly = "outgoingOnly",
}

/** How one closure orders the branches of a split. */
export enum BranchSchedule {
  /**
   * BPMN 2.0.2 Table 13.1, §13.3.1: branches are concurrent and any interleaving is permitted, so admission refuses a
   * split one of whose branches writes a name another reads or writes in the closure (`flow.concurrentWrite`), and the
   * closure's order is immaterial.
   */
  OrderInvariant = "orderInvariant",
  /**
   * CIB-OP-0016: in Sequence Flow declaration order, each branch to its next wait, join or end before the next starts
   * (`PvmAtomicOperationTransitionDestroyScope:128-134`, `CommandInvocationContext:95,139`), an idle scope occurrence
   * completing before the next token moves (`PvmAtomicOperationActivityEnd:105`).
   */
  DeclarationDepthFirst = "declarationDepthFirst",
}

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
  readonly errorCatchVariables: ErrorCatchVariables;
  readonly callBindingTime: CallBindingTime;
  readonly timerZone: string | null;
  readonly multiInstanceBinding: MultiInstanceBinding;
  readonly effectResultValues: ResultValues;
  readonly outputContext: OutputContext;
  readonly multiInstanceCounters: MultiInstanceCounters;
  readonly multiInstanceInputFailure: MultiInstanceInputFailure;
  readonly multiInstanceCount: MultiInstanceCount;
  readonly businessRuleTask: BusinessRuleTask;
  readonly inclusiveJoinReach: InclusiveJoinReach;
  readonly branchSchedule: BranchSchedule;
}
