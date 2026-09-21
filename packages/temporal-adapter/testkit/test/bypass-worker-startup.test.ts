import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { Worker } from "@temporalio/worker";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  runBranchBypassMutation,
  runEffectBypassMutation,
} from "@bpmn-lean/temporal-testkit";
import { serviceTaskEffectInput } from "./service-task-effect-fixture.ts";

const environment = { nativeConnection: {}, client: {} };
const input = serviceTaskEffectInput();
const probes = [
  ["effect", (id: string) => runEffectBypassMutation(
    environment as TestWorkflowEnvironment, input.scenario, input.semanticProcess, id, async () => {},
  )],
  ["retained trace", (id: string) => runBranchBypassMutation(
    environment as TestWorkflowEnvironment, input.scenario, input.semanticProcess, id, async () => [],
  )],
] as const;

for (const [name, run] of probes) {
  test(`${name} startup timeout shuts down a Worker that arrives later`, async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const creation = Promise.withResolvers<Worker>();
    let disposed = 0;
    context.mock.method(Worker, "create", () => creation.promise);
    const rejected = assert.rejects(run("late-worker"), /Worker startup exceeded 20000ms/u);
    context.mock.timers.tick(20_001);
    await rejected;

    creation.resolve({
      async runUntil(body: () => Promise<void>) {
        await body();
        disposed += 1;
      },
    } as unknown as Worker);
    await setImmediate();
    assert.equal(disposed, 1);
  });

  test(`${name} probes do not share a Worker registration after a failed startup`, async (context) => {
    const queues: string[] = [];
    const failure = new Error("worker creation refused");
    context.mock.method(Worker, "create", async (options: { taskQueue: string }) => {
      queues.push(options.taskQueue);
      throw failure;
    });
    await assert.rejects(run("first-probe"), (error) => error === failure);
    await assert.rejects(run("second-probe"), (error) => error === failure);
    assert.equal(queues.length, 2);
    assert.notEqual(queues[0], queues[1]);
  });

  test(`${name} successful startup retains its queue and joins shutdown when Workflow start fails`, async (context) => {
    const stopped = Promise.withResolvers<void>();
    const failure = new Error("workflow start refused");
    let workerQueue: string | undefined;
    let workflowQueue: string | undefined;
    let shutdowns = 0;
    context.mock.method(Worker, "create", async (options: { taskQueue: string }) => {
      workerQueue = options.taskQueue;
      return {
        run: () => stopped.promise,
        shutdown() { shutdowns += 1; stopped.resolve(); },
      };
    });
    context.mock.property(environment, "client", {
      workflow: {
        async start(_type: string, options: { taskQueue: string }) {
          workflowQueue = options.taskQueue;
          throw failure;
        },
      },
    });
    await assert.rejects(run("started-probe"), (error) => error === failure);
    assert.equal(workflowQueue, workerQueue);
    assert.equal(shutdowns, 1);
  });
}
