/**
 * The checked BPMN graph: the project-owned, admitted representation of one BPMN definition.
 *
 * This is the last representation that still speaks in BPMN elements. Every node carries the source
 * element identity it was admitted from, so a lowering result can be compared against its source
 * rather than trusted, and nothing here has been resolved into control places or operations yet.
 * The Semantic Process IL lowered from it is owned by `semantic-process-contract.ts`.
 */
import type { DeepReadonly } from "./deep-readonly.js";
import type { SourceOverlayIdentity } from "./source-overlay-identity.js";
import { MessageChannelKind } from "./semantic-value-contract.js";
import type {
  DefinitionScope,
  EffectDescriptor,
  ErrorReference,
  MessageChannel,
  VariableMapping,
} from "./semantic-value-contract.js";

export enum CheckedProcessKind {
  CheckedProcess = "checkedProcess",
}

export enum CheckedNodeKind {
  NoneStartEvent = "noneStartEvent",
  EmbeddedSubProcess = "embeddedSubProcess",
  CallActivity = "callActivity",
  BoundaryErrorEvent = "boundaryErrorEvent",
  TimerBoundaryEvent = "timerBoundaryEvent",
  UserTask = "userTask",
  IntermediateCatchTimerEvent = "intermediateCatchTimerEvent",
  IntermediateCatchMessageEvent = "intermediateCatchMessageEvent",
  ReceiveTask = "receiveTask",
  ServiceTask = "serviceTask",
  ParallelGateway = "parallelGateway",
  ExclusiveMerge = "exclusiveMerge",
  ExclusiveGateway = "exclusiveGateway",
  InclusiveGateway = "inclusiveGateway",
  EventBasedGateway = "eventBasedGateway",
  ErrorEndEvent = "errorEndEvent",
  NoneEndEvent = "noneEndEvent",
}

export enum GatewayDirection {
  Diverging = "diverging",
  Converging = "converging",
}

/**
 * Whether a Boundary Event ends its host Activity's occurrence when it fires.
 *
 * A closed value rather than the source attribute's boolean, so the two dispositions select
 * different lowering clauses in checked source instead of being decided by a field after lowering.
 * The XSD and CMOF default `cancelActivity` to `true`, so an omitted attribute is `Interrupting`.
 */
export enum BoundaryInterruption {
  Interrupting = "interrupting",
  NonInterrupting = "nonInterrupting",
}

export type CheckedProcessIdentity = DeepReadonly<{
  semanticProfile: string;
  sourceId: string;
  sourceSha256: string;
  sourceOverlay: SourceOverlayIdentity | null;
}>;

export type CheckedBpmnErrorRoute = DeepReadonly<{
  boundaryEventId: string;
  boundaryEventName: string | null;
  attachedToRef: string;
  errorDefinitionId: string;
  errorElementId: string;
  errorName: string | null;
  code: string;
  outputFlowId: string;
}>;

export type CheckedCondition = DeepReadonly<{
  language: string;
  body: string;
}>;

type CheckedServiceTask = DeepReadonly<{
  kind: CheckedNodeKind.ServiceTask;
  id: string;
  descriptor: EffectDescriptor;
  inputMappings: VariableMapping[];
  outputMappings: VariableMapping[];
  bpmnErrorRoute: CheckedBpmnErrorRoute | null;
}>;

export type CheckedNode =
  | DeepReadonly<{
      kind: CheckedNodeKind.NoneStartEvent;
      id: string;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.EmbeddedSubProcess;
      id: string;
      childScopeId: string;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.CallActivity;
      id: string;
      calledProcessId: string;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.BoundaryErrorEvent;
      id: string;
      attachedToRef: string;
      error: ErrorReference;
      outputFlowId: string;
    }>
  /**
   * A Timer Boundary Event, in either interruption disposition.
   *
   * `durationLiteral` retains the exact source lexeme so Lean normalizes it to milliseconds
   * independently instead of trusting the TypeScript compiler's arithmetic. `interruption` is what
   * selects the host's lowering clause, so a source cannot acquire the wrong interruption semantics
   * by matching a shape; which dispositions a given profile admits is the profile's own decision.
   */
  | DeepReadonly<{
      kind: CheckedNodeKind.TimerBoundaryEvent;
      id: string;
      attachedToRef: string;
      interruption: BoundaryInterruption;
      durationLiteral: "PT1S";
      outputFlowId: string;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.UserTask;
      id: string;
      name: string | null;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.IntermediateCatchTimerEvent;
      id: string;
      durationLiteral: "PT1S";
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.IntermediateCatchMessageEvent;
      id: string;
      channel: Extract<
        MessageChannel,
        { kind: typeof MessageChannelKind.OperationMessage }
      >;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.ReceiveTask;
      id: string;
      channel: Extract<
        MessageChannel,
        { kind: typeof MessageChannelKind.DirectMessage }
      >;
    }>
  | CheckedServiceTask
  | DeepReadonly<{
      kind: CheckedNodeKind.ParallelGateway;
      id: string;
      direction: GatewayDirection;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.ExclusiveMerge;
      id: string;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.ExclusiveGateway;
      id: string;
      direction: GatewayDirection.Diverging;
      candidateFlowIds: [string, string];
      defaultFlowId: string;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.InclusiveGateway;
      id: string;
      direction: GatewayDirection.Diverging;
      candidateFlowIds: [string, string];
      defaultFlowId: string;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.InclusiveGateway;
      id: string;
      direction: GatewayDirection.Converging;
      pairedGatewayId: string;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.EventBasedGateway;
      id: string;
      direction: GatewayDirection.Diverging;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.ErrorEndEvent;
      id: string;
      error: ErrorReference;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.NoneEndEvent;
      id: string;
    }>;

export type CheckedSequenceFlow = DeepReadonly<{
  id: string;
  sourceId: string;
  targetId: string;
  condition: CheckedCondition | null;
}>;

export type NodeScopeOwnership = DeepReadonly<{
  nodeId: string;
  scopeId: string;
}>;

export type SequenceFlowScopeOwnership = DeepReadonly<{
  sequenceFlowId: string;
  scopeId: string;
}>;

export type CheckedProcess = DeepReadonly<{
  kind: CheckedProcessKind.CheckedProcess;
  identity: CheckedProcessIdentity;
  processId: string;
  definitionScopes: DefinitionScope[];
  nodeScopes: NodeScopeOwnership[];
  sequenceFlowScopes: SequenceFlowScopeOwnership[];
  nodes: CheckedNode[];
  sequenceFlows: CheckedSequenceFlow[];
}>;
