/**
 * Neutral fixtures for the serial portable-value handoff: the capsule's 12-node order, its revision and
 * the Program whose identifiers are parameters, so no test depends on a retained model's spelling.
 */
import {
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  BusinessValue,
  CompleteUserTaskInstanceStimulus,
  SemanticOperation,
  SemanticProcessProgram,
  StartProcessStimulus,
  VariableBinding,
  VariableValue,
} from "@bpmn-lean/semantic-core";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";
import { dataTask } from "./structured-process-composition-fixture.ts";

export const handoffProfile = SemanticProfileId.PortableBusinessValuesHandoff;

export const text = (value: string): BusinessValue => ({ kind: VariableValueKind.String, value });
export const integer = (value: number): BusinessValue => ({ kind: VariableValueKind.Integer, value });
export const truth = (value: boolean): BusinessValue => ({ kind: VariableValueKind.Boolean, value });
export const nothing: BusinessValue = { kind: VariableValueKind.Null };
export const decimal = (coefficient: string, scale: number): BusinessValue =>
  ({ kind: VariableValueKind.Decimal, coefficient, scale });
export const list = (...value: BusinessValue[]): BusinessValue => ({ kind: VariableValueKind.List, value });
export const map = (...entries: Array<readonly [string, BusinessValue]>): BusinessValue =>
  ({ kind: VariableValueKind.Map, value: entries.map(([name, value]) => ({ name, value })) });
export const stringList = (...value: string[]): VariableValue => ({ kind: VariableValueKind.StringList, value });

const line = (quantity: number, sku: string): BusinessValue =>
  map(["quantity", integer(quantity)], ["sku", text(sku)]);
const address = map(["city", text("Berlin")], ["line2", nothing]);

/** Twelve value nodes and container depth three: two equal items, a present-Null field and a scale-two amount. */
export const order: BusinessValue = map(
  ["address", address], ["items", list(line(1, "A"), line(1, "A"))], ["total", decimal("12345", 2)]);

/** Ordered unequal items and a negative amount: deduplication, sorting and unsigned arithmetic all change it. */
export const revision: BusinessValue = map(
  ["address", address], ["items", list(line(2, "B"), line(1, "A"))], ["total", decimal("-125", 2)]);

export const emptyMap: BusinessValue = map();

export type HandoffNames = Readonly<{
  processId: string;
  start: string;
  end: string;
  first: string;
  second: string;
  pin: string;
  pmid: string;
  pout: string;
}>;

export const reviewArchive: HandoffNames = {
  processId: "Process_OrderHandoff", start: "Start", end: "End",
  first: "Review", second: "Archive", pin: "Order", pmid: "ReviewedOrder", pout: "ArchivedOrder",
};

export const renamed: HandoffNames = {
  processId: "Proc_9", start: "S0", end: "Z9", first: "TaskB", second: "TaskA", pin: "p3", pmid: "p1", pout: "p2",
};

export function handoffOperations(names: HandoffNames = reviewArchive): SemanticOperation[] {
  return [
    { ...operationBase(names.start), kind: SemanticOperationKind.Initiate, output: `place:Flow_${names.start}_${names.first}` },
    dataTask(names.first, `Flow_${names.start}_${names.first}`, `Flow_${names.first}_${names.second}`, names.pin, names.pmid),
    dataTask(names.second, `Flow_${names.first}_${names.second}`, `Flow_${names.second}_${names.end}`, names.pmid, names.pout),
    { ...operationBase(names.end), kind: SemanticOperationKind.ReachNoneEnd, input: `place:Flow_${names.second}_${names.end}` },
  ];
}

export function handoffProgramFrom(operations: readonly SemanticOperation[], names: HandoffNames = reviewArchive,
  profile: string = handoffProfile): SemanticProcessProgram {
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: profile,
      sourceId: "order-handoff", sourceOverlay: null, sourceSha256: "0".repeat(64),
    },
    processId: names.processId,
    controlPlaces: [`Flow_${names.start}_${names.first}`, `Flow_${names.first}_${names.second}`, `Flow_${names.second}_${names.end}`]
      .sort().map(controlPlace),
    operations,
  });
}

export function handoffProgram(names: HandoffNames = reviewArchive, profile: string = handoffProfile): SemanticProcessProgram {
  return handoffProgramFrom(handoffOperations(names), names, profile);
}

export const instanceId = "Order_4711";

export const binding = (name: string, value: VariableValue): VariableBinding => ({ name, value });

export const start = (value: VariableValue, names: HandoffNames = reviewArchive,
  name: string = names.pin): StartProcessStimulus => ({
  kind: StimulusKind.StartProcess, commandId: "start", processId: names.processId, instanceId,
  initialVariables: [binding(name, value)],
});

/** Completion binding named by the task's DataOutput, which is never the Process Property. */
export function completion(elementId: string, submitted: readonly VariableBinding[], activation = 1): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}-${activation}`,
    taskId: { processInstanceId: instanceId, elementId, activation }, submittedValues: submitted,
  };
}

export const output = (elementId: string, value: VariableValue): VariableBinding => binding(`${elementId}_Output`, value);
