/**
 * The publication the host derives from the kernel journal: one revision per micro-step, an execution batch and a
 * flow-node-occurrence batch per committed input, the cursor that carries numbering across Continue-As-New, and the
 * page a reader gets for a revision the current Run still retains or no longer does.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import * as views from "./fixtures/host-views.ts";

const publication = await import(new URL("../dist/publication.js", import.meta.url).href) as
  typeof import("../src/publication.ts");

test("a committed input's journal becomes consecutive revisions with role = cause and the started fact's source type", () => {
  const log = publication.appendJournal(publication.openLog(publication.initialCursor), "start", views.effectOpen.journal);
  assert.deepEqual(log.execution, [{
    commandId: "start",
    fromRevision: 0,
    throughRevision: 3,
    transitions: [
      { revision: 1, role: { kind: "input", input: "start" }, element: "StartEvent_1", sourceType: "startEvent", owner: 0 },
      { revision: 2, role: { kind: "signal", signal: "armScope" }, element: null, sourceType: null, owner: 0 },
      { revision: 3, role: { kind: "arrive", flow: "Flow_StartToTask" }, element: "Task_Probe", sourceType: "task", owner: 0 },
    ],
  }]);
  assert.deepEqual(log.occurrences, [{
    commandId: "start",
    fromRevision: 0,
    throughRevision: 3,
    transitions: [
      { revision: 1, started: views.effectOpen.journal[0]!.started, ended: views.effectOpen.journal[0]!.ended },
      { revision: 3, started: views.effectOpen.journal[2]!.started, ended: [] },
    ],
  }]);
  assert.equal(log.cursor.revision, 3);
});

test("an element that began in an earlier input keeps the source type its start recorded", () => {
  const started = publication.appendJournal(publication.openLog(publication.initialCursor), "start", views.effectOpen.journal);
  const revisit = publication.appendJournal(started, "again", [
    { cause: { kind: "arrive", flow: "Flow_Again" }, element: "Task_Probe", owner: 0, started: [], ended: [] },
  ]);
  assert.equal(revisit.execution[1]!.transitions[0]!.sourceType, "task");
});

test("every execution batch has its occurrence batch over the same revisions, empty when no occurrence started or ended", () => {
  const started = publication.appendJournal(publication.openLog(publication.initialCursor), "start", views.effectOpen.journal);
  const revisit = publication.appendJournal(started, "again", [
    { cause: { kind: "arrive", flow: "Flow_Again" }, element: "Task_Probe", owner: 0, started: [], ended: [] },
  ]);
  const positions = (batches: readonly { commandId: string; fromRevision: number; throughRevision: number }[]) =>
    batches.map(({ commandId, fromRevision, throughRevision }) => [commandId, fromRevision, throughRevision]);
  assert.deepEqual(positions(revisit.occurrences), positions(revisit.execution));
  assert.deepEqual(revisit.occurrences[1], { commandId: "again", fromRevision: 3, throughRevision: 4, transitions: [] });
  const page = publication.readPage(revisit, 3, 10);
  assert.equal(page.kind, publication.PageKind.Available);
  if (page.kind !== publication.PageKind.Available) return;
  assert.deepEqual(positions(page.occurrences), [["again", 3, 4]]);
});

test("the cursor continues numbering in the next Run, which reports earlier revisions as a gap", () => {
  const first = publication.appendJournal(publication.openLog(publication.initialCursor), "start", views.effectOpen.journal);
  const carried = JSON.parse(JSON.stringify(first.cursor)) as typeof first.cursor;
  const next = publication.appendJournal(publication.openLog(carried), "complete", views.completed.journal);
  assert.deepEqual([next.execution[0]!.fromRevision, next.execution[0]!.throughRevision], [3, 5]);
  assert.deepEqual(publication.readPage(next, 0, 10), { kind: publication.PageKind.Gap, retainedAfterRevision: 3 });
  const page = publication.readPage(next, 3, 10);
  assert.equal(page.kind, publication.PageKind.Available);
  assert.equal(page.kind === publication.PageKind.Available ? page.headRevision : null, 5);
});

test("a page holds the batches after the requested revision, at most `limit` of them", () => {
  let log = publication.openLog(publication.initialCursor);
  log = publication.appendJournal(log, "start", views.boundedTask.journal);
  log = publication.appendJournal(log, "complete", views.boundedTaskCompleted.journal);
  log = publication.appendJournal(log, "finish", views.completed.journal);
  const page = publication.readPage(log, 3, 1);
  assert.equal(page.kind, publication.PageKind.Available);
  if (page.kind !== publication.PageKind.Available) return;
  assert.deepEqual(page.execution.map((batch) => batch.commandId), ["complete"]);
  assert.deepEqual(page.occurrences.map((batch) => batch.commandId), ["complete"]);
  assert.equal(page.headRevision, 7);
});

test("an input whose journal is empty publishes nothing", () => {
  const log = publication.appendJournal(publication.openLog(publication.initialCursor), "noop", []);
  assert.deepEqual([log.execution, log.occurrences, log.cursor.revision], [[], [], 0]);
});
