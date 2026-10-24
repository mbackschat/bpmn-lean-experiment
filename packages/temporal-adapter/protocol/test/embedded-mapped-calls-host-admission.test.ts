/**
 * Hosting preflight of Stage B of the repeated, nested and concurrent Calls specification: the retained guarantor loan is
 * admitted for hosting, and the Start capacity journeys walk both mapped Calls of one definition, reserving each called
 * task's patch under the names of the Call that created its instance, as the live record selects them.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  SemanticProfileId, StimulusKind, VariableValueKind, deriveCalledProcessInstanceId,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, StartProcessStimulus } from "@bpmn-lean/semantic-core";

import {
  StartCapacityEnvelopeResultKind,
  TemporalHostCapabilityResultKind,
  assessStartCapacityEnvelope,
  assessTemporalHostCapability,
  runStartCapacityJourney,
  startCapacityJourneys,
} from "../dist/index.js";

const directory = new URL("../../../../scenarios/repeated-nested-concurrent-calls/", import.meta.url);
const instanceId = "Loan_1";

async function guarantorProgram(): Promise<SemanticProcessProgram> {
  const overlay = await readFile(new URL("guarantor-loan-overlay.json", directory));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("guarantor-loan.bpmn", directory)), sourceId: "guarantor-loan-capacity",
    expectedSha256: undefined,
    sourceOverlay: { id: "guarantor-loan-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled));
  return compiled.semanticProcess;
}

const guarantorStart = (program: SemanticProcessProgram): StartProcessStimulus => ({
  kind: StimulusKind.StartProcess, commandId: "start-guarantor-loan", processId: program.processId, instanceId,
  initialVariables: [{ name: "amount", value: { kind: VariableValueKind.String, value: "25000" } },
    { name: "applicant", value: { kind: VariableValueKind.String, value: "Ada" } },
    { name: "guarantor", value: { kind: VariableValueKind.String, value: "Bob" } }],
});

test("the guarantor loan is admitted for hosting", async () => {
  assert.deepEqual(assessTemporalHostCapability(await guarantorProgram()),
    { kind: TemporalHostCapabilityResultKind.Admitted });
});

test("the Start capacity journeys reserve each called patch under its own Call's names and fit the envelope", async () => {
  const program = await guarantorProgram();
  const journeys = startCapacityJourneys(guarantorStart(program), program);
  assert.ok(journeys !== null);
  const namesOf = (calledInstanceId: string) => new Set(journeys.flatMap(
    (journey: ReturnType<typeof runStartCapacityJourney>) => journey.steps.flatMap(({ stimulus }) =>
      stimulus.kind === StimulusKind.CompleteUserTaskInstance && stimulus.taskId.processInstanceId === calledInstanceId
        ? stimulus.submittedValues.map(({ name }) => name) : [])));
  assert.deepEqual([...namesOf(deriveCalledProcessInstanceId(instanceId, "VerifyApplicant", 1))].sort(),
    ["amount", "customer", "verdict"]);
  assert.deepEqual([...namesOf(deriveCalledProcessInstanceId(instanceId, "VerifyGuarantor", 1))].sort(),
    ["customer", "verdict"]);
  const envelope = assessStartCapacityEnvelope(guarantorStart(program), program);
  assert.ok(envelope.kind === StartCapacityEnvelopeResultKind.WithinCapacity, JSON.stringify(envelope));
});
