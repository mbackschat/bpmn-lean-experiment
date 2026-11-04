/**
 * LNK-CONT-01 in committed core state over the four Link journeys. The oracle is the explicit-flow twin's journey in
 * `scenarios/none-intermediate-throw/`: every command of a Link journey must commit with exactly the twin's traced
 * result, and no occurrence may name a Link Event, so a Link lowered to a step or a wait cannot pass.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { CommandOutcome, ControlStateKind, SemanticProfileId, applyStimulusWithTrace, initialState } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const scenarios = new URL("../../../scenarios/", import.meta.url);

async function program(path: string, twin: string): Promise<SemanticProcessProgram> {
  const overlay = new Uint8Array(await readFile(new URL(`none-intermediate-throw/${twin}-overlay.json`, scenarios)));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: new Uint8Array(await readFile(new URL(path, scenarios))), sourceId: twin, expectedSha256: undefined,
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: `${twin}-handlers`, sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: semanticProcessTestLimits,
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
  return compiled.semanticProcess;
}

const stimuli = async (path: string): Promise<readonly Stimulus[]> =>
  (JSON.parse(await readFile(new URL(path, scenarios), "utf8")) as { stimuli: Stimulus[] }).stimuli;

const journeys = [
  ["warranty-repair", "warranty-passed"], ["warranty-repair", "warranty-rework"],
  ["onboarding-milestones", "onboarding-account-first"], ["onboarding-milestones", "onboarding-laptop-first"],
] as const;

test("each Link journey commits every command exactly as its explicit-flow twin's", async () => {
  for (const [twin, journey] of journeys) {
    const linked = await program(`link-events/${twin}-links.bpmn`, twin);
    const plain = await program(`none-intermediate-throw/${twin}.bpmn`, twin);
    const linkedStimuli = await stimuli(`link-events/${journey}.scenario.json`);
    // The scenarios differ only in their source binding, so the twin's stimuli are the Link journey's.
    assert.deepEqual(linkedStimuli, await stimuli(`none-intermediate-throw/${journey}.scenario.json`), journey);
    let linkedState = initialState, plainState = initialState;
    for (const stimulus of linkedStimuli) {
      const left = applyStimulusWithTrace(linked, linkedState, stimulus);
      const right = applyStimulusWithTrace(plain, plainState, stimulus);
      assert.equal(left.result.outcome, CommandOutcome.Committed, `${journey} ${stimulus.commandId}`);
      assert.deepEqual(left, right, `${journey} ${stimulus.commandId}`);
      const named = left.flowNodeOccurrenceLifecycles.flatMap(delta => delta.started.map(({ elementId }) => elementId));
      assert.equal(named.some(id => /^(Throw|Catch)/.test(id)), false, `${journey} ${stimulus.commandId}`);
      linkedState = left.result.state;
      plainState = right.result.state;
    }
    assert.equal(linkedState.control.kind, ControlStateKind.Completed, journey);
  }
});
