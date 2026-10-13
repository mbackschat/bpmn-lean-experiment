/**
 * Drives the portable-handoff example through the configured User Task driver without a Temporal connection.
 *
 * The oracle is the example's own interaction list: the nested order submitted at Start must be the first task's
 * published input, the revision submitted by Review must be Archive's published input, and the receipt must end as
 * the third Process value.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, ProcessStatus, ScenarioStepKind, SemanticProfileId, StimulusKind, advanceScenario, initialState,
  observeStableState,
} from "@bpmn-lean/semantic-core";
import type { Stimulus } from "@bpmn-lean/semantic-core";
import { HostInteractionResultKind, ProcessCommandResultKind, driveHostInteractions, projectUserTaskDetail } from "@bpmn-lean/temporal-testkit";

import { loadRunnableMvpConfig } from "../../runner/cli/runnable-mvp-config.ts";
import { createRunnableMvpStartStimulus } from "../../runner/cli/runnable-mvp-start.ts";

const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));

test("executes the nested order through both configured User Tasks and ends with all three Properties", async () => {
  const config = await loadRunnableMvpConfig(path.join(projectRoot, "examples/temporal-mvp/portable-business-values-handoff.json"));
  assert.equal(config.bpmn.semanticProfile, SemanticProfileId.PortableBusinessValuesHandoff);
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(config.bpmn.file), sourceId: config.bpmn.sourceId, expectedSha256: undefined, sourceOverlay: null,
    semanticProfile: config.bpmn.semanticProfile, limits: config.bpmn.limits,
  });
  assert.ok(compilation.status === BpmnCompilationStatus.Accepted);
  const program = compilation.semanticProcess;
  const [review, archive] = config.interactions.map((interaction) =>
    interaction.kind === "completeUserTaskInstance" ? interaction.submittedValues[0]?.value : undefined);
  assert.ok("initialVariables" in config.process);
  const received = config.process.initialVariables[0]?.value;
  assert.ok(review !== undefined && archive !== undefined && received !== undefined);

  let state = initialState;
  const readState = async () => {
    const observation = observeStableState(program, state);
    assert.ok(observation !== null);
    return observation;
  };
  const submit = async (stimulus: Stimulus) => {
    if (stimulus.kind === StimulusKind.CompleteUserTaskInstance) {
      const first = stimulus.taskId.elementId === "ReviewOrder";
      assert.deepEqual((await readState()).openUserTasks.map((task) => [task.id.elementId, task.inputs]),
        [[first ? "ReviewOrder" : "ArchiveOrder", [{ name: first ? "ReviewOrder_in" : "ArchiveOrder_in", value: first ? received : review }]]]);
    }
    const step = advanceScenario(program, state, stimulus);
    assert.ok(step.kind === ScenarioStepKind.Committed);
    state = step.state;
    return { kind: ProcessCommandResultKind.Semantic, commandId: stimulus.commandId, outcome: CommandOutcome.Committed } as const;
  };
  await submit(createRunnableMvpStartStimulus(config, program));
  const unexpected = async () => { throw new Error("Unexpected non-User Task interaction"); };
  const result = await driveHostInteractions(config.interactions, { readState,
    readUserTaskDetail: async (request) => projectUserTaskDetail(state, request), submitCompletion: submit,
    submitMessage: unexpected, publishCorrelated: unexpected, submitCancellation: unexpected }, async () => {});
  assert.deepEqual(result, { kind: HostInteractionResultKind.Driven, submitted: 2 });
  const final = await readState();
  assert.equal(final.status, ProcessStatus.Completed);
  assert.deepEqual(final.variables, [{ name: "archivedOrder", value: archive }, { name: "receivedOrder", value: received },
    { name: "reviewedOrder", value: review }]);
  assert.deepEqual(state.variables.activities, []);
});
