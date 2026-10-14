/**
 * Drives the effect-data credit example through its configured fixed-result handlers without a Temporal connection.
 *
 * The oracle is the example's own handler list: the structured assessment Assess returns must be Notify's published
 * argument snapshot and the committed Property, and the effect idempotency key and completion command identity must
 * encode it through the shared transport encoder rather than refuse it.
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

test("carries the structured assessment from Assess to Notify and into Process data", async () => {
  const config = await loadRunnableMvpConfig(path.join(projectRoot, "examples/temporal-mvp/portable-business-effect-data.json"));
  assert.equal(config.bpmn.semanticProfile, SemanticProfileId.PortableBusinessEffectData);
  const overlay = config.bpmn.sourceOverlay;
  assert.ok(overlay !== undefined && overlay !== null);
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(config.bpmn.file), sourceId: config.bpmn.sourceId, expectedSha256: undefined,
    sourceOverlay: { id: overlay.id, sha256: overlay.sha256, bytes: await readFile(overlay.file) },
    semanticProfile: config.bpmn.semanticProfile, limits: config.bpmn.limits,
  });
  assert.ok(compilation.status === BpmnCompilationStatus.Accepted);
  const program = compilation.semanticProcess;
  const [assess, notify] = config.effectHandlers.map(({ result }) =>
    result.kind === EffectExecutionResultKind.Success ? result.localPatch[0]?.value : undefined);
  assert.ok(assess !== undefined && notify !== undefined && "initialVariables" in config.process);
  const applicant = config.process.initialVariables[0]!;

  let state = initialState;
  const readState = async () => {
    const observation = observeStableState(program, state);
    assert.ok(observation !== null);
    return observation;
  };
  const submit = async (stimulus: Stimulus) => {
    const step = advanceScenario(program, state, stimulus);
    assert.ok(step.kind === ScenarioStepKind.Committed);
    state = step.state;
    return { kind: ProcessCommandResultKind.Semantic, commandId: stimulus.commandId, outcome: CommandOutcome.Committed } as const;
  };
  const unexpected = async () => { throw new Error("Unexpected non-effect interaction"); };
  const activities = createHostEffectActivities(config.effectHandlers);
  const snapshots: unknown[] = [];
  await submit(createRunnableMvpStartStimulus(config, program));
  const driven = await driveHostInteractions(config.interactions, { readState,
    readUserTaskDetail: async (request) => projectUserTaskDetail(state, request), submitCompletion: submit,
    submitMessage: unexpected, publishCorrelated: unexpected, submitCancellation: unexpected }, async () => {
    for (let effect = (await readState()).openEffects[0]; effect !== undefined; effect = (await readState()).openEffects[0]) {
      snapshots.push(effect.arguments);
      const result = await activities.executeBpmnEffect({ ...effect.descriptor, arguments: effect.arguments,
        idempotencyKey: effectTransportKey(projectEffectTransportMaterial(program, effect)) });
      assert.ok(result.kind === EffectExecutionResultKind.Success);
      await submit(completeEffectStimulus(effect.id, result));
    }
  });
  assert.deepEqual(driven, { kind: HostInteractionResultKind.Driven, submitted: 0 });
  assert.deepEqual(snapshots, [[{ name: "applicant", value: applicant.value }], [{ name: "assessment", value: assess }]]);
  const final = await readState();
  assert.equal(final.status, ProcessStatus.Completed);
  assert.deepEqual(final.variables, [applicant, { name: "assessment", value: assess }, { name: "receipt", value: notify }]);
  assert.deepEqual(state.variables.activities, []);
});
