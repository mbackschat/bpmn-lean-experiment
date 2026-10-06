import assert from "node:assert/strict";
import { CheckedNodeKind, SemanticOperationKind as Op, SemanticOriginKind, VariableValueKind as Value,
  MappingExpressionKind as Mapping, StimulusKind } from "@bpmn-lean/semantic-core";
import type { CheckedProcess, SemanticProcessProgram, StartProcessStimulus } from "@bpmn-lean/semantic-core";
import { program as base } from "../../semantic-core/test/embedded-subprocess-fixture.ts";
import { parallelAdmissionCases } from "../../bpmn-source/test/parallel-scope-admission-fixture.ts";

/** Shared Program/Start inputs carry no expected reservation or successor values. */
export function reservationInputs(count: number, human: boolean, reverse: boolean): {
  program: SemanticProcessProgram; start: StartProcessStimulus;
} {
  const origin = (elementId: string) => ({ kind: SemanticOriginKind.BpmnElement, elementId } as const);
  const operations: SemanticProcessProgram["operations"] = [
    { kind: Op.Initiate, id: "start", origin: origin("Start"), output: "in" },
    { kind: Op.EnterParallelMultiInstanceScope, id: "enter", origin: origin("Checks"), input: "in",
      childEntry: "check", childScopeId: "body", normalOutput: "out", collectionName: "items", itemName: "item",
      completionBooleanName: null, bodyInputs: [{ target: "status", expression: { kind: Mapping.EnclosingVariable, name: "initial" } }] },
    human ? { kind: Op.AwaitUserTask, id: "check", origin: origin("Check"), input: "check", output: "done",
      task: { elementId: "Check", name: null } }
      : { kind: Op.AwaitEffect, id: "check", origin: origin("Check"), input: "check", output: "done",
        effect: { elementId: "Check", descriptor: { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "checkItem" },
          inputMappings: ["item", "status", "tenant"].map(name => ({ target: name, expression: { kind: Mapping.EnclosingVariable, name } })),
          outputMappings: [] }, bpmnErrorRoute: null },
    { kind: Op.CompleteParallelMultiInstanceScope, id: "complete", origin: origin("Checks"), entryOperationId: "enter" },
  ];
  return {
    program: { ...base, identity: { ...base.identity, semanticProfile: "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" },
      processId: "Applications", definitionScopes: [
        { id: "root", parentScopeId: null, originElementId: "Applications" },
        { id: "body", parentScopeId: "root", originElementId: "Checks" }],
      operations: reverse ? [...operations].reverse() : operations,
      operationScopes: operations.map(operation => ({ operationId: operation.id,
        scopeId: operation.id === "start" || operation.id === "enter" ? "root" : "body" })),
      controlPlaces: ["in", "check", "done", "out"].map(id => ({ id,
        origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: id } })),
      controlPlaceScopes: ["in", "check", "done", "out"].map(controlPlaceId => ({ controlPlaceId,
        scopeId: controlPlaceId === "check" || controlPlaceId === "done" ? "body" : "root" })),
    },
    start: { kind: StimulusKind.StartProcess, commandId: "start", processId: "Applications", instanceId: "checks",
      initialVariables: [
        { name: "initial", value: { kind: Value.Null } },
        { name: "item", value: { kind: Value.String, value: "wrong enclosing item" } },
        { name: "items", value: { kind: Value.StringList, value: Array.from({ length: count }, () => "same") } },
        { name: "status", value: { kind: Value.String, value: "wrong enclosing status" } },
        { name: "tenant", value: { kind: Value.String, value: "acme" } },
      ] },
  };
}

/** Private component wires retain the paired completion while a waiting branch prevents body retirement. */
export function controlClosureInputs(count: number, reverse: boolean): {
  program: SemanticProcessProgram; start: StartProcessStimulus;
} {
  const { program, start } = reservationInputs(count, true, false);
  const origin = (elementId: string) => ({ kind: SemanticOriginKind.BpmnElement, elementId } as const);
  const operations: SemanticProcessProgram["operations"] = [
    ...program.operations.filter(operation => operation.kind === Op.Initiate ||
      operation.kind === Op.EnterParallelMultiInstanceScope || operation.kind === Op.CompleteParallelMultiInstanceScope),
    { kind: Op.Duplicate, id: "fork", origin: origin("Fork"), input: "check", outputs: ["left", "right", "hold"] },
    { kind: Op.Synchronize, id: "join", origin: origin("Join"), inputs: ["left", "right"], output: "finished" },
    { kind: Op.ReachNoneEnd, id: "end", origin: origin("End"), input: "finished" },
    { kind: Op.AwaitUserTask, id: "hold", origin: origin("Hold"), input: "hold", output: "later",
      task: { elementId: "Hold", name: null } },
  ];
  const places = ["check", "finished", "hold", "in", "later", "left", "out", "right"];
  return { start, program: { ...program, operations: reverse ? [...operations].reverse() : operations,
    operationScopes: operations.map(operation => ({ operationId: operation.id,
      scopeId: operation.kind === Op.Initiate || operation.kind === Op.EnterParallelMultiInstanceScope ? "root" : "body" })),
    controlPlaces: places.map(id => ({ id, origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: id } })),
    controlPlaceScopes: places.map(controlPlaceId => ({ controlPlaceId,
      scopeId: controlPlaceId === "in" || controlPlaceId === "out" ? "root" : "body" })),
  } };
}

/** The existing invoice model supplies canonical whole-Process inputs for publication acceptance. */
export async function wholeModelReservationInputs() {
  const { lowerCheckedProcess } = await import(new URL("../../bpmn-source/dist/semantic-process-lowering.js", import.meta.url).href
  ) as typeof import("../../bpmn-source/src/semantic-process-lowering.ts");
  const baseline = (await parallelAdmissionCases())[0]!.source;
  const inputs: { program: SemanticProcessProgram; start: StartProcessStimulus; count: number }[] = [];
  for (const effectFirst of [false, true]) {
    const swap = (id: string) => effectFirst ? id === "Review" ? "Validate" : id === "Validate" ? "Review" : id : id;
    const source = { ...baseline, sequenceFlows: baseline.sequenceFlows.map(flow => ({ ...flow,
      sourceId: swap(flow.sourceId), targetId: swap(flow.targetId) })) };
    const lowered = lowerCheckedProcess(source);
    const program = { ...lowered, controlPlaces: [...lowered.controlPlaces].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0) };
    for (const count of [2, 16]) inputs.push({ program, count,
      start: { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId: "invoices",
        initialVariables: [{ name: "items", value: { kind: Value.StringList, value: Array.from({ length: count }, () => "same") } }] } });
  }
  return inputs;
}

export async function wholeModelStartClosureInputs() {
  const { lowerCheckedProcess } = await import(new URL("../../bpmn-source/dist/semantic-process-lowering.js", import.meta.url).href
  ) as typeof import("../../bpmn-source/src/semantic-process-lowering.ts");
  const admission = await parallelAdmissionCases();
  const selected = [
    { shape: "serial", source: admission[0]!.source },
    { shape: "fork-join", source: admission.find(({ expected, source }) => expected &&
      source.nodes.some(node => node.id === "Joined" && node.kind === CheckedNodeKind.ParallelGateway) &&
      ["Branch0", "Branch1", "Branch2"].every(id => source.nodes.some(node => node.id === id && node.kind === CheckedNodeKind.UserTask)))?.source },
    { shape: "separate-ends", source: admission.find(({ expected, source }) => expected &&
      source.nodes.some(node => node.id === "Review" && node.kind === CheckedNodeKind.ParallelGateway) &&
      ["End0", "End1"].every(id => source.nodes.some(node => node.id === id && node.kind === CheckedNodeKind.NoneEndEvent)))?.source },
  ] as const;
  const inputs: { shape: typeof selected[number]["shape"]; source: CheckedProcess; program: SemanticProcessProgram;
    start: StartProcessStimulus; count: number; reverse: boolean }[] = [];
  for (const selectedSource of selected) {
    assert.ok(selectedSource.source, `missing admitted ${selectedSource.shape} invoice source`);
    for (const reverse of [false, true]) {
      const source = reverse ? { ...selectedSource.source, nodes: [...selectedSource.source.nodes].reverse(),
        sequenceFlows: [...selectedSource.source.sequenceFlows].reverse() } : selectedSource.source;
      const lowered = lowerCheckedProcess(source);
      const program = { ...lowered, controlPlaces: [...lowered.controlPlaces].sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0) };
      for (const count of [0, 1, 2, 16]) inputs.push({ shape: selectedSource.shape, source, program, count, reverse,
        start: { kind: StimulusKind.StartProcess, commandId: "start", processId: source.processId, instanceId: "invoices",
          initialVariables: [{ name: "items", value: { kind: Value.StringList,
            value: Array.from({ length: count }, (_, index) => `invoice-${index + 1}`) } }] } });
    }
  }
  return inputs;
}
