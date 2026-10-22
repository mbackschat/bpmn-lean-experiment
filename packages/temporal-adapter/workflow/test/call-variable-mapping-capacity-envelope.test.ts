/**
 * Settles the mapped Call's capacity reservation against the real Workflow encoders, as the nested scope-data test
 * does for embedded frames. The loan application's three completions each fill the whole patch allowance under a
 * name that is copied onward, so the called frame, the returned outputs and the review frame hold patch-sized copies
 * at once; every measured budget must stay within the envelope's estimate and the production limit. The stimuli are
 * built here from the model's element IDs, not taken from the envelope's journeys.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  EffectExecutionResultKind, SemanticProfileId, StimulusKind, VariableValueKind, deriveCalledProcessInstanceId,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, StartProcessStimulus, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import {
  StartCapacityEnvelopeResultKind,
  assessStartCapacityEnvelope,
  completeEffectStimulus,
  productionStartCapacityEnvelopeLimits,
  reservedFutureCommandIdBytes,
  startCapacityEnvelopeBudgets,
} from "@bpmn-lean/temporal-protocol";

import { fillingPatch, measureWithWorkflowEncoders } from "./start-capacity-encoder-measurement.ts";

const directory = new URL("../../../../scenarios/call-variable-mapping/", import.meta.url);
const production = productionStartCapacityEnvelopeLimits();
const reserved = (ordinal: number) => `${"c".repeat(reservedFutureCommandIdBytes - 1)}${ordinal}`;

async function loanProgram(): Promise<SemanticProcessProgram> {
  const overlay = await readFile(new URL("loan-application-overlay.json", directory));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("loan-application.bpmn", directory)), sourceId: "loan-application-capacity",
    expectedSha256: undefined,
    sourceOverlay: { id: "loan-application-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled));
  return compiled.semanticProcess;
}

const loanStart = (instanceId: string, commandId: string): StartProcessStimulus => ({
  kind: StimulusKind.StartProcess, commandId, processId: "Process_LoanApplication", instanceId,
  initialVariables: [{ name: "amount", value: { kind: VariableValueKind.String, value: "25000" } },
    { name: "applicant", value: { kind: VariableValueKind.String, value: "Ada" } }],
});

function loanCompletions(start: StartProcessStimulus, collect: VariableBinding[], verdict: VariableBinding[],
  confirm: VariableBinding[]): Stimulus[] {
  const called = deriveCalledProcessInstanceId(start.instanceId, "VerifyIdentity", 1);
  const occurrence = (processInstanceId: string, elementId: string) => ({ processInstanceId, elementId, activation: 1 });
  return [
    completeEffectStimulus(occurrence(start.instanceId, "AcknowledgeApplication"),
      { kind: EffectExecutionResultKind.Success, localPatch: [] }),
    { kind: StimulusKind.CompleteUserTaskInstance, commandId: reserved(1), taskId: occurrence(called, "CollectDocument"),
      submittedValues: collect },
    { kind: StimulusKind.CompleteUserTaskInstance, commandId: reserved(2), taskId: occurrence(called, "RecordVerdict"),
      submittedValues: verdict },
    { kind: StimulusKind.CompleteUserTaskInstance, commandId: reserved(3),
      taskId: occurrence(start.instanceId, "ConfirmDecision"), submittedValues: confirm },
  ];
}

for (const [label, instanceId, startCommandId] of [
  ["short identifiers", "Loan_1", "start-loan"],
  ["long instance ID", "L".repeat(512), "start-loan"],
  ["long Start command ID", "Loan_1", "S".repeat(2_048)],
] as const) {
  test(`the envelope bounds every Workflow encoder for the mapped Call's copied patches, ${label}`, async (context) => {
    const program = await loanProgram();
    const start = loanStart(instanceId, startCommandId);
    const envelope = assessStartCapacityEnvelope(start, program);
    assert.ok(envelope.kind === StartCapacityEnvelopeResultKind.WithinCapacity, JSON.stringify(envelope));
    for (const [target, completions] of [
      ["customer, verdict, decision", loanCompletions(start, fillingPatch("customer"), fillingPatch("verdict"), fillingPatch("decision"))],
      ["amount, customer, empty", loanCompletions(start, fillingPatch("amount"), fillingPatch("customer"), [])],
      ["empty", loanCompletions(start, [], [], [])],
    ] as const) {
      const actual = measureWithWorkflowEncoders(program, start, completions);
      for (const budget of startCapacityEnvelopeBudgets) {
        context.diagnostic(`${target} ${budget}: actual ${actual[budget]}, estimate ${envelope.estimates[budget]}`);
        assert.ok(actual[budget] <= envelope.estimates[budget], `${label}, ${target}, ${budget} exceeds its estimate`);
        assert.ok(actual[budget] <= production[budget], `${label}, ${target}, ${budget} exceeds production`);
      }
    }
  });
}
