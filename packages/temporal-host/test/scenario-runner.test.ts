/**
 * The scenario runner's verdicts where the host has no live Workflow to ask: an input after the chain ended is judged
 * by the kernel from the chain's final state, as an input before any instance is judged by the kernel with no state.
 * The client here is the TypeScript kernel behind the Temporal client's verdicts, so this runs without a server.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";

import type { JsonValue } from "../src/port.ts";
import type { ScenarioClient } from "../src/scenario-runner.ts";

const { kernelPort } = await import(new URL("../dist/kernel-port.js", import.meta.url).href) as
  typeof import("../src/kernel-port.ts");
const { runScenarioThroughHost } = await import(new URL("../dist/scenario-runner.js", import.meta.url).href) as
  typeof import("../src/scenario-runner.ts");
const { workflowClosed } = await import(new URL("../dist/host-contract.js", import.meta.url).href) as
  typeof import("../src/host-contract.ts");

async function userTaskProgram(): Promise<JsonValue> {
  const read = await readKernelProgram({
    bytes: await readFile(new URL("../../../scenarios/user-task-preserved-notation/process.bpmn", import.meta.url)),
    overlay: null,
    profile: "test-profile",
    limits: { maxBytes: 1_048_576, parserDeadlineMs: 1_000 },
  }, kernelProfileOptions([]));
  if (read.kind !== "read") throw new Error(`reader refused ${read.code}`);
  return JSON.parse(JSON.stringify(read.program)) as JsonValue;
}

/** One chain over the kernel that, like a closed Workflow, refuses every input once its instance has ended. */
function closingClient(programJson: JsonValue): ScenarioClient {
  const program = kernelPort.decodeProgram(programJson);
  let state: ReturnType<typeof kernelPort.decodeState> | null = null;
  const apply = (stimulus: JsonValue) => {
    if (state !== null && member(kernelPort.observation(program, state), "status") !== "running") {
      return Promise.resolve({ outcome: "rejected" as const, code: workflowClosed, revision: null });
    }
    const verdict = kernelPort.step(program, state, kernelPort.decodeStimulus(stimulus).input);
    if (!verdict.committed) return Promise.resolve({ outcome: verdict.outcome, code: verdict.code, revision: null });
    state = verdict.state;
    return Promise.resolve({ outcome: "committed" as const, code: null, revision: null });
  };
  return {
    start: ({ start }) => apply(start),
    command: (_, stimulus) => apply(stimulus),
    deliver: (_, stimulus) => apply(stimulus),
    timerFire: (_, stimulus) => apply(stimulus),
    effectResult: (_, stimulus) => apply(stimulus),
    observation: () => Promise.resolve(state === null ? null : kernelPort.observation(program, state)),
    state: () => Promise.resolve(state === null ? null : kernelPort.encodeState(state)),
  };
}

function member(value: JsonValue, name: string): JsonValue | undefined {
  // `Array.isArray` does not narrow a readonly array out of the union, so the record is named explicitly.
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as { readonly [key: string]: JsonValue })[name]
    : undefined;
}

const complete = (commandId: string) => ({
  kind: "command",
  commandId,
  occurrence: { processInstanceId: "I", elementId: "UserTask_Approve", activation: 1 },
  action: { kind: "completeUserTask", values: [] },
});

test("an input after the chain ended carries the kernel's verdict, never the host's closed-chain code", async () => {
  const program = await userTaskProgram();
  const scenario = {
    stimuli: [{ kind: "start", commandId: "start", instanceId: "I", variables: [] }, complete("complete"), complete("stale")],
  };
  const result = await runScenarioThroughHost(kernelPort, { client: closingClient(program), workflowIdPrefix: "w" },
    program, scenario);
  const trace = member(result, "trace");
  assert.ok(Array.isArray(trace));
  assert.deepEqual(trace.at(-2), { kind: "command", commandId: "stale", outcome: "rejected", code: "instance-not-running" });
});

test("a chain the runner started that the host no longer knows is a harness failure, never a semantic verdict", async () => {
  const program = await userTaskProgram();
  const forgetting: ScenarioClient = {
    ...closingClient(program),
    command: () => Promise.resolve({ outcome: "rejected" as const, code: "workflow-unknown", revision: null }),
  };
  const scenario = { stimuli: [{ kind: "start", commandId: "start", instanceId: "I", variables: [] }, complete("complete")] };
  await assert.rejects(runScenarioThroughHost(kernelPort, { client: forgetting, workflowIdPrefix: "w" }, program, scenario),
    /no longer knows chain w-1/u);
});

test("a run starts its chain under the host's history budget, the program's own when it names none", async () => {
  const program = await userTaskProgram();
  const budgets: Array<number | null> = [];
  const recording = (client: ScenarioClient): ScenarioClient => ({
    ...client,
    start: (request) => {
      budgets.push(request.config.historyEventBudget);
      return client.start(request);
    },
  });
  const scenario = { stimuli: [{ kind: "start", commandId: "start", instanceId: "I", variables: [] }] };
  await runScenarioThroughHost(kernelPort, { client: recording(closingClient(program)), workflowIdPrefix: "w" }, program, scenario);
  await runScenarioThroughHost(kernelPort, { client: recording(closingClient(program)), workflowIdPrefix: "w", historyEventBudget: 12 },
    program, scenario);
  assert.deepEqual(budgets, [null, 12]);
});
