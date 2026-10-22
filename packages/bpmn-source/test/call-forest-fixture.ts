/**
 * Small Call forests for CALLN-ADMIT-01 witnesses: each Process body is written as its vertices and flows, so a
 * refused variant and its admitted control differ in exactly the fact the witness names.
 */

/** A body vertex: a BPMN element tag with its attributes, or an embedded Sub-Process with its own body. */
export type Vertex = string | Readonly<{ subProcess: Body }>;
export type Body = Readonly<{ vertices: Readonly<Record<string, Vertex>>; flows: ReadonlyArray<readonly [string, string]> }>;

function bodyXml(prefix: string, body: Body): string {
  const id = (key: string) => `${prefix}_${key}`;
  const flowId = ([from, to]: readonly [string, string]) => `${prefix}_${from}To${to}`;
  const elements = Object.entries(body.vertices).map(([key, vertex]) => {
    const incoming = body.flows.filter(([, to]) => to === key).map(flow => `<bpmn:incoming>${flowId(flow)}</bpmn:incoming>`);
    const outgoing = body.flows.filter(([from]) => from === key).map(flow => `<bpmn:outgoing>${flowId(flow)}</bpmn:outgoing>`);
    const [tag, attributes] = typeof vertex === "string"
      ? [vertex.split(" ")[0]!, vertex.split(" ").slice(1).join(" ")] : ["subProcess", ""];
    const inner = typeof vertex === "string" ? "" : bodyXml(id(key), vertex.subProcess);
    return `<bpmn:${tag} id="${id(key)}" name="${key}" ${attributes}>${incoming.join("")}${outgoing.join("")}${inner}</bpmn:${tag}>`;
  });
  const flows = body.flows.map(flow =>
    `<bpmn:sequenceFlow id="${flowId(flow)}" sourceRef="${id(flow[0])}" targetRef="${id(flow[1])}" />`);
  return [...elements, ...flows].join("\n");
}

/** A Definitions document whose first Process is the caller; Process ids are their keys. */
export function forest(processes: Readonly<Record<string, Body>>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_Forest" targetNamespace="https://bpmn-lean.local/scenarios/repeated-nested-concurrent-calls">
${Object.entries(processes).map(([id, body]) =>
  `<bpmn:process id="${id}" isExecutable="true">\n${bodyXml(id, body)}\n</bpmn:process>`).join("\n")}
</bpmn:definitions>`;
}

/** None Start, the given vertices in order, None End; `T…` keys are User Tasks, a Process id names a Call. */
export function serial(...steps: readonly string[]): Body {
  const vertices: Record<string, Vertex> = { S: "startEvent" };
  steps.forEach((step, index) => {
    vertices[`V${index}`] = step.startsWith("P") ? `callActivity calledElement="${step}"` : "userTask";
  });
  vertices.E = "endEvent";
  const keys = Object.keys(vertices);
  return { vertices, flows: keys.slice(1).map((key, index) => [keys[index]!, key] as const) };
}

/** None Start, a Parallel fork into the given serial branches, their join, None End. */
export function forked(...branches: ReadonlyArray<readonly string[]>): Body {
  const vertices: Record<string, Vertex> = {
    S: "startEvent", F: 'parallelGateway gatewayDirection="Diverging"', J: 'parallelGateway gatewayDirection="Converging"',
    E: "endEvent",
  };
  const flows: Array<readonly [string, string]> = [["S", "F"], ["J", "E"]];
  branches.forEach((branch, b) => {
    const keys = branch.map((step, index) => {
      const key = `B${b}V${index}`;
      vertices[key] = step.startsWith("P") ? `callActivity calledElement="${step}"` : "userTask";
      return key;
    });
    ["F", ...keys, "J"].slice(1).forEach((key, index) => flows.push([["F", ...keys][index]!, key]));
  });
  return { vertices, flows };
}
