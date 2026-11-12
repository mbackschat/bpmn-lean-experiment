/**
 * PC-HUM-05: a Manual Task is pass-through work that keeps its source kind. It opens no wait, each arriving token
 * begins and ends one occurrence of it (BPMN 2.0.2 §13.3.1: an Activity is enabled per token, with no implicit join),
 * and the host view's journal names its occurrences `manualTask`, so a reading that treated it as a User Task (a wait)
 * or erased its kind to a plain Task differs in the observation. The witness with CIB evidence is
 * `scenarios/open-rows/manual-task-split-merge`; this locks the source kind, which that evidence does not observe.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { runHostView } from "./lean-paired.ts";

import { activity, base, end, envelope, flow, start, userWork } from "./admission-refusal-support.ts";

type Json = Record<string, any>;

/** `Start → Prepare` (manual) `→ Roof, Cellar` (User Tasks) `→ Record` (manual) `→ SignOff → End`. */
function siteVisit(manualSourceType: string): Json {
  const manual = (id: string, env: Json): Json => {
    const element = activity(id, "manual", env);
    (element.activity as Json).header.sourceType = manualSourceType;
    return element;
  };
  const user = (id: string, incoming: string, outgoing: string): Json => activity(id, userWork(), { incoming: [incoming], outgoing: [outgoing] });
  const program = base();
  const begin = start("Start");
  (begin.start as Json).payload.outgoing = ["To_Prepare"];
  const finish = end("End");
  (finish.event as Json).payload.incoming = ["To_End"];
  return {
    ...program,
    elements: [
      begin,
      manual("Prepare", envelope({ incoming: ["To_Prepare"], outgoing: ["To_Roof", "To_Cellar"] })),
      user("Roof", "To_Roof", "Roof_Done"),
      user("Cellar", "To_Cellar", "Cellar_Done"),
      manual("Record", envelope({ incoming: ["Roof_Done", "Cellar_Done"], outgoing: ["To_SignOff"] })),
      user("SignOff", "To_SignOff", "To_End"),
      finish,
    ],
    flows: [
      flow("To_Prepare", "Start", "Prepare"), flow("To_Roof", "Prepare", "Roof"), flow("To_Cellar", "Prepare", "Cellar"),
      flow("Roof_Done", "Roof", "Record"), flow("Cellar_Done", "Cellar", "Record"), flow("To_SignOff", "Record", "SignOff"),
      flow("To_End", "SignOff", "End"),
    ],
  };
}

const complete = (commandId: string, elementId: string, activation: number): Json => ({
  kind: "command", commandId, occurrence: { processInstanceId: "I", elementId, activation },
  action: { kind: "completeUserTask", values: [] },
});

/** One inspection and its sign-off complete before the other inspection does. */
const scenario = {
  stimuli: [
    { kind: "start", commandId: "start", instanceId: "I", variables: [] },
    complete("roof", "Roof", 1), complete("sign-1", "SignOff", 1), complete("cellar", "Cellar", 1), complete("sign-2", "SignOff", 2),
  ],
};

type View = Readonly<{ status: string; openWaits: Json[]; journal: Json[] }>;

function views(manualSourceType: string): readonly View[] {
  const run = runHostView(siteVisit(manualSourceType), scenario) as Json;
  assert.equal(run.result.outcome.outcome, "committed", JSON.stringify(run.result.outcome));
  return run.hostViews as View[];
}

const waits = (view: View): string[] => view.openWaits.map((wait) => `${wait.id.elementId}#${wait.id.activation}`).sort();

/** The occurrences a view's journal began, as `element#activation:sourceType`, for the Manual Tasks only. */
const manualStarts = (view: View): string[] => view.journal.flatMap((transition) => transition.started)
  .filter((fact: Json) => ["Prepare", "Record"].includes(fact.occurrence.elementId))
  .map((fact: Json) => `${fact.occurrence.elementId}#${fact.occurrence.activation}:${fact.sourceType}`);

test("a Manual Task opens no wait and begins one occurrence per arriving token", () => {
  const [started, roof, signed, cellar, done] = views("manualTask");
  assert.deepEqual(waits(started!), ["Cellar#1", "Roof#1"], "the split takes both flows without a Manual wait");
  assert.deepEqual(waits(roof!), ["Cellar#1", "SignOff#1"], "the first arrival passes Record without waiting for the other");
  assert.deepEqual(waits(signed!), ["Cellar#1"]);
  assert.deepEqual(waits(cellar!), ["SignOff#2"], "the second arrival is a second occurrence of Record");
  assert.equal(done!.status, "completed");
});

test("the journal keeps a Manual Task's source kind on every occurrence it begins", () => {
  const [started, roof, , cellar] = views("manualTask");
  assert.deepEqual(manualStarts(started!), ["Prepare#1:manualTask"]);
  assert.deepEqual(manualStarts(roof!), ["Record#1:manualTask"]);
  assert.deepEqual(manualStarts(cellar!), ["Record#2:manualTask"]);
  // The same graph read as plain Tasks runs alike, so only the source kind tells the two apart.
  const [plainStarted] = views("task");
  assert.deepEqual(waits(plainStarted!), waits(started!));
  assert.deepEqual(manualStarts(plainStarted!), ["Prepare#1:task"]);
});
