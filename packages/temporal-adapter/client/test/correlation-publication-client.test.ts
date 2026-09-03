import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
  WorkflowUpdateFailedError,
} from "@temporalio/client";
import {
  CorrelationPublicationLedgerPhase,
  CorrelationPublicationSemanticOutcomeKind,
  CorrelationPublicationStatusKind,
  CorrelationPublicationStoredResolutionKind,
  bpmnAdmitCorrelationPublicationUpdateName,
  bpmnCorrelationIngressConfigurationQueryName,
  bpmnCorrelationIngressProtocolVersion,
  bpmnCorrelationPublicationCapacityFailureType,
  bpmnCorrelationPublicationIdentityConflictFailureType,
  bpmnCorrelationPublicationStatusQueryName,
  correlationIngressWorkflowId,
  correlationPublicationContentSha256,
  correlationPublicationUpdateId,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";

import {
  BpmnCorrelatedMessageIdentityConflict,
  BpmnCorrelatedMessageIngressInvalid,
  TemporalCorrelatedMessagePublishResolutionKind,
  publishTemporalCorrelatedMessage,
} from "../dist/correlation-publication-client.js";

const address = {
  definition: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "message-key-correlation-checkpoint",
    sourceId: "settlement-confirmation",
    sourceSha256: "a".repeat(64),
    sourceOverlay: null,
  },
  processId: "Process_SettlementConfirmation",
  channel: {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: "Interface_Settlement",
    interfaceOperationId: "Operation_ConfirmSettlement",
    messageId: "Message_SettlementConfirmed",
  },
  correlationKeyId: "CorrelationKey_Settlement",
} as const;
const command = {
  commandId: "Publication_1",
  address,
  payload: { kind: VariableValueKind.String, value: "settlement-42" },
} as const;
const target = {
  processInstanceId: "Instance_42",
  subscriptionId: {
    processInstanceId: "Instance_42",
    elementId: "Catch_SettlementConfirmation",
    activation: 1,
  },
} as const;

test("publishes through the definition ingress and exposes a target only in the settled semantic result", async () => {
  const calls: unknown[] = [];
  const client = fakeClient(calls, {
    statuses: [absentStatus(), settledStatus({
      kind: CorrelationPublicationStoredResolutionKind.Semantic,
      outcome: {
        kind: CorrelationPublicationSemanticOutcomeKind.Committed,
        target,
      },
    })],
  });

  const result = await publishTemporalCorrelatedMessage(client, {
    command,
    taskQueue: "correlation-ingress",
  });

  assert.deepEqual(result, {
    kind: TemporalCorrelatedMessagePublishResolutionKind.Semantic,
    commandId: command.commandId,
    address,
    ingressOrdinal: 1,
    outcome: {
      kind: CorrelationPublicationSemanticOutcomeKind.Committed,
      target,
    },
  });
  assert.equal(JSON.stringify(calls.slice(0, -1)).includes(target.processInstanceId), false);
  assert.deepEqual(calls.filter(isUpdateCall), [{
    operation: "update",
    workflowId: correlationIngressWorkflowId(address),
    name: bpmnAdmitCorrelationPublicationUpdateName,
    options: {
      args: [command],
      updateId: correlationPublicationUpdateId(command),
    },
  }]);
});

test("resolves an already accepted command without allocating or rematching", async () => {
  const calls: unknown[] = [];
  const client = fakeClient(calls, {
    statuses: [inFlightStatus(target), settledStatus({
      kind: CorrelationPublicationStoredResolutionKind.Semantic,
      outcome: {
        kind: CorrelationPublicationSemanticOutcomeKind.Committed,
        target,
      },
    })],
  });

  assert.equal(
    (await publishTemporalCorrelatedMessage(client, {
      command,
      taskQueue: "correlation-ingress",
    })).kind,
    TemporalCorrelatedMessagePublishResolutionKind.Semantic,
  );
  assert.equal(calls.some(isUpdateCall), false);
});

test("keeps an unsettled retained target private when later status is unavailable", async () => {
  for (const unavailable of [absentStatus(), { kind: "malformed" }]) {
    const calls: unknown[] = [];
    const result = await publishTemporalCorrelatedMessage(fakeClient(calls, {
      statuses: [inFlightStatus(target), unavailable],
    }), { command, taskQueue: "correlation-ingress" });

    assert.deepEqual(result, {
      kind: TemporalCorrelatedMessagePublishResolutionKind.InfrastructureIndeterminate,
      commandId: command.commandId,
      address,
      ingressOrdinal: 1,
      phase: "resultRecovery",
      target: null,
      failure: { kind: "unconfirmed" },
    });
    assert.equal(calls.some(isUpdateCall), false);
  }
});

test("keeps an unsettled retained target private when polling reaches its deadline", async () => {
  const calls: unknown[] = [];
  const actualDateNow = Date.now;
  let currentTime = 0;
  Date.now = () => currentTime;
  let result: Awaited<ReturnType<typeof publishTemporalCorrelatedMessage>>;
  try {
    result = await publishTemporalCorrelatedMessage(fakeClient(calls, {
      statuses: [inFlightStatus(target)],
      afterStatusQuery: () => {
        currentTime = 5_000;
      },
    }), {
      command,
      taskQueue: "correlation-ingress",
      deadlineMs: 5_000,
    });
  } finally {
    Date.now = actualDateNow;
  }

  assert.deepEqual(result, {
    kind: TemporalCorrelatedMessagePublishResolutionKind.InfrastructureIndeterminate,
    commandId: command.commandId,
    address,
    ingressOrdinal: 1,
    phase: "targetDelivery",
    target: null,
    failure: { kind: "unconfirmed" },
  });
  assert.equal(calls.some(isUpdateCall), false);
});

test("reserves a public infrastructure target for target inconsistency", async () => {
  const declaration = await readFile(
    new URL("../dist/correlation-publication-client.d.ts", import.meta.url),
    "utf8",
  );

  assert.match(declaration, /target: null;/u);
  assert.doesNotMatch(
    declaration,
    /target: CorrelationPublicationTarget \| null;/u,
  );
});

test("keeps semantic rejection distinct from admission capacity", async () => {
  for (const outcome of [
    CorrelationPublicationSemanticOutcomeKind.RejectedNoMatch,
    CorrelationPublicationSemanticOutcomeKind.RejectedAmbiguous,
  ] as const) {
    const semantic = await publishTemporalCorrelatedMessage(fakeClient([], {
      statuses: [settledStatus({
        kind: CorrelationPublicationStoredResolutionKind.Semantic,
        outcome: { kind: outcome },
      })],
    }), { command, taskQueue: "correlation-ingress" });
    assert.deepEqual(semantic, {
      kind: TemporalCorrelatedMessagePublishResolutionKind.Semantic,
      commandId: command.commandId,
      address,
      ingressOrdinal: 1,
      outcome: { kind: outcome },
    });
  }

  const capacityFailure = {
    kind: "publicationLedger",
    measure: "count",
    configuredBound: 512,
    observedValue: 513,
  } as const;
  const capacity = await publishTemporalCorrelatedMessage(fakeClient([], {
    statuses: [absentStatus()],
    updateError: updateFailure(
      bpmnCorrelationPublicationCapacityFailureType,
      capacityFailure,
    ),
  }), { command, taskQueue: "correlation-ingress" });
  assert.deepEqual(capacity, {
    kind: TemporalCorrelatedMessagePublishResolutionKind.Capacity,
    commandId: command.commandId,
    address,
    ingressOrdinal: null,
    failure: capacityFailure,
  });
});

test("queries after an indeterminate Update and never retries an absent lost refusal", async () => {
  const calls: unknown[] = [];
  const result = await publishTemporalCorrelatedMessage(fakeClient(calls, {
    statuses: [absentStatus(), absentStatus()],
    updateError: new Error("capacity response lost"),
  }), { command, taskQueue: "correlation-ingress" });

  assert.deepEqual(result, {
    kind: TemporalCorrelatedMessagePublishResolutionKind.InfrastructureIndeterminate,
    commandId: command.commandId,
    address,
    ingressOrdinal: null,
    phase: "resultRecovery",
    target: null,
    failure: { kind: "unconfirmed" },
  });
  assert.equal(calls.filter(isUpdateCall).length, 1);
});

test("returns retained quarantine as target-identified infrastructure without accepting the command", async () => {
  const result = await publishTemporalCorrelatedMessage(fakeClient([], {
    statuses: [absentStatus()],
    admission: {
      kind: "addressQuarantined",
      commandId: command.commandId,
      target,
    },
  }), { command, taskQueue: "correlation-ingress" });

  assert.deepEqual(result, {
    kind: TemporalCorrelatedMessagePublishResolutionKind.InfrastructureIndeterminate,
    commandId: command.commandId,
    address,
    ingressOrdinal: null,
    phase: "targetDelivery",
    target,
    failure: { kind: "targetInconsistent" },
  });
});

test("throws only the two public command-contract errors", async () => {
  await assert.rejects(
    publishTemporalCorrelatedMessage(fakeClient([], { statuses: [] }), {
      command: { ...command, commandId: "" },
      taskQueue: "correlation-ingress",
    }),
    BpmnCorrelatedMessageIngressInvalid,
  );
  await assert.rejects(
    publishTemporalCorrelatedMessage(fakeClient([], {
      statuses: [absentStatus()],
      updateError: updateFailure(
        bpmnCorrelationPublicationIdentityConflictFailureType,
      ),
    }), { command, taskQueue: "correlation-ingress" }),
    BpmnCorrelatedMessageIdentityConflict,
  );
  await assert.rejects(
    publishTemporalCorrelatedMessage(fakeClient([], {
      statuses: [{
        kind: CorrelationPublicationStatusKind.IdentityConflict,
        commandId: command.commandId,
        requestedContentSha256: correlationPublicationContentSha256(command),
      }],
    }), { command, taskQueue: "correlation-ingress" }),
    BpmnCorrelatedMessageIdentityConflict,
  );
});

function fakeClient(
  calls: unknown[],
  options: Readonly<{
    statuses: unknown[];
    admission?: unknown;
    updateError?: Error;
    afterStatusQuery?: () => void;
  }>,
): never {
  let statusIndex = 0;
  return {
    start: async (workflowType: string, startOptions: unknown) => {
      calls.push({ operation: "start", workflowType, options: startOptions });
      return {};
    },
    getHandle: (workflowId: string) => ({
      query: async (name: string) => {
        calls.push({ operation: "query", workflowId, name });
        if (name === bpmnCorrelationIngressConfigurationQueryName) {
          return {
            address,
            protocolVersion: bpmnCorrelationIngressProtocolVersion,
            configuration: productionCorrelationIngressConfiguration,
          };
        }
        assert.equal(name, bpmnCorrelationPublicationStatusQueryName);
        const result = options.statuses[Math.min(
          statusIndex,
          options.statuses.length - 1,
        )];
        statusIndex += 1;
        options.afterStatusQuery?.();
        return result;
      },
      executeUpdate: async (name: string, updateOptions: unknown) => {
        calls.push({ operation: "update", workflowId, name, options: updateOptions });
        if (options.updateError !== undefined) {
          throw options.updateError;
        }
        return options.admission ?? {
          kind: "admitted",
          commandId: command.commandId,
          contentSha256: correlationPublicationContentSha256(command),
          phase: CorrelationPublicationLedgerPhase.Queued,
          ordinal: null,
        };
      },
    }),
  } as never;
}

function absentStatus() {
  return {
    kind: CorrelationPublicationStatusKind.Absent,
    commandId: command.commandId,
    contentSha256: correlationPublicationContentSha256(command),
  };
}

function inFlightStatus(selectedTarget: typeof target) {
  return acceptedStatus({
    phase: CorrelationPublicationLedgerPhase.InFlight,
    ordinal: 1,
    target: selectedTarget,
    resolution: null,
  });
}

function settledStatus(
  resolution: Readonly<Record<string, unknown>>,
) {
  return acceptedStatus({
    phase: CorrelationPublicationLedgerPhase.Settled,
    ordinal: 1,
    target: "outcome" in resolution &&
        (resolution.outcome as Readonly<Record<string, unknown>>).kind ===
          CorrelationPublicationSemanticOutcomeKind.Committed
      ? target
      : resolution.kind === CorrelationPublicationStoredResolutionKind.TargetInconsistent
      ? target
      : null,
    resolution,
  });
}

function acceptedStatus(fields: Readonly<Record<string, unknown>>) {
  return {
    kind: CorrelationPublicationStatusKind.Accepted,
    record: {
      commandId: command.commandId,
      contentSha256: correlationPublicationContentSha256(command),
      ...fields,
    },
  };
}

function updateFailure(type: string, detail?: unknown): WorkflowUpdateFailedError {
  return new WorkflowUpdateFailedError(
    type,
    new ApplicationFailure(
      type,
      type,
      true,
      detail === undefined ? undefined : [detail],
    ),
  );
}

function isUpdateCall(value: unknown): value is Readonly<{ operation: "update" }> {
  return typeof value === "object" && value !== null &&
    (value as Readonly<{ operation?: unknown }>).operation === "update";
}
