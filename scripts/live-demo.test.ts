import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  inspectLiveDemo,
  prepareLiveDemo,
  resetLiveDemo,
  startLiveDemo,
  stopLiveDemo,
} from "./live-demo.ts";
import type {
  LiveDemoBuildIdentity,
  LiveDemoCommandInvocation,
  LiveDemoImageProvenance,
  LiveDemoSession,
} from "./live-demo.ts";

const buildIdentity: LiveDemoBuildIdentity = Object.freeze({
  revision: "0123456789abcdef0123456789abcdef01234567",
  sourceTreeSha256: "89abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567",
});

const session: LiveDemoSession = Object.freeze({
  kind: "bpmnLeanLiveDemoSession",
  origin: "http://127.0.0.1:38121",
  port: 38121,
  projectName: "bpmn-lean-live-demo",
  sourceRevision: buildIdentity.revision,
  sourceTreeSha256: buildIdentity.sourceTreeSha256,
});

const applicationImages = Object.freeze([
  "bpmn-lean/evaluation-platform-migrate:local",
  "bpmn-lean/evaluation-bpmn-worker:local",
  "bpmn-lean/evaluation-platform-api:local",
  "bpmn-lean/evaluation-platform-recovery-worker:local",
  "bpmn-lean/evaluation-guided-demo-seed:local",
]);

test("publishes the five demo lifecycle commands through the script registry", async () => {
  const [manifestSource, registry] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("./README.md", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource) as Readonly<{
    scripts?: Readonly<Record<string, string>>;
  }>;

  assert.equal(manifest.scripts?.["demo:prepare"], "node scripts/live-demo.ts prepare");
  assert.equal(manifest.scripts?.["demo:reset"], "node scripts/live-demo.ts reset");
  assert.equal(manifest.scripts?.["demo:start"], "node scripts/live-demo.ts start");
  assert.equal(manifest.scripts?.["demo:status"], "node scripts/live-demo.ts status");
  assert.equal(manifest.scripts?.["demo:stop"], "node scripts/live-demo.ts stop");
  assert.match(registry, /\[`live-demo\.ts`\]\(live-demo\.ts\)/u);
});

test("prepares one fresh isolated evaluation stack and reports exact public demo inputs", async () => {
  const commands: LiveDemoCommandInvocation[] = [];
  const probes: string[] = [];
  const written: LiveDemoSession[] = [];
  const output: string[] = [];

  const prepared = await prepareLiveDemo({
    allocatePort: async () => session.port,
    resolveBuildIdentity: async () => buildIdentity,
    readImageProvenance: matchingImageProvenance,
    verifyFixtures: async () => {},
    run: async (invocation) => { commands.push(invocation); },
    probe: async (origin) => { probes.push(origin); },
    writeSession: async (value) => { written.push(value); },
    writeLine: (line) => { output.push(line); },
  });

  assert.deepEqual(prepared, session);
  assert.deepEqual(probes, [session.origin]);
  assert.deepEqual(written, [session]);
  assert.deepEqual(commands.map(({ command, args }) => ({ command, args })), [
    { command: "docker", args: ["info", "--format", "{{.ServerVersion}}"] },
    {
      command: "docker",
      args: ["compose", "--project-name", session.projectName, "down", "--volumes", "--remove-orphans"],
    },
    {
      command: "docker",
      args: ["compose", "--project-name", session.projectName, "up", "--build", "--wait"],
    },
    {
      command: "docker",
      args: [
        "compose",
        "--project-name",
        session.projectName,
        "--profile",
        "demo",
        "run",
        "--rm",
        "--build",
        "--no-deps",
        "guided-demo-seed",
      ],
    },
  ]);
  for (const invocation of commands) {
    assert.equal(invocation.environment.BPMN_EVALUATION_ORIGIN, session.origin);
    assert.equal(invocation.environment.BPMN_EVALUATION_PORT, String(session.port));
    assert.equal(invocation.environment.BPMN_EVALUATION_SOURCE_REVISION, buildIdentity.revision);
    assert.equal(invocation.environment.BPMN_EVALUATION_SOURCE_TREE_SHA256, buildIdentity.sourceTreeSha256);
  }
  assert.equal(output.some((line) => line.includes("mode=prepared-online")), true);
  assert.equal(output.some((line) => line.includes("scenarios/expense-exception-review/process.bpmn")), true);
  assert.equal(output.some((line) => line.includes("scenarios/service-task-effect/process.bpmn")), true);
  assert.equal(output.some((line) => line.includes("?audience=demo")), true);
});

test("removes a partial isolated stack when public readiness fails", async () => {
  const commands: LiveDemoCommandInvocation[] = [];
  const failure = new Error("public origin unavailable");

  await assert.rejects(prepareLiveDemo({
    allocatePort: async () => session.port,
    resolveBuildIdentity: async () => buildIdentity,
    readImageProvenance: matchingImageProvenance,
    verifyFixtures: async () => {},
    run: async (invocation) => { commands.push(invocation); },
    probe: async () => { throw failure; },
    writeSession: async () => { throw new Error("a failed preparation must not publish a session"); },
    writeLine: () => {},
  }), failure);

  assert.equal(commands.length, 5);
  assert.deepEqual(commands.at(-1)?.args, [
    "compose",
    "--project-name",
    session.projectName,
    "down",
    "--volumes",
    "--remove-orphans",
  ]);
});

test("resets cached images to one freshly seeded offline audience state", async () => {
  const commands: LiveDemoCommandInvocation[] = [];
  const output: string[] = [];

  const reset = await resetLiveDemo({
    allocatePort: async () => session.port,
    resolveBuildIdentity: async () => buildIdentity,
    readImageProvenance: matchingImageProvenance,
    verifyFixtures: async () => {},
    run: async (invocation) => { commands.push(invocation); },
    probe: async () => {},
    writeSession: async () => {},
    writeLine: (line) => { output.push(line); },
  });

  assert.deepEqual(reset, session);
  assert.deepEqual(commands.map(({ command, args }) => ({ command, args })), [
    { command: "docker", args: ["info", "--format", "{{.ServerVersion}}"] },
    {
      command: "docker",
      args: ["compose", "--project-name", session.projectName, "down", "--volumes", "--remove-orphans"],
    },
    {
      command: "docker",
      args: [
        "compose",
        "--project-name",
        session.projectName,
        "up",
        "--no-build",
        "--pull",
        "never",
        "--wait",
      ],
    },
    {
      command: "docker",
      args: [
        "compose",
        "--project-name",
        session.projectName,
        "--profile",
        "demo",
        "run",
        "--rm",
        "--no-deps",
        "--pull",
        "never",
        "guided-demo-seed",
      ],
    },
  ]);
  assert.equal(output.some((line) => line.includes("mode=reset-offline")), true);
});

test("starts only commit-bound cached images without build or pull", async () => {
  const commands: LiveDemoCommandInvocation[] = [];
  const output: string[] = [];

  const started = await startLiveDemo({
    allocatePort: async () => session.port,
    resolveBuildIdentity: async () => buildIdentity,
    readImageProvenance: matchingImageProvenance,
    verifyFixtures: async () => {},
    run: async (invocation) => { commands.push(invocation); },
    probe: async () => {},
    writeSession: async () => {},
    writeLine: (line) => { output.push(line); },
  });

  assert.deepEqual(started, session);
  assert.deepEqual(commands.map(({ command, args }) => ({ command, args })), [
    { command: "docker", args: ["info", "--format", "{{.ServerVersion}}"] },
    {
      command: "docker",
      args: ["compose", "--project-name", session.projectName, "down", "--remove-orphans"],
    },
    {
      command: "docker",
      args: [
        "compose",
        "--project-name",
        session.projectName,
        "up",
        "--no-build",
        "--pull",
        "never",
        "--wait",
      ],
    },
  ]);
  assert.equal(output.some((line) => line.includes("mode=started-offline")), true);
});

test("refuses a stale cached image before changing the Compose project", async () => {
  const commands: LiveDemoCommandInvocation[] = [];

  await assert.rejects(startLiveDemo({
    allocatePort: async () => session.port,
    resolveBuildIdentity: async () => buildIdentity,
    readImageProvenance: async (image) => ({
      image,
      sourceRevision: "ffffffffffffffffffffffffffffffffffffffff",
      sourceTreeSha256: buildIdentity.sourceTreeSha256,
    }),
    verifyFixtures: async () => {},
    run: async (invocation) => { commands.push(invocation); },
    writeLine: () => {},
  }), /does not match current committed source/u);

  assert.deepEqual(commands.map(({ args }) => args), [
    ["info", "--format", "{{.ServerVersion}}"],
  ]);
});

test("inspects and stops only the recorded demo project", async () => {
  const commands: LiveDemoCommandInvocation[] = [];
  const probes: string[] = [];
  let removed = false;
  const options = {
    readSession: async () => session,
    run: async (invocation: LiveDemoCommandInvocation) => { commands.push(invocation); },
    probe: async (origin: string) => { probes.push(origin); },
    removeSession: async () => { removed = true; },
    writeLine: () => {},
  };

  assert.deepEqual(await inspectLiveDemo(options), session);
  await stopLiveDemo(options);

  assert.deepEqual(probes, [session.origin]);
  assert.deepEqual(commands.map(({ args }) => args), [
    ["compose", "--project-name", session.projectName, "ps"],
    ["compose", "--project-name", session.projectName, "down", "--remove-orphans"],
  ]);
  assert.equal(commands[1]?.args.includes("--volumes"), false);
  assert.equal(removed, true);
});

async function matchingImageProvenance(image: string): Promise<LiveDemoImageProvenance> {
  assert.equal(applicationImages.includes(image), true);
  return {
    image,
    sourceRevision: buildIdentity.revision,
    sourceTreeSha256: buildIdentity.sourceTreeSha256,
  };
}
