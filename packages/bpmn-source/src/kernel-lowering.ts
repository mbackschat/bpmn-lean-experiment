import { ActivityDataEndpointKind, CheckedNodeKind, MessageChannelKind, SimpleBooleanExpressionKind } from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedProcess,
  DirectActivityDataInput,
  DirectActivityDataOutput,
  MessageChannel,
  SimpleBooleanExpression,
} from "@bpmn-lean/semantic-core";

import { parseSimpleBooleanExpression } from "./simple-boolean-expression.js";

/**
 * Lowers a checked process to the kernel IL ([proposal](../../../docs/LEAN-KERNEL-REWRITE-PROPOSAL.md#il)) in its
 * wire form, Lean's derived JSON encoding of `Kernel/IL/Types.lean`: a structure is an object with every field, a
 * nullary constructor a string, any other constructor `{"<name>": {<arguments>}}`.
 *
 * The lowering is total over checked-node kinds and applies no semantic rule: what the kernel admits is decided by
 * `Kernel.Admission`, never here. Its one refusal is a checked-process part the kernel IL cannot carry yet
 * (`lowering.<part>`), which a track lifts by extending this file.
 */

export type KernelJson = null | boolean | number | string | KernelJson[] | { [key: string]: KernelJson };

export type KernelLowering =
  | { readonly kind: "lowered"; readonly program: KernelJson }
  | { readonly kind: "refused"; readonly code: string };

const ctor = (name: string, args: Record<string, KernelJson>): KernelJson => ({ [name]: args });
const literalSource = (value: string): KernelJson => ctor("literal", { value });
const variable = (name: string): KernelJson => ctor("variable", { name });
const stringValue = (value: string): KernelJson => ({ kind: "string", value });

function simpleBoolean(expression: SimpleBooleanExpression): KernelJson {
  switch (expression.kind) {
    case SimpleBooleanExpressionKind.Literal:
      return ctor("literal", { value: expression.value });
    case SimpleBooleanExpressionKind.IsPresent:
      return ctor("isPresent", { name: expression.variable });
    case SimpleBooleanExpressionKind.IsNull:
      return ctor("isNull", { name: expression.variable });
    case SimpleBooleanExpressionKind.StringEquals:
      return ctor("stringEquals", { name: expression.variable, value: expression.value });
  }
}

class Refusal extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function condition(source: { readonly language: string; readonly body: string } | null): KernelJson {
  if (source === null) return null;
  const parsed = parseSimpleBooleanExpression(source.body);
  if (parsed === undefined) throw new Refusal("lowering.condition");
  return ctor("simpleBoolean", { body: simpleBoolean(parsed) });
}

type MappingSource =
  | { readonly kind: "stringLiteral"; readonly value: string }
  | { readonly kind: "localVariable"; readonly name: string }
  | { readonly kind: "enclosingVariable"; readonly name: string };

function mapping(target: string, source: MappingSource): KernelJson {
  switch (source.kind) {
    case "stringLiteral":
      return { target, source: ctor("literal", { value: stringValue(source.value) }) };
    case "localVariable":
    case "enclosingVariable":
      return { target, source: variable(source.name) };
  }
}

function envelope(incoming: string[], outgoing: string[]): Record<string, KernelJson> {
  return {
    incoming,
    outgoing,
    inputs: [],
    outputs: [],
    boundaries: [],
    multiInstance: null,
    compensationHandler: null,
  };
}

function userWork(name: string | null, candidateGroups: string[] = [], formFields: [string, string][] = []): KernelJson {
  return ctor("user", {
    payload: {
      name,
      assignee: null,
      candidateUsers: [],
      candidateGroups: candidateGroups.map(literalSource),
      formKey: null,
      formFields,
      dueDate: null,
      followUpDate: null,
      priority: null,
    },
  });
}

const subscription = (trigger: KernelJson, outputs: KernelJson[] = []): KernelJson => ({ trigger, outputs });
const timer = (schedule: KernelJson): KernelJson => ctor("timer", { payload: { schedule } });
const duration = (literal: string): KernelJson => timer(ctor("duration", { value: literalSource(literal) }));
const cycle = (literal: string): KernelJson => timer(ctor("cycle", { value: literalSource(literal), dialect: "iso8601" }));
/** The IL `MessageTrigger` of a checked channel; an unspecified Message has no name (CIB-INT-0004). */
function messageTrigger(channel: MessageChannel): KernelJson {
  switch (channel.kind) {
    case MessageChannelKind.OperationMessage:
      return { name: literalSource(channel.messageId), correlation: [],
        interfaceRef: channel.interfaceId, operationRef: channel.interfaceOperationId };
    case MessageChannelKind.DirectMessage:
      return { name: literalSource(channel.messageId), correlation: [], interfaceRef: null, operationRef: null };
    case MessageChannelKind.UnspecifiedMessage:
      return { name: null, correlation: [], interfaceRef: null, operationRef: null };
  }
}

const message = (channel: MessageChannel): KernelJson => ctor("message", { payload: messageTrigger(channel) });

type Ownership = {
  readonly parentOf: (nodeId: string) => string | null;
  readonly localData: (childScopeId: string) => { inputs: KernelJson[]; outputs: KernelJson[]; locals: string[] };
  readonly incoming: (nodeId: string) => string[];
  readonly outgoing: (nodeId: string) => string[];
  readonly children: (scopeId: string) => string[];
  readonly compensationHandler: (nodeId: string) => string | null;
};

type CompensationSubject = NonNullable<CheckedProcess["compensation"]>["subjects"][number];

/** The compensation subjects of the checked process, from Compensation and Transaction cancellation alike. */
function compensationSubjects(checked: CheckedProcess): CompensationSubject[] {
  return [...(checked.compensation?.subjects ?? []),
    ...(checked.transactionCancellation === undefined ? [] : [checked.transactionCancellation.subject])];
}

function ownership(checked: CheckedProcess): Ownership {
  const scopeOrigin = new Map(checked.definitionScopes.map((scope) => [scope.id, scope]));
  const nodeScope = new Map(checked.nodeScopes.map((entry) => [entry.nodeId, entry.scopeId]));
  const localData = new Map((checked.scopeLocalData ?? []).map((entry) => [entry.scopeId, entry]));
  const handled = compensationSubjects(checked).flatMap((subject) =>
    subject.kind === "boundaryActivity" ? [{ subject: subject.subjectElementId, handler: subject.body.handlerElementId }] : []);
  return {
    localData: (childScopeId) => {
      const entry = localData.get(childScopeId);
      if (entry === undefined) return { inputs: [], outputs: [], locals: [] };
      return {
        inputs: entry.localInputs.map((input) => mapping(input.target, input.expression)),
        outputs: entry.localOutputs.map((output) => mapping(output.target, output.expression)),
        locals: entry.localInputs.map((input) => input.target),
      };
    },
    parentOf: (nodeId) => {
      const scope = scopeOrigin.get(nodeScope.get(nodeId) ?? "");
      return scope === undefined || scope.parentScopeId === null ? null : scope.originElementId;
    },
    incoming: (nodeId) => checked.sequenceFlows.filter((flow) => flow.targetId === nodeId).map((flow) => flow.id),
    outgoing: (nodeId) => checked.sequenceFlows.filter((flow) => flow.sourceId === nodeId).map((flow) => flow.id),
    children: (scopeId) => [
      ...checked.nodeScopes.filter((entry) => entry.scopeId === scopeId).map((entry) => entry.nodeId),
      ...handled.filter((entry) => nodeScope.get(entry.subject) === scopeId).map((entry) => entry.handler),
    ],
    compensationHandler: (nodeId) => handled.find((entry) => entry.subject === nodeId)?.handler ?? null,
  };
}

/** An element is built once its attached boundaries are known; a boundary lives in its host's envelope. */
type Lowered =
  | { readonly kind: "element"; readonly id: string; readonly build: (boundaries: KernelJson[]) => KernelJson }
  | { readonly kind: "boundary"; readonly attachedTo: string; readonly boundary: KernelJson };

const fixed = (id: string, element: KernelJson): Lowered => ({ kind: "element", id, build: () => element });

function header(node: CheckedNode, sourceType: string, owner: Ownership): KernelJson {
  return { id: node.id, sourceType, parent: owner.parentOf(node.id) };
}

function activity(node: CheckedNode, sourceType: string, work: KernelJson, owner: Ownership,
  extra: Partial<Record<string, KernelJson>> = {}): Lowered {
  return {
    kind: "element",
    id: node.id,
    build: (boundaries) => ctor("activity", {
      header: header(node, sourceType, owner),
      payload: {
        work,
        envelope: {
          ...envelope(owner.incoming(node.id), owner.outgoing(node.id)),
          compensationHandler: owner.compensationHandler(node.id),
          ...extra,
          boundaries,
        },
      },
    }),
  };
}

function event(node: CheckedNode, sourceType: string, role: KernelJson, placement: "intermediate" | "finish",
  owner: Ownership): Lowered {
  const payload = { role, placement, incoming: owner.incoming(node.id), outgoing: owner.outgoing(node.id) };
  return fixed(node.id, ctor("event", { header: header(node, sourceType, owner), payload }));
}

function gateway(node: CheckedNode, sourceType: string, kind: KernelJson, owner: Ownership): Lowered {
  const payload = { kind, incoming: owner.incoming(node.id), outgoing: owner.outgoing(node.id) };
  return fixed(node.id, ctor("gateway", { header: header(node, sourceType, owner), payload }));
}

function start(node: CheckedNode, trigger: KernelJson | null, owner: Ownership): Lowered {
  const payload = { subscription: trigger === null ? null : subscription(trigger), outgoing: owner.outgoing(node.id) };
  return fixed(node.id, ctor("start", { header: header(node, "startEvent", owner), payload }));
}

function scope(node: CheckedNode, sourceType: string, kind: KernelJson, childScopeId: string, owner: Ownership,
  extra: Partial<Record<string, KernelJson>> = {}): Lowered {
  const local = owner.localData(childScopeId);
  return {
    kind: "element",
    id: node.id,
    build: (boundaries) => ctor("scope", {
      header: header(node, sourceType, owner),
      payload: {
        kind,
        children: owner.children(childScopeId),
        localVariables: local.locals,
        envelope: {
          ...envelope(owner.incoming(node.id), owner.outgoing(node.id)),
          inputs: local.inputs,
          outputs: local.outputs,
          compensationHandler: owner.compensationHandler(node.id),
          ...extra,
          boundaries,
        },
      },
    }),
  };
}

function boundary(id: string, attachedTo: string, trigger: KernelJson, interrupting: boolean, outputFlowId: string,
  outputs: KernelJson[] = []): Lowered {
  return {
    kind: "boundary",
    attachedTo,
    boundary: { id, subscription: subscription(trigger, outputs), interrupting, outgoing: [outputFlowId] },
  };
}

function candidates(checked: CheckedProcess, flowIds: readonly string[]): KernelJson[] {
  return flowIds.map((flowId) => {
    const flow = checked.sequenceFlows.find((candidate) => candidate.id === flowId);
    if (flow === undefined) throw new Refusal("lowering.candidate");
    return { flow: flowId, condition: condition(flow.condition) };
  });
}

function multiInstance(mode: "sequential" | "parallel", collection: string, item: string | null,
  completion: KernelJson | null): KernelJson {
  return {
    mode,
    count: ctor("collection", { items: variable(collection) }),
    elementVariable: item,
    completionCondition: completion,
    inputDataItem: null,
    outputDataItem: null,
    outputCollection: null,
    mutableCollection: false,
  };
}

function lowerNode(checked: CheckedProcess, node: CheckedNode, owner: Ownership): Lowered[] {
  switch (node.kind) {
    case CheckedNodeKind.NoneStartEvent:
      return [start(node, null, owner)];
    case CheckedNodeKind.MessageStartEvent:
      return [start(node, message(node.channel), owner)];
    case CheckedNodeKind.TimerStartEvent:
      return [start(node, duration(node.durationLiteral), owner)];
    case CheckedNodeKind.EmbeddedSubProcess:
      return [scope(node, "subProcess", "embedded", node.childScopeId, owner)];
    case CheckedNodeKind.TransactionSubProcess:
      return [scope(node, "transaction", "transaction", node.childScopeId, owner)];
    case CheckedNodeKind.SequentialMultiInstanceSubProcess:
      return [scope(node, "subProcess", "embedded", node.childScopeId, owner, {
        inputs: node.bodyInputs.map((input) => mapping(input.target, input.expression)),
        multiInstance: multiInstance("sequential", node.collectionName, node.itemName,
          node.completionBooleanName === null ? null : variable(node.completionBooleanName)),
      })];
    case CheckedNodeKind.ParallelMultiInstanceSubProcess:
      return [scope(node, "subProcess", "embedded", node.childScopeId, owner, {
        inputs: node.bodyInputs.map((input) => mapping(input.target, input.expression)),
        multiInstance: multiInstance("parallel", node.collectionName, node.itemName,
          node.completionBooleanName === null ? null : variable(node.completionBooleanName)),
      })];
    case CheckedNodeKind.CancelEndEvent:
      return [event(node, "endEvent", ctor("throw", { record: "cancel" }), "finish", owner)];
    case CheckedNodeKind.CancelBoundaryEvent:
      return [boundary(node.id, node.attachedToRef, "cancel", true, node.outputFlowId)];
    case CheckedNodeKind.CallActivity:
      return [activity(node, "callActivity", ctor("call", {
        payload: {
          calledElement: literalSource(node.calledProcessId),
          binding: "latest",
          businessKey: null,
          inputs: [],
          outputs: [],
          propagateAllInputs: false,
          propagateAllOutputs: false,
        },
      }), owner)];
    case CheckedNodeKind.BoundaryErrorEvent:
      return [boundary(node.id, node.attachedToRef,
        ctor("error", { payload: { code: node.error.code, codeVariable: null, messageVariable: null } }), true,
        node.outputFlowId)];
    case CheckedNodeKind.TimerBoundaryEvent:
      return [boundary(node.id, node.attachedToRef,
        node.cycleLiteral === undefined ? duration(node.durationLiteral ?? "") : cycle(node.cycleLiteral),
        node.interruption === "interrupting", node.outputFlowId)];
    case CheckedNodeKind.MessageBoundaryEvent:
      return [boundary(node.id, node.attachedToRef, message(node.channel),
        node.interruption === "interrupting", node.outputFlowId)];
    case CheckedNodeKind.UserTask:
      return [activity(node, "userTask", userWork(node.name,
        node.metadata?.assignment.candidates.map((candidate) => candidate.id) ?? [],
        node.metadata?.form?.fields.map((field): [string, string] => [field.key, field.type]) ?? []), owner)];
    case CheckedNodeKind.DataInputUserTask:
      return [activity(node, "userTask", userWork(node.name), owner, {
        inputs: [directInput(node.directInput)],
      })];
    case CheckedNodeKind.DataInputOutputUserTask:
      return [activity(node, "userTask", userWork(node.name), owner, {
        inputs: [directInput(node.directInput)],
        outputs: [directOutput(node.directOutput)],
      })];
    case CheckedNodeKind.DataOutputUserTask:
      return [activity(node, "userTask", userWork(node.name), owner, {
        outputs: [directOutput(node.directOutput)],
      })];
    case CheckedNodeKind.SequentialMultiInstanceUserTask:
    case CheckedNodeKind.ParallelMultiInstanceUserTask:
      throw new Refusal("lowering.multiInstanceUserTask");
    case CheckedNodeKind.IntermediateCatchTimerEvent:
      return [event(node, "intermediateCatchEvent",
        ctor("catch", { subscription: subscription(duration(node.durationLiteral)) }), "intermediate", owner)];
    case CheckedNodeKind.IntermediateCatchMessageEvent:
      return [event(node, "intermediateCatchEvent",
        ctor("catch", { subscription: subscription(message(node.channel)) }), "intermediate", owner)];
    case CheckedNodeKind.PayloadMessageCatchEvent:
      return [event(node, "intermediateCatchEvent", ctor("catch", {
        subscription: subscription(message(node.channel), [
          { target: node.directOutput.targetPropertyId, source: variable(node.directOutput.sourceDataOutputName ?? node.directOutput.sourceDataOutputId) },
        ]),
      }), "intermediate", owner)];
    case CheckedNodeKind.CorrelatedPayloadMessageCatchEvent:
      throw new Refusal("lowering.correlatedPayloadMessageCatch");
    case CheckedNodeKind.ReceiveTask:
      return [activity(node, "receiveTask", ctor("receive", {
        payload: { message: messageTrigger(node.channel) },
      }), owner)];
    case CheckedNodeKind.ServiceTask: {
      const lowered = activity(node, "serviceTask", ctor("service", {
        payload: { protocol: node.descriptor.protocol, operation: node.descriptor.operation },
      }), owner, {
        inputs: node.inputMappings.map((entry) => mapping(entry.target, entry.expression)),
        outputs: node.outputMappings.map((entry) => mapping(entry.target, entry.expression)),
      });
      if (node.bpmnErrorRoute === null) return [lowered];
      const route = node.bpmnErrorRoute;
      return [lowered, boundary(route.boundaryEventId, node.id,
        ctor("error", { payload: { code: route.code, codeVariable: null, messageVariable: null } }), true,
        route.outputFlowId)];
    }
    case CheckedNodeKind.ConfiguredTask:
      return [activity(node, "task", ctor("service", {
        payload: { protocol: node.descriptor.protocol, operation: node.descriptor.operation },
      }), owner)];
    case CheckedNodeKind.NonOperationalTask:
      return [activity(node, node.notation === "manualTask" ? "manualTask" : "task",
        node.notation === "manualTask" ? "manual" : "none", owner)];
    case CheckedNodeKind.NoneIntermediateThrowEvent:
      return [event(node, "intermediateThrowEvent", ctor("throw", { record: "none" }), "intermediate", owner)];
    case CheckedNodeKind.LinkThrowEvent:
      return [event(node, "intermediateThrowEvent", ctor("linkThrow", { name: node.linkName }), "intermediate", owner)];
    case CheckedNodeKind.LinkCatchEvent:
      return [event(node, "intermediateCatchEvent", ctor("linkCatch", { name: node.linkName }), "intermediate", owner)];
    case CheckedNodeKind.ParallelGateway:
      return [gateway(node, "parallelGateway", "parallel", owner)];
    case CheckedNodeKind.ExclusiveMerge:
      return [gateway(node, "exclusiveGateway", ctor("exclusive", {
        candidates: owner.outgoing(node.id).map((flow) => ({ flow, condition: null })),
        default: null,
      }), owner)];
    case CheckedNodeKind.ExclusiveGateway:
      return [gateway(node, "exclusiveGateway", ctor("exclusive", {
        candidates: candidates(checked, node.candidateFlowIds),
        default: node.defaultFlowId ?? null,
      }), owner)];
    case CheckedNodeKind.InclusiveGateway:
      return [gateway(node, "inclusiveGateway", ctor("inclusive", {
        candidates: "candidateFlowIds" in node ? candidates(checked, node.candidateFlowIds) : [],
        default: "defaultFlowId" in node ? node.defaultFlowId : null,
      }), owner)];
    case CheckedNodeKind.EventBasedGateway:
      return [gateway(node, "eventBasedGateway", ctor("eventBased", {
        arms: owner.outgoing(node.id).map((flowId) => ({
          target: checked.sequenceFlows.find((flow) => flow.id === flowId)?.targetId ?? flowId,
        })),
      }), owner)];
    case CheckedNodeKind.GlobalSynchronousCompensationThrowEvent:
      return [event(node, "intermediateThrowEvent", ctor("throw", {
        record: ctor("compensation", { payload: { activity: null, waitForCompletion: true } }),
      }), "intermediate", owner)];
    case CheckedNodeKind.ErrorEndEvent:
      return [event(node, "endEvent", ctor("throw", {
        record: ctor("error", { payload: { code: node.error.code, message: null } }),
      }), "finish", owner)];
    case CheckedNodeKind.TerminateEndEvent:
      return [event(node, "endEvent", ctor("throw", { record: "terminate" }), "finish", owner)];
    case CheckedNodeKind.NoneEndEvent:
      return [event(node, "endEvent", ctor("throw", { record: "none" }), "finish", owner)];
  }
}

function directInput(input: DirectActivityDataInput): KernelJson {
  const source = input.source.kind === ActivityDataEndpointKind.Property ? input.source.propertyId : input.source.dataInputId;
  return { target: input.targetDataInputName ?? input.targetDataInputId, source: variable(source) };
}

function directOutput(output: DirectActivityDataOutput): KernelJson {
  const target = output.target.kind === ActivityDataEndpointKind.Property ? output.target.propertyId : output.target.dataOutputId;
  return { target, source: variable(output.sourceDataOutputName ?? output.sourceDataOutputId) };
}

/**
 * A boundary-activity compensation subject: the compensation boundary on the subject (it has no outgoing flow and
 * interrupts nothing), the handler Activity in the subject's scope with no flows, and the subject's
 * `compensationHandler`. An Event Sub-Process subject is refused because the checked process carries only its
 * handler effect, not its start Event and flows.
 */
function compensationSubject(subject: CompensationSubject, owner: Ownership): Lowered[] {
  if (subject.kind === "eventSubProcess") throw new Refusal("lowering.compensationEventSubProcess");
  const body = subject.body;
  if (body.input.kind !== "empty") throw new Refusal("lowering.compensationInput");
  const handler: KernelJson = ctor("activity", {
    header: { id: body.handlerElementId, sourceType: "serviceTask", parent: owner.parentOf(subject.subjectElementId) },
    payload: {
      work: ctor("service", { payload: { protocol: body.descriptor.protocol, operation: body.descriptor.operation } }),
      envelope: envelope([], []),
    },
  });
  return [
    fixed(body.handlerElementId, handler),
    { kind: "boundary", attachedTo: subject.subjectElementId,
      boundary: { id: subject.boundaryEventElementId, subscription: subscription("compensation"), interrupting: false, outgoing: [] } },
  ];
}

export function lowerCheckedProcessToKernel(checked: CheckedProcess): KernelLowering {
  try {
    if ((checked.interruptingMessageEventSubProcesses ?? []).length > 0) {
      throw new Refusal("lowering.interruptingMessageEventSubProcess");
    }
    const owner = ownership(checked);
    const lowered = [...checked.nodes.flatMap((node) => lowerNode(checked, node, owner)),
      ...compensationSubjects(checked).flatMap((subject) => compensationSubject(subject, owner))];
    const boundaries = new Map<string, KernelJson[]>();
    for (const entry of lowered) {
      if (entry.kind === "boundary") boundaries.set(entry.attachedTo, [...(boundaries.get(entry.attachedTo) ?? []), entry.boundary]);
    }
    const elements = lowered.flatMap((entry) => (entry.kind === "element" ? [entry.build(boundaries.get(entry.id) ?? [])] : []));
    return {
      kind: "lowered",
      program: {
        identity: {
          processId: checked.processId,
          sourceSha256: checked.identity.sourceSha256,
          profile: checked.identity.semanticProfile,
        },
        elements,
        flows: checked.sequenceFlows.map((flow) => ({ id: flow.id, source: flow.sourceId, target: flow.targetId })),
      },
    };
  } catch (error) {
    if (error instanceof Refusal) return { kind: "refused", code: error.code };
    throw error;
  }
}
