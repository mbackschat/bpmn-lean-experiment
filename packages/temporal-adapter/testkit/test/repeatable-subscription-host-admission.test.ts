import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID, SemanticOperationKind } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import {
  assessTemporalHostCapability, TemporalHostCapabilityResultKind, TemporalHostAdmissionFailureCode,
} from "@bpmn-lean/temporal-protocol";

test("subscription host admission requires the complete selected Program and preserves legacy split refusal", async () => {
  for (const name of ["boundary-message", "boundary-timer", "subprocess-boundary-timer", "catch-message",
    "catch-timer", "receive-task", "message-host-with-child-entry", "burst-8"]) {
    const compiled = await compileBpmnToSemanticProcess({
      bytes: await readFile(new URL(`../../../bpmn-source/test/fixtures/repeatable-event-subscriptions/${name}.bpmn`, import.meta.url)),
      sourceId: `${name}-host-admission`, expectedSha256: undefined, sourceOverlay: null,
      semanticProfile: REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
      limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
    });
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Host admission fixture refused");
    const program = compiled.semanticProcess;
    assert.deepEqual(assessTemporalHostCapability(program), { kind: TemporalHostCapabilityResultKind.Admitted }, name);
    for (const malformed of [
      { ...program, operationScopes: program.operationScopes.slice(1) },
      { ...program, operations: [...program.operations, program.operations[0]!] },
      { ...program, operations: program.operations.map((operation) => "boundaryTimer" in operation
        ? { ...operation, boundaryTimer: { ...operation.boundaryTimer, durationMs: 999 } }
        : operation.kind === SemanticOperationKind.AwaitTimer ? { ...operation, durationMs: 999 } : operation) },
    ]) {
      if (JSON.stringify(malformed) === JSON.stringify(program)) continue;
      const result = assessTemporalHostCapability(malformed as unknown as SemanticProcessProgram);
      assert.equal(result.kind, TemporalHostCapabilityResultKind.Rejected, name);
      if (result.kind !== TemporalHostCapabilityResultKind.Rejected) throw new Error("Malformed subscription host admitted");
      assert.equal(result.failure.code, TemporalHostAdmissionFailureCode.SubscriptionSchedulerUnavailable);
    }
    if (name === "catch-timer") {
      const result = assessTemporalHostCapability({
        ...program, identity: { ...program.identity, semanticProfile: "bpmn-2.0.2-intermediate-catch-timer-draft" },
      });
      assert.equal(result.kind, TemporalHostCapabilityResultKind.Rejected);
      if (result.kind !== TemporalHostCapabilityResultKind.Rejected) throw new Error("Legacy split admitted");
      assert.equal(result.failure.code, TemporalHostAdmissionFailureCode.ConcurrentHostDrivenWaits);
    }
  }
});
