import { ActivityDataEndpointKind, CallDataKind, CheckedNodeKind, MessageChannelKind, SimpleBooleanExpressionKind } from "@bpmn-lean/semantic-core";
import type {
  CallDataInterface,
  CheckedNode,
  CheckedProcess,
  DirectActivityDataInput,
  DirectActivityDataOutput,
  MessageChannel,
  SimpleBooleanExpression,
} from "@bpmn-lean/semantic-core";

import { parseSimpleBooleanExpression } from "./simple-boolean-expression.js";
import { defaultKernelProfileOptions } from "./kernel-reader/wire.js";
import type { KernelJson, KernelProfileOptions } from "./kernel-reader/wire.js";

/**
 * Lowers a checked process to the kernel IL ([proposal](../../../docs/LEAN-KERNEL-REWRITE-PROPOSAL.md#il)) in its
 * wire form, Lean's derived JSON encoding of `Kernel/IL/Types.lean`: a structure is an object with every field, a
 * nullary constructor a string, any other constructor `{"<name>": {<arguments>}}`.
 *
 * The lowering is total over checked-node kinds and applies no semantic rule: what the kernel admits is decided by
 * `Kernel.Admission`, never here. Its one refusal is a checked-process part the kernel IL cannot carry yet
 * (`lowering.<part>`), which a track lifts by extending this file.
 */

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
function messageTrigger(channel: MessageChannel, correlation: KernelJson[] = []): KernelJson {
  switch (channel.kind) {
    case MessageChannelKind.OperationMessage:
      return { name: literalSource(channel.messageId), correlation,
        interfaceRef: channel.interfaceId, operationRef: channel.interfaceOperationId };
    case MessageChannelKind.DirectMessage:
      return { name: literalSource(channel.messageId), correlation: [], interfaceRef: null, operationRef: null };
    case MessageChannelKind.UnspecifiedMessage:
      return { name: null, correlation: [], interfaceRef: null, operationRef: null };
  }
}

const message = (channel: MessageChannel, correlation: KernelJson[] = []): KernelJson =>
  ctor("message", { payload: messageTrigger(channel, correlation) });

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
  const eventHandled = compensationSubjects(checked).flatMap((subject) =>
    subject.kind === "eventSubProcess"
      ? [{ subject: subject.parentElementId, scope: subject.parentScopeId, handler: subject.body.handlerElementId }]
      : []);
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
      ...eventHandled.filter((entry) => entry.scope === scopeId).map((entry) => entry.handler),
    ],
    compensationHandler: (nodeId) =>
      [...handled, ...eventHandled].find((entry) => entry.subject === nodeId)?.handler ?? null,
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
          ...callData(node.data),
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
      return multiInstanceUserTask(node, "sequential", null, owner);
    case CheckedNodeKind.ParallelMultiInstanceUserTask:
      return multiInstanceUserTask(node, "parallel", condition(node.completionCondition), owner);
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
      // One criterion per key: the key's single property is bound to the Process Property its data path names, and
      // the `payload` message path makes the whole payload that property's value; the payload is never written
      // (docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md, exact expression and value subset).
      return [event(node, "intermediateCatchEvent", ctor("catch", {
        subscription: subscription(message(node.channel, [
          { key: node.correlationKeyId, value: variable(node.processPropertySelector.propertyId) },
        ])),
      }), "intermediate", owner)];
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

/**
 * A Call's data as `CallWork` mappings into and out of the called instance. A scalar interface joins the Call's
 * DataInput and DataOutput to the called process's by correspondence (BPMN 2.0.2 §10.3.6), so its associations
 * target the called process's DataInput and read its DataOutput; CIB variable mappings copy names across.
 */
function callData(data: CallDataInterface): Record<string, KernelJson> {
  switch (data.kind) {
    case CallDataKind.Empty:
      return { inputs: [], outputs: [], unsetSourceReadsNull: false };
    case CallDataKind.Scalar: {
      if (data.directInput.targetDataInputId !== data.call.input.id ||
        data.directOutput.sourceDataOutputId !== data.call.output.id) throw new Refusal("lowering.callData");
      const { source } = data.directInput;
      const { target } = data.directOutput;
      return {
        inputs: [{ target: data.called.input.id,
          source: variable(source.kind === ActivityDataEndpointKind.Property ? source.propertyId : source.dataInputId) }],
        outputs: [{ target: target.kind === ActivityDataEndpointKind.Property ? target.propertyId : target.dataOutputId,
          source: variable(data.called.output.id) }],
        unsetSourceReadsNull: false,
      };
    }
    case CallDataKind.VariableMappings:
      return {
        inputs: data.inputs.map((input) => mapping(input.target, input.expression)),
        outputs: data.outputs.map((output) => mapping(output.target, output.expression)),
        unsetSourceReadsNull: true,
      };
  }
}

type MultiInstanceUserTaskNode = Extract<CheckedNode, {
  kind: CheckedNodeKind.SequentialMultiInstanceUserTask | CheckedNodeKind.ParallelMultiInstanceUserTask;
}>;

/**
 * A Multi-Instance User Task over a collection DataObject, with its lifetime Timer boundary. Its direct item
 * associations are folded into the loop: each instance receives its item as the task's DataInput and submits the
 * task's DataOutput, and the output collection is written to the output DataObject.
 */
function multiInstanceUserTask(node: MultiInstanceUserTaskNode, mode: "sequential" | "parallel",
  completion: KernelJson, owner: Ownership): Lowered[] {
  return [
    activity(node, "userTask", userWork(node.name), owner, {
      multiInstance: {
        mode,
        count: ctor("collection", { items: variable(node.input.dataObjectReferenceId) }),
        elementVariable: null,
        completionCondition: completion,
        inputDataItem: node.input.taskDataInputId,
        outputDataItem: node.output.taskDataOutputId,
        outputCollection: node.output.dataObjectReferenceId,
        mutableCollection: false,
      },
    }),
    boundary(node.boundaryTimer.elementId, node.id, duration(node.boundaryTimer.durationLiteral), true,
      node.boundaryTimer.outputFlowId),
  ];
}

function directInput(input: DirectActivityDataInput): KernelJson {
  const source = input.source.kind === ActivityDataEndpointKind.Property ? input.source.propertyId : input.source.dataInputId;
  return { target: input.targetDataInputId, source: variable(source) };
}

function directOutput(output: DirectActivityDataOutput): KernelJson {
  const target = output.target.kind === ActivityDataEndpointKind.Property ? output.target.propertyId : output.target.dataOutputId;
  return { target, source: variable(output.sourceDataOutputId) };
}

/** The single effect of a compensation handler, with the restored binding its checked body names as its input. */
function compensationEffect(id: string, parent: string | null, body: CompensationSubject["body"]): KernelJson {
  const inputs = body.input.kind === "empty" ? [] : [{ target: body.input.targetDataInputId, source: variable(body.input.sourcePropertyId) }];
  return ctor("activity", {
    header: { id, sourceType: "serviceTask", parent },
    payload: {
      work: ctor("service", { payload: { protocol: body.descriptor.protocol, operation: body.descriptor.operation } }),
      envelope: { ...envelope([], []), inputs },
    },
  });
}

/**
 * A compensation subject. A boundary-activity subject: the compensation boundary on the subject (it has no outgoing
 * flow and interrupts nothing), the handler Activity in the subject's scope with no flows, and the subject's
 * `compensationHandler`. An Event Sub-Process subject: the Compensation Event Sub-Process inside its parent
 * Sub-Process, which is the subject, and its single effect. The checked process erases the Event Sub-Process's
 * start Event, end Event and Sequence Flows; the kernel begins its effect as an Activity without incoming flow in a
 * Scope without a start Event (BPMN 2.0.2 §13.3.4) and invents no identifier for them.
 */
function compensationSubject(subject: CompensationSubject, owner: Ownership): Lowered[] {
  const body = subject.body;
  if (subject.kind === "eventSubProcess") {
    const eventSubProcess: KernelJson = ctor("scope", {
      header: { id: body.handlerElementId, sourceType: "subProcess", parent: subject.parentElementId },
      payload: {
        kind: ctor("eventSubProcess", { start: subscription("compensation"), interrupting: false }),
        children: [body.effectElementId],
        localVariables: [],
        envelope: envelope([], []),
      },
    });
    return [fixed(body.handlerElementId, eventSubProcess),
      fixed(body.effectElementId, compensationEffect(body.effectElementId, body.handlerElementId, body))];
  }
  if (body.input.kind !== "empty") throw new Refusal("lowering.compensationInput");
  return [
    fixed(body.handlerElementId, compensationEffect(body.handlerElementId, owner.parentOf(subject.subjectElementId), body)),
    { kind: "boundary", attachedTo: subject.subjectElementId,
      boundary: { id: subject.boundaryEventElementId, subscription: subscription("compensation"), interrupting: false, outgoing: [] } },
  ];
}

/** Every parentless definition scope other than the root process's is a called process. */
function calledProcesses(checked: CheckedProcess, owner: Ownership): KernelJson[] {
  return checked.definitionScopes
    .filter((scope) => scope.parentScopeId === null && scope.originElementId !== checked.processId)
    .map((scope) => ({ id: scope.originElementId, children: owner.children(scope.id) }));
}

export function lowerCheckedProcessToKernel(
  checked: CheckedProcess,
  options: KernelProfileOptions = defaultKernelProfileOptions,
): KernelLowering {
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
        options,
        elements,
        flows: checked.sequenceFlows.map((flow) => ({ id: flow.id, source: flow.sourceId, target: flow.targetId })),
        processes: calledProcesses(checked, owner),
      },
    };
  } catch (error) {
    if (error instanceof Refusal) return { kind: "refused", code: error.code };
    throw error;
  }
}
