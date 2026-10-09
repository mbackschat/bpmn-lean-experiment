import { CheckedNodeKind, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { CheckedNode, SemanticProcessProgram, StartProcessStimulus } from "@bpmn-lean/semantic-core";
import { parallelAdmissionCases } from "./parallel-scope-admission-fixture.ts";

/** Shared source-derived Program/Start inputs contain no expected states or capacity answers. */
export async function parallelCommandInputs(options: Readonly<{
  condition?: boolean; parentEffect?: boolean; processEffectOutput?: boolean; parentPrelude?: boolean;
  bodyShape?: "serial" | "joined" | "separate-ends";
}> = {}): Promise<readonly Readonly<{
  count: number; program: SemanticProcessProgram; start: StartProcessStimulus;
}>[]> {
  const { lowerCheckedProcess } = await import(new URL("../dist/semantic-process-lowering.js", import.meta.url).href
  ) as typeof import("../src/semantic-process-lowering.ts");
  const selected = (await parallelAdmissionCases()).find(({ source, expected }) => {
    const shape = source.nodes.some(node => node.id === "Joined") ? "joined"
      : source.nodes.some(node => node.id === "Branch0") ? "separate-ends" : "serial";
    return expected && shape === (options.bodyShape ?? "serial");
  });
  if (selected === undefined) throw new Error("Invoice fixture requires its admitted body shape");
  let source = selected.source;
  const service = source.nodes.find(node => node.kind === CheckedNodeKind.ServiceTask);
  if (service?.kind !== CheckedNodeKind.ServiceTask) throw new Error("Invoice fixture requires its Service Task");
  const nodes = source.nodes.map((node): CheckedNode => {
    if (options.condition && node.kind === CheckedNodeKind.ParallelMultiInstanceSubProcess)
      return { ...node, completionBooleanName: "stop" };
    if (options.parentEffect && node.id === "PublishBatch") return { ...service, id: node.id,
      inputMappings: [], outputMappings: service.outputMappings.map(mapping => ({ ...mapping, target: "summary" })) };
    if (options.processEffectOutput && node.kind === CheckedNodeKind.ServiceTask)
      return { ...node, outputMappings: node.outputMappings.map(mapping => ({ ...mapping, target: "summary" })) };
    return node;
  });
  if (options.parentPrelude) {
    const root = source.definitionScopes.find(scope => scope.parentScopeId === null)!;
    const start = source.nodes.find(node => node.kind === CheckedNodeKind.NoneStartEvent &&
      source.nodeScopes.some(owner => owner.nodeId === node.id && owner.scopeId === root.id))!;
    const outgoing = source.sequenceFlows.find(flow => flow.sourceId === start.id)!;
    const prelude: CheckedNode[] = [
      { kind: CheckedNodeKind.UserTask, id: "ApproveBatch", name: "Approve invoice batch" },
      { ...service, id: "ValidateBatch", inputMappings: [],
        outputMappings: service.outputMappings.map(mapping => ({ ...mapping, target: "batchValidation" })) },
    ];
    const flows = [
      { id: "BatchApproval", sourceId: start.id, targetId: "ApproveBatch", condition: null },
      { id: "BatchValidation", sourceId: "ApproveBatch", targetId: "ValidateBatch", condition: null },
    ];
    nodes.push(...prelude);
    source = { ...source, nodeScopes: [...source.nodeScopes, ...prelude.map(node => ({ nodeId: node.id, scopeId: root.id }))],
      sequenceFlows: [...source.sequenceFlows.map(flow => flow.id === outgoing.id ? { ...flow, sourceId: "ValidateBatch" } : flow), ...flows],
      sequenceFlowScopes: [...source.sequenceFlowScopes, ...flows.map(flow => ({ sequenceFlowId: flow.id, scopeId: root.id }))] };
  }
  const lowered = lowerCheckedProcess({ ...source, nodes });
  const program = { ...lowered, controlPlaces: [...lowered.controlPlaces].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0) };
  return [0, 1, 2, 16].map(count => ({ count, program,
    start: { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId: "invoices",
      initialVariables: [{ name: "items", value: { kind: VariableValueKind.StringList,
        value: Array.from({ length: count }, () => "same-invoice") } },
        ...(options.condition ? [{ name: "stop", value: { kind: VariableValueKind.Boolean, value: false } } as const] : [])] } }));
}
