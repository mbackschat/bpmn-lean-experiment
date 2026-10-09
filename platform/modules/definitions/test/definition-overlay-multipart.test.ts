import assert from "node:assert/strict";
import { test } from "node:test";
import { DefinitionHttpRoutes, DefinitionDeploymentService, DefinitionStartService, ConfirmedProcessInstancePublicationService, InMemoryConfirmedProcessInstanceRepository } from "@bpmn-lean/platform-definitions";

const endpoint = "http://test/api/v1/definitions?sourceId=source&semanticProfile=profile";
const source = new TextEncoder().encode("<bpmn/>");
const overlay = new TextEncoder().encode("{}");
const refuseServiceEntry = async (): Promise<never> => { assert.fail("transport refusal must precede service entry"); };
const repository = { allocateNext: refuseServiceEntry, listLatest: refuseServiceEntry, listVersions: refuseServiceEntry, get: refuseServiceEntry };
const artifacts = { put: refuseServiceEntry, get: refuseServiceEntry };
const publication = new ConfirmedProcessInstancePublicationService({ repository: new InMemoryConfirmedProcessInstanceRepository(), operate: { recordConfirmedProcessInstance: refuseServiceEntry }, work: { recordConfirmedProcessInstance: refuseServiceEntry } });
const deployment = new DefinitionDeploymentService({ compileDefinition: refuseServiceEntry }, artifacts, repository);
const start = new DefinitionStartService({ prepareDefinitionVersion: refuseServiceEntry, startPreparedDefinitionVersion: refuseServiceEntry, startDefinitionVersion: refuseServiceEntry, describeDefinitionVersionStart: refuseServiceEntry }, artifacts, repository, () => { assert.fail("transport refusal must precede identity allocation"); }, publication);
const routes = new DefinitionHttpRoutes(deployment, start, { maxSourceBytes: 64 });

function form(): FormData {
  const result = new FormData();
  result.append("bpmn", new Blob([source], { type: "application/xml" }), "source.bpmn");
  result.append("sourceOverlay", new Blob([overlay], { type: "application/json" }), "source.json");
  result.append("sourceOverlayId", "selected-🚀");
  result.append("sourceOverlaySha256", "a".repeat(64));
  return result;
}

for (const [name, mutate, status] of [
  ["partial overlay file", (body: FormData) => body.delete("sourceOverlay"), 400],
  ["partial overlay ID", (body: FormData) => body.delete("sourceOverlayId"), 400],
  ["partial overlay digest", (body: FormData) => body.delete("sourceOverlaySha256"), 400],
  ["missing BPMN file", (body: FormData) => body.delete("bpmn"), 400],
  ["text BPMN part", (body: FormData) => body.set("bpmn", "<bpmn/>"), 400],
  ["text overlay part", (body: FormData) => body.set("sourceOverlay", "{}"), 400],
  ["file ID part", (body: FormData) => body.set("sourceOverlayId", new Blob(["id"]), "id"), 400],
  ["unknown part", (body: FormData) => body.set("other", "smuggled"), 400],
  ["duplicate BPMN", (body: FormData) => body.append("bpmn", new Blob([source], { type: "application/xml" }), "duplicate"), 400],
  ["duplicate overlay", (body: FormData) => body.append("sourceOverlay", new Blob([overlay], { type: "application/json" }), "duplicate"), 400],
  ["duplicate ID", (body: FormData) => body.append("sourceOverlayId", "duplicate"), 400],
  ["duplicate digest", (body: FormData) => body.append("sourceOverlaySha256", "a".repeat(64)), 400],
  ["nested multipart", (body: FormData) => body.set("sourceOverlay", new Blob([overlay], { type: "multipart/form-data; boundary=nested" }), "nested"), 415],
  ["wrong BPMN media", (body: FormData) => body.set("bpmn", new Blob([source], { type: "application/json" }), "source"), 415],
  ["wrong overlay media", (body: FormData) => body.set("sourceOverlay", new Blob([overlay], { type: "text/json" }), "overlay"), 415],
  ["empty BPMN", (body: FormData) => body.set("bpmn", new Blob([], { type: "application/xml" }), "empty"), 400],
  ["empty overlay", (body: FormData) => body.set("sourceOverlay", new Blob([], { type: "application/json" }), "empty"), 400],
  ["empty ID", (body: FormData) => body.set("sourceOverlayId", ""), 400],
  ["oversized Unicode ID", (body: FormData) => body.set("sourceOverlayId", "🚀".repeat(257)), 400],
  ["uppercase digest", (body: FormData) => body.set("sourceOverlaySha256", "A".repeat(64)), 400],
  ["short digest", (body: FormData) => body.set("sourceOverlaySha256", "a".repeat(63)), 400],
  ["long digest", (body: FormData) => body.set("sourceOverlaySha256", "a".repeat(65)), 400],
  ["BPMN part exceeds its bound", (body: FormData) => body.set("bpmn", new Blob([new Uint8Array(65)], { type: "application/xml" }), "large"), 413],
  ["overlay part exceeds its bound", (body: FormData) => body.set("sourceOverlay", new Blob([new Uint8Array(65537)], { type: "application/json" }), "large"), 413],
  ["framing exceeds its independent bound", (body: FormData) => body.set("sourceOverlay", new Blob([overlay], { type: "application/json" }), "f".repeat(16385)), 413],
] as const) {
  test(`multipart refuses ${name} before deployment`, async () => {
    const body = form(); mutate(body);
    const response = await routes.handle(new Request(endpoint, { method: "POST", body }));
    assert.equal(response?.status, status);
  });
}

for (const query of ["&unknown=value", "&sourceId=duplicate"]) {
  test(`multipart refuses a closed-query violation ${query}`, async () => {
    const response = await routes.handle(new Request(endpoint + query, { method: "POST", body: form() }));
    assert.equal(response?.status, 400);
  });
}

test("multipart counts actual received envelope bytes despite a smaller Content-Length", async () => {
  const body = new Request(endpoint, { method: "POST", body: form() });
  const envelope = new Uint8Array(await body.arrayBuffer());
  const expanded = new Uint8Array(64 + 81920 + 1); expanded.set(envelope);
  const request = new Request(endpoint, { method: "POST", headers: { "content-type": body.headers.get("content-type") ?? "", "content-length": "1" }, body: expanded });
  assert.equal((await routes.handle(request))?.status, 413);
});

test("multipart refuses malformed framing and a missing boundary", async () => {
  for (const contentType of ["multipart/form-data; boundary=missing", "multipart/form-data"]) {
    assert.equal((await routes.handle(new Request(endpoint, { method: "POST", headers: { "content-type": contentType }, body: "not a multipart envelope" })))?.status, 400);
  }
});
