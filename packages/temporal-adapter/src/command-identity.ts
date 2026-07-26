import { createHash } from "node:crypto";

import {
  StimulusKind,
  isWellFormedStimulus,
} from "@bpmn-lean/semantic-core";
import type {
  Stimulus,
} from "@bpmn-lean/semantic-core";

import { canonicalTypedTupleEncoding } from "./canonical-encoding.js";

export function canonicalStimulusEncoding(stimulus: unknown): string {
  if (!isWellFormedStimulus(stimulus)) {
    throw new TypeError(
      "Update identity requires one well-formed semantic stimulus",
    );
  }
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
      return canonicalTypedTupleEncoding([
        stimulus.kind,
        stimulus.commandId,
        stimulus.processId,
        stimulus.instanceId,
      ]);
    case StimulusKind.CompleteUserTaskInstance:
      return canonicalTypedTupleEncoding([
        stimulus.kind,
        stimulus.commandId,
        [
          stimulus.taskId.processInstanceId,
          stimulus.taskId.elementId,
          stimulus.taskId.activation,
        ],
      ]);
    case StimulusKind.FireTimer:
      return canonicalTypedTupleEncoding([
        stimulus.kind,
        stimulus.commandId,
        [
          stimulus.timerId.processInstanceId,
          stimulus.timerId.elementId,
          stimulus.timerId.activation,
        ],
        stimulus.logicalTimeMs,
      ]);
    default:
      return assertNever(stimulus);
  }
}

export function contentBoundUpdateId(stimulus: Stimulus): string {
  const digest = createHash("sha256")
    .update(canonicalStimulusEncoding(stimulus), "utf8")
    .digest("hex");
  return `bpmn-command-sha256:${digest}`;
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported semantic stimulus for Update identity: ${JSON.stringify(value)}`,
  );
}
