/**
 * `ProcessClient.start`'s verdict and barrier. A committed start answers only once the chain's `settle` Update answered,
 * which waits for the start's registration and for the ingress's answer to the Signals it threw, so the caller's next
 * population command never overtakes them; and a committed start is reported committed even when that Update fails,
 * never as an error. The Temporal client here is a stub of the calls a start makes, so this runs without a server.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ApplicationFailure, WorkflowUpdateFailedError, type Client } from "@temporalio/client";

const { ProcessClient } = await import(new URL("../dist/client.js", import.meta.url).href) as typeof import("../src/client.ts");
const { textPage } = await import(new URL("../dist/capacity.js", import.meta.url).href) as typeof import("../src/capacity.ts");
const { ResultKind, rejectionType } = await import(new URL("../dist/protocol.js", import.meta.url).href) as
  typeof import("../src/protocol.ts");

const committedView = { status: "running", openWaits: [], addresses: [] };

/**
 * A Temporal client over one chain whose start committed (`view`, `null` when it did not), its registration done unless
 * `registering`; its `settle` Update answers with `settle`, sent with the start or after it alike.
 */
function chainClient(view: object | null, settle: () => Promise<number>, { result = null as unknown, registering = false } = {}): Client {
  const handle = {
    query: async (_query: unknown, from: number) => textPage({ revision: 1, view, halt: null, registering }, from),
    executeUpdate: () => settle(),
    result: async () => result,
  };
  return {
    workflow: {
      start: async () => handle,
      getHandle: () => handle,
      executeUpdateWithStart: () => settle(),
    },
  } as unknown as Client;
}

const request = { workflowId: "W", program: {}, config: {} as never, start: { kind: "start" } };

test("a start's verdict waits for the ingress's answer to the Signals it threw, even once its registration is done", async () => {
  let answer: (revision: number) => void = () => undefined;
  const answered = new Promise<number>((resolve) => { answer = resolve; });
  const starting = new ProcessClient(chainClient(committedView, () => answered), "queue").start(request);
  const early = await Promise.race([starting.then(() => "answered"), new Promise((resolve) => setImmediate(() => resolve("waiting")))]);
  assert.equal(early, "waiting", "the start answered before its Signal was");
  answer(3);
  assert.deepEqual(await starting, { outcome: "committed", code: null, revision: 3 });
});

test("a committed start whose settle Update is refused is reported committed, never as an error", async () => {
  const refused = () => Promise.reject(new WorkflowUpdateFailedError("Workflow Update failed",
    ApplicationFailure.create({ message: "host.capacity.updatesInFlight", type: rejectionType, nonRetryable: true })));
  assert.deepEqual(await new ProcessClient(chainClient(committedView, refused, { registering: true }), "queue").start(request),
    { outcome: "committed", code: null, revision: 1 });
});

test("a start that did not commit answers the chain's own verdict once its settle Update fails", async () => {
  const failed = () => Promise.reject(new WorkflowUpdateFailedError("Workflow Update failed",
    ApplicationFailure.create({ message: "start-not-committed", type: rejectionType, nonRetryable: true })));
  const result = { kind: ResultKind.NotStarted, outcome: "rejected", code: "kernel-refusal" };
  assert.deepEqual(await new ProcessClient(chainClient(null, failed, { result }), "queue").start(request),
    { outcome: "rejected", code: "kernel-refusal", revision: null });
});
