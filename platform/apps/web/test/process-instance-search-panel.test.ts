import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";
import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";

import type {
  ProcessInstanceSearchPanelProps,
} from "../src/process-instance-search-panel.tsx";
import type {
  ProcessInstanceSearchApi,
} from "../src/process-instance-search-api.ts";

const panelSource = await readFile(
  new URL("../src/process-instance-search-panel.tsx", import.meta.url),
  "utf8",
);
const transformedPanel = await transformWithEsbuild(
  panelSource,
  "process-instance-search-panel.tsx",
  { format: "esm", jsx: "automatic", loader: "tsx" },
);
const runnablePanel = transformedPanel.code
  .replace(
    /import \{\s*ProcessExecutionDetailLoadKind,[\s\S]*?\} from "\.\/process-instance-execution-detail\.tsx";/u,
    `const ProcessExecutionDetailLoadKind = { Failed: "failed" };
     class ProcessExecutionDetailLoader {
       clear(_api, publish) { publish(null); }
       invalidate() {}
       async load() {}
     }
     function ProcessInstanceExecutionDetailBoundary() { return null; }`,
  )
  .replace(
    /import styles from "\.\/process-instance-search-panel\.module\.css";/u,
    "const styles = new Proxy({}, { get: (_target, key) => String(key) });",
  )
  .replaceAll(
    '"react/jsx-runtime"',
    JSON.stringify(import.meta.resolve("react/jsx-runtime")),
  )
  .replaceAll(
    '"@bpmn-lean/platform-ui-kit"',
    JSON.stringify(import.meta.resolve("@bpmn-lean/platform-ui-kit")),
  )
  .replaceAll('"react"', JSON.stringify(import.meta.resolve("react")));
const panelModule = await import(
  `data:text/javascript;base64,${Buffer.from(runnablePanel).toString("base64")}`
) as Readonly<{
  ProcessInstanceSearchPanel: ComponentType<ProcessInstanceSearchPanelProps>;
  ProcessInstanceSearchTable: ComponentType<Readonly<{
    instances: ReadonlyArray<PublicProcessInstanceIdentity>;
    onOpen?: (instance: PublicProcessInstanceIdentity, row: HTMLButtonElement) => void;
    registerRow?: (processInstanceId: string, row: HTMLButtonElement | null) => void;
  }>>;
  processInstanceSearchRequest(fields: Readonly<{
    processInstanceId: string;
    processId: string;
    version: string;
    sourceSha256: string;
  }>): unknown;
}>;
const {
  ProcessInstanceSearchPanel,
  ProcessInstanceSearchTable,
  processInstanceSearchRequest,
} = panelModule;

const instance = {
  processInstanceId: "instance-42",
  definition: {
    processId: "Process_Order",
    version: 3,
    source: {
      kind: "bpmnSource",
      id: "orders.bpmn",
      sha256: "d".repeat(64),
      byteLength: 4096,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile: "cib-seven-2.2.0:message-start",
    startCapabilities: {
      messageStarts: [],
      timerStarts: [],
    },
  },
  workflowId: "private-workflow",
  status: "running",
  startedAt: "2026-08-12T12:00:00.000Z",
  ordinal: 42,
} as unknown as PublicProcessInstanceIdentity;

const inertApi: ProcessInstanceSearchApi = {
  async search() {
    return { instances: [], nextCursor: null };
  },
  async loadMore() {
    return { instances: [], nextCursor: null };
  },
};
const inertExecutionApi = {
  async getComplete() { throw new Error("unused"); },
  async getExport() { throw new Error("unused"); },
  invalidate() {},
};
const inertDefinitionApi = {
  async getPresentation() { throw new Error("unused"); },
};

test("renders one global confirmed-start search form with only exact filters", () => {
  const html = renderToStaticMarkup(createElement(ProcessInstanceSearchPanel, {
    api: inertApi,
    definitionApi: inertDefinitionApi,
    executionApi: inertExecutionApi,
    isActive: true,
  }));

  assert.match(html, /Confirmed Product 2 starts/u);
  assert.match(html, /name="processInstanceId"/u);
  assert.match(html, /name="processId"/u);
  assert.match(html, /type="number"[^>]*min="1"[^>]*name="version"/u);
  assert.match(html, /name="sourceSha256"/u);
  assert.match(html, />Search</u);
  assert.doesNotMatch(html, /status|timestamp|origin|workflow|history|task queue|ordinal/iu);
});

test("uses a fixed internal page size while preserving every supplied exact filter", () => {
  assert.deepEqual(processInstanceSearchRequest({
    processInstanceId: "instance-42",
    processId: "Process_Order",
    version: "3",
    sourceSha256: "d".repeat(64),
  }), {
    limit: 2,
    processInstanceId: "instance-42",
    processId: "Process_Order",
    version: 3,
    sourceSha256: "d".repeat(64),
  });
  assert.deepEqual(processInstanceSearchRequest({
    processInstanceId: "",
    processId: "",
    version: "",
    sourceSha256: "",
  }), { limit: 2 });
});

test("renders every public identity field in a native table and no host metadata", () => {
  const html = renderToStaticMarkup(createElement(ProcessInstanceSearchTable, {
    instances: [instance],
  }));

  assert.match(html, /<table aria-label="Confirmed Product 2 starts"/u);
  assert.match(html, /<thead/u);
  assert.match(html, /<tbody/u);
  assert.match(html, /instance-42/u);
  assert.match(html, /Process_Order/u);
  assert.match(html, />3</u);
  assert.match(html, /orders\.bpmn/u);
  assert.match(html, new RegExp("d{64}", "u"));
  assert.match(html, /cib-seven-2\.2\.0:message-start/u);
  assert.doesNotMatch(html, /private-workflow|running|2026-08-12|ordinal/iu);
});

test("renders each distinct returned identity in one row and its exact detail control", () => {
  const second = {
    ...instance,
    processInstanceId: "instance-41",
  };
  const html = renderToStaticMarkup(createElement(ProcessInstanceSearchTable, {
    instances: [instance, second],
  }));

  assert.equal((html.match(/<tr/gu) ?? []).length, 3);
  assert.equal((html.match(/aria-label="View execution instance-4[12]"/gu) ?? []).length, 2);
});

test("makes each exact public identity an execution-detail selection", () => {
  const html = renderToStaticMarkup(createElement(ProcessInstanceSearchTable, {
    instances: [instance],
    onOpen: () => undefined,
  }));

  assert.match(html, /View execution instance-42/u);
  assert.match(html, /<button/u);
});
