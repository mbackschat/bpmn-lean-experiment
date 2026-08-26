import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";

const source = await readFile(
  new URL("../src/audience-demo-panel.tsx", import.meta.url),
  "utf8",
);
const transformed = await transformWithEsbuild(source, "audience-demo-panel.tsx", {
  format: "esm",
  jsx: "automatic",
  loader: "tsx",
});
const runnable = transformed.code
  .replace(
    /import styles from "\.\/audience-demo-panel\.module\.css";/u,
    "const styles = new Proxy({}, { get: (_target, key) => String(key) });",
  )
  .replaceAll(
    '"react/jsx-runtime"',
    JSON.stringify(import.meta.resolve("react/jsx-runtime")),
  )
  .replaceAll(
    '"@bpmn-lean/platform-ui-kit"',
    JSON.stringify(import.meta.resolve("@bpmn-lean/platform-ui-kit")),
  );
const module = await import(
  `data:text/javascript;base64,${Buffer.from(runnable).toString("base64")}`
) as Readonly<{
  AudienceDemoPanel: ComponentType<Readonly<{
    activeStep: string;
    onExit: () => void;
    onSelectStep: (step: string) => void;
  }>>;
}>;

test("presents the verified seven-minute story as four existing-product destinations", () => {
  const html = renderToStaticMarkup(createElement(module.AudienceDemoPanel, {
    activeStep: "expense",
    onExit: () => undefined,
    onSelectStep: () => undefined,
  }));

  assert.match(html, /Audience mode/u);
  assert.match(html, /Seven-minute verified walkthrough/u);
  assert.match(html, /Expense exception/u);
  assert.match(html, /Deadline behavior/u);
  assert.match(html, /Incident recovery/u);
  assert.match(html, /retry-safe recovery after an uncertain response/u);
  assert.match(html, /Correctness stack/u);
  assert.match(html, /aria-current="step"/u);
  assert.equal((html.match(/data-audience-step=/gu) ?? []).length, 4);
  assert.match(html, /Exit audience mode/u);
  assert.doesNotMatch(html, /Workflow ID|Run ID|Event History|semantic profile ID/iu);
});

test("states the assurance boundary without claiming that the browser proves correspondence", () => {
  const html = renderToStaticMarkup(createElement(module.AudienceDemoPanel, {
    activeStep: "correctness",
    onExit: () => undefined,
    onSelectStep: () => undefined,
  }));

  assert.match(html, /Lean reference/u);
  assert.match(html, /Independently written TypeScript core/u);
  assert.match(html, /Temporal durability/u);
  assert.match(html, /PostgreSQL projections/u);
  assert.match(html, /bounded evidence, not a general BPMN conformance claim/u);
});
