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
const { canonicalBytes, chainCapacity } = await import(new URL("../dist/capacity.js", import.meta.url).href) as
  typeof import("../src/capacity.ts");

test("a committed input's journal becomes consecutive revisions with role = cause and the started fact's source type", () => {
  const log = publication.appendJournal(publication.openLog(publication.initialCursor), "start", views.effectOpen.journal);
  assert.deepEqual(log.execution, [{
    commandId: "start",
    fromRevision: 0,
    throughRevision: 3,
    transitions: [
      { revision: 1, role: { kind: "input", input: "start" }, element: "StartEvent_1", sourceType: "startEvent" },
      { revision: 2, role: { kind: "signal", signal: "armScope" }, element: null, sourceType: null },
      { revision: 3, role: { kind: "arrive", flow: "Flow_StartToTask" }, element: "Task_Probe", sourceType: "task" },
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

test("a held occurrence's Ready list is carried into its occurrence transition, even on a step that starts nothing (PD2)", () => {
  const task = { processInstanceId: views.instance, elementId: "Task_Probe", activation: 1, role: "element" };
  const earlier = { ...task, activation: 2 };
  const log = publication.appendJournal(publication.openLog(publication.initialCursor), "start", [
    { cause: { kind: "input", input: "start" }, element: "Task_Probe", started: [{ occurrence: task, sourceType: "userTask" }], ended: [], ready: [task] },
    { cause: { kind: "signal", signal: "armScope" }, element: null, started: [], ended: [], ready: [earlier] },
  ]);
  assert.deepEqual(log.occurrences[0]!.transitions, [
    { revision: 1, started: [{ occurrence: task, sourceType: "userTask" }], ended: [], ready: [task] },
    { revision: 2, started: [], ended: [], ready: [earlier] },
  ]);
});

test("an element that began in an earlier input keeps the source type its start recorded", () => {
  const started = publication.appendJournal(publication.openLog(publication.initialCursor), "start", views.effectOpen.journal);
  const revisit = publication.appendJournal(started, "again", [
    { cause: { kind: "arrive", flow: "Flow_Again" }, element: "Task_Probe", started: [], ended: [] },
  ]);
  assert.equal(revisit.execution[1]!.transitions[0]!.sourceType, "task");
});

test("every execution batch has its occurrence batch over the same revisions, empty when no occurrence started or ended", () => {
  const started = publication.appendJournal(publication.openLog(publication.initialCursor), "start", views.effectOpen.journal);
  const revisit = publication.appendJournal(started, "again", [
    { cause: { kind: "arrive", flow: "Flow_Again" }, element: "Task_Probe", started: [], ended: [] },
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

test("an input's batch bytes are exact up to the batch bound and above it once its batches are", () => {
  const bound = chainCapacity.publicationBatchBytes;
  const exact = (log: ReturnType<typeof publication.openLog>) =>
    canonicalBytes(log.execution.at(-1)) + canonicalBytes(log.occurrences.at(-1));
  const measured = Array.from({ length: 90 }, (_, step) => {
    const journal = Array.from({ length: 200 + step * 2 }, (_, index) => views.effectOpen.journal[index % 3]!);
    const log = publication.appendJournal(publication.openLog(publication.initialCursor), "start", journal);
    return [log.batchBytes[0]!, exact(log)] as const;
  });
  assert.ok(measured.some(([, bytes]) => bytes <= bound) && measured.some(([, bytes]) => bytes > bound), "the journals straddle the bound");
  for (const [bytes, whole] of measured) assert.ok(whole <= bound ? bytes === whole : bytes > bound, `${String(bytes)} for ${String(whole)}`);
});
