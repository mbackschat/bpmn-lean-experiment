/** Maps one validated runnable configuration to its exact semantic start stimulus. */
import { StimulusKind } from "@bpmn-lean/semantic-core";
import type {
  ProcessStartStimulus,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import type { RunnableMvpConfig } from "./runnable-mvp-config.ts";

export function createRunnableMvpStartStimulus(
  config: RunnableMvpConfig,
  program: Pick<SemanticProcessProgram, "processId">,
): ProcessStartStimulus {
  if ("initialVariables" in config.process) {
    return {
      kind: StimulusKind.StartProcess,
      commandId: `mvp-start:${config.process.instanceId}`,
      processId: program.processId,
      instanceId: config.process.instanceId,
      initialVariables: config.process.initialVariables,
    };
  }
  return {
    kind: StimulusKind.TriggerMessageStart,
    commandId: `mvp-start:${config.process.instanceId}`,
    processId: program.processId,
    instanceId: config.process.instanceId,
    startEventId: config.process.startEventId,
    channel: config.process.channel,
  };
}
