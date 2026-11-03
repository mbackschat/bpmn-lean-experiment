/**
 * NIT-PASS-01 in committed core state over the retained None Throw scenarios. Every stimulus commits without reaching
 * `ambiguousInternalChoice`; every None Throw publishes exactly one occurrence per arriving token, started and ended in
 * the command delivering it, with a fresh occurrence on each re-entry; and the onboarding's two completion orders
 * reach one final state. Expected commands and Events are read off the proposal's witness account.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, ControlStateKind, SemanticProfileId, applyStimulusWithTrace, initialState, isWellFormedRuntimeState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const directory = new URL("../../../scenarios/none-intermediate-throw/", import.meta.url);

async function program(model: string): Promise<SemanticProcessProgram> {
  const overlay = new Uint8Array(await readFile(new URL(`${model}-overlay.json`, directory)));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: new Uint8Array(await readFile(new URL(`${model}.bpmn`, directory))), sourceId: model, expectedSha256: undefined,
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: `${model}-handlers`, sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: semanticProcessTestLimits,
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
  return compiled.semanticProcess;
}

const stimuli = async (scenario: string): Promise<readonly Stimulus[]> =>
  (JSON.parse(await readFile(new URL(`${scenario}.scenario.json`, directory), "utf8")) as { stimuli: Stimulus[] }).stimuli;

type Journey = Readonly<{
  final: RuntimeState;
  /** Per command, the None Throws whose occurrences both started and ended in it. */
  instantaneous: readonly (readonly string[])[];
  /** Per None Throw, the anchors of its started occurrences, once per start. */
  anchors: ReadonlyMap<string, readonly string[]>;
}>;

/** Commits each stimulus, which no rolled-back or ambiguous closure may interrupt. */
function run(semanticProcess: SemanticProcessProgram, journey: readonly Stimulus[], events: readonly string[]): Journey {
  let state = initialState;
  const instantaneous: string[][] = [];
  const anchors = new Map<string, string[]>(events.map(id => [id, []]));
  for (const stimulus of journey) {
    const traced = applyStimulusWithTrace(semanticProcess, state, stimulus);
    assert.equal(traced.result.outcome, CommandOutcome.Committed, stimulus.commandId);
    assert.equal(traced.result.ambiguousInternalChoice, false, stimulus.commandId);
    state = traced.result.state;
    assert.equal(isWellFormedRuntimeState(semanticProcess, state.control.kind === ControlStateKind.Running ||
      state.control.kind === ControlStateKind.Completed ? state.control.instanceId : "", state), true, stimulus.commandId);
    // An end names its occurrence by the anchor its start published, not by element.
    const starts = traced.flowNodeOccurrenceLifecycles.flatMap(delta => delta.started)
      .filter(({ elementId }) => events.includes(elementId));
    const ends = new Set(traced.flowNodeOccurrenceLifecycles.flatMap(delta => delta.ended.map(({ anchor }) =>
      JSON.stringify(anchor))));
    for (const { elementId, anchor } of starts) anchors.get(elementId)!.push(JSON.stringify(anchor));
    assert.ok(starts.every(({ anchor }) => ends.has(JSON.stringify(anchor))), stimulus.commandId);
    instantaneous.push(starts.map(({ elementId }) => elementId).sort());
  }
  return { final: state, instantaneous, anchors };
}

const warrantyEvents = ["DeviceReleased", "FaultDiagnosed", "RepairStarted", "ReworkRequested"];
const onboardingEvents = ["AccountReady", "OnboardingComplete", "WelcomeSent"];

test("a passing repair throws each milestone once, in the command that delivers its token", async () => {
  const passed = run(await program("warranty-repair"), await stimuli("warranty-passed"), warrantyEvents);
  // Start, Diagnose fault, Replace part, the Order spare part result, then Test device.
  assert.deepEqual(passed.instantaneous, [[], ["FaultDiagnosed", "RepairStarted"], [], [], ["DeviceReleased"]]);
  assert.equal(passed.final.control.kind, ControlStateKind.Completed);
});

test("a failed test throws Rework requested and a fresh Repair started occurrence in the re-entered Sub-Process", async () => {
  const rework = run(await program("warranty-repair"), await stimuli("warranty-rework"), warrantyEvents);
  assert.deepEqual(rework.instantaneous, [[], ["FaultDiagnosed", "RepairStarted"], [], [],
    ["RepairStarted", "ReworkRequested"], [], [], ["DeviceReleased"]]);
  const repairStarted = rework.anchors.get("RepairStarted")!;
  assert.equal(new Set(repairStarted).size, 2);
  assert.deepEqual(["DeviceReleased", "FaultDiagnosed", "ReworkRequested"].map(id => rework.anchors.get(id)!.length),
    [1, 1, 1]);
  assert.equal(rework.final.control.kind, ControlStateKind.Completed);
});

test("the onboarding milestones fire where their branch token arrives in either completion order", async () => {
  const onboarding = await program("onboarding-milestones");
  const accountFirst = run(onboarding, await stimuli("onboarding-account-first"), onboardingEvents);
  // Start, Confirm start date, Create account, then the Order laptop result, which fires the join.
  assert.deepEqual(accountFirst.instantaneous, [[], ["WelcomeSent"], ["AccountReady"], ["OnboardingComplete"]]);
  const laptopFirst = run(onboarding, await stimuli("onboarding-laptop-first"), onboardingEvents);
  assert.deepEqual(laptopFirst.instantaneous, [[], ["WelcomeSent"], [], ["AccountReady", "OnboardingComplete"]]);
  assert.deepEqual(laptopFirst.final.variables, accountFirst.final.variables);
  for (const journey of [accountFirst, laptopFirst]) {
    assert.equal(journey.final.control.kind, ControlStateKind.Completed);
  }
});
