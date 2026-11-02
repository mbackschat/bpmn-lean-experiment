/**
 * The core journeys of the Exclusive choice arity proposal over the complaint handling model: XCA-ORDER-01 and
 * XCA-DEFAULT-01 for a three-condition and a one-condition Choice. The billing-only schedule, which selects the middle
 * candidate alone, runs only here and in the CIB probe, not as a pipeline case. Expected tasks are read off the
 * proposal's witness-model account, not off a run.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, ControlStateKind, EffectExecutionResultKind, SemanticProfileId, StimulusKind, applyStimulus, initialState,
  isWellFormedRuntimeState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { text } from "./effect-data-fixture.ts";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const directory = new URL("../../../scenarios/exclusive-choice-arity/", import.meta.url);
const instanceId = "Complaint_1";

async function complaintHandling(edit: (xml: string) => string = xml => xml): Promise<SemanticProcessProgram> {
  const overlay = new Uint8Array(await readFile(new URL("complaint-handling-overlay.json", directory)));
  const xml = edit(await readFile(new URL("complaint-handling.bpmn", directory), "utf8"));
  const result = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "complaint-handling", expectedSha256: undefined,
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "complaint-handling-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: semanticProcessTestLimits,
  });
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result.semanticProcess;
}

const bind = (name: string, value: string): VariableBinding => ({ name, value: text(value) });

function commit(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed, JSON.stringify(stimulus));
  assert.equal(result.ambiguousInternalChoice, false, JSON.stringify(stimulus));
  assert.equal(isWellFormedRuntimeState(program, instanceId, result.state), true, JSON.stringify(stimulus));
  return result.state;
}

const userTask = (elementId: string, submittedValues: readonly VariableBinding[] = []): Stimulus => ({
  kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}`,
  taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues });

const openWork = (state: RuntimeState) =>
  [...state.userTaskWaits.map(({ id }) => id.elementId), ...state.effectWaits.map(({ id }) => id.elementId)].sort();

/** Starts the complaint and classifies it, returning the state after *Route complaint* has chosen. */
function classified(program: SemanticProcessProgram, category: string, priority: string): RuntimeState {
  const opened = commit(program, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: "Process_ComplaintHandling", instanceId, initialVariables: [bind("orderNumber", "ORD-7")] });
  assert.deepEqual(openWork(opened), ["ClassifyComplaint"]);
  return commit(program, opened, userTask("ClassifyComplaint", [bind("category", category), bind("priority", priority)]));
}

function completes(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): void {
  const done = commit(program, state, stimulus);
  assert.deepEqual(openWork(done), []);
  assert.equal(done.control.kind, ControlStateKind.Completed);
}

// Each user-task route of Route complaint, and the one-condition Follow-up needed taking its default afterwards.
for (const [label, category, priority, routed] of [
  ["urgent billing selects the first of two true candidates", "billing", "urgent", "EscalateToSupervisor"],
  ["billing alone selects the middle candidate", "billing", "normal", "CorrectInvoice"],
  ["a product complaint takes the default after three false candidates", "product", "normal", "AnswerCustomer"],
] as const) {
  test(`XCA-ORDER-01 and XCA-DEFAULT-01: ${label}`, async () => {
    const program = await complaintHandling();
    const state = classified(program, category, priority);
    assert.deepEqual(openWork(state), [routed]);
    completes(program, state, userTask(routed));
  });
}

test("XCA-ORDER-01: a delivery complaint arms Reship order after two false candidates, then confirms delivery", async () => {
  const program = await complaintHandling();
  let state = classified(program, "delivery", "normal");
  assert.deepEqual(openWork(state), ["ReshipOrder"]);
  assert.deepEqual(state.effectWaits[0]!.arguments, [bind("order", "ORD-7")]);
  state = commit(program, state, { kind: StimulusKind.CompleteEffect, commandId: "effect-ReshipOrder",
    effectId: { processInstanceId: instanceId, elementId: "ReshipOrder", activation: 1 },
    result: { kind: EffectExecutionResultKind.Success, localPatch: [bind("tracking", "TRK-42")] } });
  // XCA-ORDER-01 for the one-condition Choice: its only candidate is true.
  assert.deepEqual(openWork(state), ["ConfirmDelivery"]);
  completes(program, state, userTask("ConfirmDelivery"));
});

test("XCA-ORDER-01: reversed flow declarations make the urgent billing complaint open Correct invoice", async () => {
  const program = await complaintHandling(xml => {
    const flows = ["Flow_Escalate", "Flow_Invoice", "Flow_Reship"].map(id =>
      new RegExp(`    <sequenceFlow id="${id}"[\\s\\S]*?</sequenceFlow>\n`, "u").exec(xml)![0]);
    const declared = flows.join("");
    assert.equal(xml.split(declared).length, 2);
    return xml.replace(declared, [...flows].reverse().join(""));
  });
  assert.deepEqual(openWork(classified(program, "billing", "urgent")), ["CorrectInvoice"]);
});
