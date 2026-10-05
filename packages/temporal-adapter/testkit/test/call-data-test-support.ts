import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { StartProcessStimulus, VariableBinding } from "@bpmn-lean/semantic-core";

const compiled = await compileBpmnToSemanticProcess({
  bytes: new Uint8Array(await readFile(new URL("../../../bpmn-source/test/fixtures/call-activity-data-boundaries.bpmn", import.meta.url))),
  sourceId: "supplier-call-recovery", expectedSha256: undefined,
  semanticProfile: CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID, sourceOverlay: null,
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5_000 },
});
assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
if (compiled.status !== BpmnCompilationStatus.Accepted) assert.fail("Supplier Call data source must be admitted");
export const supplierProgram = compiled.semanticProcess;

export const scalar = (name: string, value: string | null): VariableBinding => ({ name,
  value: value === null ? { kind: VariableValueKind.Null } : { kind: VariableValueKind.String, value } });

export function supplierStart(instanceId: string, request: string | null): StartProcessStimulus {
  return { kind: StimulusKind.StartProcess, commandId: "start", processId: supplierProgram.processId, instanceId,
    initialVariables: [scalar("Property_DueDiligenceDecision", "prior-decision"),
      scalar("Property_InternalNote", "caller-only"), scalar("Property_SupplierSummary", request)] };
}
