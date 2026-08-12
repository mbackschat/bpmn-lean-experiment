import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  Button,
  ButtonVariant,
  Checkbox,
  DataTable,
  TextField,
  type DataTableColumn,
} from "../dist/index.js";

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
  ));

  assert.match(html, /<button/u);
  assert.match(html, />Claim</u);
  assert.match(html, /class="uiButton uiButtonPlain"[^>]*>Open task/u);
  assert.match(html, /<label[^>]*>Decision note<\/label>/u);
  assert.match(html, /name="decision"/u);
  assert.match(html, /type="checkbox"/u);
  assert.match(html, />Approved</u);
});

test("renders a native TanStack-backed table with stable row identity", () => {
  type Row = Readonly<{ id: string; name: string }>;
  const columns: readonly DataTableColumn<Row>[] = [{
    id: "name",
    header: "Task",
    cell: (row) => row.name,
  }];
  const html = renderToStaticMarkup(createElement(DataTable<Row>, {
    "aria-label": "Current tasks",
    columns,
    rows: [{ id: "task-1", name: "Review request" }],
    rowId: (row) => row.id,
  }));

  assert.match(html, /<table[^>]*aria-label="Current tasks"/u);
  assert.match(html, /<th[^>]*>Task<\/th>/u);
  assert.match(html, /<td[^>]*>Review request<\/td>/u);
});
