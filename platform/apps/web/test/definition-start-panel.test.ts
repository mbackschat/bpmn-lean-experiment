import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "vite";

const dependencies = ["react/jsx-runtime", "react", "@bpmn-lean/platform-ui-kit", "@bpmn-lean/platform-contracts"] as const;
const built = await build({
  configFile: false, logLevel: "silent",
  build: {
    minify: false, write: false, target: "esnext",
    ssr: fileURLToPath(new URL("../src/definition-start-panel.tsx", import.meta.url)),
    rollupOptions: { external: (id) => dependencies.includes(id as typeof dependencies[number]) },
  },
});
if (Array.isArray(built) || !("output" in built)) throw new Error("Unexpected Start panel test bundle.");
const chunk = built.output.find((entry) => entry.type === "chunk");
if (chunk === undefined) throw new Error("Start panel test bundle is missing.");
let runnable = chunk.code;
for (const dependency of dependencies) {
  runnable = runnable.replaceAll(`'${dependency}'`, JSON.stringify(import.meta.resolve(dependency)));
  runnable = runnable.replaceAll(`"${dependency}"`, JSON.stringify(import.meta.resolve(dependency)));
}
const module = await import(`data:text/javascript;base64,${Buffer.from(runnable).toString("base64")}`) as Readonly<{
  DefinitionStartPanel: ComponentType<Readonly<{ api: unknown; definition: DeployedDefinitionVersion }>>;
}>;
const definition = {
  processId: "GenericProcess", version: 1,
  source: { kind: "bpmnSource", id: "generic.bpmn", sha256: "a".repeat(64), byteLength: 16, declaredEncoding: null, decodedAs: "UTF-8" },
  semanticProfile: "explicit-profile", sourceOverlay: { id: "literal", sha256: "b".repeat(64) },
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const satisfies DeployedDefinitionVersion;

test("offers explicit string input without creating a default row or model-specific fields", () => {
  const html = renderToStaticMarkup(createElement(module.DefinitionStartPanel, { api: {}, definition }));
  assert.match(html, /Add input/u);
  assert.match(html, /String/u);
  assert.match(html, /Start version 1/u);
  assert.doesNotMatch(html, /<(?:input|textarea)\b/u);
  assert.doesNotMatch(html, /invoiceValidator|policyChecker|JSON editor/u);
});

test("retains the exact Alpha input and does not offer generic edits for that preset", () => {
  const alpha = {
    ...definition,
    processId: "Process_SequentialMultiInstanceReview",
    semanticProfile: "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
    source: { ...definition.source, sha256: "982f77f7fcca2d01bd2357c11057c5fdb6aaf3b383ac351a93aa32ab1bbca3ff" },
    sourceOverlay: null,
  };
  const html = renderToStaticMarkup(createElement(module.DefinitionStartPanel, { api: {}, definition: alpha }));
  assert.match(html, /contract, invoice, receipt/u);
  assert.doesNotMatch(html, /Add input/u);
});
