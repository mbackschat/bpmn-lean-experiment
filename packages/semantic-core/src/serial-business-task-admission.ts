import { CheckedNodeKind } from "./checked-process-contract.js";
import type { CheckedNode, CheckedSequenceFlow } from "./checked-process-contract.js";
import { EffectExecutionResultKind, StimulusKind } from "./contract.js";
import type { Stimulus } from "./contract.js";
import { InternalSchedulingMode, SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { VariableValueKind } from "./contract.js";
import type { VariableValue } from "./contract.js";
import { effectMappingAcceptsValue } from "./effect-mapping-value-policy.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";
import type { VariableMapping } from "./semantic-value-contract.js";
import {
  SerialChainHumanTasks, isSerialChainProfile, serialBusinessBindingsAdmitted, serialBusinessEffectAdmitted,
  serialBusinessTaskRules, serialBusinessUserTaskMetadataAdmitted, serialChainRulesForProfile,
} from "./serial-business-task-policy.js";
import type { SerialChainRules } from "./serial-business-task-policy.js";

enum VertexKind { Start, Human, Service, End }
type Vertex = Readonly<{ id: string; kind: VertexKind; next: string | null; inputs: readonly VariableMapping[]; outputs: readonly VariableMapping[] }>;

export function serialBusinessProgramShape(operations: readonly SemanticOperation[], scopeCount: number,
  rules: SerialChainRules = serialBusinessTaskRules): boolean {
  const humans = rules.humanTasks === SerialChainHumanTasks.Required;
  const handlers = new Set(operations.flatMap(operation => operation.kind === SemanticOperationKind.AwaitEffect ? [operation.effect.descriptor.operation] : []));
  return scopeCount === 1 && operations.filter(operation => operation.kind === SemanticOperationKind.Initiate).length === 1 &&
    operations.filter(operation => operation.kind === SemanticOperationKind.ReachNoneEnd).length === 1 &&
    operations.filter(operation => operation.kind === SemanticOperationKind.CompleteScope).length === 1 &&
    operations.some(operation => operation.kind === SemanticOperationKind.AwaitUserTask) === humans && handlers.size > 0 &&
    operations.every(operation => {
      switch (operation.kind) {
        case SemanticOperationKind.Initiate:
        case SemanticOperationKind.ReachNoneEnd: return true;
        case SemanticOperationKind.CompleteScope: return operation.parentOutput === null;
        case SemanticOperationKind.AwaitUserTask: return humans && serialBusinessUserTaskMetadataAdmitted(operation.task, handlers);
        case SemanticOperationKind.AwaitEffect: return operation.bpmnErrorRoute === null && serialBusinessEffectAdmitted(operation.effect, handlers, rules);
        default: return false;
      }
    });
}

export function serialBusinessCheckedShape(nodes: readonly CheckedNode[], scopeCount: number,
  rules: SerialChainRules = serialBusinessTaskRules): boolean {
  const humans = rules.humanTasks === SerialChainHumanTasks.Required;
  const handlers = new Set(nodes.flatMap(node => node.kind === CheckedNodeKind.ServiceTask ? [node.descriptor.operation] : []));
  return scopeCount === 1 && nodes.filter(node => node.kind === CheckedNodeKind.NoneStartEvent).length === 1 &&
    nodes.filter(node => node.kind === CheckedNodeKind.NoneEndEvent).length === 1 &&
    nodes.some(node => node.kind === CheckedNodeKind.UserTask) === humans && handlers.size > 0 && nodes.every(node => {
      switch (node.kind) {
        case CheckedNodeKind.NoneStartEvent:
        case CheckedNodeKind.NoneEndEvent: return true;
        case CheckedNodeKind.UserTask: return humans && serialBusinessUserTaskMetadataAdmitted(node, handlers);
        case CheckedNodeKind.ServiceTask: return node.bpmnErrorRoute === null && serialBusinessEffectAdmitted(node, handlers, rules);
        default: return false;
      }
    });
}

/** SBT-CHAIN-01 traverses every vertex exactly once, rejecting branches, cycles and disconnected elements. */
function analyze(vertices: readonly Vertex[]): ReadonlySet<string> | null {
  const byId = new Map(vertices.map(vertex => [vertex.id, vertex]));
  if (byId.size !== vertices.length) return null;
  const starts = vertices.filter(vertex => vertex.kind === VertexKind.Start);
  if (starts.length !== 1) return null;
  const incoming = new Map<string, number>();
  for (const vertex of vertices) {
    if ((vertex.kind === VertexKind.End) !== (vertex.next === null)) return null;
    if (vertex.next !== null) {
      if (!byId.has(vertex.next)) return null;
      incoming.set(vertex.next, (incoming.get(vertex.next) ?? 0) + 1);
    }
  }
  if (vertices.some(vertex => (incoming.get(vertex.id) ?? 0) !== (vertex.kind === VertexKind.Start ? 0 : 1))) return null;
  const visited = new Set<string>();
  const produced = new Set<string>();
  const required = new Set<string>();
  let current: Vertex | undefined = starts[0];
  while (current !== undefined) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    for (const { expression } of current.inputs) {
      if (expression.kind === MappingExpressionKind.EnclosingVariable && !produced.has(expression.name)) required.add(expression.name);
    }
    for (const { target } of current.outputs) produced.add(target);
    current = current.next === null ? undefined : byId.get(current.next);
  }
  return visited.size === vertices.length ? required : null;
}

export function serialBusinessCheckedGraph(graph: Readonly<{ nodes: readonly CheckedNode[]; flows: readonly CheckedSequenceFlow[] }>,
  rules: SerialChainRules = serialBusinessTaskRules): boolean {
  if (!serialBusinessCheckedShape(graph.nodes, 1, rules) || graph.flows.some(flow => flow.condition !== null) ||
      new Set(graph.flows.map(flow => flow.id)).size !== graph.flows.length) return false;
  const vertices: Vertex[] = [];
  const ids = new Set(graph.nodes.map(node => node.id));
  if (graph.flows.some(flow => !ids.has(flow.sourceId) || !ids.has(flow.targetId))) return false;
  for (const node of graph.nodes) {
    const outgoing = graph.flows.filter(flow => flow.sourceId === node.id);
    if (outgoing.length !== (node.kind === CheckedNodeKind.NoneEndEvent ? 0 : 1)) return false;
    const kind = node.kind === CheckedNodeKind.NoneStartEvent ? VertexKind.Start : node.kind === CheckedNodeKind.NoneEndEvent ? VertexKind.End :
      node.kind === CheckedNodeKind.ServiceTask ? VertexKind.Service : VertexKind.Human;
    vertices.push({ id: node.id, kind, next: outgoing[0]?.targetId ?? null,
      inputs: node.kind === CheckedNodeKind.ServiceTask ? node.inputMappings : [], outputs: node.kind === CheckedNodeKind.ServiceTask ? node.outputMappings : [] });
  }
  return analyze(vertices) !== null;
}

function programAnalysis(program: SemanticProcessProgram): ReadonlySet<string> | null {
  if (!serialBusinessProgramShape(program.operations, program.definitionScopes.length, serialChainRulesForProfile(program.identity.semanticProfile)) ||
      program.identity.sourceOverlay === null ||
      program.internalSchedulingMode !== InternalSchedulingMode.RejectObservableChoice || program.compensationActivityRetention !== undefined ||
      program.compensationEventSubProcessSnapshots !== undefined || program.compensationExecution !== undefined ||
      program.interruptingMessageEventSubProcesses !== undefined) return null;
  const sourceIdentities = [program.processId, ...program.controlPlaces.map(place => place.origin.elementId)];
  for (const operation of program.operations) {
    if (operation.kind === SemanticOperationKind.CompleteScope) continue;
    if (!("elementId" in operation.origin)) return null;
    sourceIdentities.push(operation.origin.elementId);
  }
  if (new Set(sourceIdentities).size !== sourceIdentities.length) return null;
  const vertices: Vertex[] = [];
  const usedPlaces = new Set<string>();
  for (const operation of program.operations) {
    if (operation.kind === SemanticOperationKind.CompleteScope) continue;
    let next: string | null = null;
    if ("output" in operation) {
      const targets = program.operations.filter(candidate => "input" in candidate && candidate.input === operation.output);
      if (targets.length !== 1 || usedPlaces.has(operation.output)) return null;
      next = targets[0]!.id;
      usedPlaces.add(operation.output);
    }
    const kind = operation.kind === SemanticOperationKind.Initiate ? VertexKind.Start : operation.kind === SemanticOperationKind.ReachNoneEnd ? VertexKind.End :
      operation.kind === SemanticOperationKind.AwaitEffect ? VertexKind.Service : VertexKind.Human;
    vertices.push({ id: operation.id, kind, next, inputs: operation.kind === SemanticOperationKind.AwaitEffect ? operation.effect.inputMappings : [],
      outputs: operation.kind === SemanticOperationKind.AwaitEffect ? operation.effect.outputMappings : [] });
  }
  if (usedPlaces.size !== program.controlPlaces.length || program.controlPlaces.some(place => !usedPlaces.has(place.id))) return null;
  return analyze(vertices);
}

export function serialBusinessProgramGraph(program: SemanticProcessProgram): boolean {
  return programAnalysis(program) !== null;
}

/**
 * SBT-AVAILABLE-01 treats only earlier Service outputs as guaranteed writes; humans promise none.
 *
 * Process Start keeps the String/Null kinds under every serial-chain profile while a result patch takes the profile's
 * effect-mapping domain, so a widened profile cannot widen Start (PBV-EFF-01).
 */
export function serialBusinessStimulusDataAdmitted(program: SemanticProcessProgram, stimulus: Stimulus): boolean {
  if (!isSerialChainProfile(program.identity.semanticProfile)) return true;
  const rules = serialChainRulesForProfile(program.identity.semanticProfile);
  const handlers = new Set(program.operations.flatMap(operation => operation.kind === SemanticOperationKind.AwaitEffect ? [operation.effect.descriptor.operation] : []));
  const startValue = (value: VariableValue) => (value.kind === VariableValueKind.String || value.kind === VariableValueKind.Null) &&
    effectMappingAcceptsValue(rules.valuePolicy, value, true);
  const resultValue = (value: VariableValue) => effectMappingAcceptsValue(rules.valuePolicy, value, true);
  switch (stimulus.kind) {
    case StimulusKind.StartProcess: {
      const required = programAnalysis(program);
      return stimulus.instanceId.length > 0 && required !== null && serialBusinessBindingsAdmitted(stimulus.initialVariables, handlers, startValue) &&
        [...required].every(name => stimulus.initialVariables.some(binding => binding.name === name));
    }
    case StimulusKind.CompleteUserTaskInstance:
      return rules.humanTasks === SerialChainHumanTasks.Required && serialBusinessBindingsAdmitted(stimulus.submittedValues, handlers, startValue);
    case StimulusKind.CompleteEffect: return stimulus.result.kind === EffectExecutionResultKind.Success && serialBusinessBindingsAdmitted(stimulus.result.localPatch, handlers, resultValue);
    default: return false;
  }
}
