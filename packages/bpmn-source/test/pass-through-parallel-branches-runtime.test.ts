/**
 * PTPB-PASS-01 and PTPB-COMMUTE-01 in committed core state over the retained pass-through branch scenarios. Every
 * stimulus commits without reaching `ambiguousInternalChoice`, which stands in for the singleton premise the proposal
 * argues rather than proves; every pass-through Task publishes exactly one occurrence that starts and ends in the
 * command delivering its token; and the office relocation's two completion orders reach one final state. Expected
 * commands and Tasks are read off the proposal's witness account.
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

const directory = new URL("../../../scenarios/pass-through-parallel-branches/", import.meta.url);

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
  /** Per command, the elements whose occurrences both started and ended in it. */
  instantaneous: readonly (readonly string[])[];
  /** Every started occurrence's element, once per start. */
  started: readonly string[];
}>;

/** Commits each stimulus, which no rolled-back or ambiguous closure may interrupt. */
function run(semanticProcess: SemanticProcessProgram, journey: readonly Stimulus[]): Journey {
  let state = initialState;
  const instantaneous: string[][] = [];
  const started: string[] = [];
  for (const stimulus of journey) {
    const traced = applyStimulusWithTrace(semanticProcess, state, stimulus);
    assert.equal(traced.result.outcome, CommandOutcome.Committed, stimulus.commandId);
    assert.equal(traced.result.ambiguousInternalChoice, false, stimulus.commandId);
    state = traced.result.state;
    assert.equal(isWellFormedRuntimeState(semanticProcess, state.control.kind === ControlStateKind.Running ||
      state.control.kind === ControlStateKind.Completed ? state.control.instanceId : "", state), true, stimulus.commandId);
    // An end names its occurrence by the anchor its start published, not by element.
    const starts = traced.flowNodeOccurrenceLifecycles.flatMap(delta => delta.started);
    const ends = new Set(traced.flowNodeOccurrenceLifecycles.flatMap(delta => delta.ended.map(({ anchor }) =>
      JSON.stringify(anchor))));
    started.push(...starts.map(({ elementId }) => elementId));
    instantaneous.push(starts.filter(({ anchor }) => ends.has(JSON.stringify(anchor))).map(({ elementId }) => elementId).sort());
  }
  return { final: state, instantaneous, started };
}

const relocationTasks = ["CloseRelocationTicket", "FileMoversConfirmation", "HandOverKeys", "LabelBoxes", "NotifyFacilities"];

test("the relocation's fork closure batches the declared entry beside two branch Tasks and later Tasks run where their token arrives", async () => {
  const relocation = await program("office-relocation");
  const packing = run(relocation, await stimuli("relocation-packing-first"));
  // Start, Approve relocation, Pack boxes, then the Book movers result.
  assert.deepEqual(packing.instantaneous[1]!.filter(id => relocationTasks.includes(id)),
    ["HandOverKeys", "LabelBoxes", "NotifyFacilities"]);
  assert.deepEqual(packing.instantaneous[2]!.filter(id => relocationTasks.includes(id)), []);
  assert.deepEqual(packing.instantaneous[3]!.filter(id => relocationTasks.includes(id)),
    ["CloseRelocationTicket", "FileMoversConfirmation"]);
  assert.equal(packing.final.control.kind, ControlStateKind.Completed);
  const movers = run(relocation, await stimuli("relocation-movers-first"));
  // Start, Approve relocation, the Book movers result, then Pack boxes, which fires the join.
  assert.deepEqual(movers.instantaneous[2]!.filter(id => relocationTasks.includes(id)), ["FileMoversConfirmation"]);
  assert.deepEqual(movers.instantaneous[3]!.filter(id => relocationTasks.includes(id)), ["CloseRelocationTicket"]);
  for (const journey of [packing, movers]) {
    assert.deepEqual(relocationTasks.map(id => journey.started.filter(element => element === id).length),
      relocationTasks.map(() => 1));
  }
  assert.deepEqual(movers.final.variables, packing.final.variables);
  assert.equal(movers.final.control.kind, ControlStateKind.Completed);
});

test("the invoice review's fork of two pass-through Tasks runs and joins inside Check invoice's closure", async () => {
  const settlement = run(await program("invoice-settlement"), await stimuli("invoice-settled"));
  assert.deepEqual(settlement.instantaneous[1]!.filter(id => ["ArchiveReceipt", "NotifyAccounting", "ReviewInvoice"].includes(id)),
    ["ArchiveReceipt", "NotifyAccounting"]);
  assert.deepEqual(["ArchiveReceipt", "NotifyAccounting"].map(id => settlement.started.filter(element => element === id).length),
    [1, 1]);
  assert.equal(settlement.final.control.kind, ControlStateKind.Completed);
});
