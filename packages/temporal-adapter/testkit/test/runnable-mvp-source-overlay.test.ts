import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CanonicalObservationKind,
  EffectExecutionResultKind,
  ProcessStatus,
  SemanticProfileId,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type { Scenario, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import {
  processTerminalReceiptFormatV1,
  workflowTerminalResultFormatV1,
} from "@bpmn-lean/temporal-testkit";
import { enrollmentFixture } from "../../client/test/worker-deployment-enrollment-fixture.ts";
import {
  loadRunnableMvpConfig,
  validateRunnableMvpConfig,
} from "../../runner/cli/runnable-mvp-config.ts";
import type { RunnableMvpConfig } from "../../runner/cli/runnable-mvp-config.ts";
import {
  RunnableMvpExitCode,
  runRunnableMvpCommand,
} from "../../runner/cli/runnable-mvp-command.ts";
import {
  RunnableMvpEventKind,
  RunnableMvpResultKind,
  runRunnableTemporalMvp,
} from "../../runner/cli/runnable-mvp.ts";
import type { RunnableMvpEvent } from "../../runner/cli/runnable-mvp.ts";

const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const businessCases = [
  ["serial-classification", "serial-invoice-classification.bpmn"],
  ["mixed-invoice-rework", "mixed-task-invoice-rework.bpmn"],
  ["business-error", "mixed-task-invoice-business-error.bpmn"],
] as const;

test("loads the exact overlay binding and resolves its file relative to the config directory", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-cli-overlay-config-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const [fixture, source] = businessCases[0];
  const config = await businessConfig(fixture, source);
  const sourceOverlay = config.bpmn.sourceOverlay;
  const configFile = path.join(directory, "runner.json");
  await writeFile(configFile, JSON.stringify({
    ...config,
    bpmn: {
      ...config.bpmn,
      file: path.relative(directory, config.bpmn.file),
      sourceOverlay: { ...sourceOverlay, file: path.relative(directory, sourceOverlay.file) },
    },
  }));
  const loaded = await loadRunnableMvpConfig(configFile);
  assert.equal(loaded.bpmn.file, config.bpmn.file);
  assert.deepEqual(loaded.bpmn.sourceOverlay, sourceOverlay);
});

test("omitted and null overlay configurations preserve source-only admission", async () => {
  const omitted = baseConfig(
    path.join(projectRoot, "scenarios/user-task-discovery-completion/process.bpmn"),
    "source-only-runner",
    SemanticProfileId.UserTask,
  );
  for (const config of [omitted, { ...omitted, bpmn: { ...omitted.bpmn, sourceOverlay: null } }]) {
    let connected = false;
    const events: RunnableMvpEvent[] = [];
    const sentinel = new Error("admitted source-only configuration");
    await assert.rejects(runRunnableTemporalMvp(config, (event) => events.push(event), {
      connect: async () => {
        connected = true;
        throw sentinel;
      },
    }), (error) => error === sentinel);
    assert.equal(connected, true);
    assert.equal(events[0]?.kind, RunnableMvpEventKind.SourceAdmissionAccepted);
  }
});

test("rejects every malformed or extended overlay binding before connection", async () => {
  const config = await businessConfig("serial-classification", "serial-invoice-classification.bpmn");
  const selection = config.bpmn.sourceOverlay;
  for (const sourceOverlay of [
    undefined, false, [], "overlay.json", {},
    { id: selection.id, sha256: selection.sha256 },
    { file: selection.file, sha256: selection.sha256 },
    { file: selection.file, id: selection.id },
    { ...selection, file: "" },
    { ...selection, id: "\ud800" },
    { ...selection, sha256: "A".repeat(64) },
    { ...selection, sha256: "short" },
    { ...selection, bytes: [] },
    { ...selection, handler: "./handler.ts" },
  ]) {
    const invalid = { ...config, bpmn: { ...config.bpmn, sourceOverlay } };
    assert.throws(() => validateRunnableMvpConfig(invalid), TypeError);
    let connected = false;
    await assert.rejects(runRunnableTemporalMvp(invalid as unknown as RunnableMvpConfig, undefined, {
      connect: async () => { connected = true; throw new Error("unexpected connection"); },
    }), TypeError);
    assert.equal(connected, false);
  }
});

test("exact business overlays reach connection only with admitted start data", async () => {
  for (const [fixture, source] of businessCases) {
    const config = await businessConfig(fixture, source);
    const events = await runToConnection(config);
    assert.deepEqual(events.map(({ kind }) => kind), [RunnableMvpEventKind.SourceAdmissionAccepted]);
    const invalid = await runWithoutConnection({ ...config, process: { ...config.process, initialVariables: [] } });
    assert.equal(invalid.result.kind, RunnableMvpResultKind.ProcessAdmissionRejected);
  }
});

test("snapshots selected overlay file and identity before asynchronous source reads", async () => {
  const config = await businessConfig("serial-classification", "serial-invoice-classification.bpmn");
  const pending = runToConnection(config);
  const selected = config.bpmn.sourceOverlay as { file: string; id: string; sha256: string };
  selected.file = "/nonexistent/retargeted-overlay.json";
  selected.id = "retargeted-overlay";
  selected.sha256 = "0".repeat(64);
  (config.bpmn as { sourceOverlay: typeof selected | null }).sourceOverlay = null;
  const events = await pending;
  assert.equal(events[0]?.kind, RunnableMvpEventKind.SourceAdmissionAccepted);
});

test("ID, digest and profile drift reject at source admission before connection", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-cli-overlay-drift-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const config = await businessConfig("serial-classification", "serial-invoice-classification.bpmn");
  const original = config.bpmn.sourceOverlay;
  const artifact = JSON.parse(await readFile(original.file, "utf8")) as Record<string, unknown>;
  const bytes = new TextEncoder().encode(JSON.stringify({ ...artifact, semanticProfile: "wrong-profile" }));
  const file = path.join(directory, "wrong-profile.json");
  await writeFile(file, bytes);
  for (const sourceOverlay of [
    { ...original, id: "wrong-overlay" },
    { ...original, sha256: "0".repeat(64) },
    { ...original, file, sha256: sha256(bytes) },
  ]) {
    const { result, events } = await runWithoutConnection({
      ...config, bpmn: { ...config.bpmn, sourceOverlay },
    });
    assert.equal(result.kind, RunnableMvpResultKind.SourceAdmissionRejected);
    assert.deepEqual(events.map(({ kind }) => kind), [RunnableMvpEventKind.SourceAdmissionRejected]);
  }
});

test("different valid bytes under the same ID require their exact new digest", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-cli-overlay-content-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const config = await businessConfig("serial-classification", "serial-invoice-classification.bpmn");
  const original = config.bpmn.sourceOverlay;
  const bytes = new TextEncoder().encode(`${await readFile(original.file, "utf8")}\n`);
  const file = path.join(directory, "same-id-new-bytes.json");
  await writeFile(file, bytes);
  const stale = await runWithoutConnection({
    ...config, bpmn: { ...config.bpmn, sourceOverlay: { ...original, file } },
  });
  assert.equal(stale.result.kind, RunnableMvpResultKind.SourceAdmissionRejected);
  const events = await runToConnection({
    ...config,
    bpmn: { ...config.bpmn, sourceOverlay: { ...original, file, sha256: sha256(bytes) } },
  });
  assert.equal(events[0]?.kind, RunnableMvpEventKind.SourceAdmissionAccepted);
});

test("a missing selected overlay is an infrastructure failure without connection or fallback", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-cli-overlay-missing-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const config = await businessConfig("serial-classification", "serial-invoice-classification.bpmn");
  const configFile = path.join(directory, "missing.json");
  await writeFile(configFile, JSON.stringify({
    ...config,
    bpmn: { ...config.bpmn, sourceOverlay: { ...config.bpmn.sourceOverlay, file: "absent.json" } },
  }));
  let connected = false;
  const lines: string[] = [];
  const exitCode = await runRunnableMvpCommand([configFile], (line) => lines.push(line), {
    run: (loaded, observe) => runRunnableTemporalMvp(loaded, observe, {
      connect: async () => { connected = true; throw new Error("unexpected connection"); },
    }),
  });
  assert.equal(exitCode, RunnableMvpExitCode.InfrastructureFailure);
  assert.equal(connected, false);
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0] ?? "null").kind, "infrastructureFailure");
  assert.match(JSON.parse(lines[0] ?? "null").evidence, /ENOENT/u);
});

test("an admitted mapped overlay reaches the unchanged production start with its exact identity", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-cli-overlay-start-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const source = await readFile(path.join(projectRoot, "scenarios/mapped-success-service-task/process.bpmn"), "utf8");
  const file = path.join(directory, "mapped.bpmn");
  await writeFile(file, source.replace("${mappedSuccessHandler}", "${alternateMappedSuccessHandler}"));
  const overlayBytes = new TextEncoder().encode(JSON.stringify({
    kind: "bpmnSourceOverlay",
    id: "mapped-cli-overlay",
    semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
    effectBindings: [{
      source: { implementation: null, delegateExpression: "${alternateMappedSuccessHandler}" },
      descriptor: {
        protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
        operation: "urn:bpmn-lean:effect-operation:mapped-success-v1",
      },
    }],
    inertAttributes: [],
  }));
  const overlayFile = path.join(directory, "mapped-overlay.json");
  await writeFile(overlayFile, overlayBytes);
  const sourceOverlay = { file: overlayFile, id: "mapped-cli-overlay", sha256: sha256(overlayBytes) };
  const base = baseConfig(file, "mapped-cli-source", SemanticProfileId.MappedSuccessServiceTask);
  const config = {
    ...base,
    bpmn: { ...base.bpmn, sourceOverlay },
    effectHandlers: [{
      protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
      operation: "urn:bpmn-lean:effect-operation:mapped-success-v1",
      result: { kind: EffectExecutionResultKind.Success, localPatch: [{
        name: "result", value: { kind: VariableValueKind.String, value: "fixed-result" },
      }] },
    }],
  } as const;
  let program: SemanticProcessProgram | undefined;
  let shutdowns = 0;
  const state = { kind: CanonicalObservationKind.State, instanceId: config.process.instanceId,
    status: ProcessStatus.Completed, activeWaits: [], openUserTasks: [], openMessageSubscriptions: [],
    openTimers: [], openEffects: [], openIncidents: [], variables: [], enabledInteractions: [], logicalTimeMs: 0 } as const;
  const result = await runRunnableTemporalMvp(config, undefined, {
    connect: async () => ({
      assertHealthy: () => undefined,
      shutdown: async () => { shutdowns += 1; },
      workflowClient: {
        ...enrollmentFixture(config.temporal.taskQueue),
        start: async (_type: unknown, options: { args: readonly [unknown, SemanticProcessProgram, unknown] }) => {
          program = options.args[1];
          assert.equal(options.args.length, 3);
          return {};
        },
        getHandle: () => ({
          query: async () => [state],
          result: async () => {
            assert.ok(program !== undefined);
            return {
              format: workflowTerminalResultFormatV1,
              receipt: { format: processTerminalReceiptFormatV1, definition: program.identity,
                processId: program.processId, processInstanceId: config.process.instanceId, finalState: state },
              entries: [],
            };
          },
        }),
      },
    }) as never,
  });
  assert.equal(result.kind, RunnableMvpResultKind.Completed);
  assert.deepEqual(program?.identity.sourceOverlay, { id: sourceOverlay.id, sha256: sourceOverlay.sha256 });
  assert.equal(shutdowns, 1);
});

async function businessConfig(fixture: string, source: string) {
  const scenario = JSON.parse(await readFile(path.join(projectRoot,
    `packages/differential/test/fixtures/${fixture}.scenario.json`), "utf8")) as Scenario;
  const start = scenario.stimuli[0];
  assert.ok(start?.kind === StimulusKind.StartProcess);
  assert.ok(scenario.bpmn.sourceOverlay !== null);
  const config = baseConfig(path.join(projectRoot, `packages/bpmn-source/test/fixtures/${source}`),
    scenario.bpmn.id, scenario.profile);
  return { ...config,
    bpmn: { ...config.bpmn, sourceOverlay: {
      ...scenario.bpmn.sourceOverlay,
      file: path.join(projectRoot, `packages/differential/test/fixtures/${fixture}.overlay.json`),
    } },
    process: { instanceId: start.instanceId, initialVariables: start.initialVariables },
  };
}

function baseConfig(file: string, sourceId: string, semanticProfile: string) {
  return {
    kind: "runnableTemporalMvp",
    bpmn: { file, sourceId, semanticProfile, limits: { maxBytes: 1_048_576, parserDeadlineMs: 1_000 } },
    process: { instanceId: "overlay-cli-instance", initialVariables: [] },
    temporal: { address: "localhost:7233", namespace: "default", taskQueue: "overlay-cli-queue", identity: "overlay-cli-test" },
    interactions: [], effectHandlers: [],
  } as const;
}

async function runWithoutConnection(config: RunnableMvpConfig) {
  const events: RunnableMvpEvent[] = [];
  let connected = false;
  const result = await runRunnableTemporalMvp(config, (event) => events.push(event), {
    connect: async () => { connected = true; throw new Error("unexpected connection"); },
  });
  assert.equal(connected, false);
  return { result, events };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function runToConnection(config: RunnableMvpConfig): Promise<RunnableMvpEvent[]> {
  const events: RunnableMvpEvent[] = [];
  const sentinel = new Error("admitted business configuration reached connection");
  await assert.rejects(runRunnableTemporalMvp(config, event => events.push(event), {
    connect: async () => { throw sentinel; },
  }), error => error === sentinel);
  return events;
}
