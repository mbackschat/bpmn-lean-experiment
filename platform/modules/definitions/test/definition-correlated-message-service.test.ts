import assert from "node:assert/strict";
import test from "node:test";

import {
  DefinitionCorrelatedMessageCapabilityStatus,
  DefinitionCorrelatedMessagePublicationStatus,
  DefinitionCorrelatedMessageResolutionKind as GatewayResolutionKind,
  DefinitionCorrelatedMessageSemanticOutcomeKind as GatewayOutcomeKind,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionCorrelatedMessageDescribeRequest,
  DefinitionCorrelatedMessageHost,
  DefinitionCorrelatedMessagePublishRequest,
} from "@bpmn-lean/platform-engine-gateway";
import {
  DefinitionCorrelatedMessageIntegrityError,
  DefinitionCorrelatedMessagePublishStatus,
  DefinitionCorrelatedMessageService,
} from "@bpmn-lean/platform-definitions";
import type {
  DefinitionCorrelatedMessagePublishCommand,
  DefinitionMetadata,
  DefinitionReference,
  DefinitionRepository,
  ExactArtifactStore,
} from "@bpmn-lean/platform-definitions";

const bytes = Uint8Array.of(60, 120, 62);
const definition = {
  processId: "CorrelatedSettlement",
  version: 2,
  source: {
    kind: "bpmnSource",
    id: "correlated-settlement.bpmn",
    sha256: "a".repeat(64),
    byteLength: bytes.byteLength,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "bpmn-2.0.2-bpmn-lean-message-key-correlation-v1",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const satisfies DefinitionMetadata;
const capability = {
  catchEventId: "Catch_Settlement",
  channel: {
    kind: "operationMessage",
    interfaceId: "SettlementInterface",
    interfaceOperationId: "receiveSettlement",
    messageId: "SettlementReceived",
  },
  correlationKeyId: "SettlementCorrelationKey",
} as const;
const reference = {
  processId: definition.processId,
  version: definition.version,
} as const satisfies DefinitionReference;
const command = {
  definition: reference,
  catchEventId: capability.catchEventId,
  commandId: "publish/invoice-42",
  payload: { kind: "string", value: "invoice-42" },
} as const satisfies DefinitionCorrelatedMessagePublishCommand;

test("discovers target-free capabilities from exact stored definition bytes", async () => {
  const fixture = createFixture();

  const result = await fixture.service.describe(reference);

  assert.deepEqual(result, {
    definition,
    messages: [capability],
  });
  assert.deepEqual(fixture.describes, [{
    bytes,
    definition: {
      processId: definition.processId,
      source: {
        id: definition.source.id,
        sha256: definition.source.sha256,
        byteLength: definition.source.byteLength,
      },
      semanticProfile: definition.semanticProfile,
    },
  }]);
  assert.equal("processInstanceId" in fixture.describes[0]!, false);
});

test("publishes one selected capability without constructing a Process target", async () => {
  const fixture = createFixture();

  const result = await fixture.service.publish(command);

  assert.deepEqual(result, {
    status: DefinitionCorrelatedMessagePublishStatus.Resolved,
    publication: {
      definition,
      correlatedMessage: capability,
      resolution: {
        kind: GatewayResolutionKind.Semantic,
        commandId: command.commandId,
        ingressOrdinal: 7,
        outcome: {
          kind: GatewayOutcomeKind.Committed,
          target: { processInstanceId: "semantic-instance-42" },
        },
      },
    },
  });
  assert.equal(fixture.describes.length, 1);
  assert.deepEqual(fixture.publishes, [{
    ...fixture.describes[0],
    catchEventId: capability.catchEventId,
    commandId: command.commandId,
    payload: command.payload,
  }]);
  assert.equal("processInstanceId" in fixture.publishes[0]!, false);
  assert.equal("correlationKey" in fixture.publishes[0]!, false);
});

test("keeps no-match and ambiguity as resolved semantic outcomes", async () => {
  for (const outcomeKind of [
    GatewayOutcomeKind.RejectedNoMatch,
    GatewayOutcomeKind.RejectedAmbiguous,
  ] as const) {
    const fixture = createFixture({
      publishResult: {
        status: DefinitionCorrelatedMessagePublicationStatus.Resolved,
        resolution: {
          kind: GatewayResolutionKind.Semantic,
          commandId: command.commandId,
          ingressOrdinal: 8,
          outcome: { kind: outcomeKind },
        },
      },
    });

    const result = await fixture.service.publish(command);

    assert.equal(result.status, DefinitionCorrelatedMessagePublishStatus.Resolved);
    if (result.status === DefinitionCorrelatedMessagePublishStatus.Resolved) {
      assert.deepEqual(result.publication.resolution, {
        kind: GatewayResolutionKind.Semantic,
        commandId: command.commandId,
        ingressOrdinal: 8,
        outcome: { kind: outcomeKind },
      });
    }
  }
});

test("returns public absence and conflict states without dispatching another target", async () => {
  const missingDefinition = createFixture({ storedDefinition: null });
  assert.deepEqual(await missingDefinition.service.publish(command), {
    status: DefinitionCorrelatedMessagePublishStatus.DefinitionNotFound,
  });
  assert.equal(missingDefinition.describes.length, 0);
  assert.equal(missingDefinition.publishes.length, 0);

  const missingCapability = createFixture({ describedMessages: [] });
  assert.deepEqual(await missingCapability.service.publish(command), {
    status: DefinitionCorrelatedMessagePublishStatus.CapabilityNotFound,
  });
  assert.equal(missingCapability.publishes.length, 0);

  const conflict = createFixture({
    publishResult: {
      status: DefinitionCorrelatedMessagePublicationStatus.IdentityConflict,
    },
  });
  assert.deepEqual(await conflict.service.publish(command), {
    status: DefinitionCorrelatedMessagePublishStatus.IdentityConflict,
  });
});

test("treats duplicate or disappearing capabilities as integrity failures", async () => {
  const duplicate = createFixture({ describedMessages: [capability, capability] });
  await assert.rejects(
    duplicate.service.publish(command),
    DefinitionCorrelatedMessageIntegrityError,
  );
  assert.equal(duplicate.publishes.length, 0);

  const disappeared = createFixture({
    publishResult: {
      status: DefinitionCorrelatedMessagePublicationStatus.CapabilityNotFound,
    },
  });
  await assert.rejects(
    disappeared.service.publish(command),
    DefinitionCorrelatedMessageIntegrityError,
  );
});

test("fails closed on repository, artifact, and engine reconstruction drift", async () => {
  const cases = [
    createFixture({ artifact: null }),
    createFixture({ artifact: Uint8Array.of(60, 62) }),
    createFixture({
      storedDefinition: { ...definition, processId: "WrongProcess" },
    }),
    createFixture({
      describeResult: {
        status: DefinitionCorrelatedMessageCapabilityStatus.IntegrityFailure,
        evidence: "private compiler evidence",
      },
    }),
    createFixture({
      publishResult: {
        status: DefinitionCorrelatedMessagePublicationStatus.IntegrityFailure,
        evidence: "private engine evidence",
      },
    }),
  ];

  for (const fixture of cases) {
    await assert.rejects(
      fixture.service.publish(command),
      DefinitionCorrelatedMessageIntegrityError,
    );
  }
});

type FixtureOptions = Readonly<{
  storedDefinition?: DefinitionMetadata | null;
  artifact?: Uint8Array | null;
  describedMessages?: readonly typeof capability[];
  describeResult?: Awaited<ReturnType<DefinitionCorrelatedMessageHost["describe"]>>;
  publishResult?: Awaited<ReturnType<DefinitionCorrelatedMessageHost["publish"]>>;
}>;

function createFixture(options: FixtureOptions = {}) {
  const describes: DefinitionCorrelatedMessageDescribeRequest[] = [];
  const publishes: DefinitionCorrelatedMessagePublishRequest[] = [];
  const repository = {
    allocateNext: async () => structuredClone(definition),
    listLatest: async () => [],
    listVersions: async () => [],
    get: async () => structuredClone(
      options.storedDefinition === undefined ? definition : options.storedDefinition,
    ),
  } satisfies DefinitionRepository;
  const artifacts = {
    put: async () => ({ inserted: true }) as const,
    get: async () => {
      const artifact = options.artifact === undefined ? bytes : options.artifact;
      return artifact === null ? null : Uint8Array.from(artifact);
    },
  } satisfies ExactArtifactStore;
  const host = {
    describe: async (request: DefinitionCorrelatedMessageDescribeRequest) => {
      describes.push(structuredClone(request));
      return structuredClone(options.describeResult ?? {
        status: DefinitionCorrelatedMessageCapabilityStatus.Available,
        messages: options.describedMessages ?? [capability],
      });
    },
    publish: async (request: DefinitionCorrelatedMessagePublishRequest) => {
      publishes.push(structuredClone(request));
      return structuredClone(options.publishResult ?? {
        status: DefinitionCorrelatedMessagePublicationStatus.Resolved,
        resolution: {
          kind: GatewayResolutionKind.Semantic,
          commandId: request.commandId,
          ingressOrdinal: 7,
          outcome: {
            kind: GatewayOutcomeKind.Committed,
            target: { processInstanceId: "semantic-instance-42" },
          },
        },
      });
    },
  } satisfies DefinitionCorrelatedMessageHost;
  return {
    service: new DefinitionCorrelatedMessageService({ repository, artifacts, host }),
    describes,
    publishes,
  };
}
