/**
 * Kernel IL, transcribed from `Kernel/IL/Types.lean`, which is the authority.
 *
 * A Lean inductive whose constructors carry arguments is a discriminated union whose `tag` is an enum member
 * spelled exactly as the Lean constructor, so the codec's constructor tables and the derived JSON tags coincide.
 * An all-nullary Lean inductive is a plain string enum. `Option` is `T | null`, `Nat` and `Int` are safe integers,
 * and `ElementId`/`FlowId` are plain strings as on the wire.
 */

export type ElementId = string;
export type FlowId = string;

/** Exhaustiveness witness for every `switch` over a kernel enum; no kernel switch has a `default:` arm. */
export function assertNever(value: never): never {
  throw new TypeError(`unhandled kernel variant ${JSON.stringify(value)}`);
}

/** Data values; the wire form is the scenario contract's `variableValue`, owned by `il/codec.ts`. */
export enum ValueTag {
  Null = "null",
  Bool = "bool",
  Int = "int",
  Decimal = "decimal",
  String = "string",
  StringList = "stringList",
  List = "list",
  Map = "map",
}

export type Value =
  | { readonly tag: ValueTag.Null }
  | { readonly tag: ValueTag.Bool; readonly value: boolean }
  | { readonly tag: ValueTag.Int; readonly value: number }
  | { readonly tag: ValueTag.Decimal; readonly coefficient: bigint; readonly scale: number }
  | { readonly tag: ValueTag.String; readonly value: string }
  | { readonly tag: ValueTag.StringList; readonly items: readonly string[] }
  | { readonly tag: ValueTag.List; readonly items: readonly Value[] }
  | { readonly tag: ValueTag.Map; readonly entries: readonly (readonly [string, Value])[] };

export enum SimpleBooleanTag {
  Literal = "literal",
  IsPresent = "isPresent",
  IsNull = "isNull",
  StringEquals = "stringEquals",
}

export type SimpleBoolean =
  | { readonly tag: SimpleBooleanTag.Literal; readonly value: boolean }
  | { readonly tag: SimpleBooleanTag.IsPresent; readonly name: string }
  | { readonly tag: SimpleBooleanTag.IsNull; readonly name: string }
  | { readonly tag: SimpleBooleanTag.StringEquals; readonly name: string; readonly value: string };

export enum ExpressionTag {
  Literal = "literal",
  SimpleBoolean = "simpleBoolean",
  Variable = "variable",
  Foreign = "foreign",
}

export type Expression =
  | { readonly tag: ExpressionTag.Literal; readonly value: Value }
  | { readonly tag: ExpressionTag.SimpleBoolean; readonly body: SimpleBoolean }
  | { readonly tag: ExpressionTag.Variable; readonly name: string }
  | { readonly tag: ExpressionTag.Foreign; readonly language: string; readonly source: string };

export enum ValueSourceTag {
  Literal = "literal",
  Expression = "expression",
}

export type ValueSource =
  | { readonly tag: ValueSourceTag.Literal; readonly value: string }
  | { readonly tag: ValueSourceTag.Expression; readonly body: Expression };

export interface Mapping {
  readonly target: string;
  readonly source: Expression;
}

// Subscriptions

export enum CycleDialect {
  Iso8601 = "iso8601",
  Cron = "cron",
}

export enum TimerScheduleTag {
  Duration = "duration",
  Date = "date",
  Cycle = "cycle",
}

export type TimerSchedule =
  | { readonly tag: TimerScheduleTag.Duration; readonly value: ValueSource }
  | { readonly tag: TimerScheduleTag.Date; readonly value: ValueSource }
  | { readonly tag: TimerScheduleTag.Cycle; readonly value: ValueSource; readonly dialect: CycleDialect };

export interface TimerTrigger {
  readonly schedule: TimerSchedule;
}

export interface CorrelationCriterion {
  readonly key: string;
  readonly value: Expression;
}

export interface MessageTrigger {
  readonly name: ValueSource;
  readonly correlation: readonly CorrelationCriterion[];
}

export interface SignalTrigger {
  readonly name: ValueSource;
}

export interface ConditionTrigger {
  readonly condition: Expression;
  readonly variableName: string | null;
  readonly variableEvents: readonly string[];
}

/** `code = null` catches every Error. */
export interface ErrorTrigger {
  readonly code: string | null;
  readonly codeVariable: string | null;
  readonly messageVariable: string | null;
}

/** `code = null` catches every Escalation. */
export interface EscalationTrigger {
  readonly code: string | null;
  readonly codeVariable: string | null;
}

/** Guarded type: `feature/subscriptions` owns matching on it. */
export enum TriggerTag {
  Timer = "timer",
  Message = "message",
  Signal = "signal",
  Condition = "condition",
  Error = "error",
  Escalation = "escalation",
  Compensation = "compensation",
  Cancel = "cancel",
}

export type Trigger =
  | { readonly tag: TriggerTag.Timer; readonly payload: TimerTrigger }
  | { readonly tag: TriggerTag.Message; readonly payload: MessageTrigger }
  | { readonly tag: TriggerTag.Signal; readonly payload: SignalTrigger }
  | { readonly tag: TriggerTag.Condition; readonly payload: ConditionTrigger }
  | { readonly tag: TriggerTag.Error; readonly payload: ErrorTrigger }
  | { readonly tag: TriggerTag.Escalation; readonly payload: EscalationTrigger }
  | { readonly tag: TriggerTag.Compensation }
  | { readonly tag: TriggerTag.Cancel };

export interface Subscription {
  readonly trigger: Trigger;
  readonly outputs: readonly Mapping[];
}

export interface Boundary {
  readonly id: ElementId;
  readonly subscription: Subscription;
  readonly interrupting: boolean;
  readonly outgoing: readonly FlowId[];
}

// Throws

export interface MessageThrow {
  readonly binding: string;
  readonly payload: readonly Mapping[];
}

export interface SignalThrow {
  readonly name: ValueSource;
  readonly payload: readonly Mapping[];
}

export interface ErrorThrow {
  readonly code: string;
  readonly message: string | null;
}

export interface EscalationThrow {
  readonly code: string;
}

export interface CompensationThrow {
  readonly activity: ElementId | null;
  readonly waitForCompletion: boolean;
}

/** Guarded type: `feature/propagation` owns matching on it. */
export enum ThrowTag {
  None = "none",
  Message = "message",
  Signal = "signal",
  Error = "error",
  Escalation = "escalation",
  Compensation = "compensation",
  Cancel = "cancel",
  Terminate = "terminate",
}

export type Throw =
  | { readonly tag: ThrowTag.None }
  | { readonly tag: ThrowTag.Message; readonly payload: MessageThrow }
  | { readonly tag: ThrowTag.Signal; readonly payload: SignalThrow }
  | { readonly tag: ThrowTag.Error; readonly payload: ErrorThrow }
  | { readonly tag: ThrowTag.Escalation; readonly payload: EscalationThrow }
  | { readonly tag: ThrowTag.Compensation; readonly payload: CompensationThrow }
  | { readonly tag: ThrowTag.Cancel }
  | { readonly tag: ThrowTag.Terminate };

// Work

export interface UserWork {
  readonly name: string | null;
  readonly assignee: ValueSource | null;
  readonly candidateUsers: readonly ValueSource[];
  readonly candidateGroups: readonly ValueSource[];
  readonly formKey: string | null;
  readonly formFields: readonly (readonly [string, string])[];
  readonly dueDate: ValueSource | null;
  readonly followUpDate: ValueSource | null;
  readonly priority: ValueSource | null;
}

export interface ReceiveWork {
  readonly message: MessageTrigger | null;
}

export interface ServiceWork {
  readonly protocol: string;
  readonly operation: string;
}

export interface SendWork {
  readonly binding: string;
  readonly recipient: ValueSource | null;
  readonly correlation: readonly CorrelationCriterion[];
}

export interface ScriptWork {
  readonly format: string;
  readonly source: string;
  readonly resultVariable: string | null;
}

export interface RuleWork {
  readonly decision: ValueSource;
  readonly resultVariable: string | null;
}

export enum CallBindingTag {
  Latest = "latest",
  Deployment = "deployment",
  Version = "version",
  VersionTag = "versionTag",
}

export type CallBinding =
  | { readonly tag: CallBindingTag.Latest }
  | { readonly tag: CallBindingTag.Deployment }
  | { readonly tag: CallBindingTag.Version; readonly value: ValueSource }
  | { readonly tag: CallBindingTag.VersionTag; readonly value: ValueSource };

export interface CallWork {
  readonly calledElement: ValueSource;
  readonly binding: CallBinding;
  readonly businessKey: Expression | null;
  readonly inputs: readonly Mapping[];
  readonly outputs: readonly Mapping[];
  readonly propagateAllInputs: boolean;
  readonly propagateAllOutputs: boolean;
}

/** Guarded type: `feature/work` owns matching on it. */
export enum WorkTag {
  None = "none",
  Manual = "manual",
  User = "user",
  Receive = "receive",
  Service = "service",
  Send = "send",
  Script = "script",
  Rule = "rule",
  Call = "call",
}

export type Work =
  | { readonly tag: WorkTag.None }
  | { readonly tag: WorkTag.Manual }
  | { readonly tag: WorkTag.User; readonly payload: UserWork }
  | { readonly tag: WorkTag.Receive; readonly payload: ReceiveWork }
  | { readonly tag: WorkTag.Service; readonly payload: ServiceWork }
  | { readonly tag: WorkTag.Send; readonly payload: SendWork }
  | { readonly tag: WorkTag.Script; readonly payload: ScriptWork }
  | { readonly tag: WorkTag.Rule; readonly payload: RuleWork }
  | { readonly tag: WorkTag.Call; readonly payload: CallWork };

// Multi-Instance and the shared activity envelope

/** Guarded type: `feature/multi-instance` owns matching on it. */
export enum MultiInstanceMode {
  Sequential = "sequential",
  Parallel = "parallel",
}

export enum InstanceCountTag {
  Collection = "collection",
  Cardinality = "cardinality",
}

export type InstanceCount =
  | { readonly tag: InstanceCountTag.Collection; readonly items: Expression }
  | { readonly tag: InstanceCountTag.Cardinality; readonly count: Expression };

export interface MultiInstance {
  readonly mode: MultiInstanceMode;
  readonly count: InstanceCount;
  readonly elementVariable: string | null;
  readonly completionCondition: Expression | null;
  readonly inputDataItem: string | null;
  readonly outputDataItem: string | null;
  readonly outputCollection: string | null;
  readonly mutableCollection: boolean;
}

export interface Envelope {
  readonly incoming: readonly FlowId[];
  readonly outgoing: readonly FlowId[];
  readonly inputs: readonly Mapping[];
  readonly outputs: readonly Mapping[];
  readonly boundaries: readonly Boundary[];
  readonly multiInstance: MultiInstance | null;
  readonly compensationHandler: ElementId | null;
}

// Elements

export interface ActivityPayload {
  readonly work: Work;
  readonly envelope: Envelope;
}

/** Guarded type: `feature/scopes` owns matching on it. */
export enum ScopeKindTag {
  Embedded = "embedded",
  Transaction = "transaction",
  EventSubProcess = "eventSubProcess",
}

export type ScopeKind =
  | { readonly tag: ScopeKindTag.Embedded }
  | { readonly tag: ScopeKindTag.Transaction }
  | { readonly tag: ScopeKindTag.EventSubProcess; readonly start: Subscription; readonly interrupting: boolean };

export interface ScopePayload {
  readonly kind: ScopeKind;
  readonly children: readonly ElementId[];
  readonly localVariables: readonly string[];
  readonly envelope: Envelope;
}

export enum Placement {
  Intermediate = "intermediate",
  Finish = "finish",
}

export enum EventRoleTag {
  Catch = "catch",
  Throw = "throw",
  LinkCatch = "linkCatch",
  LinkThrow = "linkThrow",
}

export type EventRole =
  | { readonly tag: EventRoleTag.Catch; readonly subscription: Subscription }
  | { readonly tag: EventRoleTag.Throw; readonly record: Throw }
  | { readonly tag: EventRoleTag.LinkCatch; readonly name: string }
  | { readonly tag: EventRoleTag.LinkThrow; readonly name: string };

export interface EventPayload {
  readonly role: EventRole;
  readonly placement: Placement;
  readonly incoming: readonly FlowId[];
  readonly outgoing: readonly FlowId[];
}

export interface ConditionalFlow {
  readonly flow: FlowId;
  readonly condition: Expression | null;
}

/** An Event-Based Gateway arm is a catch Event or a Receive Task, named by identifier. */
export interface EventArm {
  readonly target: ElementId;
}

/** Guarded type: `feature/flow` owns matching on it. Conditional candidates keep document order. */
export enum GatewayKindTag {
  Exclusive = "exclusive",
  Parallel = "parallel",
  Inclusive = "inclusive",
  EventBased = "eventBased",
}

export type GatewayKind =
  | {
      readonly tag: GatewayKindTag.Exclusive;
      readonly candidates: readonly ConditionalFlow[];
      readonly default: FlowId | null;
    }
  | { readonly tag: GatewayKindTag.Parallel }
  | {
      readonly tag: GatewayKindTag.Inclusive;
      readonly candidates: readonly ConditionalFlow[];
      readonly default: FlowId | null;
    }
  | { readonly tag: GatewayKindTag.EventBased; readonly arms: readonly EventArm[] };

export interface GatewayPayload {
  readonly kind: GatewayKind;
  readonly incoming: readonly FlowId[];
  readonly outgoing: readonly FlowId[];
}

export interface StartPayload {
  readonly subscription: Subscription | null;
  readonly outgoing: readonly FlowId[];
}

export interface Header {
  readonly id: ElementId;
  readonly sourceType: string;
  readonly parent: ElementId | null;
}

/** Guarded type: `step.ts` owns matching on it. */
export enum ElementTag {
  Activity = "activity",
  Scope = "scope",
  Event = "event",
  Gateway = "gateway",
  Start = "start",
}

export type Element =
  | { readonly tag: ElementTag.Activity; readonly header: Header; readonly payload: ActivityPayload }
  | { readonly tag: ElementTag.Scope; readonly header: Header; readonly payload: ScopePayload }
  | { readonly tag: ElementTag.Event; readonly header: Header; readonly payload: EventPayload }
  | { readonly tag: ElementTag.Gateway; readonly header: Header; readonly payload: GatewayPayload }
  | { readonly tag: ElementTag.Start; readonly header: Header; readonly payload: StartPayload };

export interface Flow {
  readonly id: FlowId;
  readonly source: ElementId;
  readonly target: ElementId;
}

export interface ProgramIdentity {
  readonly processId: string;
  readonly sourceSha256: string;
  readonly profile: string;
}

export interface Program {
  readonly identity: ProgramIdentity;
  readonly elements: readonly Element[];
  readonly flows: readonly Flow[];
}
