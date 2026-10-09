import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { SemanticOperationKind } from "@bpmn-lean/semantic-core";

const projectRoot = new URL("../../../../", import.meta.url);
const hostRoot = new URL("showcase/m3-human-work/src/", projectRoot);
const fixtureRoot = new URL("packages/bpmn-source/test/fixtures/business-public-delivery/", projectRoot);
const metadata = {
  assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
  form: { fields: [{ key: "request", type: "string" }] },
};

function runProbe(code: string): void {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: fileURLToPath(projectRoot), encoding: "utf8", timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
}

for (const [entry, expected] of [
  ["host.ts", "unconfigured"],
  ["invoice-host.ts", "rework"],
  ["invoice-recovery-host.ts", "bpmnError"],
] as const) {
  test(`${entry} explicitly supplies its caller-selected handlers to the shared host`, () => {
    runProbe(`
      import assert from "node:assert/strict";
      import { registerHooks } from "node:module";
      const runtime = "export async function runShowcaseHost(activities) { globalThis.selectedActivities = activities; }";
      registerHooks({ resolve(specifier, context, nextResolve) {
        if (specifier === "./host-runtime.ts") {
          return { url: "data:text/javascript," + encodeURIComponent(runtime), shortCircuit: true };
        }
        if (specifier === "@bpmn-lean/platform-server" || specifier === "@bpmn-lean/temporal-testkit") {
          throw new Error("Host entry point bypassed the shared lifecycle");
        }
        return nextResolve(specifier, context);
      } });
      await import(${JSON.stringify(new URL(entry, hostRoot).href)});
      const selected = globalThis.selectedActivities;
      assert.equal(typeof selected?.executeBpmnEffect, "function");
      const request = { protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
        operation: "invoiceValidator", idempotencyKey: "selected-host-request",
        arguments: [{ name: "payload", value: { kind: "string", value: "missing-reference" } }] };
      const expected = ${JSON.stringify(expected)};
      if (expected === "unconfigured") {
        await assert.rejects(selected.executeBpmnEffect(request), /no configured product effect handler/u);
      } else {
        const outcome = await selected.executeBpmnEffect(request);
        if (expected === "bpmnError") assert.equal(outcome.kind, "bpmnError");
        else assert.equal(outcome.localPatch[0].value.value, expected);
      }
    `);
  });
}

test("shared host registers the supplied implementation unchanged and closes its owned resources", () => {
  const modules = {
    "@bpmn-lean/platform-server": `
        export function readPlatformServerConfig() { return { temporalTaskQueue: "selected-queue" }; }
        export async function createPlatformServer(config) {
          globalThis.platformConfig = config;
          return { async listen() { setImmediate(() => process.emit("SIGTERM")); return "http://127.0.0.1:1"; },
            async close() { globalThis.closed.push("platform"); } };
        }
    `,
    "@bpmn-lean/temporal-testkit": `
        export async function createCachedLocalEnvironment() {
          return { address: "test-address", async teardown() { globalThis.closed.push("environment"); } };
        }
        export class ExternalTemporalRuntime {
          static async initializeFreshNamespace(config, activities, retention) {
            globalThis.workerConfig = config;
            globalThis.registeredActivities = activities;
            globalThis.retention = retention;
            return { async shutdown() { globalThis.closed.push("worker"); } };
          }
        }
        export async function withDeadline(work) { return await work; }
    `,
  };
  runProbe(`
    import assert from "node:assert/strict";
    import { access } from "node:fs/promises";
    import { registerHooks } from "node:module";
    globalThis.closed = [];
    const modules = ${JSON.stringify(modules)};
    registerHooks({ resolve(specifier, context, nextResolve) {
      if (Object.hasOwn(modules, specifier)) {
        return { url: "data:text/javascript," + encodeURIComponent(modules[specifier]), shortCircuit: true };
      }
      return nextResolve(specifier, context);
    } });
    const { runShowcaseHost } = await import(${JSON.stringify(new URL("host-runtime.ts", hostRoot).href)});
    const supplied = { async executeBpmnEffect() { throw new Error("never invoked by lifecycle"); } };
    await runShowcaseHost(supplied);
    assert.equal(globalThis.registeredActivities, supplied);
    assert.equal(globalThis.workerConfig.taskQueue, "selected-queue");
    assert.equal(globalThis.platformConfig.temporalAddress, "test-address");
    assert.equal(globalThis.retention, 86400);
    assert.deepEqual(globalThis.closed, ["platform", "worker", "environment"]);
    await assert.rejects(access(globalThis.platformConfig.dataDirectory), { code: "ENOENT" });
  `);
});

function eraseMetadata(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, item: unknown) => key === "metadata" ? undefined : item));
}

for (const [fixture, family, expectedTasks] of [
  ["serial-invoice", "serial-business-task-composition", ["Review", "Finalize"]],
  ["invoice-rework", "mixed-task-control-flow", ["Review", "Finalize"]],
  ["invoice-error-recovery", "mixed-task-business-error", ["Review", "CorrectData", "ReviewPolicy", "Finalize"]],
] as const) {
  test(`${fixture} retains the registered model and overlay with complete metadata on every Human Task`, async () => {
    const xml = await readFile(new URL(`${fixture}.bpmn`, fixtureRoot), "utf8");
    const scenarioRoot = new URL(`scenarios/${family}/`, projectRoot);
    const original = await readFile(new URL("process.bpmn", scenarioRoot), "utf8");
    const overlayBytes = new Uint8Array(await readFile(new URL("source-overlay.json", scenarioRoot)));
    const overlay = JSON.parse(new TextDecoder().decode(overlayBytes)) as { id: string; semanticProfile: string };
    const compile = (source: string) => compileBpmnToSemanticProcess({
      bytes: new TextEncoder().encode(source), sourceId: fixture, semanticProfile: overlay.semanticProfile,
      expectedSha256: undefined,
      sourceOverlay: { id: overlay.id, bytes: overlayBytes, sha256: createHash("sha256").update(overlayBytes).digest("hex") },
      limits: { maxBytes: 1_048_576, parserDeadlineMs: 1_000 },
    });
    const annotated = await compile(xml);
    const baseline = await compile(original);
    assert.equal(annotated.status, BpmnCompilationStatus.Accepted, JSON.stringify(annotated.diagnostics));
    assert.equal(baseline.status, BpmnCompilationStatus.Accepted);
    if (annotated.status !== BpmnCompilationStatus.Accepted || baseline.status !== BpmnCompilationStatus.Accepted) {
      throw new Error("Business fixture admission refused");
    }
    assert.deepEqual(eraseMetadata(annotated.checkedProcess.nodes), baseline.checkedProcess.nodes);
    assert.deepEqual(eraseMetadata(annotated.semanticProcess.operations), baseline.semanticProcess.operations);
    const tasks = annotated.semanticProcess.operations.filter(operation => operation.kind === SemanticOperationKind.AwaitUserTask);
    assert.deepEqual(tasks.map(operation => operation.task.elementId).sort(), [...expectedTasks].sort());
    for (const task of tasks) assert.deepEqual(task.task.metadata, metadata);
    assert.deepEqual(annotated.semanticProcess.identity.sourceOverlay, { id: overlay.id,
      sha256: createHash("sha256").update(overlayBytes).digest("hex") });
    const stripped = xml.replace(/(<userTask\b[^>]*?) camunda:candidateGroups="reviewers"><extensionElements><camunda:formData><camunda:formField id="request" type="string"\/><\/camunda:formData><\/extensionElements><\/userTask>/gu, "$1/>");
    assert.equal(stripped, original);
  });
}
