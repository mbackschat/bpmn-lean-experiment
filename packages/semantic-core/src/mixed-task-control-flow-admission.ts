import { CheckedNodeKind, GatewayDirection } from "./checked-process-contract.js";
import type { CheckedNode, CheckedProcess, CheckedSequenceFlow } from "./checked-process-contract.js";
import { EffectExecutionResultKind, StimulusKind } from "./contract.js";
import type { Stimulus } from "./contract.js";
import { analyzeMixedTaskControlFlow, MixedTaskControlKind } from "./mixed-task-control-flow-analysis.js";
import type { MixedTaskControlVertex } from "./mixed-task-control-flow-analysis.js";
import { InternalSchedulingMode, SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { semanticProcessClosureLimit } from "./semantic-process-limits.js";
import { MIXED_TASK_CONTROL_FLOW_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";
import type { VariableMapping } from "./semantic-value-contract.js";
import { serialBusinessBindingsAdmitted, serialBusinessEffectAdmitted } from "./serial-business-task-policy.js";

export function mixedTaskControlProgramShape(operations: readonly SemanticOperation[], scopeCount: number): boolean {
  const handlers = new Set(operations.flatMap(operation => operation.kind === SemanticOperationKind.AwaitEffect ? [operation.effect.descriptor.operation] : []));
  return scopeCount === 1 && operations.filter(operation => operation.kind === SemanticOperationKind.Initiate).length === 1 &&
    operations.filter(operation => operation.kind === SemanticOperationKind.ReachNoneEnd).length === 1 &&
    operations.filter(operation => operation.kind === SemanticOperationKind.CompleteScope).length === 1 &&
    operations.some(operation => operation.kind === SemanticOperationKind.AwaitUserTask || operation.kind === SemanticOperationKind.AwaitEffect) &&
    operations.every(operation => {
      switch (operation.kind) {
        case SemanticOperationKind.Initiate:
        case SemanticOperationKind.ReachNoneEnd: return true;
        case SemanticOperationKind.CompleteScope: return operation.parentOutput === null;
        case SemanticOperationKind.AwaitUserTask: return operation.task.metadata === undefined;
        case SemanticOperationKind.AwaitEffect: return operation.bpmnErrorRoute === null && serialBusinessEffectAdmitted(operation.effect, handlers);
        case SemanticOperationKind.Choose: return operation.candidates.length > 0;
        case SemanticOperationKind.MergeExclusive: return operation.inputs.length >= 2;
        default: return false;
      }
    });
}

export function mixedTaskControlCheckedShape(nodes: readonly CheckedNode[], scopeCount: number): boolean {
  const handlers = new Set(nodes.flatMap(node => node.kind === CheckedNodeKind.ServiceTask ? [node.descriptor.operation] : []));
  return scopeCount === 1 && nodes.filter(node => node.kind === CheckedNodeKind.NoneStartEvent).length === 1 &&
    nodes.filter(node => node.kind === CheckedNodeKind.NoneEndEvent).length === 1 &&
    nodes.some(node => node.kind === CheckedNodeKind.UserTask || node.kind === CheckedNodeKind.ServiceTask) &&
    nodes.every(node => {
      switch (node.kind) {
        case CheckedNodeKind.NoneStartEvent:
        case CheckedNodeKind.NoneEndEvent:
        case CheckedNodeKind.ExclusiveMerge: return true;
        case CheckedNodeKind.UserTask: return node.metadata === undefined;
        case CheckedNodeKind.ServiceTask: return node.bpmnErrorRoute === null && serialBusinessEffectAdmitted(node, handlers);
        case CheckedNodeKind.ExclusiveGateway: return node.direction === GatewayDirection.Diverging && node.candidateFlowIds.length > 0;
        default: return false;
      }
    });
}

function data(inputs: readonly VariableMapping[], outputs: readonly VariableMapping[]): Pick<MixedTaskControlVertex, "reads" | "writes"> {
  return { reads: inputs.flatMap(({ expression }) => expression.kind === MappingExpressionKind.EnclosingVariable ? [expression.name] : []),
    writes: outputs.map(mapping => mapping.target) };
}

function distinct(ids: readonly string[]): boolean {
  return ids.every(id => id.length > 0) && new Set(ids).size === ids.length;
}

type CheckedGraph = Pick<CheckedProcess, "processId" | "nodes" | "definitionScopes" | "compensation" | "transactionCancellation" | "interruptingMessageEventSubProcesses"> &
  Readonly<{ flows: readonly CheckedSequenceFlow[] }>;

export function mixedTaskControlCheckedGraph(graph: CheckedGraph): boolean {
  if (!mixedTaskControlCheckedShape(graph.nodes, graph.definitionScopes.length) || graph.compensation !== undefined ||
      graph.transactionCancellation !== undefined || graph.interruptingMessageEventSubProcesses !== undefined ||
      !distinct([graph.processId, ...graph.nodes.map(node => node.id), ...graph.flows.map(flow => flow.id)])) return false;
  const ids = new Set(graph.nodes.map(node => node.id));
  if (graph.flows.some(flow => !ids.has(flow.sourceId) || !ids.has(flow.targetId))) return false;
  const vertices: MixedTaskControlVertex[] = [];
  for (const node of graph.nodes) {
    const outgoing = graph.flows.filter(flow => flow.sourceId === node.id);
    let kind: MixedTaskControlKind;
    let bindings: Pick<MixedTaskControlVertex, "reads" | "writes"> = { reads: [], writes: [] };
    switch (node.kind) {
      case CheckedNodeKind.NoneStartEvent: kind = MixedTaskControlKind.Start; break;
      case CheckedNodeKind.NoneEndEvent: kind = MixedTaskControlKind.End; break;
      case CheckedNodeKind.UserTask: kind = MixedTaskControlKind.Task; break;
      case CheckedNodeKind.ServiceTask: kind = MixedTaskControlKind.Task; bindings = data(node.inputMappings, node.outputMappings); break;
      case CheckedNodeKind.ExclusiveMerge: kind = MixedTaskControlKind.Merge; break;
      case CheckedNodeKind.ExclusiveGateway: {
        kind = MixedTaskControlKind.Choice;
        const selected = [...node.candidateFlowIds, node.defaultFlowId];
        if (!distinct(selected) || selected.length !== outgoing.length ||
            !node.candidateFlowIds.every(id => outgoing.some(flow => flow.id === id && flow.condition !== null)) ||
            !outgoing.some(flow => flow.id === node.defaultFlowId && flow.condition === null)) return false;
        break;
      }
      default: return false;
    }
    if (kind !== MixedTaskControlKind.Choice && outgoing.some(flow => flow.condition !== null)) return false;
    vertices.push({ id: node.id, kind, outputs: outgoing.map(flow => flow.targetId), ...bindings });
  }
  const result = analyzeMixedTaskControlFlow(vertices);
  return result !== undefined && result.maximumBurst <= semanticProcessClosureLimit;
}

function programAnalysis(program: SemanticProcessProgram) {
  if (!mixedTaskControlProgramShape(program.operations, program.definitionScopes.length) || program.identity.sourceOverlay === null ||
      program.internalSchedulingMode !== InternalSchedulingMode.RejectObservableChoice || program.compensationActivityRetention !== undefined ||
      program.compensationEventSubProcessSnapshots !== undefined || program.compensationExecution !== undefined ||
      program.interruptingMessageEventSubProcesses !== undefined) return undefined;
  const identities = [program.processId, ...program.controlPlaces.map(place => place.origin.elementId)];
  const consumers = new Map<string, string>();
  for (const operation of program.operations) {
    if (operation.kind === SemanticOperationKind.CompleteScope) continue;
    if (!("elementId" in operation.origin)) return undefined;
    identities.push(operation.origin.elementId);
    const inputs = operation.kind === SemanticOperationKind.MergeExclusive ? operation.inputs : "input" in operation ? [operation.input] : [];
    for (const input of inputs) {
      if (consumers.has(input)) return undefined;
      consumers.set(input, operation.id);
    }
  }
  if (!distinct(identities)) return undefined;
  const vertices: MixedTaskControlVertex[] = [];
  const produced = new Set<string>();
  for (const operation of program.operations) {
    let kind: MixedTaskControlKind;
    let places: readonly string[];
    let bindings: Pick<MixedTaskControlVertex, "reads" | "writes"> = { reads: [], writes: [] };
    switch (operation.kind) {
      case SemanticOperationKind.CompleteScope: continue;
      case SemanticOperationKind.Initiate: kind = MixedTaskControlKind.Start; places = [operation.output]; break;
      case SemanticOperationKind.ReachNoneEnd: kind = MixedTaskControlKind.End; places = []; break;
      case SemanticOperationKind.AwaitUserTask: kind = MixedTaskControlKind.Task; places = [operation.output]; break;
      case SemanticOperationKind.AwaitEffect:
        kind = MixedTaskControlKind.Task; places = [operation.output]; bindings = data(operation.effect.inputMappings, operation.effect.outputMappings); break;
      case SemanticOperationKind.Choose:
        kind = MixedTaskControlKind.Choice; places = [...operation.candidates.map(candidate => candidate.output), operation.defaultOutput]; break;
      case SemanticOperationKind.MergeExclusive: kind = MixedTaskControlKind.Merge; places = [operation.output]; break;
      default: return undefined;
    }
    const outputs: string[] = [];
    for (const place of places) {
      const target = consumers.get(place);
      if (target === undefined || produced.has(place)) return undefined;
      produced.add(place);
      outputs.push(target);
    }
    vertices.push({ id: operation.id, kind, outputs, ...bindings });
  }
  if (produced.size !== program.controlPlaces.length || consumers.size !== produced.size ||
      !program.controlPlaces.every(place => produced.has(place.id))) return undefined;
  return analyzeMixedTaskControlFlow(vertices);
}

export function mixedTaskControlProgramGraph(program: SemanticProcessProgram): boolean {
  const result = programAnalysis(program);
  return result !== undefined && result.maximumBurst <= semanticProcessClosureLimit;
}

export function mixedTaskControlStimulusDataAdmitted(program: SemanticProcessProgram, stimulus: Stimulus): boolean {
  if (program.identity.semanticProfile !== MIXED_TASK_CONTROL_FLOW_CHECKPOINT_PROFILE_ID) return true;
  const handlers = new Set(program.operations.flatMap(operation => operation.kind === SemanticOperationKind.AwaitEffect ? [operation.effect.descriptor.operation] : []));
  switch (stimulus.kind) {
    case StimulusKind.StartProcess: {
      const result = programAnalysis(program);
      return stimulus.instanceId.length > 0 && result !== undefined && result.maximumBurst <= semanticProcessClosureLimit &&
        serialBusinessBindingsAdmitted(stimulus.initialVariables, handlers) &&
        result.requiredInputs.every(name => stimulus.initialVariables.some(binding => binding.name === name));
    }
    case StimulusKind.CompleteUserTaskInstance: return serialBusinessBindingsAdmitted(stimulus.submittedValues, handlers);
    case StimulusKind.CompleteEffect: return stimulus.result.kind === EffectExecutionResultKind.Success && serialBusinessBindingsAdmitted(stimulus.result.localPatch, handlers);
    default: return false;
  }
}
