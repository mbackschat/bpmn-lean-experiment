import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";
import type { OperatorAuditExport } from "@bpmn-lean/platform-contracts";

const source = await readFile(
  new URL("../src/process-operator-history.tsx", import.meta.url),
  "utf8",
);
const transformed = await transformWithEsbuild(source, "process-operator-history.tsx", {
  format: "esm",
  jsx: "automatic",
  loader: "tsx",
});
let runnable = transformed.code
  .replace(
    /import \{ LatestRequest \} from "\.\/latest-request\.ts";/u,
    "class LatestRequest {}",
  )
  .replace(
    /import \{\s*downloadOperatorAudit,?\s*\} from "\.\/operator-audit-api\.ts";/u,
    "function downloadOperatorAudit() {}",
  )
  .replace(
    /import styles from "\.\/process-operator-history\.module\.css";/u,
    "const styles = new Proxy({}, { get: (_target, key) => String(key) });",
  );
for (const dependency of [
  "react/jsx-runtime",
  "react",
  "@bpmn-lean/platform-ui-kit",
] as const) {
  runnable = runnable.replaceAll(
    JSON.stringify(dependency),
    JSON.stringify(import.meta.resolve(dependency)),
  );
}
const module = await import(
  `data:text/javascript;base64,${Buffer.from(runnable).toString("base64")}`
) as Readonly<{
  OperatorAuditCollections: ComponentType<Readonly<{ value: OperatorAuditExport }>>;
}>;

const value = {
  format: "bpmn-lean.operator-audit.v1",
  instance: {
    processInstanceId: "instance-1",
    definition: {
      processId: "Process_1",
      version: 1,
      source: {
        kind: "bpmnSource",
        id: "source.bpmn",
        sha256: "a".repeat(64),
        byteLength: 100,
        declaredEncoding: "UTF-8",
        decodedAs: "UTF-8",
      },
      semanticProfile: "profile-1",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  },
  work: {
    headEventId: "work-2",
    events: [{
      eventId: "work-1",
      actorId: "worker-a",
      recordedAt: "2026-08-15T10:20:00.000Z",
      hostingProcessInstanceId: "instance-1",
      taskId: { processInstanceId: "instance-1", elementId: "Task_A", activation: 1 },
      action: { kind: "claim", actionId: "claim-1", outcome: "claimed" },
    }, {
      eventId: "work-2",
      actorId: "worker-b",
      recordedAt: "2026-08-15T10:00:00.000Z",
      hostingProcessInstanceId: "instance-1",
      taskId: { processInstanceId: "instance-1", elementId: "Task_B", activation: 2 },
      action: { kind: "completion", actionId: "complete-2", outcome: "committed" },
    }],
  },
  incidentActions: {
    headEventId: "incident-2",
    events: [{
      eventId: "incident-1",
      actorId: "operator-a",
      recordedAt: "2026-08-15T10:00:00.000Z",
      hostingProcessInstanceId: "instance-1",
      incidentId: {
        effectId: { processInstanceId: "instance-1", elementId: "Service_A", activation: 1 },
        generation: 1,
      },
      actionId: "retry-1",
      actionKind: "retryIncident",
      outcome: "committed",
    }, {
      eventId: "incident-2",
      actorId: "operator-b",
      recordedAt: "2026-08-15T09:00:00.000Z",
      hostingProcessInstanceId: "instance-1",
      incidentId: {
        effectId: { processInstanceId: "instance-1", elementId: "Service_B", activation: 2 },
        generation: 1,
      },
      actionId: "cancel-2",
      actionKind: "cancelIncidentProcess",
      outcome: "rejected",
    }],
  },
} as const satisfies OperatorAuditExport;

test("renders two labelled source-local collections without a merged chronology", () => {
  const html = renderToStaticMarkup(createElement(module.OperatorAuditCollections, { value }));

  assert.match(html, /Work actions \(2\)/u);
  assert.match(html, /Captured head <code>work-2<\/code>/u);
  assert.match(html, /aria-label="Work actions"/u);
  assert.match(html, /Incident actions \(2\)/u);
  assert.match(html, /Captured head <code>incident-2<\/code>/u);
  assert.match(html, /aria-label="Incident actions"/u);
  assert.ok(html.indexOf("<code>work-1</code>") < html.lastIndexOf("<code>work-2</code>"));
  assert.ok(html.indexOf("<code>incident-1</code>") < html.lastIndexOf("<code>incident-2</code>"));
  assert.ok(html.lastIndexOf("<code>work-2</code>") < html.indexOf("<code>incident-1</code>"));
  assert.doesNotMatch(html, /global sequence|merged timeline/iu);
});

test("renders complete work and incident identities, actions, actors, and outcomes", () => {
  const html = renderToStaticMarkup(createElement(module.OperatorAuditCollections, { value }));

  for (const expected of [
    "instance-1 / Task_A / activation 1",
    "claim-1",
    "claimed",
    "worker-a",
    "instance-1 / Service_B / activation 2 / generation 1",
    "cancel-2",
    "Cancel Process",
    "rejected",
    "operator-b",
  ]) assert.match(html, new RegExp(expected, "u"));
});

test("states an independent empty stream and its null head exactly", () => {
  const empty = structuredClone(value) as any;
  empty.incidentActions = { headEventId: null, events: [] };
  const html = renderToStaticMarkup(createElement(module.OperatorAuditCollections, { value: empty }));

  assert.match(html, /Incident actions \(0\)/u);
  assert.match(html, /Captured head: empty/u);
  assert.match(html, /No incident actions were captured/u);
});
