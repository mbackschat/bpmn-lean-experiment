import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import type { PublicWorkTask } from "@bpmn-lean/platform-contracts";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "vite";

const dependencies = [
  "react/jsx-runtime",
  "react",
  "@bpmn-lean/platform-ui-kit",
] as const;
const built = await build({
  configFile: false,
  logLevel: "silent",
  build: {
    minify: false,
    ssr: fileURLToPath(new URL("../src/work-task-detail-workspace.tsx", import.meta.url)),
    target: "esnext",
    write: false,
    rollupOptions: {
      external: (id) => dependencies.includes(id as typeof dependencies[number]) ||
        id.includes("definition-diagram"),
    },
  },
});
if (Array.isArray(built) || !("output" in built)) {
  throw new Error("Unexpected task-detail workspace build result.");
}
const chunk = built.output.find((entry) => entry.type === "chunk");
if (chunk === undefined) throw new Error("Task-detail workspace test bundle is missing.");
let runnable = chunk.code.replace(
  /import \{ DefinitionDiagram \} from ['"][^'"]+['"];/u,
  "const DefinitionDiagram = () => null;",
);
for (const dependency of dependencies) {
  runnable = runnable.replaceAll(`'${dependency}'`, JSON.stringify(import.meta.resolve(dependency)));
  runnable = runnable.replaceAll(`"${dependency}"`, JSON.stringify(import.meta.resolve(dependency)));
}
const module = await import(
  `data:text/javascript;base64,${Buffer.from(runnable).toString("base64")}`
) as Readonly<{
  WorkTaskFacts: ComponentType<Readonly<{ task: PublicWorkTask }>>;
}>;

test("labels semantic task and hosting root Process identities separately", () => {
  const task: PublicWorkTask = {
    task: {
      id: {
        processInstanceId: "called-process-17",
        elementId: "Review_Request",
        activation: 2,
      },
      name: "Review request",
      state: "active",
    },
    hostingInstance: {
      processInstanceId: "root-process-4",
      definition: {
        processId: "Root_Process",
        version: 1,
        source: {
          kind: "bpmnSource",
          id: "root.bpmn",
          sha256: "a".repeat(64),
          byteLength: 42,
          declaredEncoding: null,
          decodedAs: "UTF-8",
        },
        semanticProfile: "test-profile",
        startCapabilities: { messageStarts: [], timerStarts: [] },
      },
    },
    claimGeneration: 0,
    claim: null,
    claimableByCurrentActor: true,
  };

  const html = renderToStaticMarkup(createElement(module.WorkTaskFacts, { task }));

  assert.match(html, /<dt>Task Process instance<\/dt><dd>called-process-17<\/dd>/u);
  assert.match(html, /<dt>Hosting root Process instance<\/dt><dd>root-process-4<\/dd>/u);
  assert.doesNotMatch(html, /<dt>Process instance<\/dt>/u);
});
