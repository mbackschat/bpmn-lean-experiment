import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "vite";

import { mvpCapabilityCatalog } from "../../../../model-corpus/mvp-capabilities.ts";
import { muePreviewBetaCheckpoints } from "../src/mue-preview-beta-checkpoints.ts";

const dependencies = ["react/jsx-runtime", "react"] as const;
const built = await build({
  configFile: false,
  logLevel: "silent",
  build: {
    minify: false,
    ssr: fileURLToPath(new URL("../src/capabilities-panel.tsx", import.meta.url)),
    target: "esnext",
    write: false,
    rollupOptions: {
      external: (id) => dependencies.includes(id as typeof dependencies[number]),
    },
  },
});
if (Array.isArray(built) || !("output" in built)) {
  throw new Error("Unexpected capabilities panel build result.");
}
const chunk = built.output.find((entry) => entry.type === "chunk");
if (chunk === undefined) throw new Error("Capabilities panel test bundle is missing.");
let runnable = chunk.code;
for (const dependency of dependencies) {
  runnable = runnable.replaceAll(`'${dependency}'`, JSON.stringify(import.meta.resolve(dependency)));
  runnable = runnable.replaceAll(`"${dependency}"`, JSON.stringify(import.meta.resolve(dependency)));
}
const module = await import(
  `data:text/javascript;base64,${Buffer.from(runnable).toString("base64")}`
) as Readonly<{
  CapabilitiesPanel: ComponentType<Readonly<{ productVersion: string }>>;
}>;

test("presents versioned BPMN and CIB capability boundaries from the canonical catalog", () => {
  const html = renderToStaticMarkup(createElement(module.CapabilitiesPanel, {
    productVersion: "0.1.0",
  }));

  assert.match(html, /BPMN Lean 0\.1\.0/u);
  assert.match(html, /BPMN 2\.0\.2/u);
  assert.match(html, /Process Execution Conformance target/u);
  assert.match(html, /CIB Seven 2\.2\.0/u);
  assert.match(html, /Not a conformance claim/u);
  assert.match(html, /Timer Start Event/u);
  assert.match(html, /no recurrence or calendar form/iu);
  assert.match(html, /Sequential Multi-Instance User Task/u);
  assert.match(html, /atomic index-ordered String-list output/iu);
  assert.match(
    html,
    /Message Intermediate Catch Event with a direct Data Output/u,
  );
  assert.match(
    html,
    /absent payload is refused and leaves the subscription live/iu,
  );
  assert.match(html, /Definition-scoped Message key correlation/u);
  assert.match(
    html,
    /exactly one matching Process instance and preserves every instance on zero or ambiguous matches/iu,
  );
  assert.match(
    html,
    /Interrupting Timer Boundary Event on sequential Multi-Instance User Task/u,
  );
  assert.match(
    html,
    /Interrupting Message Boundary Event on User Task/u,
  );
  assert.match(
    html,
    /payload-free withdrawal Message withdraws the active User Task/iu,
  );
  assert.match(html, /publishes no partial output/iu);
  assert.match(html, /No CIB target selected/u);
  assert.deepEqual(
    [...html.matchAll(/data-capability-id="([^"]+)"/gu)].map((match) => match[1]),
    mvpCapabilityCatalog.capabilities.map(({ id }) => id),
  );
});

test("presents the exact Beta checkpoint matrix without changing the capability catalog", () => {
  const html = renderToStaticMarkup(createElement(module.CapabilitiesPanel, {
    productVersion: "0.1.0",
  }));

  assert.match(html, /MUE Preview Beta/u);
  assert.match(html, /not full MUE closure or BPMN conformance/iu);
  assert.deepEqual(
    [...html.matchAll(/data-beta-content-id="([^"]+)"/gu)].map((match) => match[1]),
    muePreviewBetaCheckpoints.map(({ id }) => id),
  );
  for (const label of [
    "Production journey",
    "Registered executable capability",
    "Generated evidence",
    "Reviewed checkpoint only",
    "No Product 2 executable surface",
  ]) {
    assert.match(html, new RegExp(label, "u"));
  }
  assert.equal(
    [...html.matchAll(/data-capability-id="([^"]+)"/gu)].length,
    mvpCapabilityCatalog.capabilities.length,
    "Beta checkpoint rows must not change the executable-capability denominator",
  );
});
