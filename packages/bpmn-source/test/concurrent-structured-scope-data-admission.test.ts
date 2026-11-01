/**
 * CSSD-ADMIT-01 and CSSD-ROUTE-01 boundary witnesses for the nested scope-data profile's concurrent Programs, driven
 * through the exact-bytes source path and the core's checked-graph and Program gates. The oracle is the "Required,
 * optional and excluded scope" account of the concurrent structured scope data proposal. Every refusal is paired with
 * an admitted control that differs in exactly one fact, so a gate that refused everything could not pass.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { BpmnCompilationStatus, BpmnSourceDiagnosticCode, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  concurrentStructuredScopeDataProgram, isWellFormedSemanticProcessProgram, structuredScopeDataCheckedAnalysis,
  structuredScopeDataProgramAnalysis,
} from "@bpmn-lean/semantic-core";
import { embedded, handlerTask, literalModel, processOf, request } from "./nested-scope-data-source-fixture.ts";
import type { Activity } from "./nested-scope-data-source-fixture.ts";

const userTask = (id: string): Activity => ({ id, xml: `<userTask id="${id}"/>` });

/** `${id}` holds a body that forks into `branches` and closes them with `closer`, a Parallel join or an Exclusive merge. */
function forkingBody(id: string, branches: readonly Activity[], closer: "join" | "merge", after: readonly Activity[]): Activity {
  const close = closer === "join" ? `<parallelGateway id="${id}j"/>` : `<exclusiveGateway id="${id}j"/>`;
  const tail = [...after.map(({ id: next }) => next), `${id}z`];
  const edges = [[`${id}a`, `${id}m`], ...branches.flatMap(({ id: branch }) => [[`${id}m`, branch], [branch, `${id}j`]]),
    [`${id}j`, tail[0]!], ...tail.slice(1).map((next, index) => [tail[index]!, next])];
  return {
    id, xml: `<subProcess id="${id}"><startEvent id="${id}a"/><parallelGateway id="${id}m"/>${
      branches.map(({ xml }) => xml).join("")}${close}${after.map(({ xml }) => xml).join("")}<endEvent id="${id}z"/>${
      edges.map(([from, to], index) => `<sequenceFlow id="${id}f${index}" sourceRef="${from}" targetRef="${to}"/>`).join("")
    }</subProcess>`,
  };
}

/** A root body that forks straight into a Sub-Process and a Service Task and joins them. */
const rootForkModel = (): string =>
  `<?xml version="1.0" encoding="UTF-8"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" ` +
  `xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="D" targetNamespace="urn:nested-witness">` +
  `<process id="P" isExecutable="true"><startEvent id="Ra"/><parallelGateway id="Rm"/>${
    embedded("S1", [], [], [handlerTask("S1t")]).xml}${handlerTask("Rt").xml}<parallelGateway id="Rj"/><endEvent id="Rz"/>${
    [["Ra", "Rm"], ["Rm", "S1"], ["Rm", "Rt"], ["S1", "Rj"], ["Rt", "Rj"], ["Rj", "Rz"]].map(([from, to], index) =>
      `<sequenceFlow id="Rf${index}" sourceRef="${from}" targetRef="${to}"/>`).join("")}</process></definitions>`;

async function compileAccepted(label: string, xml: string) {
  const result = await compileBpmnToSemanticProcess(request(xml));
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  return result;
}

async function assertRefused(label: string, xml: string): Promise<void> {
  const result = await compileBpmnToSemanticProcess(request(xml));
  assert.equal(result.status, BpmnCompilationStatus.Rejected, label);
  assert.deepEqual(result.diagnostics.map(({ code }) => code), [BpmnSourceDiagnosticCode.UnsupportedModel], label);
}

const joinedBody = forkingBody("S1", [handlerTask("S1s1"), handlerTask("S1s2")], "join", []);

test("CSSD-ADMIT-01 admits a Parallel fork and join inside a Sub-Process body and routes the Program as concurrent", async () => {
  const { checkedProcess, semanticProcess } = await compileAccepted("joined body", processOf([joinedBody]));
  assert.notEqual(structuredScopeDataCheckedAnalysis(checkedProcess), null);
  assert.notEqual(structuredScopeDataProgramAnalysis(semanticProcess), null);
  assert.equal(isWellFormedSemanticProcessProgram(semanticProcess), true);
  assert.equal(concurrentStructuredScopeDataProgram(semanticProcess), true);
});

test("CSSD-ROUTE-01 keeps a serial Program of the profile on its serial account", async () => {
  const { semanticProcess } = await compileAccepted("serial body", literalModel("x"));
  assert.equal(concurrentStructuredScopeDataProgram(semanticProcess), false);
  assert.notEqual(structuredScopeDataProgramAnalysis(semanticProcess), null);
});

test("CSSD-ADMIT-01 refuses a fork in the Process root body while the same fork inside a Sub-Process is admitted", async () => {
  await compileAccepted("fork in a body", processOf([joinedBody]));
  await assertRefused("fork in the root body", rootForkModel());
});

test("CSSD-ADMIT-01 refuses a merge region while the same branches closed by a Parallel join are admitted", async () => {
  const target = embedded("M", [], [], [userTask("Mt")]);
  // Three branches, because graph arity already refuses a two-way Exclusive merge outside the embedded profile.
  const branches = [userTask("u1"), userTask("u2"), userTask("u3")];
  await compileAccepted("joined branches", processOf([forkingBody("S1", branches, "join", [target])]));
  await assertRefused("merged branches", processOf([forkingBody("S1", branches, "merge", [target])]));
});
