/**
 * Neutral fixtures for the structured effect-data profile: the credit-decision chain, its handler overlay and the
 * assessment value whose shape defeats deduplication, rounding, flattening and null-dropping implementations.
 */
import { createHash } from "node:crypto";
import { compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { SemanticProfileId, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { BusinessValue } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

export const effectDataProfile = SemanticProfileId.PortableBusinessEffectData;
export const protocol = "urn:bpmn-lean:effect-protocol:activity-v1";

export const text = (value: string): BusinessValue => ({ kind: VariableValueKind.String, value });
export const integer = (value: number): BusinessValue => ({ kind: VariableValueKind.Integer, value });
export const truth = (value: boolean): BusinessValue => ({ kind: VariableValueKind.Boolean, value });
// Frozen: a shared mutable constant would let an aliasing test corrupt every later fixture.
export const nothing: BusinessValue = Object.freeze({ kind: VariableValueKind.Null });
export const decimal = (coefficient: string, scale: number): BusinessValue =>
  ({ kind: VariableValueKind.Decimal, coefficient, scale });
export const list = (...value: BusinessValue[]): BusinessValue => ({ kind: VariableValueKind.List, value });
export const map = (...entries: Array<readonly [string, BusinessValue]>): BusinessValue =>
  ({ kind: VariableValueKind.Map, value: entries.map(([name, value]) => ({ name, value })) });

/** Repeated equal members, a mixed-type tail, a negative scale-two amount, a nested Map, a Boolean and a present Null. */
export function assessment(): BusinessValue {
  return map(
    ["amount", decimal("-123455", 2)],
    ["entries", list(map(["a", integer(1)]), map(["a", integer(1)]), text("x"))],
    ["nested", map(["ok", truth(true)])],
    ["note", { kind: VariableValueKind.Null }],
  );
}

export type CreditNames = Readonly<{
  processId: string; start: string; assess: string; notify: string; end: string;
  applicant: string; assessed: string; receipt: string; assessHandler: string; notifyHandler: string;
}>;

export const creditNames: CreditNames = {
  processId: "Process_CreditDecision", start: "Start", assess: "AssessCredit", notify: "NotifyApplicant", end: "End",
  applicant: "applicantRef", assessed: "assessment", receipt: "receipt",
  assessHandler: "assessCredit", notifyHandler: "notifyApplicant",
};

export const renamedCredit: CreditNames = {
  processId: "P9", start: "S", assess: "T2", notify: "T1", end: "E",
  applicant: "p3", assessed: "p1", receipt: "p2", assessHandler: "hB", notifyHandler: "hA",
};

type Mapping = Readonly<{ kind: "input" | "output"; name: string; body: string }>;

function serviceTask(id: string, handler: string, mappings: readonly Mapping[]): string {
  const parameters = mappings.map(({ kind, name, body }) =>
    `<camunda:${kind}Parameter name="${name}">${body}</camunda:${kind}Parameter>`).join("");
  const io = mappings.length === 0 ? "" : `<extensionElements><camunda:inputOutput>${parameters}</camunda:inputOutput></extensionElements>`;
  return `<serviceTask id="${id}" implementation="${protocol}" camunda:asyncBefore="true" camunda:delegateExpression="\${${handler}}">${io}</serviceTask>`;
}

/** Start, then `tasks` as a serial chain, then End; the tasks are given as XML so a test can swap one element kind. */
export function chainXml(names: CreditNames, tasks: ReadonlyArray<Readonly<{ id: string; xml: string }>>, reordered = false): string {
  const ids = [names.start, ...tasks.map(({ id }) => id), names.end];
  const flows = ids.slice(1).map((id, index) => `<sequenceFlow id="Flow_${index}" sourceRef="${ids[index]}" targetRef="${id}"/>`);
  const elements = [`<startEvent id="${names.start}"/>`, ...tasks.map(({ xml }) => xml), `<endEvent id="${names.end}"/>`, ...flows];
  // Declaration order carries no meaning: the flows, not document order, define the chain.
  return `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" targetNamespace="urn:credit">
    <process id="${names.processId}" isExecutable="true">${(reordered ? elements.reverse() : elements).join("")}</process></definitions>`;
}

export function creditTasks(names: CreditNames, assessInputs: readonly Mapping[] = [{ kind: "input", name: "applicant", body: `\${${names.applicant}}` }]) {
  return [
    { id: names.assess, xml: serviceTask(names.assess, names.assessHandler, [...assessInputs, { kind: "output", name: names.assessed, body: `\${${names.assessed}}` }]) },
    { id: names.notify, xml: serviceTask(names.notify, names.notifyHandler, [
      { kind: "input", name: "assessment", body: `\${${names.assessed}}` },
      { kind: "output", name: names.receipt, body: `\${${names.receipt}}` },
    ]) },
  ] as const;
}

export const creditXml = (names: CreditNames = creditNames, reordered = false) => chainXml(names, creditTasks(names), reordered);

export function overlay(profile: string, handlers: readonly string[]) {
  const id = "credit-handlers";
  const bytes = new TextEncoder().encode(JSON.stringify({
    kind: "bpmnSourceOverlay", id, semanticProfile: profile,
    effectBindings: [...handlers].sort().map(handler => ({
      source: { implementation: protocol, delegateExpression: `\${${handler}}` },
      descriptor: { protocol, operation: handler },
    })),
    inertAttributes: [],
  }));
  return { id, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function compileCredit(xml: string, names: CreditNames = creditNames, profile: string = effectDataProfile,
  handlers: readonly string[] = [names.assessHandler, names.notifyHandler]) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "credit-decision", expectedSha256: undefined,
    semanticProfile: profile, sourceOverlay: overlay(profile, handlers), limits: semanticProcessTestLimits,
  });
}
