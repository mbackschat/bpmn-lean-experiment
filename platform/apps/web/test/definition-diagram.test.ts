import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const diagramSource = await readFile(
  new URL("../src/definition-diagram.tsx", import.meta.url),
  "utf8",
);
const workInboxSource = await readFile(
  new URL("../src/work-inbox-panel.tsx", import.meta.url),
  "utf8",
);
const workDetailSource = await readFile(
  new URL("../src/work-task-detail-workspace.tsx", import.meta.url),
  "utf8",
);

test("definition diagrams fetch resolved presentation instead of admitted source", () => {
  assert.match(diagramSource, /api\.getPresentation\(definition\)/u);
  assert.doesNotMatch(diagramSource, /api\.getSource\(definition\)/u);
  assert.match(diagramSource, /Source layout/u);
  assert.match(diagramSource, /Generated layout/u);
  assert.match(diagramSource, /Diagram view is unavailable/u);
  assert.match(diagramSource, /Download diagrammed BPMN/u);
  assert.match(diagramSource, /Derived presentation copy, not admitted source/u);
  assert.match(
    diagramSource,
    /downloadDefinitionPresentation\(presentation\)/u,
  );
  assert.match(diagramSource, /activeElementId\?: string/u);
  assert.match(diagramSource, /viewer\.current\.highlight\(activeElementId\)/u);
  assert.match(diagramSource, /viewer\.current\.highlightMany\(activeElementIds\)/u);
  assert.match(diagramSource, /highlighting \$\{activeElementId\}/u);
});

test("Work keeps a presentation-only definition dependency", () => {
  assert.match(
    workInboxSource,
    /Pick<DefinitionApiClient,\s*"getPresentation">/u,
  );
  assert.match(
    workDetailSource,
    /Pick<DefinitionApiClient,\s*"getPresentation">/u,
  );
  assert.doesNotMatch(workInboxSource, /Pick<DefinitionApiClient,\s*"getSource">/u);
  assert.doesNotMatch(workDetailSource, /Pick<DefinitionApiClient,\s*"getSource">/u);
  assert.match(
    workDetailSource,
    /task\.task\.id\.processInstanceId ===\s*task\.hostingInstance\.processInstanceId/u,
  );
  assert.match(
    workDetailSource,
    /activeElementId=\{task\.task\.id\.elementId\}/u,
  );
  assert.match(workDetailSource, /called Process whose exact diagram binding is not published/u);
});
