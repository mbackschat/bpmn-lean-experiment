import assert from "node:assert/strict";
import { test } from "node:test";

import {
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
} from "@bpmn-lean/semantic-core";
import {
  requiresHostProgressBeforeCompletion,
} from "@bpmn-lean/temporal-adapter";

import {
  loadJson,
  requiredScenarioUrl,
  timerUserTaskCompositionScenarioUrl,
} from "./temporal-test-support.ts";

function completionIn(
  scenario: Scenario,
): CompleteUserTaskInstanceStimulus {
  const completion = scenario.stimuli.find(
    (stimulus) =>
      stimulus.kind === StimulusKind.CompleteUserTaskInstance,
  );
  assert.ok(completion !== undefined);
  return completion;
}

test("waits only when host-driven progress precedes a User Task completion", async () => {
  const composed = await loadJson<Scenario>(
    timerUserTaskCompositionScenarioUrl,
  );
  const direct = await loadJson<Scenario>(requiredScenarioUrl(0));

  assert.equal(
    requiresHostProgressBeforeCompletion(
      composed,
      completionIn(composed),
    ),
    true,
  );
  assert.equal(
    requiresHostProgressBeforeCompletion(direct, completionIn(direct)),
    false,
  );
});

test("rejects a completion outside the retained scenario", async () => {
  const direct = await loadJson<Scenario>(requiredScenarioUrl(0));
  const foreign = completionIn(
    await loadJson<Scenario>(timerUserTaskCompositionScenarioUrl),
  );

  assert.throws(
    () => requiresHostProgressBeforeCompletion(direct, foreign),
    /not part of the admitted scenario/u,
  );
});
