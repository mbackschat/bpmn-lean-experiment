import { createHash } from "node:crypto";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";
import type { CompileBpmnToSemanticProcessRequest } from "@bpmn-lean/bpmn-source";

/** Builders for the nested scope-data admission witnesses; each model differs from its control in exactly one fact. */
export const profile = SemanticProfileId.NestedEmbeddedScopeData;
export const effectProtocol = "urn:bpmn-lean:effect-protocol:activity-v1";

const overlayDocument = {
  kind: "bpmnSourceOverlay", id: "nested-witness-handlers", semanticProfile: profile, inertAttributes: [],
  effectBindings: [{ source: { implementation: effectProtocol, delegateExpression: "${handler}" },
    descriptor: { protocol: effectProtocol, operation: "handler" } }],
} as const satisfies Readonly<Record<string, unknown>>;

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** The exact-bytes compilation request for `xml` against the one handler overlay every witness model uses. */
export function request(xml: string): CompileBpmnToSemanticProcessRequest {
  const overlayBytes = new TextEncoder().encode(JSON.stringify(overlayDocument));
  return {
    bytes: new TextEncoder().encode(xml), sourceId: "nested-witness", expectedSha256: undefined, semanticProfile: profile,
    sourceOverlay: { id: overlayDocument.id, sha256: sha256(overlayBytes), bytes: overlayBytes },
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 },
  };
}

/** A `camunda:inputOutput` declaration: a local name and its source expression. */
export type Local = readonly [name: string, expression: string];

/** One element of a serial chain: its id and its BPMN XML. */
export type Activity = Readonly<{ id: string; xml: string }>;

/** Start, the activities in order, and End, joined by sequence flows whose ids carry the scope's `prefix`. */
function serial(prefix: string, activities: readonly Activity[]): string {
  const ids = [`${prefix}a`, ...activities.map(({ id }) => id), `${prefix}z`];
  const flows = ids.slice(1).map((target, index) =>
    `<sequenceFlow id="${prefix}f${index}" sourceRef="${ids[index]}" targetRef="${target}"/>`);
  return `<startEvent id="${prefix}a"/>${activities.map(({ xml }) => xml).join("")}<endEvent id="${prefix}z"/>${flows.join("")}`;
}

export const handlerTask = (id: string): Activity => ({
  id, xml: `<serviceTask id="${id}" implementation="${effectProtocol}" camunda:delegateExpression="\${handler}" camunda:asyncBefore="true"/>`,
});

const declarations = (inputs: readonly Local[], outputs: readonly Local[]): string =>
  `<extensionElements><camunda:inputOutput>${
    inputs.map(([name, expression]) => `<camunda:inputParameter name="${name}">${expression}</camunda:inputParameter>`).join("")}${
    outputs.map(([name, expression]) => `<camunda:outputParameter name="${name}">${expression}</camunda:outputParameter>`).join("")
  }</camunda:inputOutput></extensionElements>`;

/** An ordinary embedded Sub-Process whose serial body is `activities` and whose locals are `inputs` and `outputs`. */
export const embedded = (id: string, inputs: readonly Local[], outputs: readonly Local[],
  activities: readonly Activity[]): Activity => ({
  id, xml: `<subProcess id="${id}">${declarations(inputs, outputs)}${serial(id, activities)}</subProcess>`,
});

/** A Sub-Process whose body forks into two Service Tasks and joins again; the profile admits no Parallel Gateway. */
export const forkingSubProcess = (id: string): Activity => ({
  id, xml: `<subProcess id="${id}">${declarations([["a", "x"]], [])}<startEvent id="${id}a"/><parallelGateway id="${id}m"/>${
    handlerTask(`${id}s1`).xml}${handlerTask(`${id}s2`).xml}<parallelGateway id="${id}j"/><endEvent id="${id}z"/>${
    [["a", "m"], ["m", "s1"], ["m", "s2"], ["s1", "j"], ["s2", "j"], ["j", "z"]].map(([from, to], index) =>
      `<sequenceFlow id="${id}f${index}" sourceRef="${id}${from}" targetRef="${id}${to}"/>`).join("")}</subProcess>`,
});

/** A complete executable Process whose root serial chain is `activities`. */
export const processOf = (activities: readonly Activity[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" ` +
  `xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="D" targetNamespace="urn:nested-witness">` +
  `<process id="P" isExecutable="true">${serial("R", activities)}</process></definitions>`;

/** `count` sibling Sub-Processes in the root chain, each at depth one with its own local input: `count + 1` scopes. */
export const siblingSubProcesses = (count: number): string => processOf(
  Array.from({ length: count }, (_, index) =>
    embedded(`S${index + 1}`, [[`v${index + 1}`, "x"]], [], [handlerTask(`S${index + 1}t`)])));

/** One Sub-Process chain nested `depth` levels below the root, the innermost holding the Service Task. */
export const nestedSubProcesses = (depth: number): string => {
  const level = (index: number): Activity => embedded(`D${index}`, [["a", "x"]], [],
    [index === depth ? handlerTask("T") : level(index + 1)]);
  return processOf([level(1)]);
};

/** An inner Sub-Process, declaring local `a`, inside an outer one declaring `parentName`; the inner publishes `source`. */
export const outputModel = (source: string): string => processOf([
  embedded("Outer", [["parentName", "x"]], [], [embedded("Inner", [["a", "x"]], [["b", source]], [handlerTask("T")])]),
]);

/** One Sub-Process whose single local input is the literal `value`. */
export const literalModel = (value: string): string => processOf([embedded("S1", [["a", value]], [], [handlerTask("T")])]);

export const nestedAdmissionRefusal = "The checked graph does not satisfy nested scope-data admission.";
