/** Shared exact-source compiler and stimuli for Activity boundary Message host witnesses. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticProfileId,
  SemanticOperationKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  DeliverMessageStimulus,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

const fixtureUrl = new URL(
  "../../../../scenarios/activity-boundary-message/process.bpmn",
  import.meta.url,
);

type AwaitUserTaskOperation = Extract<
  SemanticProcessProgram["operations"][number],
  { kind: SemanticOperationKind.AwaitUserTask }
>;

export type ActivityBoundaryMessageFixture = Readonly<{
  start: StartProcessStimulus;
  completion: CompleteUserTaskInstanceStimulus;
  delivery: DeliverMessageStimulus;
  wrongDelivery: DeliverMessageStimulus;
  staleDelivery: DeliverMessageStimulus;
  normalFollowOn: CompleteUserTaskInstanceStimulus;
  boundaryFollowOn: CompleteUserTaskInstanceStimulus;
}>;

export async function compileActivityBoundaryMessageProgram(
  sourceId: string,
): Promise<SemanticProcessProgram> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(fixtureUrl),
    sourceId,
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: SemanticProfileId.ActivityBoundaryMessage,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("Activity boundary Message fixture was rejected");
  }
  return compilation.semanticProcess;
}

export function activityBoundaryMessageFixture(
  program: SemanticProcessProgram,
  suffix: string,
): ActivityBoundaryMessageFixture {
  const bounded = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitMessageBoundedUserTask,
  );
  assert.ok(
    bounded?.kind === SemanticOperationKind.AwaitMessageBoundedUserTask,
  );
  const normalFollowOn = requireFollowOn(
    program,
    bounded.task.output,
    "normal",
  );
  const boundaryFollowOn = requireFollowOn(
    program,
    bounded.boundaryMessage.output,
    "boundary",
  );
  const instanceId = `ActivityBoundaryMessage_${suffix}`;
  const start: StartProcessStimulus = {
    kind: StimulusKind.StartProcess,
    commandId: `start-${suffix}`,
    processId: program.processId,
    instanceId,
    initialVariables: [],
  };
  const completion: CompleteUserTaskInstanceStimulus = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-host-${suffix}`,
    taskId: {
      processInstanceId: instanceId,
      elementId: bounded.task.elementId,
      activation: 1,
    },
    submittedValues: [],
  };
  const delivery: DeliverMessageStimulus = {
    kind: StimulusKind.DeliverMessage,
    commandId: `deliver-boundary-${suffix}`,
    subscriptionId: {
      processInstanceId: instanceId,
      elementId: bounded.boundaryMessage.elementId,
      activation: 1,
    },
    channel: bounded.boundaryMessage.channel,
  };
  return {
    start,
    completion,
    delivery,
    wrongDelivery: {
      ...delivery,
      commandId: `reject-wrong-boundary-${suffix}`,
      channel: {
        ...delivery.channel,
        messageId: "Message_WrongActivityBoundary",
      },
    },
    staleDelivery: {
      ...delivery,
      commandId: `reject-stale-boundary-${suffix}`,
    },
    normalFollowOn: followOnCompletion(
      instanceId,
      normalFollowOn,
      suffix,
    ),
    boundaryFollowOn: followOnCompletion(
      instanceId,
      boundaryFollowOn,
      suffix,
    ),
  };
}

function requireFollowOn(
  program: SemanticProcessProgram,
  input: string,
  label: string,
): AwaitUserTaskOperation {
  const operation = program.operations.find(
    (candidate): candidate is AwaitUserTaskOperation =>
      candidate.kind === SemanticOperationKind.AwaitUserTask &&
      candidate.input === input,
  );
  if (operation === undefined) {
    throw new TypeError(
      `Activity boundary Message fixture has no ${label} follow-on task`,
    );
  }
  return operation;
}

function followOnCompletion(
  processInstanceId: string,
  operation: AwaitUserTaskOperation,
  suffix: string,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${operation.task.elementId}-${suffix}`,
    taskId: {
      processInstanceId,
      elementId: operation.task.elementId,
      activation: 1,
    },
    submittedValues: [],
  };
}
