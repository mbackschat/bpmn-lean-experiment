/**
 * The engine API exposes admission facts needed by product 2 without exposing the checked graph or
 * Semantic Process program that remain private to product 1.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  EngineDefinitionCompilationStatus,
  compileBpmnDefinition,
} from "@bpmn-lean/engine-api";

const admittedSource = new URL(
  "../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);
const timerStartSource = new URL(
  "../../../scenarios/timer-start-event/process.bpmn",
  import.meta.url,
);
const limits = {
  maxBytes: 1_048_576,
  parserDeadlineMs: 1_000,
} as const;
const semanticProfile = "bpmn-2.0.2-user-task-preserved-notation-draft";

test("projects accepted source identity without exposing engine representations", async () => {
  const result = await compileBpmnDefinition({
    bytes: await readFile(admittedSource),
    sourceId: "third-party-review-process",
    semanticProfile,
    expectedSha256: undefined,
    limits,
  });

  assert.equal(result.status, EngineDefinitionCompilationStatus.Accepted);
  assert.equal(result.source.id, "third-party-review-process");
  assert.match(result.source.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.definition.processId, "Process_SequentialUserTask");
  assert.equal(result.definition.semanticProfile, semanticProfile);
  assert.deepEqual(result.startCapabilities, { timerStarts: [] });
  assert.equal("checkedProcess" in result, false);
  assert.equal("semanticProcess" in result, false);
});

test("projects the admitted Timer Start identity and normalized duration", async () => {
  const result = await compileBpmnDefinition({
    bytes: await readFile(timerStartSource),
    sourceId: "third-party-timer-start-process",
    semanticProfile: "bpmn-2.0.2-timer-start-event-draft",
    expectedSha256: undefined,
    limits,
  });

  assert.equal(result.status, EngineDefinitionCompilationStatus.Accepted);
  assert.deepEqual(result.startCapabilities, {
    timerStarts: [{ startEventId: "TimerStart_PT1S", durationMs: 1_000 }],
  });
  assert.equal("checkedProcess" in result, false);
  assert.equal("semanticProcess" in result, false);
});

test("retains every located rejection while keeping engine representations private", async () => {
  const source = (await readFile(admittedSource, "utf8")).replace(
    "<bpmn:textAnnotation",
    '<bpmn:scriptTask id="ScriptTask_1" name="Compute"/><bpmn:textAnnotation',
  );
  const result = await compileBpmnDefinition({
    bytes: new TextEncoder().encode(source),
    sourceId: "third-party-unsupported-process",
    semanticProfile,
    expectedSha256: undefined,
    limits,
  });

  assert.equal(result.status, EngineDefinitionCompilationStatus.Rejected);
  assert.deepEqual(
    result.diagnostics.map(({ code, element }) => ({
      code,
      id: element?.id,
      type: element?.type,
    })),
    [{
      code: "unsupportedElementType",
      id: "ScriptTask_1",
      type: "bpmn:ScriptTask",
    }],
  );
  assert.equal("checkedProcess" in result, false);
  assert.equal("semanticProcess" in result, false);
});
