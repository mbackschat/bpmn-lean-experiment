import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { CommittedTransitionBatch } from "@bpmn-lean/platform-contracts";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";

const historySource = (await readFile(
  new URL("../src/process-instance-execution-history.tsx", import.meta.url),
  "utf8",
)).replace(
  'import styles from "./process-instance-execution-history.module.css";',
  "const styles = new Proxy({}, { get: (_target, key) => String(key) });",
);
const transformed = await transformWithEsbuild(
  historySource,
  "process-instance-execution-history.tsx",
  { format: "esm", jsx: "automatic", loader: "tsx" },
);
const historyModule = await import(
  `data:text/javascript;base64,${Buffer.from(transformed.code
    .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")))
    .replaceAll('"@bpmn-lean/platform-contracts"', JSON.stringify(import.meta.resolve("@bpmn-lean/platform-contracts"))))
    .toString("base64")}`
) as Readonly<{
  ProcessInstanceExecutionHistory: ComponentType<Readonly<{ batches: readonly CommittedTransitionBatch[] }>>;
}>;

const batches = [{
  commandId: "command-start",
  fromRevision: 0,
  throughRevision: 3,
  transitions: [{
    revision: 1,
    role: { kind: "input", input: "start" },
    element: "StartEvent_1",
    sourceType: "startEvent",
    owner: 0,
  }, {
    revision: 2,
    role: { kind: "arrive", flow: "Flow_1" },
    element: "Task_Review",
    sourceType: "userTask",
    owner: 0,
  }, {
    revision: 3,
    role: { kind: "idle", scope: 4 },
    element: null,
    sourceType: null,
    owner: 4,
  }],
}, {
  commandId: "command-timer",
  fromRevision: 3,
  throughRevision: 4,
  transitions: [{
    revision: 4,
    role: { kind: "input", input: "timerFire" },
    element: "Timer_Deadline",
    sourceType: "boundaryEvent",
    owner: 0,
  }],
}] as const satisfies readonly CommittedTransitionBatch[];

test("shows each record's role, element, element type and owner in revision order", () => {
  const markup = renderToStaticMarkup(createElement(historyModule.ProcessInstanceExecutionHistory, { batches }));

  assert.deepEqual([...markup.matchAll(/data-revision="(\d+)"/gu)].map((match) => match[1]), ["1", "2", "3", "4"]);
  assert.match(markup, /<strong>Start<\/strong>/u);
  assert.match(markup, /<strong>Sequence Flow arrival<\/strong>[\s\S]*<code>Flow_1<\/code>[\s\S]*<code>Task_Review<\/code>[\s\S]*<code>userTask<\/code>/u);
  assert.match(markup, /<strong>Scope idle<\/strong>[\s\S]*<dt>Element<\/dt><dd>None<\/dd>[\s\S]*<dt>Owner scope<\/dt><dd><code>4<\/code>/u);
  assert.match(markup, /<strong>Timer firing<\/strong>[\s\S]*<code>command-timer<\/code>/u);
  assert.doesNotMatch(markup, /Logical time|Stimulus|Operation/u);
});
