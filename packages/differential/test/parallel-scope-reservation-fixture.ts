import { SemanticOperationKind as Op, SemanticOriginKind, VariableValueKind as Value,
  MappingExpressionKind as Mapping, StimulusKind } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, StartProcessStimulus } from "@bpmn-lean/semantic-core";
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
