import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";

import {
  ExecutionPublicationResultKind,
  FlowNodeOccurrencePublicationResultKind,
  publicationUnavailableKind,
  readPublicationUntilAnswered,
} from "@bpmn-lean/temporal-testkit";

type Reading =
  | Readonly<{ kind: "available"; headRevision: number }>
  | Readonly<{ kind: "notReady" }>
  | Readonly<{ kind: "notFound" }>
  | Readonly<{ kind: "gap" }>
  | Readonly<{ kind: "unavailable" }>;

const tinyPolicy = { pauseMs: 1, hangGuardMs: 40 } as const;

function scripted(
  results: ReadonlyArray<Reading>,
): Readonly<{ read: () => Promise<Reading>; calls: () => number }> {
  let calls = 0;
  return {
    read: async () => {
      const result = results[Math.min(calls, results.length - 1)];
      calls += 1;
      assert.ok(result !== undefined);
      return result;
    },
    calls: () => calls,
  };
}

/** Captures the reader's retry log so the test output stays quiet and the lines can be counted. */
function captureWarnings(context: TestContext): () => ReadonlyArray<ReadonlyArray<unknown>> {
  const warn = context.mock.method(console, "warn", () => undefined);
  return () => warn.mock.calls.map((call) => call.arguments);
}

test("rereads an unavailable publication until the client has an answer", async (context) => {
  captureWarnings(context);
  const source = scripted([
    { kind: "unavailable" },
    { kind: "unavailable" },
    { kind: "available", headRevision: 7 },
  ]);

  const answered = await readPublicationUntilAnswered("scripted", source.read, tinyPolicy);

  assert.deepEqual(answered, { kind: "available", headRevision: 7 });
  assert.equal(source.calls(), 3);
});

for (const kind of ["available", "notReady", "notFound", "gap"] as const) {
  test(`returns ${kind} from the first read without rereading or logging`, async (context) => {
    const warnings = captureWarnings(context);
    const reading: Reading = kind === "available" ? { kind, headRevision: 1 } : { kind };
    const source = scripted([reading, { kind: "available", headRevision: 99 }]);

    const answered = await readPublicationUntilAnswered("scripted", source.read, tinyPolicy);

    assert.equal(answered, reading);
    assert.equal(source.calls(), 1);
    assert.deepEqual(warnings(), []);
  });
}

test("writes exactly one console.warn line per reread, naming the operation and the attempt", async (context) => {
  const warnings = captureWarnings(context);
  const source = scripted([
    { kind: "unavailable" },
    { kind: "unavailable" },
    { kind: "available", headRevision: 7 },
  ]);

  await readPublicationUntilAnswered("E1 publication", source.read, tinyPolicy);

  assert.equal(warnings().length, 2);
  warnings().forEach((argumentsOfCall, index) => {
    assert.equal(argumentsOfCall.length, 1);
    const line = argumentsOfCall[0];
    assert.equal(typeof line, "string");
    assert.ok(typeof line === "string" && !line.includes("\n"));
    assert.match(line, /"E1 publication"/u);
    assert.match(line, new RegExp(`attempt ${index + 1} returned unavailable`, "u"));
  });
});

test("does not retry a read that throws", async (context) => {
  const warnings = captureWarnings(context);
  let calls = 0;
  const failure = new Error("malformed publication");

  await assert.rejects(
    readPublicationUntilAnswered<Reading>("throwing", async () => {
      calls += 1;
      throw failure;
    }, tinyPolicy),
    (error: unknown) => error === failure,
  );
  assert.equal(calls, 1);
  assert.deepEqual(warnings(), []);
});

test("fails a permanently unavailable publication at the hang guard, naming operation and attempts", async (context) => {
  const warnings = captureWarnings(context);
  const source = scripted([{ kind: "unavailable" }]);

  await assert.rejects(
    readPublicationUntilAnswered("stuck E1 publication", source.read, tinyPolicy),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /stuck E1 publication/u);
      assert.match(error.message, new RegExp(`${source.calls()} attempts`, "u"));
      assert.match(error.message, /hang guard 40 ms/u);
      return true;
    },
  );
  assert.ok(source.calls() > 1, "the guard must reread before giving up");
  assert.equal(warnings().length, source.calls() - 1, "the failing attempt is reported by the error, not the log");
});

test("matches the wire arm of both client publication result kinds", () => {
  assert.equal(ExecutionPublicationResultKind.Unavailable, publicationUnavailableKind);
  assert.equal(FlowNodeOccurrencePublicationResultKind.Unavailable, publicationUnavailableKind);
});
