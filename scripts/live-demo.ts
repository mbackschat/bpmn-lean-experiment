import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { allocatePlaywrightLoopbackPort } from "./playwright-loopback-ports.ts";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const sessionPath = resolve(repositoryRoot, ".cache/live-demo/session.json");
const liveDemoProjectName = "bpmn-lean-live-demo";
const demoFixturePaths = Object.freeze([
  "scenarios/expense-exception-review/process.bpmn",
  "scenarios/service-task-effect/process.bpmn",
  "scenarios/sequential-multi-instance/process.bpmn",
]);

export type LiveDemoSession = Readonly<{
  kind: "bpmnLeanLiveDemoSession";
  origin: string;
  port: number;
  projectName: typeof liveDemoProjectName;
}>;

export type LiveDemoCommandInvocation = Readonly<{
  command: string;
  args: readonly string[];
  environment: NodeJS.ProcessEnv;
}>;

type LiveDemoOptions = Readonly<{
  allocatePort?: () => Promise<number>;
  probe?: (origin: string) => Promise<void>;
  readSession?: () => Promise<LiveDemoSession>;
  removeSession?: () => Promise<void>;
  run?: (invocation: LiveDemoCommandInvocation) => Promise<void>;
  verifyFixtures?: () => Promise<void>;
  writeLine?: (line: string) => void;
  writeSession?: (session: LiveDemoSession) => Promise<void>;
}>;

/** Starts a fresh demo-only Compose project and proves its public origin before publishing it. */
export async function prepareLiveDemo(
  options: LiveDemoOptions = {},
): Promise<LiveDemoSession> {
  const run = options.run ?? runCommand;
  const writeLine = options.writeLine ?? writeOutputLine;
  const port = await (options.allocatePort ?? allocatePlaywrightLoopbackPort)();
  const session = liveDemoSession(port);
  const environment = liveDemoEnvironment(session);
  const composePrefix = ["compose", "--project-name", session.projectName] as const;
  await (options.verifyFixtures ?? verifyDemoFixtures)();
  await run({
    command: "docker",
    args: ["info", "--format", "{{.ServerVersion}}"],
    environment,
  });
  await run({
    command: "docker",
    args: [...composePrefix, "down", "--volumes", "--remove-orphans"],
    environment,
  });

  let primaryFailure: unknown;
  try {
    await run({
      command: "docker",
      args: [...composePrefix, "up", "--build", "--wait"],
      environment,
    });
    await (options.probe ?? probeEvaluationOrigin)(session.origin);
    await (options.writeSession ?? writeLiveDemoSession)(session);
  } catch (error: unknown) {
    primaryFailure = error;
  }

  if (primaryFailure !== undefined) {
    try {
      await run({
        command: "docker",
        args: [...composePrefix, "down", "--volumes", "--remove-orphans"],
        environment,
      });
    } catch (cleanupFailure: unknown) {
      throw new AggregateError(
        [primaryFailure, cleanupFailure],
        "Live-demo preparation and cleanup both failed",
      );
    }
    throw primaryFailure;
  }

  reportPreparedDemo(session, writeLine);
  return session;
}

/** Rechecks the exact recorded Compose project and public API without changing its data. */
export async function inspectLiveDemo(
  options: LiveDemoOptions = {},
): Promise<LiveDemoSession> {
  const session = await (options.readSession ?? readLiveDemoSession)();
  await (options.run ?? runCommand)({
    command: "docker",
    args: ["compose", "--project-name", session.projectName, "ps"],
    environment: liveDemoEnvironment(session),
  });
  await (options.probe ?? probeEvaluationOrigin)(session.origin);
  (options.writeLine ?? writeOutputLine)(`LIVE_DEMO_HEALTHY origin=${session.origin}`);
  return session;
}

/** Stops only the recorded demo project and deliberately preserves its demo-only volumes. */
export async function stopLiveDemo(
  options: LiveDemoOptions = {},
): Promise<void> {
  const session = await (options.readSession ?? readLiveDemoSession)();
  await (options.run ?? runCommand)({
    command: "docker",
    args: ["compose", "--project-name", session.projectName, "down", "--remove-orphans"],
    environment: liveDemoEnvironment(session),
  });
  await (options.removeSession ?? removeLiveDemoSession)();
  (options.writeLine ?? writeOutputLine)(`LIVE_DEMO_STOPPED project=${session.projectName}`);
}

function liveDemoSession(port: number): LiveDemoSession {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError("Live-demo port must be a TCP port");
  }
  return Object.freeze({
    kind: "bpmnLeanLiveDemoSession",
    origin: `http://127.0.0.1:${port}`,
    port,
    projectName: liveDemoProjectName,
  });
}

function liveDemoEnvironment(session: LiveDemoSession): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BPMN_EVALUATION_ORIGIN: session.origin,
    BPMN_EVALUATION_PORT: String(session.port),
    BPMN_EVALUATION_PROJECTION_MAX_AGE_MS: "30000",
    BPMN_EVALUATION_PROJECTION_REFRESH_AFTER_MS: "5000",
  };
}

async function verifyDemoFixtures(): Promise<void> {
  await Promise.all(demoFixturePaths.map(async (relativePath) => {
    await access(resolve(repositoryRoot, relativePath));
  }));
}

async function probeEvaluationOrigin(origin: string): Promise<void> {
  const [definitions, application] = await Promise.all([
    fetch(new URL("/api/v1/definitions", origin)),
    fetch(new URL("/", origin)),
  ]);
  if (!definitions.ok) {
    throw new Error(`Live-demo definitions probe returned HTTP ${definitions.status}`);
  }
  if (!application.ok) {
    throw new Error(`Live-demo application probe returned HTTP ${application.status}`);
  }
  await definitions.json();
  const html = await application.text();
  if (!html.includes("id=\"root\"")) {
    throw new Error("Live-demo application probe did not return the Product 2 shell");
  }
}

async function runCommand(invocation: LiveDemoCommandInvocation): Promise<void> {
  await new Promise<void>((resolveCommand, reject) => {
    const child = spawn(invocation.command, [...invocation.args], {
      cwd: repositoryRoot,
      env: invocation.environment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveCommand();
        return;
      }
      reject(new Error(signal === null
        ? `${invocation.command} exited with code ${String(code)}`
        : `${invocation.command} exited after signal ${signal}`));
    });
  });
}

async function writeLiveDemoSession(session: LiveDemoSession): Promise<void> {
  await mkdir(dirname(sessionPath), { recursive: true });
  const pendingPath = `${sessionPath}.pending-${process.pid}`;
  await writeFile(pendingPath, `${JSON.stringify(session)}\n`, "utf8");
  await rename(pendingPath, sessionPath);
}

async function readLiveDemoSession(): Promise<LiveDemoSession> {
  let source: string;
  try {
    source = await readFile(sessionPath, "utf8");
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error("No prepared live demo is recorded. Run demo:prepare first.");
    }
    throw error;
  }
  return decodeLiveDemoSession(JSON.parse(source) as unknown);
}

function decodeLiveDemoSession(value: unknown): LiveDemoSession {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("Live-demo session must be an object");
  }
  const candidate = value as Record<string, unknown>;
  const port = candidate.port;
  if (
    candidate.kind !== "bpmnLeanLiveDemoSession" ||
    candidate.projectName !== liveDemoProjectName ||
    typeof candidate.origin !== "string" ||
    typeof port !== "number" ||
    !Number.isSafeInteger(port)
  ) {
    throw new TypeError("Live-demo session has an invalid closed shape");
  }
  const expected = liveDemoSession(port);
  if (candidate.origin !== expected.origin) {
    throw new TypeError("Live-demo session origin does not match its loopback port");
  }
  return expected;
}

async function removeLiveDemoSession(): Promise<void> {
  await rm(sessionPath, { force: true });
}

function reportPreparedDemo(
  session: LiveDemoSession,
  writeLine: (line: string) => void,
): void {
  writeLine(`LIVE_DEMO_READY origin=${session.origin}`);
  writeLine("LIVE_DEMO_SCENARIO structured-human-work file=scenarios/expense-exception-review/process.bpmn profile=bpmn-2.0.2-bpmn-lean-structured-human-work-draft");
  writeLine("LIVE_DEMO_SCENARIO incident-operations file=scenarios/service-task-effect/process.bpmn profiles=cibseven-2.2.0-service-task-incident-draft,cibseven-2.2.0-service-task-incident-cancellation-draft");
  writeLine("LIVE_DEMO_HEADLINE command=./scripts/pnpm.sh run demo:mue-headline");
  writeLine("LIVE_DEMO_ALPHA command=./scripts/pnpm.sh run demo:mue-preview-alpha");
}

function writeOutputLine(line: string): void {
  process.stdout.write(`${line}\n`);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isEntryPoint(moduleUrl: string, argvEntry: string | undefined): boolean {
  return argvEntry !== undefined && pathToFileURL(resolve(argvEntry)).href === moduleUrl;
}

async function main(command: string | undefined): Promise<void> {
  switch (command) {
    case "prepare":
      await prepareLiveDemo();
      return;
    case "status":
      await inspectLiveDemo();
      return;
    case "stop":
      await stopLiveDemo();
      return;
    default:
      throw new TypeError("usage: node scripts/live-demo.ts prepare|status|stop");
  }
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  void main(process.argv[2]).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
