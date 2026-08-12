import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";

const source = await readFile(
  new URL("../src/app-shell.tsx", import.meta.url),
  "utf8",
);
const transformed = await transformWithEsbuild(source, "app-shell.tsx", {
  format: "esm",
  jsx: "automatic",
  loader: "tsx",
});
let runnable = transformed.code.replace(
  /import styles from "\.\/app-shell\.module\.css";/u,
  "const styles = new Proxy({}, { get: (_target, key) => String(key) });",
);
for (const dependency of [
  "react/jsx-runtime",
  "react",
  "@bpmn-lean/platform-ui-kit",
] as const) {
  runnable = runnable.replaceAll(
    JSON.stringify(dependency),
    JSON.stringify(import.meta.resolve(dependency)),
  );
}
const module = await import(
  `data:text/javascript;base64,${Buffer.from(runnable).toString("base64")}`
) as Readonly<{
  AppShell: ComponentType<Readonly<{
    activeWorkspace: string;
    definitions: ReactNode;
    onNavigate: (workspace: string) => void;
    processInstances: ReactNode;
    work: ReactNode;
  }>>;
  AppWorkspace: Readonly<{
    Definitions: string;
    ProcessInstances: string;
    Work: string;
  }>;
}>;
const { AppShell, AppWorkspace } = module;

test("uses a persistent primary navigation and renders only the selected workspace", () => {
  const html = renderToStaticMarkup(createElement(AppShell, {
    activeWorkspace: AppWorkspace.Work,
    definitions: createElement("p", null, "definitions-content"),
    onNavigate: () => undefined,
    processInstances: createElement("p", null, "instances-content"),
    work: createElement("p", null, "work-content"),
  }));

  assert.match(html, /aria-label="Primary navigation"/u);
  assert.match(html, />Work</u);
  assert.match(html, />Definitions</u);
  assert.match(html, />Process instances</u);
  assert.match(html, /aria-current="page"[^>]*>Work</u);
  assert.match(html, /work-content/u);
  assert.doesNotMatch(html, /definitions-content|instances-content/u);
});

test("gives Definitions the full content workspace rather than a catalog sidebar", () => {
  const html = renderToStaticMarkup(createElement(AppShell, {
    activeWorkspace: AppWorkspace.Definitions,
    definitions: createElement("p", null, "definitions-content"),
    onNavigate: () => undefined,
    processInstances: createElement("p", null, "instances-content"),
    work: createElement("p", null, "work-content"),
  }));

  assert.match(html, /aria-current="page"[^>]*>Definitions</u);
  assert.match(html, /<h1>Definitions<\/h1>/u);
  assert.match(html, /definitions-content/u);
  assert.doesNotMatch(html, /work-content|instances-content/u);
  assert.doesNotMatch(html, /<aside[^>]*Definitions/u);
});
