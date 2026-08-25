import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
const sourceRevisionLabel = "org.opencontainers.image.revision";
const sourceTreeSha256Label = "io.bpmn-lean.evaluation.source-tree-sha256";
const demoApplicationImages = Object.freeze([
  "bpmn-lean/evaluation-platform-migrate:local",
  "bpmn-lean/evaluation-bpmn-worker:local",
  "bpmn-lean/evaluation-platform-api:local",
  "bpmn-lean/evaluation-platform-recovery-worker:local",
]);
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
  sourceRevision: string;
  sourceTreeSha256: string;
}>;

export type LiveDemoBuildIdentity = Readonly<{
  revision: string;
  sourceTreeSha256: string;
}>;

export type LiveDemoImageProvenance = Readonly<{
  image: string;
  sourceRevision: string;
  sourceTreeSha256: string;
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
  readImageProvenance?: (
    image: string,
    environment: NodeJS.ProcessEnv,
  ) => Promise<LiveDemoImageProvenance>;
  removeSession?: () => Promise<void>;
  resolveBuildIdentity?: () => Promise<LiveDemoBuildIdentity>;
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
  const buildIdentity = await (
    options.resolveBuildIdentity ?? resolveLiveDemoBuildIdentity
  )();
  const port = await (options.allocatePort ?? allocatePlaywrightLoopbackPort)();
  const session = liveDemoSession(port, buildIdentity);
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

  return startAndPublishLiveDemo({
    session,
    environment,
    upArgs: [...composePrefix, "up", "--build", "--wait"],
    cleanupArgs: [...composePrefix, "down", "--volumes", "--remove-orphans"],
    cleanupFailureMessage: "Live-demo preparation and cleanup both failed",
    mode: "prepared-online",
    afterStart: async () => {
      await verifyDemoImageProvenance(buildIdentity, environment, options);
    },
    options,
    run,
    writeLine,
  });
}

/** Starts only locally cached images whose labels match the current committed source. */
export async function startLiveDemo(
  options: LiveDemoOptions = {},
): Promise<LiveDemoSession> {
  const run = options.run ?? runCommand;
  const writeLine = options.writeLine ?? writeOutputLine;
  const buildIdentity = await (
    options.resolveBuildIdentity ?? resolveLiveDemoBuildIdentity
  )();
  const port = await (options.allocatePort ?? allocatePlaywrightLoopbackPort)();
  const session = liveDemoSession(port, buildIdentity);
  const environment = liveDemoEnvironment(session);
  const composePrefix = ["compose", "--project-name", session.projectName] as const;
  await (options.verifyFixtures ?? verifyDemoFixtures)();
  await run({
    command: "docker",
    args: ["info", "--format", "{{.ServerVersion}}"],
    environment,
  });
  await verifyDemoImageProvenance(buildIdentity, environment, options);
  await run({
    command: "docker",
    args: [...composePrefix, "down", "--remove-orphans"],
    environment,
  });

  return startAndPublishLiveDemo({
    session,
    environment,
    upArgs: [
      ...composePrefix,
      "up",
      "--no-build",
      "--pull",
      "never",
      "--wait",
    ],
    cleanupArgs: [...composePrefix, "down", "--remove-orphans"],
    cleanupFailureMessage: "Offline live-demo start and cleanup both failed",
    mode: "started-offline",
    options,
    run,
    writeLine,
  });
}

type StartAndPublishLiveDemoOptions = Readonly<{
  afterStart?: () => Promise<void>;
  cleanupArgs: readonly string[];
  cleanupFailureMessage: string;
  environment: NodeJS.ProcessEnv;
  mode: "prepared-online" | "started-offline";
  options: LiveDemoOptions;
  run: (invocation: LiveDemoCommandInvocation) => Promise<void>;
  session: LiveDemoSession;
  upArgs: readonly string[];
  writeLine: (line: string) => void;
}>;

async function startAndPublishLiveDemo(
  input: StartAndPublishLiveDemoOptions,
): Promise<LiveDemoSession> {
  let primaryFailure: unknown;
  try {
    await input.run({
      command: "docker",
      args: input.upArgs,
      environment: input.environment,
    });
    await input.afterStart?.();
    await (input.options.probe ?? probeEvaluationOrigin)(input.session.origin);
    await (input.options.writeSession ?? writeLiveDemoSession)(input.session);
  } catch (error: unknown) {
    primaryFailure = error;
  }

  if (primaryFailure !== undefined) {
    try {
      await input.run({
        command: "docker",
        args: input.cleanupArgs,
        environment: input.environment,
      });
    } catch (cleanupFailure: unknown) {
      throw new AggregateError(
        [primaryFailure, cleanupFailure],
        input.cleanupFailureMessage,
      );
    }
    throw primaryFailure;
  }

  reportPreparedDemo(input.session, input.mode, input.writeLine);
  return input.session;
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

function liveDemoSession(
  port: number,
  buildIdentity: LiveDemoBuildIdentity,
): LiveDemoSession {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError("Live-demo port must be a TCP port");
  }
  return Object.freeze({
    kind: "bpmnLeanLiveDemoSession",
    origin: `http://127.0.0.1:${port}`,
    port,
    projectName: liveDemoProjectName,
    sourceRevision: buildIdentity.revision,
    sourceTreeSha256: buildIdentity.sourceTreeSha256,
  });
}

function liveDemoEnvironment(session: LiveDemoSession): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BPMN_EVALUATION_ORIGIN: session.origin,
    BPMN_EVALUATION_PORT: String(session.port),
    BPMN_EVALUATION_PROJECTION_MAX_AGE_MS: "30000",
    BPMN_EVALUATION_PROJECTION_REFRESH_AFTER_MS: "5000",
    BPMN_EVALUATION_SOURCE_REVISION: session.sourceRevision,
    BPMN_EVALUATION_SOURCE_TREE_SHA256: session.sourceTreeSha256,
  };
}

async function resolveLiveDemoBuildIdentity(): Promise<LiveDemoBuildIdentity> {
  const environment = process.env;
  const status = await captureCommand({
    command: "git",
    args: ["status", "--porcelain=v1", "--untracked-files=all"],
    environment,
  });
  if (status.length !== 0) {
    throw new Error(
      "Live-demo preparation requires a clean committed worktree so cached images can be bound to exact source",
    );
  }
  const revision = (await captureCommand({
    command: "git",
    args: ["rev-parse", "HEAD"],
    environment,
  })).toString("utf8").trim();
  const sourceTree = await captureCommand({
    command: "git",
    args: ["ls-tree", "-r", "--full-tree", "-z", "HEAD"],
    environment,
  });
  if (!/^[0-9a-f]{40}$/u.test(revision)) {
    throw new Error("Git did not return a full committed source revision");
  }
  return Object.freeze({
    revision,
    sourceTreeSha256: createHash("sha256").update(sourceTree).digest("hex"),
  });
}

async function verifyDemoImageProvenance(
  expected: LiveDemoBuildIdentity,
  environment: NodeJS.ProcessEnv,
  options: LiveDemoOptions,
): Promise<void> {
  const readImageProvenance = options.readImageProvenance ?? readDemoImageProvenance;
  for (const image of demoApplicationImages) {
    const actual = await readImageProvenance(image, environment);
    if (
      actual.image !== image ||
      actual.sourceRevision !== expected.revision ||
      actual.sourceTreeSha256 !== expected.sourceTreeSha256
    ) {
      throw new Error(
        `Cached demo image ${image} does not match current committed source; run demo:prepare while online`,
      );
    }
  }
}

async function readDemoImageProvenance(
  image: string,
  environment: NodeJS.ProcessEnv,
): Promise<LiveDemoImageProvenance> {
  const format = `{{ index .Config.Labels "${sourceRevisionLabel}" }}\t{{ index .Config.Labels "${sourceTreeSha256Label}" }}`;
  const output = (await captureCommand({
    command: "docker",
    args: ["image", "inspect", "--format", format, image],
    environment,
  })).toString("utf8").trim();
  const [sourceRevision, sourceTreeSha256, ...extra] = output.split("\t");
  if (
    sourceRevision === undefined ||
    sourceTreeSha256 === undefined ||
    extra.length !== 0
  ) {
    throw new Error(`Cached demo image ${image} has malformed source labels`);
  }
  return Object.freeze({ image, sourceRevision, sourceTreeSha256 });
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
  const sourceRevision = candidate.sourceRevision;
  const sourceTreeSha256 = candidate.sourceTreeSha256;
  if (
    typeof sourceRevision !== "string" ||
    !/^[0-9a-f]{40}$/u.test(sourceRevision) ||
    typeof sourceTreeSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(sourceTreeSha256)
  ) {
    throw new TypeError("Live-demo session has invalid source provenance");
  }
  const expected = liveDemoSession(port, {
    revision: sourceRevision,
    sourceTreeSha256,
  });
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
  mode: "prepared-online" | "started-offline",
  writeLine: (line: string) => void,
): void {
  writeLine(`LIVE_DEMO_READY origin=${session.origin}`);
  writeLine(`LIVE_DEMO_MODE mode=${mode} revision=${session.sourceRevision} sourceTreeSha256=${session.sourceTreeSha256}`);
  writeLine("LIVE_DEMO_SCENARIO structured-human-work file=scenarios/expense-exception-review/process.bpmn profile=bpmn-2.0.2-bpmn-lean-structured-human-work-draft");
  writeLine("LIVE_DEMO_SCENARIO incident-operations file=scenarios/service-task-effect/process.bpmn profiles=cibseven-2.2.0-service-task-incident-draft,cibseven-2.2.0-service-task-incident-cancellation-draft");
  writeLine("LIVE_DEMO_HEADLINE command=./scripts/pnpm.sh run demo:mue-headline");
  writeLine("LIVE_DEMO_ALPHA command=./scripts/pnpm.sh run demo:mue-preview-alpha");
}

async function captureCommand(
  invocation: LiveDemoCommandInvocation,
): Promise<Buffer> {
  return new Promise<Buffer>((resolveCommand, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(invocation.command, [...invocation.args], {
      cwd: repositoryRoot,
      env: invocation.environment,
      stdio: ["ignore", "pipe", "inherit"],
    });
    child.stdout.on("data", (chunk: Buffer) => { chunks.push(chunk); });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveCommand(Buffer.concat(chunks));
        return;
      }
      reject(new Error(signal === null
        ? `${invocation.command} exited with code ${String(code)}`
        : `${invocation.command} exited after signal ${signal}`));
    });
  });
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
    case "start":
      await startLiveDemo();
      return;
    case "status":
      await inspectLiveDemo();
      return;
    case "stop":
      await stopLiveDemo();
      return;
    default:
      throw new TypeError("usage: node scripts/live-demo.ts prepare|start|status|stop");
  }
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  void main(process.argv[2]).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
