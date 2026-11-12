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

/**
 * Whether a Call writes its output mappings when an Error or Escalation raised in its called instance reaches the
 * called root.
 */
export enum RaisedCallOutputs {
  /** BPMN 2.0.2 §10.3.6, §13.3.2: an abnormally ended Call maps no outputs. */
  None = "none",
  /** CIB-EXT-0034: once per crossing of a called root, innermost first, before that root's catcher runs. */
  AtCalledRoot = "atCalledRoot",
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
  /** BPMN 2.0.2 §13.5.5: a handler whose subject a Sequence Flow leads to completes before its predecessor's starts. */
  Dependency = "dependency",
  /** CIB signals every handler of a trigger at once (`CompensationUtil.java:55-88`). */
  AllAtOnce = "allAtOnce",
}

export enum CompensationHandlerFailureTag {
  /** COMPH-FAIL-01. */
  FailsInstance = "failsInstance",
  Selected = "selected",
  /**
   * An Error leaving a handler propagates from the scope occurrence the trigger ran in, as CIB's compensating execution
   * is a child of the throwing one (`CompensationUtil.java:62-75`).
   */
  PropagatesFromTrigger = "propagatesFromTrigger",
}

export type CompensationHandlerFailure =
  | { readonly tag: CompensationHandlerFailureTag.FailsInstance }
  | { readonly tag: CompensationHandlerFailureTag.Selected; readonly code: string }
  | { readonly tag: CompensationHandlerFailureTag.PropagatesFromTrigger };

/** Whether a completed Sub-Process without a compensation handler keeps its inner records as one group. */
export enum ImplicitCompensation {
  /**
   * BPMN 2.0.2 Tables 10.88 and 10.89: only an Activity with a compensation handler is compensated, so a throw naming
   * such a Sub-Process is refused (`compensation.implicit`).
   */
  Refused = "refused",
  /**
   * CIB retains the inner records of every completed Sub-Process and compensates them as one group
   * (`CompensationUtil.java:100-152`, `CompensationEventHandler.java:61-64`).
   */
  EverySubProcess = "everySubProcess",
}

/** What an Error leaving a Sub-Process does to the compensable work completed inside it. */
export enum ErrorExitCompensation {
  /**
   * BPMN 2.0.2 §10.3.5 and presumed abort: the records end with the Sub-Process, as in CIB
   * (`SubProcessActivityBehavior.java:61-66` retains only on completion).
   */
  Drops = "drops",
  /** BPMN 2.0.2 §10.7.3, §13.5.5: compensation of all contained Activities runs by default. */
  CompensatesContained = "compensatesContained",
}

/** Which records a completed Multi-Instance Activity with a compensation handler leaves. */
export enum MultiInstanceCompensation {
  /** BPMN 2.0.2 §13.5.5: one per instance of a Multi-Instance Sub-Process, one for a Multi-Instance Task or Call. */
  PerSubProcessInstance = "perSubProcessInstance",
  /** CIB: one per completed instance of any Multi-Instance Activity (`AbstractBpmnActivityBehavior.java:69-74`). */
  PerInstance = "perInstance",
}

/** Which BPMN `transactionMethod` values a Transaction runs. */
export enum TransactionMethods {
  /** `##Compensate` alone. */
  CompensateOnly = "compensateOnly",
  /**
   * `##Store` and `##Image` run as `##Compensate`, as CIB reads no such attribute (`BpmnParse.java:3902-3915`); a
   * protocol URI stays refused.
   */
  CompatibilityAsCompensate = "compatibilityAsCompensate",
}

/** Where a targeted Compensation throw resolves its `activityRef`. */
export enum CompensationReferenceScope {
  /**
   * BPMN 2.0.2 Tables 10.88 and 10.89: an Activity visible from the throw, at its own level or, from a Compensation
   * Event Sub-Process, at its parent's.
   */
  Visible = "visible",
  /** CIB: a throw in any Event Sub-Process also names an Activity of its parent's level (`BpmnParse.java:1695-1720`). */
  EventSubProcessParent = "eventSubProcessParent",
}

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

/**
 * When a sequential Multi-Instance Activity reads its input collection (PC-MI-08); a parallel one reads it once, as it
 * creates every instance.
 */
export enum CollectionRead {
  /** Once, as the Activity is entered: BPMN 2.0.2 §13.3.7 evaluates the number of instances once and is silent on re-reading the items. */
  EntrySnapshot = "entrySnapshot",
  /** CIB re-reads the collection as an instance completes, before the next one begins (`SequentialMultiInstanceActivityBehavior.java:57`). */
  SequentialReread = "sequentialReread",
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

/** What a Script Task executes ([script semantics](../../../../../docs/kernel/semantics/SCRIPT-SEMANTICS-SPEC.md)). */
export enum ScriptTask {
  /** BPMN 2.0.2 §10.3.3 names no script language, so a Script Task has no meaning the kernel executes. */
  Refused = "refused",
  /** A JavaScript Script Task is an effect the host evaluates over a committed snapshot of the visible variables. */
  Javascript = "javascript",
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

/** How often a non-interrupting Conditional boundary or Event Sub-Process start fires while its condition holds. */
export enum ConditionalRetrigger {
  /**
   * BPMN 2.0.2 Tables 10.89, 10.90: it is triggered when its condition becomes true, so it fires again only after an
   * evaluation found the condition false. `camunda:variableName` and `camunda:variableEvents` are refused.
   */
  Edge = "edge",
  /**
   * CIB-EXT-0035: each offered write whose evaluation is true fires it, same-value updates included, filtered by
   * `camunda:variableName` and `camunda:variableEvents` (`ConditionalEventDefinition.java:91-113`).
   */
  EachWrite = "eachWrite",
}

/** What a literal Timer value the pinned parser cannot read does. */
export enum MalformedTimer {
  /** BPMN 2.0.2 Table 10.101: the value MUST conform to ISO 8601, so such a model is refused at admission. */
  Refused = "refused",
  /** CIB-EXT-0036: the model deploys and the arming fails, rolling back the input that reached it. */
  RollsBackArming = "rollsBackArming",
}

/** What a Message's `name` is. */
export enum MessageNames {
  /**
   * BPMN 2.0.2 Table 8.48: a text description; a Message is addressed by its identifier, so a nameless Message is
   * admitted and a name is never an expression.
   */
  Description = "description",
  /**
   * CIB-LIM-0022: CIB addresses a Message subscription by its name, which must be non-blank and unique among the
   * subscriptions of one event scope, and may be an expression resolved when the subscription opens.
   */
  Addresses = "addresses",
}

/** What entering an embedded Sub-Process or Transaction without a start Event does. */
export enum ScopeStart {
  /** BPMN 2.0.2 §13.3.4: the Scope begins its Activities and Scopes that have no incoming flow. */
  Implicit = "implicit",
  /**
   * CIB-LIM-0024: such a Scope is refused at admission, as CIB refuses deploying a Sub-Process without a start Event
   * and fails entering such a Transaction.
   */
  Required = "required",
}

/** What addresses a Signal. */
export enum SignalNames {
  /**
   * BPMN 2.0.2 Table 10.100: an event references its Signal by `signalRef`, a QName; the Signal's `name` is descriptive
   * (`tSignal.name` is `xsd:string`, `Semantic.xsd:1394`).
   */
  Identifier = "identifier",
  /**
   * CIB keys a Signal subscription and a throw by the Signal's `name`, an expression where it holds one
   * (`BpmnParse.java:474-498`, `EventSubscriptionDeclaration#resolveExpressionOfEventName`).
   */
  Addresses = "addresses",
}

/** What a Signal carries besides its address. */
export enum SignalPayload {
  /** BPMN 2.0.2 §10.5.1: a Signal is a broadcast trigger and carries no data to its catchers. */
  None = "none",
  /**
   * CIB installs a Signal's variables into the receiving scope and the instance a Signal start creates
   * (`EventHandlerImpl.java:56-58`, `SignalEventHandler.java:56-57`, `SignalEventReceivedCmd.java:179`).
   */
  Variables = "variables",
}

/** Whom an external Signal reaches. */
export enum SignalDelivery {
  /** BPMN 2.0.2 Table 10.88: a Signal is broadcast to every process that can receive it. */
  BroadcastOnly = "broadcastOnly",
  /** CIB also delivers an external Signal to the one execution a request names (`SignalEventReceivedCmd.java:119-131`). */
  OccurrenceTargeted = "occurrenceTargeted",
}

/** What a Conditional root start Event evaluates. */
export enum ConditionalStart {
  /** BPMN 2.0.2 Table 10.84: the condition's environment lies outside the process, so no start input carries it. */
  Refused = "refused",
  /**
   * CIB evaluates a root start condition per request over the submitted variables alone
   * (`EvaluateStartConditionCmd.java:49-83`, `DefaultConditionHandler.java:44-134`).
   */
  SubmittedContext = "submittedContext",
}

/** How a Call Activity's `calledElement` names the process it calls. */
export enum CalledElementResolution {
  /**
   * BPMN 2.0.2 §15.3.2 and `Semantic.xsd:149`: a QName resolved against the element's namespace bindings, whose local
   * part is the called process's id.
   */
  QualifiedName = "qualifiedName",
  /**
   * CIB reads `calledElement` as a definition key text and selects by its `calledElementBinding`
   * (`BpmnParse.java:3934, 3945-3990`, `CallableElementUtil.java:75-103`).
   */
  CibKey = "cibKey",
}

/** Which Message throw forms run. */
export enum MessageThrowForms {
  /** BPMN 2.0.2 Tables 10.88 and 10.89: a Message throw sends a Message and names no transport, so it is refused. */
  Refused = "refused",
  /**
   * CIB runs a Message throw with a declared implementation as a Service Task and passes on one without
   * (`BpmnParse.java:1643-1659`, `3174-3189`; CIB-EXT-0039, CIB-INT-0027).
   */
  CibForms = "cibForms",
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
  readonly raisedCallOutputs: RaisedCallOutputs;
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
  readonly implicitCompensation: ImplicitCompensation;
  readonly errorExitCompensation: ErrorExitCompensation;
  readonly multiInstanceCompensation: MultiInstanceCompensation;
  readonly transactionMethods: TransactionMethods;
  readonly compensationReferenceScope: CompensationReferenceScope;
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
  readonly multiInstanceCollection: CollectionRead;
  readonly businessRuleTask: BusinessRuleTask;
  readonly scriptTask: ScriptTask;
  readonly inclusiveJoinReach: InclusiveJoinReach;
  readonly branchSchedule: BranchSchedule;
  readonly conditionalRetrigger: ConditionalRetrigger;
  readonly malformedTimer: MalformedTimer;
  readonly messageNames: MessageNames;
  readonly scopeStart: ScopeStart;
  readonly signalNames: SignalNames;
  readonly signalPayload: SignalPayload;
  readonly signalDelivery: SignalDelivery;
  readonly conditionalStart: ConditionalStart;
  readonly calledElementResolution: CalledElementResolution;
  readonly messageThrowForms: MessageThrowForms;
}
