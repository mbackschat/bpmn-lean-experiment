/**
 * The evaluation distribution's restart proof, run by the `Evaluation distribution` workflow against the stack it has
 * just brought up: it creates live work through the public API, restarts the whole stack without building or pulling
 * anything, and requires that the same Process instance still has the same open, claimed User Task, which a person can
 * then complete.
 *
 * The work is the retained `user-task-assignment-form-metadata` Process (the prepared "request review" showcase): its
 * one User Task is claimable by the distribution's demo actor. Only the public HTTP API is read or written; no
 * container, volume or Temporal state is inspected, so a restart that loses work in any of them fails here.
 *
 * Usage: `node scripts/evaluation-distribution-restart.ts source` restarts the Compose project in the working
 * directory; `node scripts/evaluation-distribution-restart.ts published <launcher>` restarts the published bundle
 * through its launcher. `BPMN_EVALUATION_ORIGIN` names the public origin (default `http://127.0.0.1:3000`).
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const modelUrl = new URL("../scenarios/user-task-assignment-form-metadata/process.bpmn", import.meta.url);
const semanticProfile = "cibseven-2.2.0";
/** The one field of the User Task's form, as the published task detail names it. */
const approvalKey = "approved";
const requestDeadlineMs = 15_000;
/** The projections that publish a task refresh in the background, so a read is retried until its bound. */
const taskDeadlineMs = 90_000;
/** A restart brings every service back through its health checks before the API answers. */
const restartDeadlineMs = 180_000;
const pollIntervalMs = 1_000;

export type RestartProofHost = Readonly<{
  origin: string;
  fetch: typeof fetch;
  /** Stops the whole stack and starts it again from its existing images and volumes. */
  restart: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  source: Uint8Array;
  /** Makes this run's `sourceId` unique, so a second run against the same stack deploys its own version. */
  token: string;
  log: (line: string) => void;
}>;

export type RestartProofReport = Readonly<{
  processId: string;
  version: number;
  processInstanceId: string;
  claimGeneration: number;
}>;

type Json = unknown;

export async function proveRestartPreservesWork(host: RestartProofHost): Promise<RestartProofReport> {
  const deployed = record(await call(host, "POST",
    `/api/v1/definitions?sourceId=${encodeURIComponent(`restart-proof-${host.token}.bpmn`)}&semanticProfile=${semanticProfile}`,
    { contentType: "application/bpmn+xml", body: host.source }, [201]), "deploy result");
  if (deployed["status"] !== "deployed") throw new Error(`the proof model was not deployed: ${JSON.stringify(deployed)}`);
  const definition = record(deployed["definition"], "deployed definition");
  const processId = text(definition["processId"], "processId");
  const version = integer(definition["version"], "version");
  host.log(`RESTART_PROOF deployed processId=${processId} version=${String(version)}`);

  const started = record(await call(host, "POST",
    `/api/v1/definitions/${encodeURIComponent(processId)}/versions/${String(version)}/start`,
    { contentType: "application/json", body: '{"initialVariables":[]}' }, [201]), "start result");
  if (started["status"] !== "started") throw new Error(`the proof model was not started: ${JSON.stringify(started)}`);
  const processInstanceId = text(record(started["instance"], "started instance")["processInstanceId"], "processInstanceId");
  host.log(`RESTART_PROOF started processInstanceId=${processInstanceId}`);

  const open = await eventually(host, "the started instance's User Task", taskDeadlineMs,
    async () => taskOf(await workTasks(host), processInstanceId));
  if (open.claimableByCurrentActor !== true) throw new Error("the distribution's actor cannot claim the proof task");
  const claimActionId = `restart-proof-claim-${host.token}`;
  const claimed = record(await call(host, "PUT", `${taskPath(open.id)}/claim`,
    { contentType: "application/json", body: JSON.stringify({ actionId: claimActionId, expectedGeneration: open.claimGeneration }) }, [200, 201]), "claim result");
  const claim = record(claimed["claim"], "claim");
  const claimGeneration = integer(claim["generation"], "claim generation");
  host.log(`RESTART_PROOF claimed actor=${text(claim["actorId"], "claim actor")} generation=${String(claimGeneration)}`);

  await host.restart();
  host.log("RESTART_PROOF restarted without building or pulling");

  const kept = await eventually(host, "the same instance's User Task after the restart", restartDeadlineMs,
    async () => taskOf(await workTasks(host), processInstanceId));
  if (identity(kept.id) !== identity(open.id)) {
    throw new Error(`the restarted stack publishes another task: ${identity(kept.id)} instead of ${identity(open.id)}`);
  }
  if (JSON.stringify(kept.claim) !== JSON.stringify(claim)) {
    throw new Error(`the task's claim changed across the restart: ${JSON.stringify(kept.claim)} instead of ${JSON.stringify(claim)}`);
  }
  const listed = record(await call(host, "GET", "/api/v1/definitions", undefined, [200]), "definition list");
  if (!array(listed["definitions"], "definitions").some((entry) =>
    record(entry, "definition")["processId"] === processId)) {
    throw new Error(`the restarted stack no longer lists ${processId}`);
  }

  const completionActionId = `restart-proof-complete-${host.token}`;
  const completion = JSON.stringify({
    taskId: open.id,
    expectedClaimGeneration: claimGeneration,
    submittedValues: [{ key: approvalKey, value: { kind: "boolean", value: true } }],
  });
  // A completion is retry-safe under its action id, so an answer that is not final yet is simply asked for again.
  await eventually(host, "the committed completion", taskDeadlineMs, async () => {
    const result = record(await call(host, "PUT", `/api/v1/work-task-completions/${encodeURIComponent(completionActionId)}`,
      { contentType: "application/json", body: completion }, [200, 202]), "completion result");
    if (result["state"] === "rejected") throw new CompletionRefused(JSON.stringify(result));
    return result["state"] === "committed" ? result : undefined;
  });
  host.log("RESTART_PROOF completed");

  await eventually(host, "the completed instance to leave the task inbox", taskDeadlineMs,
    async () => taskOf(await workTasks(host), processInstanceId) === undefined ? true : undefined);
  host.log("RESTART_PROOF settled");
  return { processId, version, processInstanceId, claimGeneration };
}

class CompletionRefused extends Error {}

type OpenTask = Readonly<{
  id: Readonly<{ processInstanceId: string; elementId: string; activation: number }>;
  claimGeneration: number;
  claim: Json;
  claimableByCurrentActor: boolean;
}>;

async function workTasks(host: RestartProofHost): Promise<readonly Json[]> {
  const snapshot = record(await call(host, "GET", "/api/v1/work-tasks", undefined, [200]), "work task snapshot");
  return array(snapshot["tasks"], "tasks");
}

/** The open task hosted by `processInstanceId`, or `undefined` while the inbox does not list one. */
function taskOf(tasks: readonly Json[], processInstanceId: string): OpenTask | undefined {
  for (const entry of tasks) {
    const task = record(entry, "work task");
    if (record(task["hostingInstance"], "hosting instance")["processInstanceId"] !== processInstanceId) continue;
    const id = record(record(task["task"], "task")["id"], "task id");
    return {
      id: {
        processInstanceId: text(id["processInstanceId"], "task processInstanceId"),
        elementId: text(id["elementId"], "task elementId"),
        activation: integer(id["activation"], "task activation"),
      },
      claimGeneration: integer(task["claimGeneration"], "claimGeneration"),
      claim: task["claim"],
      claimableByCurrentActor: task["claimableByCurrentActor"] === true,
    };
  }
  return undefined;
}

function identity(id: OpenTask["id"]): string {
  return JSON.stringify([id.processInstanceId, id.elementId, id.activation]);
}

function taskPath(id: OpenTask["id"]): string {
  return `/api/v1/work-tasks/${encodeURIComponent(id.processInstanceId)}/${encodeURIComponent(id.elementId)}/${String(id.activation)}`;
}

async function call(
  host: RestartProofHost,
  method: string,
  pathAndQuery: string,
  request: Readonly<{ contentType: string; body: string | Uint8Array }> | undefined,
  statuses: readonly number[],
): Promise<Json> {
  const response = await host.fetch(new URL(pathAndQuery, host.origin), {
    method,
    headers: { accept: "application/json", ...(request === undefined ? {} : { "content-type": request.contentType }) },
    ...(request === undefined ? {} : { body: request.body as Exclude<NonNullable<Parameters<typeof fetch>[1]>["body"], null | undefined> }),
    signal: AbortSignal.timeout(requestDeadlineMs),
  });
  const body = await response.text();
  if (!statuses.includes(response.status)) throw new Error(`${method} ${pathAndQuery} answered HTTP ${String(response.status)}: ${body.slice(0, 300)}`);
  return JSON.parse(body) as Json;
}

/**
 * The first defined result of `attempt`, retried every second until `deadlineMs`. A refusal that retrying cannot change
 * is thrown at once; any other failure is the stack still coming up and is retried, and kept as the cause of a timeout.
 */
async function eventually<T>(host: RestartProofHost, label: string, deadlineMs: number, attempt: () => Promise<T | undefined>): Promise<T> {
  const deadline = host.now() + deadlineMs;
  let last: unknown;
  for (;;) {
    try {
      const value = await attempt();
      if (value !== undefined) return value;
    } catch (error) {
      if (error instanceof CompletionRefused) throw error;
      last = error;
    }
    if (host.now() >= deadline) {
      throw new Error(`${label} was not observed within ${String(deadlineMs)} ms${last instanceof Error ? `; last failure: ${last.message}` : ""}`, { cause: last });
    }
    await host.sleep(pollIntervalMs);
  }
}

function record(value: Json, label: string): Record<string, Json> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, Json>;
}

function array(value: Json, label: string): readonly Json[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function text(value: Json, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a nonempty string`);
  return value;
}

function integer(value: Json, label: string): number {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer`);
  return value as number;
}

/** The two commands that restart a stack from what it already has: no image is built and none is pulled. */
export function restartCommands(stack: "source" | "published", launcher?: string): ReadonlyArray<readonly string[]> {
  if (stack === "source") {
    return [["docker", "compose", "down", "--remove-orphans"], ["docker", "compose", "up", "--no-build", "--pull", "never", "--wait"]];
  }
  if (launcher === undefined) throw new TypeError("the published stack is restarted through its launcher, which the command line must name");
  return [[launcher, "stop"], [launcher, "start"]];
}

function run(command: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const [program, ...args] = command;
    const child = spawn(program!, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command.join(" ")} exited with ${String(code)}`)));
  });
}

async function main(args: readonly string[]): Promise<void> {
  const [stack, launcher, ...rest] = args;
  if ((stack !== "source" && stack !== "published") || rest.length > 0 || (stack === "source") !== (launcher === undefined)) {
    throw new TypeError("usage: node scripts/evaluation-distribution-restart.ts source | published <launcher>");
  }
  const commands = restartCommands(stack, launcher);
  const report = await proveRestartPreservesWork({
    origin: process.env["BPMN_EVALUATION_ORIGIN"] ?? "http://127.0.0.1:3000",
    fetch,
    restart: async () => {
      for (const command of commands) await run(command);
    },
    sleep: (ms) => delay(ms),
    now: () => Date.now(),
    source: new Uint8Array(await readFile(modelUrl)),
    token: `${String(Date.now())}-${String(process.pid)}`,
    log: (line) => process.stdout.write(`${line}\n`),
  });
  process.stdout.write(`RESTART_PROOF_PASSED ${JSON.stringify(report)}\n`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`Restart proof failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
