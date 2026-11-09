import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { CurrentCommittedExecution, StateOpenWait } from "@bpmn-lean/platform-contracts";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";

import { openWaitKey } from "../src/process-instance-position-identity.ts";

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
    `let capturedHighlight;
     function DefinitionDiagram({ highlight }) {
       capturedHighlight = highlight;
       return null;
     }
     export function readCapturedHighlight() {
       return capturedHighlight;
     }`,
  )
  .replace(
    'import { BpmnDiagramMarkerKind } from "./bpmn-viewer-contract.ts";',
    'const BpmnDiagramMarkerKind = { Current: "current" };',
  )
  .replace(
    /import \{\s*displayOccurrence,\s*openWaitKey,\s*\} from "\.\/process-instance-position-identity\.ts";/u,
    `const displayOccurrence = (id) => JSON.stringify(id);
     const openWaitKey = (wait) => JSON.stringify(wait);`,
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
  readCapturedHighlight(): Readonly<{
    elementIds: readonly string[];
    markerKind: "current";
  }> | undefined;
}>;

const diagramApi = { async getPresentation(): Promise<never> { throw new Error("unused"); } };
const diagramDefinition = {} as never;

test("open-wait React keys stay collision-free when identity components contain delimiters", () => {
  assert.notEqual(
    openWaitKey(openWait({ processInstanceId: "instance:task", elementId: "child/one" }, "userTask")),
    openWaitKey(openWait({ processInstanceId: "instance", elementId: "task:child/one" }, "userTask")),
  );
  assert.notEqual(
    openWaitKey(openWait({ processInstanceId: "instance", elementId: "Task" }, "userTask")),
    openWaitKey(openWait({ processInstanceId: "instance", elementId: "Task" }, "timer")),
  );
});

test("highlights every open wait of the root instance once, with no token or scope presentation", () => {
  const current = executionCurrent([
    openWait({ processInstanceId: "Instance_Order", elementId: "ServiceTask_ChargeCard" }, "effect"),
    openWait({ processInstanceId: "Instance_Order", elementId: "Task_Review" }, "userTask"),
    openWait({ processInstanceId: "Instance_Order", elementId: "Task_Review" }, "timer"),
  ]);

  const markup = renderToStaticMarkup(createElement(diagramModule.ProcessInstanceExecutionDiagram, {
    api: diagramApi,
    current,
    definition: diagramDefinition,
  }));

  assert.deepEqual(diagramModule.readCapturedHighlight(), {
    elementIds: ["ServiceTask_ChargeCard", "Task_Review"],
    markerKind: "current",
  });
  assert.match(markup, /aria-label="Diagram position guide"/u);
  assert.match(markup, /Open wait/u);
  assert.match(markup, /Task_Review<\/code>, kind <code>timer/u);
  assert.doesNotMatch(markup, /control token|Live scopes/iu);
});

test("lists a called-instance open wait without drawing it on this diagram", () => {
  const current = executionCurrent([
    openWait({ processInstanceId: "Instance_Order", elementId: "BoundaryTimer_Fulfilment" }, "timer"),
    {
      ...openWait({ processInstanceId: "Instance_Called", elementId: "CalledTask" }, "userTask"),
      definition: { definitionKey: "Fulfilment", version: 1 },
    },
  ]);

  const markup = renderToStaticMarkup(createElement(diagramModule.ProcessInstanceExecutionDiagram, {
    api: diagramApi,
    current,
    definition: diagramDefinition,
  }));

  assert.deepEqual(diagramModule.readCapturedHighlight(), {
    elementIds: ["BoundaryTimer_Fulfilment"],
    markerKind: "current",
  });
  assert.match(markup, /CalledTask/u);
  assert.match(markup, /called instance/iu);
});

test("styles only the exact marked BPMN element visual, never descendant elements", () => {
  const markerRules = markerCss.slice(
    markerCss.indexOf(".canvas :global(.djs-shape.bpmn-platform-current"),
    markerCss.indexOf(".canvas :global(.djs-shape.bpmn-platform-incident"),
  );
  assert.match(
    markerRules,
    /\.canvas\s+:global\(\.djs-shape\.bpmn-platform-current > \.djs-visual > :first-child\)/u,
  );
  assert.match(
    markerRules,
    /\.canvas\s+:global\(\.djs-connection\.bpmn-platform-current > \.djs-visual > path\)/u,
  );
  assert.match(
    markerRules,
    /\.canvas\s+:global\(\.djs-connection\.bpmn-platform-current > \.djs-visual > defs > marker > path\)/u,
  );
  assert.doesNotMatch(
    markerRules,
    /:global\(\.bpmn-platform-current\)\s+:global\(\.djs-visual\)/u,
  );
  assert.match(markerRules, /var\(--ui-color-accent\)/u);
  assert.match(markerRules, /var\(--ui-color-accent-soft\)/u);
  assert.doesNotMatch(markerRules, /var\(--ui-color-error\)/u);
  const incidentRules = markerCss.slice(
    markerCss.indexOf(".canvas :global(.djs-shape.bpmn-platform-incident"),
    markerCss.indexOf(".canvas :global(.djs-shape.bpmn-platform-selected"),
  );
  assert.match(incidentRules, /var\(--ui-color-error\)/u);
  assert.doesNotMatch(incidentRules, /fill:\s*var\(--ui-color-error-surface\)/u);
  assert.match(incidentRules, /stroke-width:\s*4px/u);
  const selectedRules = markerCss.slice(
    markerCss.indexOf(".canvas :global(.djs-shape.bpmn-platform-selected"),
    markerCss.indexOf("@container"),
  );
  assert.match(selectedRules, /var\(--ui-color-accent\)/u);
  assert.doesNotMatch(selectedRules, /fill: var\(--ui-color-accent-soft\)/u);
});

function openWait(
  { processInstanceId, elementId }: Readonly<{ processInstanceId: string; elementId: string }>,
  kind: string,
): StateOpenWait {
  return {
    id: { processInstanceId, elementId, activation: 1 },
    definition: null,
    input: kind === "userTask" ? "command" : null,
    detail: { kind },
  };
}

function executionCurrent(openWaits: readonly StateOpenWait[]): CurrentCommittedExecution {
  return {
    revision: 3,
    state: {
      kind: "state",
      instanceId: "Instance_Order",
      status: "running",
      logicalTimeMs: 0,
      variables: [],
      scopes: [],
      openWaits: [...openWaits],
    },
  };
}
