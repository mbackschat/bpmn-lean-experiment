import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detail = await readFile(
  new URL("../src/process-instance-execution-detail.tsx", import.meta.url),
  "utf8",
);
const operatorHistory = await readFile(
  new URL("../src/process-operator-history.tsx", import.meta.url),
  "utf8",
);

test("keeps one confirmed-instance shell while independently gating semantic tabs", () => {
  assert.match(detail, /data-ui="process-execution-detail"/u);
  assert.match(detail, /state\.kind === ProcessExecutionDetailLoadKind\.Current\s*\? \[\{/u);
  assert.match(detail, /label: "Overview"/u);
  assert.match(detail, /label: "History"/u);
  assert.match(detail, /label: "Diagram"/u);
  assert.match(detail, /label: "Operator history"/u);
  assert.match(detail, /: "operator-history";/u);
  assert.match(detail, /Overview, History, Diagram, and execution export are suppressed\. Operator history remains available\./u);
});

test("loads operator audit independently and focuses only its active failure", () => {
  assert.match(operatorHistory, /void api\.get\(instance\)\.then/u);
  assert.match(operatorHistory, /isActive && state\.kind === OperatorHistoryLoadKind\.Failed/u);
  assert.match(operatorHistory, /ref=\{failure\} role="alert" tabIndex=\{-1\}/u);
  assert.doesNotMatch(operatorHistory, /ProcessExecution|ExecutionPublication/u);
});

test("downloads retained verified bytes without an audit reload", () => {
  assert.match(operatorHistory, /downloadOperatorAudit\(state\.download\)/u);
  assert.equal((operatorHistory.match(/api\.get\(instance\)/gu) ?? []).length, 1);
  assert.doesNotMatch(operatorHistory, /JSON\.stringify|fetch\(/u);
});
