/**
 * Hosting preflight of the mapped Call (the Call variable mapping specification's Temporal preflight): the retained loan
 * application is admitted for hosting, and the Start capacity journeys reserve a full `CVM-TASK-01` patch for each
 * called task under every name it may write, including the output source, as for any nested scope-data task.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { SemanticProfileId, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, StartProcessStimulus } from "@bpmn-lean/semantic-core";

import {
  StartCapacityEnvelopeResultKind,
  TemporalHostCapabilityResultKind,
  assessStartCapacityEnvelope,
  assessTemporalHostCapability,
  runStartCapacityJourney,
  startCapacityJourneys,
} from "../dist/index.js";

const directory = new URL("../../../../scenarios/call-variable-mapping/", import.meta.url);

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

const loanStart = (program: SemanticProcessProgram): StartProcessStimulus => ({
  kind: StimulusKind.StartProcess, commandId: "start-loan", processId: program.processId, instanceId: "Loan_1",
  initialVariables: [{ name: "amount", value: { kind: VariableValueKind.String, value: "25000" } },
    { name: "applicant", value: { kind: VariableValueKind.String, value: "Ada" } }],
});

test("the loan application is admitted for hosting", async () => {
  assert.deepEqual(assessTemporalHostCapability(await loanProgram()), { kind: TemporalHostCapabilityResultKind.Admitted });
});

test("the Start capacity journeys reserve called patches under every called name and fit the envelope", async () => {
  const program = await loanProgram();
  const journeys = startCapacityJourneys(loanStart(program), program);
  assert.ok(journeys !== null);
  const calledPatchNames = new Set(journeys.flatMap((journey: ReturnType<typeof runStartCapacityJourney>) =>
    journey.steps.flatMap(({ stimulus }) => stimulus.kind === StimulusKind.CompleteUserTaskInstance &&
      stimulus.taskId.processInstanceId !== "Loan_1" ? stimulus.submittedValues.map(({ name }) => name) : [])));
  assert.deepEqual([...calledPatchNames].sort(), ["amount", "customer", "verdict"]);
  const envelope = assessStartCapacityEnvelope(loanStart(program), program);
  assert.ok(envelope.kind === StartCapacityEnvelopeResultKind.WithinCapacity, JSON.stringify(envelope));
});
