import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { CurrentCommittedExecution } from "@bpmn-lean/platform-contracts";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";

import {
  executionScopeKey,
  executionTokenKey,
} from "../src/process-instance-position-identity.ts";

const diagramSource = await readFile(
  new URL("../src/process-instance-execution-diagram.tsx", import.meta.url),
  "utf8",
);
const markerCss = await readFile(
  new URL("../src/definition-diagram.module.css", import.meta.url),
  "utf8",
);
const runnableDiagramSource = diagramSource
  .replace(
    'import { DefinitionDiagram } from "./definition-diagram.tsx";',
    `let capturedActiveElementIds;
     function DefinitionDiagram({ activeElementIds }) {
       capturedActiveElementIds = activeElementIds;
       return null;
     }
     export function readCapturedActiveElementIds() {
       return capturedActiveElementIds;
     }`,
  )
  .replace(
    /import \{\s*displayScopeOccurrence,\s*executionScopeKey,\s*executionTokenKey,\s*\} from "\.\/process-instance-position-identity\.ts";/u,
    `const displayScopeOccurrence = (id) => JSON.stringify(id);
     const executionScopeKey = (scope) => JSON.stringify(scope);
     const executionTokenKey = (token) => JSON.stringify(token);`,
  )
  .replace(
    'import styles from "./process-instance-execution-diagram.module.css";',
    "const styles = new Proxy({}, { get: (_target, key) => String(key) });",
  );
const transformedDiagram = await transformWithEsbuild(
  runnableDiagramSource,
  "process-instance-execution-diagram.tsx",
  { format: "esm", jsx: "automatic", loader: "tsx" },
);
const diagramModule = await import(
  `data:text/javascript;base64,${Buffer.from(transformedDiagram.code
    .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")))
    .replaceAll('"react"', JSON.stringify(import.meta.resolve("react"))))
    .toString("base64")}`
) as Readonly<{
  ProcessInstanceExecutionDiagram: ComponentType<Readonly<{
    api: { getPresentation(): Promise<never> };
    current: CurrentCommittedExecution;
    definition: never;
  }>>;
  readCapturedActiveElementIds(): readonly string[] | undefined;
}>;

const diagramApi = { async getPresentation(): Promise<never> { throw new Error("unused"); } };
const diagramDefinition = {} as never;

test("position React keys stay collision-free when identity components contain delimiters", () => {
  const ownerA = {
    processInstanceId: "instance:scope",
    definitionScopeId: "child/one",
    activation: 1,
  } as const;
  const ownerB = {
    processInstanceId: "instance",
    definitionScopeId: "scope:child/one",
    activation: 1,
  } as const;

  assert.notEqual(
    executionTokenKey({ sequenceFlowId: "flow", owner: ownerA, multiplicity: 1 }),
    executionTokenKey({ sequenceFlowId: "flow", owner: ownerB, multiplicity: 1 }),
  );
  assert.notEqual(
    executionScopeKey({ id: ownerA, parent: null, bpmnElementId: "Process" }),
    executionScopeKey({ id: ownerB, parent: null, bpmnElementId: "Process" }),
  );
});

test("projects only one token and its active Service Task wait, never the live root Process scope", () => {
  const current = executionCurrent({
    activeWaitElementId: "ServiceTask_ChargeCard",
    scopeElementIds: ["Process_Order"],
    tokenElementId: "Flow_ToChargeCard",
  });

  const markup = renderToStaticMarkup(createElement(diagramModule.ProcessInstanceExecutionDiagram, {
    api: diagramApi,
    current,
    definition: diagramDefinition,
  }));

  assert.deepEqual(diagramModule.readCapturedActiveElementIds(), [
    "Flow_ToChargeCard",
    "ServiceTask_ChargeCard",
  ]);
  assert.match(markup, /aria-label="Diagram position guide"/u);
  assert.match(markup, /Current control token/u);
  assert.match(markup, /Active wait/u);
});

test("projects a called-Process active wait without marking either live scope container", () => {
  const current = executionCurrent({
    activeWaitElementId: "CalledServiceTask_MissingFromParentDiagram",
    scopeElementIds: ["Process_Order", "CallActivity_Fulfilment"],
    tokenElementId: "Flow_ToFulfilment",
  });

  renderToStaticMarkup(createElement(diagramModule.ProcessInstanceExecutionDiagram, {
    api: diagramApi,
    current,
    definition: diagramDefinition,
  }));

  assert.deepEqual(diagramModule.readCapturedActiveElementIds(), [
    "Flow_ToFulfilment",
    "CalledServiceTask_MissingFromParentDiagram",
  ]);
});

test("styles only the exact marked BPMN element visual, never descendant elements", () => {
  const markerRules = markerCss.slice(
    markerCss.indexOf(".canvas :global(.djs-shape.bpmn-platform-active"),
    markerCss.indexOf("@container"),
  );
  assert.match(
    markerRules,
    /\.canvas\s+:global\(\.djs-shape\.bpmn-platform-active > \.djs-visual > :first-child\)/u,
  );
  assert.match(
    markerRules,
    /\.canvas\s+:global\(\.djs-connection\.bpmn-platform-active > \.djs-visual > path\)/u,
  );
  assert.match(
    markerRules,
    /\.canvas\s+:global\(\.djs-connection\.bpmn-platform-active > \.djs-visual > defs > marker > path\)/u,
  );
  assert.doesNotMatch(
    markerRules,
    /:global\(\.bpmn-platform-active\)\s+:global\(\.djs-visual\)/u,
  );
  assert.match(markerRules, /var\(--ui-color-accent\)/u);
  assert.match(markerRules, /var\(--ui-color-accent-soft\)/u);
  assert.doesNotMatch(markerRules, /var\(--ui-color-error\)/u);
});

function executionCurrent({
  activeWaitElementId,
  scopeElementIds,
  tokenElementId,
}: Readonly<{
  activeWaitElementId: string;
  scopeElementIds: readonly string[];
  tokenElementId: string;
}>): CurrentCommittedExecution {
  const root = {
    processInstanceId: "Instance_Order",
    definitionScopeId: "Scope_Process",
    activation: 1,
  } as const;
  return {
    revision: 3,
    state: {
      kind: "state",
      instanceId: "Instance_Order",
      status: "running",
      activeWaits: [{ elementId: activeWaitElementId, kind: "effect", multiplicity: 1 }],
      openUserTasks: [],
      openMessageSubscriptions: [],
      openTimers: [],
      openEffects: [],
      openIncidents: [],
      variables: [],
      enabledInteractions: [],
      logicalTimeMs: 0,
    },
    controlTokens: [{ sequenceFlowId: tokenElementId, owner: root, multiplicity: 1 }],
    scopes: scopeElementIds.map((bpmnElementId, index) => ({
      id: index === 0 ? root : {
        processInstanceId: "Instance_Order",
        definitionScopeId: `Scope_Called_${String(index)}`,
        activation: 1,
      },
      parent: index === 0 ? null : root,
      bpmnElementId,
    })),
  };
}
