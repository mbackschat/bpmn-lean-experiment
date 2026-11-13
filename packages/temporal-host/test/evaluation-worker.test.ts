/**
 * The evaluation Worker's contract without a Temporal server: its configuration is complete or refused, a handler is
 * bound by effect descriptor alone, and startup stops on a bad configuration before it connects. The Compose file's
 * own `bpmn-worker` environment is the oracle for the shipped configuration.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const { ConfiguredResultKind, configuredEffectHandler, loadEvaluationWorkerConfig, parseConfiguredEffects } = await import(
  new URL("../dist/evaluation-worker-config.js", import.meta.url).href
) as typeof import("../src/evaluation-worker-config.ts");
const { evaluationHealthStatus, runEvaluationWorkerCommand } = await import(
  new URL("../dist/evaluation-worker.js", import.meta.url).href
) as typeof import("../src/evaluation-worker.ts");
const { EffectResultKind } = await import(new URL("../dist/port.js", import.meta.url).href) as typeof import("../src/port.ts");

type Dependencies = Parameters<typeof runEvaluationWorkerCommand>[2];
type Runtime = Awaited<ReturnType<NonNullable<Dependencies>["connect"]>>;

const protocol = "urn:bpmn-lean:effect-protocol:activity-v1";
const probe = "urn:bpmn-lean:effect-operation:probe-v1";
const other = "urn:bpmn-lean:effect-operation:other-v1";
const patch = [{ name: "receipt", value: { kind: "string", value: "r-1" } }];

const environment: Record<string, string> = {
  BPMN_TEMPORAL_ADDRESS: "temporal:7233",
  BPMN_TEMPORAL_NAMESPACE: "evaluation",
  BPMN_TEMPORAL_TASK_QUEUE: "bpmn-semantic",
  BPMN_WORKER_IDENTITY: "evaluation-bpmn-worker",
  BPMN_WORKER_HEALTH_PORT: "8080",
  BPMN_WORKER_SCRIPT_TIMEOUT_MS: "5000",
  BPMN_WORKER_EFFECTS_JSON: JSON.stringify([{ protocol, operation: probe, result: { kind: "success", localPatch: [] } }]),
};

function request(operation: string, failures = 0, elementId = "Task") {
  return {
    key: `effect:${elementId}:${String(failures)}`,
    occurrence: { processInstanceId: "I", elementId, activation: 1 },
    protocol,
    operation,
    arguments: [],
    failures,
  };
}

const context = { idempotencyKey: "k" };

test("a complete environment is the configuration, and other variables are not read", () => {
  const config = loadEvaluationWorkerConfig({ ...environment, PATH: "/bin", BPMN_EVALUATION_NAMESPACE: "ignored" });
  assert.equal(config.address, "temporal:7233");
  assert.equal(config.namespace, "evaluation");
  assert.equal(config.taskQueue, "bpmn-semantic");
  assert.equal(config.identity, "evaluation-bpmn-worker");
  assert.equal(config.healthPort, 8080);
  assert.equal(config.scriptTimeoutMs, 5000);
  assert.deepEqual(config.effects, [
    { protocol, operation: probe, technicalFailures: 0, result: { kind: ConfiguredResultKind.Success, localPatch: [] } },
  ]);
});

test("each missing variable is refused by name", () => {
  for (const name of Object.keys(environment)) {
    const { [name]: _removed, ...rest } = environment;
    assert.throws(() => loadEvaluationWorkerConfig(rest), new RegExp(name, "u"), name);
  }
});

test("a variable of the Worker's namespaces that the contract does not declare is refused", () => {
  assert.throws(() => loadEvaluationWorkerConfig({ ...environment, BPMN_WORKER_EFFECT_JSON: "[]" }), /BPMN_WORKER_EFFECT_JSON/u);
  assert.throws(() => loadEvaluationWorkerConfig({ ...environment, BPMN_TEMPORAL_RETRIES: "3" }), /BPMN_TEMPORAL_RETRIES/u);
});

test("a malformed scalar is refused by name", () => {
  const bad: ReadonlyArray<readonly [string, string]> = [
    ["BPMN_TEMPORAL_ADDRESS", ""], ["BPMN_TEMPORAL_NAMESPACE", " padded "], ["BPMN_TEMPORAL_TASK_QUEUE", "\ud800"],
    ["BPMN_WORKER_HEALTH_PORT", "0"], ["BPMN_WORKER_HEALTH_PORT", "65536"], ["BPMN_WORKER_HEALTH_PORT", "80.5"],
    ["BPMN_WORKER_SCRIPT_TIMEOUT_MS", "-1"], ["BPMN_WORKER_SCRIPT_TIMEOUT_MS", "2147483648"],
  ];
  for (const [name, value] of bad) {
    assert.throws(() => loadEvaluationWorkerConfig({ ...environment, [name]: value }), new RegExp(name, "u"), `${name}=${value}`);
  }
});

test("a handler list deviating from the wire form is refused whole", () => {
  const success = { kind: "success", localPatch: [] };
  const entry = { protocol, operation: probe, result: success };
  const bad: ReadonlyArray<readonly [string, unknown]> = [
    ["not an array", { protocol }],
    ["a non-object entry", ["probe"]],
    ["an unknown entry field", [{ ...entry, model: "expense" }]],
    ["a missing result", [{ protocol, operation: probe }]],
    ["an empty operation", [{ ...entry, operation: "" }]],
    ["an unknown result kind", [{ ...entry, result: { kind: "retry" } }]],
    ["an unknown result field", [{ ...entry, result: { ...success, extra: 1 } }]],
    ["a technical failure carrying a patch", [{ ...entry, result: { kind: "technicalFailure", localPatch: [] } }]],
    ["a negative failure count", [{ ...entry, technicalFailures: -1 }]],
    ["a fractional failure count", [{ ...entry, technicalFailures: 0.5 }]],
    ["an untyped patch value", [{ ...entry, result: { kind: "success", localPatch: [{ name: "a", value: 1 }] } }]],
    ["a repeated patch name", [{ ...entry, result: { kind: "success", localPatch: [patch[0], patch[0]] } }]],
    ["a BPMN Error without a code", [{ ...entry, result: { kind: "bpmnError", message: null, localPatch: [] } }]],
    ["a repeated descriptor", [entry, entry]],
  ];
  for (const [name, value] of bad) assert.throws(() => parseConfiguredEffects(JSON.stringify(value), "effects"), /effects/u, name);
  assert.throws(() => parseConfiguredEffects("[", "effects"), /valid JSON/u);
});

test("a handler answers its descriptor with its configured result and refuses every other", async () => {
  const handler = configuredEffectHandler(parseConfiguredEffects(JSON.stringify([
    { protocol, operation: probe, result: { kind: "success", localPatch: patch } },
    { protocol, operation: other, result: { kind: "bpmnError", code: "REFUSED", message: "no", localPatch: [] } },
  ]), "effects"));
  assert.deepEqual(await handler(request(probe), context), { kind: EffectResultKind.Success, outputs: patch });
  assert.deepEqual(await handler(request(other), context), {
    kind: EffectResultKind.BusinessFailure, code: "REFUSED", message: "no", outputs: [],
  });
  await assert.rejects(handler(request("urn:bpmn-lean:effect-operation:unknown-v1"), context), /no effect handler is configured/u);
  await assert.rejects(handler({ ...request(probe), protocol: `${protocol}x` }, context), /no effect handler is configured/u);
});

test("a handler never reads the model, element or Process, so a second model reaches the same configuration", async () => {
  const handler = configuredEffectHandler(parseConfiguredEffects(JSON.stringify([
    { protocol, operation: probe, result: { kind: "success", localPatch: patch } },
  ]), "effects"));
  const expected = { kind: EffectResultKind.Success, outputs: patch };
  for (const elementId of ["Task", "Another_Model_Task", "Activity_0x"]) {
    assert.deepEqual(await handler(request(probe, 0, elementId), context), expected, elementId);
  }
});

test("technicalFailures reports that many incidents per occurrence and then the result, from the request alone", async () => {
  const handler = configuredEffectHandler(parseConfiguredEffects(JSON.stringify([
    { protocol, operation: probe, technicalFailures: 2, result: { kind: "success", localPatch: [] } },
  ]), "effects"));
  const kinds = await Promise.all([0, 1, 2, 3].map(async (failures) => (await handler(request(probe, failures), context)).kind));
  assert.deepEqual(kinds, [
    EffectResultKind.TechnicalFailure, EffectResultKind.TechnicalFailure, EffectResultKind.Success, EffectResultKind.Success,
  ]);
  // Asking again for an earlier count gives the same answer: a transport retry or a restarted Worker changes nothing.
  assert.equal((await handler(request(probe, 0), context)).kind, EffectResultKind.TechnicalFailure);
});

test("the Compose file's bpmn-worker environment is a complete configuration whose handlers include the incident walkthrough", async () => {
  const compose = await readFile(new URL("../../../compose.yaml", import.meta.url), "utf8");
  const block = /^ {2}bpmn-worker:\n(?<body>(?: {4}.*\n|\n)*)/mu.exec(compose)?.groups?.["body"];
  assert.ok(block !== undefined, "compose.yaml must define bpmn-worker");
  const shipped: Record<string, string> = {};
  for (const [, name, raw] of block.matchAll(/^ {6}(BPMN_[A-Z_]+): (.+)$/gmu)) {
    shipped[name ?? ""] = (raw ?? "").replace(/^(["'])(.*)\1$/u, "$2").replace(/\$\{[A-Z_]+:-([^}]*)\}/gu, "$1");
  }
  const config = loadEvaluationWorkerConfig(shipped);
  // The browser walkthrough's incident section starts `scenarios/service-task-effect`, whose Service Task binds the
  // probe operation: it must report one incident, and then succeed once an operator retries it.
  assert.deepEqual(
    config.effects.filter((effect) => effect.operation === probe),
    [{ protocol, operation: probe, technicalFailures: 1, result: { kind: ConfiguredResultKind.Success, localPatch: [] } }],
  );
});

function dependencies(log: string[], overrides: Partial<NonNullable<Dependencies>> = {}): NonNullable<Dependencies> {
  return {
    connect: async () => {
      log.push("connect");
      return runtime(log, Promise.resolve());
    },
    initializeFreshNamespace: async (_config, retentionSeconds) => {
      log.push(`initialize ${String(retentionSeconds)}`);
    },
    startHealthServer: async (port) => {
      log.push(`health ${String(port)}`);
      return { close: async () => void log.push("health closed") };
    },
    ...overrides,
  };
}

function runtime(log: string[], finished: Promise<void>): Runtime {
  finished.catch(() => undefined);
  return {
    finished,
    assertHealthy: () => undefined,
    assertNamespace: async () => undefined,
    shutdown: async () => void log.push("shutdown"),
  };
}

test("a bad configuration stops the command before it connects", async () => {
  const log: string[] = [];
  const { BPMN_WORKER_EFFECTS_JSON: _effects, ...incomplete } = environment;
  await assert.rejects(runEvaluationWorkerCommand(incomplete, [], dependencies(log)), /BPMN_WORKER_EFFECTS_JSON/u);
  await assert.rejects(
    runEvaluationWorkerCommand({ ...environment, BPMN_WORKER_EFFECTS_JSON: "[{}]" }, [], dependencies(log)), /effects|BPMN_WORKER_EFFECTS_JSON/u);
  await assert.rejects(
    runEvaluationWorkerCommand(incomplete, ["initialize-fresh-namespace", "--retention-seconds", "86400"], dependencies(log)), /BPMN_WORKER_EFFECTS_JSON/u);
  assert.deepEqual(log, []);
});

test("an unknown command or malformed initialization refuses without touching Temporal", async () => {
  const log: string[] = [];
  for (const args of [["serve"], ["initialize-fresh-namespace"], ["initialize-fresh-namespace", "--retention-seconds", "0"],
    ["initialize-fresh-namespace", "--retention-seconds", "1d"], ["initialize-fresh-namespace", "--days", "1"],
    ["initialize-fresh-namespace", "--retention-seconds", "86400", "extra"]]) {
    await assert.rejects(runEvaluationWorkerCommand(environment, args, dependencies(log)), TypeError, args.join(" "));
  }
  assert.deepEqual(log, []);
});

test("initialization registers the configured Namespace once with the given retention", async () => {
  const log: string[] = [];
  await runEvaluationWorkerCommand(environment, ["initialize-fresh-namespace", "--retention-seconds", "86400"], dependencies(log));
  assert.deepEqual(log, ["initialize 86400"]);
});

test("the Worker serves health until it stops, then closes the health endpoint before the runtime", async () => {
  const log: string[] = [];
  await runEvaluationWorkerCommand(environment, [], dependencies(log));
  assert.deepEqual(log, ["connect", "health 8080", "health closed", "shutdown"]);
});

test("a poller failure is reported after the Worker closes down", async () => {
  const log: string[] = [];
  const failure = new Error("poller failed");
  await assert.rejects(
    runEvaluationWorkerCommand(environment, [], dependencies(log, { connect: async () => {
      log.push("connect");
      return runtime(log, Promise.reject(failure));
    } })),
    (error) => error === failure,
  );
  assert.deepEqual(log, ["connect", "health 8080", "health closed", "shutdown"]);
});

test("a health endpoint that cannot start still shuts the runtime down", async () => {
  const log: string[] = [];
  const failure = new Error("port in use");
  await assert.rejects(
    runEvaluationWorkerCommand(environment, [], dependencies(log, { startHealthServer: async () => { throw failure; } })),
    (error) => error === failure,
  );
  assert.deepEqual(log, ["connect", "shutdown"]);
});

test("liveness needs a polling Worker, readiness also its Namespace, and nothing else is served", async () => {
  const healthy = { assertHealthy: () => undefined, assertNamespace: async () => undefined };
  const stopped = { ...healthy, assertHealthy: () => { throw new Error("the Worker is STOPPED"); } };
  const unregistered = { ...healthy, assertNamespace: async () => { throw new Error("NOT_FOUND"); } };
  assert.equal(await evaluationHealthStatus("GET", "/healthz", healthy), 204);
  assert.equal(await evaluationHealthStatus("GET", "/readyz", healthy), 204);
  assert.equal(await evaluationHealthStatus("GET", "/healthz", stopped), 503);
  assert.equal(await evaluationHealthStatus("GET", "/readyz", stopped), 503);
  assert.equal(await evaluationHealthStatus("GET", "/healthz", unregistered), 204);
  assert.equal(await evaluationHealthStatus("GET", "/readyz", unregistered), 503);
  assert.equal(await evaluationHealthStatus("POST", "/healthz", healthy), 404);
  assert.equal(await evaluationHealthStatus("GET", "/metrics", healthy), 404);
  assert.equal(await evaluationHealthStatus(undefined, undefined, healthy), 404);
});
