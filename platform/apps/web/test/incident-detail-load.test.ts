import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { PublicIncident } from "@bpmn-lean/platform-contracts";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";

import type {
  IncidentDetailLoadBoundaryProps,
  IncidentDetailSelection,
} from "../src/incident-detail-load.tsx";

const source = await readFile(
  new URL("../src/incident-detail-load.tsx", import.meta.url),
  "utf8",
);
const testableSource = source
  .replace(
    'import { IncidentDetailWorkspace } from "./incident-detail-workspace.tsx";',
    `function IncidentDetailWorkspace({ incident }) {
      return <section data-ui="incident-detail">
        <span>{incident.incident.id.effectId.elementId}</span>
        <button>Retry Service Task</button>
        <button>Cancel Process</button>
      </section>;
    }`,
  )
  .replace(
    'import styles from "./incidents-panel.module.css";',
    "const styles = new Proxy({}, { get: (_target, key) => String(key) });",
  );
const transformed = await transformWithEsbuild(
  testableSource,
  "incident-detail-load.tsx",
  { format: "esm", jsx: "automatic", loader: "tsx" },
);
const runnable = transformed.code
  .replaceAll(
    '"./latest-request.ts"',
    JSON.stringify(new URL("../src/latest-request.ts", import.meta.url).href),
  )
  .replaceAll(
    '"react/jsx-runtime"',
    JSON.stringify(import.meta.resolve("react/jsx-runtime")),
  )
  .replaceAll(
    '"@bpmn-lean/platform-ui-kit"',
    JSON.stringify(import.meta.resolve("@bpmn-lean/platform-ui-kit")),
  )
  .replaceAll('"react"', JSON.stringify(import.meta.resolve("react")));
const module = await import(
  `data:text/javascript;base64,${Buffer.from(runnable).toString("base64")}`
) as Readonly<{
  IncidentDetailLoader: new () => IncidentDetailLoaderContract;
  IncidentDetailLoadBoundary: ComponentType<IncidentDetailLoadBoundaryProps>;
  IncidentDetailLoadKind: Readonly<{
    Current: "current";
    Failed: "failed";
    Pending: "pending";
  }>;
}>;

type IncidentDetailLoaderContract = Readonly<{
  clear(publish: (state: IncidentDetailSelection) => void): void;
  load(
    requested: PublicIncident,
    getIncident: (incidentId: PublicIncident["incident"]["id"]) => Promise<PublicIncident>,
    publish: (state: IncidentDetailSelection) => void,
  ): Promise<void>;
}>;

const first = incident("Task_Fail", 1);
const second = incident("Task_Other", 2);

test("renders delayed detail as non-actionable pending verification", async () => {
  const loader = new module.IncidentDetailLoader();
  const release = Promise.withResolvers<PublicIncident>();
  let selection: IncidentDetailSelection = null;

  const loading = loader.load(first, () => release.promise, (state) => { selection = state; });

  assert.equal(selected(selection).kind, module.IncidentDetailLoadKind.Pending);
  const pendingHtml = render(selection);
  assert.match(pendingHtml, /role="status"/u);
  assert.match(pendingHtml, /role="status"[^>]*tabindex="-1"/u);
  assert.match(pendingHtml, /Confirming that this incident is still current/u);
  assert.match(pendingHtml, /Back to incidents/u);
  assert.doesNotMatch(pendingHtml, /data-ui="incident-detail"/u);
  assert.doesNotMatch(pendingHtml, /Retry Service Task|Cancel Process/u);

  release.resolve(first);
  await loading;
  assert.equal(selected(selection).kind, module.IncidentDetailLoadKind.Current);
  assert.match(render(selection), /data-ui="incident-detail"/u);
});

for (const failure of [
  new Error("Incident not found (404)"),
  new Error("Incident snapshot unavailable (503)"),
  new Error("Connection reset"),
]) {
  test(`renders ${failure.message} without stale incident actions`, async () => {
    const loader = new module.IncidentDetailLoader();
    let selection: IncidentDetailSelection = null;

    await loader.load(first, async () => Promise.reject(failure), (state) => {
      selection = state;
    });

    assert.equal(selected(selection).kind, module.IncidentDetailLoadKind.Failed);
    const failedHtml = render(selection);
    assert.match(failedHtml, /role="alert"[^>]*tabindex="-1"/u);
    assert.match(failedHtml, new RegExp(escapeRegExp(failure.message), "u"));
    assert.match(failedHtml, /Back to incidents/u);
    assert.match(failedHtml, /Retry incident detail/u);
    assert.doesNotMatch(failedHtml, /data-ui="incident-detail"/u);
    assert.doesNotMatch(failedHtml, /Retry Service Task|Cancel Process/u);
  });
}

test("tab invalidation removes pending detail and ignores delayed success and failure", async () => {
  for (const outcome of ["success", "failure"] as const) {
    const loader = new module.IncidentDetailLoader();
    const release = Promise.withResolvers<PublicIncident>();
    let selection: IncidentDetailSelection = null;
    const loading = loader.load(first, () => release.promise, (state) => { selection = state; });

    loader.clear((state) => { selection = state; });
    assert.equal(render(selection), "");
    if (outcome === "success") release.resolve(first);
    else release.reject(new Error("late failure"));
    await loading;

    assert.equal(selection, null);
    assert.equal(render(selection), "");
  }
});

test("a later request keeps delayed completion from selecting stale detail", async () => {
  const loader = new module.IncidentDetailLoader();
  const firstRelease = Promise.withResolvers<PublicIncident>();
  let selection: IncidentDetailSelection = null;
  const publish = (state: IncidentDetailSelection) => { selection = state; };
  const firstLoad = loader.load(first, () => firstRelease.promise, publish);

  await loader.load(second, async () => second, publish);
  assert.equal(selected(selection).kind, module.IncidentDetailLoadKind.Current);
  assert.match(render(selection), /Task_Other/u);

  firstRelease.resolve(first);
  await firstLoad;
  const html = render(selection);
  assert.match(html, /Task_Other/u);
  assert.doesNotMatch(html, /Task_Fail/u);
});

test("moves focus to each mounted verification status surface", () => {
  assert.match(source, /useEffect\(\(\) => \{\s*queueFocus\(status\.current\);/u);
  assert.match(source, /ref=\{status\}\s*tabIndex=\{-1\}/u);
});

function render(state: IncidentDetailSelection): string {
  return renderToStaticMarkup(createElement(module.IncidentDetailLoadBoundary, {
    api: {} as never,
    definitionApi: {} as never,
    onBack: () => undefined,
    onCommitted: () => undefined,
    onRetry: () => undefined,
    state,
  }));
}

function incident(elementId: string, generation: number): PublicIncident {
  return {
    incident: {
      id: {
        effectId: {
          processInstanceId: "semantic-process-1",
          elementId,
          activation: generation,
        },
        generation,
      },
    },
  } as unknown as PublicIncident;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function selected(
  selection: IncidentDetailSelection,
): Exclude<IncidentDetailSelection, null> {
  if (selection === null) throw new Error("Expected a detail selection");
  return selection;
}
