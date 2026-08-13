import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  Button,
  ButtonVariant,
  BooleanChoice,
  Checkbox,
  DataTable,
  DataTableCardWidth,
  DataTableResponsiveMode,
  TextField,
  WorkspaceTabs,
  type DataTableColumn,
} from "../dist/index.js";

const rootStyles = await readFile(
  new URL("../src/ui-kit.css", import.meta.url),
  "utf8",
);
const tableStyles = await readFile(
  new URL("../src/data-table.module.css", import.meta.url),
  "utf8",
).catch(() => "");

test("renders accessible React Aria controls with native form semantics", () => {
  const html = renderToStaticMarkup(createElement("div", null,
    createElement(Button, null, "Claim"),
    createElement(Button, { variant: ButtonVariant.Plain }, "Open task"),
    createElement(TextField, {
      label: "Decision note",
      name: "decision",
      defaultValue: "Review",
    }),
    createElement(Checkbox, { name: "approved" }, "Approved"),
    createElement(BooleanChoice, { label: "Decision", name: "decision" }),
  ));

  assert.match(html, /<button/u);
  assert.match(html, />Claim</u);
  assert.match(html, /class="[^"]+ [^"]+"[^>]*>Open task/u);
  assert.match(html, /<label[^>]*>Decision note<\/label>/u);
  assert.match(html, /name="decision"/u);
  assert.match(html, /type="checkbox"/u);
  assert.match(html, />Approved</u);
  assert.equal(html.match(/type="radio"/gu)?.length, 2);
  assert.match(html, /role="radiogroup"/u);
  assert.doesNotMatch(html, /type="radio"[^>]*checked/u);
});

test("renders a native TanStack-backed table with stable row identity", () => {
  type Row = Readonly<{ id: string; name: string }>;
  const columns: readonly DataTableColumn<Row>[] = [{
    cardWidth: DataTableCardWidth.Full,
    id: "name",
    header: "Task",
    responsiveLabel: "Task",
    cell: (row) => row.name,
  }];
  const html = renderToStaticMarkup(createElement(DataTable<Row>, {
    "aria-label": "Current tasks",
    columns,
    rows: [{ id: "task-1", name: "Review request" }],
    rowId: (row) => row.id,
    responsiveMode: DataTableResponsiveMode.Cards,
  }));

  assert.match(html, /<table[^>]*aria-label="Current tasks"/u);
  assert.match(html, /<th[^>]*>Task<\/th>/u);
  assert.match(html, /<td[^>]*>Review request<\/td>/u);
  assert.match(html, /<td[^>]*data-label="Task"/u);
  assert.match(html, /data-responsive="cards"/u);
  assert.match(html, /data-card-width="full"/u);
});

test("renders shared React Aria tabs with one selected object panel", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceTabs, {
    "aria-label": "Task detail views",
    selectedKey: "form",
    tabs: [{ id: "form", label: "Form", content: "form-content" }, {
      id: "diagram",
      label: "Diagram",
      content: "diagram-content",
    }],
  }));

  assert.match(html, /aria-label="Task detail views"[^>]*role="tablist"/u);
  assert.match(html, /aria-selected="true"[^>]*role="tab"[^>]*>Form/u);
  assert.match(html, /role="tabpanel"/u);
  assert.match(html, /form-content/u);
  assert.doesNotMatch(html, /diagram-content/u);
});

test("keeps shared component styling in CSS Modules without a horizontal table scroller", () => {
  assert.doesNotMatch(rootStyles, /\.ui(?:Button|TextField|Checkbox|BooleanChoice|Radio|DataTable|TableScroller)\b/u);
  assert.match(tableStyles, /\.collection\s*\{[^}]*overflow:\s*visible/su);
  assert.doesNotMatch(tableStyles, /overflow-x:\s*(?:auto|scroll)/u);
  assert.match(tableStyles, /@container \(max-width: 45rem\)/u);
  assert.match(tableStyles, /grid-template-columns: 1fr/u);
});
