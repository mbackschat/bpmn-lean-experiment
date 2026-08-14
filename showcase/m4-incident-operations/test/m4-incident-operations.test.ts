/** Static boundary evidence for the isolated M4 browser harness. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  cancellationProfile,
  exactIncidentBpmnSource,
  exactSourceSha256,
  retryProfile,
  sha256,
} from "./fixture.ts";
import { privateFactPaths } from "./private-fact-scan.ts";

test("reuses the exact incident source with both graduated profiles", async () => {
  const source = await exactIncidentBpmnSource();
  assert.equal(sha256(source), exactSourceSha256);
  assert.deepEqual([
    retryProfile,
    cancellationProfile,
  ], [
    "cibseven-2.2.0-service-task-incident-draft",
    "cibseven-2.2.0-service-task-incident-cancellation-draft",
  ]);
});

test("keeps Playwright bounded and outside Product 1 verification", async () => {
  const [configuration, packageJson] = await Promise.all([
    readFile(new URL("../playwright.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(configuration, /timeout: 60_000/u);
  assert.match(configuration, /timeout: 60_000,/u);
  assert.doesNotMatch(packageJson, /verify|semantic|cib/iu);
});

test("private-fact scan catches nested host and transport regressions", () => {
  assert.deepEqual(privateFactPaths({
    nested: [{ workflowId: "bpmn-process-sha256:planted" }],
    copy: "Activity attempt and retry count must not escape",
    transport: { stimulus: { kind: "retryIncident" } },
  }), [
    "$.nested[0].workflowId",
    "$.nested[0].workflowId",
    "$.copy",
    "$.transport.stimulus",
  ]);
});
