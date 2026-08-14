import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("registers the Query before commit and publishes before command-result resolution", async () => {
  const source = await readFile(
    new URL("../src/workflow-implementation.ts", import.meta.url),
    "utf8",
  );
  const registration = source.indexOf("registerExecutionPublicationQueryHandler(");
  const semanticLoop = source.indexOf("while (true)");
  const evaluation = source.indexOf("advanceScenario(", semanticLoop);
  const append = source.indexOf("accumulateExecutionPublication(");
  const result = source.indexOf("recordCommandOutcome(", append);
  assert.ok(registration >= 0 && registration < semanticLoop);
  assert.ok(evaluation >= 0 && append > evaluation && result > append);
  assert.doesNotMatch(source.slice(evaluation, append), /\bawait\b/u);
  assert.doesNotMatch(source.slice(append, result), /\bawait\b/u);
});
