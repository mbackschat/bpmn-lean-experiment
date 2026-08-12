import type {
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import type { DefinitionMetadata } from "./contracts.js";
import { toPublicDefinition } from "./definition-public-values.js";

/** Product-owned output port for one exact engine-confirmed Process instance. */
export interface StartedProcessInstancePublisher {
  recordProcessInstance(instance: PublicProcessInstanceIdentity): Promise<void>;
}

/** Publishes a fresh public snapshot and propagates every recorder failure. */
export async function recordStartedProcessInstance(
  publisher: StartedProcessInstancePublisher,
  processInstanceId: string,
  definition: DefinitionMetadata,
): Promise<PublicProcessInstanceIdentity> {
  const instance: PublicProcessInstanceIdentity = {
    processInstanceId,
    definition: toPublicDefinition(definition),
  };
  await publisher.recordProcessInstance(structuredClone(instance));
  return instance;
}
