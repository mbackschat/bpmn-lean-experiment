/**
 * XND-HOST-01: a hosted Start whose command rolls back, because a Choice without a default matches no condition, is
 * rejected with `startRolledBack` before any Workflow exists, as CIB creates no instance (`ENGINE-02004`, calibrated by
 * the CIB probe). A Start whose condition holds is admitted and starts exactly one Workflow.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "../../../bpmn-source/dist/index.js";
import { SemanticProfileId, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { ProcessStartStimulus } from "@bpmn-lean/semantic-core";
import {
  BpmnProcessAdmissionFailureCode,
  BpmnProcessAdmissionResultKind,
  BpmnProcessStartResultKind,
  assessBpmnProcessAdmission,
  startBpmnProcess,
} from "@bpmn-lean/temporal-client";
import { enrollmentFixture } from "./worker-deployment-enrollment-fixture.ts";

const directory = new URL("../../../../scenarios/exclusive-choice-without-default/", import.meta.url);

async function expenseRouting() {
  const overlay = new Uint8Array(await readFile(new URL("expense-routing-overlay.json", directory)));
  const result = await compileBpmnToSemanticProcess({
    bytes: new Uint8Array(await readFile(new URL("expense-routing.bpmn", directory))), sourceId: "expense-routing",
    expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "expense-routing-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result.semanticProcess;
}

const submit = (category: string): ProcessStartStimulus => ({
  kind: StimulusKind.StartProcess, commandId: "start", processId: "Process_ExpenseRouting", instanceId: "Expense_1",
  initialVariables: [["category", category], ["claimant", "Ada"], ["payout", "bank"], ["priority", "normal"]]
    .map(([name, value]) => ({ name: name!, value: { kind: VariableValueKind.String, value: value! } })),
});

function fakeClient(calls: unknown[]): never {
  return {
    ...enrollmentFixture("process-task-queue"),
    start: async (workflowType: string, options: unknown) => {
      calls.push({ workflowType, options });
      return { firstExecutionRunId: "private-run-id", client: { fetchHistory: () => undefined },
        result: async () => undefined, describe: async () => undefined };
    },
  } as never;
}

test("XND-HOST-01: a Start matching no route is rejected as startRolledBack and creates no Workflow", async () => {
  const program = await expenseRouting();
  const admission = assessBpmnProcessAdmission(submit("catering"), program);
  assert.ok(admission.kind === BpmnProcessAdmissionResultKind.Rejected);
  assert.equal(admission.failure.code, BpmnProcessAdmissionFailureCode.StartRolledBack);
  const calls: unknown[] = [];
  const result = await startBpmnProcess(fakeClient(calls), submit("catering"), program, { taskQueue: "process-task-queue" });
  assert.equal(result.kind, BpmnProcessStartResultKind.Rejected);
  assert.deepEqual(calls, []);
});

test("XND-HOST-01: a Start whose route holds is admitted and starts one Workflow", async () => {
  const program = await expenseRouting();
  assert.equal(assessBpmnProcessAdmission(submit("travel"), program).kind, BpmnProcessAdmissionResultKind.Admitted);
  const calls: unknown[] = [];
  const result = await startBpmnProcess(fakeClient(calls), submit("travel"), program, { taskQueue: "process-task-queue" });
  assert.equal(result.kind, BpmnProcessStartResultKind.Started);
  assert.equal(calls.length, 1);
});
