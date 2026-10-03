import {
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticOriginKind,
  SimpleBooleanExpressionKind,
} from "@bpmn-lean/semantic-core";
import type { SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";

export const compositionProfile = "bpmn-2.0.2-structured-process-composition-draft";
export const compositionProcessId = "Process_InvoiceHandoff";

export function dataTask(id: string, input: string, output: string,
  sourcePropertyId: string, targetPropertyId: string): SemanticOperation {
  return {
    ...operationBase(id),
    kind: SemanticOperationKind.AwaitDataInputOutputUserTask,
    input: `place:${input}`,
    output: `place:${output}`,
    task: { elementId: id, name: null },
    directInput: {
      associationId: `${id}_InputAssociation`, source: { kind: "property", propertyId: sourcePropertyId },
      targetDataInputId: `${id}_Input`, targetDataInputName: null,
    },
    directOutput: {
      associationId: `${id}_OutputAssociation`, target: { kind: "property", propertyId: targetPropertyId },
      sourceDataOutputId: `${id}_Output`, sourceDataOutputName: null,
    },
  };
}

export function compositionProgram(operations: readonly SemanticOperation[],
  flows: readonly string[]): SemanticProcessProgram {
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: compositionProfile,
      sourceId: "invoice-handoff", sourceOverlay: null, sourceSha256: "0".repeat(64),
    },
    processId: compositionProcessId,
    controlPlaces: [...flows].sort().map(controlPlace),
    operations,
  });
}

// SPC-INPUT-01 separates the submitted DataOutput name from the next task's Process input.
export const serialHandoff = compositionProgram([
  { ...operationBase("Start"), kind: SemanticOperationKind.Initiate, output: "place:Start_Assess" },
  dataTask("Assess", "Start_Assess", "Assess_Archive", "Invoice", "Decision"),
  dataTask("Archive", "Assess_Archive", "Archive_Notify", "Decision", "Receipt"),
  { ...operationBase("Notify"), kind: SemanticOperationKind.AwaitUserTask,
    input: "place:Archive_Notify", output: "place:Notify_End", task: { elementId: "Notify", name: null } },
  { ...operationBase("End"), kind: SemanticOperationKind.ReachNoneEnd, input: "place:Notify_End" },
], ["Start_Assess", "Assess_Archive", "Archive_Notify", "Notify_End"]);

export function choice(id: string, input: string, outputs: readonly [string, string, string], variable = "Decision"): SemanticOperation {
  return {
    ...operationBase(id), kind: SemanticOperationKind.Choose, input: `place:${input}`,
    candidates: [
      { output: `place:${outputs[0]}`, origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: outputs[0] },
        condition: { kind: SimpleBooleanExpressionKind.StringEquals, variable, value: "approved" } },
      { output: `place:${outputs[1]}`, origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: outputs[1] },
        condition: { kind: SimpleBooleanExpressionKind.StringEquals, variable, value: "rejected" } },
    ],
    defaultOutput: `place:${outputs[2]}`,
    defaultOrigin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: outputs[2] },
  };
}

export function routedHandoff(branchWriters?: readonly [boolean, boolean, boolean]): SemanticProcessProgram {
  const branches = ["Approve", "Reject", "Manual"];
  const operations: SemanticOperation[] = [
    { ...operationBase("Start"), kind: SemanticOperationKind.Initiate,
      output: branchWriters === undefined ? "place:Start_Assess" : "place:Assess_Choice" },
    ...(branchWriters === undefined ? [dataTask("Assess", "Start_Assess", "Assess_Choice", "Invoice", "Decision")] : []),
    choice("Choice", "Assess_Choice", ["Choice_Approve", "Choice_Reject", "Choice_Manual"], branchWriters === undefined ? "Decision" : "Route"),
    ...branches.map((id, index): SemanticOperation => branchWriters?.[index] === true
      ? dataTask(id, `Choice_${id}`, `${id}_Merge`, "Invoice", "Decision")
      : { ...operationBase(id), kind: SemanticOperationKind.AwaitUserTask, input: `place:Choice_${id}`,
        output: `place:${id}_Merge`, task: { elementId: id, name: null } }),
    { ...operationBase("Merge"), kind: SemanticOperationKind.MergeExclusive,
      inputs: ["place:Approve_Merge", "place:Manual_Merge", "place:Reject_Merge"], output: "place:Merge_Archive" },
    dataTask("Archive", "Merge_Archive", "Archive_End", "Decision", "Receipt"),
    { ...operationBase("End"), kind: SemanticOperationKind.ReachNoneEnd, input: "place:Archive_End" },
  ];
  return compositionProgram(operations, [
    ...(branchWriters === undefined ? ["Start_Assess"] : []), "Assess_Choice", "Merge_Archive", "Archive_End",
    ...branches.flatMap((id) => [`Choice_${id}`, `${id}_Merge`]),
  ]);
}
