import { SimpleBooleanExpressionLanguage, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { StartProcessStimulus, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";

export const instanceId = "Invoice_4711";
export const binding = (name: string, value: string | null): VariableBinding => ({ name,
  value: value === null ? { kind: VariableValueKind.Null } : { kind: VariableValueKind.String, value },
});
export const start = (initialVariables: readonly VariableBinding[]): StartProcessStimulus => ({
  kind: StimulusKind.StartProcess, commandId: "start", processId: "Invoice", instanceId, initialVariables,
});
export const complete = (elementId: string, submittedValues: readonly VariableBinding[] = [], activation = 1): Stimulus => ({
  kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}-${activation}`,
  taskId: { processInstanceId: instanceId, elementId, activation }, submittedValues,
});

function task(id: string, data?: readonly [string, string]): string {
  if (data === undefined) return `<bpmn:userTask id="${id}" name="${id}" />`;
  return `<bpmn:userTask id="${id}" name="${id}">
    <bpmn:ioSpecification id="${id}_io">
      <bpmn:dataInput id="${id}_in" /><bpmn:dataOutput id="${id}_out" />
      <bpmn:inputSet id="${id}_inputs"><bpmn:dataInputRefs>${id}_in</bpmn:dataInputRefs></bpmn:inputSet>
      <bpmn:outputSet id="${id}_outputs"><bpmn:dataOutputRefs>${id}_out</bpmn:dataOutputRefs></bpmn:outputSet>
    </bpmn:ioSpecification>
    <bpmn:dataInputAssociation id="${id}_read"><bpmn:sourceRef>${data[0]}</bpmn:sourceRef><bpmn:targetRef>${id}_in</bpmn:targetRef></bpmn:dataInputAssociation>
    <bpmn:dataOutputAssociation id="${id}_write"><bpmn:sourceRef>${id}_out</bpmn:sourceRef><bpmn:targetRef>${data[1]}</bpmn:targetRef></bpmn:dataOutputAssociation>
  </bpmn:userTask>`;
}
function flow(id: string, source: string, target: string, condition?: string): string {
  return `<bpmn:sequenceFlow id="${id}" sourceRef="${source}" targetRef="${target}">${condition === undefined ? "" :
    `<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${condition}</bpmn:conditionExpression>`}</bpmn:sequenceFlow>`;
}
function document(body: string): string {
  return `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definitions" targetNamespace="urn:invoice"
    expressionLanguage="${SimpleBooleanExpressionLanguage}">
    <bpmn:process id="Invoice" isExecutable="true">${body}</bpmn:process></bpmn:definitions>`;
}
function region(id: string, targets: readonly [string, string, string]): string {
  return `<bpmn:exclusiveGateway id="${id}" default="${id}_default" /><bpmn:exclusiveGateway id="${id}_merge" />` +
    flow(`${id}_approve`, id, targets[0], 'stringEquals(decision,"approved")') +
    flow(`${id}_reject`, id, targets[1], 'stringEquals(decision,"rejected")') +
    flow(`${id}_default`, id, targets[2]);
}

/** Neutral invoice sources for SPC-AVAILABLE-01 and SPC-ROUTE-01; no retained answer enters either target. */
export function invoiceSource(branchWrites?: readonly [boolean, boolean, boolean]): string {
  const branches = ["approve", "reject", "manual"] as const;
  return document(`<bpmn:property id="summary" /><bpmn:property id="decision" /><bpmn:property id="receipt" />
    <bpmn:startEvent id="start" /><bpmn:endEvent id="end" />
    ${branchWrites === undefined ? task("assess", ["summary", "decision"]) + flow("assessed", "assess", "route") : ""}
    ${region("route", branches)}
    ${branches.map((id, i) => task(id, branchWrites?.[i] ? ["summary", "decision"] : undefined) +
      flow(`${id}_done`, id, "route_merge")).join("")}
    ${task("archive", ["decision", "receipt"])}
    ${flow("begin", "start", branchWrites === undefined ? "assess" : "route")}
    ${flow("archive_route", "route_merge", "archive")}${flow("finish", "archive", "end")}`);
}

export const serialSource = document(`<bpmn:property id="summary" /><bpmn:property id="decision" /><bpmn:property id="receipt" />
  <bpmn:startEvent id="start" /><bpmn:endEvent id="end" />
  ${task("assess", ["summary", "decision"])}${task("archive", ["decision", "receipt"])}
  ${flow("begin", "start", "assess")}${flow("handoff", "assess", "archive")}${flow("finish", "archive", "end")}`);

export const eightStepSource = document(`<bpmn:startEvent id="start" /><bpmn:endEvent id="end" />${task("review")}
  ${["one", "two", "three"].map(id => region(id, [`${id}_merge`, `${id}_merge`, `${id}_merge`])).join("")}
  ${flow("begin", "start", "one")}${flow("next_one", "one_merge", "two")}${flow("next_two", "two_merge", "three")}
  ${flow("last", "three_merge", "review")}${flow("finish", "review", "end")}`);

export const nineStepSource = eightStepSource
  .replace('id="one_approve" sourceRef="one" targetRef="one_merge"', 'id="one_approve" sourceRef="one" targetRef="review"')
  .replace('id="last" sourceRef="three_merge" targetRef="review"', 'id="last" sourceRef="three_merge" targetRef="end"')
  .replace('id="finish" sourceRef="review" targetRef="end"', 'id="finish" sourceRef="review" targetRef="one_merge"');
