import type {
  DeployedDefinitionVersion,
  PublicMessageStartCapability,
} from "@bpmn-lean/platform-contracts";

/** Owns an exact deployed-definition snapshot across asynchronous browser calls. */
export function snapshotExactDefinition(
  definition: DeployedDefinitionVersion,
): DeployedDefinitionVersion {
  return {
    processId: definition.processId,
    version: definition.version,
    source: { ...definition.source },
    semanticProfile: definition.semanticProfile,
    startCapabilities: {
      messageStarts: definition.startCapabilities.messageStarts.map(
        snapshotMessageStart,
      ),
      timerStarts: definition.startCapabilities.timerStarts.map(
        ({ startEventId, durationMs }) => ({ startEventId, durationMs }),
      ),
    },
  };
}

/** Compares every public fact that identifies one exact deployed definition. */
export function sameExactDefinition(
  actual: DeployedDefinitionVersion,
  expected: DeployedDefinitionVersion,
): boolean {
  return actual.processId === expected.processId &&
    actual.version === expected.version &&
    actual.semanticProfile === expected.semanticProfile &&
    actual.source.kind === expected.source.kind &&
    actual.source.id === expected.source.id &&
    actual.source.sha256 === expected.source.sha256 &&
    actual.source.byteLength === expected.source.byteLength &&
    actual.source.declaredEncoding === expected.source.declaredEncoding &&
    actual.source.decodedAs === expected.source.decodedAs &&
    sameMessageStarts(
      actual.startCapabilities.messageStarts,
      expected.startCapabilities.messageStarts,
    ) &&
    sameTimerStarts(
      actual.startCapabilities.timerStarts,
      expected.startCapabilities.timerStarts,
    );
}

function snapshotMessageStart(
  capability: PublicMessageStartCapability,
): PublicMessageStartCapability {
  return {
    startEventId: capability.startEventId,
    channel: { ...capability.channel },
  };
}

function sameMessageStarts(
  actual: DeployedDefinitionVersion["startCapabilities"]["messageStarts"],
  expected: DeployedDefinitionVersion["startCapabilities"]["messageStarts"],
): boolean {
  return actual.length === expected.length && actual.every((capability, index) => {
    const expectedCapability = expected[index];
    return expectedCapability !== undefined &&
      capability.startEventId === expectedCapability.startEventId &&
      capability.channel.kind === expectedCapability.channel.kind &&
      capability.channel.interfaceId === expectedCapability.channel.interfaceId &&
      capability.channel.interfaceOperationId ===
        expectedCapability.channel.interfaceOperationId &&
      capability.channel.messageId === expectedCapability.channel.messageId;
  });
}

function sameTimerStarts(
  actual: DeployedDefinitionVersion["startCapabilities"]["timerStarts"],
  expected: DeployedDefinitionVersion["startCapabilities"]["timerStarts"],
): boolean {
  return actual.length === expected.length && actual.every((capability, index) => {
    const expectedCapability = expected[index];
    return expectedCapability !== undefined &&
      capability.startEventId === expectedCapability.startEventId &&
      capability.durationMs === expectedCapability.durationMs;
  });
}
