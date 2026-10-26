/**
 * The ordinary-effect frontier hosts the concurrent scope Service Task profile beside the sequential Multi-Instance
 * profile, and refuses a frontier beyond the Program's pending-Activity limit before starting any Activity. Admission
 * makes that refusal unreachable, so its witness lowers the limit by dropping one effect operation from an admitted
 * Program: transport material is projected from the committed open effect alone, so only the limit changes.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID, SemanticOperationKind, SemanticProfileId, StimulusKind, applyStimulus,
  initialState, projectOpenEffects,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { EffectRequest } from "@bpmn-lean/temporal-protocol";
import { createOrdinaryEffectFrontierScheduler } from "../dist/ordinary-effect-frontier-scheduler.js";

const directory = new URL("../../../../scenarios/concurrent-scope-service-tasks/", import.meta.url);

async function supplier(): Promise<Readonly<{ program: SemanticProcessProgram; state: RuntimeState }>> {
  const overlay = await readFile(new URL("supplier-screening-handlers.json", directory));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("supplier-screening.bpmn", directory)), sourceId: "supplier-screening",
    expectedSha256: undefined, semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion,
    sourceOverlay: { id: "supplier-screening-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 },
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
  const program = compiled.semanticProcess;
  const start = applyStimulus(program, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: program.processId, instanceId: "supplier", initialVariables: [] });
  assert.equal(start.outcome, CommandOutcome.Committed);
  return { program, state: start.state };
}

function scheduler(program: SemanticProcessProgram, requests: EffectRequest[]) {
  return createOrdinaryEffectFrontierScheduler(program, {
    executeEffect: async request => {
      requests.push(request);
      return { kind: EffectExecutionResultKind.Success, localPatch: [] };
    },
    newActivitiesFenced: () => false, reserveHistory: () => true,
    failCapacity: failure => { throw new Error(`capacity: ${failure.budget}`); },
    enqueueCompletion: () => undefined, waitUntil: async () => undefined,
  });
}

test("hosts the concurrent scope Service Task profile and starts the whole committed frontier", async () => {
  const { program, state } = await supplier();
  assert.deepEqual(projectOpenEffects(state).map(effect => effect.id.elementId).sort(),
    ["ServiceTask_ScreenSanctions", "ServiceTask_VerifyBankAccount"]);
  const requests: EffectRequest[] = [];
  await scheduler(program, requests).waitForReadiness(state, () => true);
  assert.equal(new Set(requests.map(request => request.idempotencyKey)).size, 2);
});

test("refuses a frontier beyond the Program's pending-Activity limit before starting any Activity", async () => {
  const { program, state } = await supplier();
  // The sequential Multi-Instance limit is the Program's effect count: keeping one effect operation makes it 1.
  const lastEffect = program.operations.findLastIndex(operation => operation.kind === SemanticOperationKind.AwaitEffect);
  const narrowed = { ...program,
    identity: { ...program.identity, semanticProfile: SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID },
    operations: program.operations.filter((operation, index) =>
      operation.kind !== SemanticOperationKind.AwaitEffect || index === lastEffect) } as SemanticProcessProgram;
  const requests: EffectRequest[] = [];
  await assert.rejects(scheduler(narrowed, requests).waitForReadiness(state, () => true),
    /exceeds the Program's pending-Activity limit/u);
  assert.deepEqual(requests, []);
});
