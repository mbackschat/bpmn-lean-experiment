import {
  InternalSchedulingMode, SemanticOperationKind, SemanticProfileId,
  SemanticProcessCompilerId, SemanticProcessKind, StimulusKind, compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram, rootScopeOccurrence } from "./root-scope-fixture.ts";

const { internalMergeInputAlternative, internalOperationAlternative } = await import(
  new URL("../dist/internal-transition-alternative.js", import.meta.url).href
) as typeof import("../src/internal-transition-alternative.ts");

export const program = {
  ...rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: { compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: SemanticProfileId.UserTaskCycle, sourceId: "scheduled-merge-frontier",
      sourceOverlay: null, sourceSha256: "9".repeat(64) },
    processId: "Process_ScheduledMerge",
    controlPlaces: ["A", "B", "Fork", "Output"].map(controlPlace),
    operations: [
      { ...operationBase("Start"), kind: SemanticOperationKind.Initiate, output: "place:Fork" },
      { ...operationBase("Fork"), kind: SemanticOperationKind.Duplicate,
        input: "place:Fork", outputs: ["place:A", "place:B"] },
      { ...operationBase("Merge"), kind: SemanticOperationKind.MergeExclusive,
        inputs: ["place:A", "place:B"], output: "place:Output" },
      { ...operationBase("End"), kind: SemanticOperationKind.ReachNoneEnd, input: "place:Output" },
    ],
  }),
  internalSchedulingMode: InternalSchedulingMode.RequireChoiceSchedule,
};
export const instanceId = "Instance_ScheduledMerge";
export const owner = rootScopeOccurrence(program.processId, instanceId);
export const start = { kind: StimulusKind.StartProcess, commandId: "start-scheduled-merge",
  processId: program.processId, instanceId, initialVariables: [] } as const;
export const a = internalMergeInputAlternative("operation:Merge", owner, "place:A");
export const b = internalMergeInputAlternative("operation:Merge", owner, "place:B");
export const end = internalOperationAlternative("operation:End");
export const first = { ordinal: 0, alternatives: [a, b], selected: a };
export const second = { ordinal: 1, alternatives: [end, b], selected: end };

export const sideProgram = { ...rootScopedProgram({ ...program,
  controlPlaces: [...program.controlPlaces, ...["SideInput", "SideOutput"].map(controlPlace)]
    .sort((left, right) => compareCanonicalStrings(left.id, right.id)),
  operations: [...program.operations.map((operation) => operation.kind === SemanticOperationKind.Duplicate
    ? { ...operation, outputs: [...operation.outputs, "place:SideInput"] } : operation),
    { ...operationBase("Side"), kind: SemanticOperationKind.AwaitUserTask, input: "place:SideInput",
      output: "place:SideOutput", task: { elementId: "Side", name: null } },
    { ...operationBase("SideEnd"), kind: SemanticOperationKind.ReachNoneEnd, input: "place:SideOutput" }],
}), internalSchedulingMode: InternalSchedulingMode.RequireChoiceSchedule };
