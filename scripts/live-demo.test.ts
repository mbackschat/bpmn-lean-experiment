import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  inspectLiveDemo,
  prepareLiveDemo,
  stopLiveDemo,
} from "./live-demo.ts";
import type {
  LiveDemoCommandInvocation,
  LiveDemoSession,
} from "./live-demo.ts";

const session: LiveDemoSession = Object.freeze({
  kind: "bpmnLeanLiveDemoSession",
  origin: "http://127.0.0.1:38121",
  port: 38121,
  projectName: "bpmn-lean-live-demo",
});

test("publishes the three demo lifecycle commands through the script registry", async () => {
  const [manifestSource, registry] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("./README.md", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource) as Readonly<{
    scripts?: Readonly<Record<string, string>>;
  }>;

  assert.equal(manifest.scripts?.["demo:prepare"], "node scripts/live-demo.ts prepare");
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
  ]);
  for (const invocation of commands) {
    assert.equal(invocation.environment.BPMN_EVALUATION_ORIGIN, session.origin);
    assert.equal(invocation.environment.BPMN_EVALUATION_PORT, String(session.port));
  }
  assert.equal(output.some((line) => line.includes("scenarios/expense-exception-review/process.bpmn")), true);
  assert.equal(output.some((line) => line.includes("scenarios/service-task-effect/process.bpmn")), true);
  assert.equal(output.some((line) => line.includes("demo:mue-headline")), true);
  assert.equal(output.some((line) => line.includes("demo:mue-preview-alpha")), true);
});

test("removes a partial isolated stack when public readiness fails", async () => {
  const commands: LiveDemoCommandInvocation[] = [];
  const failure = new Error("public origin unavailable");

  await assert.rejects(prepareLiveDemo({
    allocatePort: async () => session.port,
    verifyFixtures: async () => {},
    run: async (invocation) => { commands.push(invocation); },
    probe: async () => { throw failure; },
    writeSession: async () => { throw new Error("a failed preparation must not publish a session"); },
    writeLine: () => {},
  }), failure);

  assert.equal(commands.length, 4);
  assert.deepEqual(commands.at(-1)?.args, [
    "compose",
    "--project-name",
    session.projectName,
    "down",
    "--volumes",
    "--remove-orphans",
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
