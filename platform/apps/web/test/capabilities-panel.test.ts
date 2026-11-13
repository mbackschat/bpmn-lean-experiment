import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "vite";

import { HostLimitUnit, hostRestrictions } from "../../../../model-corpus/host-restrictions.ts";
import { mvpBpmnRestrictions, mvpCapabilityCatalog } from "../../../../model-corpus/mvp-capabilities.ts";
import { OutsideTargetReach, outsideTargetFeatures } from "../../../../model-corpus/outside-target-features.ts";
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
  // Each accepted exception stays disclosed until its ledger entry closes (docs/TEMPORAL-DEFECTS-LEDGER.md, step 10).
  for (const entry of ["TD-001", "TD-002", "TD-003", "TD-005"]) assert.match(html, new RegExp(`Runtime qualification exceptions.*${entry}`, "su"));
  // Each row renders its catalog text verbatim; the facts that text names are checked beside the catalog in
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

/** The markup of the table row whose start tag carries `attribute`, or `null` when no row carries it. */
function rowWith(html: string, attribute: string): string | null {
  const start = html.indexOf(attribute);
  return start === -1 ? null : html.slice(start, html.indexOf("</tr>", start));
}

test("discloses every kernel restriction row and every hosted-engine restriction", () => {
  const html = renderToStaticMarkup(createElement(module.CapabilitiesPanel, {
    productVersion: "0.1.0",
  }));

  for (const { refusalCode, restriction, basis } of mvpBpmnRestrictions) {
    const row = rowWith(html, `data-refusal-code="${refusalCode}"`);
    assert.notEqual(row, null, `missing restriction row ${refusalCode}`);
    for (const text of [refusalCode, restriction, basis]) {
      assert.ok(row?.includes(escapedText(text)), `${refusalCode} must render ${JSON.stringify(text)}`);
    }
  }
  assert.deepEqual(
    [...html.matchAll(/data-refusal-code="([^"]+)"/gu)].map((match) => match[1]).sort(),
    mvpBpmnRestrictions.map(({ refusalCode }) => refusalCode).sort(),
  );

  for (const { code, restriction, limit, issue } of hostRestrictions) {
    const row = rowWith(html, `data-host-restriction-code="${code}"`);
    assert.notEqual(row, null, `missing host restriction ${code}`);
    // Every byte limit in the capacity table is a whole number of KiB.
    const limitText = limit === null ? "No numeric limit" : limit.unit === HostLimitUnit.Bytes
      ? `${String(limit.value / 1_024)} KiB`
      : limit.value.toLocaleString("en-US");
    for (const text of [code, restriction, limitText, `#${String(issue)}`]) {
      assert.ok(row?.includes(escapedText(text)), `${code} must render ${JSON.stringify(text)}`);
    }
  }
  assert.deepEqual(
    [...html.matchAll(/data-host-restriction-code="([^"]+)"/gu)].map((match) => match[1]).sort(),
    hostRestrictions.map(({ code }) => code).sort(),
  );
});

test("discloses every feature outside the Practical CIB7 target and marks the capability rows it belongs to", () => {
  const html = renderToStaticMarkup(createElement(module.CapabilitiesPanel, {
    productVersion: "0.1.0",
  }));
  const reachLabels: Readonly<Record<OutsideTargetReach, string>> = {
    [OutsideTargetReach.StandardsProfile]: "Standards profile only",
  };
  const note = "Outside the Practical CIB7 target";

  assert.match(html, new RegExp(note, "u"));
  for (const { capability, feature, description, reach, basis } of outsideTargetFeatures) {
    const key = JSON.stringify([capability, basis]);
    const row = rowWith(html, `data-outside-target-capability="${capability}" data-outside-target-basis="${basis}"`);
    assert.notEqual(row, null, `missing feature row ${key}`);
    const element = mvpCapabilityCatalog.capabilities.find(({ id }) => id === capability)?.element ?? capability;
    for (const text of [element, feature, description, reachLabels[reach], basis]) {
      assert.ok(row?.includes(escapedText(text)), `${key} must render ${JSON.stringify(text)}`);
    }
  }
  assert.deepEqual(
    [...html.matchAll(/data-outside-target-capability="([^"]+)" data-outside-target-basis="([^"]+)"/gu)]
      .map(([, capability, basis]) => JSON.stringify([capability, basis])).sort(),
    outsideTargetFeatures.map(({ capability, basis }) => JSON.stringify([capability, basis])).sort(),
  );

  for (const { id } of mvpCapabilityCatalog.capabilities) {
    const row = rowWith(html, `data-capability-id="${id}"`) ?? "";
    const features = outsideTargetFeatures.filter(({ capability }) => capability === id);
    if (features.length === 0) {
      assert.ok(!row.includes(note), `${id} must carry no outside-target note`);
      continue;
    }
    for (const { feature, reach } of features) {
      const text = `${note}: ${feature} (${reachLabels[reach].toLowerCase()})`;
      assert.ok(row.includes(escapedText(text)), `${id} must render ${JSON.stringify(text)}`);
    }
  }
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
