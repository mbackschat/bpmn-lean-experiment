import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspace = await readFile(
  new URL("../src/operations-workspace.tsx", import.meta.url),
  "utf8",
);
const incidents = await readFile(
  new URL("../src/incidents-panel.tsx", import.meta.url),
  "utf8",
);
const detail = await readFile(
  new URL("../src/incident-detail-workspace.tsx", import.meta.url),
  "utf8",
);
const audit = await readFile(
  new URL("../src/incident-audit-panel.tsx", import.meta.url),
  "utf8",
);
const collection = await readFile(
  new URL("../src/incident-collection.tsx", import.meta.url),
  "utf8",
);
const detailCss = await readFile(
  new URL("../src/incident-detail-workspace.module.css", import.meta.url),
  "utf8",
);
const auditCss = await readFile(
  new URL("../src/incident-audit-panel.module.css", import.meta.url),
  "utf8",
);

test("uses the approved Operations information architecture and complete responsive table", () => {
  assert.match(workspace, /label: "Process instances"/u);
  assert.match(workspace, /label: "Incidents"/u);
  assert.match(workspace, /label: "Audit"/u);
  assert.match(workspace, /ProcessInstanceSearchPanel/u);
  assert.match(collection, /aria-label="Current incidents"/u);
  assert.match(collection, /DataTableResponsiveMode\.Cards/u);
  assert.doesNotMatch(collection, /Retry[^\n]*onPress|Cancel Process[^\n]*onPress/u);
});

test("uses the Operations container width for embedded detail and audit reflow", () => {
  assert.match(detailCss, /@container operations/u);
  assert.match(auditCss, /@container operations/u);
  assert.doesNotMatch(`${detailCss}\n${auditCss}`, /@media/u);
});

test("keeps detail full width with exact overview, diagram highlight, audit, and safe Cancel", () => {
  assert.match(detail, /data-ui="incident-detail"/u);
  assert.match(detail, /label: "Overview"/u);
  assert.match(detail, /label: "Diagram"/u);
  assert.match(detail, /label: "Audit"/u);
  assert.match(detail, /activeElementId=\{current\.incident\.effect\.id\.elementId\}/u);
  assert.match(detail, /cancelLabel="Keep Process running"/u);
  assert.match(detail, /title="Cancel root Process\?"/u);
  assert.match(detail, /remaining live work/u);
  assert.match(detail, /committed data is preserved/u);
  assert.match(detail, /Rejected, no longer current/u);
  assert.match(detail, /retainedIncidentActionLabel\(retainedKind\)/u);
  assert.doesNotMatch(detail, /operation\.hasRetainedAction/u);
});

test("makes focus and stale-response behavior explicit", () => {
  assert.match(incidents, /requests\.current\.isCurrent\(generation\)/u);
  assert.match(incidents, /rowRefs/u);
  assert.match(incidents, /restoreCollectionFocus\.current = \{ rowKey: returnFocusKey\.current \}/u);
  assert.match(incidents, /queueFocus\(row \?\? heading\.current\)/u);
  assert.match(audit, /sequence\.current\.isCurrent\(activeLoad\.generation\)/u);
  assert.match(audit, /beginIncidentAuditLoad\(sequence\.current, focus\)/u);
  assert.match(audit, /ref=\{errorAlert\} tabIndex=\{-1\}/u);
  assert.match(audit, /They do not prove that an incident is current/u);
});
