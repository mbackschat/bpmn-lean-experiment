/**
 * The literal assignment and form metadata a User Task publishes (PC-HUM-02): assignee, candidate users and groups,
 * form key, typed form fields, due and follow-up instants and priority, each copied from the model unchanged except
 * the priority, which CIB parses as a Java `int` (`TaskDecorator#initializeTaskPriority`). The oracle is the retained
 * CIB answer of `human-task-metadata-composition`, whose open tasks publish these values beside their occurrence;
 * expression-valued fields wait for the Task fields JUEL level and are refused at admission.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";

import { activity, base, task, text, userWork, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

/** The detail `T` publishes once the instance started. */
function published(fields: Json): unknown {
  const decoded = decodeProgram(wired(task(activity("T", userWork(fields)))(base())));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const stimulus = stimulusFromJson({ commandId: "start", kind: "start", instanceId: "I", variables: [] });
  assert.ok(stimulus.ok);
  const started = step(decoded.value, null, stimulus.value[1]);
  assert.ok(started.ok, JSON.stringify(started));
  const [item] = started.value.openItems;
  return (item!.kind as unknown as { detail: unknown }).detail;
}

test("a User Task publishes its literal assignment and form metadata", () => {
  assert.deepEqual(published({
    name: "Triage case", assignee: text("alice"), candidateUsers: [text("bob"), text("carol")],
    candidateGroups: [text("triagers"), text("leads")], formKey: "embedded:app:forms/triage.html",
    formFields: [["route", "string"], ["urgent", "boolean"]], dueDate: text("2026-12-31T00:00:00Z"),
    followUpDate: text("2026-12-24T00:00:00Z"), priority: text("070"),
  }), {
    name: "Triage case", assignee: "alice", candidateUsers: ["bob", "carol"], candidateGroups: ["triagers", "leads"],
    formKey: "embedded:app:forms/triage.html", formFields: [["route", "string"], ["urgent", "boolean"]],
    dueDate: "2026-12-31T00:00:00Z", followUpDate: "2026-12-24T00:00:00Z", priority: 70, inputs: [],
  });
});

test("a metadata-free User Task publishes no metadata", () => {
  assert.deepEqual(published({}), {
    name: null, assignee: null, candidateUsers: [], candidateGroups: [], formKey: null, formFields: [], dueDate: null,
    followUpDate: null, priority: null, inputs: [],
  });
});

test("a negative priority is published as parsed", () => {
  assert.equal((published({ priority: text("-5") }) as { priority: number }).priority, -5);
});
