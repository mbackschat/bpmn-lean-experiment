import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "vite";

import { mvpCapabilityCatalog } from "../../../../model-corpus/mvp-capabilities.ts";
import { muePreviewBetaTestOracle } from "../../../../scripts/mue-preview-beta-test-oracle.ts";

const dependencies = ["react/jsx-runtime", "react", "@bpmn-lean/platform-ui-kit"] as const;
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

/** React's static-markup text escaping (`escapeTextForBrowser`): the five characters it replaces. */
function escapedText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#x27;");
}

test("presents versioned BPMN and CIB capability boundaries from the canonical catalog", () => {
  const html = renderToStaticMarkup(createElement(module.CapabilitiesPanel, {
    productVersion: "0.1.0",
  }));

  assert.match(html, /BPMN Lean 0\.1\.0/u);
  assert.match(html, /BPMN 2\.0\.2/u);
  assert.match(html, /Process Execution Conformance target/u);
  assert.match(html, /CIB Seven 2\.2\.0/u);
  assert.match(html, /Not a conformance claim/u);
  // Each row renders its catalog text verbatim; what that text must disclose is guarded beside the catalog in
  // `scripts/capability-catalog-disclosures.test.ts`, so wording changes never need a second copy here.
  for (const capability of mvpCapabilityCatalog.capabilities) {
    const rowStart = html.indexOf(`data-capability-id="${capability.id}"`);
    assert.notEqual(rowStart, -1, `missing capability row ${capability.id}`);
    const row = html.slice(rowStart, html.indexOf("</tr>", rowStart));
    assert.ok(row.includes(escapedText(capability.element)), `${capability.id} must render its element`);
    assert.ok(row.includes(escapedText(capability.restriction)), `${capability.id} must render its restriction`);
  }
  assert.match(html, /No CIB target selected/u);
  assert.deepEqual(
    [...html.matchAll(/data-capability-id="([^"]+)"/gu)].map((match) => match[1]).sort(),
    mvpCapabilityCatalog.capabilities.map(({ id }) => id).sort(),
  );
});

test("presents the exact Beta checkpoint matrix without changing the capability catalog", () => {
  const html = renderToStaticMarkup(createElement(module.CapabilitiesPanel, {
    productVersion: "0.1.0",
  }));

  assert.match(html, /MUE Preview Beta/u);
  assert.match(html, /<h3[^>]*>Implementation checkpoints<\/h3>/u);
  assert.doesNotMatch(html, /<h3>MUE Preview Beta<\/h3>/u);
  assert.match(html, /Historical MUE Preview Beta evidence/u);
  assert.match(html, /not full MUE closure or BPMN conformance/iu);
  assert.deepEqual(
    [...html.matchAll(/data-beta-content-id="([^"]+)"/gu)].map((match) => match[1]),
    muePreviewBetaTestOracle.map(({ id }) => id),
  );
  for (const expectation of muePreviewBetaTestOracle) {
    const rowStart = html.indexOf(`data-beta-content-id="${expectation.id}"`);
    assert.notEqual(rowStart, -1, `missing Beta row ${expectation.id}`);
    const rowEnd = html.indexOf("</li>", rowStart);
    assert.notEqual(rowEnd, -1, `unterminated Beta row ${expectation.id}`);
    const row = html.slice(rowStart, rowEnd);
    for (const expectedText of [
      expectation.title,
      expectation.evidenceLabel,
      expectation.productSurfaceLabel,
      `${expectation.boundary}; ${expectation.remainingLimit}`,
    ]) {
      assert.ok(
        row.includes(expectedText),
        `Beta row ${expectation.id} must render ${JSON.stringify(expectedText)}`,
      );
    }
  }
  assert.equal(
    [...html.matchAll(/data-capability-id="([^"]+)"/gu)].length,
    mvpCapabilityCatalog.capabilities.length,
    "Beta checkpoint rows must not change the executable-capability denominator",
  );
});
