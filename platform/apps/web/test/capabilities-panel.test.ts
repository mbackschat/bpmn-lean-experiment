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
  const dataRowStart = html.indexOf('data-capability-id="directDataInputOutputUserTask"');
  assert.notEqual(dataRowStart, -1);
  const dataRow = html.slice(dataRowStart, html.indexOf("</tr>", dataRowStart));
  for (const disclosed of [
    "The portable handoff profile instead carries one structured item",
    "through exactly two serial User Tasks",
    "an exact Decimal with a signed 64-bit coefficient and scale 0..6",
    "an Integer in 0..2^53−1",
    "never a root List",
    "A hosted Start whose successful journey cannot fit the capacity envelope is refused",
    "the browser offers no form editor for these values",
    "Message, effect, Call, Multi-Instance and expression use of them is excluded",
  ]) assert.ok(dataRow.includes(disclosed), `Data Input and Output row must disclose: ${disclosed}`);
  const serviceRowStart = html.indexOf('data-capability-id="serviceTask"');
  assert.notEqual(serviceRowStart, -1);
  const serviceRow = html.slice(serviceRowStart, html.indexOf("</tr>", serviceRowStart));
  for (const disclosed of [
    "The portable effect-data profile instead admits a serial chain of Service Tasks without Human Tasks",
    "never a root List",
    "a handler changes Process data only through its result",
    "A hosted Start is refused when the reserved result of a task or the successful journey cannot fit the capacity envelope",
    "earlier profiles refuse structured results",
  ]) assert.ok(serviceRow.includes(disclosed), `Service Task row must disclose: ${disclosed}`);
  const subProcessRowStart = html.indexOf('data-capability-id="embeddedSubProcess"');
  assert.notEqual(subProcessRowStart, -1);
  const subProcessRow = html.slice(subProcessRowStart, html.indexOf("</tr>", subProcessRowStart));
  for (const disclosed of [
    "The embedded completion profile also admits ordinary Sub-Processes nested to depth three whose bodies hold only User Tasks",
    "a Sub-Process completes exactly when it owns no token, User Task or child scope",
    "continues once at its own parent without touching concurrent work outside it",
    "a Start or completion closure of more than eight steps is refused before Workflow start",
    "CIB agreement is retained only for the one-level fixture",
    "every arriving branch starts its own concurrent activation of that Sub-Process, which completes alone and continues once",
    "counting such a target and its successors once per branch",
    "The nested scope-data profile instead admits ordinary Sub-Processes nested to depth three in one serial path",
    "a read resolves to the nearest enclosing declaring frame, otherwise the Process",
    "a write updates that owner and never creates a local",
    "every local retires with its Sub-Process",
    "A User Task completion may name only declared locals, within 16,384 canonical bytes",
    "a hosted Start whose structured values cannot fit the capacity envelope is refused",
  ]) assert.ok(subProcessRow.includes(disclosed), `Embedded Sub-Process row must disclose: ${disclosed}`);
  const mappedCallRowStart = html.indexOf('data-capability-id="callActivityVariableMappings"');
  assert.notEqual(mappedCallRowStart, -1);
  const mappedCallRow = html.slice(mappedCallRowStart, html.indexOf("</tr>", mappedCallRowStart));
  for (const disclosed of [
    "root serial path to an in-document Process of one to three serial User Tasks",
    "an absent source becoming a present null",
    "called tasks read and write only the copied names and never reach caller data",
    "a Call inside a Sub-Process, more than one Call",
    "a hosted Start whose copied values cannot fit the capacity envelope is refused",
  ]) assert.ok(mappedCallRow.includes(disclosed), `Call variable mapping row must disclose: ${disclosed}`);
  const parallelGatewayRowStart = html.indexOf('data-capability-id="parallelGateway"');
  assert.notEqual(parallelGatewayRowStart, -1);
  const parallelGatewayRow = html.slice(parallelGatewayRowStart, html.indexOf("</tr>", parallelGatewayRowStart));
  assert.ok(
    parallelGatewayRow.includes("paired forks and joins of two or more branches inside Sub-Process bodies"),
    "Parallel Gateway row must disclose nested paired blocks",
  );
  assert.ok(
    parallelGatewayRow.includes("a fork whose User Task branches all end at one Exclusive merge into a Sub-Process"),
    "Parallel Gateway row must disclose the merge region",
  );
  const exclusiveGatewayRowStart = html.indexOf('data-capability-id="exclusiveGateway"');
  assert.notEqual(exclusiveGatewayRowStart, -1);
  const exclusiveGatewayRow = html.slice(exclusiveGatewayRowStart, html.indexOf("</tr>", exclusiveGatewayRowStart));
  assert.ok(
    exclusiveGatewayRow.includes("which passes each arriving token on its own"),
    "Exclusive Gateway row must disclose the uncontrolled merge into a Sub-Process",
  );
  const payloadRowStart = html.indexOf('data-capability-id="messagePayloadCatchEvent"');
  assert.notEqual(payloadRowStart, -1);
  const payloadRow = html.slice(payloadRowStart, html.indexOf("</tr>", payloadRowStart));
  for (const disclosed of [
    "The portable Message-payload profile instead admits one structured item",
    "never a root List",
    "writes a copy of it to the Property",
    "Process Start and User Task completion carry no values there",
    "a hosted Start is refused when the reserved payload delivery cannot fit the capacity envelope",
    "the browser offers no delivery form for these values",
    "earlier profiles refuse structured payloads",
  ]) assert.ok(payloadRow.includes(disclosed), `Message payload row must disclose: ${disclosed}`);
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
