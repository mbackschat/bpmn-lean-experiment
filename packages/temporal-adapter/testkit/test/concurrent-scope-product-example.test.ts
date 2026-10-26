/**
 * Drives the concurrent scope Service Task product example through the configured interaction driver on the core,
 * without Temporal: its fixed-result handlers answer every open effect, so Approve supplier appears only after both
 * screening effects and the review, and Activate supplier runs only after Onboard completes.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, ProcessStatus, ScenarioStepKind, SemanticProfileId, advanceScenario,
  initialState, observeStableState, projectEffectTransportMaterial,
} from "@bpmn-lean/semantic-core";
import type { Stimulus } from "@bpmn-lean/semantic-core";
import {
  HostInteractionResultKind, ProcessCommandResultKind, completeEffectStimulus, createHostEffectActivities,
  driveHostInteractions, effectTransportKey, projectUserTaskDetail,
} from "@bpmn-lean/temporal-testkit";
import { loadRunnableMvpConfig } from "../../runner/cli/runnable-mvp-config.ts";
import { createRunnableMvpStartStimulus } from "../../runner/cli/runnable-mvp-start.ts";

const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));

test("terminates the concurrent scope Service Task example with its configured handlers", async () => {
  const config = await loadRunnableMvpConfig(path.join(projectRoot, "examples/temporal-mvp/concurrent-scope-service-tasks.json"));
  assert.equal(config.bpmn.semanticProfile, SemanticProfileId.EmbeddedSubProcessCompletion);
  const overlay = config.bpmn.sourceOverlay;
  assert.ok(overlay !== undefined && overlay !== null);
  const compilation = await compileBpmnToSemanticProcess({ bytes: await readFile(config.bpmn.file),
    sourceId: config.bpmn.sourceId, expectedSha256: undefined, semanticProfile: config.bpmn.semanticProfile,
    sourceOverlay: { id: overlay.id, sha256: overlay.sha256, bytes: await readFile(overlay.file) }, limits: config.bpmn.limits });
  assert.ok(compilation.status === BpmnCompilationStatus.Accepted, JSON.stringify(compilation.diagnostics));
  const program = compilation.semanticProcess;
  const activities = createHostEffectActivities(config.effectHandlers);
  const operations: string[] = [];
  let state = initialState;
  const submit = async (stimulus: Stimulus) => {
    const step = advanceScenario(program, state, stimulus);
    assert.ok(step.kind === ScenarioStepKind.Committed, stimulus.commandId);
    state = step.state;
    return { kind: ProcessCommandResultKind.Semantic, commandId: stimulus.commandId, outcome: CommandOutcome.Committed } as const;
  };
  const readState = async () => {
    const observation = observeStableState(program, state);
    assert.ok(observation !== null);
    return observation;
  };
  await submit(createRunnableMvpStartStimulus(config, program));
  const driven = await driveHostInteractions(config.interactions, {
    readState,
    readUserTaskDetail: async (request) => projectUserTaskDetail(state, request),
    submitCompletion: submit,
    submitMessage: async () => { throw new Error("Unexpected Message interaction"); },
    publishCorrelated: async () => { throw new Error("Unexpected correlated publication"); },
    submitCancellation: async () => { throw new Error("Unexpected cancellation"); },
  }, async () => {
    // A host wait completes the open effect with the smallest operation name, so the order is deterministic.
    const [effect] = (await readState()).openEffects.toSorted(({ descriptor: left }, { descriptor: right }) =>
      left.operation < right.operation ? -1 : left.operation > right.operation ? 1 : 0);
    if (effect === undefined) return;
    operations.push(effect.descriptor.operation);
    const result = await activities.executeBpmnEffect({ ...effect.descriptor, arguments: effect.arguments,
      idempotencyKey: effectTransportKey(projectEffectTransportMaterial(program, effect)) });
    assert.ok(result.kind === EffectExecutionResultKind.Success);
    await submit(completeEffectStimulus(effect.id, result));
  });
  assert.deepEqual(driven, { kind: HostInteractionResultKind.Driven, submitted: 2 });
  assert.deepEqual(operations, ["bankAccountVerification", "sanctionsScreening", "supplierActivation"]);
  assert.equal((await readState()).status, ProcessStatus.Completed);
});
