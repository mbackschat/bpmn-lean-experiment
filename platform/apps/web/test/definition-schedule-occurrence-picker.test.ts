import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "vite";

import type { OccurrencePickerProps } from "../src/definition-schedule-occurrence-picker.tsx";
import { occurrencePage } from "../src/definition-schedule-occurrences.ts";

const dependencies = ["react/jsx-runtime", "react", "@bpmn-lean/platform-ui-kit"] as const;
const built = await build({
  configFile: false, logLevel: "silent",
  build: {
    minify: false, write: false, target: "esnext",
    ssr: fileURLToPath(new URL("../src/definition-schedule-occurrence-picker.tsx", import.meta.url)),
    rollupOptions: { external: (id) => dependencies.includes(id as typeof dependencies[number]) },
  },
});
if (Array.isArray(built) || !("output" in built)) throw new Error("Unexpected occurrence picker test bundle.");
const chunk = built.output.find((entry) => entry.type === "chunk");
if (chunk === undefined) throw new Error("Occurrence picker test bundle is missing.");
let runnable = chunk.code;
for (const dependency of dependencies) {
  runnable = runnable.replaceAll(`'${dependency}'`, JSON.stringify(import.meta.resolve(dependency)));
  runnable = runnable.replaceAll(`"${dependency}"`, JSON.stringify(import.meta.resolve(dependency)));
}
const module = await import(`data:text/javascript;base64,${Buffer.from(runnable).toString("base64")}`) as Readonly<{
  OccurrencePicker: ComponentType<OccurrencePickerProps>;
}>;

const noop = () => undefined;
const render = (props: Partial<OccurrencePickerProps>) => renderToStaticMarkup(createElement(module.OccurrencePicker, {
  page: null, paged: false, busy: false, onSelect: noop, onLater: noop, onFirst: noop, ...props,
}));
const hourly = ["2026-08-11T12:00:01.250Z", "2026-08-11T13:00:01.250Z"].map((dueAt) => ({ dueAt }));

test("offers exactly the listed occurrences as one radio choice each, the selected one checked, and no free date", () => {
  const html = render({ page: occurrencePage(hourly, hourly[1]?.dueAt ?? null, 2) });
  assert.equal(html.match(/type="radio"/gu)?.length, 2);
  assert.match(html, /<legend>Occurrence<\/legend>/u);
  const checked = [...html.matchAll(/<input [^>]*checked=""[^>]*value="([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(checked, ["2026-08-11T13:00:01.250Z"]);
  assert.doesNotMatch(html, /type="(?:text|date|datetime-local)"/u);
  assert.match(html, /Later occurrences/u, "a full page offers the later ones");
  assert.doesNotMatch(html, /Next occurrences/u, "the first page offers no return");
});

test("says so when no occurrence remains, and offers the first page again after paging", () => {
  assert.match(render({ page: occurrencePage([], null, 2), paged: true }), /No later occurrence of this Timer Start remains/u);
  const later = render({ page: occurrencePage(hourly, null, 3), paged: true });
  assert.match(later, /Next occurrences/u);
  assert.doesNotMatch(later, /Later occurrences/u, "a short page has no later ones");
  assert.match(render({ page: null }), /Loading occurrences/u);
});
