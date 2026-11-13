import assert from "node:assert/strict";
import test from "node:test";

import { proveRestartPreservesWork, restartCommands } from "./evaluation-distribution-restart.ts";
import type { RestartProofHost } from "./evaluation-distribution-restart.ts";

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

type Recorded = Readonly<{ method: string; path: string; contentType: string | null; body: unknown }>;

/**
 * The slice of the platform's public API the proof uses, over in-memory state, with the shape the platform's
 * contracts publish (`platform/contracts/src`): deployment, start, the task inbox, claim and completion. `onRestart`
 * says what a restart does to the work, which is the whole variable of the proof.
 */
class FakePlatform {
  readonly requests: Recorded[] = [];
  readonly onRestart: "keepsWork" | "losesWork" | "dropsClaim";
  /** Reads before the inbox lists a started instance's task, like the background projection refresh. */
  projectionLag = 2;
  /** Requests that fail with a connection error, like the API while its stack is coming back. */
  outage = 0;
  #instance: string | undefined;
  #claim: { actorId: string; generation: number } | null = null;
  #completed = false;

  constructor(onRestart: FakePlatform["onRestart"]) {
    this.onRestart = onRestart;
  }

  restart(): void {
    this.requests.push({ method: "RESTART", path: "", contentType: null, body: null });
    this.outage = 3;
    this.projectionLag = 1;
    if (this.onRestart === "losesWork") this.#instance = undefined;
    if (this.onRestart === "dropsClaim") this.#claim = null;
  }

  readonly fetch = async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as unknown : init?.body;
    this.requests.push({ method, path: `${url.pathname}${url.search}`, contentType: new Headers(init?.headers).get("content-type"), body });
    if (this.outage > 0) {
      this.outage -= 1;
      throw new TypeError("fetch failed");
    }
    const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
    const definition = { processId: "Process_UserTaskMetadata", version: 1 };
    const task = { processInstanceId: "I-1", elementId: "UserTask_Approve", activation: 1 };
    if (method === "POST" && url.pathname === "/api/v1/definitions") return json(201, { status: "deployed", definition });
    if (method === "GET" && url.pathname === "/api/v1/definitions") return json(200, { definitions: [definition] });
    if (method === "POST" && url.pathname === "/api/v1/definitions/Process_UserTaskMetadata/versions/1/start") {
      this.#instance = "I-1";
      return json(201, { status: "started", instance: { processInstanceId: "I-1", definition } });
    }
    if (method === "GET" && url.pathname === "/api/v1/work-tasks") {
      if (this.projectionLag > 0) {
        this.projectionLag -= 1;
        return json(200, { tasks: [] });
      }
      const open = this.#instance !== undefined && !this.#completed;
      return json(200, { tasks: open ? [{
        task: { id: task, name: "Approve", state: "active" },
        hostingInstance: { processInstanceId: "I-1", definition },
        claimGeneration: this.#claim?.generation ?? 0,
        claim: this.#claim,
        claimableByCurrentActor: true,
      }] : [] });
    }
    if (method === "PUT" && url.pathname === "/api/v1/work-tasks/I-1/UserTask_Approve/1/claim") {
      this.#claim = { actorId: "demo-user", generation: 1 };
      return json(200, { taskId: task, claim: this.#claim });
    }
    const completion = /^\/api\/v1\/work-task-completions\/(?<action>.+)$/u.exec(url.pathname);
    if (method === "PUT" && completion?.groups?.["action"] !== undefined) {
      this.#completed = true;
      return json(200, { state: "committed", actionId: decodeURIComponent(completion.groups["action"]), taskId: task });
    }
    return json(404, { error: "unrouted" });
  };
}

function host(platform: FakePlatform, overrides: Partial<RestartProofHost> = {}): { host: RestartProofHost; events: string[] } {
  const events: string[] = [];
  let clock = 0;
  return {
    events,
    host: {
      origin: "http://127.0.0.1:3000",
      fetch: platform.fetch,
      restart: async () => {
        events.push("restart");
        platform.restart();
      },
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      source: new TextEncoder().encode("<definitions/>"),
      token: "t",
      log: () => undefined,
      ...overrides,
    },
  };
}

test("work created before the restart is claimed, still open after it, and completes", async () => {
  const platform = new FakePlatform("keepsWork");
  const { host: proof, events } = host(platform);
  const report = await proveRestartPreservesWork(proof);
  assert.deepEqual(report, { processId: "Process_UserTaskMetadata", version: 1, processInstanceId: "I-1", claimGeneration: 1 });
  assert.deepEqual(events, ["restart"]);
  const at = (matches: (request: Recorded) => boolean): number => platform.requests.findIndex(matches);
  const restart = at((request) => request.method === "RESTART");
  const claim = at((request) => request.path.endsWith("/claim"));
  const completion = at((request) => request.path.startsWith("/api/v1/work-task-completions/"));
  assert.ok(0 < claim && claim < restart && restart < completion, "deploy, start and claim come before the restart, the completion after it");
  assert.match(platform.requests[0]!.path, /^\/api\/v1\/definitions\?sourceId=restart-proof-t\.bpmn&semanticProfile=cibseven-2\.2\.0$/u);
  const deployment = platform.requests[0]!;
  assert.equal(deployment.contentType, "application/bpmn+xml");
  assert.deepEqual(platform.requests[completion]!.body, {
    taskId: { processInstanceId: "I-1", elementId: "UserTask_Approve", activation: 1 },
    expectedClaimGeneration: 1,
    submittedValues: [{ key: "approved", value: { kind: "boolean", value: true } }],
  });
});

test("a restart that loses the Process instance fails the proof", async () => {
  const platform = new FakePlatform("losesWork");
  await assert.rejects(proveRestartPreservesWork(host(platform).host), /User Task after the restart was not observed within 180000 ms/u);
  assert.equal(platform.requests.some((request) => request.path.startsWith("/api/v1/work-task-completions/")), false);
});

test("a restart that drops the claim fails the proof before anything is completed", async () => {
  const platform = new FakePlatform("dropsClaim");
  await assert.rejects(proveRestartPreservesWork(host(platform).host), /claim changed across the restart/u);
  assert.equal(platform.requests.some((request) => request.path.startsWith("/api/v1/work-task-completions/")), false);
});

test("a task nobody can claim fails the proof instead of waiting", async () => {
  const platform = new FakePlatform("keepsWork");
  const fetchTasks = platform.fetch;
  const unclaimable = async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const response = await fetchTasks(input, init);
    if (new URL(String(input)).pathname !== "/api/v1/work-tasks") return response;
    const value = await response.json() as { tasks: Array<Record<string, unknown>> };
    return new Response(JSON.stringify({ tasks: value.tasks.map((task) => ({ ...task, claimableByCurrentActor: false })) }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  await assert.rejects(proveRestartPreservesWork(host(platform, { fetch: unclaimable }).host), /cannot claim the proof task/u);
});

test("a rejected completion fails the proof at once", async () => {
  const platform = new FakePlatform("keepsWork");
  const fetchAll = platform.fetch;
  const rejecting = async (input: FetchInput, init?: FetchInit): Promise<Response> =>
    new URL(String(input)).pathname.startsWith("/api/v1/work-task-completions/")
      ? new Response(JSON.stringify({ state: "rejected" }), { status: 200, headers: { "content-type": "application/json" } })
      : fetchAll(input, init);
  await assert.rejects(proveRestartPreservesWork(host(platform, { fetch: rejecting }).host), /"state":"rejected"/u);
});

test("both stacks restart from what they already have, and never build or pull", () => {
  const source = restartCommands("source");
  assert.deepEqual(source, [
    ["docker", "compose", "down", "--remove-orphans"],
    ["docker", "compose", "up", "--no-build", "--pull", "never", "--wait"],
  ]);
  assert.equal(source.flat().includes("--volumes"), false, "a restart keeps the named volumes");
  assert.deepEqual(restartCommands("published", "deploy/evaluation/demo"), [
    ["deploy/evaluation/demo", "stop"],
    ["deploy/evaluation/demo", "start"],
  ]);
  assert.throws(() => restartCommands("published"), /launcher/u);
});
