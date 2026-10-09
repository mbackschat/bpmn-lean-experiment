import { decodeDefinitionDeployResult } from "@bpmn-lean/platform-contracts";
import { DefinitionStartDescriptionStatus } from "@bpmn-lean/platform-engine-gateway";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DefinitionDeploymentService, DefinitionStartService, DefinitionHttpRoutes, SqliteDefinitionRepository, ConfirmedProcessInstancePublicationService, InMemoryConfirmedProcessInstanceRepository } from "@bpmn-lean/platform-definitions";
import type { ExactArtifactStore } from "@bpmn-lean/platform-definitions";
import type { DefinitionCompiler, DefinitionCompilationRequest, DefinitionVersionStarter, DefinitionVersionStartRequest } from "@bpmn-lean/platform-engine-gateway";

const bytes = new TextEncoder().encode("<exact-bpmn/>");
const overlayBytes = new TextEncoder().encode('{"exact":"overlay"}');
const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const identity = { id: "overlay-🚀\u0000", sha256: digest(overlayBytes) };
const source = { kind: "bpmnSource", id: "exact.bpmn", sha256: digest(bytes), byteLength: bytes.length, declaredEncoding: null, decodedAs: "UTF-8" } as const;
const capabilities = { messageStarts: [], timerStarts: [] } as const;

async function withFixture(run: (value: Awaited<ReturnType<typeof fixture>>) => Promise<void>): Promise<void> {
  const value = await fixture();
  try { await run(value); } finally { value.repository.close(); await rm(value.root, { recursive: true, force: true }); }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "definition-overlay-"));
  const repository = new SqliteDefinitionRepository(join(root, "definitions.sqlite"));
  const content = new Map<string, Uint8Array>();
  const writes: string[] = [];
  const artifacts: ExactArtifactStore = {
    put: async (request) => { writes.push(request.sha256); content.set(request.sha256, Uint8Array.from(request.bytes)); return { status: "stored" }; },
    get: async (sha256) => { const retained = content.get(sha256); return retained === undefined ? null : Uint8Array.from(retained); },
  };
  const compiler: DefinitionCompiler = { compileDefinition: async (request) => ({
    status: "accepted", source: { ...source, id: request.sourceId, sha256: digest(request.bytes), byteLength: request.bytes.length }, diagnostics: [],
    definition: { processId: "Process", semanticProfile: request.semanticProfile, sourceOverlay: request.sourceOverlay === undefined || request.sourceOverlay === null ? null : { id: request.sourceOverlay.id, sha256: request.sourceOverlay.sha256 } }, startCapabilities: capabilities,
  }) };
  const calls: DefinitionVersionStartRequest[] = [];
  const engineIdentity = (request: DefinitionVersionStartRequest) => ({
    source: { ...source }, definition: { processId: "Process", semanticProfile: "profile", sourceOverlay: request.sourceOverlay === undefined || request.sourceOverlay === null ? null : { id: request.sourceOverlay.id, sha256: request.sourceOverlay.sha256 } }, processInstanceId: request.processInstanceId,
  });
  const starter: DefinitionVersionStarter = {
    prepareDefinitionVersion: async (request) => ({ ...engineIdentity(request), status: "admitted", locator: "opaque", intent: { protocol: "bpmn-direct-start-v1", intentSha256: "e".repeat(64) } }),
    startPreparedDefinitionVersion: async (request) => { calls.push(structuredClone(request)); return { ...engineIdentity(request), status: "started" }; },
    startDefinitionVersion: async () => { throw new Error("unprepared start"); },
    describeDefinitionVersionStart: async () => ({ status: DefinitionStartDescriptionStatus.Matching }),
  };
  const confirmed = new InMemoryConfirmedProcessInstanceRepository();
  const publication = new ConfirmedProcessInstancePublicationService({ repository: confirmed, operate: { recordConfirmedProcessInstance: async () => {} }, work: { recordConfirmedProcessInstance: async () => {} } });
  const deployment = new DefinitionDeploymentService(compiler, artifacts, repository);
  const start = new DefinitionStartService(starter, artifacts, repository, () => "instance", publication);
  return { root, repository, content, writes, artifacts, compiler, starter, confirmed, publication, deployment, start, calls };
}

function request() {
  return { bytes: Uint8Array.from(bytes), sourceId: source.id, semanticProfile: "profile", expectedSha256: source.sha256, sourceOverlay: { ...identity, bytes: Uint8Array.from(overlayBytes) } };
}

test("captures selected overlay before compiler yield and publishes exact detached identity and bytes", async () => {
  await withFixture(async (value) => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const compiler: DefinitionCompiler = { compileDefinition: async (selected) => { await gate; return value.compiler.compileDefinition(selected); } };
    const deployment = new DefinitionDeploymentService(compiler, value.artifacts, value.repository);
    const selected = request();
    const pending = deployment.deploy(selected);
    selected.bytes.fill(0); selected.sourceOverlay.bytes.fill(0); selected.sourceOverlay.id = "changed"; selected.sourceOverlay.sha256 = "f".repeat(64); selected.semanticProfile = "other";
    release();
    const result = await pending;
    assert.equal(result.status, "deployed");
    assert.deepEqual(result.definition?.sourceOverlay, identity);
    assert.deepEqual(value.content.get(identity.sha256), overlayBytes);
    assert.deepEqual(value.writes, [source.sha256, identity.sha256]);
    assert.deepEqual((await value.repository.get({ processId: "Process", version: 1 }))?.sourceOverlay, identity);
  });
});

test("compiler source, profile and overlay divergence refuse before artifact or version publication", async () => {
  for (const perturb of [
    (result: Extract<Awaited<ReturnType<DefinitionCompiler["compileDefinition"]>>, { status: "accepted" }>) => ({ ...result, source: { ...result.source, id: "other" } }),
    (result: Extract<Awaited<ReturnType<DefinitionCompiler["compileDefinition"]>>, { status: "accepted" }>) => ({ ...result, definition: { processId: "Process", semanticProfile: "other", sourceOverlay: identity } }),
    (result: Extract<Awaited<ReturnType<DefinitionCompiler["compileDefinition"]>>, { status: "accepted" }>) => ({ ...result, definition: { processId: "Process", semanticProfile: "profile", sourceOverlay: { ...identity, sha256: "f".repeat(64) } } }),
  ]) await withFixture(async (value) => {
    const compiler: DefinitionCompiler = { compileDefinition: async (selected) => { const accepted = await value.compiler.compileDefinition(selected); assert.equal(accepted.status, "accepted"); if (accepted.status !== "accepted") throw new Error("fixture rejection"); return perturb(accepted); } };
    await assert.rejects(new DefinitionDeploymentService(compiler, value.artifacts, value.repository).deploy(request()), /identity/u);
    assert.deepEqual(value.writes, []);
    assert.deepEqual(await value.repository.listLatest(), []);
  });
});

test("exact-version prepare and dispatch reconstruct retained overlay; missing and corrupt bytes never dispatch", async () => {
  await withFixture(async (value) => {
    await value.deployment.deploy(request());
    const result = await value.start.start({ processId: "Process", version: 1 }, { initialVariables: [] });
    assert.equal(result.status, "started");
    assert.deepEqual(result.status === "started" && result.instance.definition.sourceOverlay, identity);
    assert.deepEqual(value.calls[0]?.sourceOverlay, { ...identity, bytes: overlayBytes });
    value.content.delete(identity.sha256);
    await assert.rejects(value.start.start({ processId: "Process", version: 1 }, { initialVariables: [] }));
    value.content.set(identity.sha256, new TextEncoder().encode("corrupted"));
    await assert.rejects(value.start.start({ processId: "Process", version: 1 }, { initialVariables: [] }));
    assert.equal(value.calls.length, 1);
  });
});

test("closed multipart accepts exact files and carries nullable public overlay identity", async () => {
  await withFixture(async (value) => {
    const routes = new DefinitionHttpRoutes(value.deployment, value.start, { maxSourceBytes: 1024 });
    const form = new FormData();
    form.append("bpmn", new Blob([bytes], { type: "application/xml" }), "ignored.bpmn");
    form.append("sourceOverlay", new Blob([overlayBytes], { type: "application/json" }), "ignored.json");
    form.append("sourceOverlayId", identity.id);
    form.append("sourceOverlaySha256", identity.sha256);
    const response = await routes.handle(new Request("http://test/api/v1/definitions?sourceId=exact.bpmn&semanticProfile=profile", { method: "POST", body: form }));
    assert.equal(response?.status, 201);
    assert.ok(response !== null);
    const deployed = decodeDefinitionDeployResult(await response.json());
    assert.equal(deployed.status, "deployed");
    if (deployed.status !== "deployed") throw new Error("deployment rejected");
    assert.deepEqual(deployed.definition.sourceOverlay, identity);
  });
});
